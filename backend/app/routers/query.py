"""
Q&A chat endpoint.

Strategy:
  - Simple keyword queries (what's due, list risks, etc.) → answered directly
    from DB data formatted as text, no LLM needed — fast and deterministic.
  - Complex / open-ended queries → retrieve relevant context from DB,
    send to LLM with a grounded prompt, return answer + citations.
"""

import logging
from datetime import date, timedelta
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.llm_service import OllamaUnavailableError, ollama
from app.models import Action, Deadline, Dependency, Document, Risk, ScopeItem
from app.vector_service import VectorService

logger = logging.getLogger(__name__)

router = APIRouter()

# ── Request / response models ─────────────────────────────────────────────────

class QueryRequest(BaseModel):
    question: str
    use_deep_reasoning: bool = False  # Force deepseek-r1 for this question


class Citation(BaseModel):
    type: str
    id: int
    summary: str


class QueryResponse(BaseModel):
    question: str
    answer: str
    model_used: str
    citations: list[Citation]
    answered_directly: bool  # True = DB query, no LLM; False = LLM response


# ── Direct DB answerers ───────────────────────────────────────────────────────

def _direct_answer(question: str, db: Session) -> QueryResponse | None:
    """
    Try to answer common structured queries directly from the DB.
    Returns None if the question needs LLM reasoning.
    """
    q = question.lower().strip()

    # "what's due this week" / "what actions are due"
    if any(kw in q for kw in ["due this week", "due soon", "coming up", "what's due", "whats due"]):
        today = date.today()
        week_out = today + timedelta(days=7)
        actions = (
            db.query(Action)
            .filter(Action.status.notin_(["done", "blocked"]))
            .filter(Action.due_date.isnot(None))
            .filter(Action.due_date <= week_out)
            .order_by(Action.due_date)
            .all()
        )
        if not actions:
            return _direct("question", "No actions due in the next 7 days.", [], True)
        lines = ["Actions due in the next 7 days:\n"]
        citations = []
        for a in actions:
            days = (a.due_date - today).days
            label = "TODAY" if days == 0 else f"in {days}d" if days > 0 else f"{abs(days)}d OVERDUE"
            owner = f" — {a.owner}" if a.owner else ""
            lines.append(f"• [{label}] {a.description}{owner} (status: {a.status}, priority: {a.priority})")
            citations.append(Citation(type="action", id=a.id, summary=a.description[:60]))
        return _direct(question, "\n".join(lines), citations, True)

    # "what are the risks" / "list risks" / "top risks"
    # Only fire for simple list/show intents — not analytical questions like "given the risks..."
    if any(kw in q for kw in ["risk", "risks"]) and any(kw in q for kw in ["list", "show", "top", "current", "open"]) and not any(kw in q for kw in ["focus", "priorit", "should", "why", "because", "impact of", "given"]):
        risks = db.query(Risk).filter(Risk.status == "open").order_by(Risk.impact).all()
        if not risks:
            return _direct(question, "No open risks recorded.", [], True)
        lines = ["Open risks:\n"]
        citations = []
        for r in risks:
            mit = f"\n  Mitigation: {r.mitigation}" if r.mitigation else ""
            lines.append(f"• [{r.impact.upper()} impact / {r.likelihood} likelihood] {r.description}{mit}")
            citations.append(Citation(type="risk", id=r.id, summary=r.description[:60]))
        return _direct(question, "\n".join(lines), citations, True)

    # "what deadlines" / "upcoming deadlines"
    if any(kw in q for kw in ["deadline", "deadlines", "milestone", "milestones"]):
        today = date.today()
        deadlines = (
            db.query(Deadline)
            .filter(Deadline.met == False)  # noqa: E712
            .order_by(Deadline.deadline_date)
            .all()
        )
        if not deadlines:
            return _direct(question, "No upcoming deadlines.", [], True)
        lines = ["Upcoming deadlines:\n"]
        citations = []
        for d in deadlines:
            days = (d.deadline_date - today).days
            label = "TODAY" if days == 0 else f"in {days}d" if days > 0 else f"{abs(days)}d OVERDUE"
            lines.append(f"• [{label}] {d.description} ({d.deadline_date})")
            citations.append(Citation(type="deadline", id=d.id, summary=d.description[:60]))
        return _direct(question, "\n".join(lines), citations, True)

    # "what dependencies" / "what's blocking"
    if any(kw in q for kw in ["block", "blocking", "depend", "dependencies"]):
        deps = db.query(Dependency).all()
        if not deps:
            return _direct(question, "No dependencies recorded.", [], True)
        lines = ["Recorded dependencies:\n"]
        citations = []
        for dep in deps:
            lines.append(f"• {dep.task_a}  →[{dep.dependency_type}]→  {dep.task_b}")
            citations.append(Citation(type="dependency", id=dep.id, summary=f"{dep.task_a[:30]} → {dep.task_b[:30]}"))
        return _direct(question, "\n".join(lines), citations, True)

    # "overdue" / "late"
    if any(kw in q for kw in ["overdue", "late", "missed", "behind"]):
        today = date.today()
        overdue_actions = (
            db.query(Action)
            .filter(Action.status.notin_(["done", "blocked"]))
            .filter(Action.due_date < today)
            .order_by(Action.due_date)
            .all()
        )
        overdue_deadlines = (
            db.query(Deadline)
            .filter(Deadline.met == False)  # noqa: E712
            .filter(Deadline.deadline_date < today)
            .all()
        )
        if not overdue_actions and not overdue_deadlines:
            return _direct(question, "Nothing is overdue.", [], True)
        lines = []
        citations = []
        if overdue_actions:
            lines.append("Overdue actions:")
            for a in overdue_actions:
                days = (today - a.due_date).days
                owner = f" ({a.owner})" if a.owner else ""
                lines.append(f"  • {days}d overdue: {a.description}{owner}")
                citations.append(Citation(type="action", id=a.id, summary=a.description[:60]))
        if overdue_deadlines:
            lines.append("\nMissed deadlines:")
            for d in overdue_deadlines:
                days = (today - d.deadline_date).days
                lines.append(f"  • {days}d ago: {d.description}")
                citations.append(Citation(type="deadline", id=d.id, summary=d.description[:60]))
        return _direct(question, "\n".join(lines), citations, True)

    # "scope" / "scope creep" / "scope change"
    if any(kw in q for kw in ["scope", "scope creep", "scope change", "in scope", "out of scope"]):
        items = db.query(ScopeItem).order_by(ScopeItem.added_date.desc()).all()
        if not items:
            return _direct(question, "No scope items recorded.", [], True)
        lines = ["Scope items:\n"]
        citations = []
        for s in items:
            approved = "APPROVED" if s.approved else "PENDING"
            lines.append(f"• [{approved}] ({s.source}) {s.description}")
            citations.append(Citation(type="scope_item", id=s.id, summary=s.description[:60]))
        return _direct(question, "\n".join(lines), citations, True)

    return None  # Needs LLM


