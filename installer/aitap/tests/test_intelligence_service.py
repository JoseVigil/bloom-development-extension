import copy
from pathlib import Path

import pytest

from aitap.accounting.store import AccountingStore, digest
from aitap.intelligence.service import IntelligenceService
from aitap.providers.base import ProviderResult, SupplyError
from aitap.routing.engine import RoutingEngine


ROOT = Path(__file__).resolve().parents[1]


def request():
    payload = {"opaque": "AITAP must not interpret create_domain or any semantic operation"}
    value = {"schema_version": "cognituum.intelligence-supply/v1", "request_id": "isr-test",
        "logical_inference_id": "", "consumer_id": "brain",
        "intent": {"intent_id": "intent-1", "intent_type": "ing", "mandate_id": "mandate-1",
                   "phase": "classification", "turn_id": "1"},
        "input_digest": digest(payload), "payload": payload,
        "routing": {"mode": "policy", "policy_version": "genesis-runtime-intelligence/v2",
                    "required_capabilities": ["text.generate", "structured_output"], "privacy": "approved_cloud"}}
    value["logical_inference_id"] = digest(["intent-1", "classification", "1", value["input_digest"],
                                            value["routing"]["policy_version"]])
    return value


class Vault:
    def resolve(self, reference):
        assert reference == "credential-ref://anthropic/default"
        return "test-secret-not-a-real-credential"


class Provider:
    def __init__(self, errors=()):
        self.calls = 0
        self.errors = list(errors)

    def generate(self, **kwargs):
        self.calls += 1
        if self.errors:
            raise self.errors.pop(0)
        return ProviderResult("not semantic JSON, deliberately opaque", 23, 7, kwargs["model"], "provider-1")


def service(tmp_path, provider=None):
    engine = RoutingEngine.from_files(ROOT / "policies/genesis-runtime-intelligence-v2.json",
                                      ROOT / "registry/genesis-pilot-v2.json")
    engine.policy["intelligence_supply"]["retry_delay_seconds"] = 0
    engine.policy["intelligence_supply"]["max_attempts"] = 2
    return IntelligenceService(engine, AccountingStore(tmp_path), Vault(), provider or Provider())


def test_real_journal_replay_after_service_restart(tmp_path):
    first = service(tmp_path)
    expected = first.supply(request())
    second = service(tmp_path)
    assert second.supply(request()) == expected
    assert first.provider.calls == 1 and second.provider.calls == 0
    journal = second.store.read(request()["logical_inference_id"])
    assert journal["attempts"][0]["usage"] == {"input_tokens": 23, "output_tokens": 7}
    assert "test-secret-not-a-real-credential" not in first.store.path(request()["logical_inference_id"]).read_text()


def test_digest_conflict_fails_without_call(tmp_path):
    supplied = service(tmp_path)
    supplied.supply(request())
    bad = request()
    bad["payload"] = {"different": True}
    with pytest.raises(SupplyError, match="INPUT_DIGEST_MISMATCH"):
        supplied.supply(bad)
    assert supplied.provider.calls == 1


@pytest.mark.parametrize("code,calls", [("PROVIDER_AUTH_FAILED", 1), ("PROVIDER_RATE_LIMITED", 2),
                                       ("PROVIDER_UNAVAILABLE", 2)])
def test_retry_policy(tmp_path, code, calls):
    supplied = service(tmp_path, Provider([SupplyError(code, "provider")]))
    if calls == 1:
        with pytest.raises(SupplyError):
            supplied.supply(request())
    else:
        supplied.supply(request())
    assert supplied.provider.calls == calls


def test_timeout_uncertainty_is_not_automatically_reinvoked(tmp_path):
    supplied = service(tmp_path, Provider([SupplyError("PROVIDER_TIMEOUT", "provider", uncertain=True)]))
    with pytest.raises(SupplyError):
        supplied.supply(request())
    recovered = service(tmp_path)
    with pytest.raises(SupplyError):
        recovered.supply(request())
    assert recovered.provider.calls == 0


def test_crash_inflight_fails_closed(tmp_path):
    supplied = service(tmp_path)
    supplied.provider.generate = lambda **_: (_ for _ in ()).throw(KeyboardInterrupt())
    with pytest.raises(KeyboardInterrupt):
        supplied.supply(request())
    recovered = service(tmp_path)
    with pytest.raises(SupplyError, match="uncertain"):
        recovered.supply(request())
    assert recovered.provider.calls == 0


