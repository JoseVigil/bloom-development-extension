"""
BISP — Bloom Intent Semantic Package
core/bisp/ollama_manager.py

Gestiona el proceso Ollama embebido del Nucleus.
Sabe dónde está el exe, verifica que corre, y arranca si es necesario.

Contrato: Brain es el único orquestador.
  Brain → OllamaManager → genera vector
  Brain → BISPChromaClient → almacena/consulta
  Nunca ChromaDB llama a Ollama por su cuenta.
"""

from __future__ import annotations

import logging
import os
import subprocess
import time
from pathlib import Path
from typing import Any

import requests

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constantes
# ---------------------------------------------------------------------------

OLLAMA_DEFAULT_URL = "http://localhost:11434"
EMBEDDING_MODEL = "nomic-embed-text"
EMBEDDING_DIM = 768

# Ruta relativa dentro del Nucleus cuando no se conoce la ruta absoluta
OLLAMA_RELATIVE_PATH = "bin/ollama/ollama.exe"


# ---------------------------------------------------------------------------
# OllamaManager
# ---------------------------------------------------------------------------

class OllamaManager:
    """
    Gestiona el proceso Ollama embebido en el Nucleus de Bloom.

    Responsabilidades:
    - Ubicar el exe de Ollama (desde nucleus.json o path explícita)
    - Verificar que el proceso está corriendo en localhost:11434
    - Arrancar Ollama si no está activo (opcional, configurable)
    - Generar embeddings vectoriales para Brain
    - Reportar health con contexto claro para el usuario

    Contrato de uso:
        manager = OllamaManager.from_nucleus_path("C:/Users/.../BloomNucleus")
        vector = manager.generate_embedding("refactorizar autenticación JWT")
    """

    def __init__(
        self,
        ollama_url: str = OLLAMA_DEFAULT_URL,
        ollama_exe: str | Path | None = None,
        auto_start: bool = False,
    ) -> None:
        """
        Args:
            ollama_url: URL donde Ollama escucha (default: http://localhost:11434)
            ollama_exe: Path al ejecutable de Ollama. Si es None, no puede auto-arrancar.
            auto_start: Si True, intenta arrancar Ollama cuando no está corriendo.
        """
        self.ollama_url = ollama_url.rstrip("/")
        self.ollama_exe = Path(ollama_exe) if ollama_exe else None
        self.auto_start = auto_start

    # ------------------------------------------------------------------
    # Factory methods
    # ------------------------------------------------------------------

    @classmethod
    def from_nucleus_path(
        cls,
        bloom_base: str | Path,
        *,
        auto_start: bool = False,
    ) -> "OllamaManager":
        """
        Crea un OllamaManager sabiendo la base del Nucleus.

        Args:
            bloom_base: Path base de BloomNucleus
                        e.g. "C:/Users/josev/AppData/Local/BloomNucleus"
            auto_start: Si True, arranca Ollama automáticamente si no está corriendo.
        """
        bloom_path = Path(bloom_base)
        ollama_exe = bloom_path / OLLAMA_RELATIVE_PATH

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
    def from_nucleus_json(
        cls,
        nucleus_json_path: str | Path,
        *,
        auto_start: bool = False,
    ) -> "OllamaManager":
        """
        Crea un OllamaManager leyendo la ruta del exe desde nucleus.json.

        Args:
            nucleus_json_path: Path al nucleus.json del Nucleus instalado.
        """
        import json

        path = Path(nucleus_json_path)
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            ollama_exe = data.get("system_map", {}).get("ollama_exe")
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("No se pudo leer nucleus.json: %s", exc)
            ollama_exe = None

        return cls(
            ollama_url=OLLAMA_DEFAULT_URL,
            ollama_exe=ollama_exe,
            auto_start=auto_start,
        )

    # ------------------------------------------------------------------
    # Embedding generation — contrato principal con Brain
    # ------------------------------------------------------------------

    def generate_embedding(self, text: str) -> list[float]:
        """
        Genera embedding vectorial para un texto.

        Este es el contrato que Brain usa en cada punto de vectorización:
            vector = manager.generate_embedding(objective_text)

        Args:
            text: Texto a vectorizar. Se trunca a 8000 chars internamente.

        Returns:
            Lista de 768 floats (nomic-embed-text dim).

        Raises:
            RuntimeError: Si Ollama no está disponible o el modelo no existe.
            ValueError: Si el texto está vacío.
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
            raise RuntimeError(self._connection_error_message())
        except requests.HTTPError as exc:
            if exc.response is not None and exc.response.status_code == 404:
                raise RuntimeError(
                    f"Modelo '{EMBEDDING_MODEL}' no encontrado en Ollama.\n"
                    f"Ejecutá: ollama pull {EMBEDDING_MODEL}\n"
                    f"O desde el Nucleus: {self.ollama_exe} pull {EMBEDDING_MODEL}"
                )
            raise RuntimeError(f"Ollama HTTP error: {exc}")
        except requests.Timeout:
            raise RuntimeError(
                "Timeout esperando embedding de Ollama (>30s). "
                "El modelo puede estar cargándose por primera vez."
            )

        data = response.json()
        embedding = data.get("embedding")

        if not embedding or len(embedding) != EMBEDDING_DIM:
            raise RuntimeError(
                f"Embedding inválido: se esperaban {EMBEDDING_DIM} dims, "
                f"se recibieron {len(embedding) if embedding else 0}."
            )

        logger.debug("Embedding generado: %d dims para texto de %d chars", EMBEDDING_DIM, len(text))
        return embedding

    def generate_embedding_batch(self, texts: list[str]) -> list[list[float]]:
        """
        Genera embeddings para una lista de textos. Secuencial.

        Args:
            texts: Lista de textos a vectorizar.

        Returns:
            Lista de embeddings en el mismo orden.
        """
        return [self.generate_embedding(t) for t in texts]

    # ------------------------------------------------------------------
    # Process management
    # ------------------------------------------------------------------

    def _ensure_running(self) -> None:
        """
        Verifica que Ollama está corriendo. Si no, intenta arrancarlo.
        Solo actúa si auto_start=True y ollama_exe está configurado.
        """
        if self._is_running():
            return

        if not self.auto_start:
            raise RuntimeError(self._connection_error_message())

        if self.ollama_exe is None or not self.ollama_exe.exists():
            raise RuntimeError(
                f"Ollama no está corriendo y no se puede auto-arrancar "
                f"(exe no configurado).\n{self._connection_error_message()}"
            )

        logger.info("Arrancando Ollama: %s serve", self.ollama_exe)
        try:
            subprocess.Popen(
                [str(self.ollama_exe), "serve"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
            )
            # Esperar que esté listo (máx 10s)
            for _ in range(20):
                time.sleep(0.5)
                if self._is_running():
                    logger.info("Ollama arrancado exitosamente.")
                    return
            raise RuntimeError(
                "Ollama arrancó pero no respondió en 10s. "
                "Verificá logs del proceso."
            )
        except FileNotFoundError:
            raise RuntimeError(
                f"No se pudo ejecutar: {self.ollama_exe}\n"
                "Verificá que el archivo existe y tiene permisos de ejecución."
            )

    def _is_running(self) -> bool:
        """Verifica si Ollama responde en la URL configurada."""
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
        Verifica que el modelo nomic-embed-text está disponible en Ollama.
        No descarga automáticamente — da instrucciones claras si falta.

        Raises:
            RuntimeError: Si Ollama no responde o el modelo no está instalado.
        """
        health = self.health()
        if health["status"] == "error":
            raise RuntimeError(health["error"])
        if not health.get("model_available"):
            exe_hint = (
                f"\n  Desde Nucleus: {self.ollama_exe} pull {EMBEDDING_MODEL}"
                if self.ollama_exe else ""
            )
            raise RuntimeError(
                f"Modelo '{EMBEDDING_MODEL}' no está descargado en Ollama.\n"
                f"Ejecutá: ollama pull {EMBEDDING_MODEL}{exe_hint}\n"
                "Este pull se hace una sola vez y queda disponible localmente."
            )

    # ------------------------------------------------------------------
    # Health
    # ------------------------------------------------------------------

    def health(self) -> dict[str, Any]:
        """
        Estado completo del sistema Ollama para health checks.

        Returns:
            Dict con status, url, modelo disponible, modelos instalados.
        """
        try:
            resp = requests.get(f"{self.ollama_url}/api/tags", timeout=5)
            resp.raise_for_status()
            models = [m["name"] for m in resp.json().get("models", [])]
            model_available = any(EMBEDDING_MODEL in m for m in models)
            return {
                "status": "ok" if model_available else "model_missing",
                "ollama_url": self.ollama_url,
                "ollama_exe": str(self.ollama_exe) if self.ollama_exe else None,
                "model": EMBEDDING_MODEL,
                "model_available": model_available,
                "installed_models": models,
            }
        except requests.ConnectionError:
            return {
                "status": "error",
                "ollama_url": self.ollama_url,
                "ollama_exe": str(self.ollama_exe) if self.ollama_exe else None,
                "error": self._connection_error_message(),
            }
        except Exception as exc:
            return {"status": "error", "error": str(exc)}

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _connection_error_message(self) -> str:
        """Genera mensaje de error con instrucciones contextuales."""
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
