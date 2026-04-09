"""
Vector service — semantic search via ChromaDB + Ollama embeddings.

Not yet wired into any router. Instantiate VectorService and call its
methods once the embedding model (nomic-embed-text) is pulled in Ollama.
"""

import logging
from pathlib import Path

import chromadb
import requests

logger = logging.getLogger(__name__)

OLLAMA_BASE = "http://localhost:11434"
EMBED_MODEL = "nomic-embed-text"


class VectorService:
    def __init__(self, db_path: Path):
        self.db_path = db_path
        chroma_path = db_path / "chroma"
        chroma_path.mkdir(parents=True, exist_ok=True)
        self._client = chromadb.PersistentClient(path=str(chroma_path))
        self._collection = self._client.get_or_create_collection("project_documents")
        logger.info("VectorService initialised — collection 'project_documents' ready")

    def _get_embedding(self, text: str) -> list[float] | None:
        try:
            response = requests.post(
                f"{OLLAMA_BASE}/api/embeddings",
                json={"model": EMBED_MODEL, "prompt": text},
                timeout=30,
            )
            response.raise_for_status()
            embedding = response.json().get("embedding")
            if not embedding:
                logger.warning("Ollama returned no embedding for model %s", EMBED_MODEL)
                return None
            return embedding
        except Exception as exc:
            logger.warning("Failed to get embedding from Ollama: %s", exc)
            return None

    def embed_document(self, doc_id: int, content: str, metadata: dict) -> bool:
        embedding = self._get_embedding(content)
        if embedding is None:
            return False
        try:
            self._collection.upsert(
                ids=[str(doc_id)],
                embeddings=[embedding],
                documents=[content],
                metadatas=[metadata],
            )
            logger.info("Embedded document id=%d into vector store", doc_id)
            return True
        except Exception as exc:
            logger.warning("Failed to upsert document id=%d: %s", doc_id, exc)
            return False

    def search_documents(self, query_text: str, n_results: int = 3) -> list[int]:
        embedding = self._get_embedding(query_text)
        if embedding is None:
            return []
        try:
            results = self._collection.query(
                query_embeddings=[embedding],
                n_results=n_results,
            )
            ids = results.get("ids", [[]])[0]
            doc_ids = [int(i) for i in ids]
            logger.info("Vector search returned %d result(s)", len(doc_ids))
            return doc_ids
        except Exception as exc:
            logger.warning("Vector search failed: %s", exc)
            return []

    def delete_document(self, doc_id: int) -> bool:
        try:
            self._collection.delete(ids=[str(doc_id)])
            logger.info("Deleted document id=%d from vector store", doc_id)
            return True
        except Exception as exc:
            logger.warning("Failed to delete document id=%d: %s", doc_id, exc)
            return False

    def get_stats(self) -> dict:
        try:
            total = self._collection.count()
            return {"total_docs": total, "status": "connected"}
        except Exception as exc:
            logger.warning("Failed to get vector store stats: %s", exc)
            return {"total_docs": 0, "status": "error"}