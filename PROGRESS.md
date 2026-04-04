# Project Intel V2 - Build Log

**Last Updated:** 2026-04-03
**Current Status:** MVP Complete — ready for `tauri dev`

---

## Completed Steps

### Step 1: Backend Foundation (Completed: 2026-04-03)
- Created: `backend/app/main.py`, `config.py`, `database.py`, `models.py`
- Created: `backend/requirements.txt`, `.env`, `.env.example`
- Database: 7 tables initialized (documents, actions, risks, dependencies, deadlines, scope_items, notifications) with WAL mode + FK enforcement
- Endpoints: `GET /health` returning `{"status":"ok","project":"My Project"}`
- Note: SQLAlchemy pinned to 2.0.36 (2.0.23 incompatible with Python 3.13)
- Note: Pydantic model fields renamed `llm_*` (avoids protected `model_` namespace warning)
- **Status:** Tested and working

### Step 2: Ollama Integration (Completed: 2026-04-03)
- Created: `backend/app/llm_service.py` — `OllamaService` with `generate()`, `extract()`, `chat()`, `reason()`, `status_report()`
- Created: `backend/app/routers/llm.py` — `GET /llm/status`, `POST /llm/generate`
- Created: `backend/test_ollama.py` — standalone smoke test (no server required)
- Models confirmed present: `mistral-nemo:latest`, `llama3.1:latest`, `deepseek-r1:latest`
- Fallback logic: if mistral-nemo missing, `extract()` falls back to llama3.1 automatically
- `OllamaUnavailableError` converts to HTTP 503 in routers
- **Status:** Tested and working

---

### Step 3: Document Processing (Completed: 2026-04-03)
- Created: `backend/app/document_processor.py` — text extraction (PDF/DOCX/TXT/MD/EML) + LLM pipeline
- Created: `backend/app/routers/documents.py` — `POST /documents/upload`, `GET /documents`, `GET /documents/{id}`, `DELETE /documents/{id}`
- Created: `backend/test_docs/meeting_notes.md`, `email_scope_change.txt`, `project_plan.md`
- Live test: uploaded meeting_notes.md → extracted 5 actions, 2 deadlines, 1 risk, 2 dependencies
- pdfplumber → PyPDF2 fallback chain for PDFs; 12k char truncation guard for large docs
- Ollama unavailable → file saved, record created, warning returned (no 500)
- **Status:** Tested and working

---

### Step 4: Notification Service (Completed: 2026-04-04)
- Created: `backend/app/notification_service.py` — scans DB for overdue/due-this-week actions, missed/upcoming deadlines, new scope items (last 24h), high-impact open risks
- Created: `backend/app/scheduler.py` — APScheduler cron job at configured hour:minute (default 9:00)
- Created: `backend/app/routers/notifications.py` — `GET /notifications`, `POST /notifications/refresh`, `PATCH /notifications/{id}/read`, `POST /notifications/read-all`, `DELETE /notifications/{id}`
- Refresh clears unread notifications before regenerating — no duplicates on re-run
- Live test: 5 notifications from meeting_notes.md data (4 actions due this week, 1 high risk)
- **Status:** Tested and working

---

### Step 5: Q&A Chat (Completed: 2026-04-04)
- Created: `backend/app/routers/query.py` — `POST /query` with dual-path answering
- Direct DB path: structured queries (due this week, risks, deadlines, blocking, overdue, scope) answered without LLM — fast and deterministic
- LLM path: complex/analytical questions get full project context injected into prompt → llama3.1 (or deepseek-r1 if `use_deep_reasoning: true`)
- Response includes `model_used`, `answered_directly`, and `citations` array
- Live test: LLM answer grounded in DB data, referenced IDs, cited mitigation plan
- **Status:** Tested and working

---

### Step 6: Data CRUD Endpoints (Completed: 2026-04-04)
- Created: `backend/app/routers/data.py` — full CRUD for all 5 entity types
- Actions: `GET /actions` (filter by status/priority), `POST`, `PATCH /{id}`, `DELETE /{id}`
- Risks: `GET /risks` (filter by status), `POST`, `PATCH /{id}`, `DELETE /{id}`
- Deadlines: `GET /deadlines` (filter by met), `POST`, `PATCH /{id}`, `DELETE /{id}`
- Dependencies: `GET /dependencies`, `POST`, `PATCH /{id}`, `DELETE /{id}`
- Scope Items: `GET /scope-items` (filter by approved), `POST`, `PATCH /{id}`, `DELETE /{id}`
- All use `model_dump(exclude_unset=True)` on PATCH so only sent fields are updated
- **Status:** Tested and working

---

