from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Notification
from app.notification_service import generate_daily_briefing

router = APIRouter()


@router.get("/notifications", tags=["notifications"])
def get_notifications(
    unread_only: bool = False,
    db: Session = Depends(get_db),
):
    """
    Return notifications, newest first.
    Pass ?unread_only=true to filter to unread only.
    """
    q = db.query(Notification).order_by(Notification.created_at.desc())
    if unread_only:
        q = q.filter(Notification.read == False)  # noqa: E712
    notifications = q.all()

    return {
        "total": len(notifications),
        "unread": sum(1 for n in notifications if not n.read),
        "notifications": [_serialize(n) for n in notifications],
    }


@router.post("/notifications/refresh", tags=["notifications"])
def refresh_briefing(db: Session = Depends(get_db)):
    """
    Trigger the daily briefing on-demand.
    Clears existing unread notifications and regenerates from current DB state.
    """
    result = generate_daily_briefing(db)
    return result


@router.patch("/notifications/{notification_id}/read", tags=["notifications"])
def mark_read(notification_id: int, db: Session = Depends(get_db)):
    """Mark a single notification as read."""
    n = db.query(Notification).filter(Notification.id == notification_id).first()
    if not n:
        raise HTTPException(status_code=404, detail="Notification not found.")
    n.read = True
    db.commit()
    return {"id": notification_id, "read": True}


@router.post("/notifications/read-all", tags=["notifications"])
def mark_all_read(db: Session = Depends(get_db)):
    """Mark all notifications as read."""
    updated = (
        db.query(Notification)
        .filter(Notification.read == False)  # noqa: E712
        .update({"read": True})
    )
    db.commit()
    return {"marked_read": updated}


@router.delete("/notifications/{notification_id}", tags=["notifications"])
def delete_notification(notification_id: int, db: Session = Depends(get_db)):
    """Delete a single notification."""
    n = db.query(Notification).filter(Notification.id == notification_id).first()
    if not n:
        raise HTTPException(status_code=404, detail="Notification not found.")
    db.delete(n)
    db.commit()
    return {"deleted": notification_id}


# ── Serializer ────────────────────────────────────────────────────────────────

def _serialize(n: Notification) -> dict:
    return {
        "id": n.id,
        "type": n.type,
        "message": n.message,
        "severity": n.severity,
        "read": n.read,
        "created_at": n.created_at.isoformat() if n.created_at else None,
        "related_id": n.related_id,
        "related_type": n.related_type,
    }
