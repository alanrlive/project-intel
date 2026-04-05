# Project Intel V2

A self-hosted, GDPR-compliant AI project management assistant. Upload project documents and let local LLMs extract actions, risks, deadlines, and dependencies — all data stays on your machine.

## Features

- **Batch Document Upload** — drag-drop multiple files at once; each file gets its own document type and extraction prompt. See [docs/BATCH_UPLOAD.md](docs/BATCH_UPLOAD.md).
- **Excel support** — `.xlsx` files are converted to Markdown tables and processed like any other document (first sheet only).
- **Custom document types** — define your own extraction prompts and target models in Settings.
- **Automatic extraction** — LLM populates actions, risks, deadlines, dependencies, and scope items directly into the database.
- **Daily briefing** — smart notifications highlighting overdue items, upcoming deadlines, and high-impact risks.
- **Conversational Q&A** — ask questions about your project; the AI retrieves relevant context from the database.
- **Data tables** — full CRUD for all five item types with pagination (50 items/page).
- **Privacy first** — Ollama runs on localhost; no data ever leaves your machine.

## Stack

| Layer    | Technology                                      |
|----------|-------------------------------------------------|
| Frontend | Tauri 2 + React 18 + TypeScript + Tailwind CSS  |
| Backend  | Python 3.11+, FastAPI, SQLAlchemy, SQLite        |
| LLM      | Ollama — mistral-nemo, llama3.1, deepseek-r1    |

## Requirements

- Windows 10/11 (tested), macOS 12+, Ubuntu 20.04+
- Python 3.11+
- Node.js 18+
- Rust 1.70+ (for Tauri compilation)
- [Ollama](https://ollama.ai) running on localhost:11434
- 16 GB RAM recommended (8 GB minimum, slow)
- 25 GB disk (15 GB for models + app/data)

## Quick start

```powershell
# 1. Pull LLM models (once)
ollama pull mistral-nemo
ollama pull llama3.1
ollama pull deepseek-r1

# 2. Set up Python backend
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# 3. Run database migration (first time only)
python migrate_document_types.py

# 4. Start everything
cd ..
.\scripts\start_all.ps1
```

Or start services separately:

```powershell
# Terminal 1 — backend
cd backend
.venv\Scripts\uvicorn app.main:app --reload

# Terminal 2 — frontend
cd frontend
npm run tauri dev
```

## Development commands

```powershell
.\scripts\status.ps1        # check what's running + DB summary
.\scripts\start_backend.ps1 # start FastAPI
.\scripts\stop_backend.ps1  # stop FastAPI
.\scripts\backup_data.ps1   # backup SQLite DB
.\scripts\reset_data.ps1    # wipe and reset DB (destructive)
```

## Testing

```powershell
# Generate sample test files (once)
python tests/create_test_data.py

# Run batch upload integration tests (backend must be running)
python tests/test_batch_upload.py
```

## Project structure

```
pm_tool/
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI entry point + CORS
│   │   ├── models.py                # SQLAlchemy models (7 tables)
│   │   ├── document_processor.py    # Text extraction + LLM pipeline
│   │   ├── llm_service.py           # Ollama integration
│   │   ├── notification_service.py  # Daily briefing generation
│   │   └── routers/
│   │       ├── documents.py         # Upload + batch-upload endpoints
│   │       ├── data.py              # CRUD: actions, risks, deadlines...
│   │       ├── query.py             # Q&A chat endpoint
│   │       ├── notifications.py     # Briefing endpoints
│   │       ├── settings.py          # Document types + Ollama settings
│   │       └── llm.py              # LLM status + raw generate
│   ├── migrate_document_types.py    # One-time DB migration
│   ├── data/
│   │   ├── project.db               # SQLite database (gitignored)
│   │   └── uploads/                 # Uploaded files (gitignored)
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── App.tsx
│       ├── components/              # All UI components
│       └── lib/api.ts               # Typed backend API client
├── scripts/                         # PowerShell management scripts
├── tests/
│   ├── test_data/                   # Sample documents for testing
│   ├── create_test_data.py          # Generates xlsx/docx/pdf test files
│   └── test_batch_upload.py         # Integration test suite
└── docs/
    ├── BATCH_UPLOAD.md              # Batch upload feature guide
    └── HANDOFF_PROMPT.md            # Session handoff context
```

## API reference

Backend Swagger UI: `http://localhost:8000/docs`

Key endpoints:

| Method | Path | Description |
|--------|------|-------------|
| POST | `/documents/upload` | Single file upload (legacy) |
| POST | `/documents/batch-upload` | Batch upload with type per file |
| GET | `/settings/document-types` | List all document types |
| POST | `/settings/document-types` | Create custom type |
| GET | `/settings/ollama/models` | List available Ollama models |
| POST | `/query` | Q&A chat |
| GET | `/notifications` | Daily briefing |

## Design principles

- **All data local** — no external API calls with user data; Ollama on localhost
- **Structured extraction** — LLM populates DB tables directly (not RAG/vector search)
- **Single project** — one instance = one project (simplified architecture)
- **No emojis in PowerShell scripts** — use `[OK]`, `[ERROR]`, `[INFO]`

## Security

- CSP restricts `connect-src` to `localhost:8000` only
- CORS restricted to Tauri origins
- File paths not exposed in API responses
- `.env` and database excluded from git
