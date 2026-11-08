import hashlib
import importlib
import inspect
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, FormatChecker

from aitap.routing.engine import RoutingEngine
from aitap.routing.manual_assignments import ManualAssignmentError, evaluate_manual_assignments


ROOT = Path(__file__).resolve().parents[1]
NOW = datetime(2026, 10, 31, 12, 0, tzinfo=timezone.utc)
CONTRACT_DIGEST = "sha256:" + "a" * 64


def write_routing(tmp_path):
    policy = {
        "schema_version": "cognituum.routing-policy/v2", "policy_version": "mandate-gen/v1",
        "intelligence_supply": {"backend_id": "anthropic_api", "fallback": ["gemini_api"],
                                "max_attempts": 2, "max_output_tokens": 4096,
                                "budget": {"per_mandate": True, "max_usd": "1.000000",
                                           "max_total_tokens": 20000, "max_inferences": 2}},
        "stages": {},
    }
    registry = {
        "schema_version": "cognituum.routing-registry/v2", "snapshot_id": "test/v1",
        "snapshot_status": "observed", "runtimes": [],
        "intelligence_backends": [
            {"backend_id": "anthropic_api", "provider": "anthropic", "model": "claude-test",
             "credential_ref": "credential-ref://anthropic/default", "capabilities": ["text.generate"],
             "privacy": "approved_cloud", "health": "unknown", "accounting_ref": "accounting://anthropic",
             "supply_enabled": True},
            {"backend_id": "gemini_api", "provider": "google", "model": "gemini-test",
             "credential_ref": "credential-ref://gemini/default", "capabilities": ["text.generate"],
             "privacy": "approved_cloud", "health": "unknown", "accounting_ref": "accounting://gemini",
             "supply_enabled": True},
        ],
    }
    policy_path, registry_path = tmp_path / "policy.json", tmp_path / "registry.json"
    policy_path.write_text(json.dumps(policy, separators=(",", ":")), encoding="utf-8")
    registry_path.write_text(json.dumps(registry, separators=(",", ":")), encoding="utf-8")
    return RoutingEngine.from_files(policy_path, registry_path), policy_path, registry_path


def request(engine, *, include_assignments=False):
    value = {
        "schema_version": "bloom.intent-supply-assignments/v1", "request_id": "request-1",
        "mandate_id": "mandate-1", "prepared_contract_digest": CONTRACT_DIGEST,
        "policy_version": engine.policy["policy_version"], "policy_sha256": engine.policy_sha256,
        "registry_snapshot_id": engine.registry["snapshot_id"], "registry_sha256": engine.registry_sha256,
        "actions": [
            {"action_id": "ing-1", "requiredCapabilities": ["text.generate"]},
            {"action_id": "dis-2", "requiredCapabilities": ["text.generate"]},
        ],
        "authority": {
            "organization_id": "org-1", "project_id": "project-1", "mandate_id": "mandate-1",
            "prepared_contract_digest": CONTRACT_DIGEST,
            "valid_until": "2099-01-01T00:00:00Z", "authority_version": "42",
            "authority_state_digest": "authority-state-42",
        },
        "credentials": [
            {"credential_ref": "credential-ref://anthropic/default", "usable": True,
             "fingerprint": "credential-anthropic", "valid_until": "2099-01-01T00:00:00Z"},
            {"credential_ref": "credential-ref://gemini/default", "usable": True,
             "fingerprint": "credential-gemini", "valid_until": "2099-01-01T00:00:00Z"},
        ],
    }
    if include_assignments:
        value["assignments"] = [
            {"action_id": action_id,
             "destination": {"backend_id": "anthropic_api", "provider": "anthropic", "model": "claude-test"}}
            for action_id in ("ing-1", "dis-2")
        ]
    return value


