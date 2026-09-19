"""Minimal non-streaming Anthropic Messages API transport."""
import json
import socket
import urllib.error
import urllib.request

from .base import ProviderResult, SupplyError


class AnthropicProvider:
    endpoint = "https://api.anthropic.com/v1/messages"

    def __init__(self, opener=None):
        self.opener = opener or urllib.request.urlopen

    def generate(self, *, payload, model, secret, max_tokens, timeout):
        # Payload is opaque text to this boundary; Brain owns its meaning.
        body = {"model": model, "max_tokens": max_tokens, "messages": [
            {"role": "user", "content": json.dumps(payload, ensure_ascii=False, allow_nan=False)}]}
        request = urllib.request.Request(self.endpoint, data=json.dumps(body).encode("utf-8"),
            headers={"Content-Type": "application/json", "x-api-key": secret,
                     "anthropic-version": "2023-06-01"}, method="POST")
        try:
            with self.opener(request, timeout=timeout) as response:
                data = json.loads(response.read())
                request_id = response.headers.get("request-id", "")
        except urllib.error.HTTPError as exc:
            code = {401: "PROVIDER_AUTH_FAILED", 403: "PROVIDER_AUTH_FAILED",
                    429: "PROVIDER_RATE_LIMITED", 500: "PROVIDER_UNAVAILABLE",
                    502: "PROVIDER_UNAVAILABLE", 503: "PROVIDER_UNAVAILABLE",
                    504: "PROVIDER_TIMEOUT", 529: "PROVIDER_UNAVAILABLE"}.get(exc.code)
            raise SupplyError(code or "INVALID_REQUEST", "provider", uncertain=exc.code in {500, 502, 503, 504}) from None
        except (TimeoutError, socket.timeout):
            raise SupplyError("PROVIDER_TIMEOUT", "provider", uncertain=True) from None
        except (urllib.error.URLError, OSError):
            raise SupplyError("PROVIDER_UNAVAILABLE", "provider", uncertain=True) from None
        except (ValueError, TypeError):
            raise SupplyError("RAW_RESPONSE_MISMATCH", "provider", uncertain=True) from None

        try:
            blocks = data["content"]
            if data["model"] != model:
                raise ValueError()
            if not blocks or any(b["type"] != "text" or not isinstance(b["text"], str) for b in blocks):
                raise ValueError()
            usage = data["usage"]
            counts = [usage["input_tokens"], usage["output_tokens"]]
            if any(type(n) is not int or n < 0 for n in counts):
                raise ValueError()
            return ProviderResult("".join(b["text"] for b in blocks), *counts, data["model"], request_id)
        except (KeyError, TypeError, ValueError):
            raise SupplyError("RAW_RESPONSE_MISMATCH", "provider", uncertain=True) from None

    def count_input_tokens(self, *, payload, model, secret, timeout):
        body = {"model": model, "messages": [{"role": "user", "content":
            json.dumps(payload, ensure_ascii=False, allow_nan=False)}]}
        request = urllib.request.Request(self.endpoint + "/count_tokens",
            data=json.dumps(body).encode("utf-8"), headers={"Content-Type": "application/json",
            "x-api-key": secret, "anthropic-version": "2023-06-01"}, method="POST")
        try:
            with self.opener(request, timeout=timeout) as response:
                count = json.loads(response.read())["input_tokens"]
            if type(count) is not int or count < 0:
                raise ValueError()
            return count
        except urllib.error.HTTPError as exc:
            code = "PROVIDER_AUTH_FAILED" if exc.code in (401, 403) else "TOKEN_COUNT_FAILED"
            raise SupplyError(code, "token_count") from None
        except (OSError, ValueError, KeyError, TypeError):
            raise SupplyError("TOKEN_COUNT_FAILED", "token_count") from None
