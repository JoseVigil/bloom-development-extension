import json
import os
from types import SimpleNamespace

import pytest

from brain.core.intelligence_supply import IntelligenceSupplyClient, SupplyError, make_request, text_digest
from brain.core.intent.genesis_intelligence import GenesisIntelligence, graph_genes


def test_supply_error_envelope_matches_brain_cli_protocol():
    envelope = SupplyError("PROVIDER_UNAVAILABLE", "aitap").envelope()
    assert envelope["status"] == "error"
    assert envelope["exit_code"] == 1
    assert envelope["error"] == {
        "code": "PROVIDER_UNAVAILABLE", "stage": "aitap",
        "message": "PROVIDER_UNAVAILABLE", "retryable": True, "details": {}}


def test_local_gen_request_preserves_privacy_and_identity():
    state = {"intent_id": "action-test", "intent_type": "gen", "mandate_id": "mandate-test"}
    local = make_request(state, "generation", "1", {"contractDigest": "signed"},
                         "mandate-gen-local/v1", privacy="local")
    assert local["routing"]["privacy"] == "local"
    assert local["routing"]["required_capabilities"] == ["text.generate", "structured_output"]
    assert local["logical_inference_id"].startswith("sha256:")
    with pytest.raises(SupplyError):
        make_request(state, "generation", "1", {}, "mandate-gen-local/v1", privacy="any")


def test_w4_destination_is_in_request_and_cannot_change_on_replay(tmp_path):
    state = {"intent_id": "i", "intent_type": "ing", "mandate_id": "m"}
    destination = {"backend_id": "b", "provider": "p", "model": "x"}
    request = make_request(state, "classification", 1, {}, "v", destination=destination)
    assert request["routing"]["destination"] == destination
    directory = tmp_path / "turn"
    directory.mkdir()
    (directory / ".request.json").write_text(json.dumps(request), encoding="utf-8")
    changed = make_request(state, "classification", 1, {}, "v",
                           destination={**destination, "model": "y"})
    with pytest.raises(SupplyError, match="different intelligence selection"):
        IntelligenceSupplyClient().obtain(directory, changed)


def test_genesis_classification_defaults_to_mandate_gemini_policy(tmp_path):
    lifecycle = GenesisIntelligence(tmp_path / "intent", tmp_path / ".semantic-index.json")
    assert lifecycle.policy_version == "mandate-gen/v1"


@pytest.mark.parametrize("snapshot", [{"indexed_at": "now", "entries": []}, None])
def test_graph_genes_accepts_legacy_empty_snapshot(snapshot):
    assert graph_genes(snapshot) == set()


def test_graph_genes_initializes_missing_domains_in_place():
    snapshot = {"indexed_at": "now", "entries": []}
    assert graph_genes(snapshot) == set()
    assert snapshot["domains"] == {}


def test_supply_client_resolves_managed_aitap_from_appdata(monkeypatch, tmp_path):
    binary = "aitap.exe" if os.name == "nt" else "aitap"
    executable = tmp_path / "bin" / "aitap" / binary
    executable.parent.mkdir(parents=True)
    executable.touch()
    monkeypatch.setenv("BLOOM_APPDATA_DIR", str(tmp_path))
    monkeypatch.delenv("AITAP_BIN", raising=False)

    assert IntelligenceSupplyClient().command == [str(executable)]


def test_supply_client_passes_managed_state_dir_without_changing_trailing_routing_flags(monkeypatch, tmp_path):
    monkeypatch.setenv("BLOOM_APPDATA_DIR", str(tmp_path / "appdata"))
    monkeypatch.delenv("AITAP_STATE_DIR", raising=False)
    request = make_request({"intent_id": "i", "intent_type": "ing", "mandate_id": "m"},
                           "classification", 1, {}, "v")
    response = {"schema_version": "cognituum.intelligence-supply-result/v1", "request_id": request["request_id"],
        "logical_inference_id": request["logical_inference_id"], "outcome": "completed", "routing_decision_id": "rd1",
        "routing_decision": {"routing_decision_id": "rd1", "logical_inference_id": request["logical_inference_id"],
                             "policy_version": "v", "effective_intelligence": {"provider": "google", "model": "m"}},
        "provider": "google", "model": "m", "latency_ms": 1,
        "accounting_ref": "accounting://inference/" + request["logical_inference_id"][7:],
        "raw_response": "{}", "raw_response_digest": text_digest("{}"),
        "usage": {"input_tokens": 1, "output_tokens": 1}}
    calls = []
    client = IntelligenceSupplyClient(command=["aitap"], runner=lambda command, **kwargs: (
        calls.append(command) or SimpleNamespace(returncode=0, stdout=json.dumps(response))))
    client.obtain(tmp_path / "turn", request, policy="p.json", registry="r.json")
    assert calls[0][4:6] == ["--state-dir", str(tmp_path / "appdata" / "aitap")]
    assert calls[0][-4:] == ["--policy", "p.json", "--registry", "r.json"]


