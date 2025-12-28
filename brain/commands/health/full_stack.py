"""
Health check command for full Bloom Nucleus stack verification.
Verifies bloom-host, API REST, Chrome extension, Brain CLI, and onboarding status.
"""

import typer
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class HealthFullStackCommand(BaseCommand):
    """
    Comprehensive health check for entire Bloom Nucleus stack.
    Executes idempotent checks on all critical components.
    """
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="full-stack",
            category=CommandCategory.HEALTH,
            version="1.0.0",
            description="Verify complete stack health (host, API, extension, Brain, onboarding)",
            examples=[
                "brain health full-stack",
                "brain health full-stack --json",
                "brain health full-stack --verbose --timeout 10"
            ]
        )

    def register(self, app: typer.Typer):
        @app.command(
            name=self.metadata().name,
            help=self.metadata().description
        )
        def execute(
            ctx: typer.Context,
            timeout: Optional[int] = typer.Option(
                5,
                "--timeout",
                "-t",
                help="Timeout per check in seconds"
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
                help="Detailed logging"
            )
        ):
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            # Override verbosity if flag present
            if verbose:
                gc.verbose = True
            
            if gc.verbose:
                typer.echo("🏥 Iniciando verificación de salud completa del stack...", err=True)
            
            try:
                from brain.core.health.full_stack_manager import FullStackHealthManager
                
                manager = FullStackHealthManager(gc)
                health_data = manager.check_all_components(timeout=timeout)
                
                result = {
                    "status": "success",
                    "operation": self.metadata().name,
                    "data": health_data
                }
                
                if json_output:
                    import json
                    typer.echo(json.dumps(result, indent=2))
                else:
                    gc.output(result, self._render_success)
                
            except Exception as e:
                self._handle_error(gc, f"Error durante health check: {str(e)}")

    def _render_success(self, result: dict):
        """Render human-friendly health report"""
        data = result['data']
        status = data.get('status', 'unknown')
        
        # Header
        status_emoji = {
            'ok': '✅',
            'partial': '⚠️',
            'error': '❌',
            'unknown': '❓'
        }
        
        emoji = status_emoji.get(status, '❓')
        typer.echo(f"\n{emoji} Status General: {status.upper()}")
        typer.echo(f"📊 Health Score: {data.get('overall_health_score', 0)}%")
        typer.echo(f"⏱️  Check Duration: {data.get('check_duration_ms', 0)}ms")
        typer.echo(f"🕐 Timestamp: {data.get('timestamp', 'unknown')}\n")
        
        # Component details
        details = data.get('details', {})
        
        # Host check
        if 'host' in details:
            host = details['host']
            host_status = host.get('status', 'unknown')
            icon = '✅' if host_status == 'connected' else '❌'
            typer.echo(f"{icon} bloom-host.exe (TCP {host.get('port', 5678)})")
            typer.echo(f"   Status: {host_status}")
            if 'response_time_ms' in host:
                typer.echo(f"   Response Time: {host['response_time_ms']}ms")
            if 'error' in host:
                typer.echo(f"   Error: {host['error']}")
            typer.echo()
        
        # API check
        if 'api' in details:
            api = details['api']
            api_status = api.get('status', 'unknown')
            icon = '✅' if api_status == 'online' else '❌'
            typer.echo(f"{icon} API REST (HTTP {api.get('port', 48215)})")
            typer.echo(f"   Status: {api_status}")
            if 'version' in api:
                typer.echo(f"   Version: {api['version']}")
            if 'response_time_ms' in api:
                typer.echo(f"   Response Time: {api['response_time_ms']}ms")
            if 'error' in api:
                typer.echo(f"   Error: {api['error']}")
            typer.echo()
        
        # Extension check
        if 'extension' in details:
            ext = details['extension']
            ext_status = ext.get('status', 'unknown')
            icon = '✅' if ext_status == 'installed' else '❌'
            typer.echo(f"{icon} Chrome Extension")
            typer.echo(f"   Status: {ext_status}")
            if 'method' in ext:
                typer.echo(f"   Detection Method: {ext['method']}")
            if 'manifest_version' in ext:
                typer.echo(f"   Manifest Version: {ext['manifest_version']}")
            if 'error' in ext:
                typer.echo(f"   Error: {ext['error']}")
            typer.echo()
        
        # Brain CLI check
        if 'brain' in details:
            brain = details['brain']
            brain_status = brain.get('status', 'unknown')
            icon = '✅' if brain_status == 'ok' else '❌'
            typer.echo(f"{icon} Brain CLI")
            typer.echo(f"   Status: {brain_status}")
            if 'version' in brain:
                typer.echo(f"   Version: {brain['version']}")
            if 'uptime_seconds' in brain:
                uptime_hrs = brain['uptime_seconds'] / 3600
                typer.echo(f"   Uptime: {uptime_hrs:.2f} hours")
            if 'error' in brain:
                typer.echo(f"   Error: {brain['error']}")
            typer.echo()
        
        # Onboarding check
        if 'onboarding' in details:
            onb = details['onboarding']
            onb_status = onb.get('status', 'unknown')
            icon = '✅' if onb_status in ['ready', 'ok'] else '❌'
            typer.echo(f"{icon} Onboarding Status")
            typer.echo(f"   Status: {onb_status}")
            if 'current_step' in onb:
                typer.echo(f"   Current Step: {onb['current_step']}")
            if 'details' in onb:
                onb_details = onb['details']
                typer.echo(f"   Details:")
                for key, value in onb_details.items():
                    check_icon = '✅' if value else '❌'
                    typer.echo(f"     {check_icon} {key}: {value}")
            if 'error' in onb:
                typer.echo(f"   Error: {onb['error']}")
            typer.echo()
        
        # Recommendations if status is not ok
        if status != 'ok':
            typer.echo("💡 Recomendaciones:")
            if 'host' in details and details['host'].get('status') != 'connected':
                typer.echo("   • Verificar que bloom-host.exe esté ejecutándose como servicio Windows")
            if 'api' in details and details['api'].get('status') != 'online':
                typer.echo("   • Verificar que la API REST esté iniciada en puerto 48215")
            if 'extension' in details and details['extension'].get('status') != 'installed':
                typer.echo("   • Instalar extensión de Chrome desde Chrome Web Store")
            typer.echo()

    def _handle_error(self, gc, message: str):
        """Handle errors with unified output format"""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)


def register_command(app: typer.Typer):
    """Register the health full-stack command"""
    command = HealthFullStackCommand()
    command.register(app)