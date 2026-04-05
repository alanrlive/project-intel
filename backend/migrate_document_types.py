"""
Migration: Add document_types table and document_type_id to documents.

Run from backend/ directory:
    python migrate_document_types.py

Safe to re-run — checks for existing state before each step.
Creates a timestamped backup before making any changes.
"""

import shutil
import sqlite3
from datetime import datetime
from pathlib import Path

DB_PATH = Path(__file__).parent / "data" / "project.db"
BACKUP_DIR = Path(__file__).parent / "data" / "backups"

SYSTEM_TYPES = [
    {
        "name": "General",
        "target_model": "mistral-nemo",
        "extraction_prompt": (
            "Extract all relevant project management information from this document. "
            "Return a JSON object with these arrays (omit any array that has no items):\n"
            '- "actions": [{"description": str, "owner": str|null, "due_date": "YYYY-MM-DD"|null, "priority": "high"|"medium"|"low"}]\n'
            '- "risks": [{"description": str, "impact": "high"|"medium"|"low", "likelihood": "high"|"medium"|"low", "mitigation": str|null}]\n'
            '- "deadlines": [{"description": str, "deadline_date": "YYYY-MM-DD"}]\n'
            '- "dependencies": [{"task_a": str, "dependency_type": "blocks"|"enables"|"relates_to", "task_b": str, "notes": str|null}]\n'
            '- "scope_items": [{"description": str, "source": "change_request"|"original_plan"|"meeting", "impact_assessment": str|null}]\n'
            "Return only valid JSON, no explanation or markdown."
        ),
    },
    {
        "name": "RAID Log",
        "target_model": "mistral-nemo",
        "extraction_prompt": (
            "Extract all RAID items from this document. "
            "Return a JSON object with these arrays (omit any that have no items):\n"
            '- "risks": [{"description": str, "impact": "high"|"medium"|"low", "likelihood": "high"|"medium"|"low", "mitigation": str|null}]\n'
            '- "actions": [{"description": str, "owner": str|null, "due_date": "YYYY-MM-DD"|null, "priority": "high"|"medium"|"low"}]\n'
            '- "dependencies": [{"task_a": str, "dependency_type": "blocks"|"enables"|"relates_to", "task_b": str, "notes": str|null}]\n'
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


def backup_db(db_path: Path) -> Path:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    dest = BACKUP_DIR / f"project_{ts}.db"
    shutil.copy2(db_path, dest)
    return dest


def table_exists(cur: sqlite3.Cursor, table: str) -> bool:
    cur.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)
    )
    return cur.fetchone() is not None


def column_exists(cur: sqlite3.Cursor, table: str, column: str) -> bool:
    cur.execute(f"PRAGMA table_info({table})")
    return any(row[1] == column for row in cur.fetchall())


def run():
    if not DB_PATH.exists():
        print(f"[ERROR] Database not found at {DB_PATH}")
        print("        Start the backend at least once to initialise the DB, then re-run.")
        raise SystemExit(1)

    print(f"[INFO]  Database: {DB_PATH}")

    # --- Backup ---------------------------------------------------------------
    backup_path = backup_db(DB_PATH)
    print(f"[OK]    Backup created: {backup_path}")

    con = sqlite3.connect(DB_PATH)
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA foreign_keys=ON")
    cur = con.cursor()

    try:
        # --- Step 1: Create document_types table ------------------------------
        if table_exists(cur, "document_types"):
            print("[SKIP]  document_types table already exists")
        else:
            cur.execute("""
                CREATE TABLE document_types (
                    id               INTEGER PRIMARY KEY AUTOINCREMENT,
                    name             TEXT    NOT NULL UNIQUE,
                    extraction_prompt TEXT   NOT NULL,
                    target_model     TEXT    NOT NULL DEFAULT 'mistral-nemo',
                    is_system        INTEGER NOT NULL DEFAULT 0,
                    created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
                )
            """)
            print("[OK]    Created document_types table")

        # --- Step 2: Seed system document types -------------------------------
        for dt in SYSTEM_TYPES:
            cur.execute("SELECT id FROM document_types WHERE name=?", (dt["name"],))
            if cur.fetchone():
                print(f"[SKIP]  System type already exists: {dt['name']}")
            else:
                cur.execute(
                    """
                    INSERT INTO document_types (name, extraction_prompt, target_model, is_system)
                    VALUES (?, ?, ?, 1)
                    """,
                    (dt["name"], dt["extraction_prompt"], dt["target_model"]),
                )
                print(f"[OK]    Seeded system type: {dt['name']}")

        # --- Step 3: Add document_type_id column to documents -----------------
        if column_exists(cur, "documents", "document_type_id"):
            print("[SKIP]  documents.document_type_id column already exists")
        else:
            cur.execute(
                "ALTER TABLE documents ADD COLUMN document_type_id INTEGER REFERENCES document_types(id)"
            )
            print("[OK]    Added document_type_id column to documents")

        # --- Step 4: Assign existing documents to General ---------------------
        cur.execute("SELECT id FROM document_types WHERE name='General'")
        general = cur.fetchone()
        if general is None:
            raise RuntimeError("General document type missing — seed step failed")
        general_id = general[0]

        cur.execute(
            "UPDATE documents SET document_type_id=? WHERE document_type_id IS NULL",
            (general_id,),
        )
        updated = cur.rowcount
        if updated:
            print(f"[OK]    Set {updated} existing document(s) to 'General' type")
        else:
            print("[SKIP]  No unassigned documents to update")

        con.commit()
        print("\n[OK]    Migration complete.")

    except Exception as exc:
        con.rollback()
        print(f"\n[ERROR] Migration failed: {exc}")
        print(f"        Database rolled back. Backup available at: {backup_path}")
        raise
    finally:
        con.close()


if __name__ == "__main__":
    run()