def test_classification_instruction_requires_exhaustive_inventory_partition(tmp_path):
    captured = {}
    class Client:
        def obtain(self, directory, request, **kwargs):
            captured.update(request["payload"])
            return {"raw_response": '{"clusters": []}'}
    lifecycle = GenesisIntelligence(tmp_path, tmp_path / ".semantic-index.json", Client())
    lifecycle._infer(SimpleNamespace(snapshot=lambda: {
        "intent_id": "i", "intent_type": "ing", "mandate_id": "m"}),
        "classification", tmp_path / "turn", "1", {"inventory": {"files": []}}, {})
    assert "every inventory path" in captured["instruction"]
    assert "exactly one clusters[].files" in captured["instruction"]


def test_vault_denial_preserves_only_allowlisted_stage(tmp_path):
    request = make_request({"intent_id": "i", "intent_type": "ing", "mandate_id": "m"},
                           "classification", 1, {}, "v")
    allowed = {"status": "error", "error": {"code": "VAULT_ACCESS_DENIED", "stage": "vault",
        "message": "VAULT_ACCESS_DENIED [stage=installation_binding]"}}
    client = IntelligenceSupplyClient(runner=lambda *a, **k: SimpleNamespace(returncode=1, stdout=json.dumps(allowed)))
    with pytest.raises(SupplyError) as error:
        client.obtain(tmp_path / "allowed", request)
    assert str(error.value) == "VAULT_ACCESS_DENIED [stage=installation_binding]"

    untrusted = {"status": "error", "error": {"code": "VAULT_ACCESS_DENIED", "stage": "vault",
        "message": "VAULT_ACCESS_DENIED [stage=unknown] sensitive material"}}
    client = IntelligenceSupplyClient(runner=lambda *a, **k: SimpleNamespace(returncode=1, stdout=json.dumps(untrusted)))
    with pytest.raises(SupplyError) as error:
        client.obtain(tmp_path / "untrusted", request)
    assert str(error.value) == "VAULT_ACCESS_DENIED"
    assert "sensitive" not in str(error.value)


def test_response_correlation_and_immutable_raw_checkpoint(tmp_path):
    request = make_request({"intent_id": "i", "intent_type": "ing", "mandate_id": "m"}, "classification", 1, {}, "v")
    response = {"schema_version": "cognituum.intelligence-supply-result/v1", "request_id": request["request_id"],
        "logical_inference_id": request["logical_inference_id"], "outcome": "completed", "routing_decision_id": "rd1",
        "routing_decision": {"routing_decision_id": "rd1", "logical_inference_id": request["logical_inference_id"],
                             "policy_version":"v", "effective_intelligence":{"provider":"google","model":"m"}},
        "provider":"google", "model":"m", "latency_ms":1,
        "accounting_ref":"accounting://inference/" + request["logical_inference_id"][7:],
        "raw_response": "{}", "raw_response_digest": text_digest("{}"), "usage": {"input_tokens": 1, "output_tokens": 1}}
    client = IntelligenceSupplyClient(runner=lambda *a, **k: SimpleNamespace(returncode=0, stdout=json.dumps(response)))
    client.obtain(tmp_path, request)
    (tmp_path / ".raw_response.txt").write_text("tampered")
    with pytest.raises(SupplyError, match="RAW_RESPONSE_MISMATCH"):
        client.obtain(tmp_path, request)


def test_gen_cli_policy_binding_and_completed_replay_do_not_repeat_supply(tmp_path):
    request = make_request({"intent_id": "action-1", "intent_type": "gen", "mandate_id": "mandate-1"},
                           "generation", "1", {"contractDigest": "signed-digest"}, "mandate-gen/v1")
    response = {"schema_version": "cognituum.intelligence-supply-result/v1", "request_id": request["request_id"],
        "logical_inference_id": request["logical_inference_id"], "outcome": "completed", "routing_decision_id": "rd-gen",
        "routing_decision": {"routing_decision_id": "rd-gen", "logical_inference_id": request["logical_inference_id"],
                             "policy_version": "mandate-gen/v1", "effective_intelligence": {"provider": "google", "model": "selected-model"}},
        "provider": "google", "model": "selected-model", "latency_ms": 1,
        "accounting_ref": "accounting://inference/" + request["logical_inference_id"][7:],
        "raw_response": "{}", "raw_response_digest": text_digest("{}"), "usage": {"input_tokens": 1, "output_tokens": 1}}
    calls = []
    def runner(command, **kwargs):
        calls.append(command)
        return SimpleNamespace(returncode=0, stdout=json.dumps(response))
    client = IntelligenceSupplyClient(runner=runner)
    first = client.obtain(tmp_path, request, policy="approved-policy.json", registry="available-registry.json")
    second = client.obtain(tmp_path, request, policy="approved-policy.json", registry="available-registry.json")
    assert first == second and len(calls) == 1
    assert calls[0][-4:] == ["--policy", "approved-policy.json", "--registry", "available-registry.json"]
