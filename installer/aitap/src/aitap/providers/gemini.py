"""Minimal non-streaming Google Gemini GenerateContent transport."""
import json
import socket
import urllib.error
import urllib.parse
import urllib.request

from .base import ProviderResult, SupplyError


class GeminiProvider:
    endpoint = "https://generativelanguage.googleapis.com/v1beta/models"

    def __init__(self, opener=None):
        self.opener = opener or urllib.request.urlopen

    def _request(self, model, method, secret, body, timeout, stage):
        url = f"{self.endpoint}/{urllib.parse.quote(model, safe='')}:{method}"
        request = urllib.request.Request(url, data=json.dumps(body).encode("utf-8"),
            headers={"Content-Type": "application/json", "x-goog-api-key": secret}, method="POST")
        try:
            with self.opener(request, timeout=timeout) as response:
                raw = response.read()
                request_id = response.headers.get("x-request-id", "")
        except urllib.error.HTTPError as exc:
            code = {401: "PROVIDER_AUTH_FAILED", 403: "PROVIDER_AUTH_FAILED",
                    429: "PROVIDER_RATE_LIMITED", 500: "PROVIDER_UNAVAILABLE",
                    502: "PROVIDER_UNAVAILABLE", 503: "PROVIDER_UNAVAILABLE",
                    504: "PROVIDER_TIMEOUT"}.get(exc.code, "INVALID_REQUEST")
            raise SupplyError(code if stage == "provider" else "TOKEN_COUNT_FAILED", stage,
                              f"Gemini HTTP {exc.code}" if stage == "provider" else None,
                              uncertain=False) from None
        except (TimeoutError, socket.timeout):
            raise SupplyError("PROVIDER_TIMEOUT" if stage == "provider" else "TOKEN_COUNT_FAILED", stage,
                              "Gemini timed out after send" if stage == "provider" else None,
                              uncertain=stage == "provider") from None
        except (urllib.error.URLError, OSError):
            raise SupplyError("PROVIDER_UNAVAILABLE" if stage == "provider" else "TOKEN_COUNT_FAILED", stage,
                              "Gemini connection or response read failed after send" if stage == "provider" else None,
                              uncertain=stage == "provider") from None
        try:
            return json.loads(raw), request_id
        except (json.JSONDecodeError, UnicodeDecodeError, TypeError):
            raise SupplyError("RAW_RESPONSE_MISMATCH" if stage == "provider" else "TOKEN_COUNT_FAILED", stage,
                              "Gemini returned invalid JSON" if stage == "provider" else None,
                              uncertain=stage == "provider") from None

    @staticmethod
    def _contents(payload):
        return [{"role": "user", "parts": [{"text": json.dumps(payload, ensure_ascii=False, allow_nan=False)}]}]

    def count_input_tokens(self, *, payload, model, secret, timeout):
        data, _ = self._request(model, "countTokens", secret, {"contents": self._contents(payload)}, timeout, "token_count")
        count = data.get("totalTokens")
        if type(count) is not int or count < 0:
            raise SupplyError("TOKEN_COUNT_FAILED", "token_count")
        return count

    def generate(self, *, payload, model, secret, max_tokens, timeout):
        body = {"contents": self._contents(payload), "generationConfig": {
            "maxOutputTokens": max_tokens, "responseMimeType": "application/json"}}
        data, request_id = self._request(model, "generateContent", secret, body, timeout, "provider")
        try:
            candidates = data["candidates"]
            parts = candidates[0]["content"]["parts"]
            text = "".join(p["text"] for p in parts if isinstance(p.get("text"), str))
            usage = data["usageMetadata"]
            input_tokens, output_tokens = usage["promptTokenCount"], usage["candidatesTokenCount"]
            if not text or any(type(n) is not int or n < 0 for n in (input_tokens, output_tokens)):
                raise ValueError()
            return ProviderResult(text, input_tokens, output_tokens, model, request_id)
        except (KeyError, IndexError, TypeError, ValueError):
            raise SupplyError("RAW_RESPONSE_MISMATCH", "provider", uncertain=True) from None
