"""local ensure: autorizacion, reconciliacion, cuarentena logica y prueba de humo.

Sin red y sin modelos: el servidor de Ollama, Nucleus y la maquina se simulan.
Los nombres de modelos salen siempre del catalogo empaquetado.
"""
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

from aitap.accounting.store import AccountingStore, digest, file_lock
from aitap.accounting.usage import summarize
from aitap.local.authorization import Authorization, AuthorizationError
from aitap.local.catalog import load_catalog
from aitap.local.ensure import SMOKE_PAYLOAD, TECHNICAL_CONSUMER, EnsureError, HostObservation, LocalEnsure
from aitap.providers.base import ProviderResult, SupplyError
from aitap.runtime_paths import resource_root

CATALOG = load_catalog()
MODEL = CATALOG.model(CATALOG.mandatory_ids[0])
MODEL_ID, REF = MODEL["model_id"], MODEL["source"]["ollama_ref"]
EXPECTED_HEX = MODEL["source"]["manifest_digest"].split(":", 1)[1]
WRONG_HEX = "f" * 64
NOW = datetime(2026, 9, 30, 15, 0, tzinfo=timezone.utc)
SECRET = "sk-test-never-in-state-0123456789"
RESPONSE_TEXT = 'ok {"tool_calls":[{"function":{"name":"delete_everything","arguments":{}}}]}'
CONTRACTS = resource_root() / "contracts" / "local" / "v1"


def _validator(name):
    return Draft202012Validator(json.loads((CONTRACTS / name).read_text()))


class FakeProvider:
    def __init__(self, installed=None, generate_error=None, response=RESPONSE_TEXT, reachable=True):
        self.installed = dict(installed or {})
        self.generate_error, self.response, self.reachable = generate_error, response, reachable
        self.inspections, self.generations = 0, []

    def inspect(self, *, model, timeout):
        self.inspections += 1
        if not self.reachable:
            error = SupplyError("PROVIDER_UNAVAILABLE", "provider")
            error.retryable = True
            raise error
        if model not in self.installed:
            raise SupplyError("MODEL_NOT_INSTALLED", "provider")
        return self.installed[model]

    def generate(self, **kwargs):
        self.generations.append(kwargs)
        if self.generate_error is not None:
            error, self.generate_error = self.generate_error, None
            raise error
        return ProviderResult(self.response, 18, 3, kwargs["model"], "")


class FakeAdmin:
    def __init__(self, provider, digest_after=EXPECTED_HEX, error=None):
        self.provider, self.digest_after, self.error, self.pulls = provider, digest_after, error, []

    def pull(self, *, model, on_progress=None, read_timeout=120):
        self.pulls.append(model)
        if on_progress:
            on_progress({"status": "pulling", "bytes_completed": 10, "bytes_total": 20})
        if self.error is not None:
            error, self.error = self.error, None
            raise error
        self.provider.installed[model] = self.digest_after
        from aitap.local.ollama_admin import PullOutcome
        return PullOutcome("success", MODEL["size_bytes"], MODEL["size_bytes"])


class FakeVerifier:
    def __init__(self, deny=None, consent=("consent-1",), max_bytes=None, attempts=3, smoke_deny=None):
        self.deny, self.consent, self.attempts, self.smoke_deny = deny, consent, attempts, smoke_deny
        self.max_bytes = MODEL["size_bytes"] if max_bytes is None else max_bytes
        self.calls = []

    def verify(self, **binding):
        self.calls.append(binding)
        failure = self.smoke_deny if binding["operation"] == "smoke" else self.deny
        if failure is not None:
            raise failure
        return Authorization(grant_id=binding["grant_id"], operation=binding["operation"], model_id=binding["model_id"],
                             max_bytes=self.max_bytes, smoke_max_input_tokens=256, smoke_max_output_tokens=8,
                             smoke_max_attempts=self.attempts, consent_ids=tuple(self.consent),
                             valid_until=(NOW + timedelta(hours=1)).isoformat())


