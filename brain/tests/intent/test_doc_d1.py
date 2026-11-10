"""
Stage D1 of the doc intent (Encargo_Doc_Intent_Actualizacion_Viva_v1_0.md §7).

Gate:
  (a) a manual run over the Gravity vertical leaves a draft with its contract;
  (b) a second run without changes writes no documentation, makes no
      intelligence call, and digests are equal;
  (c) after a change in a vertical file, the next run detects it and writes;
  (d) with scope domain or gene, the output says "declarado, no verificado".
Plus P5 (finalize precondition), external anomalies (P48/P34), the download
repair, and the plan guard.
"""

import json
import shutil
import sys
from pathlib import Path

import pytest
import typer
from typer.testing import CliRunner

from brain.core.download_manager import DownloadManager
from brain.core.intent import doc_run
from brain.core.intent.staging_manager import StagingManager
from brain.core.intent.validation_manager import ValidationManager
from brain.core.intent_manager import IntentManager

REPO_ROOT = Path(__file__).resolve().parents[3]
VERTICAL = [
    "installer/nucleus/internal/gravity/structural_projection.go",
    "installer/nucleus/internal/gravity/structural_projection_logging.go",
    "installer/nucleus/internal/gravity/structural_projection_logging_test.go",
    "installer/nucleus/internal/gravity/structural_projection_test.go",
]
DOC = "docs/gravity/structural_projection.md"


class _NoIntelligence:
    """Fails the test if anything tries to reach an intelligence client."""

    def __getattr__(self, name):
        raise AssertionError(f"doc D1 must not reach an intelligence client ({name})")


@pytest.fixture(autouse=True)
def no_intelligence(monkeypatch):
    for module in ("google.generativeai", "google.genai",
                   "brain.core.context_planning.gemini_router",
                   "brain.shared.credentials.gemini_manager"):
        monkeypatch.setitem(sys.modules, module, _NoIntelligence())
    yield


@pytest.fixture
def project(tmp_path):
    root = tmp_path / "doc-intent-tests"
    (root / ".bloom").mkdir(parents=True)
    for rel in VERTICAL:
        target = root / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(REPO_ROOT / rel, target)
    return root


def _create(project, name, **kw):
    kw.setdefault("doc_documents", [DOC])
    return IntentManager().create_intent(
        intent_type="doc", name=name, initial_files=VERTICAL,
        nucleus_path=project, **kw)


def _hydrate(project, created):
    return IntentManager().hydrate_intent(
        folder_name=created["folder_name"], briefing="Documentar la proyección estructural",
        nucleus_path=project)


def _state(created):
    return json.loads((Path(created["intent_path"]) / ".doc_state.json").read_text())


def _answer(project, created, tmp_path, body="# Proyección estructural\n\nBorrador.\n", path=DOC):
    response = {
        "bloom_protocol": {"version": "1.0", "pipeline_stage": "context",
                           "completion_status": "complete",
                           "downloaded_at": "2026-11-10T00:00:00+00:00"},
        "metadata": {"model": "persona"},
        "content": {"files": [{"file_ref": "001_doc.md", "path": path,
                               "action": "update", "_bloom_content": body}]},
    }
    resp_file = tmp_path / f"respuesta-{created['folder_name']}.json"
    resp_file.write_text(json.dumps(response))
    manager = DownloadManager(folder_name=created["folder_name"], nucleus_path=project)
    manager.save_response(manager.download_from_file(resp_file))
    return StagingManager(folder_name=created["folder_name"], nucleus_path=project).stage()


def _finalize(project, created):
    return IntentManager().finalize_intent(folder_name=created["folder_name"], nucleus_path=project)


def _first_cycle(project, tmp_path, name="doc gravity 1"):
    created = _create(project, name)
    hyd = _hydrate(project, created)
    assert hyd["doc_run"]["result"] == "pending_response"
    staged = _answer(project, created, tmp_path)
    assert staged["doc_contract"]["status"] == "draft_ready"
    fin = _finalize(project, created)
    return created, staged, fin


