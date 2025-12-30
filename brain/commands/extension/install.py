"""
Install command for Chrome extension
"""

import typer
from pathlib import Path
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class InstallCommand(BaseCommand):
    """
    Install or update Chrome extension to permanent location.
    Supports auto-detection of source directory and force reinstall.
    """
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="install",
            category=CommandCategory.EXTENSION,
            version="1.0.0",
            description="Install Chrome extension from source to permanent location",
            examples=[
                "brain extension install",
                "brain extension install --source ~/Downloads/extension",
                "brain extension install --force --json"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        """
        Register the install command with the Typer app.
        
        Args:
            app: Typer application instance
        """
        @app.command(
            name=self.metadata().name,
            help="Install Chrome extension from source to permanent location"
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
            ),
            force: bool = typer.Option(
                False,
                "--force",
                "-f",
                help="Force reinstall even if same version exists"
            )
        ):
            """
            Install Chrome extension to permanent location.
            
            Auto-detects source directory from common locations if not provided.
            Backs up existing version before installing new one.
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
                    typer.echo("🧩 Initializing extension installation...", err=True)
                    if source:
                        typer.echo(f"📦 Source directory: {source}", err=True)
                    else:
                        typer.echo("🔍 Auto-detecting source directory...", err=True)
                
                # 4. Ejecutar lógica del Core
                manager = ExtensionManager()
                
                # Force mode: remove version file to force reinstall
                if force:
                    if gc.verbose:
                        typer.echo("🔄 Force mode enabled: forcing reinstall", err=True)
                    if manager.version_file.exists():
                        manager.version_file.unlink()
                
                result = manager.install(source)
                
                # 5. Empaquetar resultado
                if result['success']:
                    output_data = {
                        "status": "success",
                        "operation": "extension_install",
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
                        "operation": "extension_install",
                        "message": result.get('error', 'Unknown error')
                    }
                
                # 6. Output dual
                if output_data['status'] == 'success':
                    gc.output(output_data, self._render_success)
                else:
                    self._handle_error(gc, output_data['message'])
                
            except FileNotFoundError as e:
                self._handle_error(gc, f"File not found: {e}")
            except PermissionError as e:
                self._handle_error(gc, f"Permission denied: {e}")
            except Exception as e:
                self._handle_error(gc, f"Installation error: {e}")
    
    def _render_success(self, data: dict):
        """Output humano para instalación exitosa."""
        operation_data = data['data']
        action = operation_data['action']
        version = operation_data['version']
        prev_version = operation_data.get('previous_version')
        
        if action == 'already_installed':
            typer.echo(f"✅ Extension already installed and up to date")
            typer.echo(f"   Version: {version}")
        elif action == 'updated':
            typer.echo(f"✅ Extension updated successfully")
            typer.echo(f"   Version: {prev_version} → {version}")
        else:  # installed
            typer.echo(f"✅ Extension installed successfully")
            typer.echo(f"   Version: {version}")
        
        typer.echo(f"   Location: {operation_data['extension_path']}")
        typer.echo("\n💡 Next steps:")
        typer.echo("   1. Open Chrome and go to chrome://extensions")
        typer.echo("   2. Enable 'Developer mode'")
        typer.echo("   3. Click 'Load unpacked' and select the extension directory")
    
    def _handle_error(self, gc, message: str):
        """Manejo unificado de errores."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({
                "status": "error",
                "operation": "extension_install",
                "message": message
            }))
        else:
            typer.echo(f"❌ Installation failed: {message}", err=True)
        raise typer.Exit(code=1)