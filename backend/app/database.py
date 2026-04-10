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
            '- "actions": [{"id": str|null, "description": str, "owner": str|null, "due_date": "YYYY-MM-DD"|null, "priority": "high"|"medium"|"low", "status": "open"|"done"|"cancelled"}]\n'
            'CRITICAL: Return ALL actions mentioned in this document regardless of status. Do NOT omit actions that are completed, done, finished, or closed. Completed actions must be returned with status: done. Cancelled or deferred actions must be returned with status: cancelled. Omitting completed actions prevents the system from closing them off in the tracker.\n'
            'FIELDS: Always return all fields for every action regardless of status. Never truncate descriptions — return the full description text exactly as it appears in the document. For completed actions, carry forward the original due_date and priority from the document if present. Only return null for fields that are genuinely absent from the document.\n'
            'DESCRIPTION: For each item, set the description field to the text as it appears in THIS document. Do not repeat the original action description if this document contains updated or completion text about that item. For example, if a document says "ACTION-001: Dev environment setup complete, all team members confirmed", return that text as the description, not the original "set up dev environment" wording.\n'
            '- "risks": [{"id": str|null, "description": str, "impact": "high"|"medium"|"low", "likelihood": "high"|"medium"|"low", "mitigation": str|null, "status": "open"|"closed"}]\n'
            '- "deadlines": [{"id": str|null, "description": str, "deadline_date": "YYYY-MM-DD", "met": true|false}]\n'
            '- "dependencies": [{"id": str|null, "task_a": str, "dependency_type": "blocks"|"enables"|"relates_to", "task_b": str}]\n'
            '- "scope_items": [{"id": str|null, "description": str, "source": "deferred"|"change_request"|"original"|"meeting"}]\n'
            "\n"
            'ID: Extract the reference ID exactly as it appears in the document (e.g. "ACT-001", "RSK-003", "DL-02"). If no ID is present, return null.\n'
            'STATUS: Actions COMPLETED/DONE/FINISHED/CLOSED="done". CANCELLED/DEFERRED/OUT OF SCOPE="cancelled". Otherwise="open". '
            'Risks RESOLVED/CLOSED/MITIGATED="closed". Deadlines MET/ACHIEVED/DELIVERED=true. '
            'Check narrative: "we finally finished X", "X is behind us", "X no longer a problem".\n'
            'Scope items: future features, DEFERRED/V3/OUT OF SCOPE, "it would be cool if".\n'
            'Dependencies: "A blocks B" = A must finish before B starts. A is prerequisite.\n'
            "Dates: use task dates, not file metadata.\n"
            "JSON only, no markdown."
        ),
    },
    {
        "name": "RAID Log",
        "target_model": "mistral-nemo",
        "extraction_prompt": (
            "Extract all RAID items from ALL sheets/tabs. Return JSON (omit empty arrays):\n"
            '- "risks": [{"id": str|null, "description": str, "impact": "high"|"medium"|"low", "likelihood": "high"|"medium"|"low", "mitigation": str|null, "status": "open"|"closed"}]\n'
            '- "actions": [{"id": str|null, "description": str, "owner": str|null, "due_date": "YYYY-MM-DD"|null, "priority": "high"|"medium"|"low", "status": "open"|"done"|"cancelled"}]\n'
            'CRITICAL: Return ALL actions mentioned in this document regardless of status. Do NOT omit actions that are completed, done, finished, or closed. Completed actions must be returned with status: done. Cancelled or deferred actions must be returned with status: cancelled. Omitting completed actions prevents the system from closing them off in the tracker.\n'
            'FIELDS: Always return all fields for every action regardless of status. Never truncate descriptions — return the full description text exactly as it appears in the document. For completed actions, carry forward the original due_date and priority from the document if present. Only return null for fields that are genuinely absent from the document.\n'
            'DESCRIPTION: For each item, set the description field to the text as it appears in THIS document. Do not repeat the original action description if this document contains updated or completion text about that item. For example, if a document says "ACTION-001: Dev environment setup complete, all team members confirmed", return that text as the description, not the original "set up dev environment" wording.\n'
            '- "dependencies": [{"id": str|null, "task_a": str, "dependency_type": "blocks"|"enables"|"relates_to", "task_b": str}]\n'
            "\n"
            'ID: Extract the reference ID exactly as it appears in the document (e.g. "ACT-001", "RSK-003"). If no ID is present in the row/item, return null.\n'
            'STATUS: Actions COMPLETED/DONE/FINISHED/CLOSED="done". CANCELLED/DEFERRED="cancelled". Otherwise="open". '
            'Risks RESOLVED/CLOSED/MITIGATED="closed". Check status columns AND narrative text.\n'
            'Dependencies: "A blocks B" = A must finish before B starts. Check all tabs.\n'
            "Dates: use task dates, not file metadata.\n"
            "Assumptions/issues → actions if owner/date present, else risks.\n"
            "JSON only, no markdown."
        ),
    },
    {
        "name": "Task List",
        "target_model": "mistral-nemo",
        "extraction_prompt": (
            "Extract all tasks, action items, and deadlines from this document. "
            "Return a JSON object with:\n"
            '- "actions": [{"id": str|null, "description": str, "owner": str|null, "due_date": "YYYY-MM-DD"|null, "priority": "high"|"medium"|"low", "status": "open"|"done"|"cancelled"}]\n'
            'CRITICAL: Return ALL actions mentioned in this document regardless of status. Do NOT omit actions that are completed, done, finished, or closed. Completed actions must be returned with status: done. Cancelled or deferred actions must be returned with status: cancelled. Omitting completed actions prevents the system from closing them off in the tracker.\n'
            'FIELDS: Always return all fields for every action regardless of status. Never truncate descriptions — return the full description text exactly as it appears in the document. For completed actions, carry forward the original due_date and priority from the document if present. Only return null for fields that are genuinely absent from the document.\n'
            'DESCRIPTION: For each item, set the description field to the text as it appears in THIS document. Do not repeat the original action description if this document contains updated or completion text about that item. For example, if a document says "ACTION-001: Dev environment setup complete, all team members confirmed", return that text as the description, not the original "set up dev environment" wording.\n'
            '- "deadlines": [{"id": str|null, "description": str, "deadline_date": "YYYY-MM-DD", "met": true|false}]\n'
            'ID: Extract the reference ID exactly as it appears (e.g. "TSK-001"). Return null if none.\n'
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
            '- "actions": [{"id": str|null, "description": str, "owner": str|null, "due_date": "YYYY-MM-DD"|null, "priority": "high"|"medium"|"low", "status": "open"|"done"|"cancelled"}]\n'
            'CRITICAL: Return ALL actions mentioned in this document regardless of status. Do NOT omit actions that are completed, done, finished, or closed. Completed actions must be returned with status: done. Cancelled or deferred actions must be returned with status: cancelled. Omitting completed actions prevents the system from closing them off in the tracker.\n'
            'FIELDS: Always return all fields for every action regardless of status. Never truncate descriptions — return the full description text exactly as it appears in the document. For completed actions, carry forward the original due_date and priority from the document if present. Only return null for fields that are genuinely absent from the document.\n'
            'DESCRIPTION: For each item, set the description field to the text as it appears in THIS document. Do not repeat the original action description if this document contains updated or completion text about that item. For example, if a document says "ACTION-001: Dev environment setup complete, all team members confirmed", return that text as the description, not the original "set up dev environment" wording.\n'
            '- "deadlines": [{"id": str|null, "description": str, "deadline_date": "YYYY-MM-DD", "met": true|false}]\n'
            '- "dependencies": [{"id": str|null, "task_a": str, "dependency_type": "blocks"|"enables"|"relates_to", "task_b": str, "notes": str|null}]\n'
            '- "risks": [{"id": str|null, "description": str, "impact": "high"|"medium"|"low", "likelihood": "high"|"medium"|"low", "mitigation": str|null, "status": "open"|"closed"}]\n'
            '- "scope_items": [{"id": str|null, "description": str, "source": "original_plan"|"change_request"|"meeting", "impact_assessment": str|null}]\n'
            'ID: Extract the reference ID exactly as it appears in the document. Return null if none.\n'
            "Return only valid JSON, no explanation or markdown."
        ),
    },
    {
        "name": "Financial Data",
        "target_model": "deepseek-r1",
        "extraction_prompt": (
            "Extract all financially relevant project management information from this document. "
            "Return a JSON object with:\n"
            '- "risks": [{"id": str|null, "description": str, "impact": "high"|"medium"|"low", "likelihood": "high"|"medium"|"low", "mitigation": str|null, "status": "open"|"closed"}]\n'
            '- "actions": [{"id": str|null, "description": str, "owner": str|null, "due_date": "YYYY-MM-DD"|null, "priority": "high"|"medium"|"low", "status": "open"|"done"|"cancelled"}]\n'
            'CRITICAL: Return ALL actions mentioned in this document regardless of status. Do NOT omit actions that are completed, done, finished, or closed. Completed actions must be returned with status: done. Cancelled or deferred actions must be returned with status: cancelled. Omitting completed actions prevents the system from closing them off in the tracker.\n'
            'FIELDS: Always return all fields for every action regardless of status. Never truncate descriptions — return the full description text exactly as it appears in the document. For completed actions, carry forward the original due_date and priority from the document if present. Only return null for fields that are genuinely absent from the document.\n'
            'DESCRIPTION: For each item, set the description field to the text as it appears in THIS document. Do not repeat the original action description if this document contains updated or completion text about that item. For example, if a document says "ACTION-001: Dev environment setup complete, all team members confirmed", return that text as the description, not the original "set up dev environment" wording.\n'
            '- "scope_items": [{"id": str|null, "description": str, "source": "change_request"|"original_plan"|"meeting", "impact_assessment": str|null}]\n'
            'ID: Extract the reference ID exactly as it appears in the document. Return null if none.\n'
            "Focus on budget overruns, cost risks, approval actions, and scope changes with financial impact. "
            "Return only valid JSON, no explanation or markdown."
        ),
    },
]


