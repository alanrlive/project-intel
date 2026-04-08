HANDOFF PROMPT - Copy Everything Below
markdown# Project Intel V2 - Development Handoff

## Project Overview
I'm building a GDPR-compliant, self-hosted AI-powered project management assistant called **Project Intel V2**. The tool uses local LLMs (Ollama) to analyze project documents, track tasks, detect risks, and provide intelligent briefings. All data stays on-device — no cloud, no external APIs.

## Current Status: WORKING PRODUCTION APP ✅

### What's Complete (as of 2026-04-08)
- **Backend (FastAPI + SQLite):** 8 tables, 7 router modules
- **Frontend (Tauri v2 + React):** 8 views including Settings with 4 tabs
- **LLM Integration (Ollama):** Dynamic model assignments — model, context, system prompt, and timeout per role; no hardcoded model names anywhere
- **Features Working:**
  - Batch document upload (drag-and-drop, multi-file queue, per-file type selection)
  - Excel support (.xlsx → all sheets → markdown tables via openpyxl)
  - Custom document types with per-type extraction prompts (model selection removed — uses extraction role)
  - Intake folder: configure a watched folder, scan it, batch-process files by path, auto-move on success
  - Automatic structured extraction (actions, risks, deadlines, dependencies, scope items)
  - Status fields preserved from LLM: actions get done/cancelled/open, risks get closed/open, deadlines get met=true/false
  - Daily briefing with smart notifications (overdue, upcoming, high-risk)
  - Conversational Q&A chat: deep reasoning toggle shows actual configured model name, elapsed timer during reasoning
  - All 5 data tables: CRUD, sort, CSV export, source document download links, pagination (50/page)
  - Due dates show both relative label ("14d overdue") AND actual date below it
  - Settings page: Document Types CRUD, Folders/intake config, LLM Config (model + context + system prompt + timeout per role), About
  - Integration tests: 26/26 passing

## Tech Stack
**Backend:**
- Python 3.11+, FastAPI, SQLAlchemy 2.0.36, SQLite (WAL mode, FK enforcement)
- Ollama for local LLM inference (localhost:11434)
- openpyxl (Excel), PyPDF2, python-docx for document parsing
- APScheduler for daily briefing cron
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
│   │   ├── llm_service.py       # OllamaService — extract/chat/reason, status_report()
│   │   ├── document_processor.py # extract_text(), extract_with_type(), _excel_to_markdown()
│   │   ├── notification_service.py # generate_daily_briefing()
│   │   ├── scheduler.py         # APScheduler cron
│   │   └── routers/
│   │       ├── documents.py     # /documents — upload, batch-upload, intake-folder scan/process
│   │       ├── settings.py      # /settings — document-types CRUD, ollama test, intake-folder
│   │       ├── query.py         # /query — dual-path Q&A
│   │       ├── notifications.py # /notifications — CRUD + refresh
│   │       ├── data.py          # /actions, /risks, /deadlines, /dependencies, /scope-items
│   │       └── llm.py           # /llm/status, /llm/generate
│   ├── config/
│   │   └── settings.json        # Mutable runtime config (intake_folder_path) — gitignored
│   ├── data/
│   │   ├── project.db           # SQLite database — gitignored
│   │   └── uploads/             # Uploaded + moved intake files — gitignored
│   ├── migrate_document_types.py # One-time migration (already run — do not re-run)
│   └── requirements.txt
├── frontend/src/
│   ├── types/index.ts           # All TS interfaces
│   ├── lib/
│   │   ├── api.ts               # Full typed API client
│   │   └── utils.ts
│   └── components/
│       ├── ui/                  # Badge, Button, Card, Pagination, Toast
│       ├── Sidebar.tsx          # Nav + Settings gear (bottom)
│       ├── UploadPanel.tsx      # Batch drag-drop + intake folder queue
│       ├── SettingsPage.tsx     # 4-tab settings UI
│       ├── ChatInterface.tsx
│       ├── NotificationPanel.tsx
│       ├── ActionsTable.tsx     # All 5 tables have 50/page pagination
│       ├── RisksTable.tsx
│       ├── DeadlinesTable.tsx
│       ├── DependenciesTable.tsx
│       └── ScopeTable.tsx
├── scripts/
│   ├── start_all.ps1            # Open backend + frontend in separate windows
│   ├── start_backend.ps1
│   ├── status.ps1               # Shows DB counts including doc_types
│   ├── backup_data.ps1
│   └── reset_data.ps1
├── tests/
│   ├── create_test_data.py      # Generates xlsx/docx/pdf test files
│   └── test_batch_upload.py     # 26/26 integration tests (stdlib only)
└── docs/
```

## Database Schema (8 tables)
```sql
document_types: id, name, extraction_prompt, target_model, is_system, created_at
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
`settings = get_settings()` is defined at module level. Importing the router module without the alias overwrites it → 500 errors on every request.