def health_evidence():
    return {
        "anthropic_api": {"status": "healthy", "fingerprint": "health-anthropic",
                          "valid_until": "2099-01-01T00:00:00Z"},
        "gemini_api": {"status": "healthy", "fingerprint": "health-gemini",
                       "valid_until": "2099-01-01T00:00:00Z"},
    }


def evaluate(mode, value, engine, health=None, source_status="fresh", source_reason=None):
    return evaluate_manual_assignments(
        mode, value, policy=engine.policy, registry=engine.registry,
        policy_sha256=engine.policy_sha256, registry_sha256=engine.registry_sha256,
        health_evidence=health_evidence() if health is None else health,
        health_source_status=source_status, health_source_reason=source_reason,
        health_snapshot_id="health-test/v1" if source_status == "fresh" else None, now=NOW)


def test_list_returns_only_sanitized_eligible_destinations_for_each_genesis_action(tmp_path):
    engine, _, _ = write_routing(tmp_path)
    result = evaluate("list", request(engine), engine)
    assert result["status"] == "eligible"
    assert [row["action_id"] for row in result["actions"]] == ["ing-1", "dis-2"]
    assert result["actions"][0]["destinations"] == [
        {"backend_id": "anthropic_api", "provider": "anthropic", "model": "claude-test"},
        {"backend_id": "gemini_api", "provider": "google", "model": "gemini-test"},
    ]
    assert all("limit_ceiling" not in row for row in result["actions"])
    assert "credential_ref" not in json.dumps(result)


def test_validate_allows_shared_destination_and_emits_valid_package(tmp_path):
    engine, _, _ = write_routing(tmp_path)
    result = evaluate("validate", request(engine, include_assignments=True), engine)
    assert result["status"] == "valid" and all(not row["errors"] for row in result["actions"])
    assert result["fingerprint"].startswith("sha256:")
    assert result["valid_until"] == "2099-01-01T00:00:00Z"
    package = result["assignment_package"]
    assert all("limits" not in item for item in package["assignments"])
    assert [item["destination"]["backend_id"] for item in package["assignments"]] == [
        "anthropic_api", "anthropic_api"]
    schema = json.loads((ROOT / "contracts/v2/intent-supply-assignments.schema.json").read_text())
    Draft202012Validator(schema, format_checker=FormatChecker()).validate(package)


def test_validate_rejects_ineligible_model_per_action_without_fallback(tmp_path):
    engine, _, _ = write_routing(tmp_path)
    value = request(engine, include_assignments=True)
    value["assignments"][1]["destination"]["model"] = "not-granted"
    result = evaluate("validate", value, engine)
    assert result["status"] == "invalid" and result["fingerprint"] is None
    assert result["actions"][0]["errors"] == []
    assert result["actions"][1]["errors"] == ["DESTINATION_NOT_ELIGIBLE"]


def test_unknown_credential_health_and_capability_fail_closed(tmp_path):
    engine, _, _ = write_routing(tmp_path)
    value = request(engine)
    value["credentials"] = []
    missing = evaluate("list", value, engine, health={}, source_status="missing",
                       source_reason="HEALTH_EVIDENCE_MISSING")
    assert all(row["eligibility"] == "evidence_missing" for row in missing["actions"])
    assert all(set(row["errors"]) == {"CREDENTIAL_EVIDENCE_MISSING", "HEALTH_EVIDENCE_MISSING"}
               for row in missing["actions"])
    value = request(engine)
    value["actions"][0]["requiredCapabilities"] = ["unknown.capability"]
    first = evaluate("list", value, engine)["actions"][0]
    assert first["destinations"] == [] and first["errors"] == ["NO_ELIGIBLE_DESTINATION"]


def test_explicit_unknown_health_is_not_eligible_and_is_not_missing_evidence(tmp_path):
    engine, _, _ = write_routing(tmp_path)
    health = health_evidence()
    for observation in health.values():
        observation["status"] = "unknown"
    result = evaluate("list", request(engine), engine, health=health)
    assert result["status"] == "not_ready"
    assert all(row["eligibility"] == "not_eligible" for row in result["actions"])
    assert all(row["destinations"] == [] for row in result["actions"])


