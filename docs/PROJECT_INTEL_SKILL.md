# Project Intel V2 - Development Skill

## Overview
Self-hosted, GDPR-compliant AI project management assistant using local LLMs via Ollama. Desktop app (Tauri + React) with Python FastAPI backend. Extracts actions, risks, deadlines from uploaded documents and provides intelligent briefings and Q&A.

## Tech Stack
- **Backend:** Python 3.11+, FastAPI, SQLAlchemy 2.0.36, SQLite (WAL mode)
- **Frontend:** Tauri v2 (Rust), React 18, TypeScript, Tailwind CSS v4
- **LLM:** Ollama (localhost:11434) — mistral-nemo, llama3.1, deepseek-r1
- **Database:** SQLite with 8 tables (documents, document_types, actions, risks, deadlines, dependencies, scope_items, notifications)

## Architecture
```
Tauri Desktop App
       ↓ REST API (webview fetch)
FastAPI Backend (localhost:8000)
       ↓
Ollama LLM Service (localhost:11434)
       ↓
SQLite Database (backend/data/project.db)
Uploads dir (backend/data/uploads/)
Mutable config (backend/config/settings.json)
```

## Key Design Principles
- **Privacy First:** All data and LLM processing stays local (GDPR compliant)
- **Structured Extraction:** LLM populates DB tables (not RAG/vector search)
- **Single Project Focus:** One instance = one project (simplified architecture)
- **No Emojis in Scripts:** All .ps1 files use text indicators `[OK]`, `[ERROR]`, `[INFO]`
- **Pagination Required:** All 5 data tables paginate at 50 items/page (Actions, Risks, Deadlines, Dependencies, Scope Items)
- **No External API Calls:** Ollama only; never add cloud LLM calls

## Project Structure
```
pm_tool/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI entry, CORS, lifespan; settings_router alias
│   │   ├── config.py            # pydantic-settings + read_app_config/write_app_config
│   │   ├── database.py          # SQLite engine, WAL, FK enforcement, get_db()
│   │   ├── models.py            # 8 SQLAlchemy models
│   │   ├── llm_service.py       # OllamaService — extract/chat/reason, fallback logic
│   │   ├── document_processor.py # Text extraction + extract_with_type()
│   │   ├── notification_service.py # generate_daily_briefing()
│   │   ├── scheduler.py         # APScheduler cron at briefing_hour:briefing_minute
│   │   └── routers/
│   │       ├── documents.py     # Upload, batch-upload, intake-folder scan/process
│   │       ├── settings.py      # Document types CRUD, ollama test, intake-folder
│   │       ├── query.py         # POST /query (dual-path: DB or LLM)
│   │       ├── notifications.py # GET/POST/PATCH/DELETE
│   │       ├── data.py          # CRUD for actions/risks/deadlines/dependencies/scope
│   │       └── llm.py           # GET /llm/status, POST /llm/generate
│   ├── config/
│   │   └── settings.json        # Mutable runtime config (intake_folder_path) — gitignored
│   ├── data/
│   │   ├── project.db           # SQLite database — gitignored
│   │   ├── uploads/             # Uploaded + intake-moved files — gitignored
│   │   └── backups/             # Migration backups — gitignored
│   ├── migrate_document_types.py # One-time idempotent migration (already run)
│   └── requirements.txt
├── frontend/src/
│   ├── App.tsx
│   ├── types/index.ts           # All TS interfaces
│   ├── lib/
│   │   ├── api.ts               # Typed API client (all endpoints)
│   │   └── utils.ts             # cn(), formatDate(), daysUntil(), dueDateLabel()
│   └── components/
│       ├── ui/                  # Badge, Button, Card, Pagination, Toast
│       ├── Sidebar.tsx          # Nav with unread badge, Ollama status dot, Settings
│       ├── UploadPanel.tsx      # Batch drag-drop + intake folder button, queue UI
│       ├── SettingsPage.tsx     # 4-tab settings (Document Types, Folders, LLM, About)
│       ├── ChatInterface.tsx    # Thread UI, deep reasoning toggle, citations
│       ├── NotificationPanel.tsx
│       ├── ActionsTable.tsx
│       ├── RisksTable.tsx
│       ├── DeadlinesTable.tsx
│       ├── DependenciesTable.tsx
│       └── ScopeTable.tsx
├── scripts/                     # PowerShell mgmt (start/stop/backup/reset/status)
│   └── start_all.ps1            # Opens backend + frontend in separate windows
├── tests/
│   ├── create_test_data.py      # Generates raid_example.xlsx, meeting_notes.docx, budget_overview.pdf
│   └── test_batch_upload.py     # 26/26 integration tests (stdlib only, no pytest)
└── docs/
```