### Intake folder pattern
- Path stored in `backend/config/settings.json` via `read_app_config()`/`write_app_config()`
- Frontend sends file paths as JSON (not file bytes) — backend reads files from disk
- Security: backend validates each path is inside configured intake folder before reading
- On success: `shutil.move()` to `uploads/` with `_unique_dest()` (timestamp-based dedup)
- Frontend uses `new File([], filename)` as display stub (no real bytes needed in browser)
- "Load from Intake Folder" replaces prior intake entries (no duplicates): filters `!e.fromIntakePath` before adding new ones

### Dynamic model assignments (v3 schema)
Settings.json `model_assignments` schema — each role has 4 fields:
```json
{
  "extraction": {"model": "gemma4:e4b",  "context": 8192,  "system_prompt": "...", "timeout": 120},
  "general":    {"model": "gemma4:e4b",  "context": 8192,  "system_prompt": "...", "timeout": 180},
  "reasoning":  {"model": "gemma4:31b",  "context": 16384, "system_prompt": "...", "timeout": 300}
}
```
- `_normalise_assignment()` backward compat: coerces old `str` or `{model, context}` dict to full v3 shape
- Old `"qa"` key migrated to `"general"` on read
- `Settings` class no longer has `llm_*` fields — `extra = "ignore"` handles stale `.env` vars
- `get_model_assignments()` reads `_FALLBACK_MODELS` dict if nothing in settings.json
- `generate()` in `llm_service.py` accepts `system` (sent as Ollama `system` field) and `timeout` params
- All three role methods (`extract`, `general`, `reason`) pass role cfg values at call time
- `validate_assignments()` runs at startup — logs warnings for missing models, never raises
- `extract_with_type()` uses extraction role for model/context/system — `target_model` on `DocumentType` is now unused/ignored
- UI: LLM Config tab shows model + context + system prompt textarea + timeout (future) per role

### System type seeding
`_seed_system_types()` in `database.py` runs at every startup via `init_db()`. INSERT-or-UPDATE — prompt changes apply to existing DBs without migration.

### Extraction status fields
`store_extracted_data()` in `document_processor.py` preserves LLM-returned status values:
- `action.status`: must be in `{"open","done","cancelled"}` — fallback `"open"`
- `risk.status`: must be in `{"open","closed"}` — fallback `"open"`
- `deadline.met`: `bool(item.get("met", False))`

### Model name resolution
Ollama returns `"gemma4:e4b"` — stored configs may omit tag.
`_resolve_model()` in `llm_service.py`: exact match → prefix match → first available → error.

### pydantic Settings — no llm_* fields
`Settings` class only has `project_name`, `database_url`, `ollama_base_url`, `briefing_hour/minute`.
`extra = "ignore"` set so stale `.env` vars (`LLM_QA` etc.) don't cause `ValidationError` on startup.

## Startup Commands
```powershell
# Option A: separate terminals
cd C:\repos\pm_tool\backend
.venv\Scripts\uvicorn app.main:app --reload

cd C:\repos\pm_tool\frontend
npm run tauri dev

# Option B: script (opens both in separate windows)
.\scripts\start_all.ps1

# Run integration tests (all 26 should pass)
cd C:\repos\pm_tool\tests
python test_batch_upload.py
```

## API Endpoints Summary

**Documents:**
- `POST /documents/upload` — legacy single-file upload
- `GET /documents` — list all; `DELETE /documents/{id}`
- `GET /documents/{id}/file` — download original file (FileResponse)
- `POST /documents/batch-upload` — multi-file FormData, sequential
- `GET /documents/intake-folder/scan` — list files in intake folder
- `POST /documents/batch-upload-intake` — process + move intake files (JSON paths)

