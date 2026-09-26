import base64
import json
import os
import secrets
import socket
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from aitap.providers.base import SupplyError


def _app_data_dir():
    override = os.environ.get("BLOOM_APPDATA_DIR")
    if override:
        return Path(override)
    if os.name == "nt":
        return Path(os.environ.get("LOCALAPPDATA", str(Path.home() / "AppData" / "Local"))) / "BloomNucleus"
    if os.uname().sysname == "Darwin":
        return Path.home() / "Library" / "BloomNucleus"
    return Path(os.environ.get("XDG_DATA_HOME", str(Path.home() / ".local" / "share"))) / "BloomNucleus"


def _b64url(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _identity(app_data):
    try:
        path = app_data / "authority" / "aitap-service-identity.json"
        raw = json.loads(path.read_text(encoding="utf-8"))
        private = base64.b64decode(raw["private_key"], validate=True)
        public = base64.b64decode(raw["public_key"], validate=True)
        if len(private) != 64 or len(public) != 32 or private[32:] != public:
            raise ValueError()
        signer = Ed25519PrivateKey.from_private_bytes(private[:32])
        if signer.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw) != public:
            raise ValueError()
        return signer
    except (OSError, ValueError, KeyError, TypeError):
        raise SupplyError("VAULT_ACCESS_DENIED", "vault") from None


def _binding(app_data):
    try:
        config = json.loads((app_data / "config" / "nucleus.json").read_text(encoding="utf-8"))
        onboarding = config["onboarding"]
        active = next(o for o in onboarding["organizations"] if o["org_slug"] == onboarding["active_org_slug"])
        organization_id = active["organization_id"]
        identity = json.loads((app_data / "authority" / "identity.json").read_text(encoding="utf-8"))
        installation_id = identity["installation_id"]
        grant_id = os.environ["AITAP_VAULT_GRANT_ID"]
        if not all(isinstance(v, str) and v and "\n" not in v and "\r" not in v
                   for v in (organization_id, installation_id, grant_id)):
            raise ValueError()
        return organization_id, installation_id, grant_id
    except (OSError, ValueError, KeyError, StopIteration, TypeError):
        raise SupplyError("VAULT_ACCESS_DENIED", "vault") from None


class VaultClient:
    def __init__(self, binary=None, runner=None, app_data=None):
        self.binary = binary or os.environ.get("NUCLEUS_BIN", "nucleus")
        self.runner = runner or subprocess.run
        self.app_data = Path(app_data) if app_data is not None else _app_data_dir()

    def resolve(self, reference, purpose=None):
        if reference != "credential-ref://anthropic/default":
            raise SupplyError("CREDENTIAL_NOT_FOUND", "vault")
        if purpose != "mandate_genesis_intelligence":
            raise SupplyError("VAULT_ACCESS_DENIED", "vault")
        key_id = "anthropic-key:default"
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
                "nonce": _b64url(secrets.token_bytes(32)),
                "channel_port": listener.getsockname()[1],
                "channel_token": _b64url(secrets.token_bytes(32)),
            }
            message = "\n".join(["BLOOM-AITAP-VAULT-REQUEST-v1", request["grant_id"], request["organization_id"],
                                 request["installation_id"], request["key_id"], request["purpose"],
                                 request["timestamp"], request["nonce"], str(request["channel_port"]),
                                 request["channel_token"]]).encode("utf-8")
            request["signature"] = _b64url(signer.sign(message))
            try:
                result = self.runner([self.binary, "--json", "vault", "service-request"],
                                     input=json.dumps(request, separators=(",", ":")), capture_output=True,
                                     text=True, encoding="utf-8", timeout=10)
            except (OSError, subprocess.TimeoutExpired):
                raise SupplyError("VAULT_UNAVAILABLE", "vault") from None
            if result.returncode:
                raise SupplyError("VAULT_ACCESS_DENIED", "vault")
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
