import json
import logging
from typing import Literal

import httpx

from app.config import get_model_assignments, get_settings

logger = logging.getLogger(__name__)


class OllamaUnavailableError(Exception):
    """Raised when Ollama is not reachable."""


class OllamaService:
    def __init__(self):
        self.base_url = get_settings().ollama_base_url

    # ── Core generate ────────────────────────────────────────────────────────

    async def generate(
        self,
        model: str,
        prompt: str,
        format: Literal["json", "text"] = "text",
        temperature: float = 0.7,
        num_ctx: int | None = None,
        system: str | None = None,
        timeout: float = 120.0,
    ) -> str:
        """
        Call Ollama /api/generate. Returns the response string.
        Raises OllamaUnavailableError if Ollama isn't running.
        num_ctx sets the context window size; system sets the system prompt.
        timeout is the HTTP request timeout in seconds.
        """
        options: dict = {"temperature": temperature}
        if num_ctx is not None:
            options["num_ctx"] = num_ctx

        payload: dict = {
            "model":   model,
            "prompt":  prompt,
            "stream":  False,
            "options": options,
        }
        if format == "json":
            payload["format"] = "json"
        if system:
            payload["system"] = system

        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
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
                f"Ollama timed out after {timeout}s while generating with model '{model}'."
            )

    # ── Model resolution ─────────────────────────────────────────────────────

    async def _resolve_model(self, preferred: str, role: str) -> str:
        """
        Resolve a model name against what Ollama has installed.
        Accepts exact name or prefix match (e.g. "mistral-nemo" → "mistral-nemo:latest").
        Falls back to any available model if preferred is not found.
        Raises OllamaUnavailableError if nothing is available.
        """
        available = await self.list_model_names()

        # Exact match
        if preferred in available:
            return preferred

        # Prefix match (handles "mistral-nemo" vs "mistral-nemo:latest")
        for name in available:
            if name.startswith(preferred) or preferred.startswith(name.split(":")[0]):
                logger.info(
                    "Model '%s' matched as '%s' for role '%s'", preferred, name, role
                )
                return name

        # Fallback to first available model
        if available:
            logger.warning(
                "Configured model '%s' not found for role '%s'. "
                "Falling back to '%s'",
                preferred, role, available[0],
            )
            return available[0]

        raise OllamaUnavailableError(
            f"No models available in Ollama. "
            f"Pull at least one model: `ollama pull {preferred}`"
        )

    # ── Convenience wrappers ─────────────────────────────────────────────────

    async def extract(self, prompt: str) -> dict:
        """
        Structured extraction — uses the configured extraction model, context length,
        and system prompt. Assignments are read from settings.json at call time.
        Returns parsed dict (raises ValueError on bad JSON).
        """
        assignments = get_model_assignments()
        role_cfg = assignments["extraction"]
        model = await self._resolve_model(role_cfg["model"], "extraction")
        raw = await self.generate(
            model=model,
            prompt=prompt,
            format="json",
            temperature=0.3,
            num_ctx=role_cfg["context"],
            system=role_cfg["system_prompt"] or None,
            timeout=float(role_cfg.get("timeout", 120)),
        )
        try:
            return json.loads(raw)
        except json.JSONDecodeError as exc:
            logger.error("LLM returned invalid JSON: %s", raw[:500])
            raise ValueError(f"LLM returned malformed JSON: {exc}") from exc

    async def general(self, prompt: str) -> str:
        """General Q&A — uses the configured general model, context length, and system prompt."""
        assignments = get_model_assignments()
        role_cfg = assignments["general"]
        model = await self._resolve_model(role_cfg["model"], "general")
        return await self.generate(
            model=model,
            prompt=prompt,
            format="text",
            temperature=0.7,
            num_ctx=role_cfg["context"],
            system=role_cfg["system_prompt"] or None,
            timeout=float(role_cfg.get("timeout", 180)),
        )

    async def reason(self, prompt: str) -> str:
        """Deep reasoning — uses the configured reasoning model, context length, and system prompt."""
        assignments = get_model_assignments()
        role_cfg = assignments["reasoning"]
        model = await self._resolve_model(role_cfg["model"], "reasoning")
        return await self.generate(
            model=model,
            prompt=prompt,
            format="text",
            temperature=0.5,
            num_ctx=role_cfg["context"],
            system=role_cfg["system_prompt"] or None,
            timeout=float(role_cfg.get("timeout", 300)),
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

    async def validate_assignments(self) -> None:
        """
        Check that each configured model is available in Ollama.
        Logs warnings for missing models — never raises (don't crash on startup).
        """
        healthy = await self.check_health()
        if not healthy:
            logger.warning("Ollama not reachable at %s — skipping model validation", self.base_url)
            return

        available = await self.list_model_names()
        assignments = get_model_assignments()

        for role, cfg in assignments.items():
            model = cfg["model"]
            installed = (
                model in available or
                any(n.startswith(model) or model.startswith(n.split(":")[0]) for n in available)
            )
            if not installed:
                logger.warning(
                    "Role '%s' configured model '%s' is not installed in Ollama. "
                    "Run: ollama pull %s",
                    role, model, model,
                )
            else:
                logger.info("Role '%s' → model '%s' [OK]", role, model)

    async def status_report(self) -> dict:
        """
        Full status dict used by the /llm/status endpoint.
        Checks health, lists models, and flags which configured models are ready.
        Model assignments are read dynamically from settings.json.
        """
        assignments = get_model_assignments()
        healthy = await self.check_health()

        if not healthy:
            return {
                "ollama_running": False,
                "ollama_url": self.base_url,
                "models_available": [],
                "configured_models": assignments,
                "models_ready": {role: False for role in assignments},
                "warning": (
                    f"Ollama is not running at {self.base_url}. "
                    "Start it with: `ollama serve`"
                ),
            }

        models = await self.list_models()
        names = [m["name"] for m in models]

        def is_ready(model_name: str) -> bool:
            if model_name in names:
                return True
            return any(
                n.startswith(model_name) or model_name.startswith(n.split(":")[0])
                for n in names
            )

        missing = [cfg["model"] for cfg in assignments.values() if not is_ready(cfg["model"])]

        return {
            "ollama_running": True,
            "ollama_url": self.base_url,
            "models_available": names,
            "configured_models": assignments,
            "models_ready": {role: is_ready(cfg["model"]) for role, cfg in assignments.items()},
            "missing_models": missing,
            "pull_commands": [f"ollama pull {m}" for m in missing],
        }


# Singleton — import this in routers
ollama = OllamaService()
