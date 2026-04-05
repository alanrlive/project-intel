HANDOFF PROMPT - Copy Everything Below
markdown# Project Intel V2 - Development Handoff

## Project Overview
I'm building a GDPR-compliant, self-hosted AI-powered project management assistant called **Project Intel V2**. The tool uses local LLMs (Ollama) to analyze project documents, track tasks, detect risks, and provide intelligent briefings.

## Current Status: WORKING PRODUCTION APP ✅

### What's Complete
- **Backend (FastAPI + SQLite):** Fully functional with 6 API endpoint groups
- **Frontend (Tauri + React):** Desktop application with 7 main views
- **LLM Integration (Ollama):** Using mistral-nemo, llama3.1, deepseek-r1 models
- **Features Working:**
  - Document upload (drag-and-drop, PDF/DOCX/TXT/MD/EML support)
  - Automatic extraction (actions, risks, deadlines, dependencies via LLM)
  - Daily briefing with smart notifications (overdue, upcoming, high-risk)
  - Conversational Q&A chat with model selection
  - Data tables (Actions, Risks, Deadlines, Dependencies) with CRUD operations
  - Visual dependency tracking
  - Status management (mark actions complete, etc.)
  - Full data persistence across restarts

### Tech Stack
**Backend:**
- Python 3.11+, FastAPI, SQLAlchemy, SQLite
- Ollama for local LLM inference (localhost:11434)
- PyPDF2, python-docx for document parsing
- Running on: http://localhost:8000

**Frontend:**
- Tauri 1.5+ (Rust + web technologies)
- React 18 + TypeScript
- shadcn/ui components (Tailwind-based)
- Vite dev server on http://localhost:1420

**Database Schema (SQLite):**
- documents (id, filename, upload_date, doc_type, content_text, file_path)
- actions (id, description, owner, due_date, status, priority, created_from_doc_id)
- risks (id, description, impact, likelihood, mitigation, status)
- deadlines (id, description, deadline_date, met, source_doc_id)
- dependencies (id, task_a, task_b, dependency_type, notes)
- scope_items (id, description, added_date, source, approved)
- notifications (id, type, message, created_at, read, severity, related_id, related_type)

## Project Structure
pm_tool/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI entry point
│   │   ├── config.py            # Settings
│   │   ├── database.py          # DB connection
│   │   ├── models.py            # SQLAlchemy models
│   │   ├── llm_service.py       # Ollama integration
│   │   ├── document_processor.py # Doc parsing & LLM extraction
│   │   ├── notification_service.py # Briefing generation
│   │   └── routers/
│   │       ├── documents.py     # Upload endpoints
│   │       ├── query.py         # Q&A chat
│   │       ├── notifications.py # Briefing endpoints
│   │       └── data.py          # CRUD for actions/risks/etc.
│   ├── data/
│   │   ├── project.db           # SQLite database
│   │   └── uploads/             # Uploaded files
│   ├── requirements.txt
│   └── .env
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   ├── lib/api.ts           # Backend API client
│   │   └── types/
│   └── src-tauri/
├── scripts/                     # PowerShell management scripts
│   ├── start_backend.ps1
│   ├── stop_backend.ps1
│   ├── start_frontend.ps1
│   ├── reset_data.ps1
│   ├── status.ps1
│   ├── backup_data.ps1
│   └── after_reboot.ps1
├── tests/                       # Python test scripts
│   ├── test_data/
│   │   ├── meeting_notes_simple.md
│   │   └── sample_email.txt
│   ├── test_single_upload.py
│   ├── test_notifications.py
│   ├── test_chat.py
│   └── test_crud.py
└── docs/

## Recent Changes Just Made

### Pagination Added to All Data Tables
Pagination (50 items per page) is now implemented in **all 5 data tables**:
- Actions table
- Risks table
- Deadlines table
- Dependencies table
- Scope Items table

**Reason:** App works great now with 2-10 items, but will slow down significantly after 500+ items per table. Pagination ensures it scales to handle a year-long project with daily uploads (~1,250 actions, ~750 risks after 12 months).

**Implementation:** Client-side pagination via shared `Pagination` component (`frontend/src/components/ui/pagination.tsx`). Backend still returns full datasets — server-side `limit`/`offset` is a future optimization.

## Known Limitations (Pre-Pagination)

### Performance Thresholds
| Data Volume | Status | Symptoms |
|-------------|--------|----------|
| 0-500 items | ✅ Perfect | No issues |
| 500-1,000 items | ⚠️ Noticeable | UI lag, slow filtering |
| 1,000-2,000 items | ❌ Problematic | Unusable tables, 5-10s load times |
| 2,000+ items | ❌ Broken | Browser freeze, crashes |