def _host(verdict="APTO_CON_SALVEDADES", version="0.23.2", disk=10_000):
    return lambda model_id, catalog: HostObservation(verdict, ("GPU_ACCEL_UNAVAILABLE",), "sha256:" + "c" * 64,
                                                     version, disk, None)


def _ensure(tmp_path, provider=None, admin=None, verifier=None, host=None, concurrency=1):
    provider = provider or FakeProvider()
    admin = admin or FakeAdmin(provider)
    verifier = verifier or FakeVerifier()
    service = LocalEnsure(state_root=tmp_path, catalog=CATALOG, provider=provider, admin=admin, verifier=verifier,
                          host=host or _host(), max_concurrency=lambda backend: concurrency, clock=lambda: NOW)
    return service, provider, admin, verifier


def _request(**overrides):
    request = {"schema_version": "cognituum.local-intelligence.ensure-request/v1", "request_id": "req-1",
               "correlation_id": "corr-1", "mode": "apply", "model_id": MODEL_ID,
               "catalog_sha256": CATALOG.fingerprint, "authorization_ref": "grant-1"}
    request.update(overrides)
    return request


def _files(root):
    return sorted(p.relative_to(root).as_posix() for p in Path(root).rglob("*") if p.is_file())


def _smoke_record(root):
    folder = Path(root) / "provisioning" / "smoke"
    files = [p for p in folder.glob("*.json")]
    assert len(files) == 1
    return AccountingStore(folder).read("sha256:" + files[0].stem)


# ------------------------------------------------------------------ autorizacion y rechazos previos

def test_apply_without_authorization_never_touches_ollama(tmp_path):
    service, provider, admin, verifier = _ensure(tmp_path)
    result = service.apply(_request(authorization_ref=None))
    assert result["status"] == "action_required" and result["action_required"] == "AUTHORIZATION_REQUIRED"
    assert provider.inspections == 0 and admin.pulls == [] and verifier.calls == []
    assert _files(tmp_path) == []
    _validator("ensure-result.schema.json").validate(result)


@pytest.mark.parametrize("failure, status, code", [
    (AuthorizationError("AUTHORIZATION_DENIED", "x", reason="GRANT_REVOKED"), "rejected", "AUTHORIZATION_DENIED"),
    (AuthorizationError("AUTHORIZATION_UNVERIFIABLE", "x"), "failed", "AUTHORIZATION_UNVERIFIABLE"),
])
def test_authorization_failures_are_closed(tmp_path, failure, status, code):
    service, provider, admin, _ = _ensure(tmp_path, verifier=FakeVerifier(deny=failure))
    result = service.apply(_request())
    assert result["status"] == status and result["error"]["code"] == code
    assert provider.inspections == 0 and admin.pulls == [] and _files(tmp_path) == []


def test_consent_is_required_when_the_license_demands_it(tmp_path):
    assert MODEL["license"]["consent_required"] is True
    service, provider, _, _ = _ensure(tmp_path, verifier=FakeVerifier(consent=()))
    result = service.apply(_request())
    assert result["action_required"] == "CONSENT_REQUIRED" and provider.inspections == 0


def test_request_binding_is_sent_to_nucleus(tmp_path):
    service, _, _, verifier = _ensure(tmp_path, provider=FakeProvider({REF: EXPECTED_HEX}))
    service.apply(_request())
    assert {c["operation"] for c in verifier.calls} == {"provision", "smoke"}
    first = verifier.calls[0]
    assert first == {"grant_id": "grant-1", "operation": "provision", "model_id": MODEL_ID,
                     "catalog_sha256": CATALOG.fingerprint, "manifest_digest": MODEL["source"]["manifest_digest"],
                     "request_id": "req-1", "correlation_id": "corr-1"}


