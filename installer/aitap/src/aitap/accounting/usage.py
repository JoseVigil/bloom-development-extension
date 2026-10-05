"""Lectura agregada de la Contabilidad de inferencias (pilar Contabilidad).

Solo lectura: recorre los journals que escribe ``AccountingStore`` y verifica
su digest de integridad. No toma locks (los journals se reemplazan en forma
atomica), no modifica nada y nunca devuelve ``raw_response`` ni payloads.
"""
from __future__ import annotations

import math
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from aitap.accounting.store import AccountingStore
from aitap.providers.base import SupplyError

JOURNAL_NAME = re.compile(r"^([0-9a-f]{64})\.json$")
SMOKE_CONSUMER = "aitap.provisioning"


class UsageError(ValueError):
    def __init__(self, code: str, message: str):
        self.code = code
        super().__init__(message)


def parse_since(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise UsageError("INVALID_REQUEST", "--since debe ser una fecha ISO-8601") from None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _percentile(values: list[int], fraction: float) -> int | None:
    if not values:
        return None
    ordered = sorted(values)
    return ordered[max(0, math.ceil(fraction * len(ordered)) - 1)]


def _started(attempt: dict[str, Any]) -> datetime | None:
    try:
        return datetime.fromisoformat(str(attempt.get("started_at")).replace("Z", "+00:00"))
    except ValueError:
        return None


def summarize(root: Path, *, since: datetime | None = None, consumer_id: str | None = None,
              backend_id: str | None = None) -> dict[str, Any]:
    root = Path(root)
    if not root.is_dir():
        raise UsageError("STATE_DIR_NOT_FOUND", "el directorio de Contabilidad no existe")
    store = AccountingStore(root)
    groups: dict[tuple[str, str], dict[str, Any]] = {}
    latencies: dict[tuple[str, str], list[int]] = {}
    scanned = invalid = 0
    for entry in sorted(root.iterdir()):
        match = JOURNAL_NAME.match(entry.name)
        if not match or not entry.is_file():
            continue
        scanned += 1
        try:
            journal = store.read("sha256:" + match.group(1))
        except SupplyError:
            invalid += 1
            continue
        if not isinstance(journal, dict):
            invalid += 1
            continue
        consumer = journal.get("consumer_id") or "unknown"
        if consumer_id and consumer != consumer_id:
            continue
        for attempt in journal.get("attempts") or []:
            started = _started(attempt)
            if since and (started is None or started < since):
                continue
            intelligence = (attempt.get("routing_decision") or {}).get("effective_intelligence") or {}
            backend = intelligence.get("backend_id") or "unknown"
            if backend_id and backend != backend_id:
                continue
            key = (backend, consumer)
            row = groups.setdefault(key, {
                "backend_id": backend, "provider": intelligence.get("provider"),
                "model": intelligence.get("model"), "consumer_id": consumer,
                "attempts": 0, "completed": 0, "errors": 0, "in_flight": 0,
                "input_tokens": 0, "output_tokens": 0, "cost_usd": 0.0, "cost_statuses": [],
                "cost_known_attempts": 0, "cost_pending_attempts": 0,
            })
            row["attempts"] += 1
            outcome = attempt.get("outcome")
            if outcome == "completed":
                row["completed"] += 1
                usage = attempt.get("usage") or {}
                row["input_tokens"] += int(usage.get("input_tokens") or 0)
                row["output_tokens"] += int(usage.get("output_tokens") or 0)
                if isinstance(attempt.get("cost_usd"), (int, float)):
                    row["cost_usd"] += float(attempt["cost_usd"])
                    row["cost_known_attempts"] += 1
                else:
                    row["cost_pending_attempts"] += 1
                status = attempt.get("cost_status")
                if status and status not in row["cost_statuses"]:
                    row["cost_statuses"].append(status)
            elif outcome == "in_flight":
                row["in_flight"] += 1
            else:
                row["errors"] += 1
            if isinstance(attempt.get("latency_ms"), int):
                latencies.setdefault(key, []).append(attempt["latency_ms"])
    rows = []
    for key in sorted(groups):
        row = groups[key]
        row["cost_usd"] = round(row["cost_usd"], 6)
        row["cost_statuses"] = sorted(row["cost_statuses"])
        row["cost_coverage"] = "partial" if row["cost_pending_attempts"] else "complete"
        row["latency_ms_p50"] = _percentile(latencies.get(key, []), 0.50)
        row["latency_ms_p95"] = _percentile(latencies.get(key, []), 0.95)
        rows.append(row)
    totals = {name: sum(r[name] for r in rows) for name in
              ("attempts", "completed", "errors", "in_flight", "input_tokens", "output_tokens")}
    totals["cost_usd"] = round(sum(r["cost_usd"] for r in rows), 6)
    totals["cost_known_attempts"] = sum(r["cost_known_attempts"] for r in rows)
    totals["cost_pending_attempts"] = sum(r["cost_pending_attempts"] for r in rows)
    totals["cost_coverage"] = "incomplete" if invalid else "partial" if totals["cost_pending_attempts"] else "complete"
    return {
        "read_at": datetime.now(timezone.utc).isoformat(),
        "filters": {"since": since.isoformat() if since else None, "consumer_id": consumer_id,
                    "backend_id": backend_id},
        "journals_scanned": scanned,
        "journals_invalid": invalid,
        "rows": rows,
        "totals": totals,
        "provisioning_smoke": _smoke_usage(root, since=since, consumer_id=consumer_id, backend_id=backend_id),
    }


def _smoke_usage(root: Path, *, since: datetime | None, consumer_id: str | None,
                 backend_id: str | None) -> dict[str, Any]:
    """Contabilidad tecnica de la prueba de humo del aprovisionamiento local.

    Vive en ``<raiz>/provisioning/smoke`` con su propio contrato y el consumidor
    reservado ``aitap.provisioning``. Se informa aparte: nunca altera ``rows`` ni
    ``totals`` de los consumidores de inferencia.
    """
    folder = root / "provisioning" / "smoke"
    rows: dict[str, dict[str, Any]] = {}
    scanned = invalid = 0
    if folder.is_dir() and consumer_id in (None, SMOKE_CONSUMER):
        store = AccountingStore(folder)
        for entry in sorted(folder.iterdir()):
            match = JOURNAL_NAME.match(entry.name)
            if not match or not entry.is_file():
                continue
            scanned += 1
            try:
                record = store.read("sha256:" + match.group(1))
            except SupplyError:
                invalid += 1
                continue
            if not isinstance(record, dict) or record.get("consumer_id") != SMOKE_CONSUMER:
                invalid += 1
                continue
            backend = record.get("backend_id") or "unknown"
            if backend_id and backend != backend_id:
                continue
            row = rows.setdefault(backend, {"kind": "provisioning_smoke", "backend_id": backend,
                                            "model": record.get("ollama_ref"), "consumer_id": SMOKE_CONSUMER,
                                            "attempts": 0, "completed": 0, "errors": 0, "in_flight": 0,
                                            "input_tokens": 0, "output_tokens": 0, "cost_usd": 0.0,
                                            "cost_statuses": ["local_zero"]})
            for attempt in record.get("attempts") or []:
                started = _started(attempt)
                if since and (started is None or started < since):
                    continue
                row["attempts"] += 1
                outcome = attempt.get("outcome")
                if outcome == "completed":
                    row["completed"] += 1
                    usage = attempt.get("usage") or {}
                    row["input_tokens"] += int(usage.get("input_tokens") or 0)
                    row["output_tokens"] += int(usage.get("output_tokens") or 0)
                elif outcome == "in_flight":
                    row["in_flight"] += 1
                else:
                    row["errors"] += 1
    ordered = [rows[key] for key in sorted(rows)]
    totals = {name: sum(r[name] for r in ordered) for name in
              ("attempts", "completed", "errors", "in_flight", "input_tokens", "output_tokens")}
    totals["cost_usd"] = 0.0
    return {"records_scanned": scanned, "records_invalid": invalid, "rows": ordered, "totals": totals}
