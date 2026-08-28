"""CLI surface for recording one verified BSIP effect."""

from pathlib import Path
from typing import Optional

import typer

from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class MarkEffectAppliedCommand(BaseCommand):
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="mark-effect-applied", category=CommandCategory.INTENT, version="1.0.0",
            description="Record verifier evidence for one Intent effect",
            examples=[
                "brain --json intent mark-effect-applied -p C:/project -i UUID -s consolidation -t 1 -e EFFECT --evidence-json '{\"sha256\":\"...\"}'",
                "brain intent mark-effect-applied -p C:/project -i UUID -s ratification -t 2 -e EFFECT --evidence-json '{\"verified\":true}'",
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
            effect_id: str = typer.Option(..., "--effect-id", "-e", help="Effect ID from effects[].effect_id"),
            evidence_json: str = typer.Option(..., "--evidence-json", help="Non-empty JSON object with verifier evidence"),
        ) -> None:
            """Persist evidence for one effect; safe to retry with identical evidence."""
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            operation = "intent_mark_effect_applied"
            details = {"intent_id": intent_id, "stage": stage, "turn_id": turn_id}
            try:
                from brain.commands.intent.effect_command_errors import parse_evidence_json, parse_stage, parse_turn_id, require_text
                from brain.core.intent_manager import IntentManager
                clean_intent_id = require_text(intent_id, "--intent-id")
                clean_stage = parse_stage(stage)
                parsed_turn = parse_turn_id(turn_id)
                clean_effect_id = require_text(effect_id, "--effect-id")
                evidence = parse_evidence_json(evidence_json)
                if gc.verbose:
                    typer.echo(f"🧾 Marking effect {clean_effect_id} applied...", err=True)
                data = IntentManager().mark_bsip_effect_applied(
                    intent_id=clean_intent_id, phase_name=clean_stage, turn_number=parsed_turn,
                    effect_id=clean_effect_id, evidence=evidence, nucleus_path=nucleus_path,
                )
                gc.output({"status": "success", "operation": operation, "data": data}, self._render_success)
            except Exception as error:
                self._handle_error(gc, operation, error, details)

    def _render_success(self, payload: dict) -> None:
        data = payload["data"]
        typer.echo(f"✅ Effect {data['effect_id']} is {data['effect_status']}")

    def _handle_error(self, gc, operation: str, error: Exception, details: dict) -> None:
        from brain.commands.intent.effect_command_errors import emit_error
        emit_error(gc, operation, error, details)

