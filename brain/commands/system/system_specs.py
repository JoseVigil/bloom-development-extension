"""
System specifications command for Brain CLI.
Displays comprehensive runtime and build metadata.
"""

import typer
from pathlib import Path
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class SystemSpecsCommand(BaseCommand):
    """
    Command to display Brain CLI system specifications.
    Shows runtime environment, build info, and loaded modules.
    """
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="system-specs",
            category=CommandCategory.SYSTEM,
            version="1.0.0",
            description="Display comprehensive system specifications and runtime metadata",
            examples=[
                "brain system system-specs",
                "brain system system-specs --json"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        """Register the system-specs command."""
        
        @app.command(name=self.metadata().name)
        def execute(
            ctx: typer.Context
        ):
            """Display comprehensive system specifications."""
            
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
                    typer.echo("🔍 Recopilando especificaciones del sistema...", err=True)
                
                # 4. Ejecutar lógica del Core
                manager = MetadataManager()
                data = manager.get_system_specs()
                
                # 5. Empaquetar resultado
                result = {
                    "status": "success",
                    "operation": "system_specs",
                    "data": data
                }
                
                # 6. Output dual
                gc.output(result, self._render_success)
                
            except Exception as e:
                self._handle_error(gc, f"Error retrieving system specs: {e}")
    
    def _render_success(self, data: dict):
        """Output humano para éxito (formato clave:valor alfabético)."""
        specs = data.get('data', {})
        
        # Ordenar alfabéticamente por clave
        sorted_keys = sorted(specs.keys())
        
        for key in sorted_keys:
            value = specs[key]
            typer.echo(f"{key}: {value}")
    
    def _handle_error(self, gc, message: str):
        """Manejo unificado de errores."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)
