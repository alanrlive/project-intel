import logging
import shutil
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import UPLOADS_DIR, read_app_config
from app.database import get_db
from app.document_processor import extract_with_type, process_document, store_extracted_data
from app.llm_service import OllamaUnavailableError, ollama
from app.models import Document, DocumentType
from app.vector_service import VectorService

logger = logging.getLogger(__name__)

router = APIRouter()

ALLOWED_SUFFIXES = {".pdf", ".docx", ".xlsx", ".xls", ".txt", ".md", ".markdown", ".eml", ".msg"}
ALLOWED_DOC_TYPES = {"meeting_notes", "email", "plan", "raid", "other"}
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB


def _unique_dest(filename: str) -> Path:
    """
    Return a non-colliding path in UPLOADS_DIR.
    If the filename already exists, appends _YYYYMMDD_HHMMSS before the suffix.
    """
    dest = UPLOADS_DIR / filename
    if not dest.exists():
        return dest
    suffix = dest.suffix
    stem = dest.stem
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    dest = UPLOADS_DIR / f"{stem}_{ts}{suffix}"
    # If still collides (same-second), add a counter
    counter = 1
    while dest.exists():
        dest = UPLOADS_DIR / f"{stem}_{ts}_{counter}{suffix}"
        counter += 1
    return dest


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
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File exceeds 20 MB limit.")

    dest = _unique_dest(file.filename)
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

    # Validate all type_ids exist
    unique_ids = set(type_ids)
    valid_ids = {
        row.id for row in db.query(DocumentType.id).filter(DocumentType.id.in_(unique_ids)).all()
    }
    bad_ids = unique_ids - valid_ids
    if bad_ids:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid document type ID(s): {sorted(bad_ids)}. "
                   "Check Settings → Document Types for valid IDs.",
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
        dest = _unique_dest(filename)
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


@router.get("/documents/intake-folder/scan", tags=["documents"])
def scan_intake_folder():
    """
    Return files available in the configured intake folder.
    Returns an empty list if no folder is configured or it no longer exists.
    """
    cfg = read_app_config()
    raw_path = cfg.get("intake_folder_path")
    if not raw_path:
        return {"configured": False, "path": None, "files": []}

    folder = Path(raw_path)
    if not folder.exists() or not folder.is_dir():
        return {"configured": True, "path": raw_path, "files": [], "error": "Folder not found"}

    try:
        files = []
        for p in sorted(folder.iterdir()):
            if p.is_file() and p.suffix.lower() in ALLOWED_SUFFIXES:
                files.append({
                    "filename": p.name,
                    "size_bytes": p.stat().st_size,
                    "path": str(p),
                })
        return {"configured": True, "path": raw_path, "files": files}
    except PermissionError:
        return {"configured": True, "path": raw_path, "files": [],
                "error": "Permission denied reading folder"}


class IntakeBatchItem(BaseModel):
    path: str
    type_id: int


@router.post("/documents/batch-upload-intake", tags=["documents"])
async def batch_upload_from_intake(
    items: list[IntakeBatchItem],
    db: Session = Depends(get_db),
):
    """
    Process files already on disk (from the intake folder).
    Each item specifies the absolute file path and document type ID.
    After successful processing, files are moved to uploads/.
    Files that fail extraction are left in the intake folder.
    """
    cfg = read_app_config()
    intake_path = cfg.get("intake_folder_path")

    # Validate all type_ids exist before processing any files
    unique_ids = {item.type_id for item in items}
    valid_ids = {
        row.id for row in db.query(DocumentType.id).filter(DocumentType.id.in_(unique_ids)).all()
    }
    bad_ids = unique_ids - valid_ids
    if bad_ids:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid document type ID(s): {sorted(bad_ids)}. "
                   "Check Settings → Document Types for valid IDs.",
        )

    results = []

    for item in items:
        src = Path(item.path)
        filename = src.name
        suffix = src.suffix.lower()

        # ── Validate ──────────────────────────────────────────────────────────
        if suffix not in ALLOWED_SUFFIXES:
            results.append({
                "filename": filename,
                "success": False,
                "error": f"Unsupported file type '{suffix}'.",
            })
            continue

        if not src.exists():
            results.append({
                "filename": filename,
                "success": False,
                "error": "File not found (may have been moved already).",
            })
            continue

        try:
            size = src.stat().st_size
        except OSError:
            results.append({
                "filename": filename,
                "success": False,
                "error": "Cannot read file (permission denied).",
            })
            continue

        if size > MAX_FILE_SIZE:
            results.append({
                "filename": filename,
                "success": False,
                "error": "File exceeds 20 MB limit.",
            })
            continue

        # Validate path is inside the configured intake folder (security check)
        if intake_path:
            try:
                src.resolve().relative_to(Path(intake_path).resolve())
            except ValueError:
                results.append({
                    "filename": filename,
                    "success": False,
                    "error": "File is not inside the configured intake folder.",
                })
                continue

        # ── Move to uploads/ first, then process from there ───────────────────
        dest = _unique_dest(filename)
        try:
            shutil.move(str(src), str(dest))
            logger.info("Intake: moved %s -> %s", src, dest)
        except (OSError, shutil.Error) as exc:
            results.append({
                "filename": filename,
                "success": False,
                "error": f"Could not move file to uploads: {exc}",
            })
            continue

        # ── Insert document record ────────────────────────────────────────────
        doc = Document(
            filename=filename,
            doc_type="other",
            document_type_id=item.type_id,
            file_path=str(dest),
        )
        db.add(doc)
        db.commit()
        db.refresh(doc)

        # ── Extract ───────────────────────────────────────────────────────────
        try:
            extracted = await extract_with_type(
                file_path=dest,
                document_type_id=item.type_id,
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
                    "moved": True,
                })
                continue

            counts = store_extracted_data(extracted, doc.id, db)
            results.append({
                "filename": filename,
                "success": True,
                "doc_id": doc.id,
                "extracted": counts,
                "moved": True,
            })

        except OllamaUnavailableError as exc:
            results.append({
                "filename": filename,
                "success": False,
                "doc_id": doc.id,
                "error": f"LLM unavailable: {exc}",
                "moved": True,  # file was moved even though LLM failed
            })
        except ValueError as exc:
            results.append({
                "filename": filename,
                "success": False,
                "doc_id": doc.id,
                "error": f"LLM extraction failed: {exc}",
                "moved": True,
            })
        except Exception as exc:
            results.append({
                "filename": filename,
                "success": False,
                "doc_id": doc.id,
                "error": f"Processing error: {exc}",
                "moved": True,
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


@router.get("/documents/{doc_id}/file", tags=["documents"])
def download_document_file(doc_id: int, db: Session = Depends(get_db)):
    """Serve the original uploaded file as a download."""
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")
    if not doc.file_path:
        raise HTTPException(status_code=404, detail="No file stored for this document.")
    p = Path(doc.file_path)
    if not p.exists():
        raise HTTPException(status_code=404, detail="File missing from disk.")
    return FileResponse(str(p), filename=doc.filename)


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

    # Remove from ChromaDB — non-fatal if it fails
    vector_service = VectorService(db_path=Path("backend/data"))
    success = vector_service.delete_document(doc_id)
    if success:
        logger.info("Removed document %d from vector store", doc_id)
    else:
        logger.warning("Could not remove document %d from vector store", doc_id)

    return {"deleted": doc_id}
