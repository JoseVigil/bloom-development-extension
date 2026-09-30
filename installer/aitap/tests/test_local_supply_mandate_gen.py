"""route supply con privacy local: una inferencia logica por Ollama, bajo politica de acceso cerrada.

Politica, registry y permiso son de prueba (en tmp): ningun archivo empaquetado
declara un backend local ni un permiso. El Ollama es simulado (fixtures).
"""
import copy
import hashlib
import json
import os
import socket
import subprocess
import sys
from pathlib import Path

import pytest

from aitap.access.enforcement import QuotaLedger
from aitap.access.policy import DEFAULT_POLICY_RELATIVE, load_access_policy
from aitap.accounting.store import AccountingStore, digest, file_lock
from aitap.intelligence.service import IntelligenceService, LocalSupplyContext, validate_contract
from aitap.local.catalog import load_catalog
from aitap.providers.base import SupplyError
from aitap.providers.ollama import OllamaProvider
from aitap.routing.engine import RoutingEngine
from aitap.runtime_paths import resource_root

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_ollama_provider import CHAT, HEX, MODEL, TAGS, FakeOllama  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
POLICY_VERSION = "mandate-gen-local/v1"
BACKEND = "local.ollama.functiongemma-270m"
TOP_LEVEL = {"schema_version", "request_id", "logical_inference_id", "routing_decision_id", "routing_decision",
             "provider", "model", "raw_response", "raw_response_digest", "usage", "latency_ms",
             "accounting_ref", "outcome"}
FORMAT = {"type": "object", "additionalProperties": False,
          "required": ["purpose", "boundaries", "concepts", "decisions"],
          "properties": {"purpose": {"type": "string"},
                         "boundaries": {"type": "object", "additionalProperties": False,
                                        "required": ["inScope", "outOfScope"],
                                        "properties": {"inScope": {"type": "array", "items": {"type": "string"}},
                                                       "outOfScope": {"type": "array", "items": {"type": "string"}}}},
                         "concepts": {"type": "array", "items": {"type": "string"}},
                         "decisions": {"type": "array", "items": {"type": "string"}}}}


def local_policy(**changes):
    rule = {"backend_id": BACKEND, "fallback": [], "max_attempts": 1, "max_output_tokens": 512,
            "max_input_bytes": 65536, "timeout_seconds": 120,
            "budget": {"per_mandate": True, "max_usd": None, "max_total_tokens": 20000, "max_inferences": 1},
            "local": {"format": FORMAT, "options": {"temperature": 0, "seed": 0, "num_ctx": 8192}, "keep_alive": "0"}}
    rule.update(changes)
    return {"schema_version": "cognituum.routing-policy/v2", "policy_version": POLICY_VERSION,
            "intelligence_supply": rule, "stages": {}}


def local_registry(**changes):
    cloud = next(b for b in json.loads((ROOT / "registry/genesis-pilot-v2.json").read_text())["intelligence_backends"]
                 if b["backend_id"] == "anthropic_api")
    backend = {"backend_id": BACKEND, "provider": "ollama", "model": MODEL, "model_digest": HEX,
               "credential_ref": None, "capabilities": ["text.generate", "structured_output"], "privacy": "local",
               "health": "healthy", "accounting_ref": "accounting://backend/" + BACKEND, "supply_enabled": True}
    backend.update(changes)
    return {"schema_version": "cognituum.routing-registry/v2", "snapshot_id": "local-test-snapshot",
            "runtimes": [], "intelligence_backends": [backend, dict(cloud, supply_enabled=True)]}


def granted_access(consumer="brain", intent_types=("gen",), versions=(POLICY_VERSION,), suffix=b""):
    document = json.loads((resource_root() / DEFAULT_POLICY_RELATIVE).read_text(encoding="utf-8"))
    rule = document["models"][0]
    rule["allowed_consumers"] = [consumer]
    rule["grants"] = [{"consumer_id": consumer, "intent_types": list(intent_types), "policy_versions": list(versions)}]
    raw = json.dumps(document, ensure_ascii=False, indent=2).encode("utf-8") + suffix
    return load_access_policy(load_catalog(), raw=raw), raw


def write_files(tmp_path, policy=None, registry=None, name="res"):
    folder = tmp_path / name
    folder.mkdir(exist_ok=True)
    policy_path, registry_path = folder / "policy.json", folder / "registry.json"
    policy_path.write_text(json.dumps(policy or local_policy(), indent=2), encoding="utf-8")
    registry_path.write_text(json.dumps(registry or local_registry(), indent=2), encoding="utf-8")
    return policy_path, registry_path


