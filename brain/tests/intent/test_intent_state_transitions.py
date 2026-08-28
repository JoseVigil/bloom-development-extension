import json

import pytest

from brain.core.intent_state_manager import IntentStateManager, InvalidTransitionError


def _commit_turn(tmp_path):
    manager = IntentStateManager.create(
        intent_root=tmp_path / ".sample-intent",
        intent_type="ing",
        mandate_id="MND-TEST",
    )
    manager.close_phaseless_act()
    proposal = manager.open_turn("classification")
    manager.close_turn(proposal, {"turn": "1", "proposal": []})
    manager.advance_after_proposal()
    return IntentStateManager.load(manager.intent_root).open_turn("consolidation"), manager.intent_root


def test_committed_control_does_not_advance_implicitly(tmp_path):
    turn, intent_root = _commit_turn(tmp_path)
    manager = IntentStateManager.load(intent_root)

    persisted_committed = manager.close_turn(turn, {"turn": "1", "committed": True})

    assert persisted_committed is True
    assert manager.phase_active == "consolidation"
    assert IntentStateManager.load(intent_root).phase_active == "consolidation"


def test_advance_recovers_from_persisted_identity_without_turn_handle(tmp_path):
    turn, intent_root = _commit_turn(tmp_path)
    first_process = IntentStateManager.load(intent_root)
    first_process.persist_turn_control(
        phase_name="consolidation",
        turn_number=turn.turn_number,
        control_payload={"turn": "1", "commit_requested": True, "committed": True},
    )

    recovered_process = IntentStateManager.load(intent_root)
    recovered_process.advance_after_committed_turn(
        phase_name="consolidation",
        turn_number=turn.turn_number,
    )

    assert IntentStateManager.load(intent_root).phase_active == "done"


def test_advance_rejects_uncommitted_control(tmp_path):
    turn, intent_root = _commit_turn(tmp_path)
    manager = IntentStateManager.load(intent_root)
    manager.persist_turn_control(
        phase_name="consolidation",
        turn_number=turn.turn_number,
        control_payload={"turn": "1", "commit_requested": True, "committed": False},
    )

    with pytest.raises(InvalidTransitionError, match="committed: true"):
        IntentStateManager.load(intent_root).advance_after_committed_turn(
            phase_name="consolidation",
            turn_number=turn.turn_number,
        )

    control = json.loads(turn.control_file.read_text(encoding="utf-8"))
    assert control["commit_requested"] is True

