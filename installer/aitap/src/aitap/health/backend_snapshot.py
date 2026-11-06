"""AITAP-owned, read-only health evidence for Intelligence Supply backends."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Mapping

from jsonschema import Draft202012Validator, FormatChecker

from aitap.runtime_paths import resource_root
from aitap.accounting.store import canonical, digest
from aitap.local.paths import PathGuardError, allowed_root
from aitap.providers.base import SupplyError
from aitap.providers.ollama import OllamaProvider
from aitap.health.cloud_models import probe_cloud_model
from aitap.vault.client import VaultClient


BACKEND_HEALTH_SCHEMA = "bloom.aitap.backend-health/v1"
BACKEND_HEALTH_TTL_SECONDS = 30


@dataclass(frozen=True)
class BackendHealthSource:
    status: str
    reason: str | None
    snapshot_id: str | None
    evidence: dict[str, dict[str, Any]]


def observe_backend_health(
    state_dir: Path | None, registry: Mapping[str, Any], *, now: datetime,
    ollama_factory=OllamaProvider, vault=None, cloud_probe=probe_cloud_model,
) -> BackendHealthSource:
    """Build backend health only from verifiable, token-free observations.

    Local Ollama backends are inspected through ``GET /api/tags``. The two
    approved cloud backends retrieve their exact resource from the provider's
    official Models API after a signed Nucleus Vault request. No generative
    endpoint or prior Accounting attempt is used as availability evidence.
    """
    if now.tzinfo is None:
        return BackendHealthSource("invalid", "INVALID_CURRENT_TIME", None, {})
    if state_dir is None:
        return BackendHealthSource("missing", "HEALTH_EVIDENCE_MISSING", None, {})
    try:
        root = allowed_root(state_dir)
    except PathGuardError:
        return BackendHealthSource("invalid", "HEALTH_STATE_DIR_INVALID", None, {})

    backends = [item for item in registry.get("intelligence_backends", []) if isinstance(item, dict)]
    observations: dict[str, dict[str, Any]] = {}
    for backend in backends:
        if backend.get("provider") == "ollama" and backend.get("privacy") == "local":
            observations[str(backend.get("backend_id"))] = _observe_ollama(
                backend, now=now, factory=ollama_factory)
        elif (backend.get("backend_id"), backend.get("provider")) in {
                ("anthropic_api", "anthropic"), ("gemini_api", "google")}:
            observations[str(backend.get("backend_id"))] = _observe_cloud(
                backend, now=now, vault=vault or VaultClient(), probe=cloud_probe)
    evidence = {key: value for key, value in observations.items() if value is not None}
    if not evidence:
        return BackendHealthSource("missing", "HEALTH_EVIDENCE_MISSING", None, {})
    identity = [{"backend_id": key, "fingerprint": value["fingerprint"]}
                for key, value in sorted(evidence.items())]
    has_fresh = any(_timestamp(item["valid_until"]) > now.astimezone(timezone.utc)
                    for item in evidence.values())
    return BackendHealthSource("fresh" if has_fresh else "stale",
                               None if has_fresh else "HEALTH_EVIDENCE_STALE",
                               digest(identity), evidence)


def _observe_cloud(backend: Mapping[str, Any], *, now: datetime, vault, probe) -> dict[str, Any]:
    binding = tuple(backend.get(field) for field in ("backend_id", "provider", "model"))
    purpose = "models_api_health_probe:" + str(backend.get("backend_id"))
    secret = None
    try:
        secret = vault.resolve(backend.get("credential_ref"), purpose=purpose)
        result = probe(backend, secret)
        return _observation(binding, status=result.status, origin=result.origin,
                            observed_at=now, reason=result.reason, proof=result.proof)
    except SupplyError as exc:
        return _observation(binding, status="unavailable", origin="nucleus.vault.service_request",
                            observed_at=now, reason=exc.code, proof={})
    except (OSError, ValueError, TypeError):
        return _observation(binding, status="unavailable", origin="models_api.invalid",
                            observed_at=now, reason="HEALTH_PROBE_INVALID", proof={})
    finally:
        secret = None


def _observe_ollama(backend: Mapping[str, Any], *, now: datetime, factory) -> dict[str, Any]:
    binding = tuple(backend.get(field) for field in ("backend_id", "provider", "model"))
    expected = backend.get("model_digest")
    status, reason, proof = "unknown", "MODEL_DIGEST_UNVERIFIABLE", {}
    try:
        observed = factory().inspect(model=str(backend.get("model")), timeout=5)
        proof = {"manifest_sha256": observed}
        if isinstance(expected, str) and expected.removeprefix("sha256:") == observed:
            status, reason = "healthy", None
        else:
            status, reason = "unavailable", "MODEL_DIGEST_MISMATCH"
    except SupplyError as exc:
        status, reason = "unavailable", exc.code
    return _observation(binding, status=status, origin="ollama.api.tags", observed_at=now,
                        reason=reason, proof=proof)


def _observation(binding, *, status: str, origin: str, observed_at: datetime,
                 reason: str | None, proof: Mapping[str, Any]) -> dict[str, Any]:
    valid_until = observed_at + timedelta(seconds=BACKEND_HEALTH_TTL_SECONDS)
    identity = {"backend_id": binding[0], "provider": binding[1], "model": binding[2],
                "status": status, "origin": origin, "observed_at": _timestamp_text(observed_at),
                "valid_until": _timestamp_text(valid_until), "reason": reason, "proof": proof}
    return {"status": status, "origin": origin,
            "fingerprint": "sha256:" + hashlib.sha256(canonical(identity).encode("utf-8")).hexdigest(),
            "observed_at": identity["observed_at"], "valid_until": identity["valid_until"],
            "reason": reason}


def load_backend_health(path: Path | None, registry: Mapping[str, Any], *, now: datetime) -> BackendHealthSource:
    """Load fresh observations; never infer health from registry configuration."""
    if now.tzinfo is None:
        return BackendHealthSource("invalid", "INVALID_CURRENT_TIME", None, {})
    if path is None or not path.is_file():
        return BackendHealthSource("missing", "HEALTH_EVIDENCE_MISSING", None, {})
    try:
        raw = path.read_bytes()
        document = json.loads(raw.decode("utf-8"))
        schema = json.loads((resource_root() / "contracts/v2/backend-health-snapshot.schema.json")
                            .read_text(encoding="utf-8"))
        errors = list(Draft202012Validator(schema, format_checker=FormatChecker()).iter_errors(document))
        if errors:
            raise ValueError()
        _timestamp(document["generated_at"])
    except (OSError, UnicodeError, ValueError, TypeError, KeyError):
        return BackendHealthSource("invalid", "HEALTH_EVIDENCE_INVALID", None, {})

    registered = {(item.get("backend_id"), item.get("provider"), item.get("model"))
                  for item in registry.get("intelligence_backends", []) if isinstance(item, dict)}
    evidence: dict[str, dict[str, Any]] = {}
    file_digest = hashlib.sha256(raw).hexdigest()
    for item in document["backends"]:
        binding = (item["backend_id"], item["provider"], item["model"])
        if binding not in registered or item["backend_id"] in evidence:
            return BackendHealthSource("invalid", "HEALTH_EVIDENCE_BINDING_MISMATCH",
                                       document["snapshot_id"], {})
        observed_at = _timestamp(item["observed_at"])
        valid_until = observed_at + timedelta(seconds=BACKEND_HEALTH_TTL_SECONDS)
        fingerprint_raw = json.dumps(
            {"snapshot_sha256": file_digest, "backend": item}, sort_keys=True,
            separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        evidence[item["backend_id"]] = {
            "status": item["status"],
            "fingerprint": "sha256:" + hashlib.sha256(fingerprint_raw).hexdigest(),
            "observed_at": _timestamp_text(observed_at),
            "valid_until": _timestamp_text(valid_until),
        }
    has_fresh = any(_timestamp(item["valid_until"]) > now.astimezone(timezone.utc)
                    for item in evidence.values())
    return BackendHealthSource("fresh" if has_fresh else "stale",
                               None if has_fresh else "HEALTH_EVIDENCE_STALE",
                               document["snapshot_id"], evidence)


def default_backend_health_path(state_dir: Path | None) -> Path | None:
    return state_dir / "health" / "backend-health-v1.json" if state_dir is not None else None


def _timestamp(value: Any) -> datetime:
    if not isinstance(value, str) or not value:
        raise ValueError("timestamp required")
    parsed = datetime.fromisoformat(value[:-1] + "+00:00" if value.endswith("Z") else value)
    if parsed.tzinfo is None:
        raise ValueError("timezone required")
    return parsed.astimezone(timezone.utc)


def _timestamp_text(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