def test_nucleus_request_cannot_assert_backend_health(tmp_path):
    engine, _, _ = write_routing(tmp_path)
    value = request(engine)
    value["health"] = [{"backend_id": "gemini_api", "status": "healthy"}]
    schema = json.loads((ROOT / "contracts/v2/intent-supply-assignments-operation.schema.json").read_text())
    errors = list(Draft202012Validator(schema, format_checker=FormatChecker()).iter_errors(value))
    assert any("Additional properties are not allowed" in error.message for error in errors)


def test_expired_authority_health_or_credential_is_rejected(tmp_path):
    engine, _, _ = write_routing(tmp_path)
    for field, key in (("authority", None), ("credentials", 0)):
        value = request(engine)
        target = value[field] if key is None else value[field][key]
        target["valid_until"] = "2026-10-31T11:59:59Z"
        if field == "authority":
            with pytest.raises(ManualAssignmentError, match="EVIDENCE_EXPIRED"):
                evaluate("list", value, engine)
        else:
            result = evaluate("list", value, engine)
            assert any(row["destinations"] for row in result["actions"])
            expired_backend = "anthropic_api"
            assert all(expired_backend not in {d["backend_id"] for d in row["destinations"]}
                       for row in result["actions"])
    health = health_evidence()
    health["anthropic_api"]["valid_until"] = "2026-10-31T11:59:59Z"
    result = evaluate("list", request(engine), engine, health=health)
    assert all("anthropic_api" not in {d["backend_id"] for d in row["destinations"]}
               for row in result["actions"])


def test_policy_and_registry_exact_bytes_are_bound(tmp_path):
    engine, _, _ = write_routing(tmp_path)
    value = request(engine)
    value["policy_sha256"] = hashlib.sha256(b"different").hexdigest()
    with pytest.raises(ManualAssignmentError, match="POLICY_MISMATCH"):
        evaluate("list", value, engine)


def test_cli_fails_closed_without_probe_grant_and_has_no_accounting_side_effects(tmp_path):
    engine, policy_path, registry_path = write_routing(tmp_path)
    environment = {**os.environ, "PYTHONPATH": str(ROOT / "src"), "PYTHONIOENCODING": "utf-8"}
    state = tmp_path / "state-that-must-remain-absent"
    state.mkdir(parents=True)

    def run(mode, value):
        request_path = tmp_path / f"{mode}.json"
        request_path.write_text(json.dumps(value), encoding="utf-8")
        return subprocess.run(
            [sys.executable, "-B", "-m", "aitap", "--json", "route", "assignments",
             "--mode", mode, "--request", str(request_path), "--policy", str(policy_path),
             "--registry", str(registry_path)],
            capture_output=True, text=True, encoding="utf-8", timeout=30,
            env={**environment, "AITAP_STATE_DIR": str(state)},
        )

    listed = run("list", request(engine))
    assert listed.returncode == 0, listed.stderr
    list_payload = json.loads(listed.stdout)
    assert list_payload["operation"] == "route.assignments"
    assert list_payload["data"]["status"] == "not_ready"
    assert all(row["eligibility"] == "evidence_missing" and row["destinations"] == []
               for row in list_payload["data"]["actions"])
    validated = run("validate", request(engine, include_assignments=True))
    assert validated.returncode == 0, validated.stderr
    assert json.loads(validated.stdout)["data"]["status"] == "invalid"
    assert not (state / "accounting").exists()


def test_listing_surface_has_no_generation_or_token_count_dependency():
    command_source = inspect.getsource(importlib.import_module("aitap.commands.route.assignments"))
    domain_source = inspect.getsource(importlib.import_module("aitap.routing.manual_assignments"))
    combined = command_source + domain_source
    assert ".generate(" not in combined
    assert "count_input_tokens" not in combined
