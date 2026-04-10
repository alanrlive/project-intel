"""
CRUD endpoints for the five structured data types:
  Actions, Risks, Deadlines, Dependencies, Scope Items
"""

from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Action, Deadline, Dependency, RaidItemHistory, Risk, ScopeItem

router = APIRouter()


def _history_dict(h: RaidItemHistory) -> dict:
    return {
        "id": h.id,
        "item_type": h.item_type,
        "item_id": h.item_id,
        "reference_id": h.reference_id,
        "description": h.description,
        "status": h.status,
        "source_document_id": h.source_document_id,
        "changed_at": h.changed_at.isoformat() if h.changed_at else None,
    }


# ══════════════════════════════════════════════════════════════════════════════
# ACTIONS
# ══════════════════════════════════════════════════════════════════════════════

class ActionCreate(BaseModel):
    description: str
    owner: str | None = None
    due_date: date | None = None
    priority: Literal["high", "medium", "low"] = "medium"
    status: Literal["open", "in_progress", "done", "blocked"] = "open"


class ActionUpdate(BaseModel):
    description: str | None = None
    owner: str | None = None
    due_date: date | None = None
    priority: Literal["high", "medium", "low"] | None = None
    status: Literal["open", "in_progress", "done", "blocked"] | None = None


def _action_dict(a: Action) -> dict:
    return {
        "id": a.id,
        "description": a.description,
        "owner": a.owner,
        "due_date": a.due_date.isoformat() if a.due_date else None,
        "status": a.status,
        "priority": a.priority,
        "reference_id": a.reference_id,
        "created_from_doc_id": a.created_from_doc_id,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }


@router.get("/actions", tags=["actions"])
def list_actions(
    status: str | None = None,
    priority: str | None = None,
    db: Session = Depends(get_db),
):
    """List actions. Filter by ?status=open and/or ?priority=high."""
    q = db.query(Action)
    if status:
        q = q.filter(Action.status == status)
    if priority:
        q = q.filter(Action.priority == priority)
    actions = q.order_by(Action.due_date.asc().nullslast(), Action.priority).all()
    return [_action_dict(a) for a in actions]


@router.post("/actions", tags=["actions"], status_code=201)
def create_action(body: ActionCreate, db: Session = Depends(get_db)):
    action = Action(**body.model_dump())
    db.add(action)
    db.commit()
    db.refresh(action)
    return _action_dict(action)


@router.patch("/actions/{action_id}", tags=["actions"])
def update_action(action_id: int, body: ActionUpdate, db: Session = Depends(get_db)):
    action = db.query(Action).filter(Action.id == action_id).first()
    if not action:
        raise HTTPException(status_code=404, detail="Action not found.")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(action, field, value)
    db.commit()
    db.refresh(action)
    return _action_dict(action)


@router.delete("/actions/{action_id}", tags=["actions"])
def delete_action(action_id: int, db: Session = Depends(get_db)):
    action = db.query(Action).filter(Action.id == action_id).first()
    if not action:
        raise HTTPException(status_code=404, detail="Action not found.")
    db.delete(action)
    db.commit()
    return {"deleted": action_id}


@router.get("/actions/{action_id}/history", tags=["actions"])
def get_action_history(action_id: int, db: Session = Depends(get_db)):
    if not db.query(Action).filter(Action.id == action_id).first():
        raise HTTPException(status_code=404, detail="Action not found.")
    rows = (
        db.query(RaidItemHistory)
        .filter(RaidItemHistory.item_type == "action", RaidItemHistory.item_id == action_id)
        .order_by(RaidItemHistory.changed_at.desc())
        .all()
    )
    return [_history_dict(h) for h in rows]


# ══════════════════════════════════════════════════════════════════════════════
# RISKS
# ══════════════════════════════════════════════════════════════════════════════

class RiskCreate(BaseModel):
    description: str
    impact: Literal["high", "medium", "low"] = "medium"
    likelihood: Literal["high", "medium", "low"] = "medium"
    mitigation: str | None = None
    status: Literal["open", "mitigated", "accepted", "closed"] = "open"


class RiskUpdate(BaseModel):
    description: str | None = None
    impact: Literal["high", "medium", "low"] | None = None
    likelihood: Literal["high", "medium", "low"] | None = None
    mitigation: str | None = None
    status: Literal["open", "mitigated", "accepted", "closed"] | None = None


