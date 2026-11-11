"""
doc interface for a launcher (Nucleus): dis as verified trigger, Project link
through the Nucleus catalog, first doc without baseline, machine-readable
status and persisted errors.
"""

import json
import shutil
from pathlib import Path

import pytest
import typer
from typer.testing import CliRunner

from brain.core.download_manager import DownloadManager
from brain.core.intent import doc_run
from brain.core.intent.staging_manager import StagingManager
from brain.core.intent_manager import IntentManager
from brain.core.intent_state_manager import IntentStateManager

REPO_ROOT = Path(__file__).resolve().parents[3]
VERTICAL = [
    "installer/nucleus/internal/gravity/structural_projection.go",
    "installer/nucleus/internal/gravity/structural_projection_test.go",
]
DOC = "docs/gravity/structural_projection.md"


@pytest.fixture
def org(tmp_path):
    """Org root with a Nucleus and a Project linked in its catalog."""
    project = tmp_path / "proyecto"
    (project / ".bloom").mkdir(parents=True)
    for rel in VERTICAL:
        target = project / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(REPO_ROOT / rel, target)
    nucleus = tmp_path / "org" / ".bloom" / ".nucleus-org"
    (nucleus / ".core").mkdir(parents=True)
    (nucleus / ".intents").mkdir()
    (nucleus / ".core" / ".nucleus-config.json").write_text(json.dumps({
        "projects": [{"id": "proj-1", "name": "proyecto", "absolutePath": str(project)}]
    }))
    return {"project": project, "nucleus": nucleus}


def _dis(nucleus, name="dis-1", done=True, committed=True):
    root = nucleus / ".intents" / ".dis" / f".{name}"
    mgr = IntentStateManager.create(root, "dis", "MND-1")
    state_file = root / ".dis_state.json"
    state = json.loads(state_file.read_text())
    if done:
        state["phase_active"] = "done"
        state_file.write_text(json.dumps(state))
    turn = root / ".ratification" / ".turn_1"
    turn.mkdir(parents=True, exist_ok=True)
    (turn / ".ratification.json").write_text(json.dumps({"committed": committed}))
    return mgr.intent_id


def _create(project, name, **kw):
    return IntentManager().create_intent(intent_type="doc", name=name,
                                         nucleus_path=project, **kw)


def _hydrate(project, created):
    return IntentManager().hydrate_intent(folder_name=created["folder_name"],
                                          nucleus_path=project)


def _first_doc(org, name="primer doc"):
    created = _create(org["project"], name, initial_files=VERTICAL, doc_documents=[DOC])
    _hydrate(org["project"], created)
    resp = org["project"].parent / f"{created['folder_name']}.json"
    resp.write_text(json.dumps({
        "bloom_protocol": {"version": "1.0", "pipeline_stage": "context", "completion_status": "complete"},
        "metadata": {},
        "content": {"files": [{"file_ref": "001.md", "path": DOC, "_bloom_content": "# Doc\n"}]},
    }))
    dm = DownloadManager(folder_name=created["folder_name"], nucleus_path=org["project"])
    dm.save_response(dm.download_from_file(resp))
    StagingManager(folder_name=created["folder_name"], nucleus_path=org["project"]).stage()
    return IntentManager().finalize_intent(folder_name=created["folder_name"], nucleus_path=org["project"])


def test_dis_terminal_with_linked_project_is_a_valid_trigger(org):
    dis_id = _dis(org["nucleus"])
    created = _create(org["project"], "doc del dis", initial_files=VERTICAL, doc_documents=[DOC],
                      trigger_intent=dis_id, trigger_nucleus=org["nucleus"])
    state = json.loads((Path(created["intent_path"]) / ".doc_state.json").read_text())
    trigger = state["doc_trigger"]
    assert trigger["intent_type"] == "dis"
    assert trigger["mandate_id"] == "MND-1"
    assert trigger["terminal"]["control_ref"] == ".ratification/.turn_1/.ratification.json"
    assert trigger["terminal"]["control_sha256"].startswith("sha256:")
    assert trigger["nucleus"]["project_id"] == "proj-1"
    assert trigger["nucleus"]["catalog_sha256"].startswith("sha256:")
    assert trigger["changed_paths"] == []
    assert created["doc"]["doc_status"] == "created"
    assert created["doc"]["next_action"] == "hydrate"


