"""Aprovisionamiento local idempotente y autorizado (``aitap local ensure``).

Reconciliador de un modelo del catalogo contra el servidor local de Ollama:

- ``check``: solo lectura. Observa ``/api/tags``, el journal y el registro de la
  prueba de humo; no escribe, no descarga y no pide autorizacion.
- ``apply``: exige una ``authorization_ref`` que Nucleus verifica (operacion
  ``provision``) y, si la licencia lo pide, consentimiento registrado. Toma un
  lock no bloqueante por modelo, observa Ollama (la observacion gana sobre el
  journal), pide la descarga solo si falta, verifica el digest del catalogo y
  corre una prueba de humo autorizada (operacion ``smoke``) por el mismo
  transporte del suministro. ``ready`` solo con digest correcto y prueba
  aprobada para ese digest y runtime.

Fronteras: los pesos los escribe Ollama; un digest distinto deja el modelo en
cuarentena logica (no se mueve ni se borra nada); la respuesta de la prueba de
humo nunca se interpreta ni se ejecuta: solo se guarda su digest. La prueba se
contabiliza aparte, con el consumidor tecnico reservado ``aitap.provisioning``.
No registra servicios del sistema operativo ni escribe telemetria.
"""
from __future__ import annotations

import json
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from jsonschema import Draft202012Validator

from aitap.access import enforcement
from aitap.accounting.store import AccountingStore, atomic_json, canonical, digest, file_lock, text_digest
from aitap.local.authorization import Authorization, AuthorizationError, NucleusAuthorizationVerifier
from aitap.local.catalog import Catalog, load_catalog
from aitap.local.ollama_admin import OllamaAdmin
from aitap.local.paths import PathGuardError, allowed_root, resolve_under
from aitap.providers.base import SupplyError
from aitap.providers.ollama import OllamaProvider, normalize_digest
from aitap.runtime_paths import resource_root

TECHNICAL_CONSUMER = "aitap.provisioning"
RESULT_VERSION = "cognituum.local-intelligence.ensure-result/v1"
JOURNAL_VERSION = "cognituum.local-intelligence.ensure-journal/v1"
SMOKE_VERSION = "cognituum.local-intelligence.provisioning-smoke-accounting/v1"
REQUEST_VERSION = "cognituum.local-intelligence.ensure-request/v1"
# Pedido fijo de la prueba de humo: no declara herramientas y no contiene datos del usuario.
SMOKE_PAYLOAD = {"aitap_provisioning_smoke": "Reply with one short word."}
INSPECT_TIMEOUT = 10
PROGRESS_WRITE_SECONDS = 2.0


class EnsureError(ValueError):
    """Pedido invalido o estado no utilizable; el comando lo traduce al envelope de error."""

    def __init__(self, code: str, message: str, *, stage: str = "ensure", retryable: bool = False):
        self.code, self.stage, self.retryable = code, stage, retryable
        super().__init__(message)


@dataclass(frozen=True)
class HostObservation:
    machine_verdict: str
    machine_reasons: tuple[str, ...]
    machine_fingerprint: str | None
    runtime_version: str | None
    disk_free_mb: int | None
    ollama_host: str | None


def observe_host(model_id: str, catalog: Catalog) -> HostObservation:
    """Observacion de solo lectura de la maquina y del runtime, via la verificacion previa."""
    from aitap.local.preflight import default_collector, run_preflight

    captured: dict[str, Any] = {}

    def collector(base: Path) -> dict[str, Any]:
        observed = default_collector()(base)
        captured.update(observed)
        return observed

    result = run_preflight(catalog=catalog, selection=[model_id], collector=collector)
    verdict = result["verdicts"][0]
    readiness = result["readiness"]
    return HostObservation(
        machine_verdict=verdict["machine_eligibility"]["verdict"],
        machine_reasons=tuple(verdict["machine_eligibility"]["reasons"]),
        machine_fingerprint=result.get("machine_eligibility_fingerprint"),
        runtime_version=(readiness.get("ollama") or {}).get("version"),
        disk_free_mb=(readiness.get("disk_free_mb") or {}).get("ollama_store"),
        ollama_host=captured.get("ollama_host"))


