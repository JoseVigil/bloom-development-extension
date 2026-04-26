# brain/commands/ionpump/ionpump_reload.py
"""
IonPump reload command — force hot-reload of a site recipe or all sites.
"""

import typer
from typing import Optional

from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class IonPumpReloadCommand(BaseCommand):
    """
    Force a hot-reload of IonPump recipe(s) without restarting Brain.

    Invalidates the registry cache and re-parses the .ion file from disk.
    """

    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="reload",
            category=CommandCategory.INTENT,
            version="1.0.0",
            description="Force hot-reload of a site's .ion recipe or all registered sites.",
            examples=[
                "brain ionpump reload github.com",
                "brain ionpump reload --all",
                "brain ionpump reload --all --json",
            ],
        )

    def register(self, app: typer.Typer) -> None:
        @app.command(name="reload")
        def execute(
            ctx: typer.Context,
            site: Optional[str] = typer.Argument(
                None, help="Site to reload (e.g. github.com)."
            ),
            all_sites: bool = typer.Option(
                False, "--all", "-a", help="Reload all registered sites."
            ),
        ):
            """Force hot-reload of one or all IonPump recipes."""

            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()

            if not site and not all_sites:
                self._handle_error(
                    gc, "Debes especificar un site (e.g. github.com) o usar --all."
                )

            try:
                from brain.core.ionpump.ionpump_manager import IonPumpManager

                manager: IonPumpManager = gc.get_service(IonPumpManager)

                targets = manager.list_sites() if all_sites else [site]

                reloaded = []
                errors = []

                for s in targets:
                    if gc.verbose:
                        typer.echo(f"🔍 Invalidando cache para '{s}'...", err=True)

                    manifest = manager.get_manifest(s)
                    if manifest is None:
                        errors.append(
                            {"site": s, "error": f"Site '{s}' no está registrado."}
                        )
                        continue

                    try:
                        # Invalidate cached recipe → force re-parse from disk
                        manager._registry.invalidate(s)
                        recipe = manager._loader.load_recipe(s)
                        # Store back in registry
                        manager._registry.set_recipe(s, recipe)

                        reloaded.append(
                            {
                                "site": s,
                                "version": recipe.version,
                                "flows": len(recipe.flows),
                            }
                        )
                    except Exception as exc:
                        errors.append({"site": s, "error": str(exc)})

                result = {
                    "status": "success" if not errors else "partial",
                    "operation": "reload_all" if all_sites else "reload_site",
                    "data": {
                        "reloaded": reloaded,
                        "errors": errors,
                    },
                }
                gc.output(result, self._render_reload)

                if errors and not reloaded:
                    raise typer.Exit(code=1)

            except typer.Exit:
                raise
            except Exception as exc:
                self._handle_error(gc, f"Error al recargar: {exc}")

    # ------------------------------------------------------------------
    # Renderers
    # ------------------------------------------------------------------

    def _render_reload(self, data: dict):
        reloaded = data["data"]["reloaded"]
        errors = data["data"]["errors"]

        for r in reloaded:
            typer.echo(
                f"✅ {r['site']} recargado — v{r['version']}, {r['flows']} flows"
            )
        for e in errors:
            typer.echo(f"❌ {e['site']}: {e['error']}", err=True)

    def _handle_error(self, gc, message: str):
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)
