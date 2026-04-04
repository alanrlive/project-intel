import json
import logging
from typing import Literal

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

ModelName = Literal["mistral-nemo:latest", "llama3.1:latest", "deepseek-r1:latest"]

# Fallback order if the preferred extraction model isn't available
EXTRACTION_FALLBACK = ["mistral-nemo:latest", "llama3.1:latest", "deepseek-r1:latest"]


class OllamaUnavailableError(Exception):
    """Raised when Ollama is not reachable."""


class OllamaService:
    def __init__(self):
        self.settings = get_settings()
        self.base_url = self.settings.ollama_base_url

    # ── Core generate ────────────────────────────────────────────────────────

    async def generate(
        self,
        model: str,
        prompt: str,
        format: Literal["json", "text"] = "text",
        temperature: float = 0.7,
    ) -> str:
        """
        Call Ollama /api/generate. Returns the response string.
        Raises OllamaUnavailableError if Ollama isn't running.
        """
        payload: dict = {
            "model": model,
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": temperature},
        }
        if format == "json":
            payload["format"] = "json"

        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(
                    f"{self.base_url}/api/generate",
                    json=payload,
                )
                response.raise_for_status()
                return response.json()["response"]
        except httpx.ConnectError:
            raise OllamaUnavailableError(
                f"Cannot reach Ollama at {self.base_url}. "
                "Make sure it's running: `ollama serve`"
            )
        except httpx.TimeoutException:
            raise OllamaUnavailableError(
                f"Ollama timed out after 120s while generating with model '{model}'."
            )

    # ── Convenience wrappers ─────────────────────────────────────────────────

    async def extract(self, prompt: str) -> dict:
        """
        Structured extraction — uses mistral-nemo with JSON format.
        Falls back to llama3.1 if mistral-nemo is not installed.
        Returns parsed dict (raises ValueError on bad JSON).
        """
        available = await self.list_model_names()
        model = self.settings.llm_extraction

        if model not in available:
            for fallback in EXTRACTION_FALLBACK:
                if fallback in available:
                    logger.warning(
                        "Model %s not found, falling back to %s for extraction",
                        model,
                        fallback,
                    )
                    model = fallback
                    break
            else:
                raise OllamaUnavailableError(
                    "No suitable extraction model available. "
                    f"Pull one of: {EXTRACTION_FALLBACK}"
                )

        raw = await self.generate(model=model, prompt=prompt, format="json", temperature=0.3)

        try:
            return json.loads(raw)
        except json.JSONDecodeError as exc:
            logger.error("LLM returned invalid JSON: %s", raw[:500])
            raise ValueError(f"LLM returned malformed JSON: {exc}") from exc

    async def chat(self, prompt: str) -> str:
        """General Q&A — uses llama3.1."""
        return await self.generate(
            model=self.settings.llm_qa,
            prompt=prompt,
            format="text",
            temperature=0.7,
        )

    async def reason(self, prompt: str) -> str:
        """Deep reasoning — uses deepseek-r1."""
        return await self.generate(
            model=self.settings.llm_reasoning,
            prompt=prompt,
            format="text",
            temperature=0.5,
        )

    # ── Health & discovery ───────────────────────────────────────────────────

    async def check_health(self) -> bool:
        """Return True if Ollama is reachable."""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{self.base_url}/api/tags")
                return response.status_code == 200
        except Exception:
            return False

    async def list_models(self) -> list[dict]:
        """Return raw model objects from Ollama (name, size, modified_at, etc.)."""
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"{self.base_url}/api/tags")
            response.raise_for_status()
            return response.json().get("models", [])

    async def list_model_names(self) -> list[str]:
        """Return just the model name strings."""
        try:
            models = await self.list_models()
            return [m["name"] for m in models]
        except Exception:
            return []

    async def status_report(self) -> dict:
        """
        Full status dict used by the /llm/status endpoint.
        Checks health, lists models, and flags which configured models are ready.
        """
        healthy = await self.check_health()
        if not healthy:
            return {
                "ollama_running": False,
                "ollama_url": self.base_url,
                "models_available": [],
                "configured_models": {
                    "extraction": self.settings.llm_extraction,
                    "qa": self.settings.llm_qa,
                    "reasoning": self.settings.llm_reasoning,
                },
                "models_ready": {
                    "extraction": False,
                    "qa": False,
                    "reasoning": False,
                },
                "warning": (
                    f"Ollama is not running at {self.base_url}. "
                    "Start it with: `ollama serve`"
                ),
            }

        models = await self.list_models()
        names = [m["name"] for m in models]

        configured = {
            "extraction": self.settings.llm_extraction,
            "qa": self.settings.llm_qa,
            "reasoning": self.settings.llm_reasoning,
        }

        missing = [name for name in configured.values() if name not in names]

        return {
            "ollama_running": True,
            "ollama_url": self.base_url,
            "models_available": names,
            "configured_models": configured,
            "models_ready": {
                role: model in names for role, model in configured.items()
            },
            "missing_models": missing,
            "pull_commands": [f"ollama pull {m}" for m in missing],
        }


# Singleton — import this in routers
ollama = OllamaService()