def test_dis_after_baseline_with_unchanged_project_is_empty(org):
    _first_doc(org)
    dis_id = _dis(org["nucleus"])
    created = _create(org["project"], "doc del dis 2", trigger_intent=dis_id,
                      trigger_nucleus=org["nucleus"])
    hyd = _hydrate(org["project"], created)
    assert hyd["doc_run"]["result"] == "empty"
    assert hyd["doc"]["doc_status"] == "empty"
    assert hyd["doc"]["next_action"] == "finalize"
    fin = IntentManager().finalize_intent(folder_name=created["folder_name"], nucleus_path=org["project"])
    assert fin["doc"]["doc_status"] == "completed"
    assert fin["doc"]["next_action"] == "none"


def test_dis_not_done_is_rejected(org):
    dis_id = _dis(org["nucleus"], done=False)
    with pytest.raises(doc_run.DocRunError) as exc:
        _create(org["project"], "doc dis abierto", initial_files=VERTICAL, doc_documents=[DOC],
                trigger_intent=dis_id, trigger_nucleus=org["nucleus"])
    assert exc.value.code == "DOC_TRIGGER_NOT_TERMINAL"


def test_dis_done_without_committed_control_is_rejected(org):
    dis_id = _dis(org["nucleus"], committed=False)
    with pytest.raises(doc_run.DocRunError) as exc:
        _create(org["project"], "doc dis sin commit", initial_files=VERTICAL, doc_documents=[DOC],
                trigger_intent=dis_id, trigger_nucleus=org["nucleus"])
    assert exc.value.code == "DOC_TRIGGER_NOT_TERMINAL"


def test_dis_requires_project_linked_in_nucleus_catalog(org):
    (org["nucleus"] / ".core" / ".nucleus-config.json").write_text(json.dumps({"projects": []}))
    dis_id = _dis(org["nucleus"])
    with pytest.raises(doc_run.DocRunError) as exc:
        _create(org["project"], "doc dis sin vinculo", initial_files=VERTICAL, doc_documents=[DOC],
                trigger_intent=dis_id, trigger_nucleus=org["nucleus"])
    assert exc.value.code == "DOC_PROJECT_NOT_LINKED"


def test_project_link_resolves_local_path_against_nucleus_root(org):
    rel = Path("..") / ".." / ".." / "proyecto"
    (org["nucleus"] / ".core" / ".nucleus-config.json").write_text(json.dumps({
        "projects": [{"id": "proj-local", "localPath": str(rel)}]}))
    link = doc_run.verify_project_link(org["nucleus"], org["project"])
    assert link["project_id"] == "proj-local"


def test_dis_without_nucleus_is_not_found(org):
    dis_id = _dis(org["nucleus"])
    with pytest.raises(doc_run.DocRunError) as exc:
        _create(org["project"], "doc dis sin nucleus", initial_files=VERTICAL, doc_documents=[DOC],
                trigger_intent=dis_id)
    assert exc.value.code == "DOC_TRIGGER_NOT_FOUND"


def test_exp_does_not_trigger_doc(org):
    exp_dir = org["project"] / ".bloom" / ".intents" / ".exp" / ".exp-1"
    exp_dir.mkdir(parents=True)
    (exp_dir / ".exp_state.json").write_text(json.dumps({"intent_id": "exp-1", "intent_type": "exp"}))
    with pytest.raises(doc_run.DocRunError) as exc:
        _create(org["project"], "doc de exp", initial_files=VERTICAL, doc_documents=[DOC],
                trigger_intent="exp-1")
    assert exc.value.code == "DOC_TRIGGER_NOT_ALLOWED"


