"""Durable effect ledger for BSIP commit-phase turns.

The ledger is intentionally stored beside the turn control file so recovery
needs only the persisted intent tree.  Integration with ``mandate_state.json``
is represented by :class:`MandateStateReader`, but is deliberately not wired:
Workspace Core still owns the audit of that file's freshness semantics.
"""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Protocol


LEDGER_FILENAME = ".effect_ledger.json"
LEDGER_SCHEMA_VERSION = "1.0"

_OBLIGATIONS_BY_TYPE = {
    "ing": (
        "gene_lineage_materialized",
        "domain_gene_edge_materialized",
        "domain_gene_edge_deduplicated",
        "knowledge_baseline_materialized",
    ),
    "dis": (
        "domain_graph_operation_applied",
        "domain_graph_delta_materialized",
    ),
}


class EffectLedgerError(Exception):
    """Base error for invalid or incomplete effect-ledger operations."""


class PendingEffectsError(EffectLedgerError):
    """Raised when a commit is attempted while obligations remain pending."""


class MandateStateReader(Protocol):
    """Future Workspace Core integration point; intentionally not wired.

    Implementations must return freshly read mandate state, never a cached
    snapshot.  The concrete path/schema will be added only after Work 3
    approves the freshness contract for ``mandate_state.json``.
    """

    def read_current(self, mandate_id: str) -> dict[str, Any]:
        """Return the current persisted mandate state for ``mandate_id``."""


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _canonical_json(payload: Any) -> str:
    return json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _sha256(payload: Any) -> str:
    return hashlib.sha256(_canonical_json(payload).encode("utf-8")).hexdigest()


def _atomic_write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(dir=str(path.parent), prefix=f".{path.name}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2, ensure_ascii=False)
            handle.write("\n")
        os.replace(tmp_path, path)
    except BaseException:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


class EffectLedgerManager:
    """Create and update one durable ledger for a BSIP commit turn."""

    def __init__(self, turn_dir: Path) -> None:
        self.turn_dir = Path(turn_dir)
        self.path = self.turn_dir / LEDGER_FILENAME

    @classmethod
    def create(
        cls,
        *,
        turn_dir: Path,
        intent_id: str,
        intent_type: str,
        stage: str,
        turn_id: str,
        control_ref: str,
        effect_payload: list[dict[str, Any]],
    ) -> "EffectLedgerManager":
        """Create an idempotent pending ledger from the approved turn result."""
        if intent_type not in _OBLIGATIONS_BY_TYPE:
            raise EffectLedgerError(f"intent_type '{intent_type}' has no effect-ledger obligations")
        manager = cls(turn_dir)
        identity = {
            "intent_id": intent_id,
            "intent_type": intent_type,
            "stage": stage,
            "turn_id": str(turn_id),
        }
        payload_digest = _sha256(effect_payload)
        effects = []
        for obligation in _OBLIGATIONS_BY_TYPE[intent_type]:
            effects.append({
                "effect_id": _sha256({**identity, "obligation": obligation})[:24],
                "obligation": obligation,
                "status": "pending",
                "payload_digest": payload_digest,
                "applied_at": None,
                "verification": None,
            })
        document = {
            "schema_version": LEDGER_SCHEMA_VERSION,
            "ledger_id": _sha256(identity)[:32],
            "identity": identity,
            "state": "pending",
            "control_ref": control_ref,
            "effects_payload": effect_payload,
            "effects_digest": _sha256(effects),
            "effects": effects,
            "state_advanced": False,
            "created_at": _now_iso(),
            "updated_at": _now_iso(),
            "mandate_state_integration": {
                "status": "not_wired",
                "reader_contract": "MandateStateReader.read_current(mandate_id)",
                "reason": "Awaiting Workspace Core freshness audit approval",
            },
        }
        if manager.path.exists():
            existing = manager.load()
            if existing["identity"] != identity or existing["effects_payload"] != effect_payload:
                raise EffectLedgerError(f"ledger collision at '{manager.path}'")
            return manager
        _atomic_write_json(manager.path, document)
        return manager

    def load(self) -> dict[str, Any]:
        """Read and minimally validate the current ledger from disk."""
        try:
            document = json.loads(self.path.read_text(encoding="utf-8"))
        except FileNotFoundError as exc:
            raise EffectLedgerError(f"effect ledger not found: '{self.path}'") from exc
        except json.JSONDecodeError as exc:
            raise EffectLedgerError(f"invalid effect ledger JSON at '{self.path}': {exc}") from exc
        required = {"schema_version", "ledger_id", "identity", "effects", "state_advanced"}
        missing = required - set(document)
        if missing:
            raise EffectLedgerError(f"effect ledger missing fields: {sorted(missing)}")
        if document["schema_version"] != LEDGER_SCHEMA_VERSION:
            raise EffectLedgerError(f"unsupported effect ledger schema: {document['schema_version']}")
        return document

    def mark_effect_applied(self, effect_id: str, evidence: dict[str, Any]) -> dict[str, Any]:
        """Mark one obligation applied after its external verifier supplies evidence."""
        if not evidence:
            raise EffectLedgerError("verification evidence cannot be empty")
        document = self.load()
        matched = False
        for effect in document["effects"]:
            if effect["effect_id"] != effect_id:
                continue
            matched = True
            if effect["status"] == "applied":
                expected = effect.get("verification", {}).get("evidence_digest")
                if expected != _sha256(evidence):
                    raise EffectLedgerError(f"effect '{effect_id}' already applied with different evidence")
                return document
            effect["status"] = "applied"
            effect["applied_at"] = _now_iso()
            effect["verification"] = {
                "verified": True,
                "checked_at": _now_iso(),
                "evidence": evidence,
                "evidence_digest": _sha256(evidence),
            }
            break
        if not matched:
            raise EffectLedgerError(f"unknown effect_id '{effect_id}'")
        document["state"] = (
            "applied" if all(item["status"] == "applied" for item in document["effects"])
            else "applying"
        )
        document["effects_digest"] = _sha256(document["effects"])
        document["updated_at"] = _now_iso()
        _atomic_write_json(self.path, document)
        return document

    def assert_all_applied(self) -> dict[str, Any]:
        """Return the ledger only when every declared obligation is verified."""
        document = self.load()
        pending = [item["obligation"] for item in document["effects"] if item["status"] != "applied"]
        if pending:
            raise PendingEffectsError(f"pending effect obligations: {pending}")
        return document

    def assert_identity(
        self,
        *,
        intent_id: str,
        intent_type: str,
        stage: str,
        turn_id: str,
    ) -> dict[str, Any]:
        """Reject a ledger resolved through the wrong intent/phase/turn."""
        document = self.load()
        expected = {
            "intent_id": intent_id,
            "intent_type": intent_type,
            "stage": stage,
            "turn_id": str(turn_id),
        }
        if document["identity"] != expected:
            raise EffectLedgerError(
                f"effect ledger identity mismatch: expected={expected}, "
                f"actual={document['identity']}"
            )
        return document

    def mark_state_advanced(self) -> dict[str, Any]:
        """Persist the final recovery checkpoint after phase state advances."""
        document = self.assert_all_applied()
        document["state_advanced"] = True
        document["state"] = "state_advanced"
        document["updated_at"] = _now_iso()
        _atomic_write_json(self.path, document)
        return document
