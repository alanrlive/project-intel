from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.llm_service import ollama, OllamaUnavailableError

router = APIRouter()


class GenerateRequest(BaseModel):
    model: str | None = None  # defaults to llm_qa if omitted
    prompt: str
    format: str = "text"  # "text" | "json"
    temperature: float = 0.7


@router.get("/llm/status", tags=["llm"])
async def llm_status():
    """
    Returns Ollama health, available models, and which configured models
    are ready to use. Safe to call at any time — never raises 500.
    """
    return await ollama.status_report()


@router.post("/llm/generate", tags=["llm"])
async def llm_generate(req: GenerateRequest):
    """
    Raw generate endpoint — useful for testing prompts during development.
    Not intended for production UI use (use /query instead).
    """
    model = req.model or ollama.settings.llm_qa
    try:
        result = await ollama.generate(
            model=model,
            prompt=req.prompt,
            format=req.format,  # type: ignore[arg-type]
            temperature=req.temperature,
        )
        return {"model": model, "response": result}
    except OllamaUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
