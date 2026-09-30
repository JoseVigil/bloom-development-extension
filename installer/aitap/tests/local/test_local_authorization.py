import base64
import json
import subprocess
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from aitap.local.authorization import (MESSAGE_DOMAIN, VERIFY_ARGS, AuthorizationError,
                                       NucleusAuthorizationVerifier, signed_message)

NOW = datetime(2026, 9, 30, 15, 0, tzinfo=timezone.utc)
SECRET_MARKER = "never-a-secret-value-in-argv"
BINDING = dict(grant_id="grant-1", operation="provision", model_id="model-a",
               catalog_sha256="sha256:" + "a" * 64, manifest_digest="sha256:" + "b" * 64,
               request_id="req-1", correlation_id="corr-1")


def _enroll(root):
    private = Ed25519PrivateKey.generate()
    seed = private.private_bytes(serialization.Encoding.Raw, serialization.PrivateFormat.Raw, serialization.NoEncryption())
    public = private.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
    for folder in ("authority", "config"):
        (root / folder).mkdir(exist_ok=True)
    (root / "authority" / "aitap-service-identity.json").write_text(json.dumps(
        {"private_key": base64.b64encode(seed + public).decode(), "public_key": base64.b64encode(public).decode()}))
    (root / "authority" / "identity.json").write_text(json.dumps({"installation_id": "inst-1"}))
    (root / "config" / "nucleus.json").write_text(json.dumps({"onboarding": {
        "active_org_slug": "org", "organizations": [{"org_slug": "org", "organization_id": "org-1"}]}}))
    return private.public_key()


def _allowed(**overrides):
    result = {"schema_version": "cognituum.local-intelligence.provision-authorization-result/v1",
              "status": "allowed", "reason": "GRANTED", "grant_id": "grant-1", "request_id": "req-1",
              "operation": "provision", "model_id": "model-a",
              "limits": {"max_bytes": 400_000_000,
                         "smoke": {"max_input_tokens": 256, "max_output_tokens": 16, "max_attempts": 3}},
              "consent_ids": ["consent-1"], "valid_until": (NOW + timedelta(hours=1)).isoformat(),
              "verified_at": NOW.isoformat()}
    result.update(overrides)
    return result


def _verifier(tmp_path, stdout=None, returncode=0, exc=None, captured=None):
    def runner(command, **kwargs):
        if captured is not None:
            captured.update(command=command, **kwargs)
        if exc is not None:
            raise exc
        return SimpleNamespace(returncode=returncode, stdout=stdout if isinstance(stdout, str) else json.dumps(stdout),
                               stderr="")
    return NucleusAuthorizationVerifier(binary="nucleus-test", runner=runner, app_data=tmp_path, clock=lambda: NOW)


def test_allowed_request_is_signed_bound_and_sent_by_stdin(tmp_path, monkeypatch):
    monkeypatch.setenv("SOME_SECRET", SECRET_MARKER)
    public = _enroll(tmp_path)
    captured = {}
    authorization = _verifier(tmp_path, _allowed(), captured=captured).verify(**BINDING)
    assert captured["command"] == ["nucleus-test", *VERIFY_ARGS]
    assert VERIFY_ARGS == ("--json", "intelligence", "local", "authorization", "verify")
    assert SECRET_MARKER not in " ".join(captured["command"]) and captured["timeout"] == 10
    request = json.loads(captured["input"])
    assert request["organization_id"] == "org-1" and request["installation_id"] == "inst-1"
    assert {k: request[k] for k in BINDING} == BINDING
    signature = base64.urlsafe_b64decode(request["signature"] + "==")
    public.verify(signature, signed_message(request))
    assert signed_message(request).decode().startswith(MESSAGE_DOMAIN + "\n")
    assert len(base64.urlsafe_b64decode(request["nonce"] + "=")) == 32
    assert authorization.max_bytes == 400_000_000 and authorization.smoke_max_attempts == 3
    assert authorization.consent_ids == ("consent-1",)


def test_each_request_uses_a_fresh_nonce(tmp_path):
    _enroll(tmp_path)
    nonces = set()
    for _ in range(3):
        captured = {}
        _verifier(tmp_path, _allowed(), captured=captured).verify(**BINDING)
        nonces.add(json.loads(captured["input"])["nonce"])
    assert len(nonces) == 3


@pytest.mark.parametrize("reason", ["GRANT_NOT_FOUND", "GRANT_EXPIRED", "GRANT_REVOKED", "MODEL_NOT_GRANTED",
                                    "CATALOG_MISMATCH", "CONSENT_MISSING", "SIGNATURE_INVALID", "REPLAY"])
def test_denials_carry_nucleus_reason(tmp_path, reason):
    _enroll(tmp_path)
    denied = _allowed(status="denied", reason=reason, limits=None, valid_until=None)
    with pytest.raises(AuthorizationError) as caught:
        _verifier(tmp_path, denied).verify(**BINDING)
    assert caught.value.code == "AUTHORIZATION_DENIED" and caught.value.reason == reason


def test_expired_allowance_is_denied(tmp_path):
    _enroll(tmp_path)
    with pytest.raises(AuthorizationError) as caught:
        _verifier(tmp_path, _allowed(valid_until=(NOW - timedelta(seconds=1)).isoformat())).verify(**BINDING)
    assert caught.value.reason == "GRANT_EXPIRED"


@pytest.mark.parametrize("kwargs", [
    {"stdout": "not-json"},
    {"stdout": {"status": "allowed"}},
    {"stdout": _allowed(reason="REPLAY")},
    {"stdout": _allowed(grant_id="other-grant")},
    {"stdout": _allowed(request_id="req-2")},
    {"stdout": _allowed(operation="smoke")},
    {"stdout": _allowed(model_id="model-b")},
    {"stdout": _allowed(), "returncode": 3},
    {"exc": subprocess.TimeoutExpired("nucleus", 10)},
    {"exc": FileNotFoundError("nucleus")},
])
def test_anything_unverifiable_fails_closed(tmp_path, kwargs):
    _enroll(tmp_path)
    with pytest.raises(AuthorizationError) as caught:
        _verifier(tmp_path, **kwargs).verify(**BINDING)
    assert caught.value.code == "AUTHORIZATION_UNVERIFIABLE"


def test_missing_identity_fails_closed_without_calling_nucleus(tmp_path):
    calls = []
    verifier = NucleusAuthorizationVerifier(runner=lambda *a, **k: calls.append(a), app_data=tmp_path, clock=lambda: NOW)
    with pytest.raises(AuthorizationError) as caught:
        verifier.verify(**BINDING)
    assert caught.value.code == "AUTHORIZATION_UNVERIFIABLE" and calls == []


def test_request_with_unsafe_identifier_is_not_sent(tmp_path):
    _enroll(tmp_path)
    calls = []
    verifier = NucleusAuthorizationVerifier(runner=lambda *a, **k: calls.append(a), app_data=tmp_path, clock=lambda: NOW)
    with pytest.raises(AuthorizationError):
        verifier.verify(**{**BINDING, "grant_id": "grant\n1"})
    assert calls == []
