import io
import json
import urllib.error

from aitap.health.cloud_models import ANTHROPIC_API_VERSION, probe_cloud_model


class Response:
    def __init__(self, value):
        self.value = value

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self, size=-1):
        return self.value[:size]


def opener_for(document, captured):
    def open_(request, timeout):
        captured.update(url=request.full_url, method=request.get_method(), headers=dict(request.header_items()),
                        data=request.data, timeout=timeout)
        return Response(json.dumps(document).encode())
    return open_


def test_anthropic_gets_exact_model_with_current_headers_and_no_body():
    captured = {}
    backend = {"backend_id": "anthropic_api", "provider": "anthropic", "model": "claude-test"}
    result = probe_cloud_model(backend, "top-secret", opener=opener_for({
        "type": "model", "id": "claude-test", "lifecycle": "active",
    }, captured))
    assert result.status == "healthy" and result.origin == "anthropic.models.get"
    assert captured["url"] == "https://api.anthropic.com/v1/models/claude-test"
    assert captured["method"] == "GET" and captured["data"] is None
    headers = {key.lower(): value for key, value in captured["headers"].items()}
    assert headers["authorization"] == "Bearer top-secret"
    assert headers["anthropic-version"] == ANTHROPIC_API_VERSION
    assert "top-secret" not in json.dumps(result.proof)


def test_gemini_gets_exact_model_with_api_key_and_no_generation():
    captured = {}
    backend = {"backend_id": "gemini_api", "provider": "google", "model": "gemini-test"}
    result = probe_cloud_model(backend, "top-secret", opener=opener_for({
        "name": "models/gemini-test", "baseModelId": "gemini-test", "version": "1",
        "supportedGenerationMethods": ["generateContent"],
    }, captured))
    assert result.status == "healthy" and result.origin == "google.models.get"
    assert captured["url"] == "https://generativelanguage.googleapis.com/v1beta/models/gemini-test"
    assert captured["method"] == "GET" and captured["data"] is None
    assert {key.lower(): value for key, value in captured["headers"].items()}["x-goog-api-key"] == "top-secret"
    assert "generateContent" not in captured["url"]


def test_exact_model_binding_and_response_shape_fail_closed():
    anthropic = {"backend_id": "anthropic_api", "provider": "anthropic", "model": "expected"}
    mismatch = probe_cloud_model(anthropic, "secret", opener=opener_for({
        "type": "model", "id": "different", "lifecycle": "active"}, {}))
    assert mismatch.status == "unavailable" and mismatch.reason == "MODELS_API_RESPONSE_INVALID"
    gemini = {"backend_id": "gemini_api", "provider": "google", "model": "expected"}
    no_generation = probe_cloud_model(gemini, "secret", opener=opener_for({
        "name": "models/expected", "supportedGenerationMethods": ["embedContent"]}, {}))
    assert no_generation.status == "unavailable" and no_generation.reason == "MODELS_API_RESPONSE_INVALID"


def test_auth_http_and_invalid_json_fail_closed():
    backend = {"backend_id": "anthropic_api", "provider": "anthropic", "model": "expected"}

    def unauthorized(request, timeout):
        raise urllib.error.HTTPError(request.full_url, 401, "denied", {}, io.BytesIO())

    denied = probe_cloud_model(backend, "secret", opener=unauthorized)
    assert denied.status == "unavailable" and denied.reason == "PROVIDER_AUTH_FAILED"
    invalid = probe_cloud_model(backend, "secret", opener=lambda *_args, **_kwargs: Response(b"not-json"))
    assert invalid.status == "unavailable" and invalid.reason == "MODELS_API_RESPONSE_INVALID"


def test_deprecated_or_retired_anthropic_model_is_not_healthy():
    backend = {"backend_id": "anthropic_api", "provider": "anthropic", "model": "old"}
    deprecated = probe_cloud_model(backend, "secret", opener=opener_for({
        "type": "model", "id": "old", "lifecycle": "deprecated"}, {}))
    retired = probe_cloud_model(backend, "secret", opener=opener_for({
        "type": "model", "id": "old", "lifecycle": "retired"}, {}))
    assert deprecated.status == "degraded" and retired.status == "unavailable"
