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
