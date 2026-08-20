import json
import unittest
from pathlib import Path

from aitap.routing import RoutingEngine, RoutingError


ROOT = Path(__file__).resolve().parents[1]


def request(**changes):
    value = {
        "schema_version": "cognituum.routing/v1",
        "routing_request_id": "rr-1",
        "logical_inference_id": "li-1",
        "intent_id": "intent-1",
        "stage": "ing",
        "turn_id": "turn-1",
        "target_class": "execution_provider",
        "required_capabilities": ["filesystem.patch"],
        "routing_mode": "policy",
        "policy_version": "genesis-cross-cli-proof/v1",
    }
    value.update(changes)
    return value


class RoutingEngineTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = RoutingEngine.from_files(
            ROOT / "policies" / "genesis-cross-cli-proof-v1.json",
            ROOT / "registry" / "genesis-pilot-v1.json",
        )

    def test_genesis_stage_policy(self):
        expected = {
            "ing": "codex_cli",
            "dis": "claude_code_cli",
            "doc": "synapse_simulator",
            "dev": "codex_cli",
        }
        for stage, target in expected.items():
            with self.subTest(stage=stage):
                decision = self.engine.decide(request(stage=stage))
                self.assertEqual(target, decision["selected_target"]["target_id"])

    def test_dev_recovery_changes_decision_but_preserves_logical_identity(self):
        initial = self.engine.decide(request(stage="dev", routing_mode="policy"))
        recovery = self.engine.decide(request(stage="dev", routing_mode="recovery"))
        self.assertEqual("codex_cli", initial["selected_target"]["target_id"])
        self.assertEqual("claude_code_cli", recovery["selected_target"]["target_id"])
        self.assertEqual(initial["logical_inference_id"], recovery["logical_inference_id"])
        self.assertNotEqual(initial["routing_decision_id"], recovery["routing_decision_id"])

    def test_same_input_is_idempotent(self):
        first = self.engine.decide(request())
        second = self.engine.decide(request())
        self.assertEqual(first, second)

    def test_forced_routing(self):
        decision = self.engine.decide(
            request(routing_mode="forced", forced_target_id="claude_code_cli")
        )
        self.assertEqual("claude_code_cli", decision["selected_target"]["target_id"])
        self.assertIn("FORCED_MATCH", decision["candidates"][0]["reason_codes"])

    def test_sticky_routing(self):
        decision = self.engine.decide(
            request(
                routing_mode="sticky",
                previous_target_id="codex_cli",
                sticky_decision_id="rd-prior",
            )
        )
        self.assertEqual("codex_cli", decision["selected_target"]["target_id"])

    def test_authorized_override_is_audited(self):
        override = {
            "override_id": "ov-1",
            "target_id": "claude_code_cli",
            "authorized_by": "identity://operator",
            "reason": "controlled experiment",
        }
        decision = self.engine.decide(request(override=override))
        self.assertEqual(override, decision["override"])
        self.assertEqual("claude_code_cli", decision["selected_target"]["target_id"])

    def test_unavailable_or_missing_capability_is_rejected(self):
        with self.assertRaises(RoutingError):
            self.engine.decide(request(required_capabilities=["browser.dom"] ))

    def test_synapse_recovery_variant_changes_only_policy(self):
        variant = json.loads(json.dumps(self.engine.policy))
        variant["stages"]["dev"]["recovery_target"] = "synapse_simulator"
        engine = RoutingEngine(variant, self.engine.registry)
        decision = engine.decide(request(stage="dev", routing_mode="recovery"))
        self.assertEqual("synapse_simulator", decision["selected_target"]["target_id"])

    def test_opencode_is_single_first_party_runtime(self):
        runtime = self.engine.decide(
            request(
                routing_request_id="rr-2",
                routing_mode="forced",
                forced_target_id="opencode",
                target_class="first_party_runtime",
            )
        )
        self.assertEqual("opencode", runtime["selected_target"]["target_id"])
        self.assertEqual("first_party_runtime", runtime["selected_target"]["target_class"])

    def test_opencode_role_cannot_cross_target_class(self):
        with self.assertRaises(RoutingError):
            self.engine.decide(
                request(
                    routing_mode="forced",
                    forced_target_id="opencode",
                    target_class="intelligence_provider",
                    required_capabilities=["text.generate"],
                )
            )


if __name__ == "__main__":
    unittest.main()
