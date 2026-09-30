"""Verificacion por Nucleus de una ``authorization_ref`` de aprovisionamiento local.

Contrato provisional aprobado (D-AUTH): AITAP envia por stdin a
``nucleus --json intelligence local authorization verify`` un pedido firmado con
su identidad de servicio y Nucleus responde por stdout si el grant permite la
operacion. Mismo patron que la solicitud de Vault, sin canal de secretos: la
respuesta no contiene secretos.

- Separacion de dominio: el mensaje firmado empieza con ``MESSAGE_DOMAIN``.
- ``timestamp`` y ``nonce`` de 32 bytes: Nucleus aplica ventana y anti-replay.
- Binding: organizacion, instalacion, modelo, catalogo, digest, operacion y pedido.
- Argumentos fijos: nada del pedido viaja en la linea de comandos.
- Fallo cerrado: salida invalida, binding distinto, exit code distinto de cero,
  timeout o identidad ausente => ``AUTHORIZATION_UNVERIFIABLE``.

AITAP no se autoautoriza: este modulo nunca decide un permiso por su cuenta.
"""
from __future__ import annotations

import json
import os
import secrets
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from jsonschema import Draft202012Validator

from aitap.runtime_paths import resource_root
from aitap.service_identity import ServiceIdentityError, app_data_dir, b64url, load_binding, load_signer

MESSAGE_DOMAIN = "BLOOM-AITAP-LOCAL-PROVISION-VERIFY-v1"
VERIFY_ARGS = ("--json", "intelligence", "local", "authorization", "verify")
REQUEST_SCHEMA = "provision-authorization-request.schema.json"
RESULT_SCHEMA = "provision-authorization-result.schema.json"
REQUEST_VERSION = "cognituum.local-intelligence.provision-authorization-request/v1"
TIMEOUT_SECONDS = 10


class AuthorizationError(ValueError):
    """``code``: AUTHORIZATION_DENIED (con ``reason`` de Nucleus) o AUTHORIZATION_UNVERIFIABLE."""

    def __init__(self, code: str, message: str, *, reason: str | None = None):
        self.code, self.reason = code, reason
        super().__init__(message)


@dataclass(frozen=True)
class Authorization:
    grant_id: str
    operation: str
    model_id: str
    max_bytes: int
    smoke_max_input_tokens: int
    smoke_max_output_tokens: int
    smoke_max_attempts: int
    consent_ids: tuple[str, ...]
    valid_until: str


def _schema(name: str) -> Draft202012Validator:
    path = resource_root() / "contracts" / "local" / "v1" / name
    return Draft202012Validator(json.loads(path.read_text(encoding="utf-8")))


def signed_message(request: dict[str, Any]) -> bytes:
    fields = ("grant_id", "organization_id", "installation_id", "operation", "model_id", "catalog_sha256",
              "manifest_digest", "request_id", "correlation_id", "timestamp", "nonce")
    return "\n".join([MESSAGE_DOMAIN, *(str(request[f]) for f in fields)]).encode("utf-8")


def _unverifiable(message: str) -> AuthorizationError:
    return AuthorizationError("AUTHORIZATION_UNVERIFIABLE", message)


def _parse_time(value: str) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (AttributeError, ValueError):
        return None
    return parsed if parsed.tzinfo else None


class NucleusAuthorizationVerifier:
    """Pide a Nucleus que verifique el grant. Inyectable para pruebas (``runner``, ``clock``)."""

    def __init__(self, binary: str | None = None, runner: Callable[..., Any] | None = None,
                 app_data: Path | None = None, clock: Callable[[], datetime] | None = None):
        self.binary = binary or os.environ.get("NUCLEUS_BIN", "nucleus")
        self.runner = runner or subprocess.run
        self.app_data = Path(app_data) if app_data is not None else app_data_dir()
        self.clock = clock or (lambda: datetime.now(timezone.utc))

    def build_request(self, *, grant_id: str, operation: str, model_id: str, catalog_sha256: str,
                      manifest_digest: str, request_id: str, correlation_id: str) -> dict[str, Any]:
        try:
            signer = load_signer(self.app_data)
            binding = load_binding(self.app_data)
        except ServiceIdentityError:
            raise _unverifiable("AITAP service identity or installation binding unavailable") from None
        request = {
            "schema_version": REQUEST_VERSION,
            "grant_id": grant_id,
            "organization_id": binding.organization_id,
            "installation_id": binding.installation_id,
            "operation": operation,
            "model_id": model_id,
            "catalog_sha256": catalog_sha256,
            "manifest_digest": manifest_digest,
            "request_id": request_id,
            "correlation_id": correlation_id,
            "timestamp": self.clock().astimezone(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z"),
            "nonce": b64url(secrets.token_bytes(32)),
        }
        request["signature"] = b64url(signer.sign(signed_message(request)))
        if next(_schema(REQUEST_SCHEMA).iter_errors(request), None) is not None:
            raise _unverifiable("Authorization request does not satisfy its contract")
        return request

    def verify(self, *, grant_id: str, operation: str, model_id: str, catalog_sha256: str,
               manifest_digest: str, request_id: str, correlation_id: str) -> Authorization:
        request = self.build_request(grant_id=grant_id, operation=operation, model_id=model_id,
                                     catalog_sha256=catalog_sha256, manifest_digest=manifest_digest,
                                     request_id=request_id, correlation_id=correlation_id)
        try:
            completed = self.runner([self.binary, *VERIFY_ARGS], input=json.dumps(request, separators=(",", ":")),
                                    capture_output=True, text=True, encoding="utf-8", timeout=TIMEOUT_SECONDS)
        except (OSError, subprocess.TimeoutExpired):
            raise _unverifiable("Nucleus authorization verifier unavailable") from None
        if completed.returncode != 0:
            raise _unverifiable("Nucleus authorization verifier failed")
        try:
            result = json.loads(completed.stdout)
        except (TypeError, ValueError):
            raise _unverifiable("Nucleus authorization verifier returned invalid JSON") from None
        if not isinstance(result, dict) or next(_schema(RESULT_SCHEMA).iter_errors(result), None) is not None:
            raise _unverifiable("Nucleus authorization result does not satisfy its contract")
        if (result["grant_id"] != grant_id or result["request_id"] != request_id
                or result["operation"] != operation or result["model_id"] != model_id):
            raise _unverifiable("Nucleus authorization result does not match the request binding")
        if result["status"] != "allowed":
            raise AuthorizationError("AUTHORIZATION_DENIED", "Nucleus denied the authorization",
                                     reason=result["reason"])
        valid_until = _parse_time(result["valid_until"])
        if valid_until is None or valid_until <= self.clock():
            raise AuthorizationError("AUTHORIZATION_DENIED", "Authorization is expired", reason="GRANT_EXPIRED")
        limits = result["limits"]
        return Authorization(grant_id=grant_id, operation=operation, model_id=model_id,
                             max_bytes=limits["max_bytes"],
                             smoke_max_input_tokens=limits["smoke"]["max_input_tokens"],
                             smoke_max_output_tokens=limits["smoke"]["max_output_tokens"],
                             smoke_max_attempts=limits["smoke"]["max_attempts"],
                             consent_ids=tuple(result["consent_ids"]), valid_until=result["valid_until"])
