import copy
import unittest
from pathlib import Path

from aitap.routing import RoutingEngine, RoutingError


ROOT = Path(__file__).resolve().parents[1]


def request(**changes):
    value = {
        "schema_version": "cognituum.routing/v2",
        "routing_request_id": "rr-1",
        "logical_inference_id": "li-1",
        "intent_id": "intent-1",
        "stage": "ing",
        "turn_id": "turn-1",
        "routing_mode": "policy",
        "policy_version": "genesis-runtime-intelligence/v2",
        "runtime": {"required_capabilities": ["filesystem.patch"], "forced_runtime_id": None, "previous_runtime_id": None, "excluded_runtime_ids": []},
        "intelligence": {"required_capabilities": ["text.generate"], "privacy": "approved_cloud", "forced_backend_id": None, "forced_model": None, "previous_backend_id": None, "excluded_backend_ids": []},
        "sticky_decision_id": None,
        "override_ref": None,
    }
    value.update(changes)
    return value


class RoutingEngineTest(unittest.TestCase):
    def test_supply_does_not_require_execution_runtime_health(self):
        from test_intelligence_service import request as supply_request
        registry = copy.deepcopy(self.engine.registry)
        for runtime in registry["runtimes"]:
            runtime["health"] = "unavailable"
        routes = RoutingEngine(self.engine.policy, registry).supply_routes(supply_request())
        self.assertEqual(routes[0]["effective_intelligence"]["provider"], "anthropic")
        self.assertNotIn("runtime", routes[0])

    @classmethod
    def setUpClass(cls):
        cls.engine = RoutingEngine.from_files(
            ROOT / "policies" / "genesis-runtime-intelligence-v2.json",
            ROOT / "registry" / "genesis-pilot-v2.json",
        )

    def test_policy_selects_runtime_and_intelligence_separately(self):
        decision = self.engine.decide(request())
        self.assertEqual("codex_cli", decision["runtime"]["runtime_id"])
        self.assertEqual("openai", decision["effective_intelligence"]["provider"])
        self.assertEqual("gpt-4", decision["effective_intelligence"]["model"])
        self.assertEqual("credential-ref://openai/default", decision["effective_intelligence"]["credential_ref"])

    def test_opencode_cannot_be_registered_as_intelligence_provider(self):
        self.assertNotIn("opencode", {item["backend_id"] for item in self.engine.registry["intelligence_backends"]})
        bad_registry = copy.deepcopy(self.engine.registry)
        bad_registry["intelligence_backends"].append({"backend_id": "opencode", "provider": "opencode", "model": "opencode", "credential_ref": None, "capabilities": ["text.generate"], "privacy": "local", "health": "healthy", "accounting_ref": "accounting://backend/opencode"})
        bad_policy = copy.deepcopy(self.engine.policy)
        bad_policy["stages"]["ing"]["backend_id"] = "opencode"
        bad_registry["runtimes"][0]["supported_backend_ids"].append("opencode")
        with self.assertRaises(RoutingError):
            RoutingEngine(bad_policy, bad_registry).decide(request(runtime={**request()["runtime"], "forced_runtime_id": "opencode"}))

    def test_runtime_health_and_backend_health_are_independent(self):
        registry = copy.deepcopy(self.engine.registry)
        next(item for item in registry["runtimes"] if item["runtime_id"] == "codex_cli")["health"] = "unavailable"
        runtime_failover = RoutingEngine(self.engine.policy, registry).decide(request())
        self.assertEqual("opencode", runtime_failover["runtime"]["runtime_id"])
        self.assertEqual("openai_api", runtime_failover["effective_intelligence"]["backend_id"])
        registry = copy.deepcopy(self.engine.registry)
        next(item for item in registry["intelligence_backends"] if item["backend_id"] == "openai_api")["health"] = "unavailable"
        with self.assertRaisesRegex(RoutingError, "backend"):
            RoutingEngine(self.engine.policy, registry).decide(request())

    def test_same_runtime_different_provider_produces_distinct_decision(self):
        runtime_spec = {**request()["runtime"], "forced_runtime_id": "opencode"}
        intelligence_spec = {**request()["intelligence"], "forced_backend_id": "openai_api"}
        openai = self.engine.decide(request(routing_mode="forced", runtime=runtime_spec, intelligence=intelligence_spec))
        intelligence_spec["forced_backend_id"] = "anthropic_api"
        anthropic = self.engine.decide(request(routing_request_id="rr-2", routing_mode="forced", runtime=runtime_spec, intelligence=intelligence_spec))
        self.assertEqual("opencode", openai["runtime"]["runtime_id"])
        self.assertEqual("opencode", anthropic["runtime"]["runtime_id"])
        self.assertNotEqual(openai["effective_intelligence"]["provider"], anthropic["effective_intelligence"]["provider"])
        self.assertNotEqual(openai["fingerprint"], anthropic["fingerprint"])
        self.assertNotEqual(openai["routing_decision_id"], anthropic["routing_decision_id"])

    def test_same_runtime_provider_different_model_is_auditable(self):
        registry = copy.deepcopy(self.engine.registry)
        alternate = copy.deepcopy(next(item for item in registry["intelligence_backends"] if item["backend_id"] == "openai_api"))
        alternate.update({"backend_id": "openai_api_alt", "model": "gpt-4-alt", "accounting_ref": "accounting://backend/openai_api_alt"})
        registry["intelligence_backends"].append(alternate)
        next(item for item in registry["runtimes"] if item["runtime_id"] == "opencode")["supported_backend_ids"].append("openai_api_alt")
        runtime_spec = {**request()["runtime"], "forced_runtime_id": "opencode"}
        first_i = {**request()["intelligence"], "forced_backend_id": "openai_api"}
        second_i = {**request()["intelligence"], "forced_backend_id": "openai_api_alt", "forced_model": "gpt-4-alt"}
        engine = RoutingEngine(self.engine.policy, registry)
        first = engine.decide(request(routing_mode="forced", runtime=runtime_spec, intelligence=first_i))
        second = engine.decide(request(routing_request_id="rr-2", routing_mode="forced", runtime=runtime_spec, intelligence=second_i))
        self.assertEqual(first["effective_intelligence"]["provider"], second["effective_intelligence"]["provider"])
        self.assertNotEqual(first["effective_intelligence"]["model"], second["effective_intelligence"]["model"])
        self.assertNotEqual(first["fingerprint"], second["fingerprint"])

    def test_recovery_changes_pair_and_preserves_logical_identity(self):
        initial = self.engine.decide(request(stage="dev"))
        recovery = self.engine.decide(request(stage="dev", routing_mode="recovery"))
        self.assertEqual(initial["logical_inference_id"], recovery["logical_inference_id"])
        self.assertNotEqual(initial["runtime"], recovery["runtime"])
        self.assertNotEqual(initial["effective_intelligence"], recovery["effective_intelligence"])

    def test_forced_pair_is_explicit(self):
        runtime = {**request()["runtime"], "forced_runtime_id": "opencode"}
        intelligence = {**request()["intelligence"], "forced_backend_id": "anthropic_api"}
        decision = self.engine.decide(request(routing_mode="forced", runtime=runtime, intelligence=intelligence))
        self.assertEqual("opencode", decision["runtime"]["runtime_id"])
        self.assertEqual("anthropic_api", decision["effective_intelligence"]["backend_id"])
        self.assertIn("FORCED_MATCH", decision["runtime_candidates"][0]["reason_codes"])

    def test_sticky_pair_requires_prior_decision(self):
        runtime = {**request()["runtime"], "previous_runtime_id": "opencode"}
        intelligence = {**request()["intelligence"], "previous_backend_id": "gemini_api"}
        decision = self.engine.decide(request(routing_mode="sticky", runtime=runtime, intelligence=intelligence, sticky_decision_id="rd-prior"))
        self.assertEqual("opencode", decision["runtime"]["runtime_id"])
        self.assertEqual("gemini_api", decision["effective_intelligence"]["backend_id"])

    def test_failover_and_escalation_remain_auditable_modes(self):
        failover = self.engine.decide(request(routing_mode="failover"))
        escalation = self.engine.decide(request(routing_request_id="rr-2", routing_mode="escalation"))
        self.assertIn("FAILOVER", failover["runtime_candidates"][0]["reason_codes"])
        self.assertIn("ESCALATION", escalation["runtime_candidates"][0]["reason_codes"])
        self.assertNotEqual(failover["routing_decision_id"], escalation["routing_decision_id"])

    def test_same_input_is_idempotent(self):
        self.assertEqual(self.engine.decide(request()), self.engine.decide(request()))

    def test_v1_request_is_rejected(self):
        old = request(schema_version="cognituum.routing/v1")
        with self.assertRaisesRegex(RoutingError, "supersedido"):
            self.engine.decide(old)


