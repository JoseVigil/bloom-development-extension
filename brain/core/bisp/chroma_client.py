"""
BISP — Bloom Intent Semantic Package
core/bisp/chroma_client.py

Motor semántico del Nucleus. Gestiona ChromaDB embebido y colecciones por proyecto.
Punto de entrada único para toda operación vectorial del sistema.

Contrato de orquestación:
    Brain llama a OllamaManager → genera vector
    Brain llama a BISPChromaClient → almacena/consulta
    ChromaDB NUNCA llama a Ollama. Brain es el único orquestador.

URI Convention (embedding_ref):
    Formato:  "chroma://{nucleus_name}/{intent_uuid}/{phase}"
    Ejemplo:  "chroma://nucleus-org/dev-refactor-auth-a3f9/briefing"

    Este no es un protocolo real de ChromaDB — es una URI interna de Bloom.
    ChromaDB internamente usa un id string dentro de una colección.
    Brain parsea la URI para resolver doc_id y collection_name al recuperar.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constantes
# ---------------------------------------------------------------------------

CHROMA_SUBPATH = ".cache/chroma"
SEMANTIC_INDEX_PATH = ".cache/.semantic-index.json"
DEFAULT_SIMILARITY_THRESHOLD = 0.40
EMBEDDING_MODEL = "nomic-embed-text"
EMBEDDING_DIM = 768


# ---------------------------------------------------------------------------
# BISPChromaClient
# ---------------------------------------------------------------------------

class BISPChromaClient:
    """
    Cliente ChromaDB embebido para el Nucleus de Bloom.

    Gestiona:
    - Inicialización lazy del client (no importa chromadb hasta que se necesita)
    - Colecciones por proyecto: project-{uuid}/objectives|payloads|findings
    - Colección global cross-project: nucleus-global (opt-in)
    - Actualización del .semantic-index.json legible por humanos
    - Resolución de embedding_ref URI → colección + doc_id reales

    Uso típico en Brain (PUNTO 1 — context_plan):
        chroma = BISPChromaClient(nucleus_path)

        # Brain generó el vector via OllamaManager
        ref = chroma.store_embedding(
            project_uuid=project_uuid,
            bucket="objectives",
            doc_id=f"{intent_uuid}/objective",
            embedding=vector,
            document=objective_text[:500],
        )
        # ref = "chroma://nucleus-org/intent-uuid/objective"

        results = chroma.query_similar(
            project_uuid=project_uuid,
            bucket="payloads",
            query_embedding=vector,
        )

    Uso típico en Brain (PUNTO 2 — index.json):
        ref = chroma.store_embedding(
            project_uuid=project_uuid,
            bucket="payloads",
            doc_id=f"{intent_uuid}/{phase}",
            embedding=payload_vector,
            document=payload_text[:500],
        )
        # Brain actualiza index.json con embedding_ref = ref
    """

    def __init__(self, nucleus_path: str | Path) -> None:
        self.nucleus_path = Path(nucleus_path)
        self.chroma_path = self.nucleus_path / CHROMA_SUBPATH
        self.semantic_index_path = self.nucleus_path / SEMANTIC_INDEX_PATH
        self._client: Any = None  # lazy init

    # ------------------------------------------------------------------
    # ChromaDB init (lazy)
    # ------------------------------------------------------------------

    def _get_client(self) -> Any:
        """Inicializa ChromaDB de forma lazy. Falla con mensaje claro si no está instalado."""
        if self._client is not None:
            return self._client

        try:
            import chromadb  # type: ignore
        except ImportError:
            raise RuntimeError(
                "ChromaDB no está instalado.\n"
                "Ejecutá: pip install chromadb\n"
                "Ver BISP Fase 1 — requisitos de instalación."
            )

        self.chroma_path.mkdir(parents=True, exist_ok=True)
        self._client = chromadb.PersistentClient(path=str(self.chroma_path))
        logger.debug("ChromaDB inicializado en: %s", self.chroma_path)
        return self._client

    def _get_or_create_collection(self, name: str) -> Any:
        client = self._get_client()
        return client.get_or_create_collection(
            name=name,
            metadata={"hnsw:space": "cosine"},
        )

    # ------------------------------------------------------------------
    # Naming conventions
    # ------------------------------------------------------------------

    def collection_name(self, project_uuid: str, bucket: str) -> str:
        """
        Genera nombre de colección normalizado.

        Args:
            project_uuid: UUID del proyecto (puede contener guiones)
            bucket: 'objectives' | 'payloads' | 'findings'

        Returns:
            Nombre sanitizado para ChromaDB, e.g. "project_bloomaut_dev_objectives"
        """
        safe = project_uuid.replace("-", "_")[:40]
        return f"project_{safe}_{bucket}"

    # ------------------------------------------------------------------
    # URI convention — embedding_ref
    # ------------------------------------------------------------------

    def build_embedding_ref(self, doc_id: str) -> str:
        """
        Construye la URI interna de Bloom para un doc_id almacenado.

        Formato: "chroma://{nucleus_name}/{doc_id}"
        Ejemplo: "chroma://nucleus-org/dev-refactor-auth-a3f9/briefing"

        Args:
            doc_id: ID interno del documento en ChromaDB.
                    Convención: "{intent_uuid}/{phase}" o "{intent_uuid}/objective"

        Returns:
            URI string de la forma chroma://...
        """
        return f"chroma://{self.nucleus_path.name}/{doc_id}"

    def resolve_embedding_ref(self, embedding_ref: str) -> dict[str, str]:
        """
        Parsea una URI de embedding_ref a sus componentes.

        Resuelve: "chroma://nucleus-org/dev-refactor-auth-a3f9/briefing"
        Retorna:  { "nucleus_name": "nucleus-org", "doc_id": "dev-refactor-auth-a3f9/briefing" }

        Esto es lo que faltaba documentar en el BISP: la traducción de la URI
        al id real que ChromaDB entiende.

        Args:
            embedding_ref: URI en formato "chroma://{nucleus}/{path}"

        Returns:
            Dict con "nucleus_name" y "doc_id".

        Raises:
            ValueError: Si el formato de la URI es inválido.
        """
        if not embedding_ref.startswith("chroma://"):
            raise ValueError(
                f"embedding_ref inválido: '{embedding_ref}'. "
                "Debe comenzar con 'chroma://'."
            )
        # Quitar el protocolo
        rest = embedding_ref[len("chroma://"):]
        # El primer segmento es el nucleus_name, el resto es el doc_id
        parts = rest.split("/", 1)
        if len(parts) != 2 or not parts[1]:
            raise ValueError(
                f"embedding_ref mal formado: '{embedding_ref}'. "
                "Formato esperado: 'chroma://{{nucleus_name}}/{{intent_uuid}}/{{phase}}'"
            )
        return {"nucleus_name": parts[0], "doc_id": parts[1]}

    def retrieve_embedding(
        self,
        embedding_ref: str,
        project_uuid: str,
        bucket: str,
    ) -> list[float] | None:
        """
        Recupera un vector desde ChromaDB dado su embedding_ref URI.

        Implementa el contrato documentado en El_rol_de_Ollama.md:
            embedding_ref = "chroma://nucleus-org/dev-refactor-auth-a3f9/briefing"
            → parsea doc_id = "dev-refactor-auth-a3f9/briefing"
            → busca en collection de project_uuid/bucket

        Args:
            embedding_ref: URI en formato chroma://...
            project_uuid: UUID del proyecto para resolver la colección.
            bucket: 'objectives' | 'payloads' | 'findings'

        Returns:
            Vector como lista de floats, o None si no se encontró.
        """
        parsed = self.resolve_embedding_ref(embedding_ref)
        doc_id = parsed["doc_id"]

        coll = self._get_or_create_collection(
            self.collection_name(project_uuid, bucket)
        )
        try:
            result = coll.get(ids=[doc_id], include=["embeddings"])
            if result["embeddings"] and len(result["embeddings"]) > 0:
                return result["embeddings"][0]
            return None
        except Exception as exc:
            logger.warning("Error recuperando embedding '%s': %s", doc_id, exc)
            return None

    # ------------------------------------------------------------------
    # Store
    # ------------------------------------------------------------------

    def store_embedding(
        self,
        *,
        project_uuid: str,
        bucket: str,
        doc_id: str,
        embedding: list[float],
        metadata: dict[str, Any] | None = None,
        document: str = "",
    ) -> str:
        """
        Almacena un embedding en ChromaDB.

        Brain llama esto con el vector ya generado por OllamaManager.
        ChromaDB nunca genera vectores por su cuenta.

        Args:
            project_uuid: UUID del proyecto
            bucket: 'objectives' | 'payloads' | 'findings'
            doc_id: ID único, convención: "{intent_uuid}/{phase}" o "{intent_uuid}/objective"
            embedding: Vector generado por OllamaManager (768 dims)
            metadata: Metadatos opcionales para el documento
            document: Texto original (preview, máx ~500 chars recomendado)

        Returns:
            embedding_ref URI: "chroma://{nucleus_name}/{doc_id}"
        """
        coll = self._get_or_create_collection(
            self.collection_name(project_uuid, bucket)
        )
        coll.upsert(
            ids=[doc_id],
            embeddings=[embedding],
            metadatas=[metadata or {}],
            documents=[document],
        )
        ref = self.build_embedding_ref(doc_id)
        logger.debug("Embedding almacenado: %s → %s", doc_id, ref)
        return ref

    # ------------------------------------------------------------------
    # Query
    # ------------------------------------------------------------------

    def query_similar(
        self,
        *,
        project_uuid: str,
        bucket: str,
        query_embedding: list[float],
        n_results: int = 20,
        threshold: float = DEFAULT_SIMILARITY_THRESHOLD,
    ) -> list[dict[str, Any]]:
        """
        Consulta similitud coseno en una colección.

        Brain vectoriza la query con OllamaManager, luego llama esto.
        ChromaDB solo responde queries de similitud — no vectoriza.

        Args:
            project_uuid: UUID del proyecto
            bucket: 'objectives' | 'payloads' | 'findings'
            query_embedding: Vector de la query (generado por OllamaManager)
            n_results: Máximo de resultados a retornar
            threshold: Score mínimo de similitud (0.0-1.0, default 0.40)

        Returns:
            Lista ordenada de {id, similarity_score, metadata, document}
            con score >= threshold, de mayor a menor similitud.
        """
        coll = self._get_or_create_collection(
            self.collection_name(project_uuid, bucket)
        )

        count = coll.count()
        if count == 0:
            return []

        results = coll.query(
            query_embeddings=[query_embedding],
            n_results=min(n_results, count),
            include=["distances", "metadatas", "documents"],
        )

        out: list[dict[str, Any]] = []
        for i, doc_id in enumerate(results["ids"][0]):
            # ChromaDB cosine distance: 0 = idéntico, 2 = opuesto
            # similarity = 1 - distance/2  (normaliza a [0,1])
            raw_distance = results["distances"][0][i]
            similarity = max(0.0, 1.0 - raw_distance / 2.0)
            if similarity >= threshold:
                out.append(
                    {
                        "id": doc_id,
                        "similarity_score": round(similarity, 4),
                        "metadata": results["metadatas"][0][i],
                        "document": results["documents"][0][i],
                        "embedding_ref": self.build_embedding_ref(doc_id),
                    }
                )

        out.sort(key=lambda x: x["similarity_score"], reverse=True)
        return out

    # ------------------------------------------------------------------
    # Semantic Index (snapshot legible por humanos)
    # ------------------------------------------------------------------

    def update_semantic_index(
        self,
        *,
        intent_uuid: str,
        project_uuid: str,
        phase: str,
        embedding_ref: str,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        """
        Actualiza .semantic-index.json con la entrada del intent indexado.

        Este archivo es el snapshot legible por humanos de lo que ChromaDB tiene.
        No es la fuente de verdad — ChromaDB lo es. Es un índice de auditoría.

        Args:
            intent_uuid: UUID del intent
            project_uuid: UUID del proyecto
            phase: Fase del pipeline (e.g. "briefing", "execution/context_plan")
            embedding_ref: URI chroma:// del embedding almacenado
            metadata: Metadatos adicionales (objective_preview, etc.)
        """
        self.semantic_index_path.parent.mkdir(parents=True, exist_ok=True)

        index: dict[str, Any] = {}
        if self.semantic_index_path.exists():
            try:
                index = json.loads(self.semantic_index_path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                index = {}

        if intent_uuid not in index:
            index[intent_uuid] = {"project_uuid": project_uuid, "phases": {}}

        index[intent_uuid]["phases"][phase] = {
            "embedding_ref": embedding_ref,
            "model": EMBEDDING_MODEL,
            **(metadata or {}),
        }

        self.semantic_index_path.write_text(
            json.dumps(index, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        logger.debug("Semantic index actualizado: %s / %s", intent_uuid, phase)

    def get_semantic_index(self) -> dict[str, Any]:
        """Lee el .semantic-index.json completo."""
        if not self.semantic_index_path.exists():
            return {}
        try:
            return json.loads(self.semantic_index_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return {}

    # ------------------------------------------------------------------
    # Health
    # ------------------------------------------------------------------

    def health(self) -> dict[str, Any]:
        """Estado del cliente ChromaDB para health checks."""
        try:
            client = self._get_client()
            collections = client.list_collections()
            return {
                "status": "ok",
                "chroma_path": str(self.chroma_path),
                "collections": len(collections),
                "collection_names": [c.name for c in collections],
            }
        except Exception as exc:
            return {"status": "error", "error": str(exc)}
