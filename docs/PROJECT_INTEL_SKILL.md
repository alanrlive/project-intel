# Project Intel V2 - Development Skill

## Overview
Self-hosted, GDPR-compliant AI project management assistant using local LLMs via Ollama. Desktop app (Tauri + React) with Python FastAPI backend. Extracts actions, risks, deadlines from uploaded documents and provides intelligent briefings, Q&A, and semantic document search.

## Tech Stack
- **Backend:** Python 3.13, FastAPI, SQLAlchemy 2.0.36, SQLite (WAL mode)
- **Frontend:** Tauri v2 (Rust), React 18, TypeScript, Tailwind CSS v4
- **LLM:** Ollama (localhost:11434) — model assignments dynamic (stored in settings.json, configurable via UI)
- **Vector Search:** ChromaDB 0.5.23 (local persistent store), nomic-embed-text embeddings via Ollama
- **Database:** SQLite with 8 tables (documents, document_types, actions, risks, deadlines, dependencies, scope_items, notifications)
- **Vector Store:** ChromaDB at backend/data/chroma/ (persistent, cleared by reset_data.ps1)

## Architecture
```
Tauri Desktop App
       | REST API (webview fetch)
FastAPI Backend (localhost:8000)
       |
Ollama LLM Service (localhost:11434)
       | generate/extract/reason + embeddings (nomic-embed-text)
       |
SQLite Database (backend/data/project.db)
ChromaDB Vector Index (backend/data/chroma/)
Uploads dir (backend/data/uploads/)
Mutable config (backend/config/settings.json)
```

## Key Design Principles
- **Privacy First:** All data and LLM processing stays local (GDPR compliant)
- **Structured Extraction:** LLM populates DB tables; vector search enhances Q&A context retrieval
- **Single Project Focus:** One instance = one project
- **No Emojis in Scripts:** All .ps1 files use text indicators `[OK]`, `[ERROR]`, `[INFO]`; never use em dashes either (encoding issues)
- **Pagination Required:** All 5 data tables paginate at 50 items/page
- **No External API Calls:** Ollama only; never add cloud LLM calls
- **Graceful Degradation:** Vector search failure never breaks the app; always falls back to structured DB context

## Project Structure
```
pm_tool/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI entry, CORS, lifespan; settings_router alias
│   │   ├── config.py            # pydantic-settings + read_app_config/write_app_config
│   │   ├── database.py          # SQLite engine, WAL, FK enforcement, get_db()
│   │   ├── models.py            # 8 SQLAlchemy models
│   │   ├── llm_service.py       # OllamaService — extract/general/reason, fallback logic
│   │   ├── vector_service.py    # VectorService — ChromaDB + nomic-embed-text embeddings
│   │   ├── document_processor.py # Text extraction + extract_with_type() + store_extracted_data()
│   │   ├── notification_service.py # generate_daily_briefing()
│   │   ├── scheduler.py         # APScheduler cron
│   │   └── routers/
│   │       ├── documents.py     # Upload, batch-upload, intake; DELETE syncs ChromaDB
│   │       ├── settings.py      # Doc types CRUD, ollama, intake-folder, model-assignments, vector
│   │       ├── query.py         # POST /query — vector search first, structured DB fallback
│   │       ├── notifications.py # GET/POST/PATCH/DELETE
│   │       ├── data.py          # CRUD for actions/risks/deadlines/dependencies/scope
│   │       └── llm.py           # GET /llm/status, POST /llm/generate
│   ├── config/
│   │   └── settings.json        # Mutable runtime config — gitignored
│   ├── data/
│   │   ├── project.db           # SQLite database — gitignored
│   │   ├── uploads/             # Uploaded + intake-moved files — gitignored
│   │   └── chroma/              # ChromaDB vector index — gitignored
│   ├── migrate_document_types.py # One-time idempotent migration (already run)
│   └── requirements.txt
├── frontend/src/
│   ├── App.tsx
│   ├── types/index.ts           # All TS interfaces incl. VectorStatus, RebuildResult
│   ├── lib/
│   │   ├── api.ts               # Typed API client (all endpoints incl. vector)
│   │   └── utils.ts             # cn(), formatDate(), daysUntil(), dueDateLabel()
│   └── components/
│       ├── ui/                  # Badge, Button, Card (+CardDescription), Pagination, Toast
│       ├── Sidebar.tsx
│       ├── UploadPanel.tsx      # Batch drag-drop + intake folder button, queue UI
│       ├── SettingsPage.tsx     # LLM Config tab includes Vector Search card
│       ├── ChatInterface.tsx    # Thread UI, deep reasoning toggle + elapsed timer, citations
│       ├── NotificationPanel.tsx
│       ├── ActionsTable.tsx
│       ├── RisksTable.tsx
│       ├── DeadlinesTable.tsx
│       ├── DependenciesTable.tsx
│       └── ScopeTable.tsx
├── scripts/
│   ├── start_all.ps1            # Opens backend + frontend in separate windows
│   ├── start_backend.ps1
│   ├── status.ps1               # Shows DB counts
│   ├── backup_data.ps1
│   ├── restore_backup.ps1
│   └── reset_data.ps1           # Clears DB + uploads + chroma/ vector index
├── tests/
│   ├── create_test_data.py      # Generates raid_example.xlsx, meeting_notes.docx, budget_overview.pdf
│   ├── test_batch_upload.py     # 26/26 integration tests (stdlib only, no pytest)
│   └── test_vector_search.py    # Manual QA checklist (run to print steps)
└── docs/
```

