from pathlib import Path
from functools import lru_cache
from pydantic_settings import BaseSettings


BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
UPLOADS_DIR = DATA_DIR / "uploads"


class Settings(BaseSettings):
    project_name: str = "My Project"
    database_url: str = f"sqlite:///{DATA_DIR}/project.db"
    ollama_base_url: str = "http://localhost:11434"

    # Model assignments (prefix llm_ to avoid pydantic's protected model_ namespace)
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
