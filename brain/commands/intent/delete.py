"""Intent delete command - Delete an intent completely."""
import typer
from pathlib import Path
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class DeleteCommand(BaseCommand):
    """
    Command to delete an intent completely, removing all its data.
    """
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="delete",
            category=CommandCategory.INTENT,
            version="1.0.0",
            description="Delete an intent completely",
            examples=[
                "brain intent delete --id abc123",
                "brain intent delete --folder .fix-login-a1b2c3d4",
                "brain intent delete --id abc123 --force"
            ]
        )
    
    def register(self, app: typer.Typer) -> None:
        """Register the intent delete command."""
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
                help="Skip confirmation and force delete even if locked"
            ),
            nucleus_path: Optional[Path] = typer.Option(
                None,
                "--nucleus-path",
                "-p",
                help="Path to Bloom project"
            )
        ):
            """
            Delete an intent and all its data.
            
            This removes the entire intent directory including:
            - State files
            - Briefing/context data
            - All turns
            - Pipeline data
            
            WARNING: This action is irreversible!
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
                
                # 3. Confirmar si no hay --force y no es JSON mode
                if not force and not gc.json_mode:
                    # Obtener info del intent primero
                    from brain.core.intent_manager import IntentManager
                    manager = IntentManager()
                    
                    try:
                        intent_info = manager.get_intent(
                            intent_id=intent_id,
                            folder_name=folder_name,
                            nucleus_path=nucleus_path
                        )
                        
                        typer.echo(f"\n⚠️  WARNING: You are about to delete intent:")
                        typer.echo(f"   Name: {intent_info.get('name', 'Unknown')}")
                        typer.echo(f"   ID: {intent_info.get('id', 'N/A')}")
                        typer.echo(f"   Type: {intent_info.get('type', 'N/A')}")
                        typer.echo(f"   Path: {intent_info.get('path', 'N/A')}")
                        
                        if intent_info.get('locked', False):
                            typer.echo(f"\n🔒 WARNING: Intent is LOCKED by {intent_info.get('locked_by', 'unknown')}")
                        
                        typer.echo(f"\n❌ This action is IRREVERSIBLE and will delete:")
                        typer.echo(f"   • All state data")
                        typer.echo(f"   • All turns ({intent_info.get('turns_count', 0)} turns)")
                        typer.echo(f"   • All pipeline data")
                        typer.echo(f"   • All files in the intent directory")
                        
                        confirm = typer.confirm("\nAre you sure you want to continue?")
                        if not confirm:
                            typer.echo("❌ Deletion cancelled")
                            raise typer.Exit(code=0)
                    except ValueError:
                        # Intent not found, continue anyway
                        pass
                
                # 4. Verbose logging
                if gc.verbose:
                    typer.echo(f"🗑️  Deleting intent...", err=True)
                
                # 5. Lazy Import del Core
                from brain.core.intent_manager import IntentManager
                
                # 6. Delete intent
                manager = IntentManager()
                data = manager.delete_intent(
                    intent_id=intent_id,
                    folder_name=folder_name,
                    nucleus_path=nucleus_path,
                    force=force
                )
                
                # 7. Empaquetar resultado
                result = {
                    "status": "success",
                    "operation": "intent_delete",
                    "data": data
                }
                
                # 8. Output dual
                gc.output(result, self._render_success)
                
            except ValueError as e:
                self._handle_error(gc, f"Cannot delete: {e}")
            except Exception as e:
                self._handle_error(gc, f"Error deleting intent: {e}")
    
    def _render_success(self, data: dict):
        """Render human-readable output."""
        delete_data = data.get("data", {})
        
        typer.echo(f"\n✅ Intent deleted successfully!")
        typer.echo(f"📝 Intent: {delete_data.get('name', 'Unknown')}")
        typer.echo(f"🆔 ID: {delete_data.get('intent_id', 'N/A')}")
        typer.echo(f"🗑️  Removed: {delete_data.get('path', 'N/A')}")
        typer.echo(f"\n💡 All intent data has been permanently removed")
    
    def _handle_error(self, gc, message: str):
        """Unified error handling."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)