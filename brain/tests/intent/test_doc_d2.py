"""
Stage D2 of the doc intent: governed document registry
(Encargo_Doc_Intent_Actualizacion_Viva_v1_0.md §7).

Gate:
  (a) a move made by the system keeps the identity;
  (b) a move made by hand becomes an anomaly;
  (c) nothing is written under .genes/.
"""

import json
import shutil
from pathlib import Path

import pytest

from brain.core.download_manager import DownloadManager
from brain.core.intent import doc_registry, doc_run
from brain.core.intent.staging_manager import StagingManager
from brain.core.intent_manager import IntentManager

REPO_ROOT = Path(__file__).resolve().parents[3]
VERTICAL = [
    "installer/nucleus/internal/gravity/structural_projection.go",
    "installer/nucleus/internal/gravity/structural_projection_test.go",
]
DOC = "docs/gravity/structural_projection.md"
NEW = "docs/gravity/proyeccion.md"


@pytest.fixture
def project(tmp_path):
    root = tmp_path / "proyecto"
    (root / ".bloom").mkdir(parents=True)
    for rel in VERTICAL:
        target = root / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(REPO_ROOT / rel, target)
    return root


def _create(project, name, **kw):
    return IntentManager().create_intent(intent_type="doc", name=name, nucleus_path=project, **kw)


def _hydrate(project, created):
    return IntentManager().hydrate_intent(folder_name=created["folder_name"], nucleus_path=project)


def _respond(project, created, files):
    resp = project.parent / f"{created['folder_name']}.json"
    resp.write_text(json.dumps({
        "bloom_protocol": {"version": "1.0", "pipeline_stage": "context", "completion_status": "complete"},
        "metadata": {}, "content": {"files": files}}))
    dm = DownloadManager(folder_name=created["folder_name"], nucleus_path=project)
    dm.save_response(dm.download_from_file(resp))
    return StagingManager(folder_name=created["folder_name"], nucleus_path=project).stage()


def _finalize(project, created, **kw):
    return IntentManager().finalize_intent(folder_name=created["folder_name"], nucleus_path=project, **kw)


def _first(project):
    created = _create(project, "doc base", initial_files=VERTICAL, doc_documents=[DOC])
    _hydrate(project, created)
    _respond(project, created, [{"file_ref": "001.md", "path": DOC, "_bloom_content": "# Doc\n"}])
    _finalize(project, created)
    reg = doc_registry.load(project)
    (doc_id, entry), = reg["documents"].items()
    return doc_id, entry


def _persist(project, doc_id):
    """Simulates the external persister (DJ-4): copy the registered draft to its path."""
    reg = doc_registry.load(project)
    entry = reg["documents"][doc_id]
    contract_docs = []
    for intent_dir in (project / ".bloom" / ".intents" / ".doc").iterdir():
        cpath = doc_run.contract_path(intent_dir)
        if cpath.is_file():
            contract_docs += json.loads(cpath.read_text())["documents"]
    draft = next(d for d in contract_docs if d.get("doc_id") == doc_id and d["sha256"] == entry["sha256"])
    target = project / entry["path"]
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(project / draft["draft_ref"], target)


def test_first_finalize_registers_document_with_identity(project):
    doc_id, entry = _first(project)
    assert doc_id.startswith("doc-")
    assert entry["path"] == DOC and entry["status"] == "active"
    assert entry["scope"] == "project:"
    assert entry["history"][0]["event"] == "registered"
    assert entry["project_sha256"] is None  # draft not persisted (DJ-4)
    raw = doc_registry.registry_path(project).read_text()
    assert raw == json.dumps(json.loads(raw), sort_keys=True, ensure_ascii=False, indent=2) + "\n"


def test_gate_a_system_move_keeps_identity(project):
    doc_id, _ = _first(project)
    created = _create(project, "doc mueve", trigger_files=[DOC])
    hyd = _hydrate(project, created)
    assert hyd["doc_run"]["to_sanitize"] == [DOC]
    staged = _respond(project, created, [{"file_ref": "002.md", "action": "move", "from": DOC,
                                          "path": NEW, "_bloom_content": "# Doc movido\n"}])
    assert staged["doc_contract"]["status"] == "draft_ready"
    contract = json.loads(doc_run.contract_path(Path(created["intent_path"])).read_text())
    assert contract["documents"] == [d for d in contract["documents"] if d["path"] == NEW]
    assert contract["documents"][0]["doc_id"] == doc_id
    assert contract["documents"][0]["moved_from"] == DOC

    fin = _finalize(project, created)
    assert fin["doc_finalize"]["registry"]["applied"] is True
    reg = doc_registry.load(project)
    assert list(reg["documents"]) == [doc_id]
    entry = reg["documents"][doc_id]
    assert entry["path"] == NEW
    assert [e["event"] for e in entry["history"]] == ["registered", "moved", "updated"]
    assert entry["history"][1]["from_path"] == DOC

    after = _create(project, "doc despues de mover")
    assert _hydrate(project, after)["doc_run"]["result"] == "empty"


