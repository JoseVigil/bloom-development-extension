"""Catalogo de modelos locales: datos versionados, validados contra su schema.

Agregar un modelo es agregar una entrada al JSON del catalogo. Ningun codigo
de AITAP menciona un modelo por nombre.
"""
from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

from aitap.runtime_paths import resource_root

CATALOG_RELATIVE = Path("local") / "catalog" / "local-intelligence-catalog-v1.json"
SCHEMA_RELATIVE = Path("contracts") / "local" / "v1" / "catalog.schema.json"


class CatalogError(ValueError):
    """El catalogo empaquetado no existe o no cumple su contrato."""

    def __init__(self, code: str, message: str):
        self.code = code
        super().__init__(message)


def canonical_digest(value: Any) -> str:
    data = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
    return "sha256:" + hashlib.sha256(data.encode("utf-8")).hexdigest()


def bloom_base_dir() -> Path:
    """Raiz de BloomNucleus por sistema (misma resolucion que vault/client.py)."""
    override = os.environ.get("BLOOM_APPDATA_DIR")
    if override:
        return Path(override)
    if os.name == "nt":
        return Path(os.environ.get("LOCALAPPDATA", str(Path.home() / "AppData" / "Local"))) / "BloomNucleus"
    if os.uname().sysname == "Darwin":
        return Path.home() / "Library" / "BloomNucleus"
    return Path(os.environ.get("XDG_DATA_HOME", str(Path.home() / ".local" / "share"))) / "BloomNucleus"


@dataclass(frozen=True)
class Catalog:
    document: dict[str, Any]
    fingerprint: str

    @property
    def version(self) -> str:
        return self.document["catalog_version"]

    @property
    def models(self) -> list[dict[str, Any]]:
        return self.document["models"]

    @property
    def mandatory_ids(self) -> list[str]:
        return list(self.document["mandatory_model_ids"])

    @property
    def coexistence(self) -> dict[str, Any]:
        return self.document["coexistence"]

    def model(self, model_id: str) -> dict[str, Any] | None:
        return next((m for m in self.models if m["model_id"] == model_id), None)

    @staticmethod
    def platform_entry(model: dict[str, Any], os_name: str, arch: str) -> dict[str, Any] | None:
        return next((p for p in model["platforms"] if p["os"] == os_name and p["arch"] == arch), None)


def _validate_semantics(document: dict[str, Any]) -> None:
    ids = [m["model_id"] for m in document["models"]]
    if len(ids) != len(set(ids)):
        raise CatalogError("CATALOG_INVALID", "model_id duplicado en el catalogo")
    backends = [m["backend"]["backend_id"] for m in document["models"]]
    if len(backends) != len(set(backends)):
        raise CatalogError("CATALOG_INVALID", "backend_id duplicado en el catalogo")
    missing = set(document["mandatory_model_ids"]) - set(ids)
    if missing:
        raise CatalogError("CATALOG_INVALID", f"modelo obligatorio ausente del catalogo: {sorted(missing)}")
    for model in document["models"]:
        if model["source"]["kind"] != model["runtime"]:
            raise CatalogError("CATALOG_INVALID", f"{model['model_id']}: source no corresponde al runtime")
        combos = [(p["os"], p["arch"]) for p in model["platforms"]]
        if len(combos) != len(set(combos)):
            raise CatalogError("CATALOG_INVALID", f"{model['model_id']}: plataforma duplicada")


def load_catalog(root: Path | None = None, *, document: dict[str, Any] | None = None) -> Catalog:
    """Carga y valida el catalogo empaquetado (o un documento dado, para tests)."""
    root = root or resource_root()
    try:
        schema = json.loads((root / SCHEMA_RELATIVE).read_text(encoding="utf-8"))
        if document is None:
            document = json.loads((root / CATALOG_RELATIVE).read_text(encoding="utf-8"))
    except OSError:
        raise CatalogError("CATALOG_NOT_FOUND", "catalogo o schema local no disponible") from None
    except ValueError:
        raise CatalogError("CATALOG_INVALID", "catalogo local no es JSON valido") from None
    error = next(Draft202012Validator(schema).iter_errors(document), None)
    if error is not None:
        location = "/".join(str(p) for p in error.absolute_path) or "(raiz)"
        raise CatalogError("CATALOG_INVALID", f"catalogo local no cumple el schema en {location}")
    _validate_semantics(document)
    return Catalog(document=document, fingerprint=canonical_digest(document))
