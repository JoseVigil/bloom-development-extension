import io
import json
import urllib.error

import pytest
from aitap.providers.anthropic import AnthropicProvider
from aitap.providers.base import SupplyError


def test_provider_preserves_text_and_usage():
    def open_response(request, timeout):
        body = json.loads(request.data)
        assert body["model"] == "model-from-registry" and body["max_tokens"] == 40
        data = {"model": body["model"], "stop_reason": "end_turn", "content": [{"type": "text", "text": " raw\n"}],
                "usage": {"input_tokens": 11, "output_tokens": 2}}
        response = io.BytesIO(json.dumps(data).encode())
        response.headers = {"request-id": "r1"}
        return response
    result = AnthropicProvider(open_response).generate(payload={"anything": []}, model="model-from-registry",
                                                      secret="not-real", max_tokens=40, timeout=1)
    assert result.raw_response == " raw\n" and result.input_tokens == 11


@pytest.mark.parametrize("status,code", [(401, "PROVIDER_AUTH_FAILED"), (429, "PROVIDER_RATE_LIMITED"), (529, "PROVIDER_UNAVAILABLE")])
def test_http_errors_do_not_leak_body(status, code):
    def fail(*args, **kwargs):
        raise urllib.error.HTTPError("url", status, "secret body", {}, None)
    with pytest.raises(SupplyError) as error:
        AnthropicProvider(fail).generate(payload={}, model="m", secret="s", max_tokens=1, timeout=1)
    assert error.value.code == code and "secret" not in str(error.value)


def test_count_tokens_does_not_generate_and_uses_same_payload():
    def opener(request, timeout):
        assert request.full_url.endswith("/messages/count_tokens")
        body = json.loads(request.data)
        assert "max_tokens" not in body
        assert json.loads(body["messages"][0]["content"]) == {"text": "entrada"}
        return io.BytesIO(b'{"input_tokens":123}')
    assert AnthropicProvider(opener).count_input_tokens(payload={"text":"entrada"}, model="m",
                                                        secret="fixture", timeout=1) == 123


def test_count_failure_never_exposes_response_body():
    with pytest.raises(SupplyError, match="TOKEN_COUNT_FAILED"):
        AnthropicProvider(lambda *a, **k: io.BytesIO(b'{"error":"private"}')).count_input_tokens(
            payload={},model="m",secret="fixture",timeout=1)
