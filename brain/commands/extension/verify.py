"""
Verify command for Chrome extension
"""

import typer
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class VerifyCommand(BaseCommand):
    """
    Verify Chrome extension installation integrity.
    Checks all required files and configuration.
    """
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="verify",
            category=CommandCategory.EXTENSION,
            version="1.0.0",
            description="Verify Chrome extension installation integrity",
            examples=[
                "brain extension verify",
                "brain extension verify --json",
                "brain extension verify --verbose"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        """
        Register the verify command with the Typer app.
        
        Args:
            app: Typer application instance
        """
        @app.command(
            name=self.metadata().name,
            help="Verify Chrome extension installation integrity"
        )
        def execute(ctx: typer.Context):
            """
            Verify that the Chrome extension is correctly installed.
            
            Performs comprehensive checks on:
            - Extension directory existence
            - Required files (manifest.json, background.js, content.js)
            - Version information
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
                    typer.echo("🔍 Starting extension verification...", err=True)
                
                # 4. Ejecutar lógica del Core
                manager = ExtensionManager()
                result = manager.verify()
                
                # 5. Empaquetar resultado
                if result['success']:
                    output_data = {
                        "status": "success",
                        "operation": "extension_verify",
                        "data": {
                            "version": result['version'],
                            "checks": result['checks'],
                            "extension_path": str(manager.extension_dir)
                        }
                    }
                else:
                    output_data = {
                        "status": "error",
                        "operation": "extension_verify",
                        "message": "Verification failed",
                        "data": {
                            "checks": result['checks']
                        }
                    }
                
                # 6. Output dual
                if output_data['status'] == 'success':
                    gc.output(output_data, self._render_success)
                else:
                    gc.output(output_data, self._render_failure)
                    raise typer.Exit(code=1)
                
            except Exception as e:
                self._handle_error(gc, f"Verification error: {e}")
    
    def _render_success(self, data: dict):
        """Output humano para verificación exitosa."""
        operation_data = data['data']
        version = operation_data['version']
        checks = operation_data['checks']
        
        typer.echo(f"✅ Extension verified successfully")
        typer.echo(f"   Version: {version}")
        typer.echo(f"   Location: {operation_data['extension_path']}")
        typer.echo("\n   Component checks:")
        
        for check_name, status in checks.items():
            icon = '✅' if status else '❌'
            formatted_name = check_name.replace('_', ' ').title()
            typer.echo(f"   {icon} {formatted_name}")
    
    def _render_failure(self, data: dict):
        """Output humano para verificación fallida."""
        checks = data['data']['checks']
        
        typer.echo("❌ Extension verification failed")
        typer.echo("\n   Issues detected:")
        
        for check_name, status in checks.items():
            if not status:
                formatted_name = check_name.replace('_', ' ').title()
                typer.echo(f"   ❌ {formatted_name}")
        
        typer.echo("\n💡 Tip: Run 'brain extension install' to reinstall")
    
    def _handle_error(self, gc, message: str):
        """Manejo unificado de errores."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({
                "status": "error",
                "operation": "extension_verify",
                "message": message
            }))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)