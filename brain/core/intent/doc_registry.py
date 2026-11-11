"""
Governed document registry of a Project (stage D2 of
``docs/ANALYSIS/BSIP/DOC/Encargo_Doc_Intent_Actualizacion_Viva_v1_0.md``).

Decisions applied (José, 2026-11-11):

- P28: the registry lives in Brain, per Project: ``<project>/.bloom/.doc_registry.json``.
- P29: it travels with the repository. The file is deterministic JSON (sorted
  keys, stable layout) so it versions cleanly. The lock file
  ``.doc_registry.lock`` is local and should not be versioned.
- P27: only the ``doc`` intent moves documents. Anything else that moves or
  deletes a registered document produces an anomaly.
- P31: ``dev`` does not move registered documents.
- P30: a document's identity is its ``doc_id`` in this registry, also after
  Genes are published. A Gene is linked to the document (``gene_links``); it
  never replaces the identity.

DJ-13: the digest is integrity evidence, never identity. DJ-16: a move made
outside the system is never resolved by similarity.

This module never writes under ``.genes/``.
"""

from __future__ import annotations

import json
import os
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional, Tuple

from brain.core.intent.doc_run import DocRunError, now_iso, sha256_bytes, sha256_file
from brain.shared.logger import get_logger

logger = get_logger(__name__)

REGISTRY_FILE = ".doc_registry.json"
LOCK_FILE = ".doc_registry.lock"
SCHEMA = "bloom.doc_registry/1"
MAX_APPLIED = 200


def registry_path(project_root: Path) -> Path:
    return project_root / ".bloom" / REGISTRY_FILE


def new_doc_id() -> str:
    return "doc-" + uuid.uuid4().hex


def _empty() -> Dict[str, Any]:
    return {"schema": SCHEMA, "generation": 0, "documents": {}, "applied_contracts": []}


def load(project_root: Path) -> Dict[str, Any]:
    path = registry_path(project_root)
    if not path.is_file():
        return _empty()
    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, json.JSONDecodeError) as exc:
        raise DocRunError(f"no se pudo leer el registro documental {path}: {exc}", "DOC_REGISTRY_INVALID")
    if data.get("schema") != SCHEMA or not isinstance(data.get("documents"), dict):
        raise DocRunError(f"el registro documental {path} no tiene el formato esperado", "DOC_REGISTRY_INVALID")
    data.setdefault("applied_contracts", [])
    return data


def snapshot(project_root: Path) -> Dict[str, Any]:
    reg = load(project_root)
    return {"ref": f".bloom/{REGISTRY_FILE}", "generation": reg["generation"],
            "sha256": sha256_file(registry_path(project_root))}


def active_by_path(reg: Dict[str, Any], scope_key: Optional[str] = None) -> Dict[str, Tuple[str, Dict[str, Any]]]:
    out: Dict[str, Tuple[str, Dict[str, Any]]] = {}
    for doc_id, entry in reg["documents"].items():
        if entry.get("status") != "active":
            continue
        if scope_key is not None and entry.get("scope") != scope_key:
            continue
        out[entry["path"]] = (doc_id, entry)
    return out