### Step 7: Frontend - Tauri Setup (Completed: 2026-04-04)
- Installed Rust 1.94.1 via rustup (required for Tauri)
- Scaffolded Tauri v2 + React + TypeScript via `create-tauri-app`
- Installed: Tailwind CSS v4 (Vite plugin), lucide-react, clsx, tailwind-merge
- Created: `src/types/index.ts` — all TypeScript interfaces matching backend models
- Created: `src/lib/api.ts` — full typed API client for all backend endpoints
- Created: `src/lib/utils.ts` — cn(), formatDate(), daysUntil(), dueDateLabel()
- Created: `src/components/ui/` — Badge, Button, Card primitives
- Created: `src/components/Sidebar.tsx` — nav with unread badge + Ollama status dot
- Created: `src/App.tsx` — layout shell with sidebar + view routing + Ollama banner
- Window: 1280×800 (min 900×600), dark theme
- Tauri capabilities: HTTP fetch allowed for localhost:8000
- Build verified: `tsc && vite build` passes clean (231 kB JS, 13.8 kB CSS)
- Note: `ignoreDeprecations: "5.0"` needed for `baseUrl` path alias with TS bundler mode
- **Status:** Compiles clean, ready for panel implementations

---

### Step 8: Frontend - Upload Panel (Completed: 2026-04-04)
- Drag-and-drop zone + click-to-browse, multi-file queue
- Per-file doc type selector with auto-guess from filename
- Upload individually or "Upload All" button
- Extraction results shown per file (counts by type)
- Loading/done/error states with toast feedback
- **Status:** Complete

### Step 9: Frontend - Notification Panel (Completed: 2026-04-04)
- Grouped by severity: Urgent / This Week / Info with colour-coded left border
- Unread count badge in header and sidebar
- Click notification to mark it read
- Refresh button triggers `POST /notifications/refresh`
- Mark all read button
- **Status:** Complete

### Step 10: Frontend - Chat Interface (Completed: 2026-04-04)
- Message thread with user/assistant bubbles
- Example question shortcuts shown when empty
- Deep reasoning toggle (routes to DeepSeek-R1)
- Animated typing indicator while LLM responds
- Collapsible citations panel per answer
- Model/source badge (DB vs model name)
- Ollama-offline warning shown inline
- **Status:** Complete

### Step 11: Frontend - Data Tables (Completed: 2026-04-04)
- **ActionsTable**: filter by status/priority, mark done, delete, add new
- **RisksTable**: filter by status, update status inline, delete, add new
- **DeadlinesTable**: filter by met, toggle met/unmet, delete, add new
- **DependenciesTable**: visual A → [type] → B layout, delete, add new
- **ScopeTable**: filter by approved, approve/revoke, delete, add new
- All tables show toasts on success/error
- **Status:** Complete

### Step 12: Integration & Polish (Completed: 2026-04-04)
- ToastContainer wired into App root
- Ollama offline banner shown across all views
- Sidebar unread badge polled every 60s
- Production build: `tsc && vite build` passes clean (268 kB JS, 21.7 kB CSS)
- **Status:** Complete ✅

---

## In Progress

*(none — MVP complete)*

---

## Not Started

*(all steps done)*
- [ ] Step 6: Data CRUD Endpoints — actions, risks, deadlines, dependencies, scope items
- [ ] Step 7: Frontend - Tauri Setup — React + TypeScript + shadcn/ui, sidebar layout
- [ ] Step 8: Frontend - Upload Panel — drag-and-drop, progress, extraction summary
- [ ] Step 9: Frontend - Notification Panel — color-coded briefing, refresh button, badge count
- [ ] Step 10: Frontend - Chat Interface — message list, loading state, source citations
- [ ] Step 11: Frontend - Data Tables — actions/risks/deadlines with filters and inline edit
- [ ] Step 12: Integration & Polish — end-to-end test, error handling, README

---

## Known Issues

- VS Code flags `import httpx` and `from app.config import get_settings` as unresolved — fix by selecting the venv interpreter: `Ctrl+Shift+P` → Python: Select Interpreter → `backend/.venv/Scripts/python.exe`

---

## Notes

- **One project per instance** — no projects table, config holds project name
- **Plain SQLite for now** — encryption deferred to Phase 2 (when GCP backup is added)
- **DB location:** `backend/data/project.db`
- **Uploads location:** `backend/data/uploads/`
- **Dev start commands:**
  ```
  cd backend && .venv/Scripts/uvicorn app.main:app --reload --port 8000
  ```

---

## Next Actions

1. Run `npm run tauri dev` from `frontend/` to open the desktop app
2. Start backend first: `cd backend && .venv/Scripts/uvicorn app.main:app --reload`
3. Upload the three test docs from `backend/test_docs/`
4. Verify extraction, notifications, chat, and tables all work end-to-end
5. Phase 2 planning: GCP backup with client-side encryption, email ingestion
