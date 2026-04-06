from pathlib import Path
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from app.config import get_settings, DATA_DIR, UPLOADS_DIR


settings = get_settings()

# Ensure data directories exist
DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},  # Required for SQLite + FastAPI
)

# Enable WAL mode for better concurrent read performance
@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    """FastAPI dependency — yields a DB session and closes it after request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


_SYSTEM_TYPES = [
    {
        "name": "General",
        "target_model": "mistral-nemo",
        "extraction_prompt": (
            'Extract project management data as JSON (omit empty arrays):\n'
            '- "actions": [{"description": str, "owner": str|null, "due_date": "YYYY-MM-DD"|null, "priority": "high"|"medium"|"low"}]\n'
            '- "risks": [{"description": str, "impact": "high"|"medium"|"low", "likelihood": "high"|"medium"|"low", "mitigation": str|null}]\n'
            '- "deadlines": [{"description": str, "deadline_date": "YYYY-MM-DD"}]\n'
            '- "dependencies": [{"task_a": str, "dependency_type": "blocks"|"enables"|"relates_to", "task_b": str}]\n'
            '- "scope_items": [{"description": str, "source": "deferred"|"change_request"|"original"|"meeting"}]\n'
            "\n"
            "Scope items: future features, ideas marked DEFERRED/V3/OUT OF SCOPE, phrases like \"it would be cool if\".\n"
            "Dependencies: \"A blocks B\" = A must finish first. Check all sheets/sections.\n"
            "Dates: use task dates, not file metadata. Assume current/next year if ambiguous.\n"
            "JSON only, no markdown."
        ),
    },
    {
        "name": "RAID Log",
        "target_model": "mistral-nemo",
        "extraction_prompt": (
            "Extract all RAID items from this document including from ALL sheets/tabs if spreadsheet. "
            "Return a JSON object with these arrays (omit any that have no items):\n"
            '- "risks": [{"description": str, "impact": "high"|"medium"|"low", "likelihood": "high"|"medium"|"low", "mitigation": str|null}]\n'
            '- "actions": [{"description": str, "owner": str|null, "due_date": "YYYY-MM-DD"|null, "priority": "high"|"medium"|"low"}]\n'
            '- "dependencies": [{"task_a": str, "dependency_type": "blocks"|"enables"|"relates_to", "task_b": str, "notes": str|null}]\n'
            "\n"
            'Dependencies: "A blocks B" = A must finish before B can start. A is the blocker/prerequisite. '
            'B is waiting/blocked. Example: "Backend API blocks Frontend UI" means backend must complete first.\n'
            "\n"
            "DATES: Use dates mentioned in descriptions, not file metadata dates.\n"
            "\n"
            "Assumptions and issues should be mapped to actions where an owner or due date is present, "
            "otherwise to risks. Return only valid JSON, no explanation or markdown."
        ),
    },
    {
        "name": "Task List",
        "target_model": "mistral-nemo",
        "extraction_prompt": (
            "Extract all tasks, action items, and deadlines from this document. "
            "Return a JSON object with:\n"
            '- "actions": [{"description": str, "owner": str|null, "due_date": "YYYY-MM-DD"|null, "priority": "high"|"medium"|"low"}]\n'
            '- "deadlines": [{"description": str, "deadline_date": "YYYY-MM-DD"}]\n'
            "Infer priority from language (urgent/critical = high, soon/shortly = medium, eventually = low). "
            "Return only valid JSON, no explanation or markdown."
        ),
    },
    {
        "name": "Project Plan",
        "target_model": "llama3.1",
        "extraction_prompt": (
            "Extract all project planning information from this document. "
            "Return a JSON object with:\n"
            '- "actions": [{"description": str, "owner": str|null, "due_date": "YYYY-MM-DD"|null, "priority": "high"|"medium"|"low"}]\n'
            '- "deadlines": [{"description": str, "deadline_date": "YYYY-MM-DD"}]\n'
            '- "dependencies": [{"task_a": str, "dependency_type": "blocks"|"enables"|"relates_to", "task_b": str, "notes": str|null}]\n'
            '- "risks": [{"description": str, "impact": "high"|"medium"|"low", "likelihood": "high"|"medium"|"low", "mitigation": str|null}]\n'
            '- "scope_items": [{"description": str, "source": "original_plan"|"change_request"|"meeting", "impact_assessment": str|null}]\n'
            "Return only valid JSON, no explanation or markdown."
        ),
    },
    {
        "name": "Financial Data",
        "target_model": "deepseek-r1",
        "extraction_prompt": (
            "Extract all financially relevant project management information from this document. "
            "Return a JSON object with:\n"
            '- "risks": [{"description": str, "impact": "high"|"medium"|"low", "likelihood": "high"|"medium"|"low", "mitigation": str|null}]\n'
            '- "actions": [{"description": str, "owner": str|null, "due_date": "YYYY-MM-DD"|null, "priority": "high"|"medium"|"low"}]\n'
            '- "scope_items": [{"description": str, "source": "change_request"|"original_plan"|"meeting", "impact_assessment": str|null}]\n'
            "Focus on budget overruns, cost risks, approval actions, and scope changes with financial impact. "
            "Return only valid JSON, no explanation or markdown."
        ),
    },
]


def init_db():
    """Create all tables and seed system document types. Called once at startup."""
    from app import models  # noqa: F401 — import triggers table registration
    Base.metadata.create_all(bind=engine)
    _seed_system_types()


def _seed_system_types():
    """
    Insert the 5 built-in document types if they don't exist yet.
    Also updates extraction_prompt on existing system types so that
    prompt changes take effect after a backend restart (idempotent).
    """
    from app.models import DocumentType  # local import to avoid circular deps
    db = SessionLocal()
    try:
        for dt in _SYSTEM_TYPES:
            exists = db.query(DocumentType).filter(DocumentType.name == dt["name"]).first()
            if not exists:
                db.add(DocumentType(
                    name=dt["name"],
                    extraction_prompt=dt["extraction_prompt"],
                    target_model=dt["target_model"],
                    is_system=True,
                ))
            else:
                # Keep prompt in sync with code — system types are not user-editable
                exists.extraction_prompt = dt["extraction_prompt"]
                exists.target_model = dt["target_model"]
        db.commit()
    finally:
        db.close()
