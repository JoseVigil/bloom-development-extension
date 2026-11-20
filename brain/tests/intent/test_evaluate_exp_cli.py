import hashlib
import json
from pathlib import Path

import typer
import pytest
from typer.testing import CliRunner

from brain.commands.intent.evaluate_exp import EvaluateExpCommand
from brain.shared.context import GlobalContext


def _digest(path: Path) -> str:
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()


def _app():
    app = typer.Typer()

    @app.callback()
    def main(ctx: typer.Context):
        ctx.obj = GlobalContext(json_mode=True)

    EvaluateExpCommand().register(app)
    return app


def _fixture(tmp_path, failing=False):
    nucleus = tmp_path / "nucleus"
    project = tmp_path / "project"
    nucleus.mkdir()
    project.mkdir()
    refs = {}
    for name in ("ing", "dis", "doc"):
        path = nucleus / f"{name}.json"
        path.write_text(json.dumps({"kind": name}), encoding="utf-8")
        refs[name] = (path.name, _digest(path))
    (project / "test_sample.py").write_text(
        "import unittest\n"
        "class Sample(unittest.TestCase):\n"
        f"    def test_value(self): self.assertTrue({not failing!r})\n",
        encoding="utf-8",
    )
    return nucleus, project, refs


def _args(nucleus, project, refs):
    args = [
        "evaluate-exp", "--nucleus-path", str(nucleus), "--mandate-id", "MND-12345678",
        "--action-id", "EXP-1", "--project-path", str(project),
    ]
    for name in ("ing", "dis", "doc"):
        args.extend([f"--{name}-ref", refs[name][0], f"--{name}-sha256", refs[name][1]])
    return args


def test_evaluate_exp_ready(tmp_path):
    nucleus, project, refs = _fixture(tmp_path)
    before = {path.relative_to(project): path.read_bytes() for path in project.rglob("*") if path.is_file()}
    result = CliRunner().invoke(_app(), _args(nucleus, project, refs))
    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload["status"] == "success"
    assert payload["operation"] == "intent_evaluate_exp"
    assert payload["data"]["status"] == "ready" and payload["data"]["findings"] == []
    artifact = json.loads((nucleus / payload["data"]["result_ref"]).read_text(encoding="utf-8"))
    assert artifact["schema_version"] == "bloom.exp-result/v1"
    assert artifact["checks"][0]["outcome"] == "passed"
    after = {path.relative_to(project): path.read_bytes() for path in project.rglob("*") if path.is_file()}
    assert after == before
    first_bytes = (nucleus / payload["data"]["result_ref"]).read_bytes()
    repeated = CliRunner().invoke(_app(), _args(nucleus, project, refs))
    assert repeated.exit_code == 0
    assert (nucleus / payload["data"]["result_ref"]).read_bytes() == first_bytes


def test_evaluate_exp_remediation_required_for_failed_test(tmp_path):
    nucleus, project, refs = _fixture(tmp_path, failing=True)
    result = CliRunner().invoke(_app(), _args(nucleus, project, refs))
    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload["status"] == "success"
    assert payload["data"]["status"] == "remediation_required"
    assert payload["data"]["findings"][0]["id"] == "unit_tests_failed"
    assert payload["data"]["findings"][0]["remediation"]


def test_evaluate_exp_excludes_bloom_tests(tmp_path):
    nucleus, project, refs = _fixture(tmp_path)
    hidden = project / ".bloom"
    hidden.mkdir()
    (hidden / "test_stale_copy.py").write_text(
        "import unittest\n"
        "class Stale(unittest.TestCase):\n"
        "    def test_stale(self): self.fail('must be excluded')\n",
        encoding="utf-8",
    )
    result = CliRunner().invoke(_app(), _args(nucleus, project, refs))
    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload["data"]["status"] == "ready"
    artifact = json.loads((nucleus / payload["data"]["result_ref"]).read_text(encoding="utf-8"))
    assert artifact["checks"][0]["discovered_files"] == 1


def test_evaluate_exp_frozen_uses_real_python(tmp_path, monkeypatch):
    from brain.core.intent import experiment

    nucleus, project, refs = _fixture(tmp_path)
    real_python = experiment.sys.executable
    monkeypatch.setattr(experiment.sys, "frozen", True, raising=False)
    monkeypatch.setattr(experiment.shutil, "which", lambda name: real_python if name == "python" else None)
    result = experiment.evaluate_exp(
        nucleus_path=nucleus,
        mandate_id="MND-12345678",
        action_id="EXP-FROZEN",
        project_path=project,
        evidence_refs=refs,
    )
    assert result["status"] == "ready"


def test_evaluate_exp_frozen_without_python_fails_closed(tmp_path, monkeypatch):
    from brain.core.intent import experiment

    nucleus, project, refs = _fixture(tmp_path)
    monkeypatch.setattr(experiment.sys, "frozen", True, raising=False)
    monkeypatch.setattr(experiment.shutil, "which", lambda name: None)
    with pytest.raises(experiment.ExperimentEvaluationError, match="real Python interpreter"):
        experiment.evaluate_exp(
            nucleus_path=nucleus,
            mandate_id="MND-12345678",
            action_id="EXP-FROZEN",
            project_path=project,
            evidence_refs=refs,
        )


def test_evaluate_exp_rejects_invalid_evidence_digest(tmp_path):
    nucleus, project, refs = _fixture(tmp_path)
    refs["ing"] = (refs["ing"][0], "sha256:" + "0" * 64)
    result = CliRunner().invoke(_app(), _args(nucleus, project, refs))
    assert result.exit_code == 1
    payload = json.loads(result.output)
    assert payload["status"] == "error"
    assert "does not match" in payload["message"]
    assert not (nucleus / ".intents").exists()