def _migrate_schema():
    """
    Idempotent schema migrations for existing databases.
    - Adds new columns via ALTER TABLE only if they don't already exist.
    - Creates new tables via CREATE TABLE IF NOT EXISTS.
    SQLAlchemy's create_all() handles fresh installs; this handles upgrades.
    """
    _RAID_TABLES = ["actions", "risks", "deadlines", "dependencies", "scope_items"]

    with engine.connect() as conn:
        raw = conn.connection  # underlying sqlite3 connection

        # Add reference_id to all 5 RAID tables
        for table in _RAID_TABLES:
            cursor = raw.execute(f"PRAGMA table_info({table})")
            existing_cols = {row[1] for row in cursor.fetchall()}
            if "reference_id" not in existing_cols:
                raw.execute(f"ALTER TABLE {table} ADD COLUMN reference_id TEXT")

        # Create raid_item_history if absent
        raw.execute("""
            CREATE TABLE IF NOT EXISTS raid_item_history (
                id                 INTEGER PRIMARY KEY AUTOINCREMENT,
                item_type          TEXT    NOT NULL,
                item_id            INTEGER NOT NULL,
                reference_id       TEXT,
                description        TEXT    NOT NULL,
                status             TEXT,
                source_document_id INTEGER REFERENCES documents(id),
                changed_at         DATETIME DEFAULT (STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW'))
            )
        """)
        raw.execute(
            "CREATE INDEX IF NOT EXISTS idx_raid_history_item "
            "ON raid_item_history (item_type, item_id)"
        )
        raw.execute(
            "CREATE INDEX IF NOT EXISTS idx_raid_history_changed_at "
            "ON raid_item_history (changed_at)"
        )
        raw.commit()


def init_db():
    """Create all tables, run schema migrations, and seed system document types."""
    from app import models  # noqa: F401 — import triggers table registration
    Base.metadata.create_all(bind=engine)
    _migrate_schema()
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
