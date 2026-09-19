import hashlib
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from brain.core.intelligence_supply import IntelligenceSupplyClient, SupplyError, digest, persist, read_json
from brain.core.intent.genesis_intelligence import GenesisIntelligence
from brain.core.intent_state_manager import IntentStateManager
from aitap.accounting.store import AccountingStore
from aitap.intelligence.service import IntelligenceService
from aitap.providers.base import ProviderResult
from aitap.routing.engine import RoutingEngine


def cluster(name="c1", path="input.txt"):
    return {"cluster_id": name, "files": [path],
            "domain": {"status": "new", "domain_id": None, "name": "Knowledge", "score": None},
            "gene": {"status": "new", "gene_id": None, "score": None}, "evidence": {"source": path}}


class ControlledProvider:
    def __init__(self):
        self.calls = 0
        self.response = None

    def generate(self, **kwargs):
        self.calls += 1
        context = kwargs["payload"]["context"]
        response = self.response or ({"clusters": [cluster()]} if "inventory" in context else {"operations": []})
        raw = response if isinstance(response, str) else json.dumps(response)
        return ProviderResult(raw, 15, 20, kwargs["model"], "controlled")


def setup_lifecycle(tmp_path):
    root = tmp_path / "ing"
    manager = IntentStateManager.create(root, "ing", "MND-CONTROLLED")
    persist(root / ".reception/.rawbase.json", {"files": [{"path": "input.txt", "hash": hashlib.md5(b"input").hexdigest()}]})
    persist(root / ".reception/.rawbase_index.json", {"index": [{"path": "input.txt", "extracted_text": "input"}]})
    manager.close_phaseless_act()
    index = tmp_path / "nucleus/.cache/.semantic-index.json"
    persist(index, {"domains": {}})
    aitap_root = Path(__file__).resolve().parents[3] / "installer/aitap"
    engine = RoutingEngine.from_files(aitap_root / "policies/genesis-runtime-intelligence-v2.json",
                                      aitap_root / "registry/genesis-pilot-v2.json")
    provider = ControlledProvider()
    service = IntelligenceService(engine, AccountingStore(tmp_path / "accounting"),
                                  SimpleNamespace(resolve=lambda _: "test-only"), provider)
    def runner(command, **kwargs):
        response = service.supply(read_json(command[-1]))
        return SimpleNamespace(returncode=0, stdout=json.dumps(response), stderr="")
    client = IntelligenceSupplyClient(runner=runner)
    return GenesisIntelligence(root, index, client), provider, service


def approve():
    return [{"cluster_id": "c1", "human_decision": "approved"}]


def test_ing_waits_for_human_then_done_and_replays(tmp_path):
    lifecycle, provider, _ = setup_lifecycle(tmp_path)
    waiting = lifecycle.run()
    assert waiting["status"] == "awaiting_human_decision"
    assert read_json(lifecycle.index) == {"domains": {}}
    result = lifecycle.run(decisions=approve())
    assert result["status"] == "done"
    assert result["accepted_contributions"][0]["materialization_status"] == "pending"
    ledger = read_json(lifecycle.root / ".consolidation/.turn_1/.effect_ledger.json")
    assert all(e["obligation"] != "gene_lineage_materialized" for e in ledger["effects"])
    restarted = GenesisIntelligence(lifecycle.root, lifecycle.index, lifecycle.client)
    assert restarted.run() == result
    assert restarted.run(decisions=approve()) == result
    assert provider.calls == 1
    assert len(list((lifecycle.root / ".classification").glob(".turn_*"))) == 1
    assert not list(tmp_path.rglob("gen.json"))


def test_rejected_cluster_has_no_effect(tmp_path):
    lifecycle, provider, _ = setup_lifecycle(tmp_path)
    lifecycle.run()
    result = lifecycle.run(decisions=[{"cluster_id": "c1", "human_decision": "rejected"}])
    assert result["accepted_contributions"] == []
    assert result["rejected_clusters"] == ["c1"]
    assert read_json(lifecycle.index) == {"domains": {}}


