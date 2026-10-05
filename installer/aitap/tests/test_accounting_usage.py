import json
from datetime import datetime, timezone

import pytest

from aitap.accounting.store import AccountingStore, digest
from aitap.accounting.usage import UsageError, parse_since, summarize


def _attempt(backend, outcome, started, *, tokens=(0, 0), latency=None, cost=None, status=None):
    attempt = {"number": 1, "started_at": started, "outcome": outcome,
               "routing_decision": {"effective_intelligence": {"backend_id": backend, "provider": backend.split("_")[0],
                                                               "model": "m-" + backend}}}
    if outcome == "completed":
        attempt.update(usage={"input_tokens": tokens[0], "output_tokens": tokens[1]}, cost_usd=cost, cost_status=status)
    if latency is not None:
        attempt["latency_ms"] = latency
    return attempt


def _write(store, name, consumer, attempts, raw="SECRET-RAW-RESPONSE"):
    identity = digest(name)
    store.write(identity, {"consumer_id": consumer, "attempts": attempts, "state": "completed",
                           "result": {"raw_response": raw}})


@pytest.fixture
def state(tmp_path):
    store = AccountingStore(tmp_path)
    _write(store, "a", "brain", [_attempt("anthropic_api", "completed", "2026-09-20T10:00:00+00:00",
                                          tokens=(100, 20), latency=900, cost=0.0006, status="calculated")])
    _write(store, "b", "brain", [_attempt("anthropic_api", "error", "2026-09-21T10:00:00+00:00", latency=50),
                                 _attempt("anthropic_api", "completed", "2026-09-21T10:00:01+00:00",
                                          tokens=(50, 10), latency=300, cost=0.0003, status="calculated")])
    _write(store, "c", "alfred", [_attempt("local.ollama.functiongemma-270m", "completed", "2026-09-26T10:00:00+00:00",
                                           tokens=(40, 12), latency=2900, cost=0, status="local_zero")])
    (tmp_path / ("f" * 64 + ".json")).write_text(json.dumps({"journal": {}, "journal_digest": "sha256:" + "0" * 64}))
    (tmp_path / "budgets").mkdir()
    return tmp_path


def test_groups_by_backend_and_consumer(state):
    result = summarize(state)
    assert result["journals_scanned"] == 4 and result["journals_invalid"] == 1
    rows = {(r["backend_id"], r["consumer_id"]): r for r in result["rows"]}
    brain = rows[("anthropic_api", "brain")]
    assert (brain["attempts"], brain["completed"], brain["errors"]) == (3, 2, 1)
    assert (brain["input_tokens"], brain["output_tokens"]) == (150, 30)
    assert brain["cost_usd"] == 0.0009 and brain["cost_statuses"] == ["calculated"]
    assert brain["latency_ms_p50"] == 300 and brain["latency_ms_p95"] == 900
    local = rows[("local.ollama.functiongemma-270m", "alfred")]
    assert local["cost_statuses"] == ["local_zero"] and local["cost_usd"] == 0
    assert result["totals"]["completed"] == 3
    assert brain["cost_coverage"] == "complete" and result["totals"]["cost_pending_attempts"] == 0
    assert datetime.fromisoformat(result["read_at"]).tzinfo is not None


def test_partial_cost_is_never_presented_as_total(state):
    store = AccountingStore(state)
    _write(store, "pending", "brain", [_attempt("anthropic_api", "completed", "2026-09-26T11:00:00+00:00",
                                                  tokens=(9, 4), cost=None, status="unconfigured")])
    result = summarize(state)
    brain = next(r for r in result["rows"] if r["consumer_id"] == "brain")
    assert brain["cost_usd"] == 0.0009
    assert brain["cost_known_attempts"] == 2 and brain["cost_pending_attempts"] == 1
    assert brain["cost_coverage"] == "partial"
    assert result["totals"]["cost_coverage"] == "incomplete"  # hay un journal inválido
    assert result["journals_invalid"] == 1


def test_filters(state):
    assert [r["consumer_id"] for r in summarize(state, consumer_id="alfred")["rows"]] == ["alfred"]
    assert summarize(state, backend_id="anthropic_api")["totals"]["attempts"] == 3
    recent = summarize(state, since=parse_since("2026-09-21T00:00:00Z"))
    assert recent["totals"]["attempts"] == 3


def test_never_returns_raw_responses(state):
    assert "SECRET-RAW-RESPONSE" not in json.dumps(summarize(state))


def test_read_only(state):
    before = {p: p.stat().st_mtime_ns for p in state.rglob("*")}
    summarize(state)
    assert {p: p.stat().st_mtime_ns for p in state.rglob("*")} == before


def test_errors(tmp_path):
    with pytest.raises(UsageError) as exc:
        summarize(tmp_path / "missing")
    assert exc.value.code == "STATE_DIR_NOT_FOUND"
    with pytest.raises(UsageError):
        parse_since("ayer")
    assert parse_since("2026-09-01T00:00:00") == datetime(2026, 9, 1, tzinfo=timezone.utc)


def test_provisioning_smoke_is_reported_apart(state):
    folder = state / "provisioning" / "smoke"
    smoke = AccountingStore(folder)
    smoke.write(digest("smoke-a"), {"consumer_id": "aitap.provisioning", "backend_id": "local.ollama.x",
                                    "ollama_ref": "x:1", "state": "passed", "attempts": [
        {"started_at": "2026-09-30T10:00:00+00:00", "outcome": "failed", "usage": None},
        {"started_at": "2026-09-30T10:01:00+00:00", "outcome": "completed",
         "usage": {"input_tokens": 18, "output_tokens": 3}}]})
    (folder / ("e" * 64 + ".json")).write_text(json.dumps({"journal": {}, "journal_digest": "sha256:" + "0" * 64}))
    result = summarize(state)
    assert result["totals"]["completed"] == 3 and result["journals_scanned"] == 4
    section = result["provisioning_smoke"]
    assert section["records_scanned"] == 2 and section["records_invalid"] == 1
    row = section["rows"][0]
    assert row["kind"] == "provisioning_smoke" and row["consumer_id"] == "aitap.provisioning"
    assert (row["attempts"], row["completed"], row["errors"]) == (2, 1, 1)
    assert (row["input_tokens"], row["output_tokens"], row["cost_usd"]) == (18, 3, 0.0)
    assert summarize(state, consumer_id="brain")["provisioning_smoke"]["rows"] == []
    assert summarize(state, since=parse_since("2026-09-30T10:00:30Z"))["provisioning_smoke"]["totals"]["attempts"] == 1


def test_without_provisioning_the_section_is_empty(state):
    section = summarize(state)["provisioning_smoke"]
    assert section == {"records_scanned": 0, "records_invalid": 0, "rows": [],
                       "totals": {"attempts": 0, "completed": 0, "errors": 0, "in_flight": 0, "input_tokens": 0,
                                  "output_tokens": 0, "cost_usd": 0.0}}
