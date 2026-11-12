"""Deterministic, recoverable materialization for a DIS ratification.

The module owns no lifecycle transitions.  It computes the graph that must
result from an approved mapping, applies that graph atomically, materializes
the audit delta, and independently re-reads both artifacts for verification.
IntentManager remains the orchestrator for turns, ledger, commit and advance.
"""

from __future__ import annotations

import copy
import hashlib
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from brain.core.intelligence_supply import digest, locked, read_json
from brain.core.intent_state_manager import _atomic_write_json


class DisRatificationError(ValueError):
    """Stable machine-readable failure raised by the DIS materializer."""

    def __init__(self, code: str, message: str, *, retryable: bool = False):
        self.code = code
        self.retryable = retryable
        super().__init__(message)


@dataclass(frozen=True)
class MaterializationResult:
    graph_before_digest: str
    graph_after_digest: str
    delta_digest: str
    semantic_index_ref: str
    delta_ref: str
    already_applied: bool


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _slug(value: str) -> str:
    value = re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_") or "domain"
    return value[:32].rstrip("_") or "domain"


def _domain_id(name: str, operation_id: str, suffix: str) -> str:
    token = hashlib.sha256(f"{operation_id}:{suffix}".encode("utf-8")).hexdigest()[:4]
    return f"dom_{_slug(name)}_{token}"


def _new_domain(*, name: str, genes: list[str], mandate_id: str,
                intent_id: str, operation_id: str, suffix: str,
                timestamp: str) -> tuple[str, dict[str, Any]]:
    domain_id = _domain_id(name, operation_id, suffix)
    return domain_id, {
        "name": name,
        "domain_centroid_ref": f"chroma://nucleus/domains/{domain_id}",
        "genes": sorted(set(genes)),
        "origin_mandate_id": mandate_id,
        "mandates": [mandate_id],
        "first_created_by": intent_id,
        "last_updated": timestamp,
    }


def apply_operations(snapshot: dict[str, Any], operations: list[dict[str, Any]],
                     *, mandate_id: str, intent_id: str,
                     timestamp: str) -> dict[str, Any]:
    """Return the exact final graph or fail before touching persistent state."""
    graph = copy.deepcopy(snapshot)
    domains = graph.setdefault("domains", {})
    if not isinstance(domains, dict):
        raise DisRatificationError("GRAPH_APPLICATION_FAILED", "graph domains must be an object")

    for operation in operations:
        decision = operation["human_decision"]
        if decision == "rejected":
            continue
        proposal = operation["proposal"]
        kind = operation["type"]
        operation_id = operation["operation_id"]

        try:
            if kind == "create_domain":
                domain_id, value = _new_domain(
                    name=proposal["name"], genes=proposal["gene_ids"], mandate_id=mandate_id,
                    intent_id=intent_id, operation_id=operation_id, suffix="create", timestamp=timestamp,
                )
                if domain_id in domains and domains[domain_id] != value:
                    raise ValueError(f"domain id collision: {domain_id}")
                domains[domain_id] = value
            elif kind == "rename_domain":
                domain = domains[proposal["domain_id"]]
                domain["name"] = proposal["new_name"]
                domain["last_updated"] = timestamp
            elif kind in {"add_edge", "remove_edge"}:
                domain = domains[proposal["domain_id"]]
                genes = set(domain.get("genes", []))
                if kind == "add_edge":
                    genes.add(proposal["gene_id"])
                else:
                    if proposal["gene_id"] not in genes:
                        raise ValueError("cannot remove absent Domain-Gene edge")
                    genes.remove(proposal["gene_id"])
                domain["genes"] = sorted(genes)
                domain["last_updated"] = timestamp
                mandates = set(domain.get("mandates", []))
                mandates.add(mandate_id)
                domain["mandates"] = sorted(mandates)
            elif kind == "merge_domains":
                source_ids = proposal["source_domain_ids"]
                source = [domains[item] for item in source_ids]
                genes = sorted({gene for domain in source for gene in domain.get("genes", [])})
                target_id = proposal.get("target_domain_id")
                if target_id:
                    if target_id not in domains and target_id not in source_ids:
                        raise ValueError("target_domain_id does not identify an existing source")
                    value = copy.deepcopy(domains[target_id])
                    value.update({"name": proposal["target_name"], "genes": genes, "last_updated": timestamp})
                else:
                    target_id, value = _new_domain(
                        name=proposal["target_name"], genes=genes, mandate_id=mandate_id,
                        intent_id=intent_id, operation_id=operation_id, suffix="merge", timestamp=timestamp,
                    )
                for source_id in source_ids:
                    domains.pop(source_id)
                domains[target_id] = value
            elif kind == "split_domains":
                source_id = proposal["source_domain_id"]
                source_genes = set(domains[source_id].get("genes", []))
                target_genes = [gene for target in proposal["targets"] for gene in target["gene_ids"]]
                if len(target_genes) != len(set(target_genes)) or set(target_genes) != source_genes:
                    raise ValueError("split targets must partition source genes exactly")
                domains.pop(source_id)
                for position, target in enumerate(proposal["targets"]):
                    domain_id, value = _new_domain(
                        name=target["name"], genes=target["gene_ids"], mandate_id=mandate_id,
                        intent_id=intent_id, operation_id=operation_id,
                        suffix=f"split:{position}", timestamp=timestamp,
                    )
                    if domain_id in domains:
                        raise ValueError(f"domain id collision: {domain_id}")
                    domains[domain_id] = value
            else:
                raise ValueError(f"unsupported operation type: {kind}")
        except (KeyError, TypeError, ValueError) as exc:
            raise DisRatificationError(
                "GRAPH_APPLICATION_FAILED", f"operation '{operation_id}' cannot be applied: {exc}"
            ) from exc

    graph["updated_at"] = timestamp
    return graph


