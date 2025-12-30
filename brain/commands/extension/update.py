"""
Update command for Chrome extension
"""

import typer
from pathlib import Path
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class UpdateCommand(BaseCommand):
    """
    Update Chrome extension to latest version.
    Checks for updates and installs if available.
    """
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="update",
            category=CommandCategory.EXTENSION,
            version="1.0.0",
            description="Update Chrome extension to latest version",
            examples=[
                "brain extension update",
                "brain extension update --source ~/Downloads/extension",
                "brain extension update --json"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        """
        Register the update command with the Typer app.
        
        Args:
            app: Typer application instance
        """
        @app.command(
            name=self.metadata().name,
            help="Update Chrome extension to latest version"
        )
        def execute(
            ctx: typer.Context,
            source: Optional[Path] = typer.Option(
                None,
                "--source",
                "-s",
                help="Source directory (auto-detects if not provided)",
                exists=True,
                file_okay=False,
                dir_okay=True,
                resolve_path=True
            )
        ):
            """
            Update Chrome extension to the latest version.
            
            Checks if a new version is available and installs it.
            Backs up the current version before updating.
            """
            # 1. Recuperar GlobalContext
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                # 2. Lazy Import del Core
                from brain.core.extension.manager import ExtensionManager
                
                # 3. Verbose logging
                if gc.verbose:
                    typer.echo("🔄 Checking for extension updates...", err=True)
                    if source:
                        typer.echo(f"📦 Source directory: {source}", err=True)
                
                # 4. Ejecutar lógica del Core
                manager = ExtensionManager()
                result = manager.update(source)
                
                # 5. Empaquetar resultado
                if result['success']:
                    output_data = {
                        "status": "success",
                        "operation": "extension_update",
                        "data": {
                            "action": result['action'],
                            "version": result['version'],
                            "previous_version": result.get('previous_version'),
                            "extension_path": str(manager.extension_dir)
                        }
                    }
                else:
                    output_data = {
                        "status": "error",
                        "operation": "extension_update",
                        "message": result.get('error', 'Unknown error')
                    }
                
                # 6. Output dual
                if output_data['status'] == 'success':
                    gc.output(output_data, self._render_success)
                else:
                    self._handle_error(gc, output_data['message'])
                
            except FileNotFoundError as e:
                self._handle_error(gc, f"File not found: {e}")
            except Exception as e:
                self._handle_error(gc, f"Update error: {e}")
    
    def _render_success(self, data: dict):
        """Output humano para actualización exitosa."""
        operation_data = data['data']
        action = operation_data['action']
        version = operation_data['version']
        prev_version = operation_data.get('previous_version')
        
        if action == 'no_update_needed':
            typer.echo(f"✅ Extension is already up to date")
            typer.echo(f"   Current version: {version}")
        elif action == 'updated':
            typer.echo(f"✅ Extension updated successfully")
            typer.echo(f"   Version: {prev_version} → {version}")
            typer.echo(f"   Location: {operation_data['extension_path']}")
            typer.echo("\n💡 Reload the extension in Chrome for changes to take effect")
        elif action == 'installed':
            typer.echo(f"✅ Extension installed (no previous version found)")
            typer.echo(f"   Version: {version}")
            typer.echo(f"   Location: {operation_data['extension_path']}")
    
    def _handle_error(self, gc, message: str):
        """Manejo unificado de errores."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({
                "status": "error",
                "operation": "extension_update",
                "message": message
            }))
        else:
            typer.echo(f"❌ Update failed: {message}", err=True)
        raise typer.Exit(code=1)