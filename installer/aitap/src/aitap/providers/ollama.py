"""Transporte minimo a la API local de Ollama, solo loopback.

Frontera de incertidumbre (Enmienda 1 y contrato de route supply local):

- ``inspect`` (GET /api/tags) ocurre ANTES de enviar el pedido al modelo. Sus
  fallas nunca son inciertas: el modelo no recibio nada.
- ``generate`` (POST /api/chat) es el envio. Cualquier falla una vez iniciado
  el POST se trata como INCIERTA (criterio conservador): el pedido pudo haber
  llegado al modelo y nunca debe reenviarse.

El payload es opaco: se envia como un unico mensaje de usuario, igual que el
transporte de Anthropic. AITAP no interpreta la respuesta.
"""
from __future__ import annotations

import json
import re
import socket
import urllib.error
import urllib.request

from .base import ProviderResult, SupplyError

LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "::1", "[::1]"}
DEFAULT_HOST = "127.0.0.1:11434"
_HEX64 = re.compile(r"^[0-9a-f]{64}$")


def normalize_digest(value) -> str | None:
    """Digest de /api/tags -> 64 hex minusculas sin prefijo, o None si no es valido."""
    if not isinstance(value, str):
        return None
    if value.startswith("sha256:"):
        value = value[len("sha256:"):]
    return value if _HEX64.match(value) else None


def loopback_base(host: str | None) -> str:
    """Normaliza el host de Ollama y rechaza todo lo que no sea loopback."""
    host = (host or DEFAULT_HOST).strip()
    for scheme in ("http://", "https://"):
        if host.startswith(scheme):
            host = host[len(scheme):]
    host = host.rstrip("/")
    if host.startswith("["):
        hostname = host[: host.find("]") + 1]
    elif host.count(":") == 1:
        hostname = host.split(":", 1)[0]
    else:
        hostname = host
    if hostname == host:
        host = f"{host}:11434"
    if hostname not in LOOPBACK_HOSTS:
        raise SupplyError("PROVIDER_UNAVAILABLE", "provider", "Ollama host must be loopback")
    return f"http://{host}"


def _pre_send(code: str, message: str | None = None) -> SupplyError:
    error = SupplyError(code, "provider", message)
    error.retryable = code == "PROVIDER_UNAVAILABLE"
    return error


def _uncertain(code: str, message: str | None = None) -> SupplyError:
    error = SupplyError(code, "provider", message, uncertain=True)
    error.retryable = False  # un envio incierto nunca se reintenta
    return error


class OllamaProvider:
    def __init__(self, host: str | None = None, opener=None):
        self.base = loopback_base(host)
        self.opener = opener or urllib.request.urlopen

    def inspect(self, *, model: str, timeout: float) -> str:
        """Antes de enviar: el modelo exacto debe estar instalado con digest valido."""
        try:
            with self.opener(urllib.request.Request(self.base + "/api/tags", method="GET"),
                             timeout=timeout) as response:
                listed = json.loads(response.read()).get("models", [])
        except (urllib.error.URLError, OSError, socket.timeout, TimeoutError, ValueError, AttributeError):
            raise _pre_send("PROVIDER_UNAVAILABLE", "Ollama not reachable before send") from None
        entry = next((m for m in listed if isinstance(m, dict) and (m.get("name") or m.get("model")) == model), None)
        if entry is None:
            raise _pre_send("MODEL_NOT_INSTALLED", "Pinned model is not installed in Ollama")
        observed = normalize_digest(entry.get("digest"))
        if observed is None:
            raise _pre_send("MODEL_DIGEST_MISMATCH", "Installed model has no valid manifest digest")
        return observed

    def generate(self, *, payload, model: str, max_tokens: int, timeout: float,
                 options: dict | None = None, response_format=None, keep_alive=None) -> ProviderResult:
        body = {"model": model, "stream": False,
                "messages": [{"role": "user", "content": json.dumps(payload, ensure_ascii=False, allow_nan=False)}],
                "options": {**(options or {}), "num_predict": max_tokens}}
        if response_format is not None:
            body["format"] = response_format
        if keep_alive is not None:
            body["keep_alive"] = keep_alive
        request = urllib.request.Request(self.base + "/api/chat", data=json.dumps(body).encode("utf-8"),
                                         headers={"Content-Type": "application/json"}, method="POST")
        try:
            with self.opener(request, timeout=timeout) as response:
                data = json.loads(response.read())
        except urllib.error.HTTPError as exc:
            raise _uncertain("PROVIDER_UNAVAILABLE", f"Ollama HTTP {exc.code} after send") from None
        except (TimeoutError, socket.timeout):
            raise _uncertain("PROVIDER_TIMEOUT", "Ollama timed out after send") from None
        except (urllib.error.URLError, OSError):
            raise _uncertain("PROVIDER_UNAVAILABLE", "Ollama connection failed after send") from None
        except (ValueError, TypeError):
            raise _uncertain("RAW_RESPONSE_MISMATCH", "Ollama returned invalid JSON") from None
        try:
            message = data["message"]
            counts = [data["prompt_eval_count"], data["eval_count"]]
            if (data["model"] != model or data.get("done") is not True or not isinstance(message, dict)
                    or not isinstance(message.get("content"), str)
                    or any(type(n) is not int or n < 0 for n in counts)):
                raise ValueError()
        except (KeyError, TypeError, ValueError):
            raise _uncertain("RAW_RESPONSE_MISMATCH", "Ollama response has an unexpected shape") from None
        return ProviderResult(message["content"], counts[0], counts[1], data["model"], "")
