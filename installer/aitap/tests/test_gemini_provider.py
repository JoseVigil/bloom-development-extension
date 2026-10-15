import io
import json
import urllib.error

import pytest
from aitap.providers.base import SupplyError
from aitap.providers.gemini import GeminiProvider


def response(value, request_id="r1"):
    stream = io.BytesIO(json.dumps(value).encode())
    stream.headers = {"x-request-id": request_id}
    return stream


def test_generate_uses_gemini_endpoint_json_and_usage():
    def opener(request, timeout):
        assert request.full_url.endswith("/gemini-3.8-flash:generateContent")
        assert request.headers["X-goog-api-key"] == "fixture"
        body = json.loads(request.data)
        assert body["generationConfig"] == {"maxOutputTokens": 4096, "responseMimeType": "application/json"}
        return response({"candidates": [{"content": {"parts": [{"text": "{\"ok\":true}"}]}}],
                         "usageMetadata": {"promptTokenCount": 12, "candidatesTokenCount": 3}})
    result = GeminiProvider(opener).generate(payload={"task": "gen"}, model="gemini-3.8-flash",
                                              secret="fixture", max_tokens=4096, timeout=1)
    assert result.raw_response == '{"ok":true}' and result.input_tokens == 12 and result.output_tokens == 3


def test_count_tokens_uses_dedicated_endpoint():
    def opener(request, timeout):
        assert request.full_url.endswith("/gemini-3.8-flash:countTokens")
        return response({"totalTokens": 321})
    assert GeminiProvider(opener).count_input_tokens(payload={"a": 1}, model="gemini-3.8-flash",
                                                      secret="fixture", timeout=1) == 321


@pytest.mark.parametrize("status,code", [(401, "PROVIDER_AUTH_FAILED"), (429, "PROVIDER_RATE_LIMITED"),
                                         (500, "PROVIDER_UNAVAILABLE"), (503, "PROVIDER_UNAVAILABLE"),
                                         (504, "PROVIDER_TIMEOUT")])
def test_http_errors_are_sanitized(status, code):
    def fail(*args, **kwargs):
        raise urllib.error.HTTPError("url", status, "private body", {}, None)
    with pytest.raises(SupplyError) as error:
        GeminiProvider(fail).generate(payload={}, model="m", secret="secret", max_tokens=1, timeout=1)
    assert (error.value.code, error.value.uncertain, str(error.value)) == (code, False, f"Gemini HTTP {status}")
    assert "private" not in str(error.value)


def test_malformed_response_fails_closed():
    with pytest.raises(SupplyError) as error:
        GeminiProvider(lambda *_a, **_k: response({"candidates": []})).generate(
            payload={}, model="m", secret="s", max_tokens=1, timeout=1)
    assert error.value.code == "RAW_RESPONSE_MISMATCH" and error.value.uncertain


def test_invalid_json_is_distinct_from_transport_failure_and_sanitized():
    stream = io.BytesIO(b"private invalid body")
    stream.headers = {"x-request-id": "r-private"}
    with pytest.raises(SupplyError) as error:
        GeminiProvider(lambda *_a, **_k: stream).generate(
            payload={}, model="m", secret="secret", max_tokens=1, timeout=1)
    assert (error.value.code, error.value.uncertain) == ("RAW_RESPONSE_MISMATCH", True)
    assert str(error.value) == "Gemini returned invalid JSON"
    assert "private" not in str(error.value) and "secret" not in str(error.value)


class BrokenRead(io.BytesIO):
    headers = {"x-request-id": "r-private"}

    def read(self, *_args, **_kwargs):
        raise OSError("private response fragment")


def test_response_read_failure_is_uncertain_and_sanitized():
    with pytest.raises(SupplyError) as error:
        GeminiProvider(lambda *_a, **_k: BrokenRead()).generate(
            payload={}, model="m", secret="secret", max_tokens=1, timeout=1)
    assert (error.value.code, error.value.uncertain) == ("PROVIDER_UNAVAILABLE", True)
    assert str(error.value) == "Gemini connection or response read failed after send"
    assert "private" not in str(error.value) and "secret" not in str(error.value)


@pytest.mark.parametrize("failure,code,message", [
    (TimeoutError("private timeout"), "PROVIDER_TIMEOUT", "Gemini timed out after send"),
    (urllib.error.URLError("private disconnect"), "PROVIDER_UNAVAILABLE",
     "Gemini connection or response read failed after send"),
])
def test_transport_failures_are_uncertain_and_sanitized(failure, code, message):
    def fail(*_args, **_kwargs):
        raise failure
    with pytest.raises(SupplyError) as error:
        GeminiProvider(fail).generate(payload={}, model="m", secret="secret", max_tokens=1, timeout=1)
    assert (error.value.code, error.value.uncertain, str(error.value)) == (code, True, message)
    assert "private" not in str(error.value) and "secret" not in str(error.value)
