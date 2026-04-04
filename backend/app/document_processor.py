import email
import json
import logging
from datetime import date
from pathlib import Path

import pdfplumber
import PyPDF2
from docx import Document as DocxDocument
from sqlalchemy.orm import Session

from app.llm_service import OllamaService
from app.models import Action, Deadline, Dependency, Document, Risk, ScopeItem

logger = logging.getLogger(__name__)

# ── Extraction prompt ─────────────────────────────────────────────────────────

EXTRACTION_PROMPT = """Analyze this {doc_type} document and extract structured information.

Return ONLY valid JSON with these exact keys (use empty arrays if nothing found):
{{
  "actions": [
    {{
      "description": "string",
      "owner": "string or null",
      "due_date": "YYYY-MM-DD or null",
      "priority": "high|medium|low"
    }}
  ],
  "deadlines": [
    {{
      "description": "string",
      "deadline_date": "YYYY-MM-DD"
    }}
  ],
  "risks": [
    {{
      "description": "string",
      "impact": "high|medium|low",
      "likelihood": "high|medium|low",
      "mitigation": "string or null"
    }}
  ],
  "dependencies": [
    {{
      "task_a": "string",
      "task_b": "string",
      "dependency_type": "blocks|enables|relates_to"
    }}
  ],
  "scope_items": [
    {{
      "description": "string",
      "source": "original_plan|change_request|meeting"
    }}
  ]
}}

Document content:
{content}"""


# ── Text extractors ───────────────────────────────────────────────────────────

def _extract_pdf(file_path: Path) -> str:
    """Try pdfplumber first (better layout), fall back to PyPDF2."""
    try:
        with pdfplumber.open(file_path) as pdf:
            pages = [page.extract_text() or "" for page in pdf.pages]
            text = "\n".join(pages).strip()
            if text:
                return text
    except Exception as exc:
        logger.warning("pdfplumber failed for %s: %s — trying PyPDF2", file_path.name, exc)

    # PyPDF2 fallback
    with open(file_path, "rb") as f:
        reader = PyPDF2.PdfReader(f)
        return "\n".join(
            page.extract_text() or "" for page in reader.pages
        ).strip()


def _extract_docx(file_path: Path) -> str:
    doc = DocxDocument(str(file_path))
    return "\n".join(p.text for p in doc.paragraphs if p.text.strip())


def _extract_eml(file_path: Path) -> str:
    with open(file_path, "rb") as f:
        msg = email.message_from_binary_file(f)

    parts = []
    # Subject + sender as context
    parts.append(f"From: {msg.get('From', '')}")
    parts.append(f"To: {msg.get('To', '')}")
    parts.append(f"Subject: {msg.get('Subject', '')}")
    parts.append(f"Date: {msg.get('Date', '')}")
    parts.append("")

    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/plain":
                payload = part.get_payload(decode=True)
                if payload:
                    parts.append(payload.decode(part.get_content_charset() or "utf-8", errors="replace"))
    else:
        payload = msg.get_payload(decode=True)
        if payload:
            parts.append(payload.decode(msg.get_content_charset() or "utf-8", errors="replace"))

    return "\n".join(parts)


def extract_text(file_path: Path) -> str:
    """Dispatch to the correct extractor based on file suffix."""
    suffix = file_path.suffix.lower()
    if suffix == ".pdf":
        return _extract_pdf(file_path)
    if suffix == ".docx":
        return _extract_docx(file_path)
    if suffix in {".txt", ".md", ".markdown"}:
        return file_path.read_text(encoding="utf-8", errors="replace")
    if suffix in {".eml", ".msg"}:
        return _extract_eml(file_path)
    # Attempt plain text for unknown types
    logger.warning("Unknown file type %s — attempting plain text read", suffix)
    return file_path.read_text(encoding="utf-8", errors="replace")


# ── LLM extraction ────────────────────────────────────────────────────────────

async def run_llm_extraction(content: str, doc_type: str, llm: OllamaService) -> dict:
    """Send document content to Ollama and parse structured JSON response."""
    # Truncate very large documents to avoid overwhelming the context window
    max_chars = 12_000
    if len(content) > max_chars:
        logger.warning("Document truncated from %d to %d chars for extraction", len(content), max_chars)
        content = content[:max_chars] + "\n\n[... document truncated ...]"

    prompt = EXTRACTION_PROMPT.format(doc_type=doc_type, content=content)
    return await llm.extract(prompt)


