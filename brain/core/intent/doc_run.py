"""
Mechanical core of the ``doc`` intent (stage D1 of
``docs/ANALYSIS/BSIP/DOC/Encargo_Doc_Intent_Actualizacion_Viva_v1_0.md``).

Decisions applied (José, 2026-11-10):

- P1 (form 3): comparison, digests and empty-run detection are mechanical and
  never call an intelligence. Content is rewritten only through a response
  file (``brain intent download --input-file``). While a needed response is
  missing the run stays ``pending_response`` and cannot be finalized.
- P48/P34: every document registered in the declared scope is compared by
  hash. Differences caused by the triggering intent are sanitized; other
  differences are recorded as anomalies and never sanitized automatically.
- P5: ``finalize`` requires either a verifiable empty-run record or a draft
  whose contract validates (files and digests match, nothing pending).
- P3: the docbase is the existing ``FilesCompressor`` docbase; contract
  digests are SHA-256, computed separately.
- P4: existing names are kept. New artifacts: ``.doc_run.json`` (intent root)
  and ``.doc_contract.json`` (next to the staged draft).
- P10: the legacy ``doc`` engine is repaired in place; no IntentStateManager.

"Registered documentation" in D1 means the documents of the last finalized
contract for the same scope plus the documents declared in this run's scope.
The governed document registry (DJ-13) arrives in D2.

This module performs no network access and imports no intelligence client.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any, Dict, Iterable, List, Optional

from brain.shared.logger import get_logger

# Writes to the already registered brain_core stream (BLOOM_NUCLEUS_LOGGING_SPEC).
logger = get_logger(__name__)

RUN_FILE = ".doc_run.json"
CONTRACT_FILE = ".doc_contract.json"
REQUEST_FILE = ".payload.json"  # existing name: .pipeline/.context/.payload.json
DOC_STAGE = "context"

RUN_SCHEMA = "bloom.doc_run/1"
CONTRACT_SCHEMA = "bloom.doc_contract/1"
REQUEST_SCHEMA = "bloom.doc_request/1"

# DJ-33: Project is contrasted against its filesystem; Domain and Gene are
# declared but not verified; Tenant and Organization are only prepared.
LEVELS = {
    "project": "verificado contra el filesystem del Project",
    "domain": "declarado, no verificado",
    "gene": "declarado, no verificado",
    "organization": "preparado, sin contraste",
    "tenant": "preparado, sin contraste",
}
CONTRASTED_LEVELS = {"project", "domain", "gene"}

# DJ-29: intents whose terminal state triggers doc. In D1 only a finalized
# `dev` can be resolved as triggering intent; the rest arrive in D3-D5.
D1_TRIGGER_TYPES = {"dev"}

RESULT_EMPTY = "empty"
RESULT_PENDING = "pending_response"
RESULT_ANOMALIES = "anomalies"

STATUS_EMPTY = "empty_run"
STATUS_PENDING = "pending_response"
STATUS_DRAFT = "draft_ready"
STATUS_ANOMALIES = "anomalies"


class DocRunError(ValueError):
    """Raised when a mechanical doc precondition is not met."""


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256_bytes(data: bytes) -> str:
    return "sha256:" + hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> Optional[str]:
    if not path.is_file():
        return None
    return sha256_bytes(path.read_bytes())


def canonical_bytes(data: Any) -> bytes:
    return json.dumps(data, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def write_json(path: Path, data: Any) -> str:
    """Write JSON deterministically and return the SHA-256 of the bytes written."""
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = (json.dumps(data, sort_keys=True, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_bytes(raw)
    tmp.replace(path)
    return sha256_bytes(raw)


def read_json(path: Path) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def portable_path(value: str) -> str:
    """Normalize a project-relative path; reject absolute paths and escapes."""
    if not value or not str(value).strip():
        raise DocRunError("ruta vacía en el alcance de doc")
    raw = str(value).strip().replace("\\", "/")
    pure = PurePosixPath(raw)
    if pure.is_absolute() or (len(raw) > 1 and raw[1] == ":"):
        raise DocRunError(f"la ruta tiene que ser relativa al Project: {value}")
    parts = [p for p in pure.parts if p not in ("", ".")]
    if not parts or any(p == ".." for p in parts):
        raise DocRunError(f"ruta fuera del Project: {value}")
    return "/".join(parts)


def _unique(values: Iterable[str]) -> List[str]:
    seen: Dict[str, None] = {}
    for v in values:
        seen.setdefault(v, None)
    return list(seen)


# ---------------------------------------------------------------------------
# Scope and trigger (DJ-1: the scope is a field of doc's input)
# ---------------------------------------------------------------------------

def build_scope(level: str, ref: Optional[str], documents: Iterable[str]) -> Dict[str, Any]:
    level = (level or "project").strip().lower()
    if level not in LEVELS:
        raise DocRunError(f"nivel de alcance inválido: {level}. Válidos: {sorted(LEVELS)}")
    clean_ref = ref.strip() if ref and ref.strip() else None
    if level in {"domain", "gene"} and not clean_ref:
        raise DocRunError(f"el alcance '{level}' necesita --doc-ref (id declarado)")
    docs = _unique(portable_path(d) for d in (documents or []))
    return {
        "level": level,
        "ref": clean_ref,
        "documents": docs,
        "verification": LEVELS[level],
    }


def scope_key(scope: Dict[str, Any]) -> str:
    return f"{scope.get('level')}:{scope.get('ref') or ''}"


def _dev_manifest_paths(intent_dir: Path) -> List[str]:
    paths: List[str] = []
    for manifest in sorted(intent_dir.glob(".pipeline/**/.staging/.staging_manifest.json")):
        try:
            data = read_json(manifest)
        except (OSError, json.JSONDecodeError):
            continue
        for entry in data.get("files", []):
            target = entry.get("target_path")
            if target:
                paths.append(portable_path(target))
    return paths


def resolve_trigger(
    intents_base: Path,
    trigger_intent: Optional[str],
    declared_files: Iterable[str],
) -> Dict[str, Any]:
    """
    Build the trigger record.

    - Without ``trigger_intent``: a manual CLI run (encargo §5.1); the changed
      paths are the ones a person declares.
    - With ``trigger_intent``: in D1 it must be a finalized ``dev`` intent
      (DJ-29, DJ-19). Its changed paths come from its staging manifests,
      plus any declared paths.
    """
    declared = _unique(portable_path(f) for f in (declared_files or []))
    if not trigger_intent:
        return {
            "kind": "manual",
            "intent_id": None,
            "intent_type": None,
            "changed_paths": declared,
            "source": "declared",
        }

    wanted = trigger_intent.strip()
    for type_dir in sorted(intents_base.glob(".*")):
        if not type_dir.is_dir():
            continue
        for intent_dir in type_dir.iterdir():
            if not intent_dir.is_dir():
                continue
            for state_file in intent_dir.glob(".*_state.json"):
                try:
                    state = read_json(state_file)
                except (OSError, json.JSONDecodeError):
                    continue
                uid = state.get("uuid") or state.get("intent_id")
                if uid != wanted and intent_dir.name != wanted:
                    continue
                itype = state.get("type") or state.get("intent_type")
                if itype == "doc":
                    raise DocRunError("un doc no dispara otro doc (DJ-18, DJ-24)")
                if itype in {"tst", "exp", "asm"}:
                    raise DocRunError(f"'{itype}' no dispara doc (DJ-29)")
                if itype not in D1_TRIGGER_TYPES:
                    raise DocRunError(
                        f"el disparo desde '{itype}' no está en D1 "
                        "(ing: D4, dis: D3, mrg: D5)"
                    )
                if state.get("status") != "completed":
                    raise DocRunError(
                        "el intent disparador no llegó a su estado terminal "
                        "(finalize); un intent sin terminar no dispara doc (DJ-19)"
                    )
                paths = _unique(_dev_manifest_paths(intent_dir) + declared)
                return {
                    "kind": "intent",
                    "intent_id": uid,
                    "intent_type": itype,
                    "changed_paths": paths,
                    "source": "dev_staging_manifest" + ("+declared" if declared else ""),
                }
    raise DocRunError(f"intent disparador no encontrado: {trigger_intent}")


# ---------------------------------------------------------------------------
# Baseline: last finalized contract for the same scope
# ---------------------------------------------------------------------------

def _finalized_doc_intents(intents_base: Path, exclude: Optional[Path]) -> List[Dict[str, Any]]:
    found = []
    doc_dir = intents_base / ".doc"
    if not doc_dir.is_dir():
        return found
    for intent_dir in doc_dir.iterdir():
        if not intent_dir.is_dir() or (exclude and intent_dir.resolve() == exclude.resolve()):
            continue
        state_file = intent_dir / ".doc_state.json"
        if not state_file.is_file():
            continue
        try:
            state = read_json(state_file)
        except (OSError, json.JSONDecodeError):
            continue
        fin = state.get("doc_finalize")
        if state.get("status") != "completed" or not fin:
            continue
        found.append({"dir": intent_dir, "state": state, "finalize": fin})
    return found


def find_baseline(project_root: Path, intents_base: Path, scope: Dict[str, Any],
                  exclude: Optional[Path]) -> Optional[Dict[str, Any]]:
    """
    Return the last finalized contract for this scope, verified by digest.

    An empty run does not create a new baseline: it points to the contract it
    compared against.
    """
    key = scope_key(scope)
    candidates = []
    for item in _finalized_doc_intents(intents_base, exclude):
        state = item["state"]
        if scope_key(state.get("doc_scope") or {}) != key:
            continue
        candidates.append(item)
    candidates.sort(key=lambda it: it["finalize"].get("finalized_at", ""), reverse=True)

    for item in candidates:
        fin = item["finalize"]
        if fin.get("basis") == "contract":
            contract_path = item["dir"] / fin["contract_ref"]
            expected = fin.get("contract_sha256")
        else:
            base = fin.get("baseline") or {}
            if not base.get("contract_ref"):
                continue
            contract_path = project_root / base["contract_ref"]
            expected = base.get("contract_sha256")
        actual = sha256_file(contract_path)
        if actual is None or actual != expected:
            raise DocRunError(
                f"la línea base {contract_path} no coincide con su digest registrado; "
                "no se compara contra una línea base alterada"
            )
        contract = read_json(contract_path)
        return {
            "contract": contract,
            "contract_path": contract_path,
            "contract_ref": contract_path.relative_to(project_root).as_posix(),
            "contract_sha256": actual,
        }
    return None


# ---------------------------------------------------------------------------
# Comparison (no intelligence)
# ---------------------------------------------------------------------------

def compare(
    project_root: Path,
    intents_base: Path,
    intent_path: Path,
    state: Dict[str, Any],
) -> Dict[str, Any]:
    scope = state.get("doc_scope")
    trigger = state.get("doc_trigger")
    if not scope or not trigger:
        raise DocRunError("el intent doc no tiene alcance ni disparador; crealo con --doc-level")

    baseline = find_baseline(project_root, intents_base, scope, exclude=intent_path)
    base_contract = baseline["contract"] if baseline else None
    base_docs = {d["path"]: d for d in (base_contract or {}).get("documents", [])}
    base_inputs = {i["path"]: i["sha256"] for i in (base_contract or {}).get("inputs", [])}

    registered = _unique(list(base_docs) + list(scope.get("documents", [])))
    if not registered:
        raise DocRunError("el alcance no tiene documentación registrada ni declarada (--doc-document)")

    sources = [portable_path(p) for p in state.get("initial_files", [])]
    contrasted = scope["level"] in CONTRASTED_LEVELS
    observed_inputs = {p: sha256_file(project_root / p) for p in sources} if contrasted else {}

    changed = set(trigger.get("changed_paths", []))
    changes: List[Dict[str, Any]] = []
    anomalies: List[Dict[str, Any]] = []
    to_sanitize: Dict[str, List[str]] = {}

    def flag(doc: str, reason: str) -> None:
        to_sanitize.setdefault(doc, [])
        if reason not in to_sanitize[doc]:
            to_sanitize[doc].append(reason)

    # Inputs (real state)
    if contrasted:
        for path in sorted(set(observed_inputs) | (set(base_inputs) if baseline else set())):
            before = base_inputs.get(path) if baseline else None
            after = observed_inputs.get(path)
            if baseline and before == after:
                continue
            if not baseline:
                kind = "sin_linea_base"
            elif before is None:
                kind = "agregado"
            elif after is None:
                kind = "faltante"
            else:
                kind = "modificado"
            attribution = "trigger" if (not baseline or path in changed) else "external"
            entry = {"kind": "input", "path": path, "change": kind, "before": before,
                     "after": after, "attribution": attribution}
            changes.append(entry)
            if attribution == "external":
                anomalies.append({**entry, "reason": "cambio fuera del intent disparador (no se sanea)"})
            else:
                for doc in registered:
                    flag(doc, f"insumo {kind}: {path}")

    # Documents
    for doc in registered:
        base = base_docs.get(doc)
        if not base:
            flag(doc, "documento sin línea base" if not baseline else "documento nuevo en el alcance")
            continue
        draft = project_root / base["draft_ref"]
        if sha256_file(draft) != base["sha256"]:
            anomalies.append({"kind": "document", "path": doc, "change": "borrador_alterado",
                              "attribution": "external",
                              "reason": "el borrador de la línea base no coincide con su digest"})
        on_disk = sha256_file(project_root / doc)
        if on_disk is not None and on_disk != base["sha256"]:
            anomalies.append({"kind": "document", "path": doc, "change": "modificado_fuera_del_sistema",
                              "before": base["sha256"], "after": on_disk, "attribution": "external",
                              "reason": "movimiento o edición fuera del sistema (DJ-16); no se resuelve por parecido"})
        if doc in changed:
            flag(doc, "documento declarado como cambiado por el intent disparador")

    if to_sanitize:
        result = RESULT_PENDING
    elif anomalies:
        result = RESULT_ANOMALIES
    else:
        result = RESULT_EMPTY

    logger.info(
        "doc compare intent=%s scope=%s result=%s to_sanitize=%d anomalies=%d baseline=%s intelligence_calls=0",
        state.get("uuid"), scope_key(scope), result, len(to_sanitize), len(anomalies),
        baseline["contract_ref"] if baseline else None,
    )
    return {
        "schema": RUN_SCHEMA,
        "intent_id": state.get("uuid"),
        "compared_at": now_iso(),
        "scope": {"level": scope["level"], "ref": scope.get("ref"),
                  "verification": scope["verification"]},
        "trigger": trigger,
        "baseline": ({"contract_ref": baseline["contract_ref"],
                      "contract_sha256": baseline["contract_sha256"]} if baseline else None),
        "registered_documents": registered,
        "observed_inputs": [{"path": p, "sha256": observed_inputs[p]} for p in sorted(observed_inputs)],
        "baseline_documents": [{"path": d, "sha256": base_docs[d]["sha256"],
                                "draft_ref": base_docs[d]["draft_ref"]} for d in sorted(base_docs)],
        "changes": changes,
        "anomalies": anomalies,
        "to_sanitize": [{"path": d, "reasons": to_sanitize[d]} for d in sorted(to_sanitize)],
        "result": result,
        "intelligence_calls": 0,
    }


def request_payload(run: Dict[str, Any]) -> Dict[str, Any]:
    """Content request for the person who answers by file (P1, form 3)."""
    return {
        "schema": REQUEST_SCHEMA,
        "intent_id": run["intent_id"],
        "scope": run["scope"],
        "documents_to_write": run["to_sanitize"],
        "inputs": run["observed_inputs"],
        "anomalies": run["anomalies"],
        "material": {
            "docbase": ".context/.files/.docbase.json",
            "codebase": ".context/.files/.codebase.json",
        },
        "response_format": {
            "bloom_protocol": {"version": "1.0", "pipeline_stage": DOC_STAGE,
                               "completion_status": "complete"},
            "metadata": {"model": "opcional: modelo usado, si se conoce"},
            "content": {"files": [{"file_ref": "001_nombre.md",
                                   "path": "ruta del documento a escribir",
                                   "action": "update",
                                   "_bloom_content": "contenido completo"}]},
            "apply_with": "brain intent download --folder <intent> --input-file <respuesta.json>",
        },
    }


# ---------------------------------------------------------------------------
# Draft contract (built after staging the response)
# ---------------------------------------------------------------------------

def _load_run(intent_path: Path, state: Dict[str, Any]) -> Dict[str, Any]:
    run_path = intent_path / RUN_FILE
    recorded = (state.get("doc_run") or {}).get("sha256")
    actual = sha256_file(run_path)
    if actual is None:
        raise DocRunError("no hay .doc_run.json: corré 'brain intent hydrate' primero")
    if actual != recorded:
        raise DocRunError(".doc_run.json no coincide con el digest registrado en el estado")
    return read_json(run_path)


def _current_inputs_match(project_root: Path, observed: List[Dict[str, Any]]) -> List[str]:
    mismatched = []
    for item in observed:
        if sha256_file(project_root / item["path"]) != item["sha256"]:
            mismatched.append(item["path"])
    return mismatched


def check_response_targets(intent_path: Path, state: Dict[str, Any], files_meta: List[Dict[str, Any]]) -> None:
    run = _load_run(intent_path, state)
    if run["result"] != RESULT_PENDING:
        raise DocRunError(f"la corrida no espera respuesta (resultado: {run['result']})")
    allowed = {d["path"] for d in run["to_sanitize"]}
    for meta in files_meta:
        target = portable_path(meta.get("path", ""))
        if target not in allowed:
            raise DocRunError(
                f"la respuesta escribe '{target}', que no está pendiente de saneo en esta corrida"
            )


def build_contract(
    project_root: Path,
    intent_path: Path,
    state: Dict[str, Any],
    response_dir: Path,
    staging_dir: Path,
    response_meta: Dict[str, Any],
) -> Dict[str, Any]:
    run = _load_run(intent_path, state)
    if run["result"] != RESULT_PENDING:
        raise DocRunError(f"la corrida no espera respuesta (resultado: {run['result']})")
    moved = _current_inputs_match(project_root, run["observed_inputs"])
    if moved:
        raise DocRunError(f"los insumos cambiaron desde la comparación: {moved}; volvé a hidratar")

    pending_paths = {d["path"] for d in run["to_sanitize"]}
    base_docs = {d["path"]: d for d in run.get("baseline_documents", [])}
    documents = []
    pending = []
    for doc in run["registered_documents"]:
        staged = staging_dir / doc
        if staged.is_file():
            documents.append({
                "path": doc,
                "origin": "this_run",
                "draft_ref": staged.relative_to(project_root).as_posix(),
                "sha256": sha256_file(staged),
                "size": staged.stat().st_size,
            })
        elif doc in pending_paths:
            pending.append(doc)
        else:
            base = base_docs[doc]
            documents.append({
                "path": doc,
                "origin": "baseline",
                "draft_ref": base["draft_ref"],
                "sha256": base["sha256"],
            })

    model = None
    meta = response_meta.get("metadata") if isinstance(response_meta, dict) else None
    if isinstance(meta, dict):
        model = meta.get("model") or meta.get("model_used")

    logger.info(
        "doc contract intent=%s documents=%d pending=%d",
        state.get("uuid"), len(documents), len(pending),
    )
    return {
        "schema": CONTRACT_SCHEMA,
        "intent_id": state.get("uuid"),
        "intent_name": state.get("name"),
        "created_at": now_iso(),
        "trigger": run["trigger"],
        "scope": run["scope"],
        "level": run["scope"]["level"],
        "verification": run["scope"]["verification"],
        "run_ref": (intent_path / RUN_FILE).relative_to(project_root).as_posix(),
        "run_sha256": state["doc_run"]["sha256"],
        "baseline": run["baseline"],
        "documents": documents,
        "inputs": run["observed_inputs"],
        "anomalies": run["anomalies"],
        "pending": pending,
        "model": model,
        "content_channel": "response_file",
    }


# ---------------------------------------------------------------------------
# Validation and finalize precondition (P5)
# ---------------------------------------------------------------------------

def contract_path(intent_path: Path) -> Path:
    return intent_path / ".pipeline" / f".{DOC_STAGE}" / ".response" / ".staging" / CONTRACT_FILE


def verify(project_root: Path, intent_path: Path, state: Dict[str, Any]) -> Dict[str, Any]:
    """
    Mechanical verification used by ``validate`` and ``finalize``.

    Returns a report; ``report["ok"]`` tells whether ``finalize`` may close.
    """
    problems: List[str] = []
    basis = None
    try:
        run = _load_run(intent_path, state)
    except DocRunError as exc:
        return {"ok": False, "basis": None, "problems": [str(exc)], "intelligence_calls": 0}

    moved = _current_inputs_match(project_root, run["observed_inputs"])
    if moved:
        problems.append(f"los insumos cambiaron desde la comparación: {moved}")

    if run["baseline"]:
        actual = sha256_file(project_root / run["baseline"]["contract_ref"])
        if actual != run["baseline"]["contract_sha256"]:
            problems.append("la línea base cambió desde la comparación")

    if run["result"] == RESULT_EMPTY:
        basis = "empty_run"
    elif run["result"] == RESULT_ANOMALIES:
        problems.append(
            "la corrida solo encontró anomalías externas: no es una corrida vacía ni dejó borrador "
            "(P5); quedan registradas en .doc_run.json"
        )
    else:
        basis = "contract"
        cpath = contract_path(intent_path)
        recorded = (state.get("doc_contract") or {}).get("sha256")
        actual = sha256_file(cpath)
        if actual is None:
            problems.append("contenido pendiente de respuesta: no hay borrador con contrato")
        elif actual != recorded:
            problems.append(".doc_contract.json no coincide con el digest registrado")
        else:
            contract = read_json(cpath)
            if contract.get("run_sha256") != state["doc_run"]["sha256"]:
                problems.append("el contrato no corresponde a esta corrida")
            if contract.get("pending"):
                problems.append(f"contenido pendiente de respuesta: {contract['pending']}")
            for field in ("trigger", "level", "verification", "inputs", "documents"):
                if field not in contract:
                    problems.append(f"el contrato no tiene '{field}'")
            for doc in contract.get("documents", []):
                if sha256_file(project_root / doc["draft_ref"]) != doc["sha256"]:
                    problems.append(f"el borrador de {doc['path']} no coincide con su digest")
            if contract.get("inputs") != run["observed_inputs"]:
                problems.append("los insumos del contrato no coinciden con la comparación")

    if problems:
        logger.warning("doc verify intent=%s blocked: %s", state.get("uuid"), "; ".join(problems))
    else:
        logger.info("doc verify intent=%s ok basis=%s", state.get("uuid"), basis)
    return {
        "ok": not problems,
        "basis": basis,
        "result": run["result"],
        "problems": problems,
        "intelligence_calls": 0,
        "verification": run["scope"]["verification"],
    }
