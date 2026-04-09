HANDOFF PROMPT - Copy Everything Below
markdown# Project Intel V2 - Development Handoff

## Project Overview
I'm building a GDPR-compliant, self-hosted AI-powered project management assistant called **Project Intel V2**. The tool uses local LLMs (Ollama) to analyze project documents, track tasks, detect risks, and provide intelligent briefings. All data stays on-device — no cloud, no external APIs.

## Current Status: WORKING PRODUCTION APP

### What's Complete (as of 2026-04-09)
- **Backend (FastAPI + SQLite):** 8 tables, 7 router modules
- **Frontend (Tauri v2 + React):** 8 views including Settings with 4 tabs
- **LLM Integration (Ollama):** Dynamic model assignments — model, context, system prompt, and timeout per role; no hardcoded model names anywhere
- **Vector Search (ChromaDB):** Documents embedded on upload using nomic-embed-text; semantic retrieval in Q&A chat; delete synced; rebuild index endpoint; Settings UI card with status + rebuild button
- **Features Working:**
  - Batch document upload (drag-and-drop, multi-file queue, per-file type selection)
  - Excel support (.xlsx all sheets to markdown tables via openpyxl)
  - Custom document types with per-type extraction prompts
  - Intake folder: configure a watched folder, scan it, batch-process files by path, auto-move on success
  - Automatic structured extraction (actions, risks, deadlines, dependencies, scope items)
  - Status fields preserved from LLM: actions get done/cancelled/open, risks get closed/open, deadlines get met=true/false
  - Daily briefing with smart notifications (overdue, upcoming, high-risk)
  - Conversational Q&A: semantic search retrieves relevant documents first, falls back to structured DB context
  - Deep reasoning toggle shows actual configured model name, elapsed timer during reasoning
  - All 5 data tables: CRUD, sort, CSV export, source document download, pagination (50/page)
  - Due dates show both relative label ("14d overdue") AND actual date below it
  - Settings: Document Types, Folders/intake config, LLM Config (model+context+system_prompt+timeout per role), About
  - Integration tests: 26/26 passing

## Tech Stack
**Backend:**
- Python 3.13, FastAPI, SQLAlchemy 2.0.36, SQLite (WAL mode, FK enforcement)
- Ollama for local LLM inference (localhost:11434)
- ChromaDB 0.5.23 for vector search (local persistent store at backend/data/chroma/)
- nomic-embed-text for document embeddings (via Ollama /api/embeddings)
- openpyxl, PyPDF2, python-docx for document parsing
- APScheduler for daily briefing cron
- httpx>=0.27.0 (unpinned — chromadb 0.5.23 requires >=0.27.0)
- Running on: http://localhost:8000

**Frontend:**
- Tauri v2 (Rust + webview)
- React 18 + TypeScript + Tailwind CSS v4
- Vite dev server (opens as native window, not browser)