**Settings:**
- `GET/POST /settings/document-types` — list/create types
- `PATCH/DELETE /settings/document-types/{id}` — update/delete (system types protected)
- `GET/POST/DELETE /settings/intake-folder` — get/set/clear intake folder path
- `GET /settings/ollama/models` — list Ollama models
- `POST /settings/ollama/test` — test connection (never raises)
- `GET/POST /settings/model-assignments` — get/save per-role `{model, context, system_prompt, timeout}` assignments
- `POST /settings/ollama/pull` — pull a model (600s timeout, never raises)

**Data CRUD:** `/actions`, `/risks`, `/deadlines`, `/dependencies`, `/scope-items` — GET/POST/PATCH/DELETE

**Other:** `POST /query`, `GET /notifications`, `POST /notifications/refresh`, `GET /llm/status`

## What Was Built (Session History)

### Dynamic Model Config v2 + Timeouts (2026-04-08)
- **`qa` → `general` rename:** All code, types, settings.json schema, UI updated. Backward compat: old `"qa"` key in settings.json migrated to `"general"` on read.
- **`system_prompt` per role:** Stored in settings.json, passed to Ollama `/api/generate` as `system` field. Configurable via textarea in LLM Config tab (2000 char limit, char counter, save blocked if over).
- **`timeout` per role:** Defaults: extraction 120s, general 180s, reasoning 300s. Stored in settings.json, used as httpx client timeout. Fixes gemma4:31b timing out.
- **`target_model` removed from document types:** `extract_with_type()` now always uses the extraction role assignment. `DocumentType.target_model` field still exists in DB but is unused. Create/edit forms no longer show it.
- **Pydantic fix:** `Settings` class no longer has `llm_*` fields. `extra = "ignore"` added so stale `.env` vars don't crash startup.
- **`validate_assignments()` on startup:** Checks each configured model against Ollama's installed list at startup. Logs warnings, never raises.
- **Chat UI:** Deep reasoning checkbox now shows actual configured model name (loaded via `api.getModelAssignments()`). Elapsed timer shows during reasoning: `⚡ Deep reasoning in progress… 47s`.

### Bug Fixes & Extraction Improvements (2026-04-07)
- **Ollama banner bug:** `/llm/status` threw `TypeError` after model assignments changed from flat strings to `{model, context}` dicts — `assignments.values()` was passed directly to `is_ready(str)`. Fixed to use `cfg["model"]`.
- **Extraction status fields:** `store_extracted_data()` was hardcoding `status="open"` and omitting `met` — now reads LLM output with validation fallback.
- **General prompt updated:** Added `status` to actions/risks, `met` to deadlines, STATUS inference rules covering narrative text.
- **RAID Log prompt updated:** Same status fields, streamlined wording, removed `notes` from dependencies.
- **Due date display:** `dueDateLabel()` now returns `{label, date, urgent}` — data tables show relative label + actual date as subtitle for overdue/near-future items.

### Dynamic Model Configuration (2026-04-06)
- Removed all hardcoded model names from codebase
- `settings.json` `model_assignments` schema: `{extraction, qa, reasoning}` each `{model: str, context: int}`
- `_normalise_assignment()` backward compat for old flat-string format
- `num_ctx` per role passed to Ollama `/api/generate` options
- `GET/POST /settings/model-assignments`, `POST /settings/ollama/pull` endpoints
- LLM Config tab in SettingsPage: model + context dropdowns per role, pull buttons, installed model list with role badges, RAM warning at 32k ctx

### Table Enhancements (2026-04-06)
- All 5 data tables: sortable columns (`SortTh` component), CSV export, source document column with file download
- `frontend/src/lib/tableUtils.tsx`: `SortTh`, `applySort()`, `exportCsv()`, `downloadDocumentFile()`
- Risks and Dependencies converted from card layout to table layout
- `GET /documents/{id}/file` backend endpoint (FileResponse)

### Excel All-Sheets (2026-04-06)
- `_excel_to_markdown()` now iterates all sheets (`wb.sheetnames`), output separated by `## SheetName` headings

