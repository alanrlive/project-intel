"""
Integration tests for POST /documents/batch-upload.

Prerequisites:
  - Backend running on http://localhost:8000
  - Ollama running with at least one model available
  - Test data files exist in tests/test_data/
    (run: python tests/create_test_data.py if missing)

Run from repo root:
    python tests/test_batch_upload.py
"""

import sys
import sqlite3
from pathlib import Path
import urllib.request
import urllib.parse
import urllib.error
import json
import io
import mimetypes

# ── Config ────────────────────────────────────────────────────────────────────

BASE_URL = "http://localhost:8000"
DB_PATH  = Path(__file__).parent.parent / "backend" / "data" / "project.db"
DATA_DIR = Path(__file__).parent / "test_data"

PASS = "\033[32m[PASS]\033[0m"
FAIL = "\033[31m[FAIL]\033[0m"
INFO = "\033[36m[INFO]\033[0m"
WARN = "\033[33m[WARN]\033[0m"

results: list[tuple[str, bool, str]] = []


# ── Helpers ───────────────────────────────────────────────────────────────────

def record(name: str, passed: bool, detail: str = ""):
    results.append((name, passed, detail))
    icon = PASS if passed else FAIL
    print(f"  {icon}  {name}" + (f" — {detail}" if detail else ""))


def get(path: str) -> dict:
    url = f"{BASE_URL}{path}"
    with urllib.request.urlopen(url, timeout=10) as resp:
        return json.loads(resp.read())