def _validator(name: str) -> Draft202012Validator:
    path = resource_root() / "contracts" / "local" / "v1" / name
    return Draft202012Validator(json.loads(path.read_text(encoding="utf-8")))


def _prefixed(value: str | None) -> str | None:
    hexdigest = normalize_digest(value)
    return "sha256:" + hexdigest if hexdigest else None


class LocalEnsure:
    """Reconciliador. Todas las dependencias externas son inyectables para pruebas."""

    def __init__(self, *, state_root: str | Path, catalog: Catalog | None = None,
                 provider: Any = None, admin: Any = None, verifier: Any = None,
                 host: Callable[[str, Catalog], HostObservation] | None = None,
                 max_concurrency: Callable[[str], int] | None = None,
                 clock: Callable[[], datetime] | None = None):
        self.state_root = state_root
        self._catalog = catalog
        self._provider, self._admin = provider, admin
        self.verifier = verifier
        self.host = host or observe_host
        self.max_concurrency = max_concurrency or self._policy_concurrency
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        self._host_seen: HostObservation | None = None

    # ------------------------------------------------------------------ dependencias
    @property
    def catalog(self) -> Catalog:
        if self._catalog is None:
            self._catalog = load_catalog()
        return self._catalog

    def provider(self):
        if self._provider is None:
            self._provider = OllamaProvider(self._host_seen.ollama_host if self._host_seen else None)
        return self._provider

    def admin(self):
        if self._admin is None:
            self._admin = OllamaAdmin(self._host_seen.ollama_host if self._host_seen else None)
        return self._admin

    def _verifier(self):
        if self.verifier is None:
            self.verifier = NucleusAuthorizationVerifier()
        return self.verifier

    def _policy_concurrency(self, backend_id: str) -> int:
        try:
            from aitap.access.policy import load_access_policy
            rule = load_access_policy(self.catalog).rule(backend_id)
            return int(rule["quotas"]["max_concurrency"]) if rule else 1
        except Exception:  # la politica ilegible nunca amplia la concurrencia
            return 1

    def _now(self) -> str:
        return self.clock().astimezone(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")

    # ------------------------------------------------------------------ utilidades
    def _model(self, model_id: str) -> dict[str, Any]:
        model = self.catalog.model(model_id)
        if model is None:
            raise EnsureError("UNKNOWN_MODEL", "modelo no presente en el catalogo", stage="request")
        if model["runtime"] != "ollama" or not model["source"].get("ollama_ref"):
            raise EnsureError("UNSUPPORTED_RUNTIME", "el modelo no se sirve por Ollama", stage="catalog")
        if _prefixed(model["source"].get("manifest_digest")) is None:
            raise EnsureError("MANIFEST_DIGEST_MISSING", "el catalogo no fija el digest del modelo", stage="catalog")
        return model

    def _root(self) -> Path:
        try:
            return allowed_root(self.state_root)
        except PathGuardError as exc:
            raise EnsureError(exc.code, str(exc), stage="state") from None

    @staticmethod
    def _journal_path(root: Path, model_id: str) -> Path:
        return resolve_under(root, "local", "ensure", f"{model_id}.json")

    def _read_journal(self, root: Path, model_id: str) -> dict[str, Any] | None:
        path = self._journal_path(root, model_id)
        if not path.exists():
            return None
        try:
            journal = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            raise EnsureError("STATE_CONFLICT", "journal de aprovisionamiento ilegible", stage="journal") from None
        if next(_validator("ensure-journal.schema.json").iter_errors(journal), None) is not None:
            raise EnsureError("STATE_CONFLICT", "journal de aprovisionamiento invalido", stage="journal")
        return journal

    def _write_journal(self, root: Path, journal: dict[str, Any]) -> None:
        journal["updated_at"] = self._now()
        error = next(_validator("ensure-journal.schema.json").iter_errors(journal), None)
        if error is not None:
            raise EnsureError("STATE_CONFLICT", "journal de aprovisionamiento invalido", stage="journal")
        atomic_json(self._journal_path(root, journal["model_id"]), journal)

    def _smoke_store(self, root: Path) -> AccountingStore:
        return AccountingStore(resolve_under(root, "provisioning", "smoke"))

    @staticmethod
    def runtime_fingerprint(version: str | None) -> str | None:
        return digest(["ollama", version]) if version else None

    @staticmethod
    def smoke_id(model_id: str, manifest_digest: str, runtime_fingerprint: str) -> str:
        return digest(["provisioning-smoke", model_id, manifest_digest, runtime_fingerprint])

    def _observe(self, ref: str) -> tuple[bool | None, str | None, SupplyError | None]:
        """(instalado, digest con prefijo, error de transporte). Nunca envia nada al modelo."""
        try:
            observed = self.provider().inspect(model=ref, timeout=INSPECT_TIMEOUT)
            return True, _prefixed(observed), None
        except SupplyError as exc:
            if exc.code == "MODEL_NOT_INSTALLED":
                return False, None, None
            if exc.code == "MODEL_DIGEST_MISMATCH":
                return True, None, None
            return None, None, exc

    def _result(self, *, mode: str, status: str, model: dict[str, Any], request: dict[str, Any] | None,
                observed: str | None = None, phase: str | None = None, progress: dict[str, int] | None = None,
                smoke: dict[str, Any] | None = None, receipt: dict[str, Any] | None = None,
                journal: bool = False, host: HostObservation | None = None,
                action: str | None = None, error: dict[str, Any] | None = None) -> dict[str, Any]:
        result = {
            "schema_version": RESULT_VERSION,
            "mode": mode,
            "status": status,
            "request_id": (request or {}).get("request_id"),
            "correlation_id": (request or {}).get("correlation_id"),
            "model_id": model["model_id"],
            "ollama_ref": model["source"]["ollama_ref"],
            "manifest_digest": {"expected": _prefixed(model["source"]["manifest_digest"]), "observed": observed},
            "phase": phase,
            "progress": progress,
            "smoke": smoke,
            "receipt": receipt,
            "journal_ref": f"local/ensure/{model['model_id']}.json" if journal else None,
            "fingerprints": {"catalog": self.catalog.fingerprint,
                             "runtime": self.runtime_fingerprint(host.runtime_version) if host else None,
                             "machine_eligibility": host.machine_fingerprint if host else None},
            "action_required": action,
            "error": error,
            "observed_at": self._now(),
        }
        if next(_validator("ensure-result.schema.json").iter_errors(result), None) is not None:
            raise EnsureError("STATE_CONFLICT", "resultado de aprovisionamiento invalido", stage="result")
        return result

    @staticmethod
    def _error(code: str, stage: str, *, retryable: bool = False, **details: Any) -> dict[str, Any]:
        return {"code": code, "stage": stage, "retryable": retryable, "details": details}

    @staticmethod
    def _smoke_summary(record: dict[str, Any] | None, smoke_id: str | None) -> dict[str, Any] | None:
        if record is None or smoke_id is None:
            return None
        last = record["attempts"][-1] if record["attempts"] else None
        usage = (last or {}).get("usage") or {}
        return {"smoke_id": smoke_id, "passed": record["state"] == "passed", "attempts": len(record["attempts"]),
                "input_tokens": usage.get("input_tokens"), "output_tokens": usage.get("output_tokens"),
                "latency_ms": (last or {}).get("latency_ms"), "response_sha256": (last or {}).get("response_sha256")}

    # ------------------------------------------------------------------ check (solo lectura)
    def check(self, model_id: str) -> dict[str, Any]:
        model = self._model(model_id)
        root = self._root()
        journal = self._read_journal(root, model_id)
        host = self._host_seen = self.host(model_id, self.catalog)
        expected = _prefixed(model["source"]["manifest_digest"])
        installed, observed, transport = self._observe(model["source"]["ollama_ref"])
        record, smoke_id = None, None
        fingerprint = self.runtime_fingerprint(host.runtime_version)
        if fingerprint:
            smoke_id = self.smoke_id(model_id, expected, fingerprint)
            try:
                record = self._smoke_store(root).read(smoke_id)
            except SupplyError:
                raise EnsureError("STATE_CONFLICT", "registro de prueba de humo invalido", stage="smoke") from None
        common = dict(mode="check", model=model, request=None, observed=observed, host=host,
                      journal=journal is not None, phase=journal["phase"] if journal else None,
                      smoke=self._smoke_summary(record, smoke_id))
        if host.machine_verdict == "BLOQUEADO":
            return self._result(status="rejected", error=self._error("MACHINE_INELIGIBLE", "eligibility",
                                                                     reasons=list(host.machine_reasons)), **common)
        if installed is None:
            return self._result(status="action_required", action="RUNTIME_NOT_READY",
                                error=self._error(transport.code, "provider", retryable=True) if transport else None,
                                **common)
        if installed and observed != expected:
            return self._result(status="failed", error=self._error("MODEL_DIGEST_MISMATCH", "verify",
                                                                   quarantined=True), **{**common, "phase": "quarantined"})
        if installed:
            if record is not None and record["state"] == "passed":
                return self._result(status="ready", **common)
            return self._result(status="action_required", action="SMOKE_PENDING", **common)
        if journal and journal["phase"] == "downloading":
            progress = journal["progress"]
            return self._result(status="in_progress", progress={"bytes_completed": progress["bytes_completed"],
                                                                "bytes_total": progress["bytes_total"]}
                                if progress else None, **common)
        return self._result(status="action_required", action="MODEL_NOT_PROVISIONED", **common)

    # ------------------------------------------------------------------ apply
    def apply(self, request: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(request, dict) or next(_validator("ensure-request.schema.json").iter_errors(request), None):
            raise EnsureError("INVALID_REQUEST", "el pedido no cumple ensure-request/v1", stage="request")
        if request["mode"] != "apply":
            raise EnsureError("INVALID_REQUEST", "apply exige mode apply", stage="request")
        model = self._model(request["model_id"])
        if request["catalog_sha256"] != self.catalog.fingerprint:
            return self._result(mode="apply", status="rejected", model=model, request=request,
                                error=self._error("CATALOG_MISMATCH", "catalog"))
        root = self._root()
        if not request.get("authorization_ref"):
            return self._result(mode="apply", status="action_required", model=model, request=request,
                                action="AUTHORIZATION_REQUIRED")
        expected = _prefixed(model["source"]["manifest_digest"])
        try:
            authorization = self._authorize("provision", request, model, expected)
        except AuthorizationError as exc:
            return self._authorization_failure(exc, model, request)
        if model["license"].get("consent_required") and not authorization.consent_ids:
            return self._result(mode="apply", status="action_required", model=model, request=request,
                                action="CONSENT_REQUIRED")
        if model["size_bytes"] > authorization.max_bytes:
            return self._result(mode="apply", status="rejected", model=model, request=request,
                                error=self._error("AUTHORIZATION_LIMIT_EXCEEDED", "access",
                                                  size_bytes=model["size_bytes"], max_bytes=authorization.max_bytes))
        host = self._host_seen = self.host(model["model_id"], self.catalog)
        if host.machine_verdict == "BLOQUEADO":
            return self._result(mode="apply", status="rejected", model=model, request=request, host=host,
                                error=self._error("MACHINE_INELIGIBLE", "eligibility", reasons=list(host.machine_reasons)))
        lock_path = resolve_under(root, "local", "ensure", f"{model['model_id']}.lock")
        try:
            with file_lock(lock_path):
                return self._apply_locked(root, request, model, expected, authorization, host)
        except SupplyError as exc:
            if exc.code != "STATE_CONFLICT" or exc.stage != "lock":
                raise
            journal = self._read_journal(root, model["model_id"])
            progress = (journal or {}).get("progress")
            return self._result(mode="apply", status="in_progress", model=model, request=request, host=host,
                                journal=journal is not None, phase=(journal or {}).get("phase"),
                                progress={"bytes_completed": progress["bytes_completed"],
                                          "bytes_total": progress["bytes_total"]} if progress else None)

    def _authorize(self, operation: str, request: dict[str, Any], model: dict[str, Any], expected: str) -> Authorization:
        return self._verifier().verify(grant_id=request["authorization_ref"], operation=operation,
                                       model_id=model["model_id"], catalog_sha256=self.catalog.fingerprint,
                                       manifest_digest=expected, request_id=request["request_id"],
                                       correlation_id=request["correlation_id"])

    def _authorization_failure(self, exc: AuthorizationError, model, request, host=None, journal=False):
        if exc.code == "AUTHORIZATION_DENIED":
            return self._result(mode="apply", status="rejected", model=model, request=request, host=host,
                                journal=journal, error=self._error("AUTHORIZATION_DENIED", "authorization",
                                                                   reason=exc.reason))
        return self._result(mode="apply", status="failed", model=model, request=request, host=host, journal=journal,
                            error=self._error("AUTHORIZATION_UNVERIFIABLE", "authorization", retryable=True))

    def _apply_locked(self, root, request, model, expected, authorization, host) -> dict[str, Any]:
        started = time.monotonic()
        model_id, ref = model["model_id"], model["source"]["ollama_ref"]
        previous = self._read_journal(root, model_id)
        journal = {
            "schema_version": JOURNAL_VERSION, "model_id": model_id, "ollama_ref": ref,
            "manifest_digest_expected": expected, "phase": "queued",
            "request_id": request["request_id"], "correlation_id": request["correlation_id"],
            "authorization_ref": request["authorization_ref"],
            "applies": (previous["applies"] + 1) if previous else 1,
            "progress": None, "last_observation": (previous or {}).get("last_observation"),
            "smoke_id": (previous or {}).get("smoke_id"), "last_error": None,
            "last_receipt": (previous or {}).get("last_receipt"), "updated_at": self._now(),
        }
        self._write_journal(root, journal)
        downloaded = 0

        def finish(status, *, phase, observed=None, error=None, action=None, smoke=None, result_kind=None):
            journal["phase"] = phase
            if error is not None:
                journal["last_error"] = {"code": error["code"], "stage": error["stage"], "retryable": error["retryable"]}
            receipt = None
            if result_kind is not None:
                finished_at = self._now()
                receipt = {
                    "receipt_id": digest([request["request_id"], model_id, finished_at]),
                    "request_id": request["request_id"], "correlation_id": request["correlation_id"],
                    "authorization_ref": request["authorization_ref"],
                    "consent_ids": list(authorization.consent_ids), "model_id": model_id,
                    "manifest_digest": {"expected": expected, "observed": observed},
                    "bytes_downloaded": downloaded, "duration_ms": int((time.monotonic() - started) * 1000),
                    "runtime_version": host.runtime_version, "smoke_id": journal["smoke_id"],
                    "result": result_kind, "finished_at": finished_at,
                }
                journal["last_receipt"] = receipt
            self._write_journal(root, journal)
            return self._result(mode="apply", status=status, model=model, request=request, observed=observed,
                                phase=phase, smoke=smoke, receipt=receipt, journal=True, host=host,
                                action=action, error=error)

        def observe():
            installed, observed, transport = self._observe(ref)
            journal["last_observation"] = {"installed": installed, "manifest_digest": observed,
                                           "observed_at": self._now()}
            return installed, observed, transport

        installed, observed, transport = observe()
        if installed is None:
            return finish("action_required", phase="failed", action="RUNTIME_NOT_READY",
                          error=self._error(transport.code, "provider", retryable=True))
        if installed and observed != expected:
            return finish("failed", phase="quarantined", observed=observed, result_kind="quarantined",
                          error=self._error("MODEL_DIGEST_MISMATCH", "verify", quarantined=True))
        if not installed:
            free = host.disk_free_mb
            if free is not None and free * 1024 * 1024 < model["size_bytes"]:
                return finish("failed", phase="failed", result_kind="failed",
                              error=self._error("DISK_INSUFFICIENT", "provision", retryable=True))
            journal["phase"] = "downloading"
            last_write = [0.0]

            def on_progress(event):
                journal["progress"] = {"status": event["status"], "bytes_completed": event["bytes_completed"],
                                       "bytes_total": event["bytes_total"], "updated_at": self._now()}
                now = time.monotonic()
                if now - last_write[0] >= PROGRESS_WRITE_SECONDS:
                    last_write[0] = now
                    self._write_journal(root, journal)

            self._write_journal(root, journal)
            try:
                outcome = self.admin().pull(model=ref, on_progress=on_progress)
                downloaded = outcome.bytes_completed
            except SupplyError as exc:
                return finish("failed", phase="failed", result_kind="failed",
                              error=self._error(exc.code, "provision", retryable=bool(exc.retryable)))
            journal["phase"] = "verifying"
            installed, observed, transport = observe()
            if installed is None:
                return finish("action_required", phase="failed", action="RUNTIME_NOT_READY",
                              error=self._error(transport.code, "provider", retryable=True))
            if not installed:
                return finish("failed", phase="failed", result_kind="failed",
                              error=self._error("PULL_INCOMPLETE", "verify", retryable=True))
            if observed != expected:
                return finish("failed", phase="quarantined", observed=observed, result_kind="quarantined",
                              error=self._error("MODEL_DIGEST_MISMATCH", "verify", quarantined=True))

        # ---- prueba de humo, una por modelo + digest + runtime
        fingerprint = self.runtime_fingerprint(host.runtime_version)
        if fingerprint is None:
            return finish("action_required", phase="failed", observed=observed, action="RUNTIME_NOT_READY",
                          error=self._error("RUNTIME_VERSION_UNKNOWN", "smoke", retryable=True))
        smoke_id = self.smoke_id(model_id, expected, fingerprint)
        journal["smoke_id"] = smoke_id
        journal["phase"] = "smoke_testing"
        self._write_journal(root, journal)
        store = self._smoke_store(root)
        try:
            with store.lock(smoke_id):
                record, blocked, max_attempts = store.read(smoke_id), None, None
                if record is None or record["state"] != "passed":
                    record, blocked, max_attempts = self._run_smoke(root, store, smoke_id, record, request, model,
                                                                    expected, fingerprint, host)
        except AuthorizationError as exc:
            journal["phase"] = "failed"
            self._write_journal(root, journal)
            return self._authorization_failure(exc, model, request, host=host, journal=True)
        except SupplyError as exc:
            # Lock ocupado, concurrencia agotada o persistencia: nada se envio al modelo en este intento.
            return finish("failed", phase="failed", observed=observed,
                          error=self._error(exc.code, "smoke",
                                            retryable=exc.code in ("STATE_CONFLICT", "CONCURRENCY_LIMIT")))
        summary = self._smoke_summary(record, smoke_id)
        if record["state"] != "passed":
            last = record["attempts"][-1] if record["attempts"] else {}
            code = blocked or last.get("error_code") or "SMOKE_FAILED"
            retryable = blocked is None and max_attempts is not None and len(record["attempts"]) < max_attempts
            return finish("failed", phase="failed", observed=observed, smoke=summary, result_kind="failed",
                          error=self._error(code, "smoke", retryable=retryable))
        return finish("ready", phase="ready", observed=observed, smoke=summary, result_kind="ready")

    def _run_smoke(self, root, store, smoke_id, record, request, model, expected, fingerprint, host):
        """Devuelve (registro, codigo de bloqueo o None, intentos maximos autorizados)."""
        authorization = self._authorize("smoke", request, model, expected)
        limit = authorization.smoke_max_attempts
        record = record or {
            "schema_version": SMOKE_VERSION, "smoke_id": smoke_id, "consumer_id": TECHNICAL_CONSUMER,
            "model_id": model["model_id"], "backend_id": model["backend"]["backend_id"],
            "ollama_ref": model["source"]["ollama_ref"], "manifest_digest": expected,
            "runtime_fingerprint": fingerprint, "runtime_version": host.runtime_version,
            "state": "failed", "attempts": [],
        }
        if record["state"] == "in_flight":
            # Un intento previo quedo sin cierre: se registra como incierto y nunca se da por aprobado.
            last = record["attempts"][-1]
            last.update(outcome="failed", delivery_uncertain=True, finished_at=self._now(),
                        error_code="SMOKE_INTERRUPTED")
            record["state"] = "failed"
            self._write_smoke(store, smoke_id, record)
        if len(record["attempts"]) >= limit:
            return record, "SMOKE_ATTEMPTS_EXHAUSTED", limit
        # Cota conservadora: los bytes del pedido acotan sus tokens.
        if len(canonical(SMOKE_PAYLOAD).encode("utf-8")) > authorization.smoke_max_input_tokens:
            return record, "SMOKE_INPUT_EXCEEDS_AUTHORIZATION", limit
        backend_id = model["backend"]["backend_id"]
        with enforcement.concurrency_slot(root, backend_id, self.max_concurrency(backend_id)):
            # Verificacion de digest inmediatamente antes del envio, como en el suministro.
            installed, observed, transport = self._observe(model["source"]["ollama_ref"])
            if not installed or observed != expected:
                code = "MODEL_DIGEST_MISMATCH" if installed else (transport.code if transport else "MODEL_NOT_INSTALLED")
                record["attempts"].append(self._attempt(record, request, outcome="failed", uncertain=False,
                                                        error_code=code))
                record["state"] = "failed"
                self._write_smoke(store, smoke_id, record)
                return record, None, limit
            attempt = self._attempt(record, request, outcome="in_flight", uncertain=False, error_code=None)
            record["attempts"].append(attempt)
            record["state"] = "in_flight"
            self._write_smoke(store, smoke_id, record)
            began = time.monotonic()
            try:
                result = self.provider().generate(payload=SMOKE_PAYLOAD, model=model["source"]["ollama_ref"],
                                                  max_tokens=authorization.smoke_max_output_tokens,
                                                  timeout=60, options={"temperature": 0})
            except SupplyError as exc:
                attempt.update(outcome="failed", delivery_uncertain=bool(exc.uncertain), finished_at=self._now(),
                               latency_ms=int((time.monotonic() - began) * 1000), error_code=exc.code)
                record["state"] = "failed"
                self._write_smoke(store, smoke_id, record)
                return record, None, limit
            # La respuesta nunca se interpreta ni se ejecuta: solo su digest y sus contadores.
            attempt.update(outcome="completed", finished_at=self._now(),
                           latency_ms=int((time.monotonic() - began) * 1000),
                           usage={"input_tokens": result.input_tokens, "output_tokens": result.output_tokens},
                           response_sha256=text_digest(result.raw_response))
            record["state"] = "passed"
            self._write_smoke(store, smoke_id, record)
            return record, None, limit

    def _attempt(self, record, request, *, outcome, uncertain, error_code):
        return {"number": len(record["attempts"]) + 1, "request_id": request["request_id"],
                "correlation_id": request["correlation_id"], "authorization_ref": request["authorization_ref"],
                "started_at": self._now(), "finished_at": None if outcome == "in_flight" else self._now(),
                "outcome": outcome, "delivery_uncertain": uncertain, "usage": None, "latency_ms": None,
                "cost_status": "local_zero", "cost_usd": 0, "response_sha256": None, "error_code": error_code}

    def _write_smoke(self, store: AccountingStore, smoke_id: str, record: dict[str, Any]) -> None:
        if next(_validator("provisioning-smoke-accounting.schema.json").iter_errors(record), None) is not None:
            raise SupplyError("ACCOUNTING_PERSIST_FAILED", "smoke", "Smoke accounting record invalid")
        store.write(smoke_id, record)
