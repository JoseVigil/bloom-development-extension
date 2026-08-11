"""Arm de Gemini de Alfred — el único que genera texto/razonamiento real.

Ollama local solo hace embeddings, Gemini es el único arm que produce lo
que el usuario final lee como "respuesta de Alfred" (heredado de
agentic-harness/context/DECISION-ollama-role.md).

Llama directo a la API REST de Gemini (`generateContent`), mismo endpoint
y forma de payload que usa el motor real de Bloom en
brain/core/context_planning/gemini_router.py
(GeminiRouter._call_gemini_api: contents/parts/text, generationConfig con
temperature/maxOutputTokens) — en vez de depender de un SDK:

- `google-generativeai` es un paquete deprecado (FutureWarning al
  importarlo, confirmado 2026-08-05).
- `google-genai` (su reemplazo) no está instalado acá.
- El propio código real de Bloom para este tipo de llamada
  (gemini_router.py) ya usa REST directo con aiohttp, no el SDK — este
  módulo sigue esa misma convención con `requests` (síncrono, consistente
  con ollama_provider.py).

Credencial: variable de entorno GEMINI_API_KEY, o pasada explícita al
constructor. Deliberadamente NO se integra acá con
brain.shared.credentials.GeminiKeyManager — ese manager guarda claves en el
vault del Nucleus real (keyring del SO), que es infraestructura de
autoridad de Brain. `brain gemini keys-list` sirve para chequear si ya hay
una clave real cargada ahí que se pueda exportar como env var.

Migrado desde agentic-harness/harness/providers/gemini_provider.py sin
cambios de lógica, solo de ubicación e import interno (2026-08-09).
"""

from __future__ import annotations

import logging
import os

import requests

from alfred.contracts.errors import ProviderError
from alfred.contracts.types import AIPromptPayload
from alfred.providers.base import ProviderHealth, TextGenerationProviderArm

logger = logging.getLogger(__name__)

API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
MODELS_LIST_URL = "https://generativelanguage.googleapis.com/v1beta/models"
DEFAULT_MODEL = "gemini-1.5-flash"
DEFAULT_TIMEOUT_SECONDS = 120


class GeminiTextProvider(TextGenerationProviderArm):
    id = "gemini"
    capabilities = ("auth-required",)

    def __init__(
        self,
        api_key: str | None = None,
        model: str = DEFAULT_MODEL,
        timeout: int = DEFAULT_TIMEOUT_SECONDS,
    ) -> None:
        self.api_key = api_key or os.environ.get("GEMINI_API_KEY")
        self.model = model
        self.timeout = timeout

    def generate_text(self, payload: AIPromptPayload) -> str:
        """
        Genera texto real para `payload.text`.

        Raises:
            ProviderError: AI_AUTH_FAILED (sin key o key rechazada),
                AI_EXECUTION_PROMPT_INVALID (prompt vacío), AI_RATE_LIMIT,
                AI_TIMEOUT, o AI_EXECUTION_STREAM_ERROR según la falla.
        """
        if not self.api_key:
            raise ProviderError.from_code(
                "AI_AUTH_FAILED",
                "No hay GEMINI_API_KEY configurada. Exportá la variable de "
                "entorno o pasá api_key explícito al constructor. Verificá si "
                "ya existe una clave real cargada con 'brain gemini keys-list'.",
            )
        if not payload.text or not payload.text.strip():
            raise ProviderError.from_code(
                "AI_EXECUTION_PROMPT_INVALID", "El prompt no puede estar vacío."
            )

        request_body = {
            "contents": [{"parts": [{"text": payload.text}]}],
            "generationConfig": {
                "temperature": 0.2,
                "maxOutputTokens": 8192,
            },
        }

        try:
            response = requests.post(
                f"{API_BASE}/{self.model}:generateContent",
                params={"key": self.api_key},
                json=request_body,
                headers={"Content-Type": "application/json"},
                timeout=self.timeout,
            )
        except requests.ConnectionError as exc:
            raise ProviderError.from_code(
                "AI_TIMEOUT", f"No se pudo conectar a Gemini: {exc}"
            )
        except requests.Timeout:
            raise ProviderError.from_code(
                "AI_TIMEOUT",
                f"Timeout esperando respuesta de Gemini (>{self.timeout}s).",
            )

        if response.status_code in (401, 403):
            raise ProviderError.from_code(
                "AI_AUTH_FAILED", f"Gemini rechazó la API key: {response.text}"
            )
        if response.status_code == 429:
            raise ProviderError.from_code(
                "AI_RATE_LIMIT", f"Rate limit de Gemini alcanzado: {response.text}"
            )
        if response.status_code != 200:
            raise ProviderError.from_code(
                "AI_EXECUTION_STREAM_ERROR",
                f"Gemini API error {response.status_code}: {response.text}",
            )

        data = response.json()
        try:
            return data["candidates"][0]["content"]["parts"][0]["text"]
        except (KeyError, IndexError) as exc:
            raise ProviderError.from_code(
                "AI_EXECUTION_STREAM_ERROR",
                f"Respuesta de Gemini con formato inesperado: {exc}",
            )

    def health(self) -> ProviderHealth:
        if not self.api_key:
            return ProviderHealth(
                status="error",
                provider="gemini",
                detail={"error": "GEMINI_API_KEY no configurada."},
            )
        try:
            response = requests.get(
                MODELS_LIST_URL, params={"key": self.api_key}, timeout=10
            )
            if response.status_code == 200:
                return ProviderHealth(
                    status="ok", provider="gemini", detail={"model": self.model}
                )
            return ProviderHealth(
                status="error",
                provider="gemini",
                detail={"error": f"API error: {response.status_code}"},
            )
        except Exception as exc:
            return ProviderHealth(status="error", provider="gemini", detail={"error": str(exc)})