def test_gate_a_manual_run_leaves_draft_with_contract(project, tmp_path):
    created = _create(project, "doc gravity a")
    hyd = _hydrate(project, created)
    intent = Path(created["intent_path"])

    assert hyd["doc_run"]["intelligence_calls"] == 0
    assert hyd["doc_run"]["to_sanitize"] == [DOC]
    assert (intent / ".context" / ".files" / ".codebase.json").is_file()
    assert (intent / ".pipeline" / ".context" / ".payload.json").is_file()

    # Pending content blocks finalize (P1 form 3 + P5).
    with pytest.raises(ValueError, match="pendiente de respuesta"):
        _finalize(project, created)

    _answer(project, created, tmp_path)
    contract_file = doc_run.contract_path(intent)
    contract = json.loads(contract_file.read_text())
    assert contract["schema"] == "bloom.doc_contract/1"
    assert contract["trigger"]["kind"] == "manual"
    assert contract["level"] == "project"
    assert contract["verification"] == "verificado contra el filesystem del Project"
    assert contract["model"] == "persona"
    assert contract["pending"] == []
    doc = contract["documents"][0]
    assert doc["path"] == DOC
    assert doc["sha256"].startswith("sha256:")
    assert doc_run.sha256_file(project / doc["draft_ref"]) == doc["sha256"]
    assert {i["path"] for i in contract["inputs"]} == set(VERTICAL)
    assert all(i["sha256"].startswith("sha256:") for i in contract["inputs"])

    report = ValidationManager(folder_name=created["folder_name"], nucleus_path=project).validate()
    assert report["ready_for_finalize"] is True
    assert report["gemini_analysis"]["skipped"] is True

    fin = _finalize(project, created)
    assert fin["doc_finalize"]["basis"] == "contract"
    assert _state(created)["status"] == "completed"
    # The draft is not applied to the Project (DJ-2, DJ-4).
    assert not (project / DOC).exists()


def test_gate_b_second_run_without_changes_is_empty(project, tmp_path):
    first, _, _ = _first_cycle(project, tmp_path)
    base = json.loads(doc_run.contract_path(Path(first["intent_path"])).read_text())

    snapshot = {p: p.stat().st_mtime_ns for p in project.rglob("*") if p.is_file()}
    second = _create(project, "doc gravity 2")
    hyd = _hydrate(project, second)
    assert hyd["doc_run"]["result"] == "empty"
    assert hyd["doc_run"]["intelligence_calls"] == 0
    assert hyd["doc_run"]["request_ref"] is None

    intent2 = Path(second["intent_path"])
    run = json.loads((intent2 / doc_run.RUN_FILE).read_text())
    assert run["observed_inputs"] == base["inputs"]
    assert [d["sha256"] for d in run["baseline_documents"]] == [d["sha256"] for d in base["documents"]]
    assert not (intent2 / ".pipeline" / ".context" / ".payload.json").exists()
    assert not doc_run.contract_path(intent2).exists()
    # Nothing outside the new intent changed.
    for path, mtime in snapshot.items():
        assert path.stat().st_mtime_ns == mtime, path

    fin = _finalize(project, second)
    assert fin["doc_finalize"]["basis"] == "empty_run"
    assert fin["doc_finalize"]["baseline"]["contract_sha256"] == doc_run.sha256_file(
        doc_run.contract_path(Path(first["intent_path"])))


def test_gate_c_change_attributed_to_trigger_is_detected_and_written(project, tmp_path):
    _first_cycle(project, tmp_path)
    changed = VERTICAL[0]
    with open(project / changed, "a", encoding="utf-8") as fh:
        fh.write("\n// cambio del intent disparador\n")

    third = _create(project, "doc gravity 3", trigger_files=[changed])
    hyd = _hydrate(project, third)
    assert hyd["doc_run"]["result"] == "pending_response"
    run = json.loads((Path(third["intent_path"]) / doc_run.RUN_FILE).read_text())
    assert run["changes"][0]["path"] == changed
    assert run["changes"][0]["attribution"] == "trigger"
    assert run["anomalies"] == []

    _answer(project, third, tmp_path, body="# Proyección estructural\n\nActualizado.\n")
    fin = _finalize(project, third)
    assert fin["doc_finalize"]["basis"] == "contract"
    contract = json.loads(doc_run.contract_path(Path(third["intent_path"])).read_text())
    assert next(i for i in contract["inputs"] if i["path"] == changed)["sha256"] == \
        doc_run.sha256_file(project / changed)