def gen_request(intent_id="action-1", mandate_id="mandate-1", consumer="brain", intent_type="gen",
                policy_version=POLICY_VERSION, turn="1"):
    payload = {"instruction": "Return only the required domain definition JSON.", "contractDigest": "sha256:" + "a" * 64,
               "objective": "objetivo", "domain": {"id": "dom-1", "name": "Dominio"},
               "sources": [{"ref": "files://doc-1", "content": "contenido verificado"}]}
    phase = {"gen": "generation", "ing": "classification", "dis": "mapping"}[intent_type]
    value = {"schema_version": "cognituum.intelligence-supply/v1", "request_id": "isr-local",
             "logical_inference_id": "", "consumer_id": consumer,
             "intent": {"intent_id": intent_id, "intent_type": intent_type, "mandate_id": mandate_id,
                        "phase": phase, "turn_id": turn},
             "input_digest": digest(payload), "payload": payload,
             "routing": {"mode": "policy", "policy_version": policy_version,
                         "required_capabilities": ["text.generate", "structured_output"], "privacy": "local"}}
    value["logical_inference_id"] = digest([intent_id, phase, turn, value["input_digest"], policy_version])
    return value


class Vault:
    def __init__(self):
        self.calls = 0

    def resolve(self, *args, **kwargs):
        self.calls += 1
        raise AssertionError("Vault must never be called for privacy local")


class CloudProvider:
    def __init__(self):
        self.calls = 0

    def generate(self, **kwargs):
        self.calls += 1
        raise AssertionError("cloud provider must never be called for privacy local")

    count_input_tokens = generate


def service(tmp_path, fake=None, access=None, files=None, verdict="APTO", state="state"):
    policy_path, registry_path = files or write_files(tmp_path)
    engine = RoutingEngine.from_files(policy_path, registry_path)
    vault, cloud, fake = Vault(), CloudProvider(), fake or FakeOllama()
    local = LocalSupplyContext(access_policy=access or granted_access()[0], provider=OllamaProvider(opener=fake),
                               eligibility=lambda backend: {"verdict": verdict, "reasons": []})
    supply = IntelligenceService(engine, AccountingStore(tmp_path / state), vault, cloud, local=local)
    return supply, fake, vault, cloud


def chat_calls(fake):
    return [c for c in fake.calls if c[1] == "/api/chat"]


def journal_of(supply, request):
    return supply.store.read(request["logical_inference_id"])


# ------------------------------------------------------------------ resultado v1


def test_result_has_exact_v1_top_level_keys(tmp_path):
    supply, fake, _, _ = service(tmp_path)
    result = supply.supply(gen_request())
    validate_contract("intelligence-supply-result.schema.json", result)
    assert set(result) == TOP_LEVEL
    assert result["provider"] == result["routing_decision"]["effective_intelligence"]["provider"] == "ollama"
    assert result["model"] == result["routing_decision"]["effective_intelligence"]["model"] == MODEL
    assert result["raw_response"] == CHAT["message"]["content"]
    assert result["usage"] == {"input_tokens": 120, "output_tokens": 48}
    assert len(chat_calls(fake)) == 1


def test_credential_ref_is_json_null_and_vault_not_called(tmp_path):
    supply, _, vault, cloud = service(tmp_path)
    result = supply.supply(gen_request())
    effective = result["routing_decision"]["effective_intelligence"]
    assert "credential_ref" in effective and effective["credential_ref"] is None
    assert '"credential_ref": null' in json.dumps(result)
    assert vault.calls == 0 and cloud.calls == 0


def test_accounting_ref_format(tmp_path):
    supply, _, _, _ = service(tmp_path)
    request = gen_request()
    result = supply.supply(request)
    assert result["accounting_ref"] == "accounting://inference/" + request["logical_inference_id"][7:]
    assert not result["accounting_ref"].startswith("accounting://inference/sha256:")


def test_request_sent_to_ollama_uses_policy_format_and_options(tmp_path):
    supply, fake, _, _ = service(tmp_path)
    supply.supply(gen_request())
    assert [c[:2] for c in fake.calls] == [("GET", "/api/tags"), ("POST", "/api/chat")]
    body = chat_calls(fake)[0][2]
    assert body["format"] == FORMAT and body["stream"] is False and body["keep_alive"] == "0"
    assert body["options"] == {"temperature": 0, "seed": 0, "num_ctx": 8192, "num_predict": 512}


# ------------------------------------------------------------------ huellas


