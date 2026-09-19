"""Transport errors and provider results, independent of BISP semantics."""
from dataclasses import dataclass


class SupplyError(ValueError):
    def __init__(self, code, stage, message=None, *, uncertain=False):
        self.code, self.stage, self.uncertain = code, stage, uncertain
        self.retryable = code in {"PROVIDER_RATE_LIMITED", "PROVIDER_TIMEOUT", "PROVIDER_UNAVAILABLE"}
        super().__init__(message or code)

    def envelope(self):
        return {"status": "error", "error": {"code": self.code, "message": str(self),
                "stage": self.stage, "retryable": self.retryable,
                "details": {"delivery_uncertain": self.uncertain}}}


@dataclass(frozen=True)
class ProviderResult:
    raw_response: str
    input_tokens: int
    output_tokens: int
    model: str
    provider_request_id: str
