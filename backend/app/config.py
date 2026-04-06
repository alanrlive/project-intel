import json
from pathlib import Path
from functools import lru_cache
from pydantic_settings import BaseSettings


BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
UPLOADS_DIR = DATA_DIR / "uploads"
CONFIG_DIR = BASE_DIR / "config"
APP_CONFIG_FILE = CONFIG_DIR / "settings.json"


def read_app_config() -> dict:
    """Read the mutable app config (intake folder path, etc.) from JSON file."""
    if APP_CONFIG_FILE.exists():
        try:
            return json.loads(APP_CONFIG_FILE.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return {}
    return {}


def write_app_config(data: dict) -> None:
    """Persist the mutable app config to JSON file."""
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    APP_CONFIG_FILE.write_text(
        json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8"
    )


class Settings(BaseSettings):
    project_name: str = "My Project"
    database_url: str = f"sqlite:///{DATA_DIR}/project.db"
    ollama_base_url: str = "http://localhost:11434"

    # Default model assignments — overridden at runtime by settings.json values.
    # Prefix llm_ to avoid pydantic's protected model_ namespace.
    llm_extraction: str = "mistral-nemo:latest"
    llm_qa: str = "llama3.1:latest"
    llm_reasoning: str = "deepseek-r1:latest"

    # Notification schedule (cron expression, default 9am daily)
    briefing_hour: int = 9
    briefing_minute: int = 0

    class Config:
        env_file = BASE_DIR / ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


# ── Dynamic model assignments ─────────────────────────────────────────────────
# Stored in settings.json so they can be changed at runtime without restart.
#
# Schema (v2):
#   {"extraction": {"model": str, "context": int},
#    "qa":         {"model": str, "context": int},
#    "reasoning":  {"model": str, "context": int}}
#
# Backward compat: old entries stored as plain strings are migrated on read.

_DEFAULT_CONTEXTS = {"extraction": 8192, "qa": 8192, "reasoning": 16384}


def _normalise_assignment(value, role: str) -> dict:
    """Coerce a stored value (str or dict) into {"model": str, "context": int}."""
    if isinstance(value, dict):
        return {
            "model":   str(value.get("model", "")),
            "context": int(value.get("context", _DEFAULT_CONTEXTS[role])),
        }
    # Legacy flat-string format
    return {"model": str(value), "context": _DEFAULT_CONTEXTS[role]}


def get_model_assignments() -> dict:
    """
    Return current model role assignments with context lengths.
    Reads from settings.json; falls back to Settings class defaults.
    Returns: {"extraction": {"model": str, "context": int}, "qa": ..., "reasoning": ...}
    """
    cfg = read_app_config()
    stored: dict = cfg.get("model_assignments", {})
    defaults = get_settings()
    fallbacks = {
        "extraction": defaults.llm_extraction,
        "qa":         defaults.llm_qa,
        "reasoning":  defaults.llm_reasoning,
    }
    result = {}
    for role, default_model in fallbacks.items():
        if role in stored and stored[role]:
            result[role] = _normalise_assignment(stored[role], role)
        else:
            result[role] = {"model": default_model, "context": _DEFAULT_CONTEXTS[role]}
    return result


def write_model_assignments(assignments: dict) -> None:
    """
    Persist model role assignments to settings.json.
    Expects: {"extraction": {"model": str, "context": int}, "qa": ..., "reasoning": ...}
    """
    cfg = read_app_config()
    cfg["model_assignments"] = {
        role: {"model": assignments[role]["model"], "context": int(assignments[role]["context"])}
        for role in ("extraction", "qa", "reasoning")
    }
    write_app_config(cfg)