def test_external_change_is_anomaly_not_sanitized(project, tmp_path):
    _first_cycle(project, tmp_path)
    with open(project / VERTICAL[1], "a", encoding="utf-8") as fh:
        fh.write("\n// cambio externo\n")

    run_intent = _create(project, "doc gravity externo")
    hyd = _hydrate(project, run_intent)
    assert hyd["doc_run"]["result"] == "anomalies"
    assert hyd["doc_run"]["to_sanitize"] == []
    assert hyd["doc_run"]["anomalies"] == 1
    assert not (Path(run_intent["intent_path"]) / ".pipeline" / ".context" / ".payload.json").exists()
    with pytest.raises(ValueError, match="anomalías"):
        _finalize(project, run_intent)


def test_document_edited_outside_system_is_anomaly(project, tmp_path):
    _first_cycle(project, tmp_path)
    (project / DOC).parent.mkdir(parents=True, exist_ok=True)
    (project / DOC).write_text("editado a mano\n")
    run_intent = _create(project, "doc gravity doc externo")
    hyd = _hydrate(project, run_intent)
    run = json.loads((Path(run_intent["intent_path"]) / doc_run.RUN_FILE).read_text())
    assert hyd["doc_run"]["result"] == "anomalies"
    assert run["anomalies"][0]["change"] == "modificado_fuera_del_sistema"


@pytest.mark.parametrize("level", ["domain", "gene"])
def test_gate_d_domain_and_gene_are_declared_not_verified(project, tmp_path, level):
    created = _create(project, f"doc {level}", doc_level=level, doc_ref=f"{level}-declarado-1")
    hyd = _hydrate(project, created)
    assert hyd["doc_run"]["verification"] == "declarado, no verificado"
    _answer(project, created, tmp_path)
    contract = json.loads(doc_run.contract_path(Path(created["intent_path"])).read_text())
    assert contract["level"] == level
    assert contract["verification"] == "declarado, no verificado"
    assert contract["scope"]["ref"] == f"{level}-declarado-1"


def test_domain_scope_requires_declared_ref(project):
    with pytest.raises(ValueError, match="--doc-ref"):
        _create(project, "doc sin ref", doc_level="domain")


def test_response_outside_pending_documents_is_rejected(project, tmp_path):
    created = _create(project, "doc fuera")
    _hydrate(project, created)
    with pytest.raises(ValueError, match="no está pendiente"):
        _answer(project, created, tmp_path, path="README.md")


def test_inputs_changed_after_comparison_block_contract(project, tmp_path):
    created = _create(project, "doc carrera")
    _hydrate(project, created)
    with open(project / VERTICAL[2], "a", encoding="utf-8") as fh:
        fh.write("\n// cambio entre comparación y respuesta\n")
    with pytest.raises(ValueError, match="insumos cambiaron"):
        _answer(project, created, tmp_path)


def test_tampered_draft_blocks_finalize(project, tmp_path):
    created = _create(project, "doc alterado")
    _hydrate(project, created)
    _answer(project, created, tmp_path)
    contract = json.loads(doc_run.contract_path(Path(created["intent_path"])).read_text())
    (project / contract["documents"][0]["draft_ref"]).write_text("alterado\n")
    with pytest.raises(ValueError, match="no coincide con su digest"):
        _finalize(project, created)


def test_doc_cannot_trigger_doc_and_unfinished_dev_cannot_trigger(project, tmp_path):
    first, _, _ = _first_cycle(project, tmp_path)
    with pytest.raises(ValueError, match="no dispara otro doc"):
        _create(project, "doc de doc", trigger_intent=first["intent_id"])

    dev = IntentManager().create_intent(intent_type="dev", name="dev gravity",
                                        initial_files=VERTICAL[:1], nucleus_path=project)
    with pytest.raises(ValueError, match="DJ-19"):
        _create(project, "doc de dev abierto", trigger_intent=dev["intent_id"])

    IntentManager().finalize_intent(folder_name=dev["folder_name"], nucleus_path=project)
    created = _create(project, "doc de dev", trigger_intent=dev["intent_id"],
                      trigger_files=[VERTICAL[0]])
    state = _state(created)
    assert state["doc_trigger"]["intent_type"] == "dev"
    assert state["doc_trigger"]["changed_paths"] == [VERTICAL[0]]


