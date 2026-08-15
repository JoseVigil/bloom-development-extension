"""Chequeo de salud de los arms de Alfred — lógica compartida.

Extraído de `scripts/check_health.py` para que ese script de CLI y
`server.py` (`GET /health`) compartan la misma definición de "cuáles son
los arms de Alfred y cómo se instancian por default", en vez de que cada
consumidor reconstruya su propia lista de providers por separado.
"""

from __future__ import annotations

from alfred.providers.base import ProviderHealth
from alfred.providers.gemini_provider import GeminiTextProvider
from alfred.providers.ollama_provider import OllamaEmbeddingProvider
from alfred.providers.ollama_text_provider import OllamaTextProvider


def collect_health() -> dict[str, ProviderHealth]:
    """Instancia los tres arms con su configuración default y los chequea.

    `ollama_text` es el arm relevante para decidir si Alfred puede
    conversar hoy — es el default de `chat.py`/`server.py`. Los otros dos
    (`ollama_embeddings`, `gemini`) se reportan igual porque son parte
    del ecosistema de Alfred, aunque no bloqueen una respuesta de chat.
    """
    return {
        "ollama_embeddings": OllamaEmbeddingProvider.from_default_nucleus_path().health(),
        "ollama_text": OllamaTextProvider().health(),
        "gemini": GeminiTextProvider().health(),
    }
