import base64
import json
import socket
from types import SimpleNamespace

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from aitap.vault.client import VaultClient
from aitap.providers.base import SupplyError


def fixture(tmp_path, monkeypatch):
    authority = tmp_path / "authority"
    authority.mkdir()
    (tmp_path / "config").mkdir()
    private = Ed25519PrivateKey.generate()
    seed = private.private_bytes(serialization.Encoding.Raw, serialization.PrivateFormat.Raw,
                                 serialization.NoEncryption())
    public = private.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
    (authority / "aitap-service-identity.json").write_text(json.dumps({"private_key": base64.b64encode(seed + public).decode(),
                                                                         "public_key": base64.b64encode(public).decode()}))
    (authority / "identity.json").write_text(json.dumps({"installation_id": "installation-1"}))
    (tmp_path / "config" / "nucleus.json").write_text(json.dumps({"onboarding":{"active_org_slug":"org",
        "organizations":[{"org_slug":"org","organization_id":"canonical-org"}]}}))
    monkeypatch.setenv("AITAP_VAULT_GRANT_ID", "grant-1")
    return private


def test_signed_request_uses_local_channel_and_sanitized_stdout(tmp_path, monkeypatch):
    private = fixture(tmp_path, monkeypatch)
    secret = "fixture-secret-never-in-stdout"
    captured = {}

    def runner(command, **kwargs):
        assert command == ["nucleus", "--json", "vault", "service-request"]
        assert "anthropic-key:default" not in command
        request = json.loads(kwargs["input"])
        captured.update(request)
        message = "\n".join(["BLOOM-AITAP-VAULT-REQUEST-v1", request["grant_id"], request["organization_id"],
                             request["installation_id"], request["key_id"], request["purpose"],
                             request["timestamp"], request["nonce"], str(request["channel_port"]),
                             request["channel_token"]]).encode()
        private.public_key().verify(base64.urlsafe_b64decode(request["signature"] + "=="), message)
        with socket.create_connection(("127.0.0.1", request["channel_port"])) as channel:
            channel.sendall(json.dumps({"token":request["channel_token"],"key":secret}).encode() + b"\n")
        return SimpleNamespace(returncode=0, stdout='{"status":"delivered"}\n', stderr="")

    assert VaultClient("nucleus", runner, tmp_path).resolve("credential-ref://anthropic/default",purpose="mandate_genesis_intelligence") == secret
    assert secret not in json.dumps(captured)


def test_denial_never_reads_stdout_as_secret(tmp_path, monkeypatch):
    fixture(tmp_path, monkeypatch)
    client = VaultClient("nucleus", lambda *_args, **_kwargs: SimpleNamespace(returncode=1,
        stdout='{"key":"sensitive"}', stderr="sensitive"), tmp_path)
    with pytest.raises(SupplyError) as error:
        client.resolve("credential-ref://anthropic/default",purpose="mandate_genesis_intelligence")
    assert error.value.code == "VAULT_ACCESS_DENIED"
    assert "sensitive" not in str(error.value)


def test_missing_identity_or_grant_fails_closed(tmp_path, monkeypatch):
    with pytest.raises(SupplyError) as error:
        VaultClient(app_data=tmp_path).resolve("credential-ref://anthropic/default")
    assert error.value.code == "VAULT_ACCESS_DENIED"
    with pytest.raises(SupplyError) as error:
        VaultClient(app_data=tmp_path).resolve("credential-ref://anthropic/default",purpose="mandate_genesis_intelligence")
    assert error.value.code == "VAULT_ACCESS_DENIED"
    fixture(tmp_path, monkeypatch)
    monkeypatch.delenv("AITAP_VAULT_GRANT_ID")
    with pytest.raises(SupplyError) as error:
        VaultClient(app_data=tmp_path).resolve("credential-ref://anthropic/default",purpose="mandate_genesis_intelligence")
    assert error.value.code == "VAULT_ACCESS_DENIED"
