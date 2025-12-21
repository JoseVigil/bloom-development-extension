"""
Intent creation command - CLI Layer.
Handles the creation of new development or documentation intents.
"""

import typer
from pathlib import Path
from typing import Optional, List
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class CreateCommand(BaseCommand):
    """
    Command to create a new intent (dev or doc) in a Bloom project.
    
    This is the first step in the Intent lifecycle (CREATE/Genesis).
    Creates the complete directory structure and initial state files.
    """
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="create",
            category=CommandCategory.INTENT,
            version="1.0.0",
            description="Create a new development or documentation intent in the current project",
            examples=[
                "brain intent create --type dev --name 'Implement dark mode toggle'",
                "brain intent create --type dev --name 'Fix login auth' --files src/auth.py --files src/login.js",
                "brain intent create --type doc --name 'Generate API docs' --files docs/raw/endpoints.md",
                "brain intent create --type dev --name 'Add feature' --nucleus-path /path/to/project --json"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        """
        Registers the intent create command with the Typer application.
        """
        @app.command(name=self.metadata().name)
        def execute(
            ctx: typer.Context,
            intent_type: str = typer.Option(
                ...,
                "--type",
                "-t",
                help="Intent type: 'dev' for development or 'doc' for documentation"
            ),
            name: str = typer.Option(
                ...,
                "--name",
                "-n",
                help="Human-readable name for the intent (e.g., 'Fix login authentication flow')"
            ),
            files: Optional[List[str]] = typer.Option(
                None,
                "--files",
                "-f",
                help="Initial files to include in the intent context (can be repeated or comma-separated)"
            ),
            nucleus_path: Optional[Path] = typer.Option(
                None,
                "--nucleus-path",
                "-p",
                help="Path to the Nucleus (Bloom project root). Auto-detected if not provided."
            )
        ):
            """
            Create a new development or documentation intent.
            
            This command initializes a new intent by creating the complete directory
            structure and initial state files within a valid Bloom project.
            
            The --files option allows you to specify initial files that will be stored
            in the intent state for later use in hydration and other steps.
            """
            
            # 1. Recuperar GlobalContext
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                # 2. Validar tipo de intent
                intent_type = intent_type.lower()
                if intent_type not in ["dev", "doc"]:
                    self._handle_error(
                        gc,
                        f"Invalid intent type '{intent_type}'. Must be 'dev' or 'doc'."
                    )
                
                # 3. Procesar lista de archivos si se proporciona
                processed_files = []
                if files:
                    for file_arg in files:
                        # Soportar formato comma-separated
                        if "," in file_arg:
                            processed_files.extend([f.strip() for f in file_arg.split(",")])
                        else:
                            processed_files.append(file_arg.strip())
                
                # 4. Verbose logging
                if gc.verbose:
                    typer.echo(f"🔍 Creating {intent_type} intent: '{name}'", err=True)
                    if nucleus_path:
                        typer.echo(f"🔍 Using nucleus path: {nucleus_path}", err=True)
                    if processed_files:
                        typer.echo(f"🔍 Initial files: {len(processed_files)} file(s)", err=True)
                
                # 5. Lazy Import del Core
                from brain.core.intent.manager import IntentManager
                
                # 6. Ejecutar lógica del Core
                manager = IntentManager()
                data = manager.create_intent(
                    intent_type=intent_type,
                    name=name,
                    initial_files=processed_files if processed_files else None,
                    nucleus_path=nucleus_path
                )
                
                # 7. Empaquetar resultado
                result = {
                    "status": "success",
                    "operation": "intent_create",
                    "data": data
                }
                
                # 8. Output dual
                gc.output(result, self._render_success)
                
            except ValueError as e:
                self._handle_error(gc, f"Validation error: {e}")
            except FileNotFoundError as e:
                self._handle_error(gc, f"File not found: {e}")
            except Exception as e:
                self._handle_error(gc, f"Unexpected error: {e}")
    
    def _render_success(self, data: dict):
        """
        Renders human-readable success output.
        
        Args:
            data: Result data from the operation
        """
        intent_data = data.get("data", {})
        
        typer.echo(f"\n✅ Intent '{intent_data['name']}' ({intent_data['type']}) created successfully")
        typer.echo(f"📂 Path: {intent_data['intent_path']}")
        typer.echo(f"📁 Folder: {intent_data['folder_name']}")
        typer.echo(f"🆔 ID: {intent_data['intent_id']}")
        
        if intent_data.get("initial_files"):
            typer.echo(f"📄 Initial files: {len(intent_data['initial_files'])} file(s)")
            for file in intent_data['initial_files']:
                typer.echo(f"   - {file}")
        else:
            typer.echo("📄 Initial files: None")
        
        typer.echo(f"\n💡 Next step: brain intent hydrate --intent-id {intent_data['intent_id']}")
    
    def _handle_error(self, gc, message: str):
        """
        Unified error handling for CLI.
        
        Args:
            gc: GlobalContext instance
            message: Error message to display
        """
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)