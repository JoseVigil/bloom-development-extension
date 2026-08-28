"""CLI surface for persisting the final commit control checkpoint."""

from pathlib import Path

import typer

from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class CommitTurnCommand(BaseCommand):
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="commit-turn", category=CommandCategory.INTENT, version="1.0.0",
            description="Commit a fully verified ing/dis turn without advancing phase",
            examples=[
                "brain --json intent commit-turn -p C:/project -i UUID -s consolidation -t 1",
                "brain intent commit-turn -p C:/project -i UUID -s ratification -t 2",
            ],
        )

    def register(self, app: typer.Typer) -> None:
        @app.command(name=self.metadata().name)
        def execute(
            ctx: typer.Context,
            nucleus_path: Path = typer.Option(..., "--nucleus-path", "-p", help="Bloom Project or Nucleus root"),
            intent_id: str = typer.Option(..., "--intent-id", "-i", help="Persisted ing/dis intent UUID"),
            stage: str = typer.Option(..., "--stage", "-s", help="Commit stage: consolidation or ratification"),
            turn_id: str = typer.Option(..., "--turn-id", "-t", help="Positive turn number N from .turn_N"),
        ) -> None:
            """Persist committed=true; safe to retry before or after phase advance."""
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            operation = "intent_commit_turn"
            details = {"intent_id": intent_id, "stage": stage, "turn_id": turn_id}
            try:
                from brain.commands.intent.effect_command_errors import parse_stage, parse_turn_id, require_text
                from brain.core.intent_manager import IntentManager
                clean_intent_id = require_text(intent_id, "--intent-id")
                clean_stage = parse_stage(stage)
                parsed_turn = parse_turn_id(turn_id)
                if gc.verbose:
                    typer.echo(f"🧾 Committing {clean_stage}/.turn_{parsed_turn}...", err=True)
                data = IntentManager().commit_bsip_turn(
                    intent_id=clean_intent_id, phase_name=clean_stage,
                    turn_number=parsed_turn, nucleus_path=nucleus_path,
                )
                gc.output({"status": "success", "operation": operation, "data": data}, self._render_success)
            except Exception as error:
                self._handle_error(gc, operation, error, details)

    def _render_success(self, payload: dict) -> None:
        data = payload["data"]
        typer.echo(f"✅ Turn committed (already committed: {data['already_committed']})")

    def _handle_error(self, gc, operation: str, error: Exception, details: dict) -> None:
        from brain.commands.intent.effect_command_errors import emit_error
        emit_error(gc, operation, error, details)