# ------------------------------------------------------------------ privacy local (supply)

import json as _json  # noqa: E402

import pytest  # noqa: E402
from jsonschema import Draft202012Validator  # noqa: E402


def _local_fixtures():
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import test_local_supply_mandate_gen as local
    return local


def test_request_schema_accepts_local_and_cloud_only():
    schema = _json.loads((ROOT / "contracts/v2/intelligence-supply-request.schema.json").read_text())
    local = _local_fixtures()
    for privacy, valid in (("local", True), ("approved_cloud", True), ("any", False), ("cloud", False), (None, False)):
        value = local.gen_request()
        value["routing"]["privacy"] = privacy
        assert (next(Draft202012Validator(schema).iter_errors(value), None) is None) is valid, privacy


def test_local_request_never_routes_to_cloud():
    from test_intelligence_service import gen_request as cloud_gen_request
    local = _local_fixtures()
    cloud_engine = RoutingEngine.from_files(ROOT / "policies/mandate-gen-v1.json", ROOT / "registry/genesis-pilot-v2.json")
    request = cloud_gen_request()
    request["routing"]["privacy"] = "local"
    with pytest.raises(RoutingError):
        cloud_engine.supply_routes(request)        # anthropic disponible, pero el pedido es local
    engine = RoutingEngine(local.local_policy(), local.local_registry())
    routes = engine.supply_routes(local.gen_request())
    assert [r["effective_intelligence"]["provider"] for r in routes] == ["ollama"]
    assert routes[0]["effective_intelligence"]["credential_ref"] is None


