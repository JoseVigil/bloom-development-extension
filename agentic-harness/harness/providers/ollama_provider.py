"""Arm de Ollama del harness — SOLO genera embeddings.

Mirror deliberado de ../../../brain/core/bisp/ollama_manager.py
(OllamaManager real): mismo endpoint (/api/embeddings), mismo modelo
(nomic-embed-text), misma dimensión (768), mismo timeout (30s), mismo
patrón de factory (`from_nucleus_path`) y de auto-arranque opcional.

Dos diferencias deliberadas respecto al original:

1. El contrato se recorta a lo que este harness necesita — nunca
   chat/generate. Ver ../../context/DECISION-ollama-role.md.
2. Levanta ProviderError con el ErrorCode real del catálogo
   (AI_EXECUTION_OLLAMA_NOT_RUNNING / AI_EXECUTION_OLLAMA_MODEL_MISSING)
   en vez de RuntimeError con texto libre, para que Piezas 2/3 puedan
   inspeccionar el código sin parsear mensajes.
"""

from __future__ import annotations

import logging
import os
import platform
import subprocess
import time
from pathlib import Path

import requests

from harness.contracts.errors import ProviderError
from harness.providers.base import EmbeddingProviderArm, ProviderHealth

logger = logging.getLogger(__name__)

OLLAMA_DEFAULT_URL = "http://localhost:11434"
EMBEDDING_MODEL = "nomic-embed-text"
EMBEDDING_DIM = 768

# Path relativo del exe embebido dentro de BloomNucleus, por plataforma.
# Windows confirmado en ollama_manager.py real (OLLAMA_RELATIVE_PATH).
# Linux confirmado en este equipo (ver CLAUDE.md — agentic-harness/CLAUDE.md
# §Pieza 1): ~/.local/share/BloomNucleus/bin/ollama/ollama.
_RELATIVE_EXE_BY_PLATFORM: dict[str, str] = {
    "Windows": "bin/ollama/ollama.exe",
    "Linux": "bin/ollama/ollama",
    "Darwin": "bin/ollama/ollama",
}

# Base real del Nucleus local en esta máquina (Linux). No hardcodear
# organización/proyecto acá — esto es infraestructura de plataforma
# (dónde vive el binario embebido), no dato de negocio.
_DEFAULT_LINUX_MACOS_BASE = Path.home() / ".local" / "share" / "BloomNucleus"


