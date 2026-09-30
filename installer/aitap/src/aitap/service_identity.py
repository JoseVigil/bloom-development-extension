"""Identidad de servicio de AITAP y su vinculacion con la instalacion.

Modulo neutral: no pertenece a Vault ni al aprovisionamiento local. Lo usan
ambos para firmar pedidos a Nucleus con la misma identidad Ed25519.

- La identidad vive en ``<datos>/authority/aitap-service-identity.json`` y la
  enrola Nucleus; AITAP solo la lee.
- La organizacion activa sale de ``<datos>/config/nucleus.json`` y la
  instalacion de ``<datos>/authority/identity.json``.

Nunca devuelve, imprime ni registra la clave privada: expone solo el firmante.
Cualquier inconsistencia falla cerrado con ``ServiceIdentityError``.
"""
from __future__ import annotations

import base64
import json
import os
from dataclasses import dataclass
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

IDENTITY_RELATIVE = Path("authority") / "aitap-service-identity.json"


class ServiceIdentityError(ValueError):
    """La identidad de servicio o la vinculacion no estan disponibles o no son validas."""


@dataclass(frozen=True)
class InstallationBinding:
    organization_id: str
    installation_id: str


def app_data_dir() -> Path:
    """Raiz de datos de BloomNucleus por sistema operativo (``BLOOM_APPDATA_DIR`` la reemplaza)."""
    override = os.environ.get("BLOOM_APPDATA_DIR")
    if override:
        return Path(override)
    if os.name == "nt":
        return Path(os.environ.get("LOCALAPPDATA", str(Path.home() / "AppData" / "Local"))) / "BloomNucleus"
    if os.uname().sysname == "Darwin":
        return Path.home() / "Library" / "BloomNucleus"
    return Path(os.environ.get("XDG_DATA_HOME", str(Path.home() / ".local" / "share"))) / "BloomNucleus"


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def load_signer(app_data: Path) -> Ed25519PrivateKey:
    """Firmante Ed25519 de la identidad de servicio; verifica que la clave publica coincida."""
    try:
        raw = json.loads((Path(app_data) / IDENTITY_RELATIVE).read_text(encoding="utf-8"))
        private = base64.b64decode(raw["private_key"], validate=True)
        public = base64.b64decode(raw["public_key"], validate=True)
        if len(private) != 64 or len(public) != 32 or private[32:] != public:
            raise ValueError()
        signer = Ed25519PrivateKey.from_private_bytes(private[:32])
        if signer.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw) != public:
            raise ValueError()
        return signer
    except (OSError, ValueError, KeyError, TypeError):
        raise ServiceIdentityError("service identity unavailable") from None


def _single_line(value: object) -> bool:
    return isinstance(value, str) and bool(value) and "\n" not in value and "\r" not in value


def load_binding(app_data: Path) -> InstallationBinding:
    """Organizacion activa e instalacion; ambos valores de una sola linea y no vacios."""
    try:
        config = json.loads((Path(app_data) / "config" / "nucleus.json").read_text(encoding="utf-8"))
        onboarding = config["onboarding"]
        active = next(o for o in onboarding["organizations"] if o["org_slug"] == onboarding["active_org_slug"])
        organization_id = active["organization_id"]
        identity = json.loads((Path(app_data) / "authority" / "identity.json").read_text(encoding="utf-8"))
        installation_id = identity["installation_id"]
        if not (_single_line(organization_id) and _single_line(installation_id)):
            raise ValueError()
        return InstallationBinding(organization_id, installation_id)
    except (OSError, ValueError, KeyError, StopIteration, TypeError):
        raise ServiceIdentityError("installation binding unavailable") from None