## LLM Strategy
- **Dynamic model assignments** — no hardcoded model names anywhere in codebase
- Three roles: `extraction`, `general`, `reasoning` (note: was `qa`, renamed to `general`)
- Per-role schema (v3): `{model, context, system_prompt, timeout}`
- Context window (`num_ctx`) configurable: 4096 / 8192 / 16384 / 32768 tokens
- System prompt per role sent as Ollama `system` field on every call
- Timeout per role: extraction 120s, general 180s, reasoning 300s
- `_normalise_assignment()` backward compat: coerces `str` → v1, `{model,context}` → v2, full dict → v3
- Old `"qa"` key in settings.json migrated to `"general"` on read
- `Settings` class has NO `llm_*` fields — `extra = "ignore"` handles stale `.env` vars
- `validate_assignments()` runs async at startup — warns on missing models, never crashes
- Embedding model: nomic-embed-text (separate from LLM roles; called via /api/embeddings not /api/generate)

## Vector Search Strategy
- Documents embedded on upload via `store_extracted_data()` → `VectorService.embed_document()`
- `_build_context(question, db)` in query.py: tries vector search first, falls back to structured DB
- Vector context format: `"Document: {filename}\n{content}\n"` — 8000 char budget across 3 docs
- Delete synced: `DELETE /documents/{id}` also calls `vector_service.delete_document()`
- Rebuild available: `POST /settings/rebuild-vector-index` re-embeds all docs with content_text
- Status: `GET /settings/vector-status` → `{status, total_docs}` (never raises)
- UI: Settings > LLM Config > Vector Search card shows status dot + doc count + rebuild button
- **VectorService is sync** (uses `requests` not httpx) — route handlers that call it should be `def`

## Database Schema
```sql
document_types: id, name, extraction_prompt, target_model (unused), is_system, created_at
documents:      id, filename, doc_type, document_type_id(FK), upload_date, content_text
actions:        id, description, owner, due_date, status, priority, created_from_doc_id
risks:          id, description, impact, likelihood, mitigation, status
deadlines:      id, description, deadline_date, met, source_doc_id
dependencies:   id, task_a, task_b, dependency_type (blocks/enables/relates_to), notes
scope_items:    id, description, source, approved, impact_assessment, added_date
notifications:  id, type, message, severity, read, created_at, related_id, related_type
```

## API Endpoints

### Documents
- `POST /documents/upload` — single-file upload (uses built-in prompt)
- `GET /documents` — list all
- `DELETE /documents/{id}` — delete document + remove from ChromaDB
- `GET /documents/{id}/file` — download original file (FileResponse)
- `POST /documents/batch-upload` — multi-file FormData, sequential, per-file result
- `GET /documents/intake-folder/scan` — list files in configured intake folder
- `POST /documents/batch-upload-intake` — process intake files by path (JSON), move on success

### Settings
- `GET /settings/document-types` — list all document types
- `POST /settings/document-types` — create custom type
- `PATCH /settings/document-types/{id}` — update (system types protected)
- `DELETE /settings/document-types/{id}` — delete (system types + referenced docs protected)
- `GET /settings/intake-folder` — get configured path
- `POST /settings/intake-folder` — set path
- `DELETE /settings/intake-folder` — clear path
- `GET /settings/ollama/models` — list available Ollama models
- `POST /settings/ollama/test` — test connection (never raises)
- `GET /settings/model-assignments` — get per-role {model, context, system_prompt, timeout}
- `POST /settings/model-assignments` — save assignments
- `POST /settings/ollama/pull` — pull a model (600s timeout, never raises)
- `GET /settings/vector-status` — {status: "connected"|"disconnected", total_docs: int} (never raises)
- `POST /settings/rebuild-vector-index` — re-embeds all docs, returns {status, embedded, failed, total}

