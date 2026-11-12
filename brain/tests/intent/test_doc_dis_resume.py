"""
A launcher (Nucleus) invokes and resumes an independent doc after a verified
terminal dis, using only the delivered interface (states and error codes).
Brain never launches an intent by itself.
"""

import json
import shutil
from pathlib import Path

import pytest

from brain.core.download_manager import DownloadManager
from brain.core.intent import doc_registry, doc_run
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
    project = tmp_path / "proyecto"
    (project / ".bloom").mkdir(parents=True)
    for rel in VERTICAL:
        target = project / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(REPO_ROOT / rel, target)
    nucleus = tmp_path / "org" / ".bloom" / ".nucleus-org"
    (nucleus / ".core").mkdir(parents=True)
    (nucleus / ".intents").mkdir()
    (nucleus / ".core" / ".nucleus-config.json").write_text(json.dumps(
        {"projects": [{"id": "proj-1", "absolutePath": str(project)}]}))
    return {"project": project, "nucleus": nucleus}


def _dis(nucleus, name="dis-1"):
    root = nucleus / ".intents" / ".dis" / f".{name}"
    mgr = IntentStateManager.create(root, "dis", "MND-1")
    state_file = root / ".dis_state.json"
    state = json.loads(state_file.read_text())
    state["phase_active"] = "done"
    state_file.write_text(json.dumps(state))
    turn = root / ".ratification" / ".turn_1"
    turn.mkdir(parents=True)
    (turn / ".ratification.json").write_text(json.dumps({"committed": True}))
    return mgr.intent_id, root


def _launch(org, dis_id, name="doc tras dis", **kw):
    """What Nucleus runs: create (or resume) the doc for this dis."""
    return IntentManager().create_intent(intent_type="doc", name=name, nucleus_path=org["project"],
                                         trigger_intent=dis_id, trigger_nucleus=org["nucleus"], **kw)


def _get(org, created):
    return IntentManager().get_intent(folder_name=created["folder_name"], nucleus_path=org["project"])


def _hydrate(org, created):
    return IntentManager().hydrate_intent(folder_name=created["folder_name"], nucleus_path=org["project"])


def _respond(org, created, path=DOC):
    resp = org["project"].parent / f"{created['folder_name']}-{path.replace('/', '_')}.json"
    resp.write_text(json.dumps({
        "bloom_protocol": {"version": "1.0", "pipeline_stage": "context", "completion_status": "complete"},
        "metadata": {}, "content": {"files": [{"file_ref": "001.md", "path": path, "_bloom_content": "# Doc\n"}]}}))
    dm = DownloadManager(folder_name=created["folder_name"], nucleus_path=org["project"])
    dm.save_response(dm.download_from_file(resp))
    return StagingManager(folder_name=created["folder_name"], nucleus_path=org["project"]).stage()


def _finalize(org, created):
    return IntentManager().finalize_intent(folder_name=created["folder_name"], nucleus_path=org["project"])


def test_full_cycle_with_failure_and_resume_after_dis(org):
    dis_id, _ = _dis(org["nucleus"])
    created = _launch(org, dis_id, initial_files=VERTICAL, doc_documents=[DOC])
    assert created["doc"] == {**created["doc"], "doc_status": "created", "next_action": "hydrate"}

    assert _hydrate(org, created)["doc"]["next_action"] == "respond"
    with pytest.raises(doc_run.DocRunError) as exc:
        _respond(org, created, path="README.md")
    assert exc.value.code == "DOC_RESPONSE_OUT_OF_SCOPE"

    # Nucleus polls the state read-only.
    state_file = Path(created["intent_path"]) / ".doc_state.json"
    before = state_file.read_bytes()
    got = _get(org, created)
    assert got["doc"]["doc_status"] == "error" and got["doc"]["next_action"] == "resume"
    assert got["doc"]["error"]["code"] == "DOC_RESPONSE_OUT_OF_SCOPE"
    assert state_file.read_bytes() == before

    # Resume: same name and same dis.
    resumed = _launch(org, dis_id)
    assert resumed["resumed"] is True and resumed["doc"]["doc_status"] == "error"
    _respond(org, resumed)
    assert _get(org, resumed)["doc"]["doc_status"] == "draft_ready"
    fin = _finalize(org, resumed)
    assert fin["doc"]["doc_status"] == "completed"
    assert fin["doc_finalize"]["registry"]["applied"] is True
    assert list(doc_registry.active_by_path(doc_registry.load(org["project"]))) == [DOC]