## LLM Strategy
- **mistral-nemo 12B:** Fast structured extraction (actions, risks, deadlines)
- **llama3.1 8B:** General Q&A, summaries
- **deepseek-r1 7B:** Deep reasoning, scope creep analysis, impact assessment
- Model name resolution: exact match first, then prefix match (e.g. `"mistral-nemo"` → `"mistral-nemo:latest"`)

## Database Schema
```sql
document_types: id, name, extraction_prompt, target_model, is_system, created_at
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
- `POST /documents/upload` — legacy single-file upload (uses built-in prompt)
- `GET /documents` — list all documents
- `DELETE /documents/{id}` — delete document
- `POST /documents/batch-upload` — multi-file FormData, sequential, per-file result
- `GET /documents/intake-folder/scan` — list files in configured intake folder
- `POST /documents/batch-upload-intake` — process intake files by path (JSON), move on success

### Settings
- `GET /settings/document-types` — list all document types
- `POST /settings/document-types` — create custom type
- `PATCH /settings/document-types/{id}` — update (system types protected)
- `DELETE /settings/document-types/{id}` — delete (system types + referenced docs protected)
- `GET /settings/intake-folder` — get configured path (`{path: string|null}`)
- `POST /settings/intake-folder` — set path (`{path: string}`)
- `DELETE /settings/intake-folder` — clear path
- `GET /settings/ollama/models` — list available Ollama models
- `POST /settings/ollama/test` — test connection (never raises, returns status object)

### Other
- `GET /actions`, `POST /actions`, `PATCH /actions/{id}`, `DELETE /actions/{id}` (similar for risks/deadlines/dependencies/scope-items)
- `GET /notifications`, `POST /notifications/refresh`, `PATCH /notifications/{id}/read`, `POST /notifications/read-all`
- `POST /query` — dual-path: structured DB query for simple questions, LLM for complex
- `GET /llm/status` — Ollama status + model availability

## Critical Technical Notes

### Import alias in main.py
```python
from app.routers import settings as settings_router  # NOT "import settings"
app.include_router(settings_router.router)
```
`settings = get_settings()` is already defined at module level — importing the router module as `settings` would overwrite it.

### Intake folder pattern
- Backend stores path in `backend/config/settings.json` via `read_app_config()`/`write_app_config()`
- Frontend sends file paths as JSON (not bytes) — backend reads from disk
- Security: backend validates path is inside configured intake folder before processing
- On success: `shutil.move()` to `backend/data/uploads/` with timestamp-dedup via `_unique_dest()`
- Frontend creates `new File([], filename)` as display-only stub (no real bytes)

### Mutable config
```python
# backend/app/config.py
CONFIG_DIR = Path(__file__).resolve().parent.parent.parent / "config"
APP_CONFIG_FILE = CONFIG_DIR / "settings.json"

def read_app_config() -> dict: ...
def write_app_config(data: dict): ...
```

### pydantic Settings fields
Use `llm_*` prefix (not `model_*`) — `model_` is a protected namespace in pydantic v2.

### Tauri CSP / fetch
Frontend uses native `webview fetch()` — no `core:fetch:*` Tauri capability needed.
CSP in `tauri.conf.json`: `connect-src` restricted to `localhost:8000`.

### Drag-and-drop fix
Requires `onDragEnter` (was missing), stable `useCallback` handlers, and `relatedTarget` check in `onDragLeave`:
```typescript
if (!zone.contains(e.relatedTarget as Node)) setDragging(false)
```

### processAll split logic
UploadPanel splits queue: `intakeQueued` (JSON paths → `uploadBatchIntake`) and `browserQueued` (FormData → `uploadBatch`). Results merged back via `Map<entry.id, result>`.

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

# Generate test files
python create_test_data.py
```

## Security Features
- CSP: `connect-src 'self' http://localhost:8000` (blocks external requests)
- CORS: Restricted methods: GET/POST/PATCH/DELETE only
- Intake folder: backend validates file is inside configured path before reading
- No file paths in document API responses
- `.gitignore`: Excludes .env, backend/data/, backend/config/, .venv, node_modules/, target/

## System Requirements
- **Minimum:** 8GB RAM (slow, one model at a time)
- **Recommended:** 16GB RAM (smooth, multi-model)
- **Disk:** 25GB (15GB Ollama models + 5GB app/data)
- **OS:** Windows 10/11, macOS 12+, Linux (Ubuntu 20.04+)

## Never Do
- Add external LLM API calls (breaks GDPR compliance)
- Use emojis in PowerShell scripts (encoding issues)
- Load all table data without pagination (breaks at scale)
- Commit .env, database, settings.json, or .venv to git
- Bypass CSP or CORS restrictions
- Import the settings router module without the `settings_router` alias

## Quick Reference
- Repo: https://github.com/alanrlive/project-intel
- Backend Swagger: http://localhost:8000/docs
- Frontend: Opens as Tauri window (not browser)
- Ollama: http://localhost:11434