class OllamaEmbeddingProvider(EmbeddingProviderArm):
    id = "ollama"
    capabilities = ("local",)

    def __init__(
        self,
        ollama_url: str = OLLAMA_DEFAULT_URL,
        ollama_exe: str | Path | None = None,
        auto_start: bool = False,
    ) -> None:
        self.ollama_url = ollama_url.rstrip("/")
        self.ollama_exe = Path(ollama_exe) if ollama_exe else None
        self.auto_start = auto_start

    # ------------------------------------------------------------------
    # Factory methods — mismo patrón que OllamaManager.from_nucleus_path
    # ------------------------------------------------------------------

    @classmethod
    def from_nucleus_path(
        cls,
        bloom_base: str | Path,
        *,
        auto_start: bool = False,
    ) -> "OllamaEmbeddingProvider":
        """Crea el provider sabiendo la base del Nucleus (bloom_base)."""
        bloom_path = Path(bloom_base).expanduser()
        relative = _RELATIVE_EXE_BY_PLATFORM.get(
            platform.system(), _RELATIVE_EXE_BY_PLATFORM["Linux"]
        )
        ollama_exe = bloom_path / relative

        if not ollama_exe.exists():
            logger.warning(
                "Ollama exe no encontrado en: %s — se usará PATH del sistema.",
                ollama_exe,
            )
            ollama_exe = None

        return cls(
            ollama_url=OLLAMA_DEFAULT_URL,
            ollama_exe=ollama_exe,
            auto_start=auto_start,
        )

    @classmethod
    def from_default_nucleus_path(cls, *, auto_start: bool = False) -> "OllamaEmbeddingProvider":
        """Instalación local default en Linux/macOS: ~/.local/share/BloomNucleus."""
        return cls.from_nucleus_path(_DEFAULT_LINUX_MACOS_BASE, auto_start=auto_start)

    # ------------------------------------------------------------------
    # Embedding generation — contrato principal
    # ------------------------------------------------------------------

    def generate_embedding(self, text: str) -> list[float]:
        """
        Genera embedding vectorial para un texto.

        Raises:
            ValueError: Si el texto está vacío.
            ProviderError: AI_EXECUTION_OLLAMA_NOT_RUNNING,
                AI_EXECUTION_OLLAMA_MODEL_MISSING, AI_TIMEOUT o
                AI_EXECUTION_STREAM_ERROR según la falla.
        """
        if not text or not text.strip():
            raise ValueError("El texto para embedding no puede estar vacío.")

        if self.auto_start:
            self._ensure_running()

        text_trimmed = text[:8000]

        try:
            response = requests.post(
                f"{self.ollama_url}/api/embeddings",
                json={"model": EMBEDDING_MODEL, "prompt": text_trimmed},
                timeout=30,
            )
            response.raise_for_status()
        except requests.ConnectionError:
            raise ProviderError.from_code(
                "AI_EXECUTION_OLLAMA_NOT_RUNNING",
                self._connection_error_message(),
            )
        except requests.HTTPError as exc:
            if exc.response is not None and exc.response.status_code == 404:
                raise ProviderError.from_code(
                    "AI_EXECUTION_OLLAMA_MODEL_MISSING",
                    f"Modelo '{EMBEDDING_MODEL}' no encontrado en Ollama.",
                    details={"pull_command": f"ollama pull {EMBEDDING_MODEL}"},
                )
            raise ProviderError.from_code(
                "AI_EXECUTION_STREAM_ERROR", f"Ollama HTTP error: {exc}"
            )
        except requests.Timeout:
            raise ProviderError.from_code(
                "AI_TIMEOUT",
                "Timeout esperando embedding de Ollama (>30s). "
                "El modelo puede estar cargándose por primera vez.",
            )

        data = response.json()
        embedding = data.get("embedding")

        if not embedding or len(embedding) != EMBEDDING_DIM:
            raise ProviderError.from_code(
                "AI_EXECUTION_STREAM_ERROR",
                f"Embedding inválido: se esperaban {EMBEDDING_DIM} dims, "
                f"se recibieron {len(embedding) if embedding else 0}.",
            )

        logger.debug(
            "Embedding generado: %d dims para texto de %d chars", EMBEDDING_DIM, len(text)
        )
        return embedding

    def generate_embedding_batch(self, texts: list[str]) -> list[list[float]]:
        """Genera embeddings para una lista de textos. Secuencial."""
        return [self.generate_embedding(t) for t in texts]

    # ------------------------------------------------------------------
    # Process management
    # ------------------------------------------------------------------

    def _ensure_running(self) -> None:
        if self._is_running():
            return

        if not self.auto_start:
            raise ProviderError.from_code(
                "AI_EXECUTION_OLLAMA_NOT_RUNNING", self._connection_error_message()
            )

        if self.ollama_exe is None or not self.ollama_exe.exists():
            raise ProviderError.from_code(
                "AI_EXECUTION_OLLAMA_NOT_RUNNING",
                f"Ollama no está corriendo y no se puede auto-arrancar "
                f"(exe no configurado).\n{self._connection_error_message()}",
            )

        logger.info("Arrancando Ollama: %s serve", self.ollama_exe)
        try:
            subprocess.Popen(
                [str(self.ollama_exe), "serve"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
            )
            for _ in range(20):
                time.sleep(0.5)
                if self._is_running():
                    logger.info("Ollama arrancado exitosamente.")
                    return
            raise ProviderError.from_code(
                "AI_EXECUTION_OLLAMA_NOT_RUNNING",
                "Ollama arrancó pero no respondió en 10s. Verificá logs del proceso.",
            )
        except FileNotFoundError:
            raise ProviderError.from_code(
                "AI_EXECUTION_OLLAMA_NOT_RUNNING",
                f"No se pudo ejecutar: {self.ollama_exe}\n"
                "Verificá que el archivo existe y tiene permisos de ejecución.",
            )

    def _is_running(self) -> bool:
        try:
            resp = requests.get(f"{self.ollama_url}/api/tags", timeout=3)
            return resp.status_code == 200
        except (requests.ConnectionError, requests.Timeout):
            return False

    # ------------------------------------------------------------------
    # Model management
    # ------------------------------------------------------------------

    def ensure_model(self) -> None:
        """
        Verifica que nomic-embed-text está disponible. No descarga
        automáticamente — levanta ProviderError con instrucciones claras.
        """
        health = self.health()
        if health.status == "error":
            raise ProviderError.from_code(
                "AI_EXECUTION_OLLAMA_NOT_RUNNING",
                health.detail.get("error", "Ollama no responde."),
            )
        if health.status == "model_missing":
            exe_hint = (
                f"\n  Desde Nucleus: {self.ollama_exe} pull {EMBEDDING_MODEL}"
                if self.ollama_exe
                else ""
            )
            raise ProviderError.from_code(
                "AI_EXECUTION_OLLAMA_MODEL_MISSING",
                f"Modelo '{EMBEDDING_MODEL}' no está descargado en Ollama.\n"
                f"Ejecutá: ollama pull {EMBEDDING_MODEL}{exe_hint}",
                details={"pull_command": f"ollama pull {EMBEDDING_MODEL}"},
            )

    # ------------------------------------------------------------------
    # Health
    # ------------------------------------------------------------------

    def health(self) -> ProviderHealth:
        try:
            resp = requests.get(f"{self.ollama_url}/api/tags", timeout=5)
            resp.raise_for_status()
            models = [m["name"] for m in resp.json().get("models", [])]
            model_available = any(EMBEDDING_MODEL in m for m in models)
            return ProviderHealth(
                status="ok" if model_available else "model_missing",
                provider="ollama",
                detail={
                    "ollama_url": self.ollama_url,
                    "ollama_exe": str(self.ollama_exe) if self.ollama_exe else None,
                    "model": EMBEDDING_MODEL,
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
                    "ollama_exe": str(self.ollama_exe) if self.ollama_exe else None,
                    "error": self._connection_error_message(),
                },
            )
        except Exception as exc:
            return ProviderHealth(status="error", provider="ollama", detail={"error": str(exc)})

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _connection_error_message(self) -> str:
        lines = [
            f"Ollama no responde en {self.ollama_url}.",
            "Opciones para arrancarlo:",
        ]
        if self.ollama_exe and self.ollama_exe.exists():
            lines.append(f"  Desde Nucleus:  {self.ollama_exe} serve")
        lines.append("  Desde sistema:   ollama serve")
        lines.append(
            "  Nota: Ollama puede estar gestionado por BloomNucleus como servicio."
        )
        return "\n".join(lines)
