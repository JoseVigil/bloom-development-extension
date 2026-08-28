"""Intent add-turn command - Add conversation turn to intent chat."""
import typer
from pathlib import Path
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class AddTurnCommand(BaseCommand):
    """
    Command to add a conversation turn to an intent's chat (BTIP/BSIP).
    """

    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="add-turn",
            category=CommandCategory.INTENT,
            version="1.0.0",
            description="Add a conversation turn to intent chat",
            examples=[
                "brain intent add-turn --id abc123 --actor user --content 'Add null check'",
                "brain intent add-turn --folder .fix-login-a1b2 --actor ai --content 'Done'",
                "brain intent add-turn --id abc123 --actor user --content 'Fix bug' --json",
                "brain intent add-turn --id abc123 --actor ai --content 'Proposal ready' --close-phase "
                "--proposal '[{\"cluster_id\": \"c1\", \"operation\": \"create_domain\"}]'",
                "brain intent add-turn --id abc123 --actor user --content 'Ratify' --close-phase "
                "--proposal '[{\"change_id\": \"c1\", \"human_decision\": \"approved\", \"content\": {}}]'"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        """Register the intent add-turn command."""
        @app.command(name=self.metadata().name)
        def execute(
            ctx: typer.Context,
            intent_id: Optional[str] = typer.Option(
                None,
                "--id",
                "-i",
                help="Intent UUID"
            ),
            folder_name: Optional[str] = typer.Option(
                None,
                "--folder",
                "-f",
                help="Intent folder name"
            ),
            actor: str = typer.Option(
                "user",
                "--actor",
                "-a",
                help="Who is speaking: 'user' or 'ai'"
            ),
            content: str = typer.Option(
                ...,
                "--content",
                "-c",
                help="Content of the message"
            ),
            nucleus_path: Optional[Path] = typer.Option(
                None,
                "--nucleus-path",
                "-p",
                help="Path to Bloom project"
            ),
            close_phase: bool = typer.Option(
                False,
                "--close-phase",
                "-C",
                help=(
                    "Only meaningful for 'ing'/'dis' intents. Effect depends on "
                    "the active phase: in a commit phase (.consolidation/ or "
                    ".ratification/) durably records commit_requested=true and "
                    "creates a pending effect ledger; verified effects, final "
                    "commit, and phase advancement are separate Core operations. In a "
                    "proposal phase (.classification/ or .mapping/, which "
                    "have no commit concept) forces the explicit advance to "
                    "the closing phase via advance_after_proposal(). Ignored "
                    "for dev/doc."
                )
            ),
            proposal: Optional[str] = typer.Option(
                None,
                "--proposal",
                help=(
                    "Only used together with --close-phase on 'ing'/'dis' "
                    "intents. JSON array with the turn's business payload — "
                    "reviewed clusters/operations on proposal phases "
                    "(.classification/.mapping), or items with "
                    "human_decision on commit phases (.consolidation/"
                    ".ratification/). E.g. "
                    "'[{\"change_id\": \"c1\", \"human_decision\": \"approved\", \"content\": {}}]'"
                )
            )
        ):
            """
            Add a conversation turn to an intent's chat.

            Used for BTIP (Briefing → Turno → Iteración → Producción) and
            BSIP workflows. Each turn creates a new refinement/curation/
            phase directory with the message.
            """
            # 1. Recuperar GlobalContext
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()

            try:
                # 2. Validar identificador
                if not intent_id and not folder_name:
                    self._handle_error(gc, "Must provide either --id or --folder")

                # 3. Validar actor
                if actor not in ["user", "ai"]:
                    self._handle_error(gc, f"Invalid actor '{actor}'. Must be 'user' or 'ai'")

                # 3b. Parsear --proposal (JSON array), si vino
                parsed_proposal = None
                if proposal:
                    import json as _json
                    try:
                        parsed_proposal = _json.loads(proposal)
                    except _json.JSONDecodeError as e:
                        self._handle_error(
                            gc, f"Invalid --proposal JSON: {e}"
                        )
                    if not isinstance(parsed_proposal, list):
                        self._handle_error(
                            gc, "--proposal must be a JSON array of objects"
                        )

                # 4. Verbose logging
                if gc.verbose:
                    typer.echo(f"💬 Adding turn to intent...", err=True)
                    typer.echo(f"   Actor: {actor}", err=True)
                    typer.echo(f"   Content length: {len(content)} chars", err=True)
                    if close_phase:
                        typer.echo(f"   Close phase: True", err=True)
                    if parsed_proposal is not None:
                        typer.echo(f"   Proposal items: {len(parsed_proposal)}", err=True)

                # 5. Lazy Import del Core
                from brain.core.intent_manager import IntentManager

                # 6. Add turn
                manager = IntentManager()
                data = manager.add_turn(
                    intent_id=intent_id,
                    folder_name=folder_name,
                    actor=actor,
                    content=content,
                    nucleus_path=nucleus_path,
                    close_phase=close_phase,
                    proposal=parsed_proposal
                )

                # 7. Empaquetar resultado
                result = {
                    "status": "success",
                    "operation": "intent_add_turn",
                    "data": data
                }

                # 8. Output dual
                gc.output(result, self._render_success)

            except ValueError as e:
                self._handle_error(gc, f"Validation error: {e}")
            except Exception as e:
                self._handle_error(gc, f"Error adding turn: {e}")

    def _render_success(self, data: dict):
        """Render human-readable output."""
        turn_data = data.get("data", {})

        actor_icon = "👤" if turn_data.get("actor") == "user" else "🤖"

        typer.echo(f"\n💬 Turn added successfully!")
        typer.echo(f"📝 Intent: {turn_data.get('intent_name', 'Unknown')}")

        # dev/doc devuelven 'turn_id'; ing/dis (BSIP) devuelven
        # 'turn_number' y no incluyen 'actor'/'timestamp' en el dict
        # (ver IntentManager._add_turn_bsip) — se cubren ambas formas.
        turn_number = turn_data.get("turn_number", turn_data.get("turn_id", "N/A"))
        typer.echo(f"🔢 Turn: {turn_number}")

        if "actor" in turn_data:
            typer.echo(f"{actor_icon} Actor: {turn_data.get('actor')}")
        if "timestamp" in turn_data:
            typer.echo(f"🕐 Timestamp: {turn_data.get('timestamp')}")

        typer.echo(f"📂 Path: {turn_data.get('turn_path', 'N/A')}")

        # Claves solo presentes para intents BSIP ('ing'/'dis') — dev/doc
        # no las devuelven (ver IntentManager._add_turn_bsip).
        if "phase" in turn_data:
            typer.echo(f"📍 Phase: {turn_data.get('phase', 'N/A')}")
            typer.echo(f"📍 Phase active (post-turn): {turn_data.get('phase_active', 'N/A')}")

            if turn_data.get("advanced_phase"):
                reason = (
                    "proposal closed"
                    if turn_data.get("advanced_by_proposal_close")
                    else "committed"
                )
                typer.echo(
                    f"➡️  Advanced to: {turn_data.get('phase_active', 'N/A')} "
                    f"({reason})"
                )

            if turn_data.get("commit_requested"):
                typer.echo("🧾 Commit requested; canonical effects remain pending verification")
                typer.echo(f"📒 Effect ledger: {turn_data.get('ledger_path', 'N/A')}")

            if turn_data.get("is_terminated"):
                typer.echo(f"🏁 Intent reached terminal phase — ready for finalize/freeze")

        typer.echo(f"\n💡 Turn saved and ready for processing")

    def _handle_error(self, gc, message: str):
        """Unified error handling."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)
