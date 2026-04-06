"""
Settings endpoints for managing document types, Ollama configuration,
and the intake folder path.
"""

from typing import Annotated
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config import get_settings, read_app_config, write_app_config
from app.database import get_db
from app.models import Document, DocumentType

router = APIRouter(prefix="/settings", tags=["settings"])

_cfg = get_settings()


# ══════════════════════════════════════════════════════════════════════════════
# Schemas
# ══════════════════════════════════════════════════════════════════════════════

class DocumentTypeOut(BaseModel):
    id: int
    name: str
    extraction_prompt: str
    target_model: str
    is_system: bool

    class Config:
        from_attributes = True


class DocumentTypeCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    extraction_prompt: str = Field(..., min_length=1, max_length=5000)
    target_model: str = Field(default="mistral-nemo", max_length=100)


class DocumentTypeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    extraction_prompt: str | None = Field(default=None, min_length=1, max_length=5000)
    target_model: str | None = Field(default=None, max_length=100)


# ══════════════════════════════════════════════════════════════════════════════
# Document type endpoints
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/document-types", response_model=list[DocumentTypeOut])
def list_document_types(db: Session = Depends(get_db)):
    """Return all document types — system types first, then custom alphabetically."""
    return (
        db.query(DocumentType)
        .order_by(DocumentType.is_system.desc(), DocumentType.name)
        .all()
    )


@router.post("/document-types", response_model=DocumentTypeOut, status_code=201)
def create_document_type(body: DocumentTypeCreate, db: Session = Depends(get_db)):
    """Create a new custom document type."""
    if db.query(DocumentType).filter(DocumentType.name == body.name).first():
        raise HTTPException(status_code=409, detail=f"A document type named '{body.name}' already exists.")

    dt = DocumentType(
        name=body.name,
        extraction_prompt=body.extraction_prompt,
        target_model=body.target_model,
        is_system=False,
    )
    db.add(dt)
    db.commit()
    db.refresh(dt)
    return dt


@router.patch("/document-types/{type_id}", response_model=DocumentTypeOut)
def update_document_type(
    type_id: int,
    body: DocumentTypeUpdate,
    db: Session = Depends(get_db),
):
    """Update a custom document type. System types cannot be modified."""
    dt = db.query(DocumentType).filter(DocumentType.id == type_id).first()
    if dt is None:
        raise HTTPException(status_code=404, detail="Document type not found.")
    if dt.is_system:
        raise HTTPException(status_code=403, detail="System document types cannot be modified.")

    if body.name is not None:
        clash = (
            db.query(DocumentType)
            .filter(DocumentType.name == body.name, DocumentType.id != type_id)
            .first()
        )
        if clash:
            raise HTTPException(status_code=409, detail=f"A document type named '{body.name}' already exists.")
        dt.name = body.name

    if body.extraction_prompt is not None:
        dt.extraction_prompt = body.extraction_prompt
    if body.target_model is not None:
        dt.target_model = body.target_model

    db.commit()
    db.refresh(dt)
    return dt


@router.delete("/document-types/{type_id}", status_code=204)
def delete_document_type(type_id: int, db: Session = Depends(get_db)):
    """
    Delete a custom document type.
    Blocked if: type is a system type, or any documents reference this type.
    """
    dt = db.query(DocumentType).filter(DocumentType.id == type_id).first()
    if dt is None:
        raise HTTPException(status_code=404, detail="Document type not found.")
    if dt.is_system:
        raise HTTPException(status_code=403, detail="System document types cannot be deleted.")

    doc_count = db.query(Document).filter(Document.document_type_id == type_id).count()
    if doc_count:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Cannot delete '{dt.name}': {doc_count} document(s) use this type. "
                "Reassign them first."
            ),
        )

    db.delete(dt)
    db.commit()


# ══════════════════════════════════════════════════════════════════════════════
# Intake folder endpoints
# ══════════════════════════════════════════════════════════════════════════════

class IntakeFolderSet(BaseModel):
    path: str = Field(..., min_length=1, max_length=500)


@router.get("/intake-folder", tags=["settings"])
def get_intake_folder():
    """Return the currently configured intake folder path (or null)."""
    cfg = read_app_config()
    return {"path": cfg.get("intake_folder_path")}


@router.post("/intake-folder", tags=["settings"])
def set_intake_folder(body: IntakeFolderSet):
    """
    Set the intake folder path. Validates the directory exists and is readable.
    """
    p = Path(body.path)
    if not p.exists():
        raise HTTPException(status_code=400, detail=f"Path does not exist: {body.path}")
    if not p.is_dir():
        raise HTTPException(status_code=400, detail=f"Path is not a directory: {body.path}")
    try:
        list(p.iterdir())  # test read permission
    except PermissionError:
        raise HTTPException(status_code=403, detail=f"No read permission on: {body.path}")

    cfg = read_app_config()
    cfg["intake_folder_path"] = str(p.resolve())
    write_app_config(cfg)
    return {"path": str(p.resolve())}


@router.delete("/intake-folder", status_code=204, tags=["settings"])
def clear_intake_folder():
    """Remove the intake folder configuration."""
    cfg = read_app_config()
    cfg.pop("intake_folder_path", None)
    write_app_config(cfg)


# ══════════════════════════════════════════════════════════════════════════════
# Ollama endpoints
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/ollama/models", tags=["settings"])
async def list_ollama_models():
    """
    Fetch available models from the local Ollama instance.
    Returns names only — suitable for populating a model selector.
    """
    url = f"{_cfg.ollama_base_url}/api/tags"
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            models = [m["name"] for m in resp.json().get("models", [])]
            return {"models": models}
    except httpx.ConnectError:
        raise HTTPException(
            status_code=503,
            detail=f"Cannot reach Ollama at {_cfg.ollama_base_url}. Is it running?",
        )
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail=f"Ollama returned {exc.response.status_code}.")


@router.post("/ollama/test", tags=["settings"])
async def test_ollama_connection():
    """
    Ping Ollama and return connection status + available model count.
    Never raises — always returns a status object (safe for health checks).
    """
    url = f"{_cfg.ollama_base_url}/api/tags"
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            models = resp.json().get("models", [])
            return {
                "connected": True,
                "ollama_url": _cfg.ollama_base_url,
                "model_count": len(models),
                "models": [m["name"] for m in models],
            }
    except Exception as exc:
        return {
            "connected": False,
            "ollama_url": _cfg.ollama_base_url,
            "error": str(exc),
        }
