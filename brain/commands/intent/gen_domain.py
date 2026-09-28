"""Human and JSON CLI surface for a Mandate-bound domain proposal."""

import json
import sys

import typer

from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class GenDomainCommand(BaseCommand):
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="gen-domain", category=CommandCategory.INTENT, version="1.0.0",
            description="Produce a structured domain definition proposal from signed Mandate inputs",
            examples=["brain --json intent gen-domain < verified-request.json"],
        )

    def register(self, app: typer.Typer) -> None:
        @app.command(name=self.metadata().name)
        def execute(ctx: typer.Context) -> None:
            """Read one verified request from stdin; print the proposed artifact."""
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            try:
                from brain.core.intent.gen_domain import generate_domain
                request = json.load(sys.stdin)
                data, evidence = generate_domain(request, return_evidence=True)
                gc.output({"status": "success", "operation": "intent_gen_domain", "data": data, "inference": evidence},
                          self._render_success)
            except (ValueError, KeyError, TypeError) as error:
                from brain.commands.intent.effect_command_errors import emit_error
                emit_error(gc, "intent_gen_domain", error, {})

    def _render_success(self, payload: dict) -> None:
        typer.echo(json.dumps(payload["data"], ensure_ascii=False, indent=2))