def _write(project_root: Path, reg: Dict[str, Any]) -> str:
    path = registry_path(project_root)
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = (json.dumps(reg, sort_keys=True, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    tmp = path.with_name(path.name + ".tmp")
    with open(tmp, "wb") as fh:
        fh.write(raw)
        fh.flush()
        os.fsync(fh.fileno())
    os.replace(tmp, path)
    return sha256_bytes(raw)


@contextmanager
def _locked(project_root: Path) -> Iterator[None]:
    lock_path = project_root / ".bloom" / LOCK_FILE
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with open(lock_path, "a+b") as fh:
        if os.name == "nt":  # pragma: no cover - exercised on Windows
            import msvcrt
            fh.seek(0)
            msvcrt.locking(fh.fileno(), msvcrt.LK_LOCK, 1)
            try:
                yield
            finally:
                fh.seek(0)
                msvcrt.locking(fh.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl
            fcntl.flock(fh.fileno(), fcntl.LOCK_EX)
            try:
                yield
            finally:
                fcntl.flock(fh.fileno(), fcntl.LOCK_UN)


def _event(kind: str, intent_id: Optional[str], **extra: Any) -> Dict[str, Any]:
    return {"event": kind, "intent_id": intent_id, "at": now_iso(), **extra}


def commit_contract(
    project_root: Path,
    contract: Dict[str, Any],
    contract_sha256: str,
    intent_id: Optional[str],
) -> Dict[str, Any]:
    """
    Apply a finalized contract to the registry: register new documents, apply
    moves made by doc, update digests and retire documents whose removal was
    declared. Idempotent per contract digest. Refuses if the registry changed
    since the comparison (another doc finalized in between).
    """
    with _locked(project_root):
        reg = load(project_root)
        if contract_sha256 in reg["applied_contracts"]:
            return {"generation": reg["generation"], "sha256": sha256_file(registry_path(project_root)),
                    "applied": False}
        expected = (contract.get("registry") or {}).get("generation", 0)
        if reg["generation"] != expected:
            raise DocRunError(
                f"el registro documental cambió desde la comparación (generación {expected} → "
                f"{reg['generation']}); volvé a hidratar este doc",
                "DOC_REGISTRY_CONFLICT",
            )
        scope_key = f"{contract['scope']['level']}:{contract['scope'].get('ref') or ''}"
        unresolved_missing = {
            a.get("doc_id") for a in contract.get("anomalies", [])
            if a.get("change") == "faltante_fuera_del_sistema" and not contract.get("declared_anomalies")
        }
        occupied = active_by_path(reg)
        for doc in contract.get("documents", []):
            doc_id = doc["doc_id"]
            entry = reg["documents"].get(doc_id)
            holder = occupied.get(doc["path"])
            if holder and holder[0] != doc_id:
                raise DocRunError(f"la ruta {doc['path']} ya pertenece a {holder[0]}", "DOC_REGISTRY_CONFLICT")
            on_disk = sha256_file(project_root / doc["path"])
            if entry is None:
                entry = {
                    "doc_id": doc_id, "path": doc["path"], "scope": scope_key, "status": "active",
                    "sha256": doc["sha256"], "project_sha256": on_disk if on_disk == doc["sha256"] else None,
                    "registered_at": now_iso(), "updated_at": now_iso(), "last_intent": intent_id,
                    "history": [_event("registered", intent_id, path=doc["path"], sha256=doc["sha256"])],
                    "gene_links": [],
                }
                reg["documents"][doc_id] = entry
                continue
            if entry["path"] != doc["path"]:
                if doc.get("moved_from") != entry["path"]:
                    raise DocRunError(
                        f"{doc_id} cambia de ruta sin un movimiento hecho por doc", "DOC_REGISTRY_CONFLICT")
                entry["history"].append(_event("moved", intent_id, path=doc["path"], from_path=entry["path"]))
                entry["path"] = doc["path"]
                entry["project_sha256"] = None
            if entry["sha256"] != doc["sha256"]:
                entry["history"].append(_event("updated", intent_id, sha256=doc["sha256"]))
                entry["sha256"] = doc["sha256"]
            if doc_id not in unresolved_missing:
                # Presence is recorded only for an exact copy of the registered
                # content. An undeclared missing document keeps its previous
                # presence so the anomaly is reported again until declared.
                entry["project_sha256"] = on_disk if on_disk == doc["sha256"] else None
            entry["updated_at"] = now_iso()
            entry["last_intent"] = intent_id
        for retired in contract.get("retired", []):
            entry = reg["documents"].get(retired["doc_id"])
            if entry and entry.get("status") == "active":
                entry["status"] = "retired"
                entry["history"].append(_event("retired_declared", intent_id, path=entry["path"],
                                               reason=retired.get("reason")))
                entry["updated_at"] = now_iso()
        reg["generation"] += 1
        reg["applied_contracts"] = (reg["applied_contracts"] + [contract_sha256])[-MAX_APPLIED:]
        sha = _write(project_root, reg)
    logger.info("doc registry commit intent=%s generation=%d documents=%d",
                intent_id, reg["generation"], len(contract.get("documents", [])))
    return {"generation": reg["generation"], "sha256": sha, "applied": True}


def observe_presence(project_root: Path, run: Dict[str, Any], intent_id: Optional[str]) -> Dict[str, Any]:
    """
    After an empty run: record which registered documents are present in the
    Project with exactly their registered content (persisted by the external
    persister, DJ-4). Only an exact match is recorded; nothing is inferred.
    """
    with _locked(project_root):
        reg = load(project_root)
        changed = False
        for path, (doc_id, entry) in active_by_path(reg).items():
            if path not in run.get("registered_documents", []):
                continue
            on_disk = sha256_file(project_root / path)
            if on_disk == entry["sha256"] and entry.get("project_sha256") != on_disk:
                entry["project_sha256"] = on_disk
                entry["history"].append(_event("observed_in_project", intent_id, sha256=on_disk))
                entry["updated_at"] = now_iso()
                changed = True
        if not changed:
            return {"generation": reg["generation"], "sha256": sha256_file(registry_path(project_root)),
                    "applied": False}
        reg["generation"] += 1
        sha = _write(project_root, reg)
    return {"generation": reg["generation"], "sha256": sha, "applied": True}


def link_gene(project_root: Path, doc_id: str, gene_id: str, revision_digest: Optional[str] = None,
              intent_id: Optional[str] = None) -> Dict[str, Any]:
    """
    P30: link a Gene (and optionally a revision) to a document. The document
    keeps its doc_id and path; nothing is written under ``.genes/``.
    """
    with _locked(project_root):
        reg = load(project_root)
        entry = reg["documents"].get(doc_id)
        if entry is None:
            raise DocRunError(f"documento no registrado: {doc_id}", "DOC_REGISTRY_UNKNOWN")
        link = {"gene_id": gene_id, "revision_digest": revision_digest}
        if link not in [{k: g.get(k) for k in ("gene_id", "revision_digest")} for g in entry["gene_links"]]:
            entry["gene_links"].append({**link, "linked_at": now_iso(), "intent_id": intent_id})
            entry["history"].append(_event("gene_linked", intent_id, gene_id=gene_id))
            entry["updated_at"] = now_iso()
            reg["generation"] += 1
            _write(project_root, reg)
        return entry


def ids_for(reg: Dict[str, Any], paths: List[str]) -> Dict[str, str]:
    by_path = active_by_path(reg)
    return {p: by_path[p][0] for p in paths if p in by_path}
