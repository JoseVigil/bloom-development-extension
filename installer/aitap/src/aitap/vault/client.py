import json
import os
import secrets
import socket
import subprocess
import re
from datetime import datetime, timezone
from pathlib import Path

from aitap.providers.base import SupplyError
from aitap.service_identity import ServiceIdentityError, app_data_dir, b64url, load_binding, load_signer


_DENIAL_STAGES = {"service_identity", "installation_binding", "request", "binding", "timestamp", "nonce", "channel", "active_context", "grant",
                  "signature", "replay", "vault_status", "credential", "channel_connect", "channel_write"}


def _denial_message(stderr):
    match = re.search(r"(?:^|\s)VAULT_DENIAL_STAGE=([a-z_]+)(?:\s|$)", stderr or "")
    stage = match.group(1) if match and match.group(1) in _DENIAL_STAGES else None
    return f"VAULT_ACCESS_DENIED [stage={stage}]" if stage else "VAULT_ACCESS_DENIED"


def _identity(app_data):
    try:
        return load_signer(app_data)
    except ServiceIdentityError:
        raise SupplyError("VAULT_ACCESS_DENIED", "vault",
                          "VAULT_ACCESS_DENIED [stage=service_identity]") from None


def _binding(app_data):
    try:
        binding = load_binding(app_data)
        grant_id = os.environ["AITAP_VAULT_GRANT_ID"]
        if not (isinstance(grant_id, str) and grant_id and "\n" not in grant_id and "\r" not in grant_id):
            raise ValueError()
        return binding.organization_id, binding.installation_id, grant_id
    except (ServiceIdentityError, ValueError, KeyError):
        raise SupplyError("VAULT_ACCESS_DENIED", "vault",
                          "VAULT_ACCESS_DENIED [stage=installation_binding]") from None


class VaultClient:
    def __init__(self, binary=None, runner=None, app_data=None):
        self.binary = binary or os.environ.get("NUCLEUS_BIN", "nucleus")
        self.runner = runner or subprocess.run
        self.app_data = Path(app_data) if app_data is not None else app_data_dir()

    def resolve(self, reference, purpose=None):
        references = {"credential-ref://anthropic/default": "anthropic-key:default",
                      "credential-ref://gemini/default": "gemini-key:default"}
        if reference not in references:
            raise SupplyError("CREDENTIAL_NOT_FOUND", "vault")
        if purpose not in ("mandate_intelligence", "mandate_genesis_intelligence", "mandate_gen_intelligence"):
            raise SupplyError("VAULT_ACCESS_DENIED", "vault")
        key_id = references[reference]
        signer = _identity(self.app_data)
        organization_id, installation_id, grant_id = _binding(self.app_data)
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
            listener.bind(("127.0.0.1", 0))
            listener.listen(1)
            listener.settimeout(4)
            request = {
                "grant_id": grant_id,
                "organization_id": organization_id,
                "installation_id": installation_id,
                "key_id": key_id,
                "purpose": purpose,
                "timestamp": datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z"),
                "nonce": b64url(secrets.token_bytes(32)),
                "channel_port": listener.getsockname()[1],
                "channel_token": b64url(secrets.token_bytes(32)),
            }
            message = "\n".join(["BLOOM-AITAP-VAULT-REQUEST-v1", request["grant_id"], request["organization_id"],
                                 request["installation_id"], request["key_id"], request["purpose"],
                                 request["timestamp"], request["nonce"], str(request["channel_port"]),
                                 request["channel_token"]]).encode("utf-8")
            request["signature"] = b64url(signer.sign(message))
            try:
                result = self.runner([self.binary, "--json", "vault", "service-request"],
                                     input=json.dumps(request, separators=(",", ":")), capture_output=True,
                                     text=True, encoding="utf-8", timeout=10)
            except (OSError, subprocess.TimeoutExpired):
                raise SupplyError("VAULT_UNAVAILABLE", "vault") from None
            if result.returncode:
                raise SupplyError("VAULT_ACCESS_DENIED", "vault", _denial_message(result.stderr))
            try:
                if json.loads(result.stdout) != {"status": "delivered"}:
                    raise ValueError()
                connection, _ = listener.accept()
                with connection:
                    connection.settimeout(3)
                    data = bytearray()
                    while not data.endswith(b"\n") and len(data) < 16384:
                        chunk = connection.recv(4096)
                        if not chunk:
                            break
                        data.extend(chunk)
                delivered = json.loads(data)
                if (set(delivered) != {"token", "key"} or delivered["token"] != request["channel_token"]
                        or not isinstance(delivered["key"], str) or not delivered["key"]):
                    raise ValueError()
                return delivered["key"]
            except (OSError, ValueError, TypeError, KeyError):
                raise SupplyError("VAULT_UNAVAILABLE", "vault") from None
