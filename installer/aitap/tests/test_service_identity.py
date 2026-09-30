import base64
import json

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from aitap.service_identity import (ServiceIdentityError, app_data_dir, b64url, load_binding, load_signer)


def _enroll(root, private=None):
    private = private or Ed25519PrivateKey.generate()
    seed = private.private_bytes(serialization.Encoding.Raw, serialization.PrivateFormat.Raw, serialization.NoEncryption())
    public = private.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
    (root / "authority").mkdir(exist_ok=True)
    (root / "authority" / "aitap-service-identity.json").write_text(json.dumps(
        {"private_key": base64.b64encode(seed + public).decode(), "public_key": base64.b64encode(public).decode()}))
    return private, public


def _bind(root, organization="org-1", installation="inst-1"):
    (root / "config").mkdir(exist_ok=True)
    (root / "authority").mkdir(exist_ok=True)
    (root / "config" / "nucleus.json").write_text(json.dumps({"onboarding": {
        "active_org_slug": "org", "organizations": [{"org_slug": "org", "organization_id": organization}]}}))
    (root / "authority" / "identity.json").write_text(json.dumps({"installation_id": installation}))


def test_signer_matches_enrolled_public_key(tmp_path):
    _, public = _enroll(tmp_path)
    signer = load_signer(tmp_path)
    assert signer.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw) == public


def test_missing_corrupt_or_inconsistent_identity_fails_closed(tmp_path):
    with pytest.raises(ServiceIdentityError):
        load_signer(tmp_path)
    _enroll(tmp_path)
    path = tmp_path / "authority" / "aitap-service-identity.json"
    document = json.loads(path.read_text())
    other = Ed25519PrivateKey.generate().public_key().public_bytes(serialization.Encoding.Raw,
                                                                   serialization.PublicFormat.Raw)
    path.write_text(json.dumps({**document, "public_key": base64.b64encode(other).decode()}))
    with pytest.raises(ServiceIdentityError):
        load_signer(tmp_path)
    path.write_text("no-json")
    with pytest.raises(ServiceIdentityError):
        load_signer(tmp_path)


def test_error_never_carries_key_material(tmp_path):
    _enroll(tmp_path)
    path = tmp_path / "authority" / "aitap-service-identity.json"
    document = json.loads(path.read_text())
    path.write_text(json.dumps({**document, "public_key": "AAAA"}))
    with pytest.raises(ServiceIdentityError) as caught:
        load_signer(tmp_path)
    assert document["private_key"] not in str(caught.value)


def test_binding_reads_active_organization_and_installation(tmp_path):
    _bind(tmp_path)
    binding = load_binding(tmp_path)
    assert (binding.organization_id, binding.installation_id) == ("org-1", "inst-1")


@pytest.mark.parametrize("organization, installation", [("org\n1", "inst-1"), ("org-1", ""), ("org-1", 7)])
def test_binding_rejects_multiline_or_empty_values(tmp_path, organization, installation):
    _bind(tmp_path, organization, installation)
    with pytest.raises(ServiceIdentityError):
        load_binding(tmp_path)


def test_binding_without_files_fails_closed(tmp_path):
    with pytest.raises(ServiceIdentityError):
        load_binding(tmp_path)


def test_app_data_override_and_b64url(tmp_path, monkeypatch):
    monkeypatch.setenv("BLOOM_APPDATA_DIR", str(tmp_path))
    assert app_data_dir() == tmp_path
    assert b64url(b"\xff" * 32) == "_" * 42 + "8"