### What Causes Issues
1. **Frontend renders ALL items at once** (no virtual scrolling)
2. **React re-renders entire list** on filter changes
3. **Large JSON payloads** from backend to frontend
4. **No database query optimization** (full table scans)

### Pagination Should Fix
- Limits frontend to 50 items rendered at once
- Reduces memory usage
- Faster filtering and sorting
- Scales to unlimited data

## Testing After Pagination Changes

### Test Plan
1. **Basic functionality:**
   - Upload `tests/test_data/meeting_notes_simple.md`
   - Verify 2 actions appear in Actions table
   - Check pagination controls exist (should show "Page 1 of 1")

2. **Pagination controls:**
   - Verify "Previous" and "Next" buttons present
   - Verify page number display
   - Test navigation if >50 items exist

3. **Data integrity:**
   - Ensure all actions still visible across pages
   - Verify filters work with pagination
   - Check "Mark as done" works on paginated items

4. **Performance:**
   - Load time for Actions table should be <1 second
   - Filtering should be instant
   - Pagination navigation should be smooth

### Expected UI Changes
**Before:**
Actions (2)
[Filters]
[All 2 actions listed]

**After:**
Actions (2)
[Filters]
[Items 1-2 of 2]
[All 2 actions listed]
[< Prev] [Page 1 of 1] [Next >]

## Startup Instructions (For Reference)

### Start Backend
```powershell
cd C:\repos\pm_tool
.\scripts\start_backend.ps1
```

### Start Frontend
```powershell
cd C:\repos\pm_tool\frontend
$env:PATH += ";$env:USERPROFILE\.cargo\bin"
npm run tauri dev
```

### Check Status
```powershell
cd C:\repos\pm_tool
.\scripts\status.ps1
```

## API Endpoints (For Reference)

**Documents:**
- POST `/documents/upload` - Upload and process document
- GET `/documents` - List all documents

**Actions:**
- GET `/actions` - List all actions
- POST `/actions` - Create action
- PATCH `/actions/{id}` - Update action (mark done, etc.)
- DELETE `/actions/{id}` - Delete action

**Risks, Deadlines, Dependencies:** Similar CRUD patterns

**Notifications:**
- GET `/notifications` - Get briefing
- POST `/notifications/refresh` - Regenerate briefing
- PATCH `/notifications/{id}` - Mark as read

**Q&A:**
- POST `/query` - Ask question, get AI answer

## What I Need Help With

### Completed in Batch Upload Session
- `POST /documents/batch-upload` endpoint (sequential, per-file success/error)
- Excel support: `.xlsx` → markdown table via openpyxl (first sheet, values only)
- `extract_with_type()` — loads prompt + model from DocumentType DB row
- `EXTRACTION_PROMPT` kept as legacy fallback for old single-file endpoint only
- Frontend batch upload: `uploadBatch()`, `BatchUploadResult` type, UploadPanel wired to real API
- Drag-and-drop fixed: added `onDragEnter`, stable `useCallback` handlers, child-element flicker fix via `relatedTarget` check
- `tests/create_test_data.py` — generates raid_example.xlsx, meeting_notes.docx, budget_overview.pdf
- `tests/test_batch_upload.py` — 8 integration test suites, stdlib only, no pytest required
- `docs/BATCH_UPLOAD.md` — full feature documentation
- `README.md` — written from scratch with full project overview
- `scripts/status.ps1` — adds document_types count (system vs custom) and last-24h upload count

### Completed in Earlier Sessions
- Pagination added to DependenciesTable and ScopeTable (was missing from these two)
- All 5 data tables now have consistent 50-items/page pagination
- `DocumentType` model added to models.py; `document_type_id` FK added to `Document`
- Migration script `backend/migrate_document_types.py` run successfully — 5 system types seeded
- Settings API router `backend/app/routers/settings.py` created (6 endpoints)
- Settings UI built: `frontend/src/components/SettingsPage.tsx` with 3 tabs:
  - Document Types tab: CRUD for custom types, expandable rows, create/edit modal
  - LLM Configuration tab: Ollama connection test + model list
  - About tab: placeholder

### Integration Test Results (2026-04-05)
All 26/26 tests passing. Batch upload extracted from real files:
- +9 actions, +5 risks, +3 deadlines, +2 dependencies across xlsx/docx/pdf

### Next Requests (Future)
1. **Wire document_type_id into upload flow** — user picks type at upload; processor uses its prompt/model
2. **Add date range filters** (Last 30/90/365 days) to complement pagination
3. **Archive old completed items** (auto-archive tasks completed >6 months ago)
4. **Optimize notification generation** (currently scans all items every time)
5. **Add vector search for chat** (better context retrieval for Q&A)
6. **Server-side pagination** (add `limit`/`offset` to backend endpoints for very large datasets)

