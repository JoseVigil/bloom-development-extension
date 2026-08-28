import pytest

from brain.core.intent.effect_ledger import EffectLedgerManager, PendingEffectsError


def _ledger(tmp_path, intent_type="ing"):
    turn_dir = tmp_path / ".turn_1"
    turn_dir.mkdir()
    return EffectLedgerManager.create(
        turn_dir=turn_dir,
        intent_id="intent-1",
        intent_type=intent_type,
        stage="consolidation" if intent_type == "ing" else "ratification",
        turn_id="1",
        control_ref=".consolidation.json",
        effect_payload=[{"human_decision": "approved", "change_id": "c1"}],
    )


def test_ledger_has_exact_obligations_and_is_idempotent(tmp_path):
    ledger = _ledger(tmp_path)
    document = ledger.load()

    assert [effect["obligation"] for effect in document["effects"]] == [
        "gene_lineage_materialized",
        "domain_gene_edge_materialized",
        "domain_gene_edge_deduplicated",
        "knowledge_baseline_materialized",
    ]
    assert document["identity"] == {
        "intent_id": "intent-1",
        "intent_type": "ing",
        "stage": "consolidation",
        "turn_id": "1",
    }
    assert EffectLedgerManager.create(
        turn_dir=ledger.turn_dir,
        intent_id="intent-1",
        intent_type="ing",
        stage="consolidation",
        turn_id="1",
        control_ref=".consolidation.json",
        effect_payload=document["effects_payload"],
    ).path == ledger.path


def test_ledger_requires_verified_effects_before_state_checkpoint(tmp_path):
    ledger = _ledger(tmp_path, intent_type="dis")
    with pytest.raises(PendingEffectsError):
        ledger.assert_all_applied()

    for effect in ledger.load()["effects"]:
        ledger.mark_effect_applied(effect["effect_id"], {"verified_path": effect["obligation"]})

    ready = ledger.assert_all_applied()
    assert ready["state"] == "applied"
    completed = ledger.mark_state_advanced()
    assert completed["state_advanced"] is True
    assert completed["state"] == "state_advanced"


def test_reapplying_same_evidence_is_safe(tmp_path):
    ledger = _ledger(tmp_path)
    effect_id = ledger.load()["effects"][0]["effect_id"]
    evidence = {"sha256": "a" * 64}

    first = ledger.mark_effect_applied(effect_id, evidence)
    second = EffectLedgerManager(ledger.turn_dir).mark_effect_applied(effect_id, evidence)

    assert first["effects"][0]["verification"] == second["effects"][0]["verification"]

