"""
APScheduler wrapper.
Manages two recurring jobs:
  - daily_briefing: generates project notifications at the configured time
  - backup_job:     creates a zip backup at the configured time (if enabled)
Started and stopped via FastAPI lifespan in main.py.
"""

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.config import get_settings, read_backup_config

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


# ── Jobs ──────────────────────────────────────────────────────────────────────

def _briefing_job():
    from app.database import SessionLocal
    from app.notification_service import generate_daily_briefing

    db = SessionLocal()
    try:
        result = generate_daily_briefing(db)
        logger.info("Scheduled briefing complete: %s", result)
    except Exception:
        logger.exception("Scheduled briefing failed")
    finally:
        db.close()


def _run_scheduled_backup():
    """Blocking backup job called by APScheduler. Never raises."""
    try:
        from app import backup_service
        cfg          = read_backup_config()
        destinations = [d["path"] for d in cfg.get("destinations", [])]
        result       = backup_service.create_backup(destinations)
        logger.info(
            "Scheduled backup complete: %s written to %s",
            result["filename"],
            result["destinations_written"],
        )
    except Exception:
        logger.exception("Scheduled backup failed")


# ── Scheduler lifecycle ───────────────────────────────────────────────────────

def start_scheduler():
    settings = get_settings()

    # Daily briefing job
    scheduler.add_job(
        _briefing_job,
        trigger=CronTrigger(
            hour=settings.briefing_hour,
            minute=settings.briefing_minute,
        ),
        id="daily_briefing",
        replace_existing=True,
        misfire_grace_time=300,
    )
    logger.info(
        "Scheduler started — daily briefing at %02d:%02d",
        settings.briefing_hour,
        settings.briefing_minute,
    )

    # Backup job — only registered if both backup.enabled and backup.schedule.enabled are True
    cfg = read_backup_config()
    if cfg.get("enabled") and cfg.get("schedule", {}).get("enabled"):
        sched = cfg["schedule"]
        scheduler.add_job(
            _run_scheduled_backup,
            trigger=CronTrigger(hour=sched["hour"], minute=sched["minute"]),
            id="backup_job",
            replace_existing=True,
            misfire_grace_time=300,
        )
        logger.info(
            "Backup job scheduled at %02d:%02d",
            sched["hour"],
            sched["minute"],
        )

    scheduler.start()


def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped")


def reschedule_backup_job() -> None:
    """
    Re-read backup config and update the live scheduler.
    Called by the backup router when the user saves new settings.
    Removes any existing backup_job, then re-adds it only if both
    backup.enabled and backup.schedule.enabled are True.
    """
    try:
        scheduler.remove_job("backup_job")
    except Exception:
        pass  # job didn't exist — fine

    cfg = read_backup_config()
    if cfg.get("enabled") and cfg.get("schedule", {}).get("enabled"):
        sched = cfg["schedule"]
        scheduler.add_job(
            _run_scheduled_backup,
            trigger=CronTrigger(hour=sched["hour"], minute=sched["minute"]),
            id="backup_job",
            replace_existing=True,
            misfire_grace_time=300,
        )
        logger.info(
            "Backup job rescheduled at %02d:%02d",
            sched["hour"],
            sched["minute"],
        )
    else:
        logger.info("Backup job disabled — not scheduled")
