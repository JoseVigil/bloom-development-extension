"""Token-free health probes against official provider Models APIs."""

from __future__ import annotations

import hashlib
import json
import socket
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any, Mapping


MAX_RESPONSE_BYTES = 1 << 20
ANTHROPIC_API_VERSION = "2026-10-21"


@dataclass(frozen=True)
class ModelCatalogProbe:
    status: str
    origin: str
    reason: str | None
    proof: dict[str, Any]


def probe_cloud_model(backend: Mapping[str, Any], secret: str, *, opener=urllib.request.urlopen,
                      timeout: float = 5) -> ModelCatalogProbe:
    """Authenticate and retrieve one exact model resource; never generate content."""
    backend_id = backend.get("backend_id")
    provider = backend.get("provider")
    model = backend.get("model")
    if not all(isinstance(value, str) and value for value in (backend_id, provider, model, secret)):
        return ModelCatalogProbe("unavailable", "models_api.invalid", "HEALTH_PROBE_INVALID", {})
    if (backend_id, provider) == ("anthropic_api", "anthropic"):
        return _anthropic(model, secret, opener=opener, timeout=timeout)
    if (backend_id, provider) == ("gemini_api", "google"):
        return _gemini(model, secret, opener=opener, timeout=timeout)
    return ModelCatalogProbe("unknown", "models_api.unsupported", "HEALTH_PROBE_UNSUPPORTED", {})


def _anthropic(model: str, secret: str, *, opener, timeout: float) -> ModelCatalogProbe:
    url = "https://api.anthropic.com/v1/models/" + urllib.parse.quote(model, safe="")
    request = urllib.request.Request(url, headers={
        "Authorization": "Bearer " + secret,
        "anthropic-version": ANTHROPIC_API_VERSION,
        "content-type": "application/json",
        "accept": "application/json",
    }, method="GET")
    document, failure = _get_json(request, opener=opener, timeout=timeout,
                                  origin="anthropic.models.get")
    if failure is not None:
        return failure
    if (not isinstance(document, dict) or document.get("type") != "model"
            or document.get("id") != model
            or document.get("lifecycle") not in {"active", "deprecated", "retired"}):
        return ModelCatalogProbe("unavailable", "anthropic.models.get", "MODELS_API_RESPONSE_INVALID", {})
    lifecycle = document["lifecycle"]
    status = "healthy" if lifecycle == "active" else "degraded" if lifecycle == "deprecated" else "unavailable"
    return ModelCatalogProbe(status, "anthropic.models.get",
                             None if status == "healthy" else "MODEL_" + lifecycle.upper(),
                             _proof(document, {"id", "type", "lifecycle"}))


def _gemini(model: str, secret: str, *, opener, timeout: float) -> ModelCatalogProbe:
    expected_name = "models/" + model
    url = "https://generativelanguage.googleapis.com/v1beta/" + urllib.parse.quote(
        expected_name, safe="/")
    request = urllib.request.Request(url, headers={
        "x-goog-api-key": secret,
        "accept": "application/json",
    }, method="GET")
    document, failure = _get_json(request, opener=opener, timeout=timeout,
                                  origin="google.models.get")
    if failure is not None:
        return failure
    methods = document.get("supportedGenerationMethods") if isinstance(document, dict) else None
    if (not isinstance(document, dict) or document.get("name") != expected_name
            or not isinstance(methods, list) or "generateContent" not in methods
            or any(not isinstance(item, str) for item in methods)):
        return ModelCatalogProbe("unavailable", "google.models.get", "MODELS_API_RESPONSE_INVALID", {})
    return ModelCatalogProbe("healthy", "google.models.get", None,
                             _proof(document, {"name", "baseModelId", "version",
                                               "supportedGenerationMethods"}))


def _get_json(request: urllib.request.Request, *, opener, timeout: float,
              origin: str) -> tuple[Any | None, ModelCatalogProbe | None]:
    try:
        with opener(request, timeout=timeout) as response:
            raw = response.read(MAX_RESPONSE_BYTES + 1)
            if len(raw) > MAX_RESPONSE_BYTES:
                raise ValueError()
    except urllib.error.HTTPError as exc:
        reason = "PROVIDER_AUTH_FAILED" if exc.code in {401, 403} else (
            "MODEL_NOT_FOUND" if exc.code == 404 else "MODELS_API_HTTP_ERROR")
        return None, ModelCatalogProbe("unavailable", origin, reason, {"http_status": exc.code})
    except (urllib.error.URLError, OSError, socket.timeout, TimeoutError):
        return None, ModelCatalogProbe("unavailable", origin, "MODELS_API_UNAVAILABLE", {})
    try:
        return json.loads(raw.decode("utf-8")), None
    except (UnicodeError, ValueError, TypeError):
        return None, ModelCatalogProbe("unavailable", origin, "MODELS_API_RESPONSE_INVALID", {})


def _proof(document: Mapping[str, Any], fields: set[str]) -> dict[str, Any]:
    sanitized = {field: document.get(field) for field in sorted(fields)}
    raw = json.dumps(sanitized, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return {"response_sha256": hashlib.sha256(raw).hexdigest()}
