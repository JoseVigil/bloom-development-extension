import json
import os
import subprocess

from aitap.providers.base import SupplyError


class VaultClient:
    def __init__(self, binary=None, runner=None):
        self.binary = binary or os.environ.get("NUCLEUS_BIN", "nucleus")
        self.runner = runner or subprocess.run

    def resolve(self, reference):
        if reference != "credential-ref://anthropic/default":
            raise SupplyError("CREDENTIAL_NOT_FOUND", "vault")
        key_id = "anthropic-key:default"
        try:
            result = self.runner([self.binary, "--json", "vault", "request", key_id],
                capture_output=True, text=True, encoding="utf-8", timeout=10)
        except (OSError, subprocess.TimeoutExpired):
            raise SupplyError("CREDENTIAL_NOT_FOUND", "vault", "Nucleus Vault unavailable") from None
        if result.returncode:
            output = (result.stderr + result.stdout).lower()
            if "master role" in output or "access denied" in output or "unauthorized" in output:
                code = "VAULT_ACCESS_DENIED"
            elif "organization_id_missing" in output or "authority_base_url_missing" in output:
                code = "VAULT_CONTEXT_INVALID"
            elif "locked" in output:
                code = "VAULT_LOCKED"
            elif "not found" in output or "not be found" in output:
                code = "CREDENTIAL_NOT_FOUND"
            else:
                code = "VAULT_UNAVAILABLE"
            raise SupplyError(code, "vault")
        try:
            data = json.loads(result.stdout)
            if data["key_id"] != key_id or not isinstance(data["key"], str) or not data["key"]:
                raise ValueError()
            return data["key"]
        except (ValueError, KeyError, TypeError):
            # Never include stdout, stderr, or subprocess exception text.
            raise SupplyError("CREDENTIAL_NOT_FOUND", "vault") from None
