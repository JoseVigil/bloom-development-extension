"""Intent list command - List all intents in a project."""
import typer
from pathlib import Path
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class ListCommand(BaseCommand):
    """
    Command to list all intents (dev and/or doc) in a Bloom project.
    """
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="list",
            category=CommandCategory.INTENT,
            version="1.0.0",
            description="List all intents in a Bloom project",
            examples=[
                "brain intent list",
                "brain intent list --type dev",
                "brain intent list --type doc --json",
                "brain intent list --nucleus-path ~/my-project"
            ]
        )
    
    def register(self, app: typer.Typer) -> None:
        """Register the intent list command."""
        @app.command(name=self.metadata().name)
        def execute(
            ctx: typer.Context,
            nucleus_path: Optional[Path] = typer.Option(
                None,
                "--nucleus-path",
                "-p",
                help="Path to Bloom project (auto-detected if not provided)"
            ),
            intent_type: Optional[str] = typer.Option(
                None,
                "--type",
                "-t",
                help="Filter by intent type: 'dev' or 'doc'"
            )
        ):
            """
            List all intents in the project.
            
            Shows intent ID, name, type, status, and basic metadata.
            Use --type to filter by dev or doc intents only.
            """
            # 1. Recuperar GlobalContext
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                # 2. Validar tipo si se proporciona
                if intent_type and intent_type not in ["dev", "doc"]:
                    self._handle_error(gc, f"Invalid type '{intent_type}'. Must be 'dev' or 'doc'")
                
                # 3. Verbose logging
                if gc.verbose:
                    typer.echo(f"🔍 Listing intents...", err=True)
                    if intent_type:
                        typer.echo(f"   Type filter: {intent_type}", err=True)
                
                # 4. Lazy Import del Core
                from brain.core.intent_manager import IntentManager
                
                # 5. Listar intents
                manager = IntentManager()
                data = manager.list_intents(
                    nucleus_path=nucleus_path,
                    intent_type=intent_type
                )
                
                # 6. Empaquetar resultado
                result = {
                    "status": "success",
                    "operation": "intent_list",
                    "data": data
                }
                
                # 7. Output dual
                gc.output(result, self._render_success)
                
            except FileNotFoundError as e:
                self._handle_error(gc, f"Project not found: {e}")
            except Exception as e:
                self._handle_error(gc, f"Error listing intents: {e}")
    
    def _render_success(self, data: dict):
        """Render human-readable output."""
        intent_data = data.get("data", {})
        intents = intent_data.get("intents", [])
        
        if not intents:
            typer.echo(f"\n📭 No intents found in project")
            typer.echo(f"📂 Project: {intent_data.get('project_path', 'N/A')}")
            typer.echo(f"\n💡 Use 'brain intent create' to create a new intent")
            return
        
        typer.echo(f"\n✅ Found {intent_data.get('total', 0)} intent(s)")
        typer.echo(f"📂 Project: {intent_data.get('project_path', 'N/A')}")
        typer.echo()
        
        # Agrupar por tipo
        dev_intents = [i for i in intents if i.get("type") == "dev"]
        doc_intents = [i for i in intents if i.get("type") == "doc"]
        
        if dev_intents:
            typer.echo(f"🔧 Development Intents ({len(dev_intents)}):")
            for intent in dev_intents:
                self._render_intent_line(intent)
        
        if doc_intents:
            if dev_intents:
                typer.echo()
            typer.echo(f"📚 Documentation Intents ({len(doc_intents)}):")
            for intent in doc_intents:
                self._render_intent_line(intent)
    
    def _render_intent_line(self, intent: dict):
        """Render a single intent line."""
        status_icon = {
            "created": "🆕",
            "active": "⚡",
            "completed": "✅",
            "unknown": "❓"
        }.get(intent.get("status", "unknown"), "❓")
        
        lock_icon = "🔒" if intent.get("locked", False) else ""
        
        typer.echo(
            f"  {status_icon} {lock_icon} {intent.get('name', 'Unknown')} "
            f"({intent.get('folder', 'N/A')})"
        )
        typer.echo(f"     ID: {intent.get('id', 'N/A')[:16]}...")
        typer.echo(f"     Files: {intent.get('initial_files_count', 0)} | "
                   f"Created: {intent.get('created_at', 'N/A')[:19]}")
    
    def _handle_error(self, gc, message: str):
        """Unified error handling."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)