def test_cloud_request_never_selects_ollama():
    local = _local_fixtures()
    request = local.gen_request()
    request["routing"]["privacy"] = "approved_cloud"
    with pytest.raises(RoutingError):
        RoutingEngine(local.local_policy(), local.local_registry()).supply_routes(request)


@pytest.mark.parametrize("policy_changes, backend_changes", [
    ({"fallback": ["anthropic_api"]}, {}),
    ({"max_attempts": 2}, {}),
    ({"budget": {"per_mandate": True, "max_usd": "0.5", "max_total_tokens": 1000, "max_inferences": 1}}, {}),
    ({"budget": {"per_mandate": True, "max_usd": None, "max_total_tokens": 1000, "max_inferences": 2}}, {}),
    ({"local": {"format": "json", "tools": []}}, {}),
    ({}, {"privacy": "approved_cloud"}),
    ({}, {"credential_ref": "credential-ref://anthropic/default"}),
    ({}, {"model_digest": "sha256:" + "a" * 64}),
    ({}, {"model_digest": None}),
])
def test_local_policy_with_fallback_is_rejected(tmp_path, policy_changes, backend_changes):
    local = _local_fixtures()
    policy_path, registry_path = local.write_files(tmp_path, policy=local.local_policy(**policy_changes),
                                                   registry=local.local_registry(**backend_changes))
    with pytest.raises(RoutingError):
        RoutingEngine.from_files(policy_path, registry_path)


def test_from_files_records_raw_byte_hashes(tmp_path):
    import hashlib
    local = _local_fixtures()
    policy_path, registry_path = local.write_files(tmp_path)
    engine = RoutingEngine.from_files(policy_path, registry_path)
    assert engine.policy_sha256 == hashlib.sha256(policy_path.read_bytes()).hexdigest()
    assert engine.registry_sha256 == hashlib.sha256(registry_path.read_bytes()).hexdigest()
    cloud = RoutingEngine.from_files(ROOT / "policies/mandate-gen-v1.json", ROOT / "registry/genesis-pilot-v2.json")
    assert not cloud.is_local_supply() and len(cloud.policy_sha256) == 64

if __name__ == "__main__":
    unittest.main()