def test_accounting_failure_never_returns_success(tmp_path):
    supplied = service(tmp_path)
    write = supplied.store.write
    def fail_completed(identity, journal):
        if journal["state"] == "completed":
            raise SupplyError("ACCOUNTING_PERSIST_FAILED", "accounting")
        write(identity, journal)
    supplied.store.write = fail_completed
    with pytest.raises(SupplyError, match="ACCOUNTING_PERSIST_FAILED"):
        supplied.supply(request())
    assert supplied.provider.calls == 1


def test_failover_has_new_route_and_same_logical_id(tmp_path):
    supplied = service(tmp_path, Provider([SupplyError("PROVIDER_UNAVAILABLE", "provider")]))
    backend = copy.deepcopy(next(b for b in supplied.engine.registry["intelligence_backends"] if b["provider"] == "anthropic"))
    backend.update(backend_id="anthropic_alternate", model="controlled-alternate")
    supplied.engine.registry["intelligence_backends"].append(backend)
    supplied.engine.policy["intelligence_supply"]["fallback"] = [backend["backend_id"]]
    supplied.supply(request())
    attempts = supplied.store.read(request()["logical_inference_id"])["attempts"]
    assert len(attempts) == 2
    assert attempts[0]["routing_decision"]["routing_decision_id"] != attempts[1]["routing_decision"]["routing_decision_id"]
    assert len({a["routing_decision"]["logical_inference_id"] for a in attempts}) == 1


def budget_request(label="intent-1"):
    value = request()
    value["intent"].update(intent_id=label, mandate_id="6f4e9a31-52c7-4e8d-9a16-7d204bc38f51")
    value["logical_inference_id"] = digest([label, "classification", "1", value["input_digest"],
                                           value["routing"]["policy_version"]])
    return value


def budget_service(tmp_path):
    supplied = service(tmp_path)
    supplied.engine.policy["intelligence_supply"]["max_attempts"] = 1
    supplied.provider.count_input_tokens = lambda **kwargs: 100
    return supplied


def test_budget_survives_restart_and_limits_two_inferences(tmp_path):
    supplied = budget_service(tmp_path)
    first = supplied.supply(budget_request())
    recovered = budget_service(tmp_path)
    assert recovered.supply(budget_request()) == first
    assert recovered.provider.calls == 0
    recovered.supply(budget_request("second"))
    with pytest.raises(SupplyError, match="BUDGET_EXCEEDED"):
        recovered.supply(budget_request("third"))
    assert recovered.provider.calls == 1


@pytest.mark.parametrize("field,value", [("max_total_tokens", 100), ("max_usd", "0.001")])
def test_budget_denies_before_generation(tmp_path, field, value):
    supplied = budget_service(tmp_path)
    supplied.engine.policy["intelligence_supply"]["budget"][field] = value
    with pytest.raises(SupplyError, match="BUDGET_EXCEEDED"):
        supplied.supply(budget_request())
    assert supplied.provider.calls == 0


def test_uncertain_call_keeps_reservation(tmp_path):
    supplied = budget_service(tmp_path)
    supplied.provider.errors = [SupplyError("PROVIDER_TIMEOUT", "provider", uncertain=True)]
    with pytest.raises(SupplyError):
        supplied.supply(budget_request())
    recovered = budget_service(tmp_path)
    with pytest.raises(SupplyError):
        recovered.supply(budget_request())
    assert recovered.provider.calls == 0
    with pytest.raises(SupplyError, match="unresolved"):
        recovered.supply(budget_request("second"))
    assert recovered.provider.calls == 0
    records = list((tmp_path / "budgets").glob("*.json"))
    import json
    assert len(json.loads(records[0].read_text())["journal"]["reservations"]) == 1


def test_provider_overrun_halts_future_inferences(tmp_path):
    supplied = budget_service(tmp_path)
    supplied.provider.generate = lambda **kw: ProviderResult("raw", 2000, 1, kw["model"], "r")
    with pytest.raises(SupplyError, match="exceeded reservation"):
        supplied.supply(budget_request())
    recovered = budget_service(tmp_path)
    with pytest.raises(SupplyError, match="halted"):
        recovered.supply(budget_request("second"))
    assert recovered.provider.calls == 0