def test_download_rejects_dev_stages_for_doc(project, tmp_path):
    created = _create(project, "doc etapa")
    _hydrate(project, created)
    manager = DownloadManager(folder_name=created["folder_name"], nucleus_path=project)
    with pytest.raises(ValueError, match="pipeline_stage"):
        manager.validate_protocol({
            "bloom_protocol": {"version": "1.0", "pipeline_stage": "briefing",
                               "completion_status": "complete"},
            "metadata": {}, "content": {}})


def test_download_command_imports_its_manager(project, tmp_path):
    from brain.commands.intent.download import DownloadCommand
    created = _create(project, "doc cli")
    _hydrate(project, created)
    response = {
        "bloom_protocol": {"version": "1.0", "pipeline_stage": "context",
                           "completion_status": "complete"},
        "metadata": {}, "content": {"files": [{"file_ref": "001_doc.md", "path": DOC,
                                               "_bloom_content": "x\n"}]},
    }
    resp = tmp_path / "r.json"
    resp.write_text(json.dumps(response))
    app = typer.Typer()
    DownloadCommand().register(app)
    out = CliRunner().invoke(app, ["--folder", created["folder_name"], "--input-file", str(resp),
                                   "--nucleus-path", str(project)])
    assert out.exit_code == 0, out.output
    assert (Path(created["intent_path"]) / ".pipeline" / ".context" / ".response" / ".files" / "001_doc.md").is_file()


def test_plan_refuses_doc(tmp_path):
    from brain.commands.intent.plan import PlanCommand
    app = typer.Typer()
    PlanCommand().register(app)
    out = CliRunner().invoke(app, ["--intent-dir", str(tmp_path), "--description", "x", "--type", "doc"])
    assert out.exit_code != 0
    assert "does not use plan" in out.output


def test_dev_finalize_is_unchanged(project):
    dev = IntentManager().create_intent(intent_type="dev", name="dev sin cambios",
                                        initial_files=VERTICAL[:1], nucleus_path=project)
    fin = IntentManager().finalize_intent(folder_name=dev["folder_name"], nucleus_path=project)
    assert fin["status"] == "completed"
    assert fin["doc_finalize"] is None


def test_doc_launched_with_only_dev_trigger_uses_baseline(project, tmp_path):
    """What a launcher (Nucleus) needs: create doc with just the finalized dev id."""
    _first_cycle(project, tmp_path)
    changed = VERTICAL[0]
    dev = IntentManager().create_intent(intent_type="dev", name="dev que cambia gravity",
                                        initial_files=[changed], nucleus_path=project)
    manifest = (Path(dev["intent_path"]) / ".pipeline" / ".briefing" / ".response"
                / ".staging" / ".staging_manifest.json")
    manifest.parent.mkdir(parents=True, exist_ok=True)
    manifest.write_text(json.dumps({"files": [{"target_path": changed}]}))
    with open(project / changed, "a", encoding="utf-8") as fh:
        fh.write("\n// aplicado por el dev\n")
    IntentManager().finalize_intent(folder_name=dev["folder_name"], nucleus_path=project)

    created = IntentManager().create_intent(
        intent_type="doc", name="doc del dev", nucleus_path=project,
        trigger_intent=dev["intent_id"])
    assert created["initial_files"] == VERTICAL
    hyd = _hydrate(project, created)
    assert hyd["doc_run"]["result"] == "pending_response"
    assert hyd["doc_run"]["to_sanitize"] == [DOC]
    run = json.loads((Path(created["intent_path"]) / doc_run.RUN_FILE).read_text())
    assert run["trigger"]["intent_id"] == dev["intent_id"]
    assert run["changes"][0]["attribution"] == "trigger"