def _direct(question: str, answer: str, citations: list[Citation], direct: bool) -> QueryResponse:
    return QueryResponse(
        question=question,
        answer=answer,
        model_used="database",
        citations=citations,
        answered_directly=direct,
    )


# ── Context builder for LLM queries ──────────────────────────────────────────

_VECTOR_CONTEXT_LIMIT = 8000


def _build_context(question: str, db: Session) -> str:
    """
    Collect project context for the LLM.

    First tries semantic search: embeds the question, retrieves the most
    relevant source documents from ChromaDB, and returns their content.
    Falls back to a structured DB snapshot if vector search is unavailable
    or returns no results.
    """
    today = date.today()

    # ── Semantic search (primary path) ───────────────────────────────────────
    try:
        vector_service = VectorService(db_path=Path("backend/data"))
        doc_ids = vector_service.search_documents(question, n_results=3)
        if doc_ids:
            docs = db.query(Document).filter(Document.id.in_(doc_ids)).all()
            parts: list[str] = [f"Today's date: {today}\n", "RELEVANT DOCUMENTS:\n"]
            remaining = _VECTOR_CONTEXT_LIMIT
            for doc in docs:
                if not doc.content_text or remaining <= 0:
                    continue
                snippet = doc.content_text[:remaining]
                parts.append(f"Document: {doc.filename}\n{snippet}\n")
                remaining -= len(snippet)
            context = "\n".join(parts)
            logger.info(
                "Vector search returned %d doc(s) for context (%d chars)",
                len(docs), len(context),
            )
            return context
    except Exception as exc:
        logger.warning("Vector search failed: %s, falling back to keyword", exc)

    # ── Structured DB snapshot (fallback) ────────────────────────────────────
    sections: list[str] = [f"Today's date: {today}\n"]

    # Open actions (limit to most relevant: open + in_progress, due soonest)
    actions = (
        db.query(Action)
        .filter(Action.status.notin_(["done"]))
        .order_by(Action.due_date.asc().nullslast())
        .limit(20)
        .all()
    )
    if actions:
        sections.append("OPEN ACTIONS:")
        for a in actions:
            due = f"due {a.due_date}" if a.due_date else "no due date"
            owner = f", owner: {a.owner}" if a.owner else ""
            sections.append(f"  [ID:{a.id}] [{a.status}/{a.priority}] {a.description} ({due}{owner})")

    # Open risks
    risks = db.query(Risk).filter(Risk.status == "open").limit(15).all()
    if risks:
        sections.append("\nOPEN RISKS:")
        for r in risks:
            mit = f" | mitigation: {r.mitigation}" if r.mitigation else ""
            sections.append(f"  [ID:{r.id}] [{r.impact} impact/{r.likelihood} likelihood] {r.description}{mit}")

    # Upcoming deadlines
    deadlines = (
        db.query(Deadline)
        .filter(Deadline.met == False)  # noqa: E712
        .order_by(Deadline.deadline_date)
        .limit(10)
        .all()
    )
    if deadlines:
        sections.append("\nDEADLINES:")
        for d in deadlines:
            days = (d.deadline_date - today).days
            label = f"in {days}d" if days >= 0 else f"{abs(days)}d OVERDUE"
            sections.append(f"  [ID:{d.id}] {d.description} — {d.deadline_date} ({label})")

    # Dependencies
    deps = db.query(Dependency).limit(15).all()
    if deps:
        sections.append("\nDEPENDENCIES:")
        for dep in deps:
            sections.append(f"  [ID:{dep.id}] {dep.task_a} →[{dep.dependency_type}]→ {dep.task_b}")

    # Scope items
    scope = db.query(ScopeItem).order_by(ScopeItem.added_date.desc()).limit(10).all()
    if scope:
        sections.append("\nSCOPE ITEMS:")
        for s in scope:
            approved = "approved" if s.approved else "pending approval"
            sections.append(f"  [ID:{s.id}] [{s.source}/{approved}] {s.description}")

    return "\n".join(sections)


