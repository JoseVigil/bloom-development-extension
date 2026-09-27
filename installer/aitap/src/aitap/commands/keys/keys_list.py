import json

import typer

from aitap.cli import output
from aitap.cli.base import BaseCommand, CommandMetadata
from aitap.cli.categories import CommandCategory
from aitap.local.catalog import CatalogError, load_catalog
from aitap.runtime_paths import resource_root


def collect_references():
    """Referencias credential_ref -> key_id. Nunca llama a Vault ni lee secretos."""
    root = resource_root()
    try:
        config = json.loads((root / "aitap.config.json").read_text(encoding="utf-8"))
        mapping = dict(config["intelligence_supply"]["credential_references"])
        config_available = True
    except (OSError, ValueError, KeyError, TypeError):
        mapping, config_available = {}, False
    rows = []
    try:
        registry = json.loads((root / "registry" / "genesis-pilot-v2.json").read_text(encoding="utf-8"))
        backends = registry.get("intelligence_backends", [])
    except (OSError, ValueError):
        backends = []
    for backend in backends:
        reference = backend.get("credential_ref")
        key_id = mapping.get(reference) if reference else None
        rows.append({"backend_id": backend.get("backend_id"), "provider": backend.get("provider"),
                     "source": "routing_registry", "credential_ref": reference, "key_id": key_id,
                     "status": "not_required" if reference is None else "mapped" if key_id else "unmapped"})
    try:
        for model in load_catalog(root).models:
            backend = model["backend"]
            rows.append({"backend_id": backend["backend_id"], "provider": backend["provider"],
                         "source": "local_catalog", "credential_ref": None, "key_id": None,
                         "status": "not_required"})
    except CatalogError:
        pass
    return {"config_available": config_available, "vault_owner": "nucleus", "references": rows}


class KeysListCommand(BaseCommand):
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="list",
            category=CommandCategory.KEYS,
            description="Lista las referencias credential_ref -> key_id por backend; no consulta Vault ni muestra secretos",
            examples=["aitap keys list", "aitap --json keys list"],
            requires_vault=False,
        )

    def register(self, app: typer.Typer):
        @app.command("list")
        def list_keys(ctx: typer.Context):
            """'mapped' indica que existe una referencia configurada, no que Vault vaya a autorizarla."""
            data = collect_references()

            def human(result):
                if not result["config_available"]:
                    typer.echo("aviso: aitap.config.json no disponible en este artefacto; key_id sin mapear", err=True)
                for row in result["references"]:
                    typer.echo(f"  {row['backend_id']:<34} {row['status']:<13} "
                               f"{row['credential_ref'] or '-'} -> {row['key_id'] or '-'}")

            output.emit(ctx, "keys.list", data, human)
