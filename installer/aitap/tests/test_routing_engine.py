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


if __name__ == "__main__":
    unittest.main()
