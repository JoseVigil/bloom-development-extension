import json
import shutil
import tempfile
from pathlib import Path

import pytest
import typer
from typer.testing import CliRunner

from brain.commands.intent.ratify_dis import RatifyDisCommand
from brain.core.intelligence_supply import digest
from brain.core.intent.effect_ledger import EffectLedgerManager
from brain.core.intent_manager import IntentManager
from brain.core.intent_state_manager import IntentStateManager, _atomic_write_json
from brain.shared.context import GlobalContext


def _app() -> typer.Typer:
    app = typer.Typer()

    @app.callback()
    def root(ctx: typer.Context, json_output: bool = typer.Option(False, "--json")):
        ctx.obj = GlobalContext(json_mode=json_output)

    intent = typer.Typer()
    RatifyDisCommand().register(intent)
    app.add_typer(intent, name="intent")
    return app


@pytest.fixture
def short_root():
    base = Path(__file__).resolve().parents[3] / ".test-tmp"
    base.mkdir(parents=True, exist_ok=True)
    path = Path(tempfile.mkdtemp(prefix="dis-", dir=base))
    try:
        yield path
    finally:
        shutil.rmtree(path, ignore_errors=True)


def _fixture(tmp_path: Path):
    (tmp_path / ".bloom" / ".cache").mkdir(parents=True)
    graph = {
        "updated_at": "2026-01-01T00:00:00Z",
        "domains": {
            "d1": {"name": "One", "genes": ["g1"], "origin_mandate_id": "m", "mandates": ["m"]},
            "d2": {"name": "Two", "genes": ["g2"], "origin_mandate_id": "m", "mandates": ["m"]},
        },
    }
    index = tmp_path / ".bloom" / ".cache" / ".semantic-index.json"
    _atomic_write_json(index, graph)
    manager = IntentManager()
    created = manager.create_intent("dis", "Ratification", nucleus_path=tmp_path, mandate_id="m")
    intent_root = Path(created["intent_path"])
    manager.hydrate_intent(intent_id=created["intent_id"], nucleus_path=tmp_path)
    state = IntentStateManager.load(intent_root)
    turn = state.open_turn("mapping")
    proposal = {"domain_id": "d2", "gene_id": "g1"}
    operation = {
        "operation_id": digest(["add_edge", proposal, digest(graph), created["intent_id"]]),
        "type": "add_edge",
        "proposal": proposal,
        "evidence": {"source": "fixture"},
        "human_decision": None,
        "override": None,
    }
    mapping = {
        "schema_version": "bloom.dis-mapping/v1",
        "intent_id": created["intent_id"],
        "mandate_id": "m",
        "turn_id": str(turn.turn_number),
        "ing_result_ref": "ing_result.json",
        "ing_result_digest": digest({}),
        "graph_snapshot_digest": digest(graph),
        "operations": [operation],
    }
    _atomic_write_json(turn.turn_dir / ".files" / ".mapping_proposal.json", mapping)
    _atomic_write_json(turn.turn_dir / ".request.json", {"supply_owned": True})
    state.persist_turn_control(
        phase_name="mapping",
        turn_number=turn.turn_number,
        control_payload={"turn": str(turn.turn_number), "actor": "ai", "proposal": [operation]},
    )
    decision = {
        "schema_version": "bloom.dis-ratification-decision/v1",
        "mapping_proposal_digest": digest(mapping),
        "operations": [{
            "operation_id": operation["operation_id"],
            "type": operation["type"],
            "proposal": operation["proposal"],
            "human_decision": "approved",
            "override": None,
        }],
    }
    decision_path = tmp_path / "decision.json"
    _atomic_write_json(decision_path, decision)
    return created["intent_id"], intent_root, index, decision_path


def _invoke(tmp_path: Path, intent_id: str, index: Path, decision: Path):
    return CliRunner().invoke(_app(), [
        "--json", "intent", "ratify-dis",
        "--nucleus-path", str(tmp_path),
        "--intent-id", intent_id,
        "--mapping-turn-id", "1",
        "--decision-json", str(decision),
        "--semantic-index", str(index),
    ])


def test_ratify_dis_materializes_verifies_commits_and_advances(short_root):
    intent_id, intent_root, index, decision = _fixture(short_root)
    result = _invoke(short_root, intent_id, index, decision)
    assert result.exit_code == 0, result.stdout
    payload = json.loads(result.stdout)
    data = payload["data"]
    assert payload["operation"] == "intent_ratify_dis"
    assert data["intent_id"] == intent_id
    assert data["phase_active"] == "done"
    assert data["committed"] is True
    assert data["state_advanced"] is True
    assert "g1" in json.loads(index.read_text())["domains"]["d2"]["genes"]

    turn = intent_root / ".ratification" / f".turn_{data['turn_id']}"
    control = json.loads((turn / ".ratification.json").read_text())
    ledger = EffectLedgerManager(turn).load()
    assert control["committed"] is True
    assert control["effects_digest"] == ledger["effects_digest"]
    assert ledger["state_advanced"] is True
    assert {effect["obligation"] for effect in ledger["effects"]} == {
        "domain_graph_operation_applied", "domain_graph_delta_materialized"
    }
    assert all(effect["status"] == "applied" and effect["verification"]["verified"] is True
               for effect in ledger["effects"])
    delta = json.loads((turn / ".files" / ".domain_graph_delta.json").read_text())
    assert delta["graph_after_digest"] == digest(json.loads(index.read_text()))


def test_identical_replay_converges_without_duplicate_effects(short_root):
    intent_id, intent_root, index, decision = _fixture(short_root)
    first = _invoke(short_root, intent_id, index, decision)
    second = _invoke(short_root, intent_id, index, decision)
    assert first.exit_code == second.exit_code == 0
    replay = json.loads(second.stdout)["data"]
    assert replay["already_applied"] is True
    assert replay["already_committed"] is True
    assert replay["already_advanced"] is True
    assert len(list((intent_root / ".ratification").glob(".turn_*/.effect_ledger.json"))) == 1


def test_different_decision_replay_fails_closed(short_root):
    intent_id, _, index, decision = _fixture(short_root)
    assert _invoke(short_root, intent_id, index, decision).exit_code == 0
    changed = json.loads(decision.read_text())
    changed["operations"][0]["human_decision"] = "rejected"
    _atomic_write_json(decision, changed)
    result = _invoke(short_root, intent_id, index, decision)
    payload = json.loads(result.stdout)
    assert result.exit_code == 4
    assert payload["error"]["code"] == "EVIDENCE_CONFLICT"


def test_divergent_graph_fails_closed_before_effect_marking(short_root):
    intent_id, intent_root, index, decision = _fixture(short_root)
    divergent = json.loads(index.read_text())
    divergent["domains"]["d1"]["name"] = "external-change"
    _atomic_write_json(index, divergent)
    result = _invoke(short_root, intent_id, index, decision)
    payload = json.loads(result.stdout)
    assert result.exit_code == 4
    assert payload["error"]["code"] == "PROPOSAL_CONFLICT"
    ledgers = list((intent_root / ".ratification").glob(".turn_*/.effect_ledger.json"))
    assert len(ledgers) == 1
    assert all(effect["status"] == "pending" for effect in EffectLedgerManager(ledgers[0].parent).load()["effects"])
