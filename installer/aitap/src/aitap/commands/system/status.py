import json
import os
import sys

import typer

from aitap import __version__
from aitap import _build_info
from aitap.access.policy import AccessPolicyError, load_access_policy
from aitap.cli import output
from aitap.cli.base import BaseCommand, CommandMetadata
from aitap.cli.categories import CommandCategory
from aitap.local.catalog import CatalogError, bloom_base_dir, canonical_digest, load_catalog
from aitap.runtime_paths import resource_root

ROUTING_POLICY = ("policies", "genesis-runtime-intelligence-v2.json")
ROUTING_REGISTRY = ("registry", "genesis-pilot-v2.json")


def _json_resource(root, parts, version_key):
    relative = "/".join(parts)
    try:
        document = json.loads((root.joinpath(*parts)).read_text(encoding="utf-8"))
        return {"path": relative, "version": document.get(version_key), "fingerprint": canonical_digest(document),
                "valid": True, "error": None}
    except (OSError, ValueError) as exc:
        return {"path": relative, "version": None, "fingerprint": None, "valid": False,
                "error": type(exc).__name__}


def collect_status():
    """Introspeccion estatica: que version corre y que recursos empaquetados cargo."""
    root = resource_root()
    resources = {
        "routing_policy": _json_resource(root, ROUTING_POLICY, "policy_version"),
        "routing_registry": _json_resource(root, ROUTING_REGISTRY, "snapshot_id"),
    }
    catalog = None
    try:
        catalog = load_catalog(root)
        resources["local_catalog"] = {"path": "local/catalog/local-intelligence-catalog-v1.json",
                                      "version": catalog.version, "fingerprint": catalog.fingerprint,
                                      "valid": True, "error": None,
                                      "mandatory_model_ids": catalog.mandatory_ids}
    except CatalogError as exc:
        resources["local_catalog"] = {"path": "local/catalog/local-intelligence-catalog-v1.json",
                                      "version": None, "fingerprint": None, "valid": False, "error": exc.code}
    if catalog is not None:
        try:
            policy = load_access_policy(catalog, root)
            resources["access_policy"] = {"path": "policies/local-access-default-v1.json", "version": policy.version,
                                          "fingerprint": policy.fingerprint, "valid": True, "error": None}
        except AccessPolicyError as exc:
            resources["access_policy"] = {"path": "policies/local-access-default-v1.json", "version": None,
                                          "fingerprint": None, "valid": False, "error": exc.code}
    else:
        resources["access_policy"] = {"path": "policies/local-access-default-v1.json", "version": None,
                                      "fingerprint": None, "valid": False, "error": "CATALOG_UNAVAILABLE"}
    return {
        "name": "AITap",
        "version": __version__,
        "build_number": _build_info.BUILD_NUMBER,
        "frozen": bool(getattr(sys, "_MEIPASS", None)),
        "resources": resources,
        "paths": {"bloom_base": str(bloom_base_dir()), "state_dir": os.environ.get("AITAP_STATE_DIR") or None},
        "resources_valid": all(r["valid"] for r in resources.values()),
    }


class StatusCommand(BaseCommand):
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="status",
            category=CommandCategory.SYSTEM,
            description="Version, recursos empaquetados cargados (versiones y huellas) y rutas efectivas; sin sondear dependencias",
            examples=["aitap system status", "aitap --json system status"],
        )

    def register(self, app: typer.Typer):
        @app.command("status")
        def status(ctx: typer.Context):
            """Introspeccion estatica de AITAP. Para dependencias vivas usar 'aitap health check'."""
            data = collect_status()

            def human(result):
                typer.echo(f"AITap {result['version']} (build {result['build_number']})"
                           f"{' [empaquetado]' if result['frozen'] else ' [fuentes]'}")
                for name, resource in result["resources"].items():
                    mark = "ok" if resource["valid"] else f"INVALIDO ({resource['error']})"
                    typer.echo(f"  {name:<17} {resource['version'] or '-':<42} {mark}")
                typer.echo(f"  bloom_base        {result['paths']['bloom_base']}")
                typer.echo(f"  state_dir         {result['paths']['state_dir'] or '(AITAP_STATE_DIR no definido)'}")

            output.emit(ctx, "system.status", data, human)
            if not data["resources_valid"]:
                raise typer.Exit(code=1)
