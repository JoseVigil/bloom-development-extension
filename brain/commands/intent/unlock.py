"""Intent unlock command - Unlock an intent."""
import typer
from pathlib import Path
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class UnlockCommand(BaseCommand):
    """
    Command to unlock an intent, freeing it for use.
    """
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="unlock",
            category=CommandCategory.INTENT,
            version="1.0.0",
            description="Unlock an intent to free it for use",
            examples=[
                "brain intent unlock --id abc123",
                "brain intent unlock --folder .fix-login-a1b2c3d4",
                "brain intent unlock --id abc123 --force"
            ]
        )
    
    def register(self, app: typer.Typer) -> None:
        """Register the intent unlock command."""
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
            force: bool = typer.Option(
                False,
                "--force",
                help="Force unlock even if locked by another host"
            ),
            nucleus_path: Optional[Path] = typer.Option(
                None,
                "--nucleus-path",
                "-p",
                help="Path to Bloom project"
            )
        ):
            """
            Unlock an intent to free it for use.
            
            Use --force to unlock even if locked by another host.
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
                    typer.echo(f"🔓 Unlocking intent...", err=True)
                    if force:
                        typer.echo(f"   Using --force", err=True)
                
                # 4. Lazy Import del Core
                from brain.core.intent_manager import IntentManager
                
                # 5. Unlock intent
                manager = IntentManager()
                data = manager.unlock_intent(
                    intent_id=intent_id,
                    folder_name=folder_name,
                    nucleus_path=nucleus_path,
                    force=force
                )
                
                # 6. Empaquetar resultado
                result = {
                    "status": "success",
                    "operation": "intent_unlock",
                    "data": data
                }
                
                # 7. Output dual
                gc.output(result, self._render_success)
                
            except ValueError as e:
                self._handle_error(gc, f"Cannot unlock: {e}")
            except Exception as e:
                self._handle_error(gc, f"Error unlocking intent: {e}")
    
    def _render_success(self, data: dict):
        """Render human-readable output."""
        unlock_data = data.get("data", {})
        
        typer.echo(f"\n🔓 Intent unlocked successfully!")
        typer.echo(f"📝 Intent: {unlock_data.get('name', 'Unknown')}")
        typer.echo(f"🆔 ID: {unlock_data.get('intent_id', 'N/A')}")
        typer.echo(f"🕐 Unlocked at: {unlock_data.get('unlocked_at', 'N/A')}")
        typer.echo(f"\n💡 Intent is now available for use")
    
    def _handle_error(self, gc, message: str):
        """Unified error handling."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)