def multipart_post(path: str, fields: list[tuple[str, str | bytes, str]]) -> tuple[int, dict]:
    """
    Minimal multipart/form-data POST using only stdlib.
    fields: list of (name, value, content_type)
           value is str for text fields, bytes for file data.
    """
    boundary = "----ProjectIntelBoundary7f3a9b"
    body_parts = []

    for name, value, ct in fields:
        if isinstance(value, bytes):
            part = (
                f'--{boundary}\r\n'
                f'Content-Disposition: form-data; name="{name}"; filename="{name}"\r\n'
                f'Content-Type: {ct}\r\n\r\n'
            ).encode() + value + b'\r\n'
        else:
            part = (
                f'--{boundary}\r\n'
                f'Content-Disposition: form-data; name="{name}"\r\n\r\n'
                f'{value}\r\n'
            ).encode()
        body_parts.append(part)

    body_parts.append(f'--{boundary}--\r\n'.encode())
    body = b''.join(body_parts)

    req = urllib.request.Request(
        f"{BASE_URL}{path}",
        data=body,
        headers={'Content-Type': f'multipart/form-data; boundary={boundary}'},
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


def db_count(table: str) -> int:
    conn = sqlite3.connect(DB_PATH)
    try:
        cur = conn.execute(f"SELECT COUNT(*) FROM {table}")
        return cur.fetchone()[0]
    finally:
        conn.close()


def get_general_type_id() -> int | None:
    """Return the id of the 'General' document type from the DB."""
    conn = sqlite3.connect(DB_PATH)
    try:
        cur = conn.execute("SELECT id FROM document_types WHERE name='General'")
        row = cur.fetchone()
        return row[0] if row else None
    finally:
        conn.close()


def get_type_id(name: str) -> int | None:
    conn = sqlite3.connect(DB_PATH)
    try:
        cur = conn.execute("SELECT id FROM document_types WHERE name=?", (name,))
        row = cur.fetchone()
        return row[0] if row else None
    finally:
        conn.close()


# ── Test suites ───────────────────────────────────────────────────────────────

def test_backend_reachable():
    print("\n--- Backend health ---")
    try:
        data = get("/health")
        record("Backend /health returns 200", data.get("status") == "ok", data.get("status"))
    except Exception as e:
        record("Backend /health returns 200", False, str(e))
        print(f"\n{FAIL} Backend not reachable — aborting. Start with: .\\scripts\\start_backend.ps1")
        sys.exit(1)


def test_document_types_exist():
    print("\n--- Document types ---")
    try:
        types = get("/settings/document-types")
        names = [t["name"] for t in types]
        for expected in ["General", "RAID Log", "Task List", "Project Plan", "Financial Data"]:
            record(f"System type '{expected}' exists", expected in names)
        system_count = sum(1 for t in types if t["is_system"])
        record("At least 5 system types", system_count >= 5, f"{system_count} system types")
    except Exception as e:
        record("GET /settings/document-types", False, str(e))


def test_test_files_exist():
    print("\n--- Test data files ---")
    for fname in ["raid_example.xlsx", "meeting_notes.docx", "budget_overview.pdf"]:
        path = DATA_DIR / fname
        record(f"{fname} exists", path.exists(),
               f"{path.stat().st_size} bytes" if path.exists() else "MISSING — run create_test_data.py")


def test_batch_upload_mixed_types():
    print("\n--- Batch upload (3 files, 3 types) ---")

    xlsx_path  = DATA_DIR / "raid_example.xlsx"
    docx_path  = DATA_DIR / "meeting_notes.docx"
    pdf_path   = DATA_DIR / "budget_overview.pdf"

    missing = [p for p in [xlsx_path, docx_path, pdf_path] if not p.exists()]
    if missing:
        for p in missing:
            record(f"{p.name} upload", False, "File missing — run create_test_data.py")
        return

    raid_id     = get_type_id("RAID Log")
    general_id  = get_type_id("General")
    finance_id  = get_type_id("Financial Data")

    if not all([raid_id, general_id, finance_id]):
        record("Document type IDs resolved", False, "Run migration: python migrate_document_types.py")
        return
    record("Document type IDs resolved", True,
           f"RAID={raid_id} General={general_id} Financial={finance_id}")

    # Snapshot counts before upload
    before = {t: db_count(t) for t in ["actions", "risks", "deadlines", "dependencies"]}

    fields = [
        ("files", xlsx_path.read_bytes(),  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
        ("files", docx_path.read_bytes(),  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        ("files", pdf_path.read_bytes(),   "application/pdf"),
        ("type_ids", str(raid_id),    "text/plain"),
        ("type_ids", str(general_id), "text/plain"),
        ("type_ids", str(finance_id), "text/plain"),
    ]

    # Rename file fields to include filename in content-disposition
    # (override the helper for file fields)
    boundary = "----ProjectIntelBatch"
    body_parts = []
    file_fields = [
        ("files", "raid_example.xlsx",  xlsx_path.read_bytes(),
         "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
        ("files", "meeting_notes.docx", docx_path.read_bytes(),
         "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        ("files", "budget_overview.pdf", pdf_path.read_bytes(),
         "application/pdf"),
    ]
    for name, filename, data, ct in file_fields:
        part = (
            f'--{boundary}\r\n'
            f'Content-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'
            f'Content-Type: {ct}\r\n\r\n'
        ).encode() + data + b'\r\n'
        body_parts.append(part)

    for type_id in [str(raid_id), str(general_id), str(finance_id)]:
        part = (
            f'--{boundary}\r\n'
            f'Content-Disposition: form-data; name="type_ids"\r\n\r\n'
            f'{type_id}\r\n'
        ).encode()
        body_parts.append(part)

    body_parts.append(f'--{boundary}--\r\n'.encode())
    body = b''.join(body_parts)

    req = urllib.request.Request(
        f"{BASE_URL}/documents/batch-upload",
        data=body,
        headers={'Content-Type': f'multipart/form-data; boundary={boundary}'},
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            status = resp.status
            data = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        record("POST /documents/batch-upload HTTP 200", False, f"HTTP {e.code}: {e.read()[:200]}")
        return
    except Exception as e:
        record("POST /documents/batch-upload HTTP 200", False, str(e))
        return

    record("HTTP 200 response", status == 200, f"status={status}")
    record("Returns 3 results", len(data) == 3, f"got {len(data)}")

    for item in data:
        fname = item.get("filename", "?")
        success = item.get("success", False)
        error = item.get("error", "")
        detail = f"doc_id={item.get('doc_id')}" if success else f"error: {error}"
        record(f"  {fname} processed", success, detail)

    # Check DB counts increased
    after = {t: db_count(t) for t in ["actions", "risks", "deadlines", "dependencies"]}
    total_new = sum(after[t] - before[t] for t in before)
    record("At least 1 item extracted across all files", total_new >= 1,
           f"+{total_new} total items")

    print(f"\n  {INFO}  Extraction deltas:")
    for t in before:
        delta = after[t] - before[t]
        print(f"         {t}: +{delta}")


def test_unsupported_file_type():
    print("\n--- Error handling: unsupported file type ---")
    general_id = get_type_id("General")
    if not general_id:
        record("Unsupported type test", False, "General type ID not found")
        return

    boundary = "----ProjectIntelError"
    fake_csv = b"col1,col2\nval1,val2\n"
    body = (
        f'--{boundary}\r\n'
        f'Content-Disposition: form-data; name="files"; filename="data.csv"\r\n'
        f'Content-Type: text/csv\r\n\r\n'
    ).encode() + fake_csv + b'\r\n' + (
        f'--{boundary}\r\n'
        f'Content-Disposition: form-data; name="type_ids"\r\n\r\n'
        f'{general_id}\r\n'
        f'--{boundary}--\r\n'
    ).encode()

    req = urllib.request.Request(
        f"{BASE_URL}/documents/batch-upload",
        data=body,
        headers={'Content-Type': f'multipart/form-data; boundary={boundary}'},
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read())
        record("HTTP 200 (batch never 4xx for per-file errors)", True)
        item = result[0] if result else {}
        record("success=False for .csv", item.get("success") is False,
               item.get("error", ""))
    except urllib.error.HTTPError as e:
        record("Unsupported file graceful failure", False, f"HTTP {e.code}")


def test_type_mismatch_error():
    print("\n--- Error handling: mismatched files/type_ids count ---")
    general_id = get_type_id("General")
    if not general_id:
        record("Mismatch test setup", False, "General type ID not found")
        return

    boundary = "----ProjectIntelMismatch"
    body = (
        f'--{boundary}\r\n'
        f'Content-Disposition: form-data; name="files"; filename="a.txt"\r\n'
        f'Content-Type: text/plain\r\n\r\nsome text\r\n'
        f'--{boundary}\r\n'
        f'Content-Disposition: form-data; name="files"; filename="b.txt"\r\n'
        f'Content-Type: text/plain\r\n\r\nmore text\r\n'
        # Only 1 type_id for 2 files — should be rejected
        f'--{boundary}\r\n'
        f'Content-Disposition: form-data; name="type_ids"\r\n\r\n{general_id}\r\n'
        f'--{boundary}--\r\n'
    ).encode()

    req = urllib.request.Request(
        f"{BASE_URL}/documents/batch-upload",
        data=body,
        headers={'Content-Type': f'multipart/form-data; boundary={boundary}'},
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            record("422 on mismatch", False, f"Expected 422, got {resp.status}")
    except urllib.error.HTTPError as e:
        record("422 on mismatched files/type_ids", e.code == 422, f"HTTP {e.code}")


def test_custom_document_type_crud():
    print("\n--- Custom document type CRUD ---")
    import json as _json

    # CREATE
    payload = _json.dumps({
        "name": "__TestType_BatchTest__",
        "extraction_prompt": (
            "Extract all items from this document. "
            "Return JSON with arrays: actions, risks, deadlines."
        ),
        "target_model": "mistral-nemo",
    }).encode()
    req = urllib.request.Request(
        f"{BASE_URL}/settings/document-types",
        data=payload,
        headers={'Content-Type': 'application/json'},
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            created = _json.loads(resp.read())
        record("POST /settings/document-types creates custom type",
               created.get("name") == "__TestType_BatchTest__",
               f"id={created.get('id')}")
        type_id = created["id"]
        is_system = created.get("is_system", True)
        record("Custom type has is_system=False", is_system is False)
    except Exception as e:
        record("POST /settings/document-types", False, str(e))
        return

    # UPDATE
    patch_payload = _json.dumps({"name": "__TestType_BatchTest_Renamed__"}).encode()
    req2 = urllib.request.Request(
        f"{BASE_URL}/settings/document-types/{type_id}",
        data=patch_payload,
        headers={'Content-Type': 'application/json'},
        method='PATCH',
    )
    try:
        with urllib.request.urlopen(req2, timeout=10) as resp:
            updated = _json.loads(resp.read())
        record("PATCH renames custom type",
               updated.get("name") == "__TestType_BatchTest_Renamed__")
    except Exception as e:
        record("PATCH /settings/document-types/{id}", False, str(e))

    # DELETE
    req3 = urllib.request.Request(
        f"{BASE_URL}/settings/document-types/{type_id}",
        method='DELETE',
    )
    try:
        with urllib.request.urlopen(req3, timeout=10) as resp:
            record("DELETE custom type returns 204", resp.status == 204)
    except urllib.error.HTTPError as e:
        record("DELETE /settings/document-types/{id}", e.code == 204, f"HTTP {e.code}")
    except Exception as e:
        record("DELETE /settings/document-types/{id}", False, str(e))

    # Confirm gone
    types = get("/settings/document-types")
    still_there = any(t["name"] == "__TestType_BatchTest_Renamed__" for t in types)
    record("Custom type removed from list", not still_there)


def test_delete_system_type_blocked():
    print("\n--- System type protection ---")
    types = get("/settings/document-types")
    system = next((t for t in types if t["is_system"]), None)
    if not system:
        record("System type DELETE blocked", False, "No system type found")
        return

    req = urllib.request.Request(
        f"{BASE_URL}/settings/document-types/{system['id']}",
        method='DELETE',
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            record("System type DELETE blocked (403)", False,
                   f"Expected 403, got {resp.status}")
    except urllib.error.HTTPError as e:
        record(f"DELETE system type '{system['name']}' returns 403", e.code == 403,
               f"HTTP {e.code}")
    except Exception as e:
        record("DELETE system type", False, str(e))


# ── Summary ───────────────────────────────────────────────────────────────────

def print_summary():
    passed = sum(1 for _, ok, _ in results if ok)
    total  = len(results)
    failed_tests = [(n, d) for n, ok, d in results if not ok]

    print(f"\n{'='*55}")
    print(f"Results: {passed}/{total} passed")
    if failed_tests:
        print(f"\nFailed:")
        for name, detail in failed_tests:
            print(f"  {FAIL}  {name}" + (f" — {detail}" if detail else ""))
    else:
        print(f"{PASS} All tests passed")
    print('='*55)

    return len(failed_tests) == 0


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("Project Intel V2 — Batch Upload Integration Tests")
    print(f"Backend: {BASE_URL}")
    print(f"DB:      {DB_PATH}")

    test_backend_reachable()
    test_document_types_exist()
    test_test_files_exist()
    test_batch_upload_mixed_types()
    test_unsupported_file_type()
    test_type_mismatch_error()
    test_custom_document_type_crud()
    test_delete_system_type_blocked()

    ok = print_summary()
    sys.exit(0 if ok else 1)
