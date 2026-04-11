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
    # System types no longer drive extraction — the universal base prompt in
    # document_processor.py handles all RAID extraction for every upload.
    # extraction_prompt is intentionally empty here; document type is injected
    # as a hint only. Custom user types may set extraction_prompt as an
    # additional hint appended to the base prompt.
    {"name": "General",        "target_model": "mistral-nemo",  "extraction_prompt": ""},
    {"name": "RAID Log",       "target_model": "mistral-nemo",  "extraction_prompt": ""},
    {"name": "Task List",      "target_model": "mistral-nemo",  "extraction_prompt": ""},
    {"name": "Project Plan",   "target_model": "llama3.1",      "extraction_prompt": ""},
    {"name": "Financial Data", "target_model": "deepseek-r1",   "extraction_prompt": ""},
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