def _risk_dict(r: Risk) -> dict:
    return {
        "id": r.id,
        "description": r.description,
        "impact": r.impact,
        "likelihood": r.likelihood,
        "mitigation": r.mitigation,
        "status": r.status,
        "reference_id": r.reference_id,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


@router.get("/risks", tags=["risks"])
def list_risks(status: str | None = None, db: Session = Depends(get_db)):
    q = db.query(Risk)
    if status:
        q = q.filter(Risk.status == status)
    risks = q.order_by(Risk.impact, Risk.likelihood).all()
    return [_risk_dict(r) for r in risks]


@router.post("/risks", tags=["risks"], status_code=201)
def create_risk(body: RiskCreate, db: Session = Depends(get_db)):
    risk = Risk(**body.model_dump())
    db.add(risk)
    db.commit()
    db.refresh(risk)
    return _risk_dict(risk)


@router.patch("/risks/{risk_id}", tags=["risks"])
def update_risk(risk_id: int, body: RiskUpdate, db: Session = Depends(get_db)):
    risk = db.query(Risk).filter(Risk.id == risk_id).first()
    if not risk:
        raise HTTPException(status_code=404, detail="Risk not found.")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(risk, field, value)
    db.commit()
    db.refresh(risk)
    return _risk_dict(risk)


@router.delete("/risks/{risk_id}", tags=["risks"])
def delete_risk(risk_id: int, db: Session = Depends(get_db)):
    risk = db.query(Risk).filter(Risk.id == risk_id).first()
    if not risk:
        raise HTTPException(status_code=404, detail="Risk not found.")
    db.delete(risk)
    db.commit()
    return {"deleted": risk_id}


@router.get("/risks/{risk_id}/history", tags=["risks"])
def get_risk_history(risk_id: int, db: Session = Depends(get_db)):
    if not db.query(Risk).filter(Risk.id == risk_id).first():
        raise HTTPException(status_code=404, detail="Risk not found.")
    rows = (
        db.query(RaidItemHistory)
        .filter(RaidItemHistory.item_type == "risk", RaidItemHistory.item_id == risk_id)
        .order_by(RaidItemHistory.changed_at.desc())
        .all()
    )
    return [_history_dict(h) for h in rows]


# ══════════════════════════════════════════════════════════════════════════════
# DEADLINES
# ══════════════════════════════════════════════════════════════════════════════

class DeadlineCreate(BaseModel):
    description: str
    deadline_date: date
    met: bool = False


class DeadlineUpdate(BaseModel):
    description: str | None = None
    deadline_date: date | None = None
    met: bool | None = None


def _deadline_dict(d: Deadline) -> dict:
    return {
        "id": d.id,
        "description": d.description,
        "deadline_date": d.deadline_date.isoformat() if d.deadline_date else None,
        "met": d.met,
        "reference_id": d.reference_id,
        "source_doc_id": d.source_doc_id,
        "created_at": d.created_at.isoformat() if d.created_at else None,
    }


@router.get("/deadlines", tags=["deadlines"])
def list_deadlines(met: bool | None = None, db: Session = Depends(get_db)):
    q = db.query(Deadline)
    if met is not None:
        q = q.filter(Deadline.met == met)
    deadlines = q.order_by(Deadline.deadline_date).all()
    return [_deadline_dict(d) for d in deadlines]


@router.post("/deadlines", tags=["deadlines"], status_code=201)
def create_deadline(body: DeadlineCreate, db: Session = Depends(get_db)):
    deadline = Deadline(**body.model_dump())
    db.add(deadline)
    db.commit()
    db.refresh(deadline)
    return _deadline_dict(deadline)


@router.patch("/deadlines/{deadline_id}", tags=["deadlines"])
def update_deadline(deadline_id: int, body: DeadlineUpdate, db: Session = Depends(get_db)):
    deadline = db.query(Deadline).filter(Deadline.id == deadline_id).first()
    if not deadline:
        raise HTTPException(status_code=404, detail="Deadline not found.")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(deadline, field, value)
    db.commit()
    db.refresh(deadline)
    return _deadline_dict(deadline)


@router.delete("/deadlines/{deadline_id}", tags=["deadlines"])
def delete_deadline(deadline_id: int, db: Session = Depends(get_db)):
    deadline = db.query(Deadline).filter(Deadline.id == deadline_id).first()
    if not deadline:
        raise HTTPException(status_code=404, detail="Deadline not found.")
    db.delete(deadline)
    db.commit()
    return {"deleted": deadline_id}


@router.get("/deadlines/{deadline_id}/history", tags=["deadlines"])
def get_deadline_history(deadline_id: int, db: Session = Depends(get_db)):
    if not db.query(Deadline).filter(Deadline.id == deadline_id).first():
        raise HTTPException(status_code=404, detail="Deadline not found.")
    rows = (
        db.query(RaidItemHistory)
        .filter(RaidItemHistory.item_type == "deadline", RaidItemHistory.item_id == deadline_id)
        .order_by(RaidItemHistory.changed_at.desc())
        .all()
    )
    return [_history_dict(h) for h in rows]


# ══════════════════════════════════════════════════════════════════════════════
# DEPENDENCIES
# ══════════════════════════════════════════════════════════════════════════════

class DependencyCreate(BaseModel):
    task_a: str
    task_b: str
    dependency_type: Literal["blocks", "enables", "relates_to"] = "relates_to"
    notes: str | None = None


class DependencyUpdate(BaseModel):
    notes: str | None = None
    dependency_type: Literal["blocks", "enables", "relates_to"] | None = None


def _dep_dict(d: Dependency) -> dict:
    return {
        "id": d.id,
        "task_a": d.task_a,
        "task_b": d.task_b,
        "dependency_type": d.dependency_type,
        "notes": d.notes,
        "reference_id": d.reference_id,
        "created_at": d.created_at.isoformat() if d.created_at else None,
    }


@router.get("/dependencies", tags=["dependencies"])
def list_dependencies(db: Session = Depends(get_db)):
    deps = db.query(Dependency).order_by(Dependency.created_at).all()
    return [_dep_dict(d) for d in deps]


@router.post("/dependencies", tags=["dependencies"], status_code=201)
def create_dependency(body: DependencyCreate, db: Session = Depends(get_db)):
    dep = Dependency(**body.model_dump())
    db.add(dep)
    db.commit()
    db.refresh(dep)
    return _dep_dict(dep)


@router.patch("/dependencies/{dep_id}", tags=["dependencies"])
def update_dependency(dep_id: int, body: DependencyUpdate, db: Session = Depends(get_db)):
    dep = db.query(Dependency).filter(Dependency.id == dep_id).first()
    if not dep:
        raise HTTPException(status_code=404, detail="Dependency not found.")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(dep, field, value)
    db.commit()
    db.refresh(dep)
    return _dep_dict(dep)


@router.delete("/dependencies/{dep_id}", tags=["dependencies"])
def delete_dependency(dep_id: int, db: Session = Depends(get_db)):
    dep = db.query(Dependency).filter(Dependency.id == dep_id).first()
    if not dep:
        raise HTTPException(status_code=404, detail="Dependency not found.")
    db.delete(dep)
    db.commit()
    return {"deleted": dep_id}


@router.get("/dependencies/{dep_id}/history", tags=["dependencies"])
def get_dependency_history(dep_id: int, db: Session = Depends(get_db)):
    if not db.query(Dependency).filter(Dependency.id == dep_id).first():
        raise HTTPException(status_code=404, detail="Dependency not found.")
    rows = (
        db.query(RaidItemHistory)
        .filter(RaidItemHistory.item_type == "dependency", RaidItemHistory.item_id == dep_id)
        .order_by(RaidItemHistory.changed_at.desc())
        .all()
    )
    return [_history_dict(h) for h in rows]


# ══════════════════════════════════════════════════════════════════════════════
# SCOPE ITEMS
# ══════════════════════════════════════════════════════════════════════════════

class ScopeItemCreate(BaseModel):
    description: str
    source: Literal["original_plan", "change_request", "meeting"] = "meeting"
    approved: bool = False
    impact_assessment: str | None = None


class ScopeItemUpdate(BaseModel):
    description: str | None = None
    source: Literal["original_plan", "change_request", "meeting"] | None = None
    approved: bool | None = None
    impact_assessment: str | None = None


def _scope_dict(s: ScopeItem) -> dict:
    return {
        "id": s.id,
        "description": s.description,
        "source": s.source,
        "approved": s.approved,
        "impact_assessment": s.impact_assessment,
        "reference_id": s.reference_id,
        "added_date": s.added_date.isoformat() if s.added_date else None,
    }


@router.get("/scope-items", tags=["scope"])
def list_scope_items(approved: bool | None = None, db: Session = Depends(get_db)):
    q = db.query(ScopeItem)
    if approved is not None:
        q = q.filter(ScopeItem.approved == approved)
    items = q.order_by(ScopeItem.added_date.desc()).all()
    return [_scope_dict(s) for s in items]


@router.post("/scope-items", tags=["scope"], status_code=201)
def create_scope_item(body: ScopeItemCreate, db: Session = Depends(get_db)):
    item = ScopeItem(**body.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return _scope_dict(item)


@router.patch("/scope-items/{item_id}", tags=["scope"])
def update_scope_item(item_id: int, body: ScopeItemUpdate, db: Session = Depends(get_db)):
    item = db.query(ScopeItem).filter(ScopeItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Scope item not found.")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return _scope_dict(item)


@router.delete("/scope-items/{item_id}", tags=["scope"])
def delete_scope_item(item_id: int, db: Session = Depends(get_db)):
    item = db.query(ScopeItem).filter(ScopeItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Scope item not found.")
    db.delete(item)
    db.commit()
    return {"deleted": item_id}


@router.get("/scope-items/{item_id}/history", tags=["scope"])
def get_scope_item_history(item_id: int, db: Session = Depends(get_db)):
    if not db.query(ScopeItem).filter(ScopeItem.id == item_id).first():
        raise HTTPException(status_code=404, detail="Scope item not found.")
    rows = (
        db.query(RaidItemHistory)
        .filter(RaidItemHistory.item_type == "scope_item", RaidItemHistory.item_id == item_id)
        .order_by(RaidItemHistory.changed_at.desc())
        .all()
    )
    return [_history_dict(h) for h in rows]
