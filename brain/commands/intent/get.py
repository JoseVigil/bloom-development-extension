"""Intent get command - Get complete intent information."""
import typer
from pathlib import Path
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class GetCommand(BaseCommand):
    """
    Command to retrieve complete information about a specific intent.
    """
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="get",
            category=CommandCategory.INTENT,
            version="1.0.0",
            description="Get complete information about a specific intent",
            examples=[
                "brain intent get --id abc123",
                "brain intent get --folder .fix-login-a1b2c3d4",
                "brain intent get --id abc123 --json"
            ]
        )
    
    def register(self, app: typer.Typer) -> None:
        """Register the intent get command."""
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
            Get complete details of an intent.
            
            Shows full state, files, turns, lock status, and all metadata.
            Must provide either --id or --folder to identify the intent.
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
                    typer.echo(f"🔍 Loading intent...", err=True)
                
                # 4. Lazy Import del Core
                from brain.core.intent_manager import IntentManager
                
                # 5. Obtener intent
                manager = IntentManager()
                data = manager.get_intent(
                    intent_id=intent_id,
                    folder_name=folder_name,
                    nucleus_path=nucleus_path
                )
                
                # 6. Empaquetar resultado
                result = {
                    "status": "success",
                    "operation": "intent_get",
                    "data": data
                }
                
                # 7. Output dual
                gc.output(result, self._render_success)
                
            except ValueError as e:
                self._handle_error(gc, f"Intent not found: {e}")
            except Exception as e:
                self._handle_error(gc, f"Error getting intent: {e}")
    
    def _render_success(self, data: dict):
        """Render human-readable output."""
        intent = data.get("data", {})
        
        status_emoji = {
            "created": "🆕",
            "active": "⚡",
            "completed": "✅",
            "unknown": "❓"
        }.get(intent.get("status", "unknown"), "❓")
        
        typer.echo(f"\n{status_emoji} Intent: {intent.get('name', 'Unknown')}")
        typer.echo(f"🆔 ID: {intent.get('id', 'N/A')}")
        typer.echo(f"📂 Folder: {intent.get('folder', 'N/A')}")
        typer.echo(f"📁 Path: {intent.get('path', 'N/A')}")
        typer.echo(f"🏷️  Type: {intent.get('type', 'N/A').upper()}")
        typer.echo(f"📊 Status: {intent.get('status', 'N/A')}")
        
        # Lock status
        if intent.get("locked", False):
            typer.echo(f"\n🔒 LOCKED")
            typer.echo(f"   By: {intent.get('locked_by', 'unknown')}")
            typer.echo(f"   At: {intent.get('locked_at', 'N/A')}")
        else:
            typer.echo(f"\n🔓 Unlocked")
        
        # Timestamps
        typer.echo(f"\n📅 Timeline:")
        typer.echo(f"   Created: {intent.get('created_at', 'N/A')}")
        if intent.get('updated_at'):
            typer.echo(f"   Updated: {intent.get('updated_at', 'N/A')}")
        
        # Files
        files = intent.get("initial_files", [])
        typer.echo(f"\n📄 Initial Files ({len(files)}):")
        if files:
            for file in files[:10]:  # Show first 10
                typer.echo(f"   • {file}")
            if len(files) > 10:
                typer.echo(f"   ... and {len(files) - 10} more")
        else:
            typer.echo("   (none)")
        
        # Steps
        steps = intent.get("steps", {})
        if steps:
            typer.echo(f"\n📋 Steps:")
            for step_name, completed in steps.items():
                icon = "✅" if completed else "⬜"
                typer.echo(f"   {icon} {step_name}")
        
        # Turns
        turns_count = intent.get("turns_count", 0)
        typer.echo(f"\n💬 Turns: {turns_count}")
        
        typer.echo(f"\n🗂️  Project: {intent.get('project_path', 'N/A')}")
    
    def _handle_error(self, gc, message: str):
        """Unified error handling."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)