def test_invalid_response_remains_durable_without_advancing(tmp_path):
    lifecycle, provider, _ = setup_lifecycle(tmp_path)
    provider.response = "not JSON"
    with pytest.raises(SupplyError, match="SEMANTIC_PARSE_FAILED"):
        lifecycle.run()
    assert (lifecycle.root / ".classification/.turn_1/.raw_response.txt").read_text() == "not JSON"
    assert IntentStateManager.load(lifecycle.root).phase_active == "classification"
    with pytest.raises(SupplyError):
        lifecycle.run()
    assert provider.calls == 1


@pytest.mark.parametrize("checkpoint", ["before_commit", "before_advance", "after_advance"])
def test_restart_at_effect_commit_and_advance_boundaries(tmp_path, monkeypatch, checkpoint):
    lifecycle, provider, _ = setup_lifecycle(tmp_path)
    lifecycle.run()
    from brain.core.intent.effect_ledger import EffectLedgerManager
    if checkpoint == "before_commit":
        target, name = IntentStateManager, "persist_turn_control"
        original = target.persist_turn_control
        def crash(self, **kwargs):
            if kwargs["control_payload"].get("committed"):
                raise KeyboardInterrupt()
            return original(self, **kwargs)
    elif checkpoint == "before_advance":
        target, name = IntentStateManager, "advance_after_committed_turn"
        original = target.advance_after_committed_turn
        def crash(self, **kwargs):
            raise KeyboardInterrupt()
    else:
        target, name = EffectLedgerManager, "mark_state_advanced"
        original = target.mark_state_advanced
        def crash(self):
            raise KeyboardInterrupt()
    monkeypatch.setattr(target, name, crash)
    with pytest.raises(KeyboardInterrupt):
        lifecycle.run(decisions=approve())
    monkeypatch.setattr(target, name, original)
    result = GenesisIntelligence(lifecycle.root, lifecycle.index, lifecycle.client).run()
    assert result["status"] == "done" and provider.calls == 1
    assert sum(len(d["genes"]) for d in read_json(lifecycle.index)["domains"].values()) == 1


def test_partial_consolidation_is_durable(tmp_path):
    lifecycle, provider, _ = setup_lifecycle(tmp_path)
    raw_path = lifecycle.root / ".reception/.rawbase.json"
    index_path = lifecycle.root / ".reception/.rawbase_index.json"
    raw = read_json(raw_path)
    raw["files"].append({"path":"second.txt", "hash":hashlib.md5(b"second").hexdigest()})
    raw_path.write_text(json.dumps(raw))
    index = read_json(index_path)
    index["index"].append({"path":"second.txt", "extracted_text":"second"})
    index_path.write_text(json.dumps(index))
    provider.response = {"clusters": [cluster(), cluster("c2", "second.txt")]}
    lifecycle.run()
    assert lifecycle.run(decisions=approve())["pending_clusters"] == ["c2"]
    assert read_json(lifecycle.index) == {"domains":{}}
    result = lifecycle.run(decisions=[{"cluster_id":"c2", "human_decision":"rejected"}])
    assert result["status"] == "done" and len(result["accepted_contributions"]) == 1
    assert result["rejected_clusters"] == ["c2"]


def test_stale_dis_snapshot_is_rejected_before_another_inference(tmp_path):
    lifecycle, provider, _ = setup_lifecycle(tmp_path)
    lifecycle.run()
    lifecycle.run(decisions=approve())
    dis_root = tmp_path / "dis"
    IntentStateManager.create(dis_root, "dis", "MND-CONTROLLED")
    dis = GenesisIntelligence(dis_root, lifecycle.index, lifecycle.client)
    dis.run(ing_result=lifecycle.root / "ing_result.json")
    snapshot = read_json(lifecycle.index)
    next(iter(snapshot["domains"].values()))["name"] = "changed externally"
    lifecycle.index.write_text(json.dumps(snapshot))
    with pytest.raises(SupplyError, match="STALE_GRAPH_SNAPSHOT"):
        dis.run(ing_result=lifecycle.root / "ing_result.json")
    assert provider.calls == 2


def test_tampered_effect_evidence_blocks_done(tmp_path):
    lifecycle, _, _ = setup_lifecycle(tmp_path)
    lifecycle.run()
    lifecycle.run(decisions=approve())
    index = read_json(lifecycle.index)
    index["domains"] = {}
    lifecycle.index.write_text(json.dumps(index))
    with pytest.raises(Exception, match="evidence verification failed"):
        lifecycle.run()
