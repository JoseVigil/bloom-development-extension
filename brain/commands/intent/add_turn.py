"""Intent add-turn command - Add conversation turn to intent chat."""
import typer
from pathlib import Path
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class AddTurnCommand(BaseCommand):
    """
    Command to add a conversation turn to an intent's chat (BTIP).
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
                "brain intent add-turn --id abc123 --actor user --content 'Fix bug' --json"
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
            )
        ):
            """
            Add a conversation turn to an intent's chat.
            
            Used for BTIP (Briefing → Turno → Iteración → Producción) workflow.
            Each turn creates a new refinement/curation directory with the message.
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
                
                # 4. Verbose logging
                if gc.verbose:
                    typer.echo(f"💬 Adding turn to intent...", err=True)
                    typer.echo(f"   Actor: {actor}", err=True)
                    typer.echo(f"   Content length: {len(content)} chars", err=True)
                
                # 5. Lazy Import del Core
                from brain.core.intent.manager import IntentManager
                
                # 6. Add turn
                manager = IntentManager()
                data = manager.add_turn(
                    intent_id=intent_id,
                    folder_name=folder_name,
                    actor=actor,
                    content=content,
                    nucleus_path=nucleus_path
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
        typer.echo(f"🔢 Turn ID: {turn_data.get('turn_id', 'N/A')}")
        typer.echo(f"{actor_icon} Actor: {turn_data.get('actor', 'N/A')}")
        typer.echo(f"📂 Path: {turn_data.get('turn_path', 'N/A')}")
        typer.echo(f"🕐 Timestamp: {turn_data.get('timestamp', 'N/A')}")
        typer.echo(f"\n💡 Turn saved and ready for processing")
    
    def _handle_error(self, gc, message: str):
        """Unified error handling."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)