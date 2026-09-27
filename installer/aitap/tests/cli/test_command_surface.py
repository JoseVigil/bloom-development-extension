import json
import os
import re
import subprocess
import sys
from pathlib import Path

import pytest

from aitap.cli.categories import CommandCategory
from aitap.cli.registry import CommandRegistry
from aitap.commands import COMMAND_CLASSES, discover_commands

SRC = Path(__file__).resolve().parents[2] / "src"
EXAMPLES = Path(__file__).resolve().parents[2] / "examples"

EXPECTED = {
    "system": {"version", "info", "status"},
    "health": {"check"},
    "keys": {"list"},
    "route": {"decide", "supply", "policy"},
    "accounting": {"usage"},
    "local": {"preflight"},
}


def _cli(*args, env=None):
    environment = {**os.environ, "PYTHONPATH": str(SRC), "PYTHONIOENCODING": "utf-8"}
    environment.pop("AITAP_STATE_DIR", None)
    environment.update(env or {})
    return subprocess.run([sys.executable, "-B", "-m", "aitap", *args], capture_output=True, text=True,
                          encoding="utf-8", timeout=60, env=environment)


def test_registry_matches_approved_taxonomy():
    registry = discover_commands()
    listed = {cat.name: set(names) for cat, names in registry.list_all().items()}
    assert listed == EXPECTED
    assert {c.name for c in CommandCategory} == set(EXPECTED)


def test_metadata_is_truthful_and_examples_are_real():
    for command in discover_commands().get_all_commands():
        meta = command.metadata()
        assert meta.description.strip()
        assert meta.examples and all(e.startswith("aitap ") for e in meta.examples)
        assert all(f" {meta.category.name} {meta.name}" in e for e in meta.examples)
        assert meta.aliases == []
    by_name = {(c.metadata().category.name, c.metadata().name): c.metadata() for c in discover_commands().get_all_commands()}
    assert by_name[("route", "supply")].requires_vault is True
    assert by_name[("keys", "list")].requires_vault is False


def test_duplicate_registration_is_rejected():
    registry = CommandRegistry()
    registry.register(COMMAND_CLASSES[0]())
    with pytest.raises(ValueError):
        registry.register(COMMAND_CLASSES[0]())


def test_json_help_lists_every_category_with_commands():
    result = _cli("--json-help")
    assert result.returncode == 0
    categories = json.loads(result.stdout)["categories"]
    assert {name: {c["name"] for c in data["commands"]} for name, data in categories.items()} == EXPECTED


@pytest.mark.parametrize("args, operation", [
    (["system", "status"], "system.status"),
    (["keys", "list"], "keys.list"),
    (["route", "policy"], "route.policy"),
    (["health", "check"], "health.check"),
    (["local", "preflight"], "local.preflight"),
])
def test_json_success_envelope(args, operation, tmp_path):
    result = _cli("--json", *args, env={"BLOOM_APPDATA_DIR": str(tmp_path)})
    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    assert payload["status"] == "success" and payload["operation"] == operation and "data" in payload


def test_accounting_usage_success_and_error_envelopes(tmp_path):
    ok = _cli("--json", "accounting", "usage", "--state-dir", str(tmp_path))
    assert ok.returncode == 0 and json.loads(ok.stdout)["data"]["journals_scanned"] == 0
    missing = _cli("--json", "accounting", "usage")
    assert missing.returncode == 1
    error = json.loads(missing.stdout)["error"]
    assert error["code"] == "STATE_DIR_REQUIRED" and set(error) == {"code", "message", "stage", "retryable", "details"}


def test_route_decide_keeps_contract_and_unifies_errors(tmp_path):
    ok = _cli("--json", "route", "decide", "--request", str(EXAMPLES / "genesis-ing-request-v2.json"))
    assert ok.returncode == 0 and json.loads(ok.stdout)["schema_version"] == "cognituum.routing/v2"
    human = _cli("route", "decide", "--request", str(EXAMPLES / "genesis-ing-request-v2.json"))
    assert human.returncode == 0 and human.stdout.startswith("decision ")
    bad = tmp_path / "bad.json"
    bad.write_text("{}")
    rejected = _cli("--json", "route", "decide", "--request", str(bad))
    assert rejected.returncode == 1
    assert json.loads(rejected.stdout)["error"]["code"] == "ROUTING_REJECTED"
    bad.write_text("no-json")
    invalid = _cli("--json", "route", "decide", "--request", str(bad))
    assert json.loads(invalid.stdout)["error"]["code"] == "INVALID_REQUEST"


def test_human_mode_never_prints_json(tmp_path):
    result = _cli("keys", "list", env={"BLOOM_APPDATA_DIR": str(tmp_path)})
    assert result.returncode == 0 and not result.stdout.lstrip().startswith("{")


def test_local_preflight_rejects_unknown_model(tmp_path):
    result = _cli("--json", "local", "preflight", "--model", "no-existe", env={"BLOOM_APPDATA_DIR": str(tmp_path)})
    assert result.returncode == 1 and json.loads(result.stdout)["error"]["code"] == "UNKNOWN_MODEL"


def test_packaged_config_holds_references_only():
    """aitap.config.json viaja dentro del binario: solo puede contener referencias, nunca secretos."""
    root = SRC.parent
    assert '"aitap.config.json"' in (root / "aitap.spec").read_text()
    config = json.loads((root / "aitap.config.json").read_text())
    forbidden_key = re.compile(r"(secret|token|password|passwd|api[_-]?key|private)", re.I)
    secret_value = re.compile(r"(sk-[A-Za-z0-9]|AKIA[0-9A-Z]{8}|-----BEGIN|xox[bap]-|ghp_|AIza[0-9A-Za-z_-]{10})")

    def walk(value, path="$"):
        if isinstance(value, dict):
            for key, item in value.items():
                assert not forbidden_key.search(key), f"clave sospechosa en {path}.{key}"
                walk(item, f"{path}.{key}")
        elif isinstance(value, list):
            for index, item in enumerate(value):
                walk(item, f"{path}[{index}]")
        elif isinstance(value, str):
            assert not secret_value.search(value), f"valor con forma de secreto en {path}"

    walk(config)
    references = config["intelligence_supply"]["credential_references"]
    assert references and all(k.startswith("credential-ref://") for k in references)
    assert all(re.fullmatch(r"[a-z0-9-]+-key:[a-z0-9_-]+", v) for v in references.values())