### Other
- `GET /actions`, `POST /actions`, `PATCH /actions/{id}`, `DELETE /actions/{id}` (same for risks/deadlines/dependencies/scope-items)
- `GET /notifications`, `POST /notifications/refresh`, `PATCH /notifications/{id}/read`, `POST /notifications/read-all`
- `POST /query` — vector search first, structured DB fallback, then LLM
- `GET /llm/status` — Ollama + model availability

## Critical Technical Notes

### Import alias in main.py
```python
from app.routers import settings as settings_router  # NOT "import settings"
app.include_router(settings_router.router)
```
`settings = get_settings()` is already defined at module level — importing the router module as `settings` would overwrite it.

### ChromaDB compatibility
```
chromadb==0.5.23   # pinned — 0.4.x and 0.5.0 broken with NumPy 2.0 (required by Python 3.13)
httpx>=0.27.0      # unpinned — chromadb 0.5.23 requires >=0.27.0
```

### content_text must be set before embedding
`extract_with_type()` saves `doc.content_text` to SQLite before returning. Without this, batch upload paths left content_text as None and embedding was silently skipped.

### VectorService is synchronous
Uses `requests` library (blocking). Route handlers calling VectorService should be `def` not `async def`. FastAPI runs `def` handlers in a thread pool automatically.

### Intake folder pattern
- Path stored in `backend/config/settings.json`
- Frontend sends file paths as JSON (not file bytes) — backend reads from disk
- Security: backend validates path is inside configured intake folder
- On success: `shutil.move()` to `backend/data/uploads/` with `_unique_dest()` (timestamp dedup)

### Model assignments (settings.json v3 schema)
```json
"model_assignments": {
  "extraction": {"model": "gemma4:e4b",  "context": 8192,  "system_prompt": "...", "timeout": 120},
  "general":    {"model": "gemma4:e4b",  "context": 8192,  "system_prompt": "...", "timeout": 180},
  "reasoning":  {"model": "gemma4:31b",  "context": 16384, "system_prompt": "...", "timeout": 300}
}
```

### System type seeding
`_seed_system_types()` in `database.py` runs on every backend startup. INSERT-or-UPDATE so prompt changes in code apply to existing DBs.

### Extraction status fields
`store_extracted_data()` in `document_processor.py`:
- `action.status`: validated against `{"open","done","cancelled"}`, fallback `"open"`
- `risk.status`: validated against `{"open","closed"}`, fallback `"open"`
- `deadline.met`: `bool(item.get("met", False))`

### PowerShell script rules
- Never use em dashes or curly quotes — causes parse errors on Windows
- Process detection: use `Get-WmiObject Win32_Process` (has CommandLine property)
- `Get-Process` does NOT expose CommandLine on Windows

### pydantic Settings
`Settings` class only has: `project_name`, `database_url`, `ollama_base_url`, `briefing_hour/minute`.
`extra = "ignore"` set — stale `.env` vars don't cause `ValidationError`.

## Development Commands
```powershell
# Terminal 1 — backend
cd C:\repos\pm_tool\backend
.venv\Scripts\uvicorn app.main:app --reload

# Terminal 2 — frontend (first run ~5min Rust compile)
cd C:\repos\pm_tool\frontend
npm run tauri dev

# Or: open both in separate windows
.\scripts\start_all.ps1

# Integration tests (26/26)
cd C:\repos\pm_tool\tests
python test_batch_upload.py

# Vector search QA checklist
python test_vector_search.py

# Reset all data (DB + uploads + vector index)
.\scripts\reset_data.ps1
```

## Security Features
- CSP: `connect-src 'self' http://localhost:8000` (blocks external requests)
- CORS: Restricted methods: GET/POST/PATCH/DELETE only
- Intake folder: backend validates file is inside configured path
- No file paths in document API responses
- `.gitignore`: Excludes .env, backend/data/, backend/config/, .venv, node_modules/, target/

## System Requirements
- **Minimum:** 8GB RAM
- **Recommended:** 16GB RAM
- **Disk:** 25GB (15GB Ollama models + 5GB app/data)
- **OS:** Windows 10/11
- **Models required:** nomic-embed-text (embeddings) + at least one chat model

## Never Do
- Add external LLM API calls (breaks GDPR compliance)
- Use emojis or em dashes in PowerShell scripts (encoding issues)
- Load all table data without pagination (breaks at scale)
- Commit .env, database, settings.json, chroma/, or .venv to git
- Pin httpx below 0.27.0 (conflicts with chromadb 0.5.23)
- Use chromadb < 0.5.23 (numpy 2.0 incompatibility with Python 3.13)
- Import the settings router module without the `settings_router` alias
- Make VectorService methods async (it uses sync requests library)

## Quick Reference
- Backend Swagger: http://localhost:8000/docs
- Frontend: Opens as Tauri window (not browser)
- Ollama: http://localhost:11434
- Vector status: `curl http://localhost:8000/settings/vector-status`
