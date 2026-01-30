"""
Release information command for Brain CLI.
Displays semantic version and build number.
"""

import typer
from pathlib import Path
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class ReleaseInfoCommand(BaseCommand):
    """
    Command to display Brain CLI release information.
    Shows semantic version (X.Y.Z) and incremental build number.
    """
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="release-info",
            category=CommandCategory.SYSTEM,
            version="1.0.0",
            description="Display Brain CLI release version and build number",
            examples=[
                "brain system release-info",
                "brain system release-info --json"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        """Register the release-info command."""
        
        @app.command(name=self.metadata().name)
        def execute(
            ctx: typer.Context
        ):
            """Display Brain CLI release information (version and build number)."""
            
            # 1. Recuperar GlobalContext
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                # 2. Lazy Import del Core
                from brain.core.system.metadata_manager import MetadataManager
                
                # 3. Verbose logging
                if gc.verbose:
                    typer.echo("🔍 Recopilando información de release...", err=True)
                
                # 4. Ejecutar lógica del Core
                manager = MetadataManager()
                data = manager.get_release_info()
                
                # 5. Empaquetar resultado
                result = {
                    "status": "success",
                    "operation": "release_info",
                    "data": data
                }
                
                # 6. Output dual
                gc.output(result, self._render_success)
                
            except Exception as e:
                self._handle_error(gc, f"Error retrieving release info: {e}")
    
    def _render_success(self, data: dict):
        """Output humano para éxito."""
        release_data = data.get('data', {})
        app_name = release_data.get('app_name', 'brain.exe')
        version = release_data.get('app_release', 'unknown')
        build = release_data.get('build_counter', 0)
        
        # Formato estándar: "brain.exe release X.Y.Z build N"
        typer.echo(f"{app_name} release {version} build {build}")
    
    def _handle_error(self, gc, message: str):
        """Manejo unificado de errores."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)
