import json
from pathlib import Path
from functools import lru_cache
from pydantic_settings import BaseSettings


BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
UPLOADS_DIR = DATA_DIR / "uploads"
LOGS_DIR = BASE_DIR / "logs"
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

    # Notification schedule (cron expression, default 9am daily)
    briefing_hour: int = 9
    briefing_minute: int = 0

    class Config:
        env_file = BASE_DIR / ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"  # ignore unknown env vars (e.g. old LLM_* entries)


@lru_cache()
def get_settings() -> Settings:
    return Settings()


# ── Dynamic model assignments ─────────────────────────────────────────────────
# Stored in settings.json so they can be changed at runtime without restart.
#
# Schema (v3):
#   {"extraction": {"model": str, "context": int, "system_prompt": str},
#    "general":    {"model": str, "context": int, "system_prompt": str},
#    "reasoning":  {"model": str, "context": int, "system_prompt": str}}
#
# Backward compat: old "qa" key migrated to "general" on read.
# Old flat-string values coerced to dict on read.

_DEFAULT_CONTEXTS: dict[str, int] = {
    "extraction": 8192,
    "general":    8192,
    "reasoning":  16384,
}

_DEFAULT_TIMEOUTS: dict[str, int] = {
    "extraction": 120,
    "general":    180,
    "reasoning":  300,
}

DEFAULT_SYSTEM_PROMPTS: dict[str, str] = {
    "extraction": (
        "You are a project data extraction specialist. "
        "Extract structured information quickly and precisely: actions, risks, deadlines, dependencies. "
        "Extract only explicit content — do not infer or invent. "
        "Return only valid JSON, no markdown, no explanation."
    ),
    "general": (
        "You are a helpful project management assistant. "
        "Answer questions clearly and concisely based on the project documents provided. "
        "If the data doesn't contain enough information to answer, say so clearly."
    ),
    "reasoning": (
        "You are a strategic project analyst. "
        "Provide deep analysis of scope, risks, dependencies, and project health. "
        "Show your reasoning process and highlight patterns or concerns the team should be aware of."
    ),
}


def _normalise_assignment(value, role: str) -> dict:
    """Coerce a stored value (str or dict) into {"model": str, "context": int, "system_prompt": str, "timeout": int}."""
    default_ctx     = _DEFAULT_CONTEXTS.get(role, 8192)
    default_prompt  = DEFAULT_SYSTEM_PROMPTS.get(role, "")
    default_timeout = _DEFAULT_TIMEOUTS.get(role, 120)
    if isinstance(value, dict):
        return {
            "model":         str(value.get("model", "")),
            "context":       int(value.get("context", default_ctx)),
            "system_prompt": str(value.get("system_prompt", default_prompt)),
            "timeout":       int(value.get("timeout", default_timeout)),
        }
    # Legacy flat-string format
    return {"model": str(value), "context": default_ctx, "system_prompt": default_prompt, "timeout": default_timeout}


_FALLBACK_MODELS = {
    "extraction": "mistral-nemo:latest",
    "general":    "llama3.1:latest",
    "reasoning":  "deepseek-r1:latest",
}


def get_model_assignments() -> dict:
    """
    Return current model role assignments with context lengths and system prompts.
    Reads from settings.json; falls back to built-in defaults.
    Returns: {"extraction": {...}, "general": {...}, "reasoning": {...}}
    """
    cfg = read_app_config()
    stored: dict = cfg.get("model_assignments", {})

    # Backward compat: migrate old "qa" key → "general"
    if "qa" in stored and "general" not in stored:
        stored["general"] = stored["qa"]

    result = {}
    for role, default_model in _FALLBACK_MODELS.items():
        if role in stored and stored[role]:
            result[role] = _normalise_assignment(stored[role], role)
        else:
            result[role] = {
                "model":         default_model,
                "context":       _DEFAULT_CONTEXTS[role],
                "system_prompt": DEFAULT_SYSTEM_PROMPTS[role],
                "timeout":       _DEFAULT_TIMEOUTS[role],
            }
    return result


_DEFAULT_BACKUP_CONFIG: dict = {
    "enabled": False,
    "destinations": [
        {"label": "Destination 1", "path": ""},
        {"label": "Destination 2", "path": ""},
    ],
    "schedule": {
        "enabled": False,
        "hour": 2,
        "minute": 0,
    },
}


def read_backup_config() -> dict:
    """Return the backup section of settings.json, or defaults if absent."""
    return read_app_config().get("backup", _DEFAULT_BACKUP_CONFIG)


def write_backup_config(config: dict) -> None:
    """Persist the backup section to settings.json without touching other keys."""
    cfg = read_app_config()
    cfg["backup"] = config
    write_app_config(cfg)


def get_llm_logging() -> bool:
    """Return whether LLM response logging is enabled."""
    return bool(read_app_config().get("llm_logging_enabled", False))


def set_llm_logging(enabled: bool) -> None:
    """Persist the LLM logging toggle to settings.json."""
    cfg = read_app_config()
    cfg["llm_logging_enabled"] = enabled
    write_app_config(cfg)


def write_model_assignments(assignments: dict) -> None:
    """
    Persist model role assignments to settings.json.
    Expects: {"extraction": {"model": str, "context": int, "system_prompt": str}, ...}
    """
    cfg = read_app_config()
    cfg["model_assignments"] = {
        role: {
            "model":         assignments[role]["model"],
            "context":       int(assignments[role]["context"]),
            "system_prompt": str(assignments[role].get("system_prompt", DEFAULT_SYSTEM_PROMPTS.get(role, ""))),
            "timeout":       int(assignments[role].get("timeout", _DEFAULT_TIMEOUTS.get(role, 120))),
        }
        for role in ("extraction", "general", "reasoning")
    }
    write_app_config(cfg)