def test_catalog_mismatch_and_size_limit_are_rejected(tmp_path):
    service, provider, _, _ = _ensure(tmp_path)
    assert service.apply(_request(catalog_sha256="sha256:" + "0" * 64))["error"]["code"] == "CATALOG_MISMATCH"
    small, provider, _, _ = _ensure(tmp_path, verifier=FakeVerifier(max_bytes=1))
    assert small.apply(_request())["error"]["code"] == "AUTHORIZATION_LIMIT_EXCEEDED"
    assert provider.inspections == 0


@pytest.mark.parametrize("request_value", [{}, {"mode": "check"}, {"model_id": "bad id"}, {"extra": 1}])
def test_invalid_requests_raise(tmp_path, request_value):
    service, *_ = _ensure(tmp_path)
    with pytest.raises(EnsureError):
        service.apply(_request(**request_value) if request_value else {})


def test_unknown_model_raises(tmp_path):
    service, *_ = _ensure(tmp_path)
    with pytest.raises(EnsureError) as caught:
        service.apply(_request(model_id="not-in-catalog"))
    assert caught.value.code == "UNKNOWN_MODEL"


def test_ineligible_machine_is_rejected_before_ollama(tmp_path):
    service, provider, admin, _ = _ensure(tmp_path, host=_host(verdict="BLOQUEADO"))
    result = service.apply(_request())
    assert result["status"] == "rejected" and result["error"]["code"] == "MACHINE_INELIGIBLE"
    assert provider.inspections == 0 and admin.pulls == []


def test_state_root_inside_a_project_is_refused(tmp_path):
    (tmp_path / ".git").mkdir()
    service, *_ = _ensure(tmp_path)
    with pytest.raises(EnsureError) as caught:
        service.apply(_request())
    assert caught.value.code == "STATE_DIR_INVALID"


# ------------------------------------------------------------------ aprovisionamiento e idempotencia

def test_fresh_provisioning_reaches_ready_only_after_digest_and_smoke(tmp_path):
    service, provider, admin, _ = _ensure(tmp_path)
    result = service.apply(_request())
    _validator("ensure-result.schema.json").validate(result)
    assert result["status"] == "ready" and result["phase"] == "ready"
    assert admin.pulls == [REF] and len(provider.generations) == 1
    assert result["manifest_digest"] == {"expected": MODEL["source"]["manifest_digest"],
                                         "observed": MODEL["source"]["manifest_digest"]}
    assert result["smoke"]["passed"] and result["receipt"]["result"] == "ready"
    assert result["receipt"]["consent_ids"] == ["consent-1"]
    journal = json.loads((tmp_path / "local" / "ensure" / f"{MODEL_ID}.json").read_text())
    _validator("ensure-journal.schema.json").validate(journal)
    assert journal["phase"] == "ready" and journal["applies"] == 1


def test_smoke_reuses_the_supply_transport_with_granted_limits(tmp_path):
    service, provider, _, _ = _ensure(tmp_path, provider=FakeProvider({REF: EXPECTED_HEX}))
    service.apply(_request())
    call = provider.generations[0]
    assert call["payload"] == SMOKE_PAYLOAD and call["model"] == REF and call["max_tokens"] == 8
    assert "tools" not in json.dumps(SMOKE_PAYLOAD)
    source = Path(__import__("aitap.local.ensure", fromlist=["x"]).__file__).read_text()
    assert "/api/chat" not in source and "urlopen" not in source


def test_second_apply_is_idempotent(tmp_path):
    service, provider, admin, _ = _ensure(tmp_path)
    service.apply(_request())
    again = service.apply(_request(request_id="req-2"))
    assert again["status"] == "ready" and admin.pulls == [REF] and len(provider.generations) == 1
    journal = json.loads((tmp_path / "local" / "ensure" / f"{MODEL_ID}.json").read_text())
    assert journal["applies"] == 2
    assert len(list((tmp_path / "provisioning" / "smoke").glob("*.json"))) == 1


