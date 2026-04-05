# Project Intel V2 - Development Skill

## Overview
Self-hosted, GDPR-compliant AI project management assistant using local LLMs via Ollama. Desktop app (Tauri + React) with Python FastAPI backend. Extracts actions, risks, deadlines from uploaded documents and provides intelligent briefings and Q&A.

## Tech Stack
- **Backend:** Python 3.11+, FastAPI, SQLAlchemy, SQLite
- **Frontend:** Tauri 1.5+, React 18, TypeScript, shadcn/ui
- **LLM:** Ollama (localhost:11434) - mistral-nemo, llama3.1, deepseek-r1
- **Database:** SQLite with 7 tables (documents, actions, risks, deadlines, dependencies, scope_items, notifications)

## Architecture
Tauri Desktop App (localhost:1420) ↓ REST API FastAPI Backend (localhost:8000) ↓ HTTP

Ollama LLM Service (localhost:11434) ↓ SQLite Database (backend/data/project.db)

## Key Design Principles
- **Privacy First:** All data and LLM processing stays local (GDPR compliant)
- **Structured Extraction:** LLM populates DB tables (not RAG/vector search)
- **Single Project Focus:** One instance = one project (simplified architecture)
- **No Emojis in Scripts:** All .ps1 files use text indicators `[OK]`, `[ERROR]`, `[INFO]`
- **Pagination Required:** All 5 data tables paginate at 50 items/page (Actions, Risks, Deadlines, Dependencies, Scope Items)

## Project Structure
pm_tool/
├── backend/app/           # FastAPI app, models, routers, LLM integration
├── backend/data/          # SQLite DB, uploaded files (gitignored)
├── frontend/src/          # Tauri + React components
├── scripts/               # PowerShell mgmt (start/stop/backup/reset)
├── tests/                 # Python test suite, sample data
└── docs/                  # Documentation

## Critical Files
- `backend/app/llm_service.py` - Ollama integration (3 model strategy)
- `backend/app/document_processor.py` - Extract actions/risks via LLM
- `backend/app/notification_service.py` - Daily briefing generation
- `frontend/src/lib/api.ts` - Backend API client
- `scripts/start_backend.ps1` - Launch FastAPI server
- `tauri.conf.json` - CSP restricts to localhost:8000 only

## LLM Strategy
- **Mistral Nemo 12B:** Fast structured extraction (actions, risks, deadlines)
- **Llama 3.1 8B:** General Q&A, summaries
- **DeepSeek-R1 7B:** Deep reasoning, scope creep analysis, impact assessment

## Database Schema (Key Tables)
```sql
actions: id, description, owner, due_date, status, priority, created_from_doc_id
risks: id, description, impact, likelihood, mitigation, status
deadlines: id, description, deadline_date, met, source_doc_id
dependencies: id, task_a, task_b, dependency_type (blocks/enables)
notifications: id, type, message, severity, read, related_id, related_type
```

## API Endpoints
- `POST /documents/upload` - Upload doc, extract via LLM, store in DB
- `GET /actions`, `POST /actions`, `PATCH /actions/{id}` - CRUD for actions (similar for risks/deadlines)
- `POST /notifications/refresh` - Generate daily briefing
- `POST /query` - Q&A chat (retrieves context from DB, sends to LLM)

## Security Features
- CSP: `connect-src 'self' http://localhost:8000` (blocks external requests)
- CORS: Restricted to localhost:1420 origin, explicit methods only
- Input validation: Questions truncated to 1000 chars
- No file paths exposed in API responses
- .gitignore: Excludes .env, database, venv, node_modules

## System Requirements
- **Minimum:** 8GB RAM (slow, one model at a time)
- **Recommended:** 16GB RAM (smooth, multi-model)
- **Disk:** 25GB (15GB models + 5GB app/data)
- **OS:** Windows 10/11, macOS 12+, Linux (Ubuntu 20.04+)

## Development Workflow
```powershell
# Start backend
.\scripts\start_backend.ps1

# Start frontend (separate terminal)
cd frontend
$env:PATH += ";$env:USERPROFILE\.cargo\bin"
npm run tauri dev

# Check status
.\scripts\status.ps1

# Run tests
cd tests
python test_single_upload.py
```

## Common Tasks

### Add New Feature
1. Decide: backend, frontend, or both?
2. Backend: Add to `routers/`, update models if needed
3. Frontend: Add component, update `api.ts`
4. Test manually in Tauri app
5. Commit: `git add . && git commit -m "Add feature X" && git push`

### Debug LLM Issues
- Check Ollama running: `ollama list`
- View backend logs: Terminal running uvicorn
- Test LLM directly: `ollama run mistral-nemo "extract actions from: ..."`
- Check extraction prompt: `backend/app/document_processor.py` line ~30

### Performance Issues
- Add pagination: 50 items/page (already implemented)
- Add indexes: `CREATE INDEX idx_actions_due_date ON actions(due_date)`
- Cache briefing: Don't regenerate if data unchanged
- Archive old data: `UPDATE actions SET status='archived' WHERE due_date < date('now', '-6 months')`

## Known Limitations
- **Frontend tables slow >500 items:** Fixed with pagination in all 5 tables (client-side, 50/page)
- **Chat context limited:** Uses last N relevant items, not full history
- **No multi-user:** Single project per instance
- **No real-time sync:** Refresh required after changes
- **CPU inference only:** GPU support planned

## Testing
- Unit tests: `tests/test_*.py`
- Sample data: `tests/test_data/meeting_notes_simple.md`
- Full workflow: Upload → Briefing → Chat → CRUD
- Security: CSP blocks `fetch('https://external.com')` in DevTools

## Deployment (Future)
- Package Tauri app: `npm run tauri build`
- Bundle backend: PyInstaller or embedded Python
- Installer: NSIS/Inno Setup with Ollama setup instructions
- Target: Single .exe/msi installer (~100MB)

## Never Do
- Add external LLM API calls (breaks GDPR compliance)
- Use emojis in PowerShell scripts (encoding issues)
- Load all table data without pagination (breaks at scale)
- Commit .env, database, or venv to git
- Bypass CSP or CORS restrictions

## Quick Reference
- Repo: https://github.com/alanrlive/project-intel
- Backend: http://localhost:8000/docs (Swagger UI)
- Frontend: Opens as Tauri window (not browser)
- Ollama: http://localhost:11434