# ── Date validation ───────────────────────────────────────────────────────────

def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except (ValueError, TypeError):
        return None


# ── DB storage ────────────────────────────────────────────────────────────────

def store_extracted_data(extracted: dict, doc_id: int, db: Session) -> dict:
    """
    Persist extracted actions/deadlines/risks/dependencies/scope_items.
    Returns counts of what was stored.
    """
    counts: dict[str, int] = {
        "actions": 0,
        "deadlines": 0,
        "risks": 0,
        "dependencies": 0,
        "scope_items": 0,
    }

    for item in extracted.get("actions", []):
        if not item.get("description"):
            continue
        db.add(Action(
            description=item["description"],
            owner=item.get("owner"),
            due_date=_parse_date(item.get("due_date")),
            priority=item.get("priority", "medium"),
            status="open",
            created_from_doc_id=doc_id,
        ))
        counts["actions"] += 1

    for item in extracted.get("deadlines", []):
        dl = _parse_date(item.get("deadline_date"))
        if not item.get("description") or not dl:
            continue
        db.add(Deadline(
            description=item["description"],
            deadline_date=dl,
            source_doc_id=doc_id,
        ))
        counts["deadlines"] += 1

    for item in extracted.get("risks", []):
        if not item.get("description"):
            continue
        db.add(Risk(
            description=item["description"],
            impact=item.get("impact", "medium"),
            likelihood=item.get("likelihood", "medium"),
            mitigation=item.get("mitigation"),
            status="open",
        ))
        counts["risks"] += 1

    for item in extracted.get("dependencies", []):
        if not item.get("task_a") or not item.get("task_b"):
            continue
        db.add(Dependency(
            task_a=item["task_a"],
            task_b=item["task_b"],
            dependency_type=item.get("dependency_type", "relates_to"),
        ))
        counts["dependencies"] += 1

    for item in extracted.get("scope_items", []):
        if not item.get("description"):
            continue
        db.add(ScopeItem(
            description=item["description"],
            source=item.get("source", "meeting"),
            approved=False,
        ))
        counts["scope_items"] += 1

    db.commit()
    return counts


# ── Top-level pipeline ────────────────────────────────────────────────────────

async def process_document(
    file_path: Path,
    original_filename: str,
    doc_type: str,
    db: Session,
    llm: OllamaService,
) -> dict:
    """
    Full pipeline: extract text → LLM extraction → store → return summary.
    The Document row must already exist in the DB (created by the router).
    Returns a summary dict with counts and any warnings.
    """
    # Fetch the document record (router already inserted it)
    doc: Document | None = db.query(Document).filter(
        Document.file_path == str(file_path)
    ).first()

    if doc is None:
        raise ValueError(f"No document record found for {file_path}")

    # 1. Extract text
    content = extract_text(file_path)
    if not content.strip():
        return {
            "doc_id": doc.id,
            "filename": original_filename,
            "warning": "No text could be extracted from this file.",
            "counts": {},
        }

    # 2. Persist content on the document row
    doc.content_text = content
    db.commit()

    # 3. LLM extraction
    try:
        extracted = await run_llm_extraction(content, doc_type, llm)
    except ValueError as exc:
        logger.error("LLM extraction failed for %s: %s", original_filename, exc)
        return {
            "doc_id": doc.id,
            "filename": original_filename,
            "warning": f"LLM returned malformed output: {exc}",
            "counts": {},
        }

    # 4. Store in DB
    counts = store_extracted_data(extracted, doc.id, db)

    return {
        "doc_id": doc.id,
        "filename": original_filename,
        "doc_type": doc_type,
        "counts": counts,
        "summary": _human_summary(counts),
    }


def _human_summary(counts: dict[str, int]) -> str:
    parts = []
    labels = {
        "actions":      ("action",     "actions"),
        "deadlines":    ("deadline",   "deadlines"),
        "risks":        ("risk",       "risks"),
        "dependencies": ("dependency", "dependencies"),
        "scope_items":  ("scope item", "scope items"),
    }
    for key, (singular, plural) in labels.items():
        n = counts.get(key, 0)
        if n:
            parts.append(f"{n} {singular if n == 1 else plural}")
    return f"Found {', '.join(parts)}." if parts else "No structured data extracted."