def test_resume_with_other_trigger_is_rejected(org):
    dis_a, _ = _dis(org["nucleus"], "dis-a")
    dis_b, _ = _dis(org["nucleus"], "dis-b")
    _launch(org, dis_a, initial_files=VERTICAL, doc_documents=[DOC])
    with pytest.raises(doc_run.DocRunError) as exc:
        _launch(org, dis_b)
    assert exc.value.code == "DOC_RESUME_MISMATCH"


def test_completed_doc_is_not_reopened_and_finalize_is_idempotent(org):
    dis_id, _ = _dis(org["nucleus"])
    created = _launch(org, dis_id, initial_files=VERTICAL, doc_documents=[DOC])
    _hydrate(org, created)
    _respond(org, created)
    first = _finalize(org, created)
    registry_before = doc_registry.registry_path(org["project"]).read_bytes()

    resumed = _launch(org, dis_id)
    assert resumed["doc"]["doc_status"] == "completed" and resumed["doc"]["next_action"] == "none"
    for reopen in (lambda: _hydrate(org, resumed), lambda: _respond(org, resumed)):
        with pytest.raises(doc_run.DocRunError) as exc:
            reopen()
        assert exc.value.code == "DOC_ALREADY_COMPLETED"
    again = _finalize(org, resumed)
    assert again["already_finalized"] is True
    assert again["doc_finalize"] == first["doc_finalize"]
    assert doc_registry.registry_path(org["project"]).read_bytes() == registry_before


def test_finalize_resumes_after_cut_between_registry_and_state(org):
    """Registry committed, state not written (crash): finalize again succeeds once."""
    dis_id, _ = _dis(org["nucleus"])
    created = _launch(org, dis_id, initial_files=VERTICAL, doc_documents=[DOC])
    _hydrate(org, created)
    _respond(org, created)
    state = json.loads((Path(created["intent_path"]) / ".doc_state.json").read_text())
    contract = json.loads(doc_run.contract_path(Path(created["intent_path"])).read_text())
    doc_registry.commit_contract(org["project"], contract, state["doc_contract"]["sha256"], state["uuid"])
    generation = doc_registry.load(org["project"])["generation"]

    fin = _finalize(org, created)
    assert fin["doc"]["doc_status"] == "completed"
    assert fin["doc_finalize"]["registry"]["applied"] is False
    assert doc_registry.load(org["project"])["generation"] == generation


def test_changed_dis_control_blocks_hydrate_and_is_recorded(org):
    dis_id, root = _dis(org["nucleus"])
    created = _launch(org, dis_id, initial_files=VERTICAL, doc_documents=[DOC])
    (root / ".ratification" / ".turn_1" / ".ratification.json").write_text(
        json.dumps({"committed": True, "edited": True}))
    with pytest.raises(doc_run.DocRunError) as exc:
        _hydrate(org, created)
    assert exc.value.code == "DOC_TRIGGER_EVIDENCE_CHANGED"
    assert _get(org, created)["doc"]["error"]["code"] == "DOC_TRIGGER_EVIDENCE_CHANGED"


def test_unlinked_project_blocks_hydrate_on_resume(org):
    dis_id, _ = _dis(org["nucleus"])
    created = _launch(org, dis_id, initial_files=VERTICAL, doc_documents=[DOC])
    (org["nucleus"] / ".core" / ".nucleus-config.json").write_text(json.dumps({"projects": []}))
    with pytest.raises(doc_run.DocRunError) as exc:
        _hydrate(org, created)
    assert exc.value.code == "DOC_PROJECT_NOT_LINKED"
    assert _get(org, created)["doc"]["doc_status"] == "error"


def test_brain_does_not_launch_intents(org):
    """Finalizing the doc creates no other intent; the dis is untouched."""
    dis_id, root = _dis(org["nucleus"])
    dis_state = (root / ".dis_state.json").read_bytes()
    created = _launch(org, dis_id, initial_files=VERTICAL, doc_documents=[DOC])
    _hydrate(org, created)
    _respond(org, created)
    _finalize(org, created)
    intents = [p for p in (org["project"] / ".bloom" / ".intents").glob(".*/.*") if p.is_dir()]
    assert [p.name for p in intents] == [created["folder_name"]]
    assert list((org["nucleus"] / ".intents").glob(".*/.*")) == [root]
    assert (root / ".dis_state.json").read_bytes() == dis_state


def test_stage_returns_doc_view_at_top_level(org):
    dis_id, _ = _dis(org["nucleus"])
    created = _launch(org, dis_id, initial_files=VERTICAL, doc_documents=[DOC])
    _hydrate(org, created)
    staged = _respond(org, created)
    assert staged["doc"]["doc_status"] == "draft_ready"
    assert staged["doc"] == staged["doc_contract"]["doc"]