## Project Structure
```
pm_tool/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI entry; settings imported as settings_router (alias)
│   │   ├── config.py            # pydantic-settings + read_app_config/write_app_config
│   │   ├── database.py          # SQLite engine, WAL, FK enforcement
│   │   ├── models.py            # 8 SQLAlchemy models
│   │   ├── llm_service.py       # OllamaService — extract/general/reason, status_report()
│   │   ├── vector_service.py    # VectorService — ChromaDB + nomic-embed-text via Ollama
│   │   ├── document_processor.py # extract_text(), extract_with_type(), store_extracted_data()
│   │   ├── notification_service.py # generate_daily_briefing()
│   │   ├── scheduler.py         # APScheduler cron
│   │   └── routers/
│   │       ├── documents.py     # upload, batch-upload, intake scan/process; DELETE syncs ChromaDB
│   │       ├── settings.py      # doc-types CRUD, ollama test, intake-folder, model-assignments, vector endpoints
│   │       ├── query.py         # POST /query — vector search first, DB fallback
│   │       ├── notifications.py # CRUD + refresh
│   │       ├── data.py          # CRUD for actions/risks/deadlines/dependencies/scope
│   │       └── llm.py           # GET /llm/status, POST /llm/generate
│   ├── config/
│   │   └── settings.json        # Mutable runtime config (intake_folder_path, model_assignments) — gitignored
│   ├── data/
│   │   ├── project.db           # SQLite database — gitignored
│   │   ├── uploads/             # Uploaded + moved intake files — gitignored
│   │   └── chroma/              # ChromaDB vector index — gitignored
│   ├── migrate_document_types.py # One-time migration (already run — do not re-run)
│   └── requirements.txt
├── frontend/src/
│   ├── types/index.ts           # All TS interfaces incl. VectorStatus, RebuildResult
│   ├── lib/
│   │   ├── api.ts               # Full typed API client incl. getVectorStatus, rebuildVectorIndex
│   │   └── utils.ts
│   └── components/
│       ├── ui/                  # Badge, Button, Card (+ CardDescription), Pagination, Toast
│       ├── Sidebar.tsx
│       ├── UploadPanel.tsx      # Batch drag-drop + intake folder queue
│       ├── SettingsPage.tsx     # LLM Config tab includes Vector Search card
│       ├── ChatInterface.tsx    # Deep reasoning: model name + elapsed timer
│       ├── NotificationPanel.tsx
│       └── [5x]Table.tsx        # Actions/Risks/Deadlines/Dependencies/Scope — 50/page pagination
├── scripts/
│   ├── start_all.ps1
│   ├── start_backend.ps1
│   ├── status.ps1
│   ├── backup_data.ps1
│   ├── restore_backup.ps1
│   └── reset_data.ps1           # Clears DB + uploads + chroma/ vector index
├── tests/
│   ├── create_test_data.py      # Generates xlsx/docx/pdf test files
│   ├── test_batch_upload.py     # 26/26 integration tests (stdlib only)
│   └── test_vector_search.py    # Manual QA checklist (print-only, not automated)
└── docs/
```

## Database Schema (8 tables)
```sql
document_types: id, name, extraction_prompt, target_model (unused), is_system, created_at
documents:      id, filename, doc_type (legacy), document_type_id(FK), upload_date, content_text
actions:        id, description, owner, due_date, status, priority, created_from_doc_id
risks:          id, description, impact, likelihood, mitigation, status
deadlines:      id, description, deadline_date, met, source_doc_id
dependencies:   id, task_a, task_b, dependency_type (blocks/enables/relates_to), notes
scope_items:    id, description, source, approved, impact_assessment, added_date
notifications:  id, type, message, severity, read, created_at, related_id, related_type
```

## Critical Technical Notes

### Import alias — NEVER remove
```python
# backend/app/main.py
from app.routers import settings as settings_router
```
`settings = get_settings()` is defined at module level. Importing without alias overwrites it.

### ChromaDB version
```
chromadb==0.5.23
httpx>=0.27.0
```
- chromadb 0.4.x uses `np.float_` which was removed in NumPy 2.0 (required by Python 3.13)
- chromadb 0.5.0 also broken (same bug)
- 0.5.23 is the tested working version
- httpx must be >=0.27.0 (chromadb 0.5.23 dependency); was previously pinned to 0.25.1

### Vector service pattern
```python
# All vector operations go through VectorService
vs = VectorService(db_path=Path("backend/data"))  # creates chroma/ subdir
vs.embed_document(doc_id, content_text, metadata)  # returns bool
vs.search_documents(query, n_results=3)            # returns list[int] doc_ids
vs.delete_document(doc_id)                         # returns bool
vs.get_stats()                                     # returns {status, total_docs}
```
- Uses `requests` (sync) for Ollama `/api/embeddings` — VectorService is sync; route handlers using it must be `def` not `async def`
- All methods catch exceptions, log warnings, return False/[]/{error}/None — never raise
- Embedding requires nomic-embed-text pulled: `ollama pull nomic-embed-text`

### Q&A context building
`_build_context(question, db)` in `query.py`:
1. Tries vector search: embeds question, fetches top 3 docs from ChromaDB, formats as `"Document: {filename}\n{content}\n"` (8000 char budget)
2. Falls back to structured DB snapshot (actions/risks/deadlines/dependencies/scope) if vector empty or exception
Fallback is logged at WARNING level — non-fatal.

