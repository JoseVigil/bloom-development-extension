import json
from types import SimpleNamespace

import pytest
from aitap.vault.client import VaultClient
from aitap.providers.base import SupplyError


def test_reference_resolves_via_nucleus_only():
    def runner(command, **kwargs):
        assert command == ["nucleus", "--json", "vault", "request", "anthropic-key:default"]
        return SimpleNamespace(returncode=0, stdout=json.dumps({"key_id": "anthropic-key:default", "key": "secret"}), stderr="")
    assert VaultClient("nucleus", runner).resolve("credential-ref://anthropic/default") == "secret"


@pytest.mark.parametrize("output,code", [("vault is locked", "VAULT_LOCKED"), ("secret not found", "CREDENTIAL_NOT_FOUND")])
def test_vault_errors_are_sanitized(output, code):
    client = VaultClient(runner=lambda *a, **k: SimpleNamespace(returncode=1, stdout=output, stderr=""))
    with pytest.raises(SupplyError) as error:
        client.resolve("credential-ref://anthropic/default")
    assert error.value.code == code
    assert output not in str(error.value)


def test_denied_role_is_not_reported_as_missing_credential():
    client = VaultClient(runner=lambda *a, **k: SimpleNamespace(returncode=1,
        stdout="Error: vault access denied - requires master role", stderr=""))
    with pytest.raises(SupplyError) as error:
        client.resolve("credential-ref://anthropic/default")
    assert error.value.code == "VAULT_ACCESS_DENIED"
    assert not error.value.retryable