### FK Constraint & Duplicate Fixes (2026-04-06)
- `_seed_system_types()` in `database.py`: idempotent INSERT+UPDATE on every startup
- `generalId: number | null` in UploadPanel — prevents `typeId=0` FK violation on fresh DB
- Type_id pre-flight validation in both batch upload endpoints
- Intake "Load" replaces prior intake entries instead of appending

### Intake Folder Feature (2026-04-06)
- `GET/POST/DELETE /settings/intake-folder` endpoints in settings.py
- `GET /documents/intake-folder/scan` — reads config, lists matching files, returns `{configured, path, files[], error?}`
- `POST /documents/batch-upload-intake` — validates path inside intake folder, reads+moves file, calls `extract_with_type()`
- `read_app_config()`/`write_app_config()` helpers in config.py using `backend/config/settings.json`
- SettingsPage: Folders tab — path input, save/clear/scan buttons, inline scan results
- UploadPanel: "Load from Intake Folder" button, `fromIntakePath` on QueueEntry, `processAll()` splits batch into intake-JSON + browser-FormData paths

### Batch Upload + Document Types (2026-04-05)
- `DocumentType` model (8th table), `document_type_id` FK on `Document`
- Migration script `migrate_document_types.py` — seeds 5 system types, already run
- `extract_with_type()` — loads per-type prompt+model from DB
- `_excel_to_markdown()` — openpyxl first-sheet to markdown table
- `POST /documents/batch-upload` — sequential multi-file with per-file results
- Settings API router (document types CRUD + Ollama test)
- SettingsPage with 4 tabs: Document Types, Folders, LLM Configuration, About
- UploadPanel rewrite: drag-drop fixed (relatedTarget check), multi-file queue, type selector
- `tests/create_test_data.py` + `tests/test_batch_upload.py` (26/26)

### Earlier Sessions
- All 5 data tables with 50/page pagination (shared Pagination component)
- Full CRUD for all entity types
- Daily briefing (APScheduler), notifications panel
- Q&A chat (dual-path: structured DB / LLM), deep reasoning toggle, citations
- Sidebar: Ollama status dot, unread notification badge, Settings gear at bottom

## Design Principles — Never Violate
- **GDPR Compliance:** All data local, no external API calls with user data
- **No Cloud LLMs:** Ollama on localhost:11434 only
- **No Emojis in PowerShell Scripts:** Encoding issues on Windows — use `[OK]`, `[ERROR]`
- **Pagination always:** 50 items/page on all 5 data tables
- **Structured extraction over RAG:** LLM populates DB tables

## What's Next (Future Roadmap)
1. **Date range filters** — Last 30/90/365 days to complement pagination
2. **Archive completed items** — Auto-archive tasks done >6 months ago
3. **Server-side pagination** — Add `limit`/`offset` to backend for very large datasets
4. **Vector search for chat** — Better context retrieval for Q&A
5. **Optimize notification generation** — Don't rescan everything every refresh
6. **SQLite encryption** — Deferred to Phase 2 (GDPR hardening)

## Platform
- **OS:** Windows 11
- **Python:** 3.13 (venv at `backend/.venv`) — SQLAlchemy pinned to 2.0.36
- **Node.js:** 18+
- **Rust:** Latest stable (for Tauri compilation — first run ~5min)
- **Ollama:** Latest, running as service

## Success Criteria
App is working correctly if:
- ✅ Batch upload (drag-drop) extracts actions/risks/deadlines from PDF/DOCX/XLSX/TXT
- ✅ Intake folder: scan shows pending files, Process All moves them and extracts
- ✅ Settings: custom document types can be created, edited, deleted
- ✅ LLM status shows Ollama connected with available models
- ✅ All 5 data tables show with pagination controls
- ✅ Daily briefing shows overdue/upcoming items
- ✅ Chat answers questions about project with citations
- ✅ All 26 integration tests pass: `python tests/test_batch_upload.py`
- ✅ No data leaves localhost

## Security
- CSP: `connect-src 'self' http://localhost:8000`
- CORS: Methods locked to GET/POST/PATCH/DELETE
- Intake folder: path validated against configured base dir before reading
- No file_path in document API responses
- `.gitignore`: backend/data/, backend/config/, .venv, node_modules/, target/
