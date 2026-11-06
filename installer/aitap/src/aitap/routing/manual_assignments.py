"""Pure validation primitives for manual Intelligence Supply assignments.

This module deliberately has no transport, persistence, provider, Vault, or
Accounting integration. The approved public subject is ``action_id``.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Iterable, Mapping, Sequence


DESTINATION_FIELDS = ("backend_id", "provider", "model")
ASSIGNMENT_SCHEMA_VERSION = "bloom.intent-supply-assignments/v1"
INTEGER_LIMITS = ("max_inferences", "max_total_tokens", "max_output_tokens")
DECIMAL_LIMITS = ("max_usd",)


class ManualAssignmentError(ValueError):
    """A deterministic manual-assignment validation failure."""

    def __init__(self, code: str, *, subject: str | None = None, detail: str | None = None):
        self.code = code
        self.subject = subject
        self.detail = detail
        message = code
        if subject is not None:
            message += f" [{subject}]"
        if detail:
            message += f": {detail}"
        super().__init__(message)


def eligible_manual_destinations(
    registry: Mapping[str, Any], policy: Mapping[str, Any], grant: Mapping[str, Any],
    credential_evidence: Mapping[str, Mapping[str, Any]],
    health_evidence: Mapping[str, Mapping[str, Any]],
    *, required_capabilities: Sequence[str], privacy: str, now: datetime,
) -> list[dict[str, str]]:
    """Read-only intersection of signed policy/registry, Authority and fresh observations.

    Unknown evidence never makes a destination eligible. The returned rows
    contain only backend/provider/model, never credential references.
    """
    if now.tzinfo is None or grant.get("status") != "active" or not privacy:
        raise ManualAssignmentError("AUTHORITY_EVIDENCE_INVALID")
    if _timestamp(grant.get("valid_until")) <= now:
        raise ManualAssignmentError("EVIDENCE_EXPIRED")
    allowed_privacy = grant.get("allowed_privacy")
    allowed_capabilities = grant.get("allowed_capabilities")
    allowed_destinations = grant.get("allowed_destinations")
    backends = registry.get("intelligence_backends")
    rule = policy.get("intelligence_supply")
    if (not isinstance(allowed_privacy, list) or not isinstance(allowed_capabilities, list)
            or not isinstance(allowed_destinations, list) or not isinstance(backends, list)
            or not isinstance(rule, dict) or not isinstance(rule.get("fallback"), list)):
        raise ManualAssignmentError("ELIGIBILITY_EVIDENCE_INVALID")
    if privacy not in allowed_privacy or set(required_capabilities) - set(allowed_capabilities):
        return []
    permitted_by_policy = {rule.get("backend_id"), *rule["fallback"]}
    result: list[dict[str, str]] = []
    for backend in backends:
        if not isinstance(backend, dict) or backend.get("backend_id") not in permitted_by_policy:
            continue
        backend_id, provider, model = (backend.get(field) for field in DESTINATION_FIELDS)
        if not all(isinstance(value, str) and value for value in (backend_id, provider, model)):
            continue
        if (backend.get("supply_enabled") is not True or backend.get("privacy") != privacy
                or set(required_capabilities) - set(backend.get("capabilities") or [])):
            continue
        if sum(1 for item in allowed_destinations if isinstance(item, dict)
               and item.get("backend_id") == backend_id and item.get("provider") == provider
               and isinstance(item.get("models"), list) and model in item["models"]) != 1:
            continue
        health = health_evidence.get(backend_id)
        if (not isinstance(health, dict) or health.get("status") != "healthy"
                or not health.get("fingerprint") or _timestamp(health.get("valid_until")) <= now):
            continue
        credential_ref = backend.get("credential_ref")
        if credential_ref is not None:
            credential = credential_evidence.get(credential_ref)
            if (not isinstance(credential, dict) or credential.get("usable") is not True
                    or not credential.get("fingerprint") or _timestamp(credential.get("valid_until")) <= now):
                continue
        result.append({"backend_id": backend_id, "provider": provider, "model": model})
    return result


def evaluate_manual_assignments(
    mode: str, request: Mapping[str, Any], *, policy: Mapping[str, Any],
    registry: Mapping[str, Any], policy_sha256: str, registry_sha256: str,
    health_evidence: Mapping[str, Mapping[str, Any]], health_source_status: str,
    health_source_reason: str | None, health_snapshot_id: str | None,
    now: datetime,
) -> dict[str, Any]:
    """List or validate manual Supply destinations without external effects."""
    if mode not in {"list", "validate"}:
        raise ManualAssignmentError("INVALID_OPERATION")
    if now.tzinfo is None:
        raise ManualAssignmentError("INVALID_CURRENT_TIME")
    _require_bindings(request, policy, registry, policy_sha256, registry_sha256)

    authority = request["authority"]
    credentials = {item["credential_ref"]: item for item in request["credentials"]}
    health = dict(health_evidence)
    if len(credentials) != len(request["credentials"]):
        raise ManualAssignmentError("DUPLICATE_EVIDENCE")
    grant = {**authority, "status": "active"}
    effective_limits = _effective_limits(policy, authority)
    action_destinations: dict[str, list[dict[str, str]]] = {}
    action_rows: list[dict[str, Any]] = []
    for action in request["actions"]:
        destinations: list[dict[str, str]] = []
        for privacy in authority["allowed_privacy"]:
            destinations.extend(eligible_manual_destinations(
                registry, policy, grant, credentials, health,
                required_capabilities=action["requiredCapabilities"], privacy=privacy, now=now,
            ))
        destinations = _unique_destinations(destinations)
        missing = _missing_evidence_reasons(
            registry, policy, authority, credentials, health,
            required_capabilities=action["requiredCapabilities"],
            health_source_status=health_source_status,
            health_source_reason=health_source_reason,
            now=now,
        )
        eligibility = ("eligible" if destinations else
                       "evidence_missing" if missing else "not_eligible")
        action_destinations[action["action_id"]] = destinations
        action_row = {
            "action_id": action["action_id"],
            "requiredCapabilities": list(action["requiredCapabilities"]),
            "eligibility": eligibility,
            "destinations": destinations,
            "errors": [] if destinations else (missing or ["NO_ELIGIBLE_DESTINATION"]),
        }
        if mode == "list":
            action_row["limit_ceiling"] = dict(effective_limits)
        action_rows.append(action_row)

    common = {
        "schema_version": ASSIGNMENT_SCHEMA_VERSION,
        "operation": mode,
        "request_id": request["request_id"],
        "mandate_id": request["mandate_id"],
        "prepared_contract_digest": request["prepared_contract_digest"],
        "health": {"source": "aitap", "status": health_source_status,
                   "snapshot_id": health_snapshot_id},
        "actions": action_rows,
    }
    if mode == "list":
        return {**common, "status": "eligible" if all(not row["errors"] for row in action_rows) else "not_ready"}

    assignments = request.get("assignments")
    if not isinstance(assignments, list):
        raise ManualAssignmentError("ASSIGNMENTS_REQUIRED")
    indexed, duplicate_ids, unknown_ids = _index_assignments(assignments, set(action_destinations))
    used_evidence: list[Mapping[str, Any]] = [{
        "fingerprint": authority["authority_state_digest"], "valid_until": authority["valid_until"],
    }]
    normalized: list[dict[str, Any]] = []
    row_by_id = {row["action_id"]: row for row in action_rows}
    for action_id, candidates in action_destinations.items():
        row = row_by_id[action_id]
        row.pop("destinations", None)
        assignment = indexed.get(action_id)
        if action_id in duplicate_ids:
            row["errors"] = ["ASSIGNMENT_DUPLICATE"]
            continue
        if assignment is None:
            row["errors"] = ["ASSIGNMENT_MISSING"]
            continue
        try:
            destination = dict(exact_destination(assignment.get("destination") or {}, candidates))
            limits = _validate_assignment_limits(assignment.get("limits"), effective_limits)
        except ManualAssignmentError as exc:
            row["errors"] = [exc.code]
            continue
        normalized.append({"action_id": action_id, "destination": {
            field: destination[field] for field in DESTINATION_FIELDS}, "limits": limits})
        backend = next(item for item in registry["intelligence_backends"]
                       if all(item.get(field) == destination[field] for field in DESTINATION_FIELDS))
        used_evidence.append(health[destination["backend_id"]])
        if backend.get("credential_ref") is not None:
            used_evidence.append(credentials[backend["credential_ref"]])
        row["errors"] = []

    global_errors = ["UNKNOWN_ACTION"] if unknown_ids else []
    if not global_errors and not any(row["errors"] for row in action_rows):
        try:
            _validate_aggregate_limits(normalized, effective_limits)
        except ManualAssignmentError as exc:
            global_errors.append(exc.code)
    if global_errors or any(row["errors"] for row in action_rows):
        return {**common, "status": "invalid", "errors": global_errors,
                "fingerprint": None, "validated_at": _timestamp_text(now), "valid_until": None}

    valid_until = evidence_valid_until(used_evidence, now=now)
    fingerprint = validation_fingerprint(
        subject_field="action_id", assignments=normalized,
        prepared_contract_digest=request["prepared_contract_digest"],
        policy_digest=policy_sha256, registry_digest=registry_sha256,
        evidence=used_evidence, valid_until=valid_until,
    )
    package = {
        "schema_version": ASSIGNMENT_SCHEMA_VERSION,
        "mandate_id": request["mandate_id"],
        "prepared_contract_digest": request["prepared_contract_digest"],
        "assignments": normalized,
        "validation": {"fingerprint": fingerprint, "validated_at": _timestamp_text(now),
                       "valid_until": valid_until},
    }
    return {**common, "status": "valid", "errors": [], "fingerprint": fingerprint,
            "validated_at": _timestamp_text(now), "valid_until": valid_until,
            "assignment_package": package}


def _missing_evidence_reasons(
    registry: Mapping[str, Any], policy: Mapping[str, Any], authority: Mapping[str, Any],
    credentials: Mapping[str, Mapping[str, Any]], health: Mapping[str, Mapping[str, Any]],
    *, required_capabilities: Sequence[str], health_source_status: str,
    health_source_reason: str | None, now: datetime,
) -> list[str]:
    """Explain unknown evidence without treating a known rejection as unknown."""
    reasons: set[str] = set()
    rule = policy.get("intelligence_supply") or {}
    permitted = {rule.get("backend_id"), *(rule.get("fallback") or [])}
    allowed = authority.get("allowed_destinations") or []
    for backend in registry.get("intelligence_backends") or []:
        if not isinstance(backend, Mapping) or backend.get("backend_id") not in permitted:
            continue
        backend_id = backend.get("backend_id")
        if (backend.get("supply_enabled") is not True
                or backend.get("privacy") not in (authority.get("allowed_privacy") or [])
                or set(required_capabilities) - set(backend.get("capabilities") or [])):
            continue
        if not any(isinstance(item, Mapping) and item.get("backend_id") == backend_id
                   and item.get("provider") == backend.get("provider")
                   and backend.get("model") in (item.get("models") or []) for item in allowed):
            continue
        observation = health.get(str(backend_id))
        if not isinstance(observation, Mapping):
            reasons.add(health_source_reason or "HEALTH_EVIDENCE_MISSING")
        elif not observation.get("fingerprint") or _timestamp(observation.get("valid_until")) <= now:
            reasons.add("HEALTH_EVIDENCE_STALE")
        credential_ref = backend.get("credential_ref")
        if credential_ref is not None:
            credential = credentials.get(str(credential_ref))
            if not isinstance(credential, Mapping):
                reasons.add("CREDENTIAL_EVIDENCE_MISSING")
            elif not credential.get("fingerprint") or _timestamp(credential.get("valid_until")) <= now:
                reasons.add("CREDENTIAL_EVIDENCE_STALE")
    if health_source_status not in {"fresh", "missing", "stale", "invalid"}:
        reasons.add("HEALTH_EVIDENCE_INVALID")
    return sorted(reasons)


def _require_bindings(request: Mapping[str, Any], policy: Mapping[str, Any], registry: Mapping[str, Any],
                      policy_sha256: str, registry_sha256: str) -> None:
    authority = request.get("authority")
    if not isinstance(authority, Mapping):
        raise ManualAssignmentError("AUTHORITY_EVIDENCE_INVALID")
    if (request.get("policy_version") != policy.get("policy_version")
            or request.get("policy_sha256") != policy_sha256):
        raise ManualAssignmentError("POLICY_MISMATCH")
    if (request.get("registry_snapshot_id") != registry.get("snapshot_id")
            or request.get("registry_sha256") != registry_sha256):
        raise ManualAssignmentError("REGISTRY_MISMATCH")
    if (authority.get("mandate_id") != request.get("mandate_id")
            or authority.get("prepared_contract_digest") != request.get("prepared_contract_digest")
            or not authority.get("authority_version") or not authority.get("authority_state_digest")):
        raise ManualAssignmentError("AUTHORITY_BINDING_MISMATCH")
    action_ids = [item.get("action_id") for item in request.get("actions", [])]
    if len(action_ids) != len(set(action_ids)):
        raise ManualAssignmentError("DUPLICATE_REQUIRED_SUBJECT")


def _unique_destinations(values: Sequence[Mapping[str, Any]]) -> list[dict[str, str]]:
    counts: dict[tuple[str, str, str], int] = {}
    for item in values:
        key = tuple(str(item.get(field, "")) for field in DESTINATION_FIELDS)
        counts[key] = counts.get(key, 0) + 1
    return [dict(zip(DESTINATION_FIELDS, key)) for key, count in sorted(counts.items()) if count == 1]


def _index_assignments(assignments: Sequence[Mapping[str, Any]], known: set[str]) -> tuple[
        dict[str, Mapping[str, Any]], set[str], set[str]]:
    indexed: dict[str, Mapping[str, Any]] = {}
    duplicates: set[str] = set()
    unknown: set[str] = set()
    for assignment in assignments:
        action_id = assignment.get("action_id")
        if not isinstance(action_id, str) or not action_id:
            unknown.add("")
            continue
        if action_id in indexed:
            duplicates.add(action_id)
        indexed[action_id] = assignment
        if action_id not in known:
            unknown.add(action_id)
    return indexed, duplicates, unknown


def _effective_limits(policy: Mapping[str, Any], authority: Mapping[str, Any]) -> dict[str, int | str]:
    rule = policy.get("intelligence_supply") or {}
    budget = rule.get("budget") or {}
    grant = authority.get("limits") or {}
    policy_limits = {key: budget[key] for key in ("max_inferences", "max_total_tokens", "max_usd")
                     if key in budget}
    if "max_output_tokens" in rule:
        policy_limits["max_output_tokens"] = rule["max_output_tokens"]
    grant_limits = dict(grant)
    if "max_output_tokens_per_inference" in grant_limits:
        grant_limits["max_output_tokens"] = grant_limits.pop("max_output_tokens_per_inference")
    effective = intersect_limits(policy_limits, grant_limits)
    required = {"max_inferences", "max_total_tokens", "max_output_tokens"}
    if not required.issubset(effective):
        raise ManualAssignmentError("LIMITS_UNVERIFIABLE")
    return effective


def _validate_assignment_limits(value: Any, ceiling: Mapping[str, Any]) -> dict[str, int | str]:
    if not isinstance(value, Mapping):
        raise ManualAssignmentError("LIMITS_REQUIRED")
    normalized = intersect_limits(value)
    required = {"max_inferences", "max_total_tokens", "max_output_tokens"}
    if not required.issubset(normalized):
        raise ManualAssignmentError("LIMITS_REQUIRED")
    for field in required:
        if int(normalized[field]) > int(ceiling[field]):
            raise ManualAssignmentError("LIMIT_EXCEEDED")
    if "max_usd" in normalized:
        if "max_usd" not in ceiling or Decimal(str(normalized["max_usd"])) > Decimal(str(ceiling["max_usd"])):
            raise ManualAssignmentError("LIMIT_EXCEEDED")
    return normalized


def _validate_aggregate_limits(assignments: Sequence[Mapping[str, Any]], ceiling: Mapping[str, Any]) -> None:
    for field in ("max_inferences", "max_total_tokens"):
        if sum(int(item["limits"][field]) for item in assignments) > int(ceiling[field]):
            raise ManualAssignmentError("AGGREGATE_LIMIT_EXCEEDED")
    usd = [Decimal(str(item["limits"]["max_usd"])) for item in assignments if "max_usd" in item["limits"]]
    if usd and ("max_usd" not in ceiling or sum(usd) > Decimal(str(ceiling["max_usd"]))):
        raise ManualAssignmentError("AGGREGATE_LIMIT_EXCEEDED")


def validate_assignment_coverage(
    required_subjects: Iterable[str],
    assignments: Sequence[Mapping[str, Any]],
    *,
    subject_field: str,
) -> dict[str, Mapping[str, Any]]:
    """Require exactly one assignment for every required subject and no extras."""
    required = list(required_subjects)
    if any(not isinstance(subject, str) or not subject for subject in required):
        raise ManualAssignmentError("INVALID_REQUIRED_SUBJECT")
    if len(required) != len(set(required)):
        raise ManualAssignmentError("DUPLICATE_REQUIRED_SUBJECT")

    indexed: dict[str, Mapping[str, Any]] = {}
    for assignment in assignments:
        subject = assignment.get(subject_field)
        if not isinstance(subject, str) or not subject:
            raise ManualAssignmentError("ASSIGNMENT_SUBJECT_MISSING")
        if subject in indexed:
            raise ManualAssignmentError("ASSIGNMENT_DUPLICATE", subject=subject)
        indexed[subject] = assignment

    required_set = set(required)
    missing = sorted(required_set - indexed.keys())
    if missing:
        raise ManualAssignmentError("ASSIGNMENT_MISSING", subject=missing[0])
    unknown = sorted(indexed.keys() - required_set)
    if unknown:
        raise ManualAssignmentError("UNKNOWN_ASSIGNMENT_SUBJECT", subject=unknown[0])
    return indexed


def validate_v1_assignment_coverage(
    required_action_ids: Iterable[str], assignments: Sequence[Mapping[str, Any]],
) -> dict[str, Mapping[str, Any]]:
    """The approved v1 wire contract binds each selection by action_id."""
    return validate_assignment_coverage(required_action_ids, assignments, subject_field="action_id")


def exact_destination(
    requested: Mapping[str, Any],
    eligible_destinations: Sequence[Mapping[str, Any]],
) -> Mapping[str, Any]:
    """Return the single exact backend/provider/model match; never fall back."""
    for field in DESTINATION_FIELDS:
        if not isinstance(requested.get(field), str) or not requested[field]:
            raise ManualAssignmentError("DESTINATION_FIELD_MISSING", detail=field)
    matches = [
        candidate
        for candidate in eligible_destinations
        if all(candidate.get(field) == requested[field] for field in DESTINATION_FIELDS)
    ]
    if not matches:
        raise ManualAssignmentError("DESTINATION_NOT_ELIGIBLE")
    if len(matches) != 1:
        raise ManualAssignmentError("DESTINATION_AMBIGUOUS")
    return matches[0]


def intersect_limits(*sources: Mapping[str, Any] | None) -> dict[str, int | str]:
    """Return the most restrictive declared limit without manufacturing defaults."""
    present = [source for source in sources if source is not None]
    result: dict[str, int | str] = {}
    for field in INTEGER_LIMITS:
        values = [_positive_int(source[field], field) for source in present if field in source]
        if values:
            result[field] = min(values)
    for field in DECIMAL_LIMITS:
        values = [_non_negative_decimal(source[field], field) for source in present if field in source]
        if values:
            result[field] = _decimal_text(min(values))
    return result


def evidence_valid_until(
    evidence: Sequence[Mapping[str, Any]],
    *,
    now: datetime | None = None,
) -> str:
    """Validate every evidence item and return their earliest expiry."""
    if not evidence:
        raise ManualAssignmentError("EVIDENCE_MISSING")
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        raise ManualAssignmentError("INVALID_CURRENT_TIME")
    expiries: list[datetime] = []
    for item in evidence:
        if not isinstance(item.get("fingerprint"), str) or not item["fingerprint"]:
            raise ManualAssignmentError("EVIDENCE_FINGERPRINT_MISSING")
        expiry = _timestamp(item.get("valid_until"))
        if expiry <= current:
            raise ManualAssignmentError("EVIDENCE_EXPIRED")
        expiries.append(expiry)
    return _timestamp_text(min(expiries))


def validation_fingerprint(
    *,
    subject_field: str,
    assignments: Sequence[Mapping[str, Any]],
    prepared_contract_digest: str,
    policy_digest: str,
    registry_digest: str,
    evidence: Sequence[Mapping[str, Any]],
    valid_until: str,
) -> str:
    """Fingerprint only binding inputs; transport request IDs are intentionally absent."""
    if not isinstance(subject_field, str) or not subject_field:
        raise ManualAssignmentError("SUBJECT_FIELD_MISSING")
    for name, value in (
        ("prepared_contract_digest", prepared_contract_digest),
        ("policy_digest", policy_digest),
        ("registry_digest", registry_digest),
    ):
        if not isinstance(value, str) or not value:
            raise ManualAssignmentError("BINDING_DIGEST_MISSING", detail=name)
    _timestamp(valid_until)
    ordered_assignments = sorted(
        (dict(item) for item in assignments),
        key=lambda item: str(item.get(subject_field, "")),
    )
    ordered_evidence = sorted(
        ({"fingerprint": item.get("fingerprint"), "valid_until": item.get("valid_until")} for item in evidence),
        key=lambda item: (str(item["fingerprint"]), str(item["valid_until"])),
    )
    identity = {
        "subject_field": subject_field,
        "assignments": ordered_assignments,
        "prepared_contract_digest": prepared_contract_digest,
        "policy_digest": policy_digest,
        "registry_digest": registry_digest,
        "evidence": ordered_evidence,
        "valid_until": valid_until,
    }
    raw = json.dumps(identity, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return "sha256:" + hashlib.sha256(raw).hexdigest()


def _positive_int(value: Any, field: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise ManualAssignmentError("INVALID_LIMIT", detail=field)
    return value


def _non_negative_decimal(value: Any, field: str) -> Decimal:
    if isinstance(value, bool):
        raise ManualAssignmentError("INVALID_LIMIT", detail=field)
    try:
        decimal = Decimal(str(value))
    except (InvalidOperation, ValueError):
        raise ManualAssignmentError("INVALID_LIMIT", detail=field) from None
    if not decimal.is_finite() or decimal < 0:
        raise ManualAssignmentError("INVALID_LIMIT", detail=field)
    return decimal


def _decimal_text(value: Decimal) -> str:
    text = format(value.normalize(), "f")
    return "0" if text in {"-0", ""} else text


def _timestamp(value: Any) -> datetime:
    if not isinstance(value, str) or not value:
        raise ManualAssignmentError("EVIDENCE_VALID_UNTIL_MISSING")
    try:
        parsed = datetime.fromisoformat(value[:-1] + "+00:00" if value.endswith("Z") else value)
    except ValueError:
        raise ManualAssignmentError("INVALID_TIMESTAMP") from None
    if parsed.tzinfo is None:
        raise ManualAssignmentError("INVALID_TIMESTAMP")
    return parsed.astimezone(timezone.utc)


def _timestamp_text(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
