"""Machine-readable ING and DIS Intelligence Supply boundary."""
from pathlib import Path

import typer

from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class SupplyCommand(BaseCommand):
    def metadata(self):
        return CommandMetadata(name="supply", category=CommandCategory.INTENT, version="1.0.0",
            description="Generate ING classification, consolidate human decisions, or propose DIS mapping",
            examples=["brain --json intent supply --intent-root PATH --semantic-index PATH",
                      "brain --json intent supply --intent-root PATH --semantic-index PATH --decisions decisions.json"])

    def register(self, app):
        @app.command(name=self.metadata().name)
        def execute(ctx: typer.Context,
                    intent_root: Path = typer.Option(..., "--intent-root", help="Existing ING/DIS intent directory"),
                    semantic_index: Path = typer.Option(..., "--semantic-index", help="Explicit Nucleus transient index"),
                    decisions: Path = typer.Option(None, "--decisions", help="Human decisions JSON array, ING only"),
                    ing_result: Path = typer.Option(None, "--ing-result", help="Completed ING result for DIS"),
                    policy_version: str = typer.Option("genesis-runtime-intelligence/v2", "--policy-version", help="Approved policy version")):
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            try:
                from brain.core.intent_manager import IntentManager
                from brain.core.intelligence_supply import read_json
                if gc.verbose:
                    typer.echo("Resuming durable Intelligence Supply", err=True)
                result = IntentManager().supply_intent(intent_root=intent_root, semantic_index=semantic_index,
                    decisions=read_json(decisions) if decisions else None, ing_result=ing_result,
                    policy_version=policy_version)
                gc.output({"status": "success", "operation": "intent_supply", "data": result},
                          self._render_success)
            except Exception as exc:
                self._handle_error(gc, exc)

    def _render_success(self, value):
        typer.echo(str(value["data"]))

    def _handle_error(self, gc, error):
        from brain.core.intelligence_supply import SupplyError
        if not isinstance(error, SupplyError):
            error = SupplyError("STATE_CONFLICT", "lifecycle")
        gc.output(error.envelope(), lambda value: typer.echo(value["error"]["message"], err=True))
        raise typer.Exit(1)
