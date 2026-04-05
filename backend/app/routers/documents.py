import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.config import UPLOADS_DIR
from app.database import get_db
from app.document_processor import extract_with_type, process_document, store_extracted_data
from app.llm_service import OllamaUnavailableError, ollama
from app.models import Document

router = APIRouter()

ALLOWED_SUFFIXES = {".pdf", ".docx", ".xlsx", ".xls", ".txt", ".md", ".markdown", ".eml", ".msg"}
ALLOWED_DOC_TYPES = {"meeting_notes", "email", "plan", "raid", "other"}
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB


@router.post("/documents/upload", tags=["documents"])
async def upload_document(
    file: UploadFile = File(...),
    doc_type: str = Form(default="other"),
    db: Session = Depends(get_db),
):
    """
    Upload a document, extract text, run LLM extraction, store results.
    Returns a summary of what was found.
    """
    # ── Validate ──────────────────────────────────────────────────
    if doc_type not in ALLOWED_DOC_TYPES:
        doc_type = "other"

    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{suffix}'. Allowed: {sorted(ALLOWED_SUFFIXES)}",
        )

    # ── Save file ─────────────────────────────────────────────────
    # Use the original filename; add a numeric suffix if it already exists
    dest = UPLOADS_DIR / file.filename
    if dest.exists():
        stem = dest.stem
        counter = 1
        while dest.exists():
            dest = UPLOADS_DIR / f"{stem}_{counter}{suffix}"
            counter += 1

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File exceeds 20 MB limit.")

    dest.write_bytes(content)

    # ── Insert document record ────────────────────────────────────
    doc = Document(
        filename=file.filename,
        doc_type=doc_type,
        file_path=str(dest),
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    # ── Run extraction pipeline ───────────────────────────────────
    try:
        result = await process_document(
            file_path=dest,
            original_filename=file.filename,
            doc_type=doc_type,
            db=db,
            llm=ollama,
        )
    except OllamaUnavailableError as exc:
        # File saved, record created — but LLM step failed
        return {
            "doc_id": doc.id,
            "filename": file.filename,
            "warning": str(exc),
            "counts": {},
            "summary": "File saved but LLM extraction skipped — Ollama not running.",
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Processing error: {exc}")

    return result


@router.post("/documents/batch-upload", tags=["documents"])
async def batch_upload_documents(
    files: list[UploadFile] = File(...),
    type_ids: list[int] = Form(...),
    db: Session = Depends(get_db),
):
    """
    Upload multiple documents in one request, each with its own DocumentType.
    Files are processed sequentially to avoid overwhelming Ollama.

    Form fields:
      files[]      — one or more files
      type_ids[]   — parallel list of DocumentType IDs (must match len(files))

    Returns one result object per file; failures do not abort remaining files.
    """
    if len(files) != len(type_ids):
        raise HTTPException(
            status_code=422,
            detail=(
                f"Mismatch: {len(files)} file(s) but {len(type_ids)} type_id(s). "
                "Each file must have a corresponding type_id."
            ),
        )

    results = []

    for file, type_id in zip(files, type_ids):
        filename = file.filename or "unknown"
        suffix = Path(filename).suffix.lower()

        # ── Validate file type ────────────────────────────────────────────────
        if suffix not in ALLOWED_SUFFIXES:
            results.append({
                "filename": filename,
                "success": False,
                "error": f"Unsupported file type '{suffix}'. Allowed: {sorted(ALLOWED_SUFFIXES)}",
            })
            continue

        # ── Read + size check ─────────────────────────────────────────────────
        content = await file.read()
        if len(content) > MAX_FILE_SIZE:
            results.append({
                "filename": filename,
                "success": False,
                "error": "File exceeds 20 MB limit.",
            })
            continue

        # ── Save to disk ──────────────────────────────────────────────────────
        dest = UPLOADS_DIR / filename
        if dest.exists():
            stem = dest.stem
            counter = 1
            while dest.exists():
                dest = UPLOADS_DIR / f"{stem}_{counter}{suffix}"
                counter += 1
        dest.write_bytes(content)

        # ── Insert document record ────────────────────────────────────────────
        doc = Document(
            filename=filename,
            doc_type="other",          # legacy field; type is tracked via document_type_id
            document_type_id=type_id,
            file_path=str(dest),
        )
        db.add(doc)
        db.commit()
        db.refresh(doc)

        # ── Run type-aware extraction ─────────────────────────────────────────
        try:
            extracted = await extract_with_type(
                file_path=dest,
                document_type_id=type_id,
                db=db,
                llm=ollama,
            )

            if not extracted:
                results.append({
                    "filename": filename,
                    "success": True,
                    "doc_id": doc.id,
                    "extracted": {k: 0 for k in ("actions", "risks", "deadlines", "dependencies", "scope_items")},
                    "warning": "No text could be extracted from this file.",
                })
                continue

            # Persist extracted items and get counts
            doc.content_text = "\n".join(
                str(v) for v in extracted.values() if isinstance(v, str)
            )
            counts = store_extracted_data(extracted, doc.id, db)

            results.append({
                "filename": filename,
                "success": True,
                "doc_id": doc.id,
                "extracted": counts,
            })

        except OllamaUnavailableError as exc:
            results.append({
                "filename": filename,
                "success": False,
                "doc_id": doc.id,
                "error": f"LLM unavailable: {exc}",
            })
        except ValueError as exc:
            # Malformed LLM JSON
            results.append({
                "filename": filename,
                "success": False,
                "doc_id": doc.id,
                "error": f"LLM extraction failed: {exc}",
            })
        except Exception as exc:
            results.append({
                "filename": filename,
                "success": False,
                "doc_id": doc.id,
                "error": f"Processing error: {exc}",
            })

    return results


@router.get("/documents", tags=["documents"])
def list_documents(db: Session = Depends(get_db)):
    """List all uploaded documents, newest first."""
    docs = db.query(Document).order_by(Document.upload_date.desc()).all()
    return [
        {
            "id": d.id,
            "filename": d.filename,
            "doc_type": d.doc_type,
            "upload_date": d.upload_date.isoformat() if d.upload_date else None,
            "has_content": bool(d.content_text),
        }
        for d in docs
    ]


@router.get("/documents/{doc_id}", tags=["documents"])
def get_document(doc_id: int, db: Session = Depends(get_db)):
    """Get a single document record (without the raw content_text)."""
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")
    return {
        "id": doc.id,
        "filename": doc.filename,
        "doc_type": doc.doc_type,
        "upload_date": doc.upload_date.isoformat() if doc.upload_date else None,
        "has_content": bool(doc.content_text),
    }


@router.delete("/documents/{doc_id}", tags=["documents"])
def delete_document(doc_id: int, db: Session = Depends(get_db)):
    """Delete document record and its uploaded file."""
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")

    # Remove file from disk
    if doc.file_path:
        p = Path(doc.file_path)
        if p.exists():
            p.unlink()

    db.delete(doc)
    db.commit()
    return {"deleted": doc_id}
