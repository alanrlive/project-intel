"""
Vector Search — Manual QA Checklist
=====================================
Run this script to print the test steps. No automated assertions are made.
All steps require the backend to be running at http://localhost:8000.
"""


def main():
    print("=" * 60)
    print("  Vector Search — Manual QA Checklist")
    print("=" * 60)
    print()
    print("Prerequisites:")
    print("  - Backend running:   uvicorn app.main:app --reload")
    print("  - Ollama running:    ollama serve")
    print("  - Embed model ready: ollama pull nomic-embed-text")
    print()

    steps = [
        (
            "1. Upload three test documents with distinct topics",
            [
                "Go to Upload in the app",
                "Upload budget_overview.pdf  (or any budget/financial document)",
                "Upload meeting_notes.docx   (or any meeting/team discussion document)",
                "Upload a risk document      (e.g. a RAID log or risk register)",
                "Wait for extraction to complete for each file",
                "Check backend logs for 'Embedded document id=...' INFO messages",
                "In Settings > LLM Configuration > Vector Search, verify count = 3",
            ],
        ),
        (
            "2. Semantic query: 'financial concerns'",
            [
                "Go to Ask AI",
                "Type: financial concerns",
                "Submit without Deep Reasoning",
                "EXPECT: response draws from budget/financial document",
                "Check backend logs — should show 'Vector search returned 3 doc(s)'",
                "The budget document should appear first in retrieved docs",
            ],
        ),
        (
            "3. Semantic query: 'team discussion'",
            [
                "Type: team discussion",
                "Submit without Deep Reasoning",
                "EXPECT: response draws from meeting notes document",
                "Check backend logs for vector search context build",
            ],
        ),
        (
            "4. Delete one document and verify removal from both stores",
            [
                "Go to any data table (e.g. Actions) and note which doc IDs exist",
                "Delete the budget document from the documents list",
                "Check backend logs for 'Removed document <id> from vector store' INFO",
                "If log shows WARNING instead: vector delete failed (non-fatal)",
                "In Settings > Vector Search, verify count decreased by 1",
                "Re-run 'financial concerns' query — should no longer return budget content",
            ],
        ),
        (
            "5. Restart backend — verify vector index persists",
            [
                "Stop the backend (Ctrl+C in terminal)",
                "Restart: uvicorn app.main:app --reload",
                "Go to Settings > LLM Configuration > Vector Search",
                "EXPECT: document count matches pre-restart count (ChromaDB persisted to disk)",
                "Run a query — vector search should work without rebuilding",
            ],
        ),
        (
            "6. Rebuild vector index",
            [
                "Go to Settings > LLM Configuration > Vector Search",
                "Click 'Rebuild Vector Index'",
                "Wait for completion (button shows 'Rebuilding...')",
                "EXPECT: result shows 'Rebuilt: N/N documents' where N = total docs",
                "Check backend logs for per-document 'Embedded document id=...' messages",
                "Run a query — confirm semantic search still works after rebuild",
            ],
        ),
    ]

    for title, checklist in steps:
        print(f"[ ] {title}")
        for item in checklist:
            print(f"      - {item}")
        print()

    print("-" * 60)
    print("FALLBACK BEHAVIOUR (verify these don't break anything):")
    print()
    fallback = [
        "[ ] Stop Ollama, upload a document — extraction should complete,",
        "      embedding should fail silently (WARNING in logs, not an error)",
        "[ ] Query while Ollama is down — structured DB queries still work,",
        "      LLM path falls back to keyword context (WARNING in logs)",
        "[ ] Open Settings > Vector Search with Ollama down — status dot",
        "      shows red 'Disconnected', rebuild button still clickable",
    ]
    for line in fallback:
        print(line)
    print()
    print("=" * 60)
    print("All steps complete? Vector search is working correctly.")
    print("=" * 60)


if __name__ == "__main__":
    main()