def test_fingerprints_match_file_bytes(tmp_path):
    files = write_files(tmp_path)
    access, raw = granted_access()
    supply, _, _, _ = service(tmp_path, access=access, files=files)
    route = supply.supply(gen_request())["routing_decision"]
    assert route["resource_fingerprints"] == {
        "supply_policy_sha256": hashlib.sha256(files[0].read_bytes()).hexdigest(),
        "registry_sha256": hashlib.sha256(files[1].read_bytes()).hexdigest(),
        "access_policy_sha256": hashlib.sha256(raw).hexdigest(),
        "model_manifest_sha256": HEX}
    assert route["effective_intelligence"]["model_digest"] == HEX
    assert route["registry_snapshot_id"] == "local-test-snapshot"


def test_routing_decision_id_binds_fingerprints(tmp_path):
    base_supply, _, _, _ = service(tmp_path, state="s0")
    base = base_supply.supply(gen_request())["routing_decision"]
    other_digest = "b" * 64
    tags = copy.deepcopy(TAGS)
    tags["models"][0]["digest"] = other_digest
    variants = {}
    policy_path, registry_path = write_files(tmp_path, name="p")
    policy_path.write_bytes(policy_path.read_bytes() + b"\n")          # mismo JSON, otros bytes
    variants["supply_policy_sha256"] = dict(files=(policy_path, registry_path))
    policy_path, registry_path = write_files(tmp_path, name="r")
    registry_path.write_bytes(registry_path.read_bytes() + b" ")
    variants["registry_sha256"] = dict(files=(policy_path, registry_path))
    variants["access_policy_sha256"] = dict(access=granted_access(suffix=b"\n")[0])
    # otro modelo instalado exige otro digest fijado en el registry: cambian ambas huellas
    variants["registry_sha256+model_manifest_sha256"] = dict(
        files=write_files(tmp_path, name="m", registry=local_registry(model_digest=other_digest)),
        fake=FakeOllama(tags=tags))
    for index, (key, kwargs) in enumerate(variants.items()):
        supply, _, _, _ = service(tmp_path, state=f"s{index + 1}", **kwargs)
        route = supply.supply(gen_request())["routing_decision"]
        changed = {k for k in base["resource_fingerprints"]
                   if base["resource_fingerprints"][k] != route["resource_fingerprints"][k]}
        assert changed == set(key.split("+"))
        assert route["routing_decision_id"] != base["routing_decision_id"]
        assert route["routing_decision_id"].startswith("rd-") and len(route["routing_decision_id"]) == 35


def test_completed_replay_returns_original_fingerprints(tmp_path):
    files = write_files(tmp_path)
    supply, fake, _, _ = service(tmp_path, files=files)
    request = gen_request()
    first = supply.supply(request)
    files[0].write_bytes(files[0].read_bytes() + b"\n\n")   # los archivos cambian despues
    later, later_fake, _, _ = service(tmp_path, files=files, access=granted_access(suffix=b" ")[0])
    replay = later.supply(dict(request, request_id="isr-otro"))
    assert replay == {**first, "request_id": "isr-otro"}
    assert replay["routing_decision"]["resource_fingerprints"] == first["routing_decision"]["resource_fingerprints"]
    assert later_fake.calls == [] and len(chat_calls(fake)) == 1


# ------------------------------------------------------------------ chequeos previos (sin journal)


def test_digest_mismatch_is_pre_send_and_leaves_no_attempt(tmp_path):
    tags = copy.deepcopy(TAGS)
    tags["models"][0]["digest"] = "c" * 64
    supply, fake, _, _ = service(tmp_path, fake=FakeOllama(tags=tags))
    request = gen_request()
    with pytest.raises(SupplyError) as exc:
        supply.supply(request)
    assert (exc.value.code, exc.value.stage, exc.value.uncertain) == ("MODEL_DIGEST_MISMATCH", "provider", False)
    assert chat_calls(fake) == [] and journal_of(supply, request) is None
    fixed, fixed_fake, _, _ = service(tmp_path)          # corregida la instalacion, el mismo id funciona
    assert fixed.supply(request)["outcome"] == "completed" and len(chat_calls(fixed_fake)) == 1


@pytest.mark.parametrize("request_kwargs, access_kwargs", [
    ({"consumer": "alfred"}, {}),
    ({"intent_type": "ing"}, {}),
    ({}, {"versions": ("mandate-gen-local/v2",)}),
    ({}, {"intent_types": ("dis",)}),
])
def test_access_denied_for_other_consumer_intent_or_policy(tmp_path, request_kwargs, access_kwargs):
    supply, fake, vault, _ = service(tmp_path, access=granted_access(**access_kwargs)[0])
    request = gen_request(**request_kwargs)
    with pytest.raises(SupplyError) as exc:
        supply.supply(request)
    assert (exc.value.code, exc.value.stage, exc.value.retryable) == ("ACCESS_DENIED", "access", False)
    assert fake.calls == [] and vault.calls == 0 and journal_of(supply, request) is None


