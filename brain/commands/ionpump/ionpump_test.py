# brain/commands/ionpump/ionpump_test.py
"""
IonPump test command — execute or dry-run a named flow.
"""

import asyncio
import json as json_mod
import typer
from typing import Optional

from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class IonPumpTestCommand(BaseCommand):
    """
    Test a flow from an IonPump recipe.

    With --dry-run: collects all SynapseCommands the executor would emit
    without sending anything over IPC.

    Without --dry-run: requires Brain-Host to be running (port file must exist)
    and sends commands over IPC exactly as production would.
    """

    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="test",
            category=CommandCategory.IONPUMP,
            version="1.0.0",
            description="Execute or dry-run a named IonPump flow.",
            examples=[
                "brain ionpump test github.com bootstrap",
                "brain ionpump test github.com send_prompt --context '{\"prompt\":\"test\"}' --dry-run",
                "brain ionpump test github.com await_confirmation --dry-run --json",
            ],
        )

    def register(self, app: typer.Typer) -> None:
        @app.command(name="test")
        def execute(
            ctx: typer.Context,
            site: str = typer.Argument(..., help="Site name (e.g. github.com)."),
            flow_name: str = typer.Argument(..., help="Flow to execute (e.g. bootstrap)."),
            context_json: str = typer.Option(
                "{}", "--context", "-c",
                help='Runtime context as a JSON string (e.g. \'{"prompt":"test"}\').',
            ),
            dry_run: bool = typer.Option(
                False, "--dry-run", help="Collect commands without sending via IPC."
            ),
            tab_id: int = typer.Option(
                1, "--tab-id", help="Simulated browser tab ID."
            ),
            launch_id: str = typer.Option(
                "dev", "--launch-id", help="Brain-Host launch ID (for IPC port discovery)."
            ),
        ):
            """Test a flow — dry-run or live execution."""

            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()

            # Parse context JSON
            try:
                context = json_mod.loads(context_json)
            except json_mod.JSONDecodeError as exc:
                self._handle_error(gc, f"--context no es JSON válido: {exc}")
                return

            try:
                from brain.core.ionpump.ionpump_loader import IonLoader, IonNotFoundError
                from brain.core.ionpump.ionpump_registry import IonRegistry
                from brain.core.ionpump.ionpump_state import IonStateManager
                from brain.core.ionpump.ionpump_executor import IonExecutor

                # Build a minimal stack: registry + loader + executor
                registry = IonRegistry()
                loader = IonLoader("ionsites", registry)
                loader.discover_all()

                if gc.verbose:
                    typer.echo(
                        f"🔍 Cargando recipe para '{site}'...", err=True
                    )

                try:
                    recipe = loader.load_recipe(site)
                except IonNotFoundError as exc:
                    self._handle_error(gc, str(exc))
                    return

                if flow_name not in recipe.flows:
                    self._handle_error(
                        gc,
                        f"Flow '{flow_name}' no existe en el recipe '{site}'.",
                    )
                    return

                state_manager = IonStateManager()
                executor = IonExecutor(state_manager)

                if dry_run:
                    collected = asyncio.run(
                        _collect_commands(executor, recipe, flow_name, tab_id, context)
                    )
                    result = {
                        "status": "success",
                        "operation": "test_dry_run",
                        "data": {
                            "site": site,
                            "flow": flow_name,
                            "dry_run": True,
                            "commands": [
                                {
                                    "index": i + 1,
                                    "type": cmd.command,
                                    "tab_id": cmd.tab_id,
                                    "params": cmd.params,
                                }
                                for i, cmd in enumerate(collected)
                            ],
                            "total": len(collected),
                        },
                    }
                    gc.output(result, self._render_dry_run)

                else:
                    # Live execution — requires IonPumpManager + IPC
                    from brain.core.ionpump.ionpump_manager import IonPumpManager
                    from pathlib import Path

                    manager: IonPumpManager = gc.get_service(IonPumpManager)
                    exec_result = asyncio.run(
                        manager.execute_flow(
                            site=site,
                            flow_name=flow_name,
                            tab_id=tab_id,
                            launch_id=launch_id,
                            context=context,
                        )
                    )

                    result = {
                        "status": "success" if exec_result.success else "error",
                        "operation": "test_live",
                        "data": {
                            "site": exec_result.site,
                            "flow": exec_result.flow,
                            "dry_run": False,
                            "success": exec_result.success,
                            "commands_sent": exec_result.commands_sent,
                            "error": exec_result.error,
                        },
                    }
                    gc.output(result, self._render_live)

                    if not exec_result.success:
                        raise typer.Exit(code=1)

            except typer.Exit:
                raise
            except Exception as exc:
                self._handle_error(gc, f"Error al testear el flow: {exc}")

    # ------------------------------------------------------------------
    # Renderers
    # ------------------------------------------------------------------

    def _render_dry_run(self, data: dict):
        d = data["data"]
        typer.echo(f"\n🧪 Dry-run: {d['site']} / {d['flow']}")
        typer.echo("─" * 44)
        for cmd in d["commands"]:
            params_str = "  ".join(
                f"{k}={v!r}" for k, v in cmd["params"].items()
            )
            typer.echo(f"[{cmd['index']}] {cmd['type']:<16} {params_str}")
        typer.echo("─" * 44)
        typer.echo(f"{d['total']} comandos generados (no enviados)")

    def _render_live(self, data: dict):
        d = data["data"]
        if d["success"]:
            typer.echo(
                f"✅ {d['site']}/{d['flow']} — "
                f"{d['commands_sent']} comando(s) enviados"
            )
        else:
            typer.echo(
                f"❌ {d['site']}/{d['flow']} — "
                f"falló después de {d['commands_sent']} comando(s): {d['error']}",
                err=True,
            )

    def _handle_error(self, gc, message: str):
        if gc.json_mode:
            typer.echo(json_mod.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)


# ---------------------------------------------------------------------------
# Async helper (module-level so asyncio.run can call it cleanly)
# ---------------------------------------------------------------------------

async def _collect_commands(executor, recipe, flow_name, tab_id, context):
    """Drain the executor generator and return collected SynapseCommands."""
    commands = []
    async for cmd in executor.execute_flow(recipe, flow_name, tab_id, context):
        commands.append(cmd)
    return commands
