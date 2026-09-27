"""Carga y validacion de la politica de acceso y cuotas por modelo local.

La politica es un documento de datos versionado. La version por defecto viaja
empaquetada; una politica instalada (futura) solo podra reemplazarla con una
``authorization_ref`` emitida por Nucleus. AITAP no se autoautoriza.
"""
from __future__ import annotations

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

    @property
    def version(self) -> str:
        return self.document["policy_version"]

    def rule(self, backend_id: str) -> dict[str, Any] | None:
        return next((m for m in self.document["models"] if m["backend_id"] == backend_id), None)


def load_access_policy(catalog: Catalog, root: Path | None = None, *,
                       document: dict[str, Any] | None = None) -> AccessPolicy:
    root = root or resource_root()
    try:
        schema = json.loads((root / SCHEMA_RELATIVE).read_text(encoding="utf-8"))
        if document is None:
            document = json.loads((root / DEFAULT_POLICY_RELATIVE).read_text(encoding="utf-8"))
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
    missing = set(catalog.mandatory_ids) - seen
    if missing:
        raise AccessPolicyError("ACCESS_POLICY_INVALID", f"modelo obligatorio sin regla de acceso: {sorted(missing)}")
    return AccessPolicy(document=document, fingerprint=canonical_digest(document))
