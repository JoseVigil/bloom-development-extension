"""Intent lock command - Lock an intent for exclusive use."""
import typer
from pathlib import Path
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class LockCommand(BaseCommand):
    """
    Command to lock an intent, marking it as in-use.
    Implements determinism (P5) - only one intent active at a time.
    """
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="lock",
            category=CommandCategory.INTENT,
            version="1.0.0",
            description="Lock an intent to mark it as in-use (determinism)",
            examples=[
                "brain intent lock --id abc123",
                "brain intent lock --folder .fix-login-a1b2c3d4",
                "brain intent lock --id abc123 --json"
            ]
        )
    
    def register(self, app: typer.Typer) -> None:
        """Register the intent lock command."""
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
            Lock an intent for exclusive use.
            
            Prevents concurrent modifications and ensures only one intent
            can modify the codebase/docbase at a time (determinism P5).
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
                    typer.echo(f"🔒 Locking intent...", err=True)
                
                # 4. Lazy Import del Core
                from brain.core.intent_manager import IntentManager
                
                # 5. Lock intent
                manager = IntentManager()
                data = manager.lock_intent(
                    intent_id=intent_id,
                    folder_name=folder_name,
                    nucleus_path=nucleus_path
                )
                
                # 6. Empaquetar resultado
                result = {
                    "status": "success",
                    "operation": "intent_lock",
                    "data": data
                }
                
                # 7. Output dual
                gc.output(result, self._render_success)
                
            except ValueError as e:
                self._handle_error(gc, f"Cannot lock: {e}")
            except Exception as e:
                self._handle_error(gc, f"Error locking intent: {e}")
    
    def _render_success(self, data: dict):
        """Render human-readable output."""
        lock_data = data.get("data", {})
        
        typer.echo(f"\n🔒 Intent locked successfully!")
        typer.echo(f"📝 Intent: {lock_data.get('name', 'Unknown')}")
        typer.echo(f"🆔 ID: {lock_data.get('intent_id', 'N/A')}")
        typer.echo(f"🖥️  Locked by: {lock_data.get('locked_by', 'unknown')}")
        typer.echo(f"🕐 Locked at: {lock_data.get('locked_at', 'N/A')}")
        typer.echo(f"\n💡 Remember to unlock when done: brain intent unlock --id {lock_data.get('intent_id', '')[:16]}...")
    
    def _handle_error(self, gc, message: str):
        """Unified error handling."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)