## Design Principles

**CRITICAL - Never Violate:**
- **GDPR Compliance:** All data stays local, no external API calls with user data
- **Privacy First:** Ollama runs on localhost:11434, no cloud LLMs
- **Single Project Focus:** One instance = one project (simplified architecture)
- **No Emojis in PowerShell Scripts:** Causes encoding issues on Windows
- **Emoji-free zones:** All .ps1 files, use text indicators like [OK], [ERROR], [INFO] instead

**Preferred Patterns:**
- Structured data extraction over RAG (LLM populates DB tables)
- Pagination over infinite scroll
- Server-side filtering over client-side
- Plain text outputs for email/PowerPoint (copy-paste friendly)

## Test Data

### Sample Document (meeting_notes_simple.md)
```markdown
# Meeting Notes - April 3, 2025

## Actions
- Alan to review vendor proposal by April 10 (HIGH priority)
- Team lead to approve budget by April 5

## Risks
- Vendor might delay delivery (HIGH impact, MEDIUM likelihood)
- Budget approval could slip (MEDIUM impact, LOW likelihood)

## Deadlines
- Project kickoff: April 15, 2025
- First milestone: May 1, 2025

## Dependencies
- Budget approval blocks vendor contract
- Vendor contract enables project kickoff
```

## Success Criteria

App is working correctly if:
- ✅ Can upload documents via drag-and-drop
- ✅ LLM extracts actions, risks, deadlines automatically
- ✅ Daily briefing shows overdue/upcoming items
- ✅ Chat answers questions about project intelligently
- ✅ Data tables display with pagination (50 items/page) — all 5 tables
- ✅ CRUD operations work (mark complete, delete, edit)
- ✅ All data persists across app restarts
- ✅ No performance issues with current data volume

## Platform
- **OS:** Windows 11
- **Python:** 3.11+ (venv at `backend/.venv`)
- **Node.js:** 16+
- **Rust:** 1.94.1 (for Tauri compilation)
- **Ollama:** Latest, running as service

## Questions to Answer

1. **Pagination is confirmed in all 5 tables** (Actions, Risks, Deadlines, Dependencies, Scope Items)
2. **Previous/Next navigation controls** are present via the shared `Pagination` component
3. **Total item count** shown in header (`Dependencies (12)`) and in paginator (`1–50 of 120`)
4. **No "items per page" selector** — fixed at 50/page by design
5. **Pagination hides itself** when total ≤ 50 items (clean UX for small datasets)

---

## Next Steps After Pagination Verified

If pagination works:
1. Test with larger dataset (create script to generate 100 test actions)
2. Add date range filters to reduce noise
3. Implement smart archiving for old completed items

If pagination has issues:
1. Debug specific component causing problems
2. Verify backend supports limit/offset parameters
3. Check if database queries are indexed properly

---

**Timeline Context:**
This is a working production app built in a single session. All core features functional. Pagination is a scaling improvement to handle 12 months of daily uploads without performance degradation.

**Primary Goal:**
Verify pagination implementation is correct and functional before moving to real-world testing with actual project documents.

## Security Hardening Applied

### Recent Security Changes
1. **CSP implemented** - `connect-src` limited to self + localhost:8000
2. **CORS tightened** - Explicit methods (GET/POST/PATCH/DELETE only)
3. **File paths sanitized** - No filesystem leaks in API responses
4. **Input validation** - Questions truncated to 1000 chars
5. **Environment variables** - Backend URL configurable via VITE_API_URL
6. **.gitignore created** - Secrets, data, build artifacts excluded from git

### Security Test Commands
```powershell
# Test CSP (in Tauri DevTools Console)
fetch('https://google.com')  # Should fail

# Test file path sanitization
Invoke-RestMethod -Uri "http://localhost:8000/documents"  # No file_path field

# Test question truncation
# Paste 2000-char question in chat, should truncate to 1000
```

### Threat Model Protected Against
- ✅ XSS (Cross-Site Scripting) - CSP blocks external scripts
- ✅ Data exfiltration - CSP blocks external connections
- ✅ Information disclosure - File paths removed from responses
- ✅ DoS (Denial of Service) - Question length limits
- ✅ CORS attacks - Strict origin + method restrictions
- ✅ Credential leaks - .gitignore prevents .env commits

### Not Protected Against (Requires Additional Work)
- ❌ SQL injection - Using SQLAlchemy ORM (mitigates but not perfect)
- ❌ File upload bombs - No size limits on uploaded documents
- ❌ Malicious documents - No virus scanning
- ❌ Brute force - No rate limiting on API endpoints