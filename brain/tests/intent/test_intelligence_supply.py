import json
from types import SimpleNamespace

import pytest

from brain.core.intelligence_supply import IntelligenceSupplyClient, SupplyError, make_request, text_digest


def test_local_gen_request_preserves_privacy_and_identity():
    state = {"intent_id": "action-test", "intent_type": "gen", "mandate_id": "mandate-test"}
    local = make_request(state, "generation", "1", {"contractDigest": "signed"},
                         "mandate-gen-local/v1", privacy="local")
    assert local["routing"]["privacy"] == "local"
    assert local["routing"]["required_capabilities"] == ["text.generate", "structured_output"]
    assert local["logical_inference_id"].startswith("sha256:")
    with pytest.raises(SupplyError):
        make_request(state, "generation", "1", {}, "mandate-gen-local/v1", privacy="any")


def test_response_correlation_and_immutable_raw_checkpoint(tmp_path):
    request = make_request({"intent_id": "i", "intent_type": "ing", "mandate_id": "m"}, "classification", 1, {}, "v")
    response = {"schema_version": "cognituum.intelligence-supply-result/v1", "request_id": request["request_id"],
        "logical_inference_id": request["logical_inference_id"], "outcome": "completed", "routing_decision_id": "rd1",
        "routing_decision": {"routing_decision_id": "rd1", "logical_inference_id": request["logical_inference_id"],
                             "policy_version":"v", "effective_intelligence":{"provider":"anthropic","model":"m"}},
        "provider":"anthropic", "model":"m", "latency_ms":1,
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
                             "policy_version": "mandate-gen/v1", "effective_intelligence": {"provider": "anthropic", "model": "selected-model"}},
        "provider": "anthropic", "model": "selected-model", "latency_ms": 1,
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