def test_runtime_change_requires_a_new_smoke(tmp_path):
    service, provider, _, _ = _ensure(tmp_path, provider=FakeProvider({REF: EXPECTED_HEX}))
    service.apply(_request())
    upgraded, _, _, _ = _ensure(tmp_path, provider=provider, host=_host(version="0.24.0"))
    upgraded.apply(_request(request_id="req-2"))
    assert len(provider.generations) == 2
    assert len(list((tmp_path / "provisioning" / "smoke").glob("*.json"))) == 2


def test_wrong_digest_is_quarantined_without_smoke(tmp_path):
    service, provider, admin, _ = _ensure(tmp_path, provider=FakeProvider({REF: WRONG_HEX}))
    result = service.apply(_request())
    assert result["status"] == "failed" and result["phase"] == "quarantined"
    assert result["error"]["code"] == "MODEL_DIGEST_MISMATCH" and result["error"]["details"]["quarantined"] is True
    assert result["receipt"]["result"] == "quarantined"
    assert admin.pulls == [] and provider.generations == []
    checked = service.check(MODEL_ID)
    assert checked["status"] == "failed" and checked["phase"] == "quarantined"


def test_pull_that_lands_a_wrong_digest_is_quarantined(tmp_path):
    provider = FakeProvider()
    service, _, _, _ = _ensure(tmp_path, provider=provider, admin=FakeAdmin(provider, digest_after=WRONG_HEX))
    result = service.apply(_request())
    assert result["phase"] == "quarantined" and provider.generations == []


def test_failed_pull_is_reconciled_on_retry(tmp_path):
    provider = FakeProvider()
    error = SupplyError("PULL_INTERRUPTED", "provision")
    error.retryable = True
    admin = FakeAdmin(provider, error=error)
    service, _, _, _ = _ensure(tmp_path, provider=provider, admin=admin)
    failed = service.apply(_request())
    assert failed["status"] == "failed" and failed["error"]["retryable"] is True and failed["receipt"]["result"] == "failed"
    ready = service.apply(_request(request_id="req-2"))
    assert ready["status"] == "ready" and admin.pulls == [REF, REF]


def test_interrupted_download_reconciles_from_ollama_not_from_journal(tmp_path):
    service, provider, admin, _ = _ensure(tmp_path)
    journal_path = tmp_path / "local" / "ensure" / f"{MODEL_ID}.json"
    journal_path.parent.mkdir(parents=True)
    journal_path.write_text(json.dumps({
        "schema_version": "cognituum.local-intelligence.ensure-journal/v1", "model_id": MODEL_ID, "ollama_ref": REF,
        "manifest_digest_expected": MODEL["source"]["manifest_digest"], "phase": "downloading",
        "request_id": "req-0", "correlation_id": "corr-0", "authorization_ref": "grant-1", "applies": 1,
        "progress": {"status": "pulling", "bytes_completed": 5, "bytes_total": 20, "updated_at": "x"},
        "last_observation": None, "smoke_id": None, "last_error": None, "last_receipt": None, "updated_at": "x"}))
    provider.installed[REF] = EXPECTED_HEX  # Ollama termino la descarga aunque AITAP murio
    result = service.apply(_request())
    assert result["status"] == "ready" and admin.pulls == []


def test_journal_phase_alone_never_declares_ready(tmp_path):
    service, provider, admin, _ = _ensure(tmp_path)
    service.apply(_request())
    provider.installed.clear()  # el modelo desaparecio del servidor
    result = service.apply(_request(request_id="req-2"))
    assert admin.pulls == [REF, REF] and result["status"] == "ready"
    assert service.check(MODEL_ID)["status"] == "ready"
    provider.installed.clear()
    assert service.check(MODEL_ID)["action_required"] == "MODEL_NOT_PROVISIONED"


def test_lock_held_by_another_process_reports_in_progress(tmp_path):
    service, provider, admin, _ = _ensure(tmp_path)
    lock = tmp_path / "local" / "ensure" / f"{MODEL_ID}.lock"
    with file_lock(lock):
        result = service.apply(_request())
    assert result["status"] == "in_progress" and admin.pulls == [] and provider.inspections == 0