LLM_PROMPT_TEMPLATE = """PROJECT DATA:
{context}

USER QUESTION: {question}

Answer:"""


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.post("/query", tags=["query"], response_model=QueryResponse)
async def query(req: QueryRequest, db: Session = Depends(get_db)):
    """
    Ask a question about the project. Returns an answer with citations.
    Simple structured queries are answered directly from the DB (fast).
    Complex questions go to the LLM with full context.
    """
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    # 1. Try direct DB answer first
    if not req.use_deep_reasoning:
        direct = _direct_answer(req.question, db)
        if direct:
            return direct

    # 2. Build context + call LLM
    context = _build_context(req.question, db)
    if not context.strip():
        return QueryResponse(
            question=req.question,
            answer="No project data has been loaded yet. Upload some documents first.",
            model_used="none",
            citations=[],
            answered_directly=False,
        )

    # Truncate question to prevent prompt injection via oversized input
    safe_question = req.question.strip()[:1000]
    prompt = LLM_PROMPT_TEMPLATE.format(context=context, question=safe_question)

    try:
        if req.use_deep_reasoning:
            answer = await ollama.reason(prompt)
            role = "reasoning"
        else:
            answer = await ollama.general(prompt)
            role = "general"
    except OllamaUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    from app.config import get_model_assignments
    model_used = get_model_assignments()[role]["model"]

    # Extract lightweight citations from what was in context
    citations = _extract_citations(context, db)

    return QueryResponse(
        question=req.question,
        answer=answer.strip(),
        model_used=model_used,
        citations=citations,
        answered_directly=False,
    )


def _extract_citations(context: str, db: Session) -> list[Citation]:
    """Pull a representative set of citations from whatever ended up in context."""
    citations = []
    actions = db.query(Action).filter(Action.status.notin_(["done"])).limit(5).all()
    for a in actions:
        citations.append(Citation(type="action", id=a.id, summary=a.description[:60]))
    risks = db.query(Risk).filter(Risk.status == "open").limit(3).all()
    for r in risks:
        citations.append(Citation(type="risk", id=r.id, summary=r.description[:60]))
    deadlines = db.query(Deadline).filter(Deadline.met == False).limit(3).all()  # noqa: E712
    for d in deadlines:
        citations.append(Citation(type="deadline", id=d.id, summary=d.description[:60]))
    return citations
