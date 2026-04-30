import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(level=logging.DEBUG if os.environ.get("DEBUG_LOGGING") == "1" else logging.INFO)

from app.config import get_settings
from app.database import init_db
from app.scheduler import start_scheduler, stop_scheduler


settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    init_db()
    start_scheduler()
    from app.llm_service import ollama
    await ollama.validate_assignments()
    yield
    # Shutdown
    stop_scheduler()


app = FastAPI(
    title="Project Intel V2",
    version="0.1.0",
    lifespan=lifespan,
)

# Allow Tauri frontend origins only — explicit list, no wildcards
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:1420",   # Vite dev server (Tauri default)
        "tauri://localhost",       # Tauri production origin
        "https://tauri.localhost", # Tauri production origin (some versions)
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Content-Type"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
from app.routers import data, documents, llm, notifications, query  # noqa: E402
from app.routers import settings as settings_router                 # noqa: E402
from app.routers import backup as backup_router                     # noqa: E402

app.include_router(llm.router)
app.include_router(documents.router)
app.include_router(notifications.router)
app.include_router(query.router)
app.include_router(data.router)
app.include_router(settings_router.router)
app.include_router(backup_router.router, prefix="/backup", tags=["backup"])


# ── Health & status endpoints ─────────────────────────────────────────────────

@app.get("/health", tags=["system"])
async def health_check():
    return {
        "status": "ok",
        "project": settings.project_name,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/", tags=["system"])
async def root():
    return {
        "app": "Project Intel V2",
        "docs": "/docs",
        "health": "/health",
    }
