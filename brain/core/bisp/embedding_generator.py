"""
BISP — Bloom Intent Semantic Package
core/bisp/embedding_generator.py

Thin wrapper de compatibilidad sobre OllamaManager.
Mantiene la API pública del módulo anterior.

Para uso nuevo, preferir OllamaManager directamente.
"""

from __future__ import annotations

from typing import Any

from .ollama_manager import OllamaManager, OLLAMA_DEFAULT_URL, EMBEDDING_DIM, EMBEDDING_MODEL


class EmbeddingGenerator:
    """
    Genera embeddings vectoriales usando Ollama local.

    Wrapper de compatibilidad sobre OllamaManager.
    Para integración directa con nucleus.json, usar OllamaManager.from_nucleus_json().

    Requiere:
    - Ollama corriendo en localhost:11434
    - Modelo nomic-embed-text descargado: `ollama pull nomic-embed-text`
    """

    def __init__(
        self,
        ollama_url: str = OLLAMA_DEFAULT_URL,
        ollama_exe: str | None = None,
    ) -> None:
        self._manager = OllamaManager(
            ollama_url=ollama_url,
            ollama_exe=ollama_exe,
            auto_start=False,
        )

    # ------------------------------------------------------------------
    # Public API (mantiene compatibilidad con código existente)
    # ------------------------------------------------------------------

    def generate(self, text: str) -> list[float]:
        """
        Genera embedding para un texto.
        Retorna lista de 768 floats (nomic-embed-text dim).
        """
        return self._manager.generate_embedding(text)

    def generate_batch(self, texts: list[str]) -> list[list[float]]:
        """Genera embeddings para una lista de textos. Secuencial."""
        return self._manager.generate_embedding_batch(texts)

    def health(self) -> dict[str, Any]:
        """Verifica que Ollama está up y el modelo disponible."""
        return self._manager.health()

    def ensure_model(self) -> None:
        """Verifica que el modelo está disponible."""
        return self._manager.ensure_model()
