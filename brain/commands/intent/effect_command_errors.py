"""Shared machine-readable error contract for Intent effect commands.

Typer owns command-name/unknown-option parsing and exits with code 2 before a
command callback runs; those errors are not protocol JSON.  Contractual values
(``stage``, ``turn-id``, evidence JSON, and required identifiers) are accepted
as strings and validated inside callbacks so they produce ``INVALID_ARGUMENT``
as structured JSON with exit code 2.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

import typer


@dataclass
class EffectCommandError(Exception):
    code: str
    message: str
    exit_code: int
    retryable: bool
    details: dict[str, Any] = field(default_factory=dict)


def require_text(value: str, option: str) -> str:
    value = value.strip()
    if not value:
        raise EffectCommandError(
            "INVALID_ARGUMENT", f"{option} cannot be empty", 2, False, {"option": option}
        )
    return value


def parse_stage(value: str) -> str:
    stage = require_text(value, "--stage")
    if stage not in {"consolidation", "ratification"}:
        raise EffectCommandError(
            "INVALID_ARGUMENT",
            "--stage must be 'consolidation' or 'ratification'",
            2,
            False,
            {"option": "--stage", "value": stage},
        )
    return stage


def parse_turn_id(value: str) -> int:
    raw = require_text(value, "--turn-id")
    try:
        parsed = int(raw)
    except ValueError as exc:
        raise EffectCommandError(
            "INVALID_ARGUMENT", "--turn-id must be a positive integer", 2, False,
            {"option": "--turn-id", "value": raw},
        ) from exc
    if parsed < 1:
        raise EffectCommandError(
            "INVALID_ARGUMENT", "--turn-id must be a positive integer", 2, False,
            {"option": "--turn-id", "value": raw},
        )
    return parsed


def parse_evidence_json(value: str) -> dict[str, Any]:
    raw = require_text(value, "--evidence-json")
    try:
        evidence = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise EffectCommandError(
            "INVALID_EVIDENCE_JSON", f"invalid --evidence-json: {exc}", 2, False,
            {"option": "--evidence-json"},
        ) from exc
    if not isinstance(evidence, dict) or not evidence:
        raise EffectCommandError(
            "INVALID_EVIDENCE_JSON", "--evidence-json must be a non-empty JSON object",
            2, False, {"option": "--evidence-json"},
        )
    return evidence


def classify_error(error: Exception, details: dict[str, Any]) -> EffectCommandError:
    if isinstance(error, EffectCommandError):
        merged = dict(details)
        merged.update(error.details)
        error.details = merged
        return error

    name = type(error).__name__
    message = str(error)
    lowered = message.lower()
    if name == "PendingEffectsError":
        return EffectCommandError("EFFECTS_PENDING", message, 5, True, details)
    if name == "PhaseNotActiveError" or "phase" in lowered and "conflict" in lowered:
        return EffectCommandError("PHASE_CONFLICT", message, 4, False, details)
    if "identity mismatch" in lowered:
        return EffectCommandError("LEDGER_IDENTITY_MISMATCH", message, 4, False, details)
    if "different evidence" in lowered:
        return EffectCommandError("EVIDENCE_CONFLICT", message, 4, False, details)
    if "digest" in lowered and ("different" in lowered or "mismatch" in lowered):
        return EffectCommandError("DIGEST_CONFLICT", message, 4, False, details)
    if "commit_requested" in lowered:
        return EffectCommandError("COMMIT_NOT_REQUESTED", message, 5, True, details)
    if "not committed" in lowered or "committed: true" in lowered:
        return EffectCommandError("TURN_NOT_COMMITTED", message, 5, True, details)
    if "unknown effect_id" in lowered:
        return EffectCommandError("EFFECT_NOT_FOUND", message, 3, True, details)
    if "ledger not found" in lowered:
        return EffectCommandError("LEDGER_NOT_FOUND", message, 3, True, details)
    if "intent not found" in lowered:
        return EffectCommandError("INTENT_NOT_FOUND", message, 3, True, details)
    if "turn" in lowered and ("no existe" in lowered or "not found" in lowered):
        return EffectCommandError("TURN_NOT_FOUND", message, 3, True, details)
    if isinstance(error, OSError):
        return EffectCommandError("PERSISTENCE_ERROR", message, 6, True, details)
    if name in {"EffectLedgerError", "InvalidTransitionError"}:
        return EffectCommandError("STATE_CONFLICT", message, 4, False, details)
    if isinstance(error, ValueError):
        return EffectCommandError("STATE_CONFLICT", message, 4, False, details)
    return EffectCommandError("INTERNAL_ERROR", message, 1, True, details)


def emit_error(gc: Any, operation: str, error: Exception, details: dict[str, Any]) -> None:
    contract_error = classify_error(error, details)
    payload = {
        "status": "error",
        "operation": operation,
        "error": {
            "code": contract_error.code,
            "message": contract_error.message,
            "retryable": contract_error.retryable,
            "details": contract_error.details,
        },
        "exit_code": contract_error.exit_code,
    }
    if gc.json_mode:
        typer.echo(json.dumps(payload, ensure_ascii=False))
    else:
        typer.echo(f"❌ [{contract_error.code}] {contract_error.message}", err=True)
    raise typer.Exit(code=contract_error.exit_code)

