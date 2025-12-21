"""
Intent update command - CLI Layer.
Handles updating existing intent properties and metadata.
"""

import typer
from pathlib import Path
from typing import Optional, List
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class UpdateCommand(BaseCommand):
    """
    Command to update an existing intent's properties.
    
    Allows modification of intent name, files, and other metadata.
    Handles folder renaming when name changes (due to UUID3 regeneration).
    """
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="update",
            category=CommandCategory.INTENT,
            version="1.0.0",
            description="Update an existing intent's name, files, or metadata",
            examples=[
                "brain intent update --intent-id abc123 --name 'New intent name'",
                "brain intent update --intent-id abc123 --files src/new.py --files src/another.js",
                "brain intent update --intent-id abc123 --name 'Updated' --files src/file.py",
                "brain intent update --folder .fix-login-a1b2c3d4 --name 'Fix auth flow'",
                "brain intent update --intent-id abc123 --add-files src/extra.py",
                "brain intent update --intent-id abc123 --remove-files src/old.py --json"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        """
        Registers the intent update command with the Typer application.
        """
        @app.command(name=self.metadata().name)
        def execute(
            ctx: typer.Context,
            intent_id: Optional[str] = typer.Option(
                None,
                "--intent-id",
                "-i",
                help="UUID of the intent to update"
            ),
            folder_name: Optional[str] = typer.Option(
                None,
                "--folder",
                "-f",
                help="Folder name of the intent (e.g., .fix-login-a1b2c3d4)"
            ),
            name: Optional[str] = typer.Option(
                None,
                "--name",
                "-n",
                help="New name for the intent (triggers folder rename)"
            ),
            files: Optional[List[str]] = typer.Option(
                None,
                "--files",
                help="Replace all initial files with this new list"
            ),
            add_files: Optional[List[str]] = typer.Option(
                None,
                "--add-files",
                help="Add files to the existing initial_files list"
            ),
            remove_files: Optional[List[str]] = typer.Option(
                None,
                "--remove-files",
                help="Remove files from the initial_files list"
            ),
            nucleus_path: Optional[Path] = typer.Option(
                None,
                "--nucleus-path",
                "-p",
                help="Path to the Nucleus (Bloom project root). Auto-detected if not provided."
            )
        ):
            """
            Update an existing intent's properties.
            
            You must specify the intent using either --intent-id or --folder.
            
            When updating the name, the folder will be automatically renamed to match
            the new UUID3 generated from the new name.
            
            File operations:
            - --files: Replace entire file list
            - --add-files: Add files to existing list
            - --remove-files: Remove files from existing list
            
            Extended fields (for future use):
            This command is designed to be extended with additional fields like:
            - User input content
            - API configurations
            - Profile settings
            - Custom metadata
            """
            
            # 1. Recuperar GlobalContext
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                # 2. Validar que se proporcione al menos un identificador
                if not intent_id and not folder_name:
                    self._handle_error(
                        gc,
                        "Must provide either --intent-id or --folder to identify the intent"
                    )
                
                # 3. Validar que se proporcione al menos un campo para actualizar
                if not any([name, files, add_files, remove_files]):
                    self._handle_error(
                        gc,
                        "Must provide at least one field to update (--name, --files, --add-files, or --remove-files)"
                    )
                
                # 4. Procesar listas de archivos
                processed_files = None
                if files:
                    processed_files = self._process_file_list(files)
                
                processed_add_files = None
                if add_files:
                    processed_add_files = self._process_file_list(add_files)
                
                processed_remove_files = None
                if remove_files:
                    processed_remove_files = self._process_file_list(remove_files)
                
                # 5. Verbose logging
                if gc.verbose:
                    typer.echo("🔍 Updating intent...", err=True)
                    if intent_id:
                        typer.echo(f"🔍 Intent ID: {intent_id}", err=True)
                    if folder_name:
                        typer.echo(f"🔍 Folder: {folder_name}", err=True)
                    if name:
                        typer.echo(f"🔍 New name: {name}", err=True)
                    if processed_files:
                        typer.echo(f"🔍 Replacing files: {len(processed_files)} file(s)", err=True)
                    if processed_add_files:
                        typer.echo(f"🔍 Adding files: {len(processed_add_files)} file(s)", err=True)
                    if processed_remove_files:
                        typer.echo(f"🔍 Removing files: {len(processed_remove_files)} file(s)", err=True)
                
                # 6. Lazy Import del Core
                from brain.core.intent.manager import IntentManager
                
                # 7. Ejecutar lógica del Core
                manager = IntentManager()
                data = manager.update_intent(
                    intent_id=intent_id,
                    folder_name=folder_name,
                    new_name=name,
                    replace_files=processed_files,
                    add_files=processed_add_files,
                    remove_files=processed_remove_files,
                    nucleus_path=nucleus_path
                )
                
                # 8. Empaquetar resultado
                result = {
                    "status": "success",
                    "operation": "intent_update",
                    "data": data
                }
                
                # 9. Output dual
                gc.output(result, self._render_success)
                
            except ValueError as e:
                self._handle_error(gc, f"Validation error: {e}")
            except FileNotFoundError as e:
                self._handle_error(gc, f"File not found: {e}")
            except Exception as e:
                self._handle_error(gc, f"Unexpected error: {e}")
    
    def _process_file_list(self, files: List[str]) -> List[str]:
        """
        Process file list supporting comma-separated format.
        
        Args:
            files: List of file arguments
            
        Returns:
            Processed flat list of file paths
        """
        processed = []
        for file_arg in files:
            if "," in file_arg:
                processed.extend([f.strip() for f in file_arg.split(",")])
            else:
                processed.append(file_arg.strip())
        return processed
    
    def _render_success(self, data: dict):
        """
        Renders human-readable success output.
        
        Args:
            data: Result data from the operation
        """
        intent_data = data.get("data", {})
        changes = intent_data.get("changes", {})
        
        typer.echo(f"\n✅ Intent '{intent_data['name']}' ({intent_data['type']}) updated successfully")
        typer.echo(f"📂 Path: {intent_data['intent_path']}")
        typer.echo(f"📁 Folder: {intent_data['folder_name']}")
        typer.echo(f"🆔 ID: {intent_data['intent_id']}")
        
        # Show what changed
        if changes:
            typer.echo("\n📝 Changes applied:")
            
            if changes.get("name_changed"):
                typer.echo(f"   • Name: '{changes['old_name']}' → '{changes['new_name']}'")
                typer.echo(f"   • Folder renamed: '{changes['old_folder']}' → '{changes['new_folder']}'")
            
            if changes.get("files_replaced"):
                typer.echo(f"   • Files replaced: {len(intent_data.get('initial_files', []))} file(s) total")
            
            if changes.get("files_added"):
                typer.echo(f"   • Files added: {changes['files_added']} file(s)")
            
            if changes.get("files_removed"):
                typer.echo(f"   • Files removed: {changes['files_removed']} file(s)")
        
        # Show current files
        if intent_data.get("initial_files"):
            typer.echo(f"\n📄 Current files: {len(intent_data['initial_files'])} file(s)")
            for file in intent_data['initial_files']:
                typer.echo(f"   - {file}")
        else:
            typer.echo("\n📄 Current files: None")
        
        typer.echo(f"\n💡 Updated at: {intent_data.get('updated_at', 'N/A')}")
    
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