def test_packaged_access_policy_denies_every_local_request(tmp_path):
    packaged = load_access_policy(load_catalog())
    assert packaged.file_sha256 == hashlib.sha256((resource_root() / DEFAULT_POLICY_RELATIVE).read_bytes()).hexdigest()
    supply, fake, _, _ = service(tmp_path, access=packaged)
    with pytest.raises(SupplyError) as exc:
        supply.supply(gen_request())
    assert exc.value.code == "ACCESS_DENIED" and "NO_MATCHING_GRANT" in str(exc.value) and fake.calls == []


def test_blocked_model_is_pre_send(tmp_path):
    supply, fake, _, _ = service(tmp_path, verdict="BLOQUEADO")
    request = gen_request()
    with pytest.raises(SupplyError) as exc:
        supply.supply(request)
    assert (exc.value.code, exc.value.stage) == ("LOCAL_MODEL_BLOCKED", "eligibility")
    assert fake.calls == [] and journal_of(supply, request) is None


def test_unreachable_ollama_is_pre_send_and_retryable(tmp_path):
    supply, fake, _, _ = service(tmp_path, fake=FakeOllama(tags_error=ConnectionRefusedError()))
    request = gen_request()
    with pytest.raises(SupplyError) as exc:
        supply.supply(request)
    assert (exc.value.code, exc.value.retryable, exc.value.uncertain) == ("PROVIDER_UNAVAILABLE", True, False)
    assert chat_calls(fake) == [] and journal_of(supply, request) is None


def test_concurrency_limit_is_pre_send_and_retryable(tmp_path):
    supply, fake, _, _ = service(tmp_path)
    request = gen_request()
    with file_lock(supply.store.root / "local" / "slots" / f"{BACKEND}.0.lock"):
        with pytest.raises(SupplyError) as exc:
            supply.supply(request)
    assert (exc.value.code, exc.value.retryable) == ("CONCURRENCY_LIMIT", True)
    assert fake.calls == [] and journal_of(supply, request) is None
    assert supply.supply(request)["outcome"] == "completed"


def test_mandate_budget_allows_a_single_inference(tmp_path):
    supply, fake, _, _ = service(tmp_path)
    supply.supply(gen_request())
    second = gen_request(intent_id="action-2")
    with pytest.raises(SupplyError) as exc:
        supply.supply(second)
    assert (exc.value.code, exc.value.stage) == ("BUDGET_EXCEEDED", "budget")
    assert len(chat_calls(fake)) == 1 and journal_of(supply, second) is None
    quota = json.loads((supply.store.root / "local" / "quotas" / f"{BACKEND}__brain.json").read_text())
    assert [e["id"] for e in quota["entries"]] == [gen_request()["logical_inference_id"]]  # reserva devuelta


def test_access_window_quota_is_pre_send(tmp_path):
    access, _ = granted_access()
    access.document["models"][0]["quotas"]["max_inferences"] = 1
    supply, fake, _, _ = service(tmp_path, access=access)
    QuotaLedger(supply.store.root, BACKEND, "brain", access.document["models"][0]["quotas"]).reserve("otro", 1, 1)
    request = gen_request()
    with pytest.raises(SupplyError) as exc:
        supply.supply(request)
    assert (exc.value.code, exc.value.retryable) == ("QUOTA_EXCEEDED", True)
    assert chat_calls(fake) == [] and journal_of(supply, request) is None


def test_input_over_access_bytes_is_rejected_before_send(tmp_path):
    access, _ = granted_access()
    access.document["models"][0]["quotas"]["max_input_bytes"] = 10
    supply, fake, _, _ = service(tmp_path, access=access)
    with pytest.raises(SupplyError) as exc:
        supply.supply(gen_request())
    assert exc.value.code == "INVALID_REQUEST" and fake.calls == []


# ------------------------------------------------------------------ una sola inferencia logica


def test_in_flight_restart_returns_state_conflict_without_call(tmp_path):
    class Crash(BaseException):
        pass

    supply, fake, _, _ = service(tmp_path, fake=FakeOllama(chat_error=Crash()))
    request = gen_request()
    with pytest.raises(Crash):
        supply.supply(request)
    assert journal_of(supply, request)["state"] == "in_flight"
    restarted, restarted_fake, vault, _ = service(tmp_path)   # mismo store, proceso nuevo
    with pytest.raises(SupplyError) as exc:
        restarted.supply(request)
    assert (exc.value.code, exc.value.stage) == ("STATE_CONFLICT", "journal")
    assert "uncertain" in str(exc.value)
    assert restarted_fake.calls == [] and vault.calls == 0      # ni /api/tags ni /api/chat


