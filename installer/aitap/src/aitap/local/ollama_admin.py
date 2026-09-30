"""Administracion de modelos en el servidor local de Ollama: solo ``POST /api/pull``.

La inspeccion (``/api/tags``) y la inferencia (``/api/chat``) viven en
``aitap.providers.ollama.OllamaProvider``; este modulo no las duplica.

- Solo loopback (mismo normalizador que el provider).
- La referencia a descargar sale siempre del catalogo empaquetado.
- Los pesos los escribe el servidor de Ollama; AITAP no escribe ni mueve pesos.
- El progreso que devuelve el stream es una indicacion; la verdad es la
  observacion posterior de ``/api/tags`` con el digest del catalogo.
"""
from __future__ import annotations

import json
import socket
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Callable

from aitap.providers.base import SupplyError
from aitap.providers.ollama import loopback_base

Progress = Callable[[dict[str, Any]], None]


@dataclass(frozen=True)
class PullOutcome:
    status: str
    bytes_completed: int
    bytes_total: int


def _failed(code: str, message: str, *, retryable: bool) -> SupplyError:
    error = SupplyError(code, "provision", message)
    error.retryable = retryable
    return error


class OllamaAdmin:
    def __init__(self, host: str | None = None, opener=None):
        self.base = loopback_base(host)
        self.opener = opener or urllib.request.urlopen

    def pull(self, *, model: str, on_progress: Progress | None = None, read_timeout: float = 120) -> PullOutcome:
        """Pide al servidor de Ollama que descargue ``model`` y consume el stream de progreso."""
        body = json.dumps({"model": model, "stream": True}).encode("utf-8")
        request = urllib.request.Request(self.base + "/api/pull", data=body,
                                         headers={"Content-Type": "application/json"}, method="POST")
        completed = total = 0
        status = ""
        try:
            with self.opener(request, timeout=read_timeout) as response:
                for raw in response:
                    line = raw.decode("utf-8", errors="replace").strip() if isinstance(raw, bytes) else str(raw).strip()
                    if not line:
                        continue
                    event = json.loads(line)
                    if not isinstance(event, dict):
                        raise ValueError()
                    if "error" in event:
                        raise _failed("PULL_FAILED", "Ollama rejected the pull", retryable=True)
                    status = str(event.get("status", ""))
                    if isinstance(event.get("total"), int) and event["total"] >= 0:
                        total = event["total"]
                    if isinstance(event.get("completed"), int) and event["completed"] >= 0:
                        completed = event["completed"]
                    if on_progress is not None:
                        on_progress({"status": status, "bytes_completed": completed, "bytes_total": total})
        except SupplyError:
            raise
        except urllib.error.HTTPError as exc:
            raise _failed("PULL_FAILED", f"Ollama HTTP {exc.code} on pull", retryable=exc.code >= 500) from None
        except (TimeoutError, socket.timeout):
            raise _failed("PULL_INTERRUPTED", "Ollama pull timed out", retryable=True) from None
        except (urllib.error.URLError, OSError):
            raise _failed("PROVIDER_UNAVAILABLE", "Ollama not reachable for pull", retryable=True) from None
        except (ValueError, TypeError):
            raise _failed("PULL_FAILED", "Ollama pull stream is not valid JSON lines", retryable=True) from None
        if status != "success":
            raise _failed("PULL_INTERRUPTED", "Ollama pull ended without success", retryable=True)
        return PullOutcome(status=status, bytes_completed=completed, bytes_total=total)
