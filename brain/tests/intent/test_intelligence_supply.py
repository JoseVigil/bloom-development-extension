import json
from types import SimpleNamespace

import pytest

from brain.core.intelligence_supply import IntelligenceSupplyClient, SupplyError, make_request, text_digest


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
