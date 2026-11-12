"""Productive, durable DIS ratification command."""

from pathlib import Path

import typer

from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class RatifyDisCommand(BaseCommand):
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="ratify-dis",
            category=CommandCategory.INTENT,
            version="1.0.0",
            description="Apply, verify, commit and advance an existing DIS ratification",
            examples=[
                "brain --json intent ratify-dis --nucleus-path /nucleus --intent-id UUID "
                "--mapping-turn-id 1 --decision-json decision.json --semantic-index /nucleus/.cache/.semantic-index.json",
            ],
        )

    def register(self, app: typer.Typer) -> None:
        @app.command(name=self.metadata().name)
        def execute(
            ctx: typer.Context,
            nucleus_path: Path = typer.Option(..., "--nucleus-path", "-p", help="Bloom Project or Nucleus root containing the DIS intent"),
            intent_id: str = typer.Option(..., "--intent-id", "-i", help="Existing DIS intent identifier"),
            mapping_turn_id: str = typer.Option(..., "--mapping-turn-id", help="Mapping proposal turn to ratify"),
            decision_json: Path = typer.Option(..., "--decision-json", help="Canonical human decision JSON file"),
            semantic_index: Path = typer.Option(..., "--semantic-index", help="Explicit Nucleus .cache/.semantic-index.json"),
        ) -> None:
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            operation = "intent_ratify_dis"
            try:
                from brain.commands.intent.effect_command_errors import parse_turn_id, require_text
                from brain.core.intelligence_supply import read_json
                from brain.core.intent_manager import IntentManager

                if gc.verbose:
                    typer.echo("Applying and independently verifying DIS ratification", err=True)
                data = IntentManager().ratify_dis(
                    nucleus_path=nucleus_path,
                    intent_id=require_text(intent_id, "--intent-id"),
                    mapping_turn_number=parse_turn_id(mapping_turn_id),
                    decision=read_json(decision_json),
                    semantic_index=semantic_index,
                )
                gc.output({"status": "success", "operation": operation, "data": data}, self._render_success)
            except Exception as exc:
                self._handle_error(gc, operation, exc, intent_id)

    def _render_success(self, value: dict) -> None:
        data = value["data"]
        typer.echo(
            f"DIS {data['intent_id']} ratified at turn {data['turn_id']}; "
            f"phase={data['phase_active']} committed={data['committed']}"
        )

    @staticmethod
    def _handle_error(gc, operation: str, error: Exception, intent_id: str) -> None:
        import json

        from brain.commands.intent.effect_command_errors import EffectCommandError, classify_error
        from brain.core.intent.dis_ratification import DisRatificationError

        if isinstance(error, DisRatificationError):
            exit_code = 2 if error.code == "INVALID_ARGUMENT" else 4
            contract = EffectCommandError(
                error.code, str(error), exit_code, error.retryable, {"intent_id": intent_id}
            )
        else:
            contract = classify_error(error, {"intent_id": intent_id})
        payload = {
            "status": "error",
            "operation": operation,
            "error": {
                "code": contract.code,
                "message": contract.message,
                "retryable": contract.retryable,
                "details": contract.details,
            },
            "exit_code": contract.exit_code,
        }
        if gc.json_mode:
            typer.echo(json.dumps(payload, ensure_ascii=False))
        else:
            typer.echo(f"❌ [{contract.code}] {contract.message}", err=True)
        raise typer.Exit(code=contract.exit_code)
