"""Intent finalize command - Close intent and apply changes."""
import typer
from pathlib import Path
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class FinalizeCommand(BaseCommand):
    """
    Command to finalize an intent, marking it as completed
    and applying changes to the codebase/docbase.
    """
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="finalize",
            category=CommandCategory.INTENT,
            version="1.0.0",
            description="Finalize intent and apply changes",
            examples=[
                "brain intent finalize --id abc123",
                "brain intent finalize --folder .fix-login-a1b2c3d4",
                "brain intent finalize --id abc123 --json"
            ]
        )
    
    def register(self, app: typer.Typer) -> None:
        """Register the intent finalize command."""
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
            nucleus_path: Optional[Path] = typer.Option(
                None,
                "--nucleus-path",
                "-p",
                help="Path to Bloom project"
            )
        ):
            """
            Finalize an intent, applying changes to the codebase.
            
            This marks the intent as completed, unlocks it, and applies
            all staged changes to the project.
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
                
                # 3. Verbose logging
                if gc.verbose:
                    typer.echo(f"🎯 Finalizing intent...", err=True)
                
                # 4. Lazy Import del Core
                from brain.core.intent_manager import IntentManager
                
                # 5. Finalize intent
                manager = IntentManager()
                data = manager.finalize_intent(
                    intent_id=intent_id,
                    folder_name=folder_name,
                    nucleus_path=nucleus_path
                )
                
                # 6. Empaquetar resultado
                result = {
                    "status": "success",
                    "operation": "intent_finalize",
                    "data": data
                }
                
                # 7. Output dual
                gc.output(result, self._render_success)
                
            except ValueError as e:
                self._handle_error(gc, f"Cannot finalize: {e}")
            except Exception as e:
                self._handle_error(gc, f"Error finalizing intent: {e}")
    
    def _render_success(self, data: dict):
        """Render human-readable output."""
        finalize_data = data.get("data", {})
        
        typer.echo(f"\n✅ Intent finalized successfully!")
        typer.echo(f"📝 Intent: {finalize_data.get('name', 'Unknown')}")
        typer.echo(f"🆔 ID: {finalize_data.get('intent_id', 'N/A')}")
        typer.echo(f"📊 Status: {finalize_data.get('status', 'N/A')}")
        typer.echo(f"🕐 Finalized at: {finalize_data.get('finalized_at', 'N/A')}")
        typer.echo(f"📄 Files modified: {finalize_data.get('files_modified', 0)}")
        typer.echo(f"\n💡 Changes have been applied to the codebase")
        typer.echo(f"🔓 Intent has been unlocked")
    
    def _handle_error(self, gc, message: str):
        """Unified error handling."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)