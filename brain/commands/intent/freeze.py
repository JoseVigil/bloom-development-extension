"""Intent freeze command - Crystallize a converged ing/dis intent into mandate.json."""
import typer
from pathlib import Path
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class IntentFreezeCommand(BaseCommand):
    """
    Command to crystallize a converged 'ing'/'dis' intent into an
    immutable mandate.json (Freeze-to-Mandate layer).
    """

    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="freeze",
            category=CommandCategory.INTENT,
            version="1.0.0",
            description="Crystallize a converged intent into mandate.json",
            examples=[
                "brain intent freeze abc123",
                "brain intent freeze abc123 --output /path/to/custom/mandate.json",
                "brain intent freeze abc123 --force",
                "brain intent freeze abc123 --json",
            ]
        )

    def register(self, app: typer.Typer) -> None:
        """Register the intent freeze command."""
        @app.command(name=self.metadata().name)
        def execute(
            ctx: typer.Context,
            intent_id: str = typer.Argument(
                ...,
                help="Intent UUID to crystallize"
            ),
            output: Optional[Path] = typer.Option(
                None,
                "--output",
                "-o",
                help=(
                    "Optional override for where mandate.json is written. "
                    "Accepts a directory (mandate.json is appended) or a "
                    "full file path. Defaults to the Core's standard "
                    "location under .bloom/.mandates/<mandate_id>/."
                )
            ),
            force: bool = typer.Option(
                False,
                "--force",
                help="Re-crystallize an intent that was already frozen, overwriting its mandate.json"
            ),
            nucleus_path: Optional[Path] = typer.Option(
                None,
                "--nucleus-path",
                "-p",
                help="Path to Bloom project"
            )
        ):
            """
            Crystallize a converged 'ing'/'dis' intent into mandate.json.

            The intent must have reached its terminal phase (commit closed
            in .consolidation/ or .ratification/) before it can be frozen.
            """
            # 1. Recuperar GlobalContext
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()

            try:
                # 2. Verbose logging
                if gc.verbose:
                    typer.echo(f"🧊 Freezing intent {intent_id} to mandate...", err=True)
                    if output:
                        typer.echo(f"   Output override: {output}", err=True)
                    if force:
                        typer.echo(f"   Force: True", err=True)

                # 3. Lazy Import del Core
                from brain.core.intent_manager import IntentManager

                # 4. Freeze
                manager = IntentManager()
                data = manager.freeze_to_mandate(
                    intent_id=intent_id,
                    nucleus_path=nucleus_path,
                    force=force,
                    output_path=output,
                )

                # 5. Empaquetar resultado
                result = {
                    "status": "success",
                    "operation": "intent_freeze",
                    "data": data
                }

                # 6. Output dual
                gc.output(result, self._render_success)

            except ValueError as e:
                self._handle_error(gc, f"Validation error: {e}")
            except Exception as e:
                self._handle_error(gc, f"Error freezing intent: {e}")

    def _render_success(self, data: dict):
        """Render human-readable output."""
        freeze_data = data.get("data", {})

        typer.echo(f"\n🧊 Intent crystallized successfully!")
        typer.echo(f"🆔 Intent: {freeze_data.get('intent_id', 'N/A')}")
        typer.echo(f"📜 Mandate ID: {freeze_data.get('mandate_id', 'N/A')}")
        typer.echo(f"📂 Mandate path: {freeze_data.get('mandate_path', 'N/A')}")
        typer.echo(f"🔒 Content hash: {freeze_data.get('content_hash', 'N/A')}")
        typer.echo(f"🕐 Frozen at: {freeze_data.get('frozen_at', 'N/A')}")

        if freeze_data.get("scaffold_pending"):
            typer.echo(
                "\n⚠️  scaffold_pending=true: la síntesis real de Actions "
                "sigue siendo trabajo pendiente."
            )

        typer.echo(f"\n💡 {freeze_data.get('message', '')}")

    def _handle_error(self, gc, message: str):
        """Unified error handling."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)