def test_gate_b_hand_move_is_an_anomaly_and_identity_is_not_transferred(project):
    doc_id, _ = _first(project)
    _persist(project, doc_id)
    observed = _create(project, "doc observa")
    assert _hydrate(project, observed)["doc_run"]["result"] == "empty"
    assert _finalize(project, observed)["doc_finalize"]["registry"]["applied"] is True
    assert doc_registry.load(project)["documents"][doc_id]["project_sha256"] is not None

    (project / NEW).parent.mkdir(parents=True, exist_ok=True)
    (project / DOC).rename(project / NEW)

    run_intent = _create(project, "doc ve el movimiento")
    hyd = _hydrate(project, run_intent)
    assert hyd["doc_run"]["result"] == "anomalies"
    run = json.loads((Path(run_intent["intent_path"]) / doc_run.RUN_FILE).read_text())
    anomaly, = run["anomalies"]
    assert anomaly["change"] == "faltante_fuera_del_sistema"
    assert anomaly["doc_id"] == doc_id
    assert NEW not in run["registered_documents"]  # never matched by similarity

    with pytest.raises(doc_run.DocRunError):
        _finalize(project, run_intent)
    again = _create(project, "doc ve el movimiento 2")
    assert _hydrate(project, again)["doc_run"]["result"] == "anomalies"  # persists until declared

    fin = _finalize(project, again, declare_anomalies=True)
    assert fin["doc_finalize"]["registry"]["applied"] is True
    entry = doc_registry.load(project)["documents"][doc_id]
    assert entry["status"] == "retired"
    assert entry["history"][-1]["event"] == "retired_declared"
    assert doc_registry.active_by_path(doc_registry.load(project)) == {}


def test_gate_c_nothing_is_written_under_genes(project):
    doc_id, _ = _first(project)
    created = _create(project, "doc mueve sin genes", trigger_files=[DOC])
    _hydrate(project, created)
    _respond(project, created, [{"file_ref": "002.md", "action": "move", "from": DOC,
                                 "path": NEW, "_bloom_content": "# Doc\n"}])
    _finalize(project, created)
    doc_registry.link_gene(project, doc_id, "gene-1", "sha256:abc")
    assert not [p for p in project.parent.rglob("*") if ".genes" in p.parts]


def test_gene_link_does_not_replace_identity(project):
    doc_id, entry = _first(project)
    linked = doc_registry.link_gene(project, doc_id, "gene-1", "sha256:abc", intent_id="x")
    assert linked["doc_id"] == doc_id and linked["path"] == entry["path"]
    assert linked["gene_links"][0]["gene_id"] == "gene-1"
    generation = doc_registry.load(project)["generation"]
    doc_registry.link_gene(project, doc_id, "gene-1", "sha256:abc")
    assert doc_registry.load(project)["generation"] == generation  # idempotent


def test_concurrent_finalize_conflict_is_reported_and_resumable(project):
    _first(project)
    a = _create(project, "doc a", trigger_files=[DOC])
    b = _create(project, "doc b", trigger_files=[DOC])
    _hydrate(project, a)
    _hydrate(project, b)
    _respond(project, a, [{"file_ref": "a.md", "path": DOC, "_bloom_content": "# A\n"}])
    _respond(project, b, [{"file_ref": "b.md", "path": DOC, "_bloom_content": "# B\n"}])
    _finalize(project, a)
    with pytest.raises(doc_run.DocRunError) as exc:
        _finalize(project, b)
    assert exc.value.code == "DOC_REGISTRY_CONFLICT"
    state = json.loads((Path(b["intent_path"]) / ".doc_state.json").read_text())
    assert state["doc_error"]["code"] == "DOC_REGISTRY_CONFLICT"
    assert doc_run.status_view(state)["next_action"] == "resume"

    resumed = _create(project, "doc b")
    assert resumed["resumed"] is True
    _hydrate(project, resumed)
    _respond(project, resumed, [{"file_ref": "b2.md", "path": DOC, "_bloom_content": "# B\n"}])
    assert _finalize(project, resumed)["doc"]["doc_status"] == "completed"


@pytest.mark.parametrize("move", [
    {"from": "docs/no-registrado.md", "path": NEW},
    {"from": DOC, "path": DOC},
])
def test_invalid_moves_are_rejected(project, move):
    _first(project)
    created = _create(project, "doc mueve mal", trigger_files=[DOC])
    _hydrate(project, created)
    with pytest.raises(doc_run.DocRunError) as exc:
        _respond(project, created, [{"file_ref": "m.md", "action": "move", "_bloom_content": "x", **move}])
    assert exc.value.code == "DOC_MOVE_INVALID"


def test_commit_is_idempotent_per_contract(project):
    _first(project)
    created = _create(project, "doc idem", trigger_files=[DOC])
    _hydrate(project, created)
    _respond(project, created, [{"file_ref": "i.md", "path": DOC, "_bloom_content": "# I\n"}])
    _finalize(project, created)
    state = json.loads((Path(created["intent_path"]) / ".doc_state.json").read_text())
    contract = json.loads(doc_run.contract_path(Path(created["intent_path"])).read_text())
    again = doc_registry.commit_contract(project, contract, state["doc_contract"]["sha256"], state["uuid"])
    assert again["applied"] is False
