"""Arm de Ollama de Alfred — genera texto/razonamiento real, local.

Motor default de la conversación de Alfred (ver decisión de Jose,
2026-08-09): no se implementó el arm de Ollama para después reemplazarlo
por Gemini — la razón de fondo es tener un bot local. Gemini queda como
arm alternativo detrás de la misma interfaz (TextGenerationProviderArm),
para casos puntuales donde se acepta explícitamente el tradeoff de mandar
contexto real de la organización a un proveedor externo — nunca como
default silencioso, justamente por lo que ya se discutió sobre BTIPS y la
distribución agnóstica de cargas (ningún punto único, ni una IA, debería
poder reconstruir el negocio completo).

Mismo endpoint base que ollama_provider.py (OllamaEmbeddingProvider) para
localizar el exe embebido, pero acá se llama a /api/generate en vez de
/api/embeddings — chat/generación real, no vectores.

No hardcodea el modelo a ciegas (ese fue el bug de ollama_client.go en
Alfred-Go: "llama2" hardcodeado sin confirmar que estuviera pulleado). El
modelo se resuelve por constructor o por OLLAMA_TEXT_MODEL env var, con un
default razonable, pero health() reporta explícitamente si el modelo
default no está descargado en vez de fallar recién en el primer generate.
"""

from __future__ import annotations

import logging
import os
import platform
from pathlib import Path

import requests

from alfred.contracts.errors import ProviderError
from alfred.contracts.types import AIPromptPayload
from alfred.providers.base import ProviderHealth, TextGenerationProviderArm

logger = logging.getLogger(__name__)

OLLAMA_DEFAULT_URL = "http://localhost:11434"

# Modelo chico, instruction-following, acorde a hardware modesto — mismo
# candidato que se evaluó para Alfred-Go (ver disk space check, 38GB
# libres). No asumas que ya está pulleado: health() lo confirma.
DEFAULT_MODEL = "llama3.2:3b"
DEFAULT_TIMEOUT_SECONDS = 120

# Mismo mapeo que ollama_provider.py — no lo reimplementamos importándolo
# porque ese módulo está scopeado a embeddings; el path del exe es
# infraestructura de plataforma compartida, no lógica de negocio, así que
# duplicar esta tabla chica es más simple que forzar un import cruzado.
_RELATIVE_EXE_BY_PLATFORM: dict[str, str] = {
    "Windows": "bin/ollama/ollama.exe",
    "Linux": "bin/ollama/ollama",
    "Darwin": "bin/ollama/ollama",
}
_DEFAULT_LINUX_MACOS_BASE = Path.home() / ".local" / "share" / "BloomNucleus"


class OllamaTextProvider(TextGenerationProviderArm):
    id = "ollama"
    capabilities = ("local", "streaming")

    def __init__(
        self,
        ollama_url: str = OLLAMA_DEFAULT_URL,
        model: str | None = None,
        timeout: int = DEFAULT_TIMEOUT_SECONDS,
    ) -> None:
        self.ollama_url = ollama_url.rstrip("/")
        self.model = model or os.environ.get("OLLAMA_TEXT_MODEL", DEFAULT_MODEL)
        self.timeout = timeout

    def generate_text(self, payload: AIPromptPayload) -> str:
        """
        Genera texto real para `payload.text` contra Ollama local.

        Raises:
            ProviderError: AI_EXECUTION_PROMPT_INVALID (prompt vacío),
                AI_EXECUTION_OLLAMA_NOT_RUNNING, AI_EXECUTION_OLLAMA_MODEL_MISSING,
                AI_TIMEOUT, o AI_EXECUTION_STREAM_ERROR según la falla.
        """
        if not payload.text or not payload.text.strip():
            raise ProviderError.from_code(
                "AI_EXECUTION_PROMPT_INVALID", "El prompt no puede estar vacío."
            )

        request_body = {
            "model": self.model,
            "prompt": payload.text,
            "stream": False,
            "options": {"temperature": 0.2},
        }

        try:
            response = requests.post(
                f"{self.ollama_url}/api/generate",
                json=request_body,
                timeout=self.timeout,
            )
        except requests.ConnectionError:
            raise ProviderError.from_code(
                "AI_EXECUTION_OLLAMA_NOT_RUNNING",
                self._connection_error_message(),
            )
        except requests.Timeout:
            raise ProviderError.from_code(
                "AI_TIMEOUT",
                f"Timeout esperando respuesta de Ollama (>{self.timeout}s). "
                "El modelo puede estar cargándose por primera vez.",
            )

        if response.status_code == 404:
            raise ProviderError.from_code(
                "AI_EXECUTION_OLLAMA_MODEL_MISSING",
                f"Modelo '{self.model}' no encontrado en Ollama.",
                details={"pull_command": f"ollama pull {self.model}"},
            )
        if response.status_code != 200:
            raise ProviderError.from_code(
                "AI_EXECUTION_STREAM_ERROR",
                f"Ollama HTTP error {response.status_code}: {response.text}",
            )

        data = response.json()
        text = data.get("response")
        if not text:
            raise ProviderError.from_code(
                "AI_EXECUTION_STREAM_ERROR",
                f"Respuesta de Ollama con formato inesperado: {data}",
            )
        return text

    def health(self) -> ProviderHealth:
        try:
            resp = requests.get(f"{self.ollama_url}/api/tags", timeout=5)
            resp.raise_for_status()
            models = [m["name"] for m in resp.json().get("models", [])]
            model_available = any(self.model in m for m in models)
            return ProviderHealth(
                status="ok" if model_available else "model_missing",
                provider="ollama",
                detail={
                    "ollama_url": self.ollama_url,
                    "model": self.model,
                    "model_available": model_available,
                    "installed_models": models,
                },
            )
        except requests.ConnectionError:
            return ProviderHealth(
                status="error",
                provider="ollama",
                detail={
                    "ollama_url": self.ollama_url,
                    "error": self._connection_error_message(),
                },
            )
        except Exception as exc:
            return ProviderHealth(status="error", provider="ollama", detail={"error": str(exc)})

    def _connection_error_message(self) -> str:
        exe_hint = _RELATIVE_EXE_BY_PLATFORM.get(
            platform.system(), _RELATIVE_EXE_BY_PLATFORM["Linux"]
        )
        exe_path = _DEFAULT_LINUX_MACOS_BASE / exe_hint
        return (
            f"Ollama no responde en {self.ollama_url}.\n"
            f"Opciones para arrancarlo:\n"
            f"  Desde Nucleus:  {exe_path} serve\n"
            f"  Desde sistema:  ollama serve"
        )
