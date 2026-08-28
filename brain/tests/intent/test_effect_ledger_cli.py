import json
import tempfile
import unittest
from pathlib import Path

import typer
from typer.testing import CliRunner

from brain.commands.intent.advance_turn import AdvanceTurnCommand
from brain.commands.intent.commit_turn import CommitTurnCommand
from brain.commands.intent.mark_effect_applied import MarkEffectAppliedCommand
from brain.core.intent.effect_ledger import EffectLedgerManager
from brain.core.intent_manager import IntentManager
from brain.shared.context import GlobalContext


def _build_app() -> typer.Typer:
    app = typer.Typer()

    @app.callback()
    def root(
        ctx: typer.Context,
        json_output: bool = typer.Option(False, "--json", help="Enable JSON output"),
        verbose: bool = typer.Option(False, "--verbose", help="Enable verbose output"),
    ) -> None:
        ctx.obj = GlobalContext(json_mode=json_output, verbose=verbose)

    intent_app = typer.Typer()
    MarkEffectAppliedCommand().register(intent_app)
    CommitTurnCommand().register(intent_app)
    AdvanceTurnCommand().register(intent_app)
    app.add_typer(intent_app, name="intent")
    return app


class EffectLedgerCliTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        (self.root / ".bloom").mkdir()
        self.runner = CliRunner()
        self.app = _build_app()
        core = IntentManager()
        created = core.create_intent(
            "ing", "CLI retry contract", nucleus_path=self.root,
            mandate_id="MND-CLI", domain_baseline="empty",
        )
        self.intent_id = created["intent_id"]
        core.hydrate_intent(intent_id=self.intent_id, nucleus_path=self.root)
        core.add_turn(
            intent_id=self.intent_id, nucleus_path=self.root, content="proposal",
            proposal=[], close_phase=True,
        )
        requested = core.add_turn(
            intent_id=self.intent_id, nucleus_path=self.root, content="commit",
            proposal=[{"human_decision": "approved"}], close_phase=True,
        )
        self.turn_id = str(requested["turn_number"])
        self.ledger = EffectLedgerManager(Path(requested["turn_path"]))

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _invoke(self, command: str, *extra: str):
        args = [
            "--json", "intent", command,
            "--nucleus-path", str(self.root),
            "--intent-id", self.intent_id,
            "--stage", "consolidation",
            "--turn-id", self.turn_id,
            *extra,
        ]
        result = self.runner.invoke(self.app, args)
        payload = json.loads(result.stdout)
        return result, payload

    def _mark_all(self) -> None:
        for effect in self.ledger.load()["effects"]:
            result, payload = self._invoke(
                "mark-effect-applied",
                "--effect-id", effect["effect_id"],
                "--evidence-json", json.dumps({"verified": effect["obligation"]}),
            )
            self.assertEqual(result.exit_code, 0, result.stdout)
            self.assertEqual(payload["operation"], "intent_mark_effect_applied")
            self.assertEqual(payload["data"]["stage"], "consolidation")
            self.assertEqual(payload["data"]["turn_id"], self.turn_id)

    def test_commit_retry_after_advance_is_idempotent(self) -> None:
        self._mark_all()
        committed, commit_payload = self._invoke("commit-turn")
        self.assertEqual(committed.exit_code, 0, committed.stdout)
        self.assertFalse(commit_payload["data"]["already_committed"])

        advanced, advance_payload = self._invoke("advance-turn")
        self.assertEqual(advanced.exit_code, 0, advanced.stdout)
        self.assertFalse(advance_payload["data"]["already_advanced"])
        self.assertEqual(advance_payload["data"]["phase_active"], "done")

        retried, retry_payload = self._invoke("commit-turn")
        self.assertEqual(retried.exit_code, 0, retried.stdout)
        self.assertTrue(retry_payload["data"]["already_committed"])
        self.assertEqual(retry_payload["data"]["phase_active"], "done")

        advance_retry, advance_retry_payload = self._invoke("advance-turn")
        self.assertEqual(advance_retry.exit_code, 0, advance_retry.stdout)
        self.assertTrue(advance_retry_payload["data"]["already_advanced"])

    def test_commit_with_pending_effects_returns_exit_5_json(self) -> None:
        result, payload = self._invoke("commit-turn")
        self.assertEqual(result.exit_code, 5)
        self.assertEqual(payload["status"], "error")
        self.assertEqual(payload["operation"], "intent_commit_turn")
        self.assertEqual(payload["error"]["code"], "EFFECTS_PENDING")
        self.assertTrue(payload["error"]["retryable"])
        self.assertEqual(payload["exit_code"], 5)

    def test_mark_effect_with_different_evidence_returns_exit_4_json(self) -> None:
        effect_id = self.ledger.load()["effects"][0]["effect_id"]
        first, first_payload = self._invoke(
            "mark-effect-applied",
            "--effect-id", effect_id,
            "--evidence-json", json.dumps({"verified": "first"}),
        )
        self.assertEqual(first.exit_code, 0, first.stdout)
        self.assertEqual(first_payload["data"]["effect_status"], "applied")

        conflict, conflict_payload = self._invoke(
            "mark-effect-applied",
            "--effect-id", effect_id,
            "--evidence-json", json.dumps({"verified": "different"}),
        )
        self.assertEqual(conflict.exit_code, 4, conflict.stdout)
        self.assertEqual(conflict_payload["status"], "error")
        self.assertEqual(
            conflict_payload["operation"], "intent_mark_effect_applied"
        )
        self.assertEqual(conflict_payload["error"]["code"], "EVIDENCE_CONFLICT")
        self.assertFalse(conflict_payload["error"]["retryable"])
        self.assertEqual(conflict_payload["exit_code"], 4)

    def test_contract_value_error_is_structured_exit_2(self) -> None:
        self.turn_id = "not-an-integer"
        result, payload = self._invoke("commit-turn")
        self.assertEqual(result.exit_code, 2)
        self.assertEqual(payload["error"]["code"], "INVALID_ARGUMENT")
        self.assertEqual(payload["exit_code"], 2)


if __name__ == "__main__":
    unittest.main()
