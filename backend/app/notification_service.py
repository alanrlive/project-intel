"""
Notification / daily briefing logic.

Scans the database and creates Notification rows for:
  - Overdue actions (due_date < today, status != done/blocked)
  - Actions due today
  - Actions due within 7 days
  - Deadlines in the next 7 days (and overdue)
  - New scope items added in the last 24 hours
  - Open risks with high impact

Call generate_daily_briefing(db) to run on-demand or from the scheduler.
"""

import logging
from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from app.models import Action, Deadline, Notification, Risk, ScopeItem

logger = logging.getLogger(__name__)

DONE_STATUSES = {"done", "mitigated", "accepted", "closed"}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _add(db: Session, type_: str, message: str, severity: str,
         related_id: int | None = None, related_type: str | None = None):
    db.add(Notification(
        type=type_,
        message=message,
        severity=severity,
        related_id=related_id,
        related_type=related_type,
        read=False,
    ))


# ── Core briefing logic ───────────────────────────────────────────────────────

def generate_daily_briefing(db: Session) -> dict:
    """
    Scan DB and create fresh Notification rows.
    Clears unread notifications of the same type first so we don't double-up.
    Returns a summary of what was created.
    """
    today = date.today()
    week_out = today + timedelta(days=7)
    yesterday = datetime.utcnow() - timedelta(hours=24)

    counts: dict[str, int] = {
        "overdue_actions": 0,
        "due_today": 0,
        "due_this_week": 0,
        "overdue_deadlines": 0,
        "upcoming_deadlines": 0,
        "new_scope_items": 0,
        "high_risks": 0,
    }

    # Clear existing unread notifications so refresh doesn't stack
    db.query(Notification).filter(Notification.read == False).delete()  # noqa: E712
    db.flush()

    # ── Actions ───────────────────────────────────────────────────
    open_actions = (
        db.query(Action)
        .filter(Action.status.notin_(["done", "blocked"]))
        .filter(Action.due_date.isnot(None))
        .all()
    )

    for action in open_actions:
        if action.due_date < today:
            days_ago = (today - action.due_date).days
            owner_str = f" (owner: {action.owner})" if action.owner else ""
            _add(db, "action",
                 f"OVERDUE by {days_ago}d: {action.description}{owner_str}",
                 "urgent", action.id, "action")
            counts["overdue_actions"] += 1

        elif action.due_date == today:
            owner_str = f" (owner: {action.owner})" if action.owner else ""
            _add(db, "action",
                 f"Due TODAY: {action.description}{owner_str}",
                 "urgent", action.id, "action")
            counts["due_today"] += 1

        elif today < action.due_date <= week_out:
            days_left = (action.due_date - today).days
            owner_str = f" (owner: {action.owner})" if action.owner else ""
            _add(db, "action",
                 f"Due in {days_left}d ({action.due_date}): {action.description}{owner_str}",
                 "warning", action.id, "action")
            counts["due_this_week"] += 1

    # ── Deadlines ─────────────────────────────────────────────────
    open_deadlines = (
        db.query(Deadline)
        .filter(Deadline.met == False)  # noqa: E712
        .all()
    )

    for dl in open_deadlines:
        if dl.deadline_date < today:
            days_ago = (today - dl.deadline_date).days
            _add(db, "deadline",
                 f"MISSED deadline ({days_ago}d ago): {dl.description}",
                 "urgent", dl.id, "deadline")
            counts["overdue_deadlines"] += 1

        elif today <= dl.deadline_date <= week_out:
            days_left = (dl.deadline_date - today).days
            label = "today" if days_left == 0 else f"in {days_left}d ({dl.deadline_date})"
            _add(db, "deadline",
                 f"Deadline {label}: {dl.description}",
                 "urgent" if days_left <= 1 else "warning",
                 dl.id, "deadline")
            counts["upcoming_deadlines"] += 1

    # ── New scope items (last 24h) ────────────────────────────────
    new_scope = (
        db.query(ScopeItem)
        .filter(ScopeItem.added_date >= yesterday)
        .all()
    )
    for item in new_scope:
        approved = "approved" if item.approved else "PENDING APPROVAL"
        _add(db, "scope_change",
             f"New scope item ({approved}): {item.description}",
             "warning" if not item.approved else "info",
             item.id, "scope_item")
        counts["new_scope_items"] += 1

    # ── High-impact open risks ────────────────────────────────────
    high_risks = (
        db.query(Risk)
        .filter(Risk.status == "open")
        .filter(Risk.impact == "high")
        .all()
    )
    for risk in high_risks:
        likelihood_str = f", likelihood: {risk.likelihood}" if risk.likelihood else ""
        _add(db, "risk",
             f"High-impact risk{likelihood_str}: {risk.description}",
             "warning", risk.id, "risk")
        counts["high_risks"] += 1

    db.commit()

    total = sum(counts.values())
    logger.info("Daily briefing generated: %d notifications", total)

    return {
        "generated_at": datetime.utcnow().isoformat(),
        "total_notifications": total,
        "counts": counts,
    }