@pytest.mark.parametrize("error, code", [(socket.timeout(), "PROVIDER_TIMEOUT"),
                                         (ConnectionResetError(), "PROVIDER_UNAVAILABLE")])
def test_post_failure_is_uncertain_and_never_retried(tmp_path, error, code):
    supply, fake, _, _ = service(tmp_path, fake=FakeOllama(chat_error=error))
    request = gen_request()
    with pytest.raises(SupplyError) as exc:
        supply.supply(request)
    assert (exc.value.code, exc.value.uncertain, exc.value.retryable) == (code, True, False)
    journal = journal_of(supply, request)
    assert journal["state"] == "failed" and journal["error"]["details"]["delivery_uncertain"] is True
    again, again_fake, _, _ = service(tmp_path)
    with pytest.raises(SupplyError) as repeat:
        again.supply(request)
    assert (repeat.value.code, repeat.value.uncertain) == (code, True)
    assert again_fake.calls == [] and len(chat_calls(fake)) == 1


def test_local_zero_accounting(tmp_path):
    supply, _, _, _ = service(tmp_path)
    request = gen_request()
    supply.supply(request)
    journal = journal_of(supply, request)
    attempt = journal["attempts"][0]
    assert journal["state"] == "completed" and len(journal["attempts"]) == 1
    assert (attempt["cost_usd"], attempt["cost_status"]) == (0, "local_zero")
    assert attempt["model_digest"] == HEX and attempt["usage"] == {"input_tokens": 120, "output_tokens": 48}
    assert attempt["routing_decision"]["resource_fingerprints"]["model_manifest_sha256"] == HEX
    budget = AccountingStore(supply.store.root / "budgets").read(digest(["budget", "mandate-1"]))
    assert budget["reservations"][request["logical_inference_id"]]["usd"] == "0"


def test_local_request_never_uses_cloud_even_if_policy_is_cloud(tmp_path):
    supply, fake, vault, cloud = service(tmp_path, files=(ROOT / "policies/mandate-gen-v1.json",
                                                          ROOT / "registry/genesis-pilot-v2.json"))
    with pytest.raises(SupplyError) as exc:
        supply.supply(gen_request(policy_version="mandate-gen/v1"))
    assert exc.value.code == "NO_ELIGIBLE_ROUTE"
    assert fake.calls == [] and vault.calls == 0 and cloud.calls == 0


# ------------------------------------------------------------------ CLI


def _cli_supply(tmp_path, policy_path, registry_path):
    request_path = tmp_path / "request.json"
    request_path.write_text(json.dumps(gen_request()), encoding="utf-8")
    environment = {**os.environ, "PYTHONPATH": str(ROOT / "src"), "PYTHONIOENCODING": "utf-8"}
    command = [sys.executable, "-B", "-m", "aitap", "--json", "route", "supply", "--request", str(request_path),
               "--state-dir", str(tmp_path / "state"), "--policy", str(policy_path), "--registry", str(registry_path)]
    return subprocess.run(command, capture_output=True, text=True, timeout=30, env=environment)


def test_cli_local_supply_is_denied_by_packaged_access_policy(tmp_path):
    policy_path, registry_path = write_files(tmp_path)
    state = tmp_path / "state"
    result = _cli_supply(tmp_path, policy_path, registry_path)
    assert result.returncode == 1
    error = json.loads(result.stdout)["error"]
    assert (error["code"], error["stage"]) == ("ACCESS_DENIED", "access")
    assert not list(state.glob("*.json"))


def test_cli_rejects_local_policy_with_fallback(tmp_path):
    policy_path, registry_path = write_files(tmp_path, policy=local_policy(fallback=["anthropic_api"]))
    result = _cli_supply(tmp_path, policy_path, registry_path)
    assert result.returncode == 1
    assert json.loads(result.stdout)["error"]["code"] == "INVALID_REQUEST"


def test_lock_conflict_inside_slot_propagates_without_retaking_a_slot(tmp_path):
    from aitap.access.enforcement import concurrency_slot
    entered = []
    with pytest.raises(SupplyError) as exc:
        with concurrency_slot(tmp_path, BACKEND, 2):
            entered.append(1)
            raise SupplyError("STATE_CONFLICT", "lock", "budget lock busy")
    assert entered == [1] and str(exc.value) == "budget lock busy"
    with concurrency_slot(tmp_path, BACKEND, 1):     # la ranura quedo liberada
        pass
