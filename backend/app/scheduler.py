"""
APScheduler wrapper — runs generate_daily_briefing() at the configured time daily.
Started and stopped via FastAPI lifespan in main.py.
"""

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.config import get_settings

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


def _briefing_job():
    """Synchronous wrapper called by APScheduler."""
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


def start_scheduler():
    settings = get_settings()

    scheduler.add_job(
        _briefing_job,
        trigger=CronTrigger(
            hour=settings.briefing_hour,
            minute=settings.briefing_minute,
        ),
        id="daily_briefing",
        replace_existing=True,
        misfire_grace_time=300,  # Allow up to 5 min late start
    )

    scheduler.start()
    logger.info(
        "Scheduler started — daily briefing at %02d:%02d",
        settings.briefing_hour,
        settings.briefing_minute,
    )


def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped")