@pytest.mark.parametrize("kw", [
    {},
    {"initial_files": VERTICAL},
    {"doc_documents": [DOC]},
])
def test_first_doc_without_baseline_needs_explicit_inputs_and_documents(org, kw):
    with pytest.raises(doc_run.DocRunError) as exc:
        _create(org["project"], "doc sin base", **kw)
    assert exc.value.code == "DOC_BASELINE_MISSING"


def test_first_doc_with_explicit_inputs_has_no_baseline(org):
    created = _create(org["project"], "doc inicial", initial_files=VERTICAL, doc_documents=[DOC])
    state = json.loads((Path(created["intent_path"]) / ".doc_state.json").read_text())
    assert state["doc_baseline"] is None
    hyd = _hydrate(org["project"], created)
    assert hyd["doc"]["doc_status"] == "pending_response"
    assert hyd["doc"]["next_action"] == "respond"


def test_failure_is_persisted_and_cleared_on_resume(org):
    created = _create(org["project"], "doc con fallo", initial_files=VERTICAL, doc_documents=[DOC])
    _hydrate(org["project"], created)
    resp = org["project"].parent / "fuera.json"
    resp.write_text(json.dumps({
        "bloom_protocol": {"version": "1.0", "pipeline_stage": "context", "completion_status": "complete"},
        "metadata": {},
        "content": {"files": [{"file_ref": "001.md", "path": "README.md", "_bloom_content": "x"}]},
    }))
    dm = DownloadManager(folder_name=created["folder_name"], nucleus_path=org["project"])
    dm.save_response(dm.download_from_file(resp))
    with pytest.raises(doc_run.DocRunError):
        StagingManager(folder_name=created["folder_name"], nucleus_path=org["project"]).stage()

    state_file = Path(created["intent_path"]) / ".doc_state.json"
    state = json.loads(state_file.read_text())
    assert state["status"] == "pending_response"
    assert state["doc_error"]["operation"] == "stage"
    assert state["doc_error"]["code"] == "DOC_RESPONSE_OUT_OF_SCOPE"
    view = doc_run.status_view(state)
    assert view["doc_status"] == "error" and view["next_action"] == "resume"

    resumed = _create(org["project"], "doc con fallo")
    assert resumed["resumed"] is True
    assert resumed["doc"]["doc_status"] == "error"

    hyd = _hydrate(org["project"], resumed)
    assert hyd["doc"]["doc_status"] == "pending_response"
    assert "doc_error" not in json.loads(state_file.read_text())


def test_finalize_failure_is_persisted_with_code(org):
    created = _create(org["project"], "doc sin respuesta", initial_files=VERTICAL, doc_documents=[DOC])
    _hydrate(org["project"], created)
    with pytest.raises(doc_run.DocRunError) as exc:
        IntentManager().finalize_intent(folder_name=created["folder_name"], nucleus_path=org["project"])
    assert exc.value.code == "DOC_FINALIZE_BLOCKED"
    state = json.loads((Path(created["intent_path"]) / ".doc_state.json").read_text())
    assert state["doc_error"]["code"] == "DOC_FINALIZE_BLOCKED"


def test_cli_json_error_carries_code(org):
    from brain.commands.intent.create import CreateCommand
    from brain.shared.context import GlobalContext

    app = typer.Typer()

    @app.callback()
    def main(ctx: typer.Context):
        ctx.obj = GlobalContext(json_mode=True)

    CreateCommand().register(app)
    out = CliRunner().invoke(app, ["create", "-t", "doc", "-n", "doc cli", "-p", str(org["project"])])
    payload = json.loads(out.output.strip().splitlines()[-1])
    assert payload["status"] == "error"
    assert payload["error"]["code"] == "DOC_BASELINE_MISSING"
