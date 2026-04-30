import logging
import os
import shutil
import socket
import tempfile
import zipfile
from datetime import datetime
from pathlib import Path

from fastapi import HTTPException

from app.config import APP_CONFIG_FILE, BASE_DIR, DATA_DIR

logger = logging.getLogger(__name__)

_PROJECT_ROOT = BASE_DIR.parent  # parent of backend/
_ZIP_PREFIX   = "project_intel_backup_"
_ZIP_GLOB     = f"{_ZIP_PREFIX}*.zip"

# Source paths that are included in every backup
_BACKUP_SOURCES: list[Path] = [
    DATA_DIR / "project.db",
    DATA_DIR / "chroma",
    DATA_DIR / "uploads",
    APP_CONFIG_FILE,
]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _backup_filename() -> str:
    return f"{_ZIP_PREFIX}{datetime.now().strftime('%Y-%m-%d_%H-%M')}.zip"


def _to_arcname(p: Path) -> str:
    """Convert an absolute path to its zip-relative name (forward slashes)."""
    return str(p.relative_to(_PROJECT_ROOT)).replace(os.sep, "/")


def _is_valid_dest(path: str) -> bool:
    return bool(path and Path(path).is_dir())


def _add_to_zip(p: Path, zf: zipfile.ZipFile) -> None:
    """Add a file or every file in a directory tree to an open ZipFile."""
    if p.is_file():
        zf.write(p, _to_arcname(p))
    elif p.is_dir():
        for child in p.rglob("*"):
            if child.is_file():
                zf.write(child, _to_arcname(child))


def _mb(size_bytes: int) -> float:
    return round(size_bytes / (1024 * 1024), 2)


# ── Public API ────────────────────────────────────────────────────────────────

def create_backup(destinations: list[str]) -> dict:
    """
    Build a timestamped zip of all project data and copy it to each valid
    destination folder.
    """
    filename  = _backup_filename()
    timestamp = datetime.now().isoformat(timespec="seconds")

    valid   = [d for d in destinations if _is_valid_dest(d)]
    skipped = [d for d in destinations if not _is_valid_dest(d)]

    # Write zip to a temp file so a failed destination copy doesn't leave a
    # partial zip in the destination folder.
    tmp_fd, tmp_name = tempfile.mkstemp(suffix=".zip")
    os.close(tmp_fd)
    tmp_path = Path(tmp_name)

    try:
        with zipfile.ZipFile(tmp_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            for src in _BACKUP_SOURCES:
                if src.exists():
                    _add_to_zip(src, zf)
        
        with zipfile.ZipFile(tmp_path, "r") as zf_check:
            for info in zf_check.infolist():
                logger.info("ZIP entry: %s size=%d", info.filename, info.file_size)

        size_bytes = tmp_path.stat().st_size
        written: list[str] = []

        for dest in valid:
            dest_file = Path(dest) / filename
            shutil.copy2(tmp_path, dest_file)
            written.append(dest)
            logger.info("Backup written to %s", dest_file)

    finally:
        tmp_path.unlink(missing_ok=True)

    return {
        "filename":              filename,
        "size_bytes":            size_bytes,
        "size_mb":               _mb(size_bytes),
        "destinations_written":  written,
        "destinations_skipped":  skipped,
        "timestamp":             timestamp,
    }


def list_backups(destinations: list[str]) -> list[dict]:
    """
    Scan each valid destination for backup zips.
    Deduplicates by filename (same file in two destinations = one entry,
    first destination wins). Returns list sorted newest-first.
    """
    seen: set[str] = set()
    results: list[dict] = []

    for dest in destinations:
        if not _is_valid_dest(dest):
            continue
        for zp in Path(dest).glob(_ZIP_GLOB):
            if zp.name in seen:
                continue
            seen.add(zp.name)

            # Parse timestamp from filename stem, e.g. "project_intel_backup_2026-04-20_14-30"
            stem   = zp.stem
            ts_raw = stem[len(_ZIP_PREFIX):]
            try:
                ts = datetime.strptime(ts_raw, "%Y-%m-%d_%H-%M").isoformat(timespec="seconds")
            except ValueError:
                ts = ""

            stat = zp.stat()
            results.append({
                "filename":    zp.name,
                "path":        str(zp),
                "size_bytes":  stat.st_size,
                "size_mb":     _mb(stat.st_size),
                "timestamp":   ts,
                "destination": dest,
            })

    results.sort(key=lambda r: r["timestamp"], reverse=True)
    return results


def delete_backup(filepath: str) -> dict:
    """Delete a backup zip by absolute path."""
    p = Path(filepath)
    if not p.exists():
        raise HTTPException(status_code=404, detail=f"Backup not found: {filepath}")
    filename = p.name
    p.unlink()
    logger.info("Backup deleted: %s", filepath)
    return {"deleted": True, "filename": filename}


def restore_backup(filepath: str, base_dir: str) -> dict:
    """
    Restore a backup zip over the live data directories.

    Always raises HTTP 400 when the backend is running (port 8000 open) — this
    is intentional. The UI surfaces the error as an instruction to the user.
    The real restore path is scripts/restore_backup.ps1, which kills uvicorn
    first and then invokes this function directly via Python (not HTTP).
    """
    # Refuse if the backend port is still bound — restore is only safe when
    # uvicorn is stopped.
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        port_open = sock.connect_ex(("localhost", 8000)) == 0
    finally:
        sock.close()

    if port_open:
        raise HTTPException(
            status_code=400,
            detail=(
                "Stop the backend before restoring. "
                f"Use scripts/restore_backup.ps1 -File {Path(filepath).name} to restore safely."
            ),
        )

    zip_path     = Path(filepath)
    project_root = Path(base_dir)

    if not zip_path.exists():
        raise HTTPException(status_code=404, detail=f"Backup file not found: {filepath}")

    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp = Path(tmp_dir)

        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(tmp)

        # Sanity check: zip must contain at least the DB or config file
        has_db  = (tmp / "backend" / "data" / "project.db").exists()
        has_cfg = (tmp / "backend" / "config" / "settings.json").exists()
        if not has_db and not has_cfg:
            raise HTTPException(
                status_code=422,
                detail="Invalid backup: zip contains neither project.db nor settings.json",
            )

        # (extracted source, restore target, is_directory)
        plan = [
            (
                tmp / "backend" / "data" / "project.db",
                project_root / "backend" / "data" / "project.db",
                False,
            ),
            (
                tmp / "backend" / "data" / "chroma",
                project_root / "backend" / "data" / "chroma",
                True,
            ),
            (
                tmp / "backend" / "data" / "uploads",
                project_root / "backend" / "data" / "uploads",
                True,
            ),
            (
                tmp / "backend" / "config" / "settings.json",
                project_root / "backend" / "config" / "settings.json",
                False,
            ),
        ]

        for src, target, is_dir in plan:
            if not src.exists():
                continue  # item was not in this backup — leave target untouched
            if is_dir:
                if target.exists():
                    shutil.rmtree(target)
                shutil.copytree(src, target)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src, target)

        logger.info("Restore complete from %s", zip_path.name)

    return {
        "restored": True,
        "filename": zip_path.name,
        "message":  "Restart the backend to apply restored data",
    }
