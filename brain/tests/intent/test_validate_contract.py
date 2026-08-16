"""
Integration test for `brain intent validate-contract`.

Runs the actual Typer command against synthetic BSIP-Response fixtures
(valid and intentionally invalid) — no real intent or OpenCode producer is
needed, since neither exists in the codebase yet.
"""

import hashlib
import json

import pytest
import typer
from typer.testing import CliRunner

from brain.commands.intent.validate_contract import ValidateContractCommand
from brain.shared.context import GlobalContext


@pytest.fixture
def app():
    app = typer.Typer()
    ValidateContractCommand().register(app)
    return app


@pytest.fixture
def runner():
    return CliRunner()


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


@pytest.fixture
def valid_payload():
    return {
        "bsip_response_version": "1.0",
        "intent_id": "intent-abc",
        "turn_id": "turn-1",
        "operations": [
            {
                "op": "create",
                "path": "src/app/foo.py",
                "content": "print(1)\n",
                "checksum_after": _sha256("print(1)\n"),
            },
            {
                "op": "patch",
                "path": "src/app/bar.py",
                "diff": "--- a/bar.py\n+++ b/bar.py\n@@ -1 +1 @@\n-old\n+new\n",
                "checksum_before": _sha256("old"),
                "checksum_after": _sha256("new"),
            },
            {
                "op": "delete",
                "path": "src/app/baz.py",
            },
        ],
        "metadata": {
            "model": "gpt-x",
            "channel": "api",
            "confidence_or_notes": "synthetic fixture",
        },
    }


@pytest.fixture
def invalid_payload():
    return {
        "bsip_response_version": "1.0",
        "intent_id": "intent-abc",
        "turn_id": "turn-1",
        "operations": [
            # patch con 'content' en vez de 'diff', y path absoluto
            {"op": "patch", "path": "/etc/passwd", "content": "nope"},
            # path con '..'
            {"op": "edit", "path": "src/../secrets.env", "content": "x"},
            # checksum con formato inválido
            {"op": "delete", "path": "src/app/gone.py", "checksum_before": "not-a-hash"},
        ],
        "metadata": {"model": "gpt-x", "channel": "carrier-pigeon"},
    }


def _write_fixture(tmp_path, name, payload):
    path = tmp_path / name
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


def test_valid_payload_passes_shape_validation(app, runner, tmp_path, valid_payload):
    fixture = _write_fixture(tmp_path, "valid.json", valid_payload)

    result = runner.invoke(
        app,
        ["--input-file", str(fixture)],
        obj=GlobalContext(verbose=False, json_mode=True),
    )

    assert result.exit_code == 0, result.stdout
    payload = json.loads(result.stdout)
    assert payload["data"]["valid"] is True
    assert payload["data"]["violations"] == []
    assert payload["data"]["operations_count"] == 3


def test_valid_payload_respects_scope_prefix(app, runner, tmp_path, valid_payload):
    fixture = _write_fixture(tmp_path, "valid.json", valid_payload)

    ok = runner.invoke(
        app,
        ["--input-file", str(fixture), "--scope-prefix", "src/app"],
        obj=GlobalContext(verbose=False, json_mode=True),
    )
    assert ok.exit_code == 0
    assert json.loads(ok.stdout)["data"]["valid"] is True

    out_of_scope = runner.invoke(
        app,
        ["--input-file", str(fixture), "--scope-prefix", "docs,other"],
        obj=GlobalContext(verbose=False, json_mode=True),
    )
    assert out_of_scope.exit_code == 1
    body = json.loads(out_of_scope.stdout)
    assert body["data"]["valid"] is False
    assert all(v["code"] == "scope_violation" for v in body["data"]["violations"])
    assert len(body["data"]["violations"]) == 3


def test_invalid_payload_reports_specific_violations(app, runner, tmp_path, invalid_payload):
    fixture = _write_fixture(tmp_path, "invalid.json", invalid_payload)

    result = runner.invoke(
        app,
        ["--input-file", str(fixture)],
        obj=GlobalContext(verbose=False, json_mode=True),
    )

    assert result.exit_code == 1
    body = json.loads(result.stdout)
    assert body["data"]["valid"] is False

    pointers = {v["json_pointer"] for v in body["data"]["violations"]}
    # Cada problema sembrado a propósito debe aparecer con su propio json_pointer,
    # no solo un fallo genérico.
    assert "/operations/0/path" in pointers  # path absoluto
    assert "/operations/1/path" in pointers  # path con '..'
    assert "/operations/2/checksum_before" in pointers  # checksum mal formado
    assert "/metadata/channel" in pointers  # channel fuera de enum

    assert body["data"]["correction_prompt"] is not None
    assert "Contrato D" in body["data"]["correction_prompt"]


def test_missing_input_file_fails_cleanly(app, runner, tmp_path):
    missing = tmp_path / "does_not_exist.json"

    result = runner.invoke(
        app,
        ["--input-file", str(missing)],
        obj=GlobalContext(verbose=False, json_mode=True),
    )

    assert result.exit_code == 1
