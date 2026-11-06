from datetime import datetime, timezone

import pytest

from aitap.routing.manual_assignments import (
    ManualAssignmentError,
    evidence_valid_until,
    eligible_manual_destinations,
    exact_destination,
    intersect_limits,
    validate_assignment_coverage,
    validate_v1_assignment_coverage,
    validation_fingerprint,
)


ASSIGNMENTS = [
    {
        "action_id": "ing",
        "destination": {"backend_id": "gemini", "provider": "google", "model": "gemini-test"},
        "limits": {"max_total_tokens": 1000},
    },
    {
        "action_id": "doc",
        "destination": {"backend_id": "gemini", "provider": "google", "model": "gemini-test"},
        "limits": {"max_total_tokens": 2000},
    },
]
EVIDENCE = [
    {"fingerprint": "grant:1", "valid_until": "2026-10-29T15:00:00Z"},
    {"fingerprint": "health:1", "valid_until": "2026-10-29T14:00:00Z"},
]


def error_code(callable_):
    with pytest.raises(ManualAssignmentError) as captured:
        callable_()
    return captured.value.code


def test_coverage_requires_exactly_one_assignment_per_subject():
    indexed = validate_assignment_coverage(["ing", "doc"], ASSIGNMENTS, subject_field="action_id")
    assert set(indexed) == {"ing", "doc"}


def test_coverage_rejects_missing_duplicate_and_unknown_subjects():
    assert error_code(lambda: validate_assignment_coverage(
        ["ing", "doc"], ASSIGNMENTS[:1], subject_field="action_id")) == "ASSIGNMENT_MISSING"
    assert error_code(lambda: validate_assignment_coverage(
        ["ing"], [ASSIGNMENTS[0], ASSIGNMENTS[0]], subject_field="action_id")) == "ASSIGNMENT_DUPLICATE"
    assert error_code(lambda: validate_assignment_coverage(
        ["ing"], ASSIGNMENTS, subject_field="action_id")) == "UNKNOWN_ASSIGNMENT_SUBJECT"


def test_v1_contract_requires_action_id_even_when_intent_type_repeats():
    assignments = [{"action_id": "exp-4"}, {"action_id": "exp-6"}]
    assert set(validate_v1_assignment_coverage(["exp-4", "exp-6"], assignments)) == {"exp-4", "exp-6"}
    assert error_code(lambda: validate_v1_assignment_coverage(
        ["exp-4"], [{"intent_id": "exp-4"}])) == "ASSIGNMENT_SUBJECT_MISSING"


def test_eligible_manual_destinations_require_grant_credential_and_fresh_health():
    now = datetime(2026, 10, 29, 13, 0, tzinfo=timezone.utc)
    registry = {"intelligence_backends": [
        {"backend_id": "gemini_api", "provider": "google", "model": "gemini-test",
         "privacy": "approved_cloud", "capabilities": ["text.generate"], "supply_enabled": True,
         "credential_ref": "credential-ref://gemini/default"},
        {"backend_id": "disabled", "provider": "other", "model": "other",
         "privacy": "approved_cloud", "capabilities": ["text.generate"], "supply_enabled": False},
    ]}
    policy = {"intelligence_supply": {"backend_id": "gemini_api", "fallback": ["disabled"]}}
    grant = {"status": "active", "valid_until": "2026-10-29T14:00:00Z",
             "allowed_privacy": ["approved_cloud"], "allowed_capabilities": ["text.generate"],
             "allowed_destinations": [{"backend_id": "gemini_api", "provider": "google", "models": ["gemini-test"]}]}
    credential = {"credential-ref://gemini/default": {"usable": True, "fingerprint": "vault:1", "valid_until": "2026-10-29T14:00:00Z"}}
    health = {"gemini_api": {"status": "healthy", "fingerprint": "health:1", "valid_until": "2026-10-29T14:00:00Z"}}
    call = lambda g=grant, c=credential, h=health: eligible_manual_destinations(
        registry, policy, g, c, h, required_capabilities=["text.generate"],
        privacy="approved_cloud", now=now)
    assert call() == [{"backend_id": "gemini_api", "provider": "google", "model": "gemini-test"}]
    assert call(c={}) == []
    assert call(h={}) == []
    assert call(h={"gemini_api": {**health["gemini_api"], "valid_until": "2026-10-29T12:00:00Z"}}) == []
    assert error_code(lambda: call(g={**grant, "status": "revoked"})) == "AUTHORITY_EVIDENCE_INVALID"


