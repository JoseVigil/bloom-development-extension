"""Servidor local de Alfred — HTTP + WebSocket, para consumo desde Core.

Por qué existe: el pipe `bloom.ai.execution.*` de Core (WebSocketManager.ts
+ contracts/types.ts + contracts/state-machines.ts) ya está bien diseñado
y cableado punta a punta hacia el browser, pero su punto de ejecución real
está roto — `OllamaNativeAdapter.ts` shellea `brain ollama chat --json`,
comando que no existe en `brain/`, y encima fake-chunkea palabra por
palabra una respuesta que nunca llegó a generarse. Este servidor es el
motor real al que `OllamaNativeAdapter.ts` debe apuntar en su lugar — no
reemplaza el pipe de Core, lo completa.

Puerto: env var `ALFRED_SERVER_PORT`, default 48219. Elegido para no
colisionar con 48215 (API TS de Core), 48216 (Alfred-Go, REST+WS
combinados en un solo `ListenAndServe`, ver `alfred_server.go`), ni con
4124 (WS de Core hacia el browser). Se evita a propósito 48217: es el
puerto que el log de `nucleus alfred start` menciona para el WS pero que
en realidad nunca abre (bug ya documentado) — usarlo acá sumaría
confusión sobre cuál "48217" es cuál.

Streaming real solo para Ollama (`WS /ws/chat`) — es el único arm con
capability "streaming" (`OllamaTextProvider.capabilities`). Gemini es
opt-in, transicional, y se sirve únicamente por `POST /chat` (respuesta
completa): no se justifica construir un segundo path de streaming para
un proveedor que va a dejar de llamarse directo en cuanto AITAP tenga
motor de ruteo (ver `src/alfred/aitap/`).

Uso:
    cd installer/alfred
    pip install -e ".[server]" --break-system-packages
    PYTHONPATH=src uvicorn alfred.server:app --port 48219
"""

from __future__ import annotations

import logging
import os
from dataclasses import asdict

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from alfred.contracts.errors import ProviderError
from alfred.contracts.types import AIPromptPayload, AIProviderId, PromptContext
from alfred.health import collect_health
from alfred.providers.base import TextGenerationProviderArm
from alfred.providers.gemini_provider import GeminiTextProvider
from alfred.providers.ollama_text_provider import OllamaTextProvider

logger = logging.getLogger(__name__)

DEFAULT_PORT = 48219

app = FastAPI(title="alfred-chat", version="0.1.0")


class ChatRequest(BaseModel):
    """Mismo shape que `AIPromptPayload` (contracts/types.ts), en camelCase
    porque quien llama es TS — se traduce a snake_case al construir el
    payload interno."""

    context: PromptContext = "general"
    text: str
    intentId: str | None = None
    profileId: str | None = None
    provider: AIProviderId = "ollama"
    metadata: dict | None = None


def _build_provider(name: AIProviderId) -> TextGenerationProviderArm:
    if name == "gemini":
        return GeminiTextProvider()
    return OllamaTextProvider()


def _to_payload(req: ChatRequest) -> AIPromptPayload:
    return AIPromptPayload(
        context=req.context,
        text=req.text,
        intent_id=req.intentId,
        profile_id=req.profileId,
        provider=req.provider,
        metadata=req.metadata,
    )


def _provider_error_response(exc: ProviderError) -> JSONResponse:
    return JSONResponse(
        {
            "error_code": exc.response.error_code,
            "message": exc.response.message,
            "recoverable": exc.response.recoverable,
            "details": exc.response.details,
        },
        status_code=502,
    )


@app.get("/health")
def health() -> JSONResponse:
    """Espejo JSON de `scripts/check_health.py` — mismos tres arms, misma
    lógica compartida (`alfred.health.collect_health`), para que Core
    pueda mostrar en la UI si Alfred está disponible antes de dejar
    escribir al usuario."""
    data = {name: asdict(h) for name, h in collect_health().items()}
    return JSONResponse(data)


@app.post("/chat")
def chat(req: ChatRequest) -> JSONResponse:
    """Respuesta completa, sin streaming. Sirve a cualquier provider
    (ollama o gemini) — es el camino simple para un consumidor que no
    necesita ver los tokens llegar en vivo."""
    provider = _build_provider(req.provider)
    payload = _to_payload(req)
    try:
        response_text = provider.generate_text(payload)
    except ProviderError as exc:
        return _provider_error_response(exc)
    return JSONResponse({"response": response_text, "provider": req.provider})


@app.websocket("/ws/chat")
async def ws_chat(websocket: WebSocket) -> None:
    """Streaming real, solo Ollama. Protocolo mínimo, un turno por conexión:

    Cliente envía (JSON, un solo mensaje):
        {"text": "...", "context": "general", "intentId": null,
         "profileId": null, "metadata": null}

    Servidor responde con una secuencia de mensajes JSON:
        {"type": "chunk", "text": "fragmento"}   (0 o más)
        {"type": "done"}                          (al terminar bien)
        {"type": "error", "error_code": "...", "message": "..."}  (si falla)

    Deliberadamente no usa el envelope {type, payload, timestamp} de
    Alfred-Go (alfred_server.go) — ese es el canal de gobernanza/firma,
    un dominio distinto. Este es un protocolo propio, chico, scopeado
    a un solo turno de chat streamed. Quien traduce esto al envelope
    `bloom.ai.execution.*` de Core es `OllamaNativeAdapter.ts`, no este
    servidor — Alfred no necesita saber nada de ese contrato.
    """
    await websocket.accept()
    try:
        raw = await websocket.receive_json()
    except Exception:
        await websocket.send_json(
            {"type": "error", "error_code": "AI_EXECUTION_PROMPT_INVALID", "message": "JSON inválido."}
        )
        await websocket.close()
        return

    text = raw.get("text", "")
    payload = AIPromptPayload(
        context=raw.get("context", "general"),
        text=text,
        intent_id=raw.get("intentId"),
        profile_id=raw.get("profileId"),
        provider="ollama",
        metadata=raw.get("metadata"),
    )

    provider = OllamaTextProvider()
    try:
        for fragment in provider.generate_text_stream(payload):
            await websocket.send_json({"type": "chunk", "text": fragment})
        await websocket.send_json({"type": "done"})
    except ProviderError as exc:
        await websocket.send_json(
            {
                "type": "error",
                "error_code": exc.response.error_code,
                "message": exc.response.message,
            }
        )
    except WebSocketDisconnect:
        logger.info("Cliente desconectado a mitad de stream.")
    finally:
        try:
            await websocket.close()
        except RuntimeError:
            pass  # ya cerrado (p. ej. por WebSocketDisconnect)


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("ALFRED_SERVER_PORT", DEFAULT_PORT))
    uvicorn.run(app, host="127.0.0.1", port=port)