def test_unreachable_runtime_and_insufficient_disk(tmp_path):
    service, _, _, _ = _ensure(tmp_path, provider=FakeProvider(reachable=False))
    assert service.apply(_request())["action_required"] == "RUNTIME_NOT_READY"
    other_root = tmp_path / "other"
    other_root.mkdir()
    small, _, admin, _ = _ensure(other_root, host=_host(disk=1))
    result = small.apply(_request())
    assert result["error"]["code"] == "DISK_INSUFFICIENT" and admin.pulls == []


# ------------------------------------------------------------------ prueba de humo y contabilidad

def test_smoke_records_only_digest_and_counters(tmp_path, monkeypatch):
    monkeypatch.setenv("SOME_PROVIDER_KEY", SECRET)
    service, _, _, _ = _ensure(tmp_path)
    service.apply(_request())
    record = _smoke_record(tmp_path)
    _validator("provisioning-smoke-accounting.schema.json").validate(record)
    assert record["consumer_id"] == TECHNICAL_CONSUMER and record["state"] == "passed"
    attempt = record["attempts"][0]
    assert attempt["cost_status"] == "local_zero" and attempt["cost_usd"] == 0
    assert attempt["usage"] == {"input_tokens": 18, "output_tokens": 3}
    assert attempt["response_sha256"] == "sha256:" + __import__("hashlib").sha256(RESPONSE_TEXT.encode()).hexdigest()
    for path in Path(tmp_path).rglob("*.json"):
        text = path.read_text()
        assert SECRET not in text and "delete_everything" not in text and "Reply with" not in text


def test_uncertain_smoke_is_accounted_and_retried_without_duplicate_records(tmp_path):
    uncertain = SupplyError("PROVIDER_TIMEOUT", "provider", uncertain=True)
    provider = FakeProvider({REF: EXPECTED_HEX}, generate_error=uncertain)
    service, _, _, _ = _ensure(tmp_path, provider=provider)
    first = service.apply(_request())
    assert first["status"] == "failed" and first["error"]["code"] == "PROVIDER_TIMEOUT"
    assert first["error"]["retryable"] is True
    second = service.apply(_request(request_id="req-2"))
    assert second["status"] == "ready"
    record = _smoke_record(tmp_path)
    assert [a["outcome"] for a in record["attempts"]] == ["failed", "completed"]
    assert record["attempts"][0]["delivery_uncertain"] is True


def test_interrupted_smoke_is_never_counted_as_passed(tmp_path):
    service, provider, _, _ = _ensure(tmp_path, provider=FakeProvider({REF: EXPECTED_HEX}))
    fingerprint = service.runtime_fingerprint("0.23.2")
    smoke_id = service.smoke_id(MODEL_ID, MODEL["source"]["manifest_digest"], fingerprint)
    store = AccountingStore(tmp_path / "provisioning" / "smoke")
    store.write(smoke_id, {
        "schema_version": "cognituum.local-intelligence.provisioning-smoke-accounting/v1", "smoke_id": smoke_id,
        "consumer_id": TECHNICAL_CONSUMER, "model_id": MODEL_ID, "backend_id": MODEL["backend"]["backend_id"],
        "ollama_ref": REF, "manifest_digest": MODEL["source"]["manifest_digest"], "runtime_fingerprint": fingerprint,
        "runtime_version": "0.23.2", "state": "in_flight", "attempts": [{
            "number": 1, "request_id": "req-0", "correlation_id": "corr-0", "authorization_ref": "grant-1",
            "started_at": "x", "finished_at": None, "outcome": "in_flight", "delivery_uncertain": False, "usage": None,
            "latency_ms": None, "cost_status": "local_zero", "cost_usd": 0, "response_sha256": None, "error_code": None}]})
    result = service.apply(_request())
    record = store.read(smoke_id)
    assert result["status"] == "ready"
    assert record["attempts"][0]["error_code"] == "SMOKE_INTERRUPTED" and record["attempts"][0]["delivery_uncertain"]
    assert len(record["attempts"]) == 2


