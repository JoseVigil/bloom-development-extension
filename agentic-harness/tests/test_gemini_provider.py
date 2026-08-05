"""Tests para GeminiTextProvider. Nunca pega a la red real — todo mockeado."""

from __future__ import annotations

import requests

from harness.contracts.errors import ProviderError
from harness.contracts.types import AIPromptPayload
from harness.providers.gemini_provider import GeminiTextProvider


class _FakeResponse:
    def __init__(self, status_code: int, json_data: dict | None = None, text: str = ""):
        self.status_code = status_code
        self._json_data = json_data or {}
        self.text = text

    def json(self):
        return self._json_data


def _payload(text: str = "explicá qué hace este módulo") -> AIPromptPayload:
    return AIPromptPayload(context="general", text=text)


def test_missing_api_key_raises_auth_failed(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    provider = GeminiTextProvider(api_key=None)

    try:
        provider.generate_text(_payload())
        assert False, "esperaba ProviderError"
    except ProviderError as exc:
        assert exc.response.error_code == "AI_AUTH_FAILED"


def test_empty_prompt_raises_prompt_invalid():
    provider = GeminiTextProvider(api_key="fake-key-1234567890")

    try:
        provider.generate_text(_payload(text="   "))
        assert False, "esperaba ProviderError"
    except ProviderError as exc:
        assert exc.response.error_code == "AI_EXECUTION_PROMPT_INVALID"


def test_generate_text_returns_candidate_text_on_success(monkeypatch):
    def fake_post(*args, **kwargs):
        return _FakeResponse(
            200,
            {"candidates": [{"content": {"parts": [{"text": "respuesta generada"}]}}]},
        )

    monkeypatch.setattr("harness.providers.gemini_provider.requests.post", fake_post)
    provider = GeminiTextProvider(api_key="fake-key-1234567890")

    result = provider.generate_text(_payload())

    assert result == "respuesta generada"


def test_generate_text_raises_auth_failed_on_401(monkeypatch):
    def fake_post(*args, **kwargs):
        return _FakeResponse(401, text="invalid key")

    monkeypatch.setattr("harness.providers.gemini_provider.requests.post", fake_post)
    provider = GeminiTextProvider(api_key="fake-key-1234567890")

    try:
        provider.generate_text(_payload())
        assert False, "esperaba ProviderError"
    except ProviderError as exc:
        assert exc.response.error_code == "AI_AUTH_FAILED"


def test_generate_text_raises_rate_limit_on_429(monkeypatch):
    def fake_post(*args, **kwargs):
        return _FakeResponse(429, text="rate limited")

    monkeypatch.setattr("harness.providers.gemini_provider.requests.post", fake_post)
    provider = GeminiTextProvider(api_key="fake-key-1234567890")

    try:
        provider.generate_text(_payload())
        assert False, "esperaba ProviderError"
    except ProviderError as exc:
        assert exc.response.error_code == "AI_RATE_LIMIT"


def test_generate_text_raises_stream_error_on_unexpected_shape(monkeypatch):
    def fake_post(*args, **kwargs):
        return _FakeResponse(200, {"candidates": []})

    monkeypatch.setattr("harness.providers.gemini_provider.requests.post", fake_post)
    provider = GeminiTextProvider(api_key="fake-key-1234567890")

    try:
        provider.generate_text(_payload())
        assert False, "esperaba ProviderError"
    except ProviderError as exc:
        assert exc.response.error_code == "AI_EXECUTION_STREAM_ERROR"


def test_generate_text_raises_timeout_on_connection_error(monkeypatch):
    def fake_post(*args, **kwargs):
        raise requests.ConnectionError("no network")

    monkeypatch.setattr("harness.providers.gemini_provider.requests.post", fake_post)
    provider = GeminiTextProvider(api_key="fake-key-1234567890")

    try:
        provider.generate_text(_payload())
        assert False, "esperaba ProviderError"
    except ProviderError as exc:
        assert exc.response.error_code == "AI_TIMEOUT"


def test_health_reports_error_without_api_key(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    provider = GeminiTextProvider(api_key=None)

    health = provider.health()

    assert health.status == "error"


def test_health_reports_ok_when_api_key_valid(monkeypatch):
    def fake_get(*args, **kwargs):
        return _FakeResponse(200, {"models": []})

    monkeypatch.setattr("harness.providers.gemini_provider.requests.get", fake_get)
    provider = GeminiTextProvider(api_key="fake-key-1234567890")

    health = provider.health()

    assert health.status == "ok"


def test_env_var_used_when_api_key_not_passed_explicitly(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "from-env-1234567890")

    provider = GeminiTextProvider()

    assert provider.api_key == "from-env-1234567890"
