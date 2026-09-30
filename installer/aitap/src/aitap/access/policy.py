"""Carga y validacion de la politica de acceso y cuotas por modelo local.

La politica es un documento de datos versionado. La version por defecto viaja
empaquetada; una politica instalada (futura) solo podra reemplazarla con una
``authorization_ref`` emitida por Nucleus. AITAP no se autoautoriza.

``route supply`` la aplica (``aitap.access.enforcement``): decision por defecto
``deny`` y acceso solo por permiso acotado (``grants``) de consumidor +
``intent_type`` + version de politica de ruteo, sobre un modelo.
``file_sha256`` es el sha256 de los bytes exactos del archivo aplicado.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

from aitap.local.catalog import Catalog, canonical_digest
from aitap.runtime_paths import resource_root

DEFAULT_POLICY_RELATIVE = Path("policies") / "local-access-default-v1.json"
SCHEMA_RELATIVE = Path("contracts") / "local" / "v1" / "access-policy.schema.json"


class AccessPolicyError(ValueError):
    def __init__(self, code: str, message: str):
        self.code = code
        super().__init__(message)


@dataclass(frozen=True)
class AccessPolicy:
    document: dict[str, Any]
    fingerprint: str
    file_sha256: str | None = None

    @property
    def version(self) -> str:
        return self.document["policy_version"]

    def rule(self, backend_id: str) -> dict[str, Any] | None:
        return next((m for m in self.document["models"] if m["backend_id"] == backend_id), None)

    def rule_for_model(self, model_id: str) -> dict[str, Any] | None:
        return next((m for m in self.document["models"] if m["model_id"] == model_id), None)


def load_access_policy(catalog: Catalog, root: Path | None = None, *,
                       document: dict[str, Any] | None = None, raw: bytes | None = None) -> AccessPolicy:
    """Carga y valida la politica. ``raw`` son los bytes exactos del archivo, si se tienen."""
    root = root or resource_root()
    try:
        schema = json.loads((root / SCHEMA_RELATIVE).read_text(encoding="utf-8"))
        if document is None:
            if raw is None:
                raw = (root / DEFAULT_POLICY_RELATIVE).read_bytes()
            document = json.loads(raw.decode("utf-8"))
    except OSError:
        raise AccessPolicyError("ACCESS_POLICY_NOT_FOUND", "politica de acceso o schema no disponible") from None
    except ValueError:
        raise AccessPolicyError("ACCESS_POLICY_INVALID", "politica de acceso no es JSON valido") from None
    error = next(Draft202012Validator(schema).iter_errors(document), None)
    if error is not None:
        location = "/".join(str(p) for p in error.absolute_path) or "(raiz)"
        raise AccessPolicyError("ACCESS_POLICY_INVALID", f"politica de acceso no cumple el schema en {location}")
    seen: set[str] = set()
    for rule in document["models"]:
        model = catalog.model(rule["model_id"])
        if model is None:
            raise AccessPolicyError("ACCESS_POLICY_INVALID", f"modelo fuera del catalogo: {rule['model_id']}")
        if model["backend"]["backend_id"] != rule["backend_id"]:
            raise AccessPolicyError("ACCESS_POLICY_INVALID", f"{rule['model_id']}: backend_id no coincide con el catalogo")
        if rule["model_id"] in seen:
            raise AccessPolicyError("ACCESS_POLICY_INVALID", f"regla duplicada: {rule['model_id']}")
        seen.add(rule["model_id"])
        unknown_overrides = set(rule["consumer_overrides"]) - set(rule["allowed_consumers"])
        if unknown_overrides:
            raise AccessPolicyError("ACCESS_POLICY_INVALID",
                                    f"{rule['model_id']}: override para consumidor no permitido: {sorted(unknown_overrides)}")
        ungranted = {g["consumer_id"] for g in rule.get("grants", [])} - set(rule["allowed_consumers"])
        if ungranted:
            raise AccessPolicyError("ACCESS_POLICY_INVALID",
                                    f"{rule['model_id']}: permiso para consumidor no listado en allowed_consumers: {sorted(ungranted)}")
    missing = set(catalog.mandatory_ids) - seen
    if missing:
        raise AccessPolicyError("ACCESS_POLICY_INVALID", f"modelo obligatorio sin regla de acceso: {sorted(missing)}")
    file_sha256 = hashlib.sha256(raw).hexdigest() if raw is not None else None
    return AccessPolicy(document=document, fingerprint=canonical_digest(document), file_sha256=file_sha256)