def test_smoke_attempts_are_bounded_by_the_grant(tmp_path):
    error = SupplyError("PROVIDER_UNAVAILABLE", "provider", uncertain=True)
    provider = FakeProvider({REF: EXPECTED_HEX}, generate_error=error)
    service, _, _, _ = _ensure(tmp_path, provider=provider, verifier=FakeVerifier(attempts=1))
    service.apply(_request())
    blocked = service.apply(_request(request_id="req-2"))
    assert blocked["error"]["code"] == "SMOKE_ATTEMPTS_EXHAUSTED" and blocked["error"]["retryable"] is False
    assert len(provider.generations) == 1


def test_smoke_needs_its_own_authorization(tmp_path):
    denial = AuthorizationError("AUTHORIZATION_DENIED", "x", reason="GRANT_REVOKED")
    service, provider, _, _ = _ensure(tmp_path, provider=FakeProvider({REF: EXPECTED_HEX}),
                                      verifier=FakeVerifier(smoke_deny=denial))
    result = service.apply(_request())
    assert result["status"] == "rejected" and provider.generations == []


def test_smoke_respects_backend_concurrency(tmp_path):
    service, provider, _, _ = _ensure(tmp_path, provider=FakeProvider({REF: EXPECTED_HEX}))
    slot = tmp_path / "local" / "slots" / f"{MODEL['backend']['backend_id']}.0.lock"
    with file_lock(slot):
        result = service.apply(_request())
    assert result["error"]["code"] == "CONCURRENCY_LIMIT" and result["error"]["retryable"] is True
    assert provider.generations == []


def test_existing_consumer_totals_do_not_change(tmp_path):
    store = AccountingStore(tmp_path)
    store.write(digest("brain-inference"), {"consumer_id": "brain", "state": "completed", "attempts": [{
        "started_at": "2026-09-30T10:00:00+00:00", "outcome": "completed", "usage": {"input_tokens": 100,
        "output_tokens": 20}, "cost_usd": 0.0006, "cost_status": "calculated", "latency_ms": 900,
        "routing_decision": {"effective_intelligence": {"backend_id": "anthropic_api", "provider": "anthropic",
                                                        "model": "m"}}}]})
    before = summarize(tmp_path)
    service, _, _, _ = _ensure(tmp_path)
    service.apply(_request())
    after = summarize(tmp_path)
    assert (before["rows"], before["totals"], before["journals_scanned"]) == \
           (after["rows"], after["totals"], after["journals_scanned"])
    smoke = after["provisioning_smoke"]
    assert smoke["rows"][0]["kind"] == "provisioning_smoke" and smoke["rows"][0]["consumer_id"] == TECHNICAL_CONSUMER
    assert smoke["totals"]["completed"] == 1 and smoke["totals"]["cost_usd"] == 0.0
    assert summarize(tmp_path, consumer_id="brain")["provisioning_smoke"]["rows"] == []


# ------------------------------------------------------------------ check (solo lectura)

def test_check_never_writes(tmp_path):
    service, provider, admin, verifier = _ensure(tmp_path)
    result = service.check(MODEL_ID)
    _validator("ensure-result.schema.json").validate(result)
    assert result["mode"] == "check" and result["action_required"] == "MODEL_NOT_PROVISIONED"
    assert _files(tmp_path) == [] and admin.pulls == [] and verifier.calls == []


def test_check_reports_smoke_pending_and_runtime(tmp_path):
    service, _, _, _ = _ensure(tmp_path, provider=FakeProvider({REF: EXPECTED_HEX}))
    assert service.check(MODEL_ID)["action_required"] == "SMOKE_PENDING"
    down, _, _, _ = _ensure(tmp_path, provider=FakeProvider(reachable=False))
    assert down.check(MODEL_ID)["action_required"] == "RUNTIME_NOT_READY"
    blocked, _, _, _ = _ensure(tmp_path, host=_host(verdict="BLOQUEADO"))
    assert blocked.check(MODEL_ID)["status"] == "rejected"