### content_text must be set before embedding
`extract_with_type()` now saves `doc.content_text` to SQLite before returning (needed for embedding step in `store_extracted_data()`). The previous bug: batch upload paths never set content_text, so embedding was always skipped.

### Dynamic model assignments (v3 schema)
```json
{
  "extraction": {"model": "gemma4:e4b",  "context": 8192,  "system_prompt": "...", "timeout": 120},
  "general":    {"model": "gemma4:e4b",  "context": 8192,  "system_prompt": "...", "timeout": 180},
  "reasoning":  {"model": "gemma4:31b",  "context": 16384, "system_prompt": "...", "timeout": 300}
}
```

### PowerShell script safety
- Never use em dashes (`—`) in .ps1 files — causes encoding parse errors
- Use plain hyphens (`-`) instead
- Process detection: use `Get-WmiObject Win32_Process` not `Get-Process | Where CommandLine`

### reset_data.ps1 clears 4 things
DB, uploads/, chroma/ vector index, and optionally stops Python processes first.

## API Endpoints Summary

**Documents:**
- `POST /documents/upload` — single-file upload
- `GET /documents` — list all; `DELETE /documents/{id}` (also removes from ChromaDB)
- `GET /documents/{id}/file` — download original file (FileResponse)
- `POST /documents/batch-upload` — multi-file FormData, sequential
- `GET /documents/intake-folder/scan` — list files in intake folder
- `POST /documents/batch-upload-intake` — process + move intake files (JSON paths)

**Settings:**
- `GET/POST /settings/document-types` — list/create types
- `PATCH/DELETE /settings/document-types/{id}` — update/delete (system types protected)
- `GET/POST/DELETE /settings/intake-folder` — get/set/clear intake folder
- `GET /settings/ollama/models` — list Ollama models
- `POST /settings/ollama/test` — test connection (never raises)
- `GET/POST /settings/model-assignments` — per-role {model, context, system_prompt, timeout}
- `POST /settings/ollama/pull` — pull a model (600s timeout, never raises)
- `GET /settings/vector-status` — {status, total_docs} (never raises)
- `POST /settings/rebuild-vector-index` — re-embeds all docs, returns {embedded, failed, total}

**Data CRUD:** `/actions`, `/risks`, `/deadlines`, `/dependencies`, `/scope-items` — GET/POST/PATCH/DELETE

**Other:** `POST /query`, `GET /notifications`, `POST /notifications/refresh`, `GET /llm/status`

## Startup Commands
```powershell
# Option A: separate terminals
cd C:\repos\pm_tool\backend
.venv\Scripts\uvicorn app.main:app --reload

cd C:\repos\pm_tool\frontend
npm run tauri dev

# Option B: script
.\scripts\start_all.ps1

# Integration tests (26 should pass)
cd C:\repos\pm_tool\tests
python test_batch_upload.py

# Manual vector search QA checklist
python test_vector_search.py
```

## Design Principles — Never Violate
- **GDPR Compliance:** All data local, no external API calls with user data
- **No Cloud LLMs:** Ollama on localhost:11434 only
- **No Emojis in PowerShell Scripts:** Encoding issues on Windows
- **Pagination always:** 50 items/page on all 5 data tables
- **Graceful degradation:** Vector search failure never breaks the app — falls back to structured DB context
- **Never raise from status endpoints:** /llm/status, /settings/vector-status always return valid JSON

## What's Next (Future Roadmap)
1. **Date range filters** — Last 30/90/365 days to complement pagination
2. **Archive completed items** — Auto-archive tasks done >6 months ago
3. **Server-side pagination** — Add limit/offset to backend for very large datasets
4. **Optimize notification generation** — Don't rescan everything every refresh
5. **SQLite encryption** — Deferred to Phase 2 (GDPR hardening)

## Platform
- **OS:** Windows 11
- **Python:** 3.13 (venv at `backend/.venv`)
- **Node.js:** 18+
- **Rust:** Latest stable (Tauri compilation — first run ~5min)
- **Ollama:** Latest, running as service
- **Models:** nomic-embed-text (embeddings), gemma4:e4b (extraction+general), gemma4:31b (reasoning)
