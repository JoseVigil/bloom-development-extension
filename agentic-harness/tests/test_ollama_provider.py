"""Tests para OllamaEmbeddingProvider.

No dependen del estado real de la máquina (Ollama corriendo o no) salvo
en test_health_live_smoke, que se salta si no hay nada escuchando en
localhost:11434 — en esa máquina Ollama corre pero sin el modelo
descargado, así que ese test no puede asumir status == "ok".
"""

from __future__ import annotations

import requests

from harness.contracts.errors import ProviderError
from harness.providers.ollama_provider import EMBEDDING_DIM, OllamaEmbeddingProvider


class _FakeResponse:
    def __init__(self, status_code: int, json_data: dict | None = None, text: str = ""):
        self.status_code = status_code
        self._json_data = json_data or {}
        self.text = text

    def json(self):
        return self._json_data

    def raise_for_status(self):
        if self.status_code >= 400:
            err = requests.HTTPError(f"{self.status_code} error")
            err.response = self
            raise err


# ---------------------------------------------------------------------------
# from_nucleus_path — resolución de exe embebido, sin tocar el filesystem real
# ---------------------------------------------------------------------------


def test_from_nucleus_path_finds_linux_relative_exe(tmp_path, monkeypatch):
    monkeypatch.setattr("harness.providers.ollama_provider.platform.system", lambda: "Linux")
    exe_dir = tmp_path / "bin" / "ollama"
    exe_dir.mkdir(parents=True)
    exe_path = exe_dir / "ollama"
    exe_path.write_text("#!/bin/sh\n")

    provider = OllamaEmbeddingProvider.from_nucleus_path(tmp_path)

    assert provider.ollama_exe == exe_path


def test_from_nucleus_path_falls_back_to_system_path_when_exe_missing(tmp_path, monkeypatch):
    monkeypatch.setattr("harness.providers.ollama_provider.platform.system", lambda: "Linux")

    provider = OllamaEmbeddingProvider.from_nucleus_path(tmp_path)

    assert provider.ollama_exe is None


def test_from_nucleus_path_uses_windows_exe_suffix(tmp_path, monkeypatch):
    monkeypatch.setattr("harness.providers.ollama_provider.platform.system", lambda: "Windows")
    exe_dir = tmp_path / "bin" / "ollama"
    exe_dir.mkdir(parents=True)
    exe_path = exe_dir / "ollama.exe"
    exe_path.write_text("")

    provider = OllamaEmbeddingProvider.from_nucleus_path(tmp_path)

    assert provider.ollama_exe == exe_path


# ---------------------------------------------------------------------------
# generate_embedding — contrato principal
# ---------------------------------------------------------------------------


def test_generate_embedding_rejects_empty_text():
    provider = OllamaEmbeddingProvider()
    try:
        provider.generate_embedding("   ")
        assert False, "esperaba ValueError"
    except ValueError:
        pass


def test_generate_embedding_raises_ollama_not_running_on_connection_error(monkeypatch):
    def fake_post(*args, **kwargs):
        raise requests.ConnectionError("refused")

    monkeypatch.setattr("harness.providers.ollama_provider.requests.post", fake_post)
    provider = OllamaEmbeddingProvider()

    try:
        provider.generate_embedding("refactorizar autenticación JWT")
        assert False, "esperaba ProviderError"
    except ProviderError as exc:
        assert exc.response.error_code == "AI_EXECUTION_OLLAMA_NOT_RUNNING"
        assert exc.response.recoverable is True


def test_generate_embedding_raises_model_missing_on_404(monkeypatch):
    def fake_post(*args, **kwargs):
        return _FakeResponse(404)

    monkeypatch.setattr("harness.providers.ollama_provider.requests.post", fake_post)
    provider = OllamaEmbeddingProvider()

    try:
        provider.generate_embedding("texto de prueba")
        assert False, "esperaba ProviderError"
    except ProviderError as exc:
        assert exc.response.error_code == "AI_EXECUTION_OLLAMA_MODEL_MISSING"
        assert exc.response.details["pull_command"] == "ollama pull nomic-embed-text"


