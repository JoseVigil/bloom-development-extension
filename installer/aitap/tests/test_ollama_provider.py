"""Transporte Ollama: frontera loopback y clasificacion antes de enviar / incierto."""
import io
import json
import socket
import urllib.error
from pathlib import Path

import pytest

from aitap.providers.base import SupplyError
from aitap.providers.ollama import OllamaProvider, loopback_base, normalize_digest

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "ollama"
TAGS = json.loads((FIXTURES / "tags.json").read_text(encoding="utf-8"))
CHAT = json.loads((FIXTURES / "chat-structured.json").read_text(encoding="utf-8"))
HEX = TAGS["models"][0]["digest"]
MODEL = TAGS["models"][0]["name"]


class Response(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class FakeOllama:
    """Opener simulado: registra cada llamada y responde por ruta."""

    def __init__(self, tags=None, chat=None, tags_error=None, chat_error=None):
        self.tags, self.chat = tags if tags is not None else TAGS, chat if chat is not None else CHAT
        self.tags_error, self.chat_error = tags_error, chat_error
        self.calls = []

    def __call__(self, request, timeout):
        path = request.full_url.split("11434", 1)[1]
        self.calls.append((request.get_method(), path, json.loads(request.data) if request.data else None))
        error = self.tags_error if path == "/api/tags" else self.chat_error
        if error is not None:
            raise error
        body = self.tags if path == "/api/tags" else self.chat
        return Response(body if isinstance(body, bytes) else json.dumps(body).encode())


@pytest.mark.parametrize("host", ["10.0.0.5:11434", "example.com", "http://192.168.1.2:11434", "0.0.0.0:11434"])
def test_provider_rejects_non_loopback(host):
    with pytest.raises(SupplyError) as exc:
        OllamaProvider(host, opener=lambda *a, **k: pytest.fail("must not connect"))
    assert exc.value.code == "PROVIDER_UNAVAILABLE"


@pytest.mark.parametrize("host, base", [
    (None, "http://127.0.0.1:11434"), ("localhost", "http://localhost:11434"),
    ("http://127.0.0.1:11500/", "http://127.0.0.1:11500"), ("[::1]:11434", "http://[::1]:11434")])
def test_loopback_hosts_are_normalized(host, base):
    assert loopback_base(host) == base


def test_normalize_digest_accepts_bare_or_prefixed_hex_only():
    assert normalize_digest(HEX) == HEX and normalize_digest("sha256:" + HEX) == HEX
    assert normalize_digest(HEX.upper()) is None and normalize_digest(None) is None


def test_inspect_returns_observed_digest_by_exact_ref():
    fake = FakeOllama()
    assert OllamaProvider(opener=fake).inspect(model=MODEL, timeout=5) == HEX
    assert fake.calls == [("GET", "/api/tags", None)]


@pytest.mark.parametrize("fake, code, retryable", [
    (FakeOllama(tags_error=urllib.error.URLError("refused")), "PROVIDER_UNAVAILABLE", True),
    (FakeOllama(tags=b"not json"), "PROVIDER_UNAVAILABLE", True),
    (FakeOllama(tags={"models": [{"name": MODEL + "-otro", "digest": HEX}]}), "MODEL_NOT_INSTALLED", False),
    (FakeOllama(tags={"models": [{"name": MODEL, "digest": "sha256:xyz"}]}), "MODEL_DIGEST_MISMATCH", False),
])
def test_provider_classifies_pre_send_vs_uncertain_inspect(fake, code, retryable):
    with pytest.raises(SupplyError) as exc:
        OllamaProvider(opener=fake).inspect(model=MODEL, timeout=5)
    assert (exc.value.code, exc.value.uncertain, exc.value.retryable) == (code, False, retryable)
    assert all(path == "/api/tags" for _, path, _ in fake.calls)


def test_generate_sends_policy_format_options_and_returns_raw():
    fake = FakeOllama()
    payload = {"instruction": "opaco", "sources": [{"ref": "r", "content": "ñ"}]}
    result = OllamaProvider(opener=fake).generate(
        payload=payload, model=MODEL, max_tokens=256, timeout=30,
        options={"temperature": 0, "seed": 0, "num_ctx": 8192}, response_format={"type": "object"}, keep_alive="0")
    method, path, body = fake.calls[0]
    assert (method, path) == ("POST", "/api/chat")
    assert body == {"model": MODEL, "stream": False,
                    "messages": [{"role": "user", "content": json.dumps(payload, ensure_ascii=False)}],
                    "options": {"temperature": 0, "seed": 0, "num_ctx": 8192, "num_predict": 256},
                    "format": {"type": "object"}, "keep_alive": "0"}
    assert (result.raw_response, result.input_tokens, result.output_tokens, result.model) == (
        CHAT["message"]["content"], 120, 48, MODEL)


@pytest.mark.parametrize("fake, code", [
    (FakeOllama(chat_error=socket.timeout()), "PROVIDER_TIMEOUT"),
    (FakeOllama(chat_error=TimeoutError()), "PROVIDER_TIMEOUT"),
    (FakeOllama(chat_error=urllib.error.URLError("reset")), "PROVIDER_UNAVAILABLE"),
    (FakeOllama(chat_error=ConnectionResetError()), "PROVIDER_UNAVAILABLE"),
    (FakeOllama(chat_error=urllib.error.HTTPError("u", 500, "boom", {}, None)), "PROVIDER_UNAVAILABLE"),
    (FakeOllama(chat=b"{partial"), "RAW_RESPONSE_MISMATCH"),
    (FakeOllama(chat={**CHAT, "done": False}), "RAW_RESPONSE_MISMATCH"),
    (FakeOllama(chat={**CHAT, "model": "otro:1b"}), "RAW_RESPONSE_MISMATCH"),
    (FakeOllama(chat={**CHAT, "eval_count": -1}), "RAW_RESPONSE_MISMATCH"),
    (FakeOllama(chat={k: v for k, v in CHAT.items() if k != "prompt_eval_count"}), "RAW_RESPONSE_MISMATCH"),
])
def test_provider_classifies_pre_send_vs_uncertain_generate(fake, code):
    with pytest.raises(SupplyError) as exc:
        OllamaProvider(opener=fake).generate(payload={}, model=MODEL, max_tokens=8, timeout=5)
    assert (exc.value.code, exc.value.uncertain, exc.value.retryable) == (code, True, False)
    assert exc.value.envelope()["error"]["details"] == {"delivery_uncertain": True}
    assert len(fake.calls) == 1