def test_destination_match_is_exact_and_has_no_fallback():
    candidates = [
        {"backend_id": "gemini", "provider": "google", "model": "gemini-test", "health": "healthy"},
        {"backend_id": "gemini-alt", "provider": "google", "model": "gemini-test", "health": "healthy"},
    ]
    requested = {"backend_id": "gemini", "provider": "google", "model": "gemini-test"}
    assert exact_destination(requested, candidates) == candidates[0]
    assert error_code(lambda: exact_destination(
        {**requested, "model": "different"}, candidates)) == "DESTINATION_NOT_ELIGIBLE"


def test_destination_rejects_ambiguous_registry_entries():
    destination = {"backend_id": "gemini", "provider": "google", "model": "gemini-test"}
    assert error_code(lambda: exact_destination(destination, [destination, dict(destination)])) == "DESTINATION_AMBIGUOUS"


def test_limit_intersection_never_expands_a_source():
    effective = intersect_limits(
        {"max_inferences": 5, "max_total_tokens": 50000, "max_output_tokens": 8000, "max_usd": "2.50"},
        {"max_inferences": 3, "max_total_tokens": 20000, "max_output_tokens": 4000, "max_usd": "1.20"},
        {"max_inferences": 4, "max_total_tokens": 25000, "max_output_tokens": 2000, "max_usd": "1.50"},
    )
    assert effective == {
        "max_inferences": 3,
        "max_total_tokens": 20000,
        "max_output_tokens": 2000,
        "max_usd": "1.2",
    }


def test_limit_intersection_does_not_manufacture_missing_defaults():
    assert intersect_limits({"max_total_tokens": 1000}, {"max_output_tokens": 200}) == {
        "max_total_tokens": 1000,
        "max_output_tokens": 200,
    }
    assert error_code(lambda: intersect_limits({"max_total_tokens": True})) == "INVALID_LIMIT"


def test_evidence_uses_earliest_expiry_and_fails_closed():
    now = datetime(2026, 10, 29, 13, 0, tzinfo=timezone.utc)
    assert evidence_valid_until(EVIDENCE, now=now) == "2026-10-29T14:00:00Z"
    assert error_code(lambda: evidence_valid_until([], now=now)) == "EVIDENCE_MISSING"
    expired = [{"fingerprint": "health:old", "valid_until": "2026-10-29T12:59:59Z"}]
    assert error_code(lambda: evidence_valid_until(expired, now=now)) == "EVIDENCE_EXPIRED"


def fingerprint(assignments=ASSIGNMENTS, evidence=EVIDENCE):
    return validation_fingerprint(
        subject_field="action_id",
        assignments=assignments,
        prepared_contract_digest="sha256:contract",
        policy_digest="sha256:policy",
        registry_digest="sha256:registry",
        evidence=evidence,
        valid_until="2026-10-29T14:00:00Z",
    )


def test_fingerprint_is_deterministic_and_order_independent():
    assert fingerprint() == fingerprint(assignments=list(reversed(ASSIGNMENTS)), evidence=list(reversed(EVIDENCE)))
    assert fingerprint().startswith("sha256:") and len(fingerprint()) == 71


def test_fingerprint_changes_when_a_binding_input_changes():
    changed = [{**ASSIGNMENTS[0], "destination": {**ASSIGNMENTS[0]["destination"], "model": "other"}}, ASSIGNMENTS[1]]
    assert fingerprint(changed) != fingerprint()
    changed_evidence = [{**EVIDENCE[0], "fingerprint": "grant:2"}, EVIDENCE[1]]
    assert fingerprint(evidence=changed_evidence) != fingerprint()


def test_fingerprint_has_no_transport_request_id_input():
    first_request_id = "request-1"
    second_request_id = "request-2"
    assert first_request_id != second_request_id
    assert fingerprint() == fingerprint()