def test_generate_embedding_raises_timeout(monkeypatch):
    def fake_post(*args, **kwargs):
        raise requests.Timeout("too slow")

    monkeypatch.setattr("harness.providers.ollama_provider.requests.post", fake_post)
    provider = OllamaEmbeddingProvider()

    try:
        provider.generate_embedding("texto de prueba")
        assert False, "esperaba ProviderError"
    except ProviderError as exc:
        assert exc.response.error_code == "AI_TIMEOUT"


def test_generate_embedding_raises_stream_error_on_wrong_dims(monkeypatch):
    def fake_post(*args, **kwargs):
        return _FakeResponse(200, {"embedding": [0.1, 0.2]})  # solo 2 dims, no 768

    monkeypatch.setattr("harness.providers.ollama_provider.requests.post", fake_post)
    provider = OllamaEmbeddingProvider()

    try:
        provider.generate_embedding("texto de prueba")
        assert False, "esperaba ProviderError"
    except ProviderError as exc:
        assert exc.response.error_code == "AI_EXECUTION_STREAM_ERROR"


def test_generate_embedding_returns_vector_on_success(monkeypatch):
    fake_vector = [0.0] * EMBEDDING_DIM

    def fake_post(*args, **kwargs):
        return _FakeResponse(200, {"embedding": fake_vector})

    monkeypatch.setattr("harness.providers.ollama_provider.requests.post", fake_post)
    provider = OllamaEmbeddingProvider()

    result = provider.generate_embedding("texto de prueba")

    assert result == fake_vector
    assert len(result) == EMBEDDING_DIM


def test_generate_embedding_batch_calls_generate_embedding_per_item(monkeypatch):
    fake_vector = [0.0] * EMBEDDING_DIM

    def fake_post(*args, **kwargs):
        return _FakeResponse(200, {"embedding": fake_vector})

    monkeypatch.setattr("harness.providers.ollama_provider.requests.post", fake_post)
    provider = OllamaEmbeddingProvider()

    results = provider.generate_embedding_batch(["uno", "dos", "tres"])

    assert len(results) == 3
    assert all(r == fake_vector for r in results)


# ---------------------------------------------------------------------------
# health()
# ---------------------------------------------------------------------------


def test_health_reports_error_when_unreachable(monkeypatch):
    def fake_get(*args, **kwargs):
        raise requests.ConnectionError("refused")

    monkeypatch.setattr("harness.providers.ollama_provider.requests.get", fake_get)
    provider = OllamaEmbeddingProvider()

    health = provider.health()

    assert health.status == "error"
    assert health.provider == "ollama"


def test_health_reports_model_missing_when_model_not_installed(monkeypatch):
    def fake_get(*args, **kwargs):
        return _FakeResponse(200, {"models": [{"name": "llama3.2:1b"}]})

    monkeypatch.setattr("harness.providers.ollama_provider.requests.get", fake_get)
    provider = OllamaEmbeddingProvider()

    health = provider.health()

    assert health.status == "model_missing"
    assert health.detail["model_available"] is False


def test_health_reports_ok_when_model_installed(monkeypatch):
    def fake_get(*args, **kwargs):
        return _FakeResponse(200, {"models": [{"name": "nomic-embed-text:latest"}]})

    monkeypatch.setattr("harness.providers.ollama_provider.requests.get", fake_get)
    provider = OllamaEmbeddingProvider()

    health = provider.health()

    assert health.status == "ok"


def test_health_live_smoke():
    """Contra el Ollama real de esta máquina, si hay algo escuchando.

    No asume `ok` ni `model_missing` — solo que no explota y que el status
    es uno de los tres valores válidos.
    """
    provider = OllamaEmbeddingProvider.from_default_nucleus_path()
    health = provider.health()
    assert health.status in {"ok", "model_missing", "error"}
