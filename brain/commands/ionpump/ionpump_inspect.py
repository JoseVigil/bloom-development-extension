# brain/commands/ionpump/ionpump_inspect.py
"""
IonPump inspect command — list registered sites and show site details.
"""

import typer
from typing import Optional

from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class IonPumpInspectCommand(BaseCommand):
    """
    Inspect the IonPump registry.

    Lists all registered sites or shows the manifest detail for a single site.
    """

    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="inspect",
            category=CommandCategory.IONPUMP,
            version="1.0.0",
            description="Inspect the IonPump registry — list sites or show site detail.",
            examples=[
                "brain ionpump inspect",
                "brain ionpump inspect --json",
                "brain ionpump inspect github.com",
                "brain ionpump inspect github.com --json",
            ],
        )

    def register(self, app: typer.Typer) -> None:
        @app.command(name="inspect")
        def execute(
            ctx: typer.Context,
            site: Optional[str] = typer.Argument(
                None, help="Site to inspect (e.g. github.com). Omit to list all."
            ),
        ):
            """Inspect IonPump registered sites or show detail for one site."""

            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()

            try:
                from brain.core.ionpump.ionpump_manager import IonPumpManager
                from pathlib import Path

                if gc.verbose:
                    typer.echo("🔍 Conectando con IonPump registry...", err=True)

                manager: IonPumpManager = gc.get_service(IonPumpManager)

                if site:
                    # Detail view for a single site
                    manifest = manager.get_manifest(site)
                    if manifest is None:
                        self._handle_error(gc, f"Site '{site}' no está registrado en IonPump.")

                    # Determine if recipe is already loaded (cached)
                    recipe = manager._registry.get_recipe(site)
                    loaded = recipe is not None

                    result = {
                        "status": "success",
                        "operation": "inspect_site",
                        "data": {
                            "site": manifest.site,
                            "version": manifest.version,
                            "description": manifest.description,
                            "entrypoint": manifest.entrypoint,
                            "flows": manifest.flows,
                            "triggers": manifest.triggers,
                            "capabilities": manifest.capabilities,
                            "requires_cortex_version": manifest.requires_cortex_version,
                            "loaded": loaded,
                        },
                    }
                    gc.output(result, self._render_site_detail)

                else:
                    # List all sites
                    sites = manager.list_sites()
                    rows = []
                    for s in sites:
                        manifest = manager.get_manifest(s)
                        recipe = manager._registry.get_recipe(s)
                        rows.append(
                            {
                                "site": s,
                                "version": manifest.version if manifest else "?",
                                "flows": len(manifest.flows) if manifest else 0,
                                "loaded": recipe is not None,
                            }
                        )

                    result = {
                        "status": "success",
                        "operation": "inspect_all",
                        "data": {"sites": rows, "total": len(rows)},
                    }
                    gc.output(result, self._render_site_list)

            except typer.Exit:
                raise
            except Exception as exc:
                self._handle_error(gc, f"Error al inspeccionar IonPump: {exc}")

    # ------------------------------------------------------------------
    # Renderers
    # ------------------------------------------------------------------

    def _render_site_list(self, data: dict):
        sites = data["data"]["sites"]
        total = data["data"]["total"]

        typer.echo("IonPump Registry")
        typer.echo("─" * 60)
        for row in sites:
            status_icon = "✓" if row["loaded"] else "✗"
            loaded_label = "loaded" if row["loaded"] else "not loaded"
            typer.echo(
                f"  {status_icon} {row['site']:<20} v{row['version']:<8} "
                f"{row['flows']} flows    {loaded_label}"
            )
        typer.echo("─" * 60)
        typer.echo(f"Total: {total} site{'s' if total != 1 else ''}")

    def _render_site_detail(self, data: dict):
        d = data["data"]
        loaded_label = "loaded" if d["loaded"] else "not loaded"
        typer.echo(f"\n📦 {d['site']}  v{d['version']}  ({loaded_label})")
        typer.echo(f"   {d['description']}")
        typer.echo(f"   Entrypoint : {d['entrypoint']}")
        typer.echo(f"   Flows      : {', '.join(d['flows'])}")
        typer.echo(f"   Capabilities: {', '.join(d['capabilities']) or '—'}")
        typer.echo(f"   Requires Cortex: {d['requires_cortex_version']}")
        if d["triggers"]:
            typer.echo("   Triggers:")
            for event, flow in d["triggers"].items():
                typer.echo(f"     {event} → {flow}")

    def _handle_error(self, gc, message: str):
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)
