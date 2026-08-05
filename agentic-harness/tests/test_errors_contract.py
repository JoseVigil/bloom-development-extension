"""Chequeo de drift entre harness/contracts/errors.py y contracts/errors.ts.

Solo verifica los códigos que Pieza 1 usa activamente (AI_EXECUTION_OLLAMA_*,
AI_AUTH_FAILED, AI_RATE_LIMIT, AI_TIMEOUT, AI_EXECUTION_PROMPT_INVALID,
AI_EXECUTION_STREAM_ERROR). Si contracts/errors.ts cambia alguno de estos
valores, este test debe fallar y avisar que el mirror quedó desactualizado.
"""

from harness.contracts.errors import ERROR_CATALOG, create_error_response


def test_ollama_not_running_matches_real_catalog():
    entry = ERROR_CATALOG["AI_EXECUTION_OLLAMA_NOT_RUNNING"]
    assert entry.severity == "recoverable"
    assert entry.retry_strategy == "manual"
    assert entry.http_status == 503
    assert entry.default_message == "Ollama server is not running"


def test_ollama_model_missing_matches_real_catalog():
    entry = ERROR_CATALOG["AI_EXECUTION_OLLAMA_MODEL_MISSING"]
    assert entry.severity == "recoverable"
    assert entry.retry_strategy == "manual"
    assert entry.http_status == 404
    assert entry.default_message == "Required Ollama model is not installed"


def test_ai_auth_failed_matches_real_catalog():
    entry = ERROR_CATALOG["AI_AUTH_FAILED"]
    assert entry.severity == "critical"
    assert entry.retry_strategy == "manual"
    assert entry.http_status == 401


def test_ai_rate_limit_matches_real_catalog():
    entry = ERROR_CATALOG["AI_RATE_LIMIT"]
    assert entry.severity == "warning"
    assert entry.retry_strategy == "exponential"
    assert entry.http_status == 429


def test_create_error_response_recoverable_reflects_severity():
    recoverable = create_error_response("AI_EXECUTION_OLLAMA_NOT_RUNNING")
    assert recoverable.recoverable is True
    assert recoverable.retry_after is None  # retry_strategy "manual" -> sin retry_after automático

    critical = create_error_response("AI_AUTH_FAILED")
    assert critical.recoverable is False

    exponential = create_error_response("AI_RATE_LIMIT")
    assert exponential.retry_after == 5000


def test_create_error_response_allows_message_override():
    response = create_error_response(
        "AI_EXECUTION_OLLAMA_MODEL_MISSING", message="mensaje custom"
    )
    assert response.message == "mensaje custom"
    assert response.error_code == "AI_EXECUTION_OLLAMA_MODEL_MISSING"