def build_delta(snapshot: dict[str, Any], final_graph: dict[str, Any],
                operations: list[dict[str, Any]], *, intent_id: str,
                mandate_id: str, mapping_ref: str, mapping_digest: str,
                decision_digest: str) -> dict[str, Any]:
    before = snapshot.get("domains", {})
    after = final_graph.get("domains", {})
    created = sorted(set(after) - set(before))
    removed = sorted(set(before) - set(after))
    changed = sorted(key for key in set(before) & set(after) if before[key] != after[key])
    return {
        "schema_version": "bloom.dis-domain-graph-delta/v1",
        "intent_id": intent_id,
        "mandate_id": mandate_id,
        "mapping_ref": mapping_ref,
        "mapping_digest": mapping_digest,
        "decision_digest": decision_digest,
        "graph_before_digest": digest(snapshot),
        "graph_after_digest": digest(final_graph),
        "applied_operation_ids": [
            item["operation_id"] for item in operations
            if item["human_decision"] in {"approved", "overridden"}
        ],
        "rejected_operation_ids": [
            item["operation_id"] for item in operations if item["human_decision"] == "rejected"
        ],
        "domains_created": created,
        "domains_removed": removed,
        "domains_changed": changed,
    }


def materialize_and_verify(*, semantic_index: Path, delta_path: Path,
                           snapshot: dict[str, Any], final_graph: dict[str, Any],
                           delta: dict[str, Any]) -> MaterializationResult:
    """Atomically converge graph and delta, then verify both from disk."""
    semantic_index = Path(semantic_index).resolve()
    delta_path = Path(delta_path).resolve()
    lock_path = semantic_index.with_suffix(semantic_index.suffix + ".dis-ratification.lock")
    before_digest = digest(snapshot)
    after_digest = digest(final_graph)

    with locked(lock_path):
        current = read_json(semantic_index)
        current_digest = digest(current)
        already_applied = current_digest == after_digest
        if current_digest not in {before_digest, after_digest}:
            raise DisRatificationError(
                "PROPOSAL_CONFLICT",
                "semantic index differs from both the frozen snapshot and expected ratified graph",
            )
        if not already_applied:
            _atomic_write_json(semantic_index, final_graph)
        if delta_path.exists():
            if digest(read_json(delta_path)) != digest(delta):
                raise DisRatificationError("EVIDENCE_CONFLICT", "existing graph delta differs")
        else:
            _atomic_write_json(delta_path, delta)

        verified_graph = read_json(semantic_index)
        if digest(verified_graph) != after_digest:
            raise DisRatificationError("EFFECT_VERIFICATION_MISSING", "semantic index verification failed")
        try:
            verified_delta = read_json(delta_path)
        except Exception as exc:
            raise DisRatificationError(
                "GRAPH_DELTA_NOT_MATERIALIZED", "domain graph delta is absent or invalid", retryable=True
            ) from exc
        if digest(verified_delta) != digest(delta):
            raise DisRatificationError("EFFECT_VERIFICATION_MISSING", "domain graph delta verification failed")
        if (verified_delta.get("graph_before_digest") != before_digest
                or verified_delta.get("graph_after_digest") != after_digest):
            raise DisRatificationError("EFFECT_VERIFICATION_MISSING", "delta graph digests do not reconcile")

    return MaterializationResult(
        graph_before_digest=before_digest,
        graph_after_digest=after_digest,
        delta_digest=digest(delta),
        semantic_index_ref=str(semantic_index),
        delta_ref=str(delta_path),
        already_applied=already_applied,
    )
