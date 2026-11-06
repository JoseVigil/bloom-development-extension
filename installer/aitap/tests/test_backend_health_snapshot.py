import json
from datetime import datetime, timezone

from aitap.health.backend_snapshot import (
    BACKEND_HEALTH_TTL_SECONDS, load_backend_health, observe_backend_health,
)
from aitap.health.cloud_models import ModelCatalogProbe
from aitap.providers.base import SupplyError


NOW = datetime(2026, 10, 31, 12, 0, tzinfo=timezone.utc)
REGISTRY = {"intelligence_backends": [{
    "backend_id": "gemini_api", "provider": "google", "model": "gemini-test",
    "credential_ref": "credential-ref://gemini/default",
}]}


def write_snapshot(path, *, observed_at="2026-10-31T11:59:50Z", status="healthy",
                   provider="google"):
    path.write_text(json.dumps({
        "schema_version": "bloom.aitap.backend-health/v1", "snapshot_id": "health/1",
        "generated_at": observed_at,
        "backends": [{"backend_id": "gemini_api", "provider": provider,
                      "model": "gemini-test", "status": status, "observed_at": observed_at}],
    }), encoding="utf-8")


def test_fresh_snapshot_is_bound_to_registry_and_has_a_short_expiry(tmp_path):
    path = tmp_path / "health.json"
    write_snapshot(path)
    result = load_backend_health(path, REGISTRY, now=NOW)
    assert result.status == "fresh" and result.snapshot_id == "health/1"
    assert result.evidence["gemini_api"]["status"] == "healthy"
    assert result.evidence["gemini_api"]["valid_until"] == "2026-10-31T12:00:20Z"
    assert BACKEND_HEALTH_TTL_SECONDS == 30


def test_missing_stale_and_registry_mismatch_never_become_available(tmp_path):
    missing = load_backend_health(tmp_path / "absent.json", REGISTRY, now=NOW)
    assert missing.status == "missing" and missing.evidence == {}
    path = tmp_path / "health.json"
    write_snapshot(path, observed_at="2026-10-31T11:59:29Z")
    stale = load_backend_health(path, REGISTRY, now=NOW)
    assert stale.status == "stale"
    assert stale.evidence["gemini_api"]["valid_until"] < "2026-10-31T12:00:00Z"
    write_snapshot(path, provider="fabricated")
    mismatch = load_backend_health(path, REGISTRY, now=NOW)
    assert mismatch.status == "invalid" and mismatch.reason == "HEALTH_EVIDENCE_BINDING_MISMATCH"


def test_explicit_unknown_is_preserved_and_not_promoted(tmp_path):
    path = tmp_path / "health.json"
    write_snapshot(path, status="unknown")
    result = load_backend_health(path, REGISTRY, now=NOW)
    assert result.evidence["gemini_api"]["status"] == "unknown"


class FakeVault:
    def __init__(self, error=None):
        self.calls = []
        self.error = error

    def resolve(self, reference, purpose=None):
        self.calls.append((reference, purpose))
        if self.error:
            raise self.error
        return "secret-never-exposed"


def test_cloud_health_uses_exact_vault_purpose_and_models_probe(tmp_path):
    vault = FakeVault()
    calls = []

    def probe(backend, secret):
        calls.append((dict(backend), secret))
        return ModelCatalogProbe("healthy", "google.models.get", None,
                                 {"response_sha256": "a" * 64})

    source = observe_backend_health(tmp_path, REGISTRY, now=NOW, vault=vault, cloud_probe=probe)
    observed = source.evidence["gemini_api"]
    assert observed["status"] == "healthy"
    assert observed["origin"] == "google.models.get"
    assert observed["fingerprint"].startswith("sha256:")
    assert observed["observed_at"] == "2026-10-31T12:00:00Z"
    assert observed["valid_until"] == "2026-10-31T12:00:30Z"
    assert vault.calls == [("credential-ref://gemini/default", "models_api_health_probe:gemini_api")]
    assert calls[0][1] == "secret-never-exposed"
    assert "secret-never-exposed" not in json.dumps(observed)


def test_vault_denial_is_unavailable_and_accounting_is_not_a_substitute(tmp_path):
    (tmp_path / ("a" * 64 + ".json")).write_text(json.dumps({"historical": "completed"}), encoding="utf-8")
    denied = SupplyError("VAULT_ACCESS_DENIED", "vault")
    source = observe_backend_health(tmp_path, REGISTRY, now=NOW, vault=FakeVault(denied),
                                    cloud_probe=lambda *_args: (_ for _ in ()).throw(
                                        AssertionError("probe must not run")))
    observed = source.evidence["gemini_api"]
    assert observed["status"] == "unavailable"
    assert observed["origin"] == "nucleus.vault.service_request"
    assert observed["reason"] == "VAULT_ACCESS_DENIED"


def test_ollama_health_uses_tags_inspection_and_never_generation(tmp_path):
    calls = []

    class FakeOllama:
        def inspect(self, *, model, timeout):
            calls.append((model, timeout))
            return "b" * 64

        def generate(self, **kwargs):
            raise AssertionError("health must not generate")

    registry = {"intelligence_backends": [{
        "backend_id": "local", "provider": "ollama", "model": "model:tag",
        "model_digest": "b" * 64, "privacy": "local",
    }]}
    source = observe_backend_health(tmp_path, registry, now=NOW, ollama_factory=FakeOllama)
    assert calls == [("model:tag", 5)]
    assert source.evidence["local"]["status"] == "healthy"
    assert source.evidence["local"]["origin"] == "ollama.api.tags"
