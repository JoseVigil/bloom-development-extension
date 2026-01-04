"""
Development environment detection command.
Checks TCP ports to determine dev vs production mode.
"""

import typer
import json
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class HealthDevCheckCommand(BaseCommand):
    """
    Check development environment and service status.
    Detects if running in dev mode by checking Vite dev server port (5173).
    """
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="dev-check",
            category=CommandCategory.HEALTH,
            version="1.0.0",
            description="Verify development environment and service status (Vite, API, WebSocket)",
            examples=[
                "brain health dev-check",
                "brain health dev-check --json",
                "brain health dev-check --verbose"
            ]
        )

    def register(self, app: typer.Typer):
        @app.command(
            name=self.metadata().name,
            help=self.metadata().description
        )
        def execute(
            ctx: typer.Context,
            timeout: float = typer.Option(
                2.0,
                "--timeout",
                "-t",
                help="Connection timeout per port check in seconds"
            ),
            json_output: bool = typer.Option(
                False,
                "--json",
                help="Output raw JSON"
            ),
            verbose: bool = typer.Option(
                False,
                "--verbose",
                "-v",
                help="Detailed logging of each port check"
            )
        ):
            """Check development environment and service status."""
            
            # 1. Recuperar GlobalContext
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            if verbose:
                gc.verbose = True
            
            try:
                # 2. Lazy Import del Core
                from brain.core.health.dev_environment_manager import DevEnvironmentManager
                
                # 3. Verbose logging
                if gc.verbose:
                    typer.echo("🔍 Checking development environment...", err=True)
                
                # 4. Ejecutar lógica del Core
                manager = DevEnvironmentManager()
                env_data = manager.detect_environment(timeout=timeout)
                
                # 5. Empaquetar resultado
                result = {
                    "status": "success",
                    "operation": "dev-check",
                    "data": env_data
                }
                
                # 6. Output dual
                if json_output:
                    typer.echo(json.dumps(result, indent=2))
                else:
                    gc.output(result, self._render_success)
                
            except Exception as e:
                self._handle_error(gc, f"Error checking dev environment: {str(e)}")
    
    def _render_success(self, result: dict):
        """Output humano para desarrollo/producción."""
        data = result['data']
        is_dev = data.get('is_dev_mode', False)
        reason = data.get('reason', 'Unknown')
        services = data.get('services', {})
        
        # Header con modo detectado
        mode_emoji = "🔧" if is_dev else "📦"
        mode_text = "DEVELOPMENT" if is_dev else "PRODUCTION"
        
        typer.echo(f"\n{'='*60}")
        typer.echo(f"Environment: {mode_emoji} {mode_text}")
        typer.echo(f"Reason: {reason}")
        typer.echo(f"{'='*60}\n")
        
        # Tabla de servicios
        typer.echo("Services Status:")
        typer.echo(f"{'Service':<20} {'Port':<8} {'Status':<10} {'Host'}")
        typer.echo("-" * 60)
        
        for service_name, service_info in services.items():
            available = service_info.get('available', False)
            port = service_info.get('port', 'N/A')
            host = service_info.get('host', 'N/A')
            
            status_emoji = "✅" if available else "❌"
            status_text = "OPEN" if available else "CLOSED"
            
            service_display = service_name.replace('_', ' ').title()
            typer.echo(f"{service_display:<20} {port:<8} {status_text:<10} {host}")
        
        typer.echo()
        
        # Warnings si algo falta
        closed_services = [
            name for name, info in services.items() 
            if not info.get('available', False)
        ]
        
        if closed_services:
            typer.echo("⚠️  Warning: Some services are not running:")
            for service in closed_services:
                typer.echo(f"   └─ {service.replace('_', ' ').title()}")
            typer.echo()
    
    def _handle_error(self, gc, message: str):
        """Manejo unificado de errores."""
        if gc.json_mode:
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)