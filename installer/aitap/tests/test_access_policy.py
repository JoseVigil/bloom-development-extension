import copy
import json

import pytest

from aitap.access.policy import DEFAULT_POLICY_RELATIVE, AccessPolicyError, load_access_policy
from aitap.local.catalog import load_catalog
from aitap.runtime_paths import resource_root


def _document():
    return json.loads((resource_root() / DEFAULT_POLICY_RELATIVE).read_text())


def test_default_policy_is_deny_and_covers_mandatory_models():
    policy = load_access_policy(load_catalog())
    assert policy.document["default_decision"] == "deny"
    assert policy.document["status"] == "default_packaged"
    assert {r["model_id"] for r in policy.document["models"]} == {"functiongemma-270m"}
    assert all(r["allowed_consumers"] == [] for r in policy.document["models"])
    assert policy.rule("local.ollama.functiongemma-270m")["quotas"]["max_concurrency"] == 1
    assert policy.fingerprint.startswith("sha256:")


@pytest.mark.parametrize("mutate", [
    lambda d: d["models"][0].update(backend_id="local.ollama.otro"),
    lambda d: d["models"][0].update(model_id="no-existe"),
    lambda d: d["models"].pop(),
    lambda d: d["models"].append(copy.deepcopy(d["models"][0])),
    lambda d: d.update(default_decision="allow"),
    lambda d: d["models"][0]["quotas"].update(max_concurrency=0),
    lambda d: d["models"][0]["consumer_overrides"].update(brain=copy.deepcopy(d["models"][0]["quotas"])),
    lambda d: d["models"][0].update(backend_id="anthropic_api"),
])
def test_invalid_policies_fail_closed(mutate):
    document = _document()
    mutate(document)
    with pytest.raises(AccessPolicyError) as exc:
        load_access_policy(load_catalog(), document=document)
    assert exc.value.code == "ACCESS_POLICY_INVALID"


def test_override_is_valid_for_an_allowed_consumer():
    document = _document()
    rule = document["models"][0]
    rule["allowed_consumers"] = ["brain"]
    rule["consumer_overrides"] = {"brain": dict(rule["quotas"], max_inferences=10)}
    policy = load_access_policy(load_catalog(), document=document)
    assert policy.rule("local.ollama.functiongemma-270m")["consumer_overrides"]["brain"]["max_inferences"] == 10


# ------------------------------------------------------------------ permiso acotado y route policy

import hashlib  # noqa: E402
import os  # noqa: E402
import subprocess  # noqa: E402
import sys  # noqa: E402
from pathlib import Path  # noqa: E402

from aitap.access.enforcement import authorize, effective_grants, evaluate_grant  # noqa: E402
from aitap.commands.route.policy import describe  # noqa: E402
from aitap.providers.base import SupplyError  # noqa: E402

SRC = Path(__file__).resolve().parents[1] / "src"
MODEL_ID, BACKEND = "functiongemma-270m", "local.ollama.functiongemma-270m"
QUERY = dict(model_id=MODEL_ID, consumer_id="brain", intent_type="gen", policy_version="mandate-gen-local/v1")


def _granted():
    document = _document()
    rule = document["models"][0]
    rule["allowed_consumers"] = ["brain"]
    rule["grants"] = [{"consumer_id": "brain", "intent_types": ["gen"], "policy_versions": ["mandate-gen-local/v1"]}]
    raw = json.dumps(document, indent=2).encode("utf-8")
    return load_access_policy(load_catalog(), raw=raw), raw


def _route_policy(*args):
    environment = {**os.environ, "PYTHONPATH": str(SRC), "PYTHONIOENCODING": "utf-8"}
    result = subprocess.run([sys.executable, "-B", "-m", "aitap", "--json", "route", "policy", *args],
                            capture_output=True, text=True, timeout=30, env=environment)
    return result.returncode, json.loads(result.stdout)


def test_grant_permits_only_the_exact_combination():
    policy, _ = _granted()
    allowed = evaluate_grant(policy, **QUERY)
    assert (allowed["allowed"], allowed["reason"]) == (True, "GRANTED")
    for change in ({"consumer_id": "alfred"}, {"intent_type": "ing"}, {"policy_version": "mandate-gen-local/v2"}):
        assert evaluate_grant(policy, **{**QUERY, **change})["reason"] == "NO_MATCHING_GRANT"
    assert evaluate_grant(policy, **{**QUERY, "model_id": "no-existe"})["reason"] == "UNKNOWN_MODEL"
    policy.document["models"][0]["enabled"] = False
    assert evaluate_grant(policy, **QUERY)["reason"] == "MODEL_DISABLED"


