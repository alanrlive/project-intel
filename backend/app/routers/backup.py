from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app import backup_service
from app.config import read_backup_config, write_backup_config

router = APIRouter()

# Derived once at import time: routers/backup.py -> routers -> app -> backend -> project root
_BASE_DIR = Path(__file__).resolve().parents[3]


# ── Request models ────────────────────────────────────────────────────────────

class DestinationIn(BaseModel):
    label: str
    path: str


class ScheduleIn(BaseModel):
    enabled: bool
    hour:   int = Field(ge=0, le=23)
    minute: int = Field(ge=0, le=59)


class BackupConfigIn(BaseModel):
    enabled:      bool
    destinations: list[DestinationIn]
    schedule:     ScheduleIn


class FilePathBody(BaseModel):
    filepath: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/config")
def get_backup_config():
    return read_backup_config()


@router.post("/config")
def save_backup_config(body: BackupConfigIn):
    if len(body.destinations) != 2:
        raise HTTPException(status_code=422, detail="destinations must have exactly 2 entries")

    current = read_backup_config()
    config  = body.model_dump()
    write_backup_config(config)

    # Reschedule the backup job only when the schedule section changed
    if current.get("schedule") != config["schedule"] or current.get("enabled") != config["enabled"]:
        from app.scheduler import reschedule_backup_job  # lazy — avoids circular import at startup
        reschedule_backup_job()

    return config


@router.post("/create")
def trigger_backup():
    cfg          = read_backup_config()
    destinations = [d["path"] for d in cfg.get("destinations", [])]
    return backup_service.create_backup(destinations)


@router.get("/list")
def list_backups():
    cfg          = read_backup_config()
    destinations = [d["path"] for d in cfg.get("destinations", [])]
    return backup_service.list_backups(destinations)


@router.delete("/delete")
def delete_backup(body: FilePathBody):
    return backup_service.delete_backup(body.filepath)


@router.post("/restore")
def restore_backup(body: FilePathBody):
    return backup_service.restore_backup(body.filepath, str(_BASE_DIR))
