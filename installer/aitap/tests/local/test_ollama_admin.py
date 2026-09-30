import io
import json
import socket
import urllib.error
from pathlib import Path

import pytest

from aitap.local.ollama_admin import OllamaAdmin
from aitap.providers.base import SupplyError

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "ollama"
STREAM = (FIXTURES / "pull-stream.jsonl").read_bytes()


class _Response(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def _opener(body=STREAM, captured=None, error=None):
    def opener(request, timeout):
        if captured is not None:
            captured.update(url=request.full_url, method=request.get_method(), body=json.loads(request.data),
                            timeout=timeout)
        if error is not None:
            raise error
        return _Response(body)
    return opener


def test_pull_reports_progress_and_success():
    captured, events = {}, []
    outcome = OllamaAdmin(opener=_opener(captured=captured)).pull(model="catalog-ref:1", on_progress=events.append)
    assert captured["url"] == "http://127.0.0.1:11434/api/pull" and captured["method"] == "POST"
    assert captured["body"] == {"model": "catalog-ref:1", "stream": True}
    assert outcome.status == "success" and outcome.bytes_completed == outcome.bytes_total == 300807157
    assert events[-1]["status"] == "success" and len(events) == 7
    assert [e["bytes_completed"] for e in events[1:4]] == [0, 150403578, 300807157]


def test_admin_never_touches_chat_or_tags():
    source = Path(__import__("aitap.local.ollama_admin", fromlist=["x"]).__file__).read_text()
    assert "/api/chat" not in source.split('"""', 2)[2] and "/api/tags" not in source.split('"""', 2)[2]


def test_non_loopback_host_is_rejected():
    with pytest.raises(SupplyError):
        OllamaAdmin(host="10.0.0.5:11434")


@pytest.mark.parametrize("body, code", [
    (b'{"status":"pulling manifest"}\n{"error":"pull model manifest: file does not exist"}\n', "PULL_FAILED"),
    (b'{"status":"pulling manifest"}\n', "PULL_INTERRUPTED"),
    (b'{"status":"pulling manifest"}\nnot-json\n', "PULL_FAILED"),
])
def test_stream_errors_fail_without_success(body, code):
    with pytest.raises(SupplyError) as caught:
        OllamaAdmin(opener=_opener(body=body)).pull(model="catalog-ref:1")
    assert caught.value.code == code and caught.value.retryable is True


@pytest.mark.parametrize("error, code", [
    (urllib.error.URLError("refused"), "PROVIDER_UNAVAILABLE"),
    (socket.timeout(), "PULL_INTERRUPTED"),
    (urllib.error.HTTPError("u", 500, "x", {}, None), "PULL_FAILED"),
])
def test_transport_errors_are_typed(error, code):
    with pytest.raises(SupplyError) as caught:
        OllamaAdmin(opener=_opener(error=error)).pull(model="catalog-ref:1")
    assert caught.value.code == code