def test_default_policy_denies_brain_gen():
    policy = load_access_policy(load_catalog())
    assert effective_grants(policy) == []
    assert evaluate_grant(policy, **QUERY) == {**QUERY, "allowed": False, "reason": "NO_MATCHING_GRANT", "grant": None}
    with pytest.raises(SupplyError) as exc:
        authorize(policy, backend_id=BACKEND, consumer_id="brain", intent_type="gen",
                  policy_version="mandate-gen-local/v1", input_bytes=10)
    assert (exc.value.code, exc.value.stage, exc.value.retryable) == ("ACCESS_DENIED", "access", False)


def test_grant_for_consumer_outside_allowed_consumers_is_invalid():
    document = _document()
    document["models"][0]["grants"] = [{"consumer_id": "brain", "intent_types": ["gen"],
                                        "policy_versions": ["mandate-gen-local/v1"]}]
    with pytest.raises(AccessPolicyError) as exc:
        load_access_policy(load_catalog(), document=document)
    assert exc.value.code == "ACCESS_POLICY_INVALID"


@pytest.mark.parametrize("grant", [
    {"consumer_id": "brain", "intent_types": [], "policy_versions": ["v"]},
    {"consumer_id": "brain", "intent_types": ["exec"], "policy_versions": ["v"]},
    {"consumer_id": "brain", "intent_types": ["gen"], "policy_versions": []},
    {"consumer_id": "Brain!", "intent_types": ["gen"], "policy_versions": ["v"]},
    {"consumer_id": "brain", "intent_types": ["gen"], "policy_versions": ["v"], "all": True},
])
def test_malformed_grants_fail_closed(grant):
    document = _document()
    document["models"][0].update(allowed_consumers=["brain"], grants=[grant])
    with pytest.raises(AccessPolicyError):
        load_access_policy(load_catalog(), document=document)


def test_route_policy_json_permit_and_deny_with_test_policy():
    policy, raw = _granted()
    permit = describe(policy, {"consumer": "brain", "intent_type": "gen",
                               "policy_version": "mandate-gen-local/v1", "model": MODEL_ID})
    assert permit["check"]["allowed"] is True and permit["file_sha256"] == hashlib.sha256(raw).hexdigest()
    assert permit["effective_grants"] == [{"model_id": MODEL_ID, "backend_id": BACKEND, "consumer_id": "brain",
                                           "intent_type": "gen", "policy_version": "mandate-gen-local/v1"}]
    deny = describe(policy, {"consumer": "brain", "intent_type": "gen",
                             "policy_version": "mandate-gen-local/v2", "model": MODEL_ID})
    assert (deny["check"]["allowed"], deny["check"]["reason"]) == (False, "NO_MATCHING_GRANT")


def test_route_policy_exposes_file_sha256():
    code, envelope = _route_policy()
    assert code == 0 and envelope["operation"] == "route.policy"
    data = envelope["data"]
    raw = (resource_root() / DEFAULT_POLICY_RELATIVE).read_bytes()
    assert data["file_sha256"] == hashlib.sha256(raw).hexdigest()
    assert data["enforced"] is True and data["policy"]["default_decision"] == "deny"
    assert data["policy_version"] == "local-access-default/v1" and data["effective_grants"] == []
    assert "check" not in data


def test_route_policy_check_denies_brain_gen_on_packaged_policy():
    code, envelope = _route_policy("--consumer", "brain", "--intent-type", "gen",
                                   "--policy-version", "mandate-gen-local/v1", "--model", MODEL_ID)
    assert code == 0
    assert envelope["data"]["check"] == {**QUERY, "allowed": False, "reason": "NO_MATCHING_GRANT", "grant": None}


def test_route_policy_check_requires_all_four_fields():
    code, envelope = _route_policy("--consumer", "brain", "--intent-type", "gen")
    assert code == 1 and envelope["error"]["code"] == "INVALID_REQUEST"
