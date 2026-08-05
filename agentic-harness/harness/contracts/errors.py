"""Mirror de ../../../contracts/errors.ts — ERROR_CATALOG completo.

Se transcribe el catálogo entero (no solo los dos códigos AI_EXECUTION_OLLAMA_*
que pide Pieza 1) porque HARNESS_CONTEXT_BRIEF.md §checklist pide consumir
contracts/errors.ts desde el día uno, y porque las piezas 2-5 (router, gate,
logging) también van a necesitar severity/retry_strategy de otros códigos
(AI_RATE_LIMIT, AI_AUTH_FAILED, etc.) sin tener que volver a este archivo a
ampliarlo pieza por pieza. Es transcripción de datos ya definidos, no diseño
nuevo.

Se omite `docs_url` de cada entry: apunta a rutas `/docs/...` servidas por la
app de Bloom, no por este harness — mantenerlo hubiera sido un link muerto
fuera de contexto.

Fuente real: contracts/errors.ts. Si ese archivo cambia, correr
tests/test_errors_contract.py para detectar drift en los campos cubiertos.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Literal

# contracts/types.ts: ErrorCode
ErrorCode = Literal[
    "BRAIN_CLI_UNAVAILABLE",
    "BRAIN_EXECUTION_FAILED",
    "NOT_AUTHENTICATED",
    "NOT_NUCLEUS",
    "AUTH_FAILED",
    "NUCLEUS_NOT_FOUND",
    "INTENT_NOT_FOUND",
    "INTENT_LOCKED",
    "INTENT_LOCKED_BY_OTHER",
    "PROJECT_NOT_FOUND",
    "PROFILE_NOT_FOUND",
    "AI_RATE_LIMIT",
    "AI_QUOTA_EXCEEDED",
    "AI_AUTH_FAILED",
    "AI_TIMEOUT",
    "RATE_LIMIT_EXCEEDED",
    "AI_EXECUTION_PROMPT_INVALID",
    "AI_EXECUTION_CONTEXT_UNKNOWN",
    "AI_EXECUTION_STREAM_ERROR",
    "AI_EXECUTION_PROCESS_NOT_FOUND",
    "AI_EXECUTION_CANCELLED",
    "AI_EXECUTION_OLLAMA_NOT_RUNNING",
    "AI_EXECUTION_OLLAMA_MODEL_MISSING",
    "VALIDATION_ERROR",
    "INTERNAL_ERROR",
]

ErrorSeverity = Literal["critical", "recoverable", "warning"]
RetryStrategy = Literal["immediate", "exponential", "manual", "none"]


@dataclass(frozen=True)
class ErrorCatalogEntry:
    severity: ErrorSeverity
    default_message: str
    user_action: str
    retry_strategy: RetryStrategy | None = None
    http_status: int | None = None
    telemetry_category: str | None = None


ERROR_CATALOG: dict[ErrorCode, ErrorCatalogEntry] = {
    "BRAIN_CLI_UNAVAILABLE": ErrorCatalogEntry(
        severity="critical",
        default_message="Brain CLI is not available or not installed",
        user_action="Check Python installation and verify Brain module path in settings",
        retry_strategy="manual",
        http_status=503,
        telemetry_category="brain_cli",
    ),
    "BRAIN_EXECUTION_FAILED": ErrorCatalogEntry(
        severity="critical",
        default_message="Brain command execution failed unexpectedly",
        user_action="Check error details and try again. If issue persists, check Brain logs",
        retry_strategy="manual",
        http_status=500,
        telemetry_category="brain_cli",
    ),
    "NOT_AUTHENTICATED": ErrorCatalogEntry(
        severity="critical",
        default_message="GitHub authentication required to perform this action",
        user_action="Complete GitHub authentication in onboarding settings",
        retry_strategy="manual",
        http_status=401,
        telemetry_category="auth",
    ),
    "NOT_NUCLEUS": ErrorCatalogEntry(
        severity="critical",
        default_message="Current directory is not a valid Nucleus workspace",
        user_action="Create a new Nucleus or open an existing Nucleus directory",
        retry_strategy="manual",
        http_status=400,
        telemetry_category="resource",
    ),
    "AUTH_FAILED": ErrorCatalogEntry(
        severity="critical",
        default_message="Authentication failed",
        user_action="Verify your credentials and try again",
        retry_strategy="manual",
        http_status=401,
        telemetry_category="auth",
    ),
    "NUCLEUS_NOT_FOUND": ErrorCatalogEntry(
        severity="recoverable",
        default_message="Nucleus not found at the specified path",
        user_action="Verify the Nucleus path and try again",
        retry_strategy="immediate",
        http_status=404,
        telemetry_category="resource",
    ),
    "INTENT_NOT_FOUND": ErrorCatalogEntry(
        severity="recoverable",
        default_message="Intent not found",
        user_action="Verify the Intent ID and try again",
        retry_strategy="immediate",
        http_status=404,
        telemetry_category="resource",
    ),
    "PROJECT_NOT_FOUND": ErrorCatalogEntry(
        severity="recoverable",
        default_message="Project not found at the specified path",
        user_action="Verify the project path exists and is accessible",
        retry_strategy="immediate",
        http_status=404,
        telemetry_category="resource",
    ),
    "PROFILE_NOT_FOUND": ErrorCatalogEntry(
        severity="recoverable",
        default_message="Chrome profile not found",
        user_action="Verify the profile ID is correct or select a different profile",
        retry_strategy="immediate",
        http_status=404,
        telemetry_category="resource",
    ),
    "INTENT_LOCKED": ErrorCatalogEntry(
        severity="recoverable",
        default_message="Intent is currently locked by an active process",
        user_action="Wait for the lock to be released or force unlock if safe",
        retry_strategy="exponential",
        http_status=423,
        telemetry_category="resource",
    ),
    "INTENT_LOCKED_BY_OTHER": ErrorCatalogEntry(
        severity="warning",
        default_message="Intent is locked by another user or process",
        user_action="Contact the user who locked it or use force unlock with caution",
        retry_strategy="manual",
        http_status=423,
        telemetry_category="resource",
    ),
    "AI_RATE_LIMIT": ErrorCatalogEntry(
        severity="warning",
        default_message="AI service rate limit exceeded",
        user_action="Wait a moment and try again. Consider switching to another AI account",
        retry_strategy="exponential",
        http_status=429,
        telemetry_category="ai_service",
    ),
    "AI_QUOTA_EXCEEDED": ErrorCatalogEntry(
        severity="warning",
        default_message="AI service quota exceeded for current billing period",
        user_action="Add another API key/account or wait for quota reset",
        retry_strategy="manual",
        http_status=429,
        telemetry_category="ai_service",
    ),
    "AI_AUTH_FAILED": ErrorCatalogEntry(
        severity="critical",
        default_message="AI service authentication failed",
        user_action="Verify your API keys and account credentials in profile settings",
        retry_strategy="manual",
        http_status=401,
        telemetry_category="ai_service",
    ),
    "AI_TIMEOUT": ErrorCatalogEntry(
        severity="recoverable",
        default_message="AI service request timed out",
        user_action="Try again. If issue persists, check your internet connection",
        retry_strategy="immediate",
        http_status=504,
        telemetry_category="ai_service",
    ),
    "RATE_LIMIT_EXCEEDED": ErrorCatalogEntry(
        severity="warning",
        default_message="Too many requests, please slow down",
        user_action="Wait a moment before trying again",
        retry_strategy="exponential",
        http_status=429,
        telemetry_category="system",
    ),
    "AI_EXECUTION_PROMPT_INVALID": ErrorCatalogEntry(
        severity="recoverable",
        default_message="Invalid AI prompt format or missing required fields",
        user_action="Check your prompt structure and required fields",
        retry_strategy="immediate",
        http_status=400,
        telemetry_category="ai_service",
    ),
    "AI_EXECUTION_CONTEXT_UNKNOWN": ErrorCatalogEntry(
        severity="recoverable",
        default_message="Unknown or unsupported AI context",
        user_action="Verify the context type and parameters",
        retry_strategy="immediate",
        http_status=400,
        telemetry_category="ai_service",
    ),
    "AI_EXECUTION_STREAM_ERROR": ErrorCatalogEntry(
        severity="critical",
        default_message="AI streaming failed unexpectedly",
        user_action="Check connection and try again. Report if persists",
        retry_strategy="manual",
        http_status=500,
        telemetry_category="ai_service",
    ),
    "AI_EXECUTION_PROCESS_NOT_FOUND": ErrorCatalogEntry(
        severity="warning",
        default_message="AI process not found or already completed",
        user_action="Start a new AI process if needed",
        retry_strategy="none",
        http_status=404,
        telemetry_category="ai_service",
    ),
    "AI_EXECUTION_CANCELLED": ErrorCatalogEntry(
        severity="warning",
        default_message="AI process was cancelled by user",
        user_action="No action needed, process was intentionally cancelled",
        retry_strategy="none",
        http_status=499,
        telemetry_category="ai_service",
    ),
    "AI_EXECUTION_OLLAMA_NOT_RUNNING": ErrorCatalogEntry(
        severity="recoverable",
        default_message="Ollama server is not running",
        user_action="Start Ollama manually or check installation",
        retry_strategy="manual",
        http_status=503,
        telemetry_category="ai_service",
    ),
    "AI_EXECUTION_OLLAMA_MODEL_MISSING": ErrorCatalogEntry(
        severity="recoverable",
        default_message="Required Ollama model is not installed",
        user_action='Install the required model using "ollama pull <model>"',
        retry_strategy="manual",
        http_status=404,
        telemetry_category="ai_service",
    ),
    "VALIDATION_ERROR": ErrorCatalogEntry(
        severity="recoverable",
        default_message="Request data validation failed",
        user_action="Check your input data and try again",
        retry_strategy="manual",
        http_status=400,
        telemetry_category="system",
    ),
    "INTERNAL_ERROR": ErrorCatalogEntry(
        severity="critical",
        default_message="An unexpected internal error occurred",
        user_action="Report this error to support with error details",
        retry_strategy="manual",
        http_status=500,
        telemetry_category="system",
    ),
}


@dataclass(frozen=True)
class ErrorResponse:
    """Mirror de la interface ErrorResponse (contracts/types.ts:644-659)."""

    error: str
    error_code: ErrorCode
    message: str
    recoverable: bool
    timestamp: str
    details: dict[str, Any] | None = None
    retry_after: int | None = None


def create_error_response(
    code: ErrorCode,
    message: str | None = None,
    details: dict[str, Any] | None = None,
) -> ErrorResponse:
    """Mirror de createErrorResponse (contracts/errors.ts:377-401)."""
    catalog = ERROR_CATALOG[code]

    retry_after: int | None = None
    if catalog.retry_strategy == "exponential":
        retry_after = 5000
    elif catalog.retry_strategy == "immediate":
        retry_after = 1000

    return ErrorResponse(
        error=code,
        error_code=code,
        message=message or catalog.default_message,
        details=details,
        recoverable=catalog.severity != "critical",
        retry_after=retry_after,
        timestamp=datetime.now(timezone.utc).isoformat(),
    )


class ProviderError(RuntimeError):
    """Excepción de provider que carga un ErrorResponse tipado del catálogo real.

    Los arms del harness (OllamaEmbeddingProvider, GeminiTextProvider) la
    levantan en vez de RuntimeError con texto libre, para que el router/gate
    (Piezas 2/3) puedan inspeccionar `error.response.error_code` y decidir
    retry_strategy programáticamente en vez de parsear mensajes.
    """

    def __init__(self, response: ErrorResponse) -> None:
        super().__init__(response.message)
        self.response = response

    @classmethod
    def from_code(
        cls,
        code: ErrorCode,
        message: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> "ProviderError":
        return cls(create_error_response(code, message, details))
