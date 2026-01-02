"""
Full stack health check command.
Verifies complete Bloom Nucleus stack health.
"""

import typer
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class HealthFullStackCommand(BaseCommand):
    """
    Comprehensive health check for all Bloom Nucleus components.
    Checks: bloom-host, API REST, Chrome extension, Brain CLI, and onboarding.
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
            
            if verbose:
                gc.verbose = True
            
            if gc.verbose:
                typer.echo("🔍 Verificando salud completa del stack...", err=True)
            
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
                self._handle_error(gc, f"Error checking stack health: {str(e)}")

    def _render_success(self, result: dict):
        """Render human-friendly full stack health report"""
        data = result['data']
        overall_status = data.get('status', 'unknown')
        health_score = data.get('overall_health_score', 0)
        
        # Header with health score
        status_emoji = {
            'ok': '✅',
            'partial': '⚠️',
            'error': '❌'
        }.get(overall_status, '❓')
        
        typer.echo(f"\n{status_emoji} Stack Health: {overall_status.upper()}")
        typer.echo(f"Overall Score: {health_score}%")
        typer.echo(f"Check Duration: {data.get('check_duration_ms', 'N/A')}ms")
        typer.echo(f"Timestamp: {data.get('timestamp', 'N/A')}\n")
        
        # Component details
        details = data.get('details', {})
        
        typer.echo("Component Status:\n")
        self._render_component("Bloom Host (TCP 5678)", details.get('host', {}))
        self._render_component("API REST (HTTP 48215)", details.get('api', {}))
        self._render_component("Chrome Extension", details.get('extension', {}))
        self._render_component("Brain CLI", details.get('brain', {}))
        self._render_component("Onboarding", details.get('onboarding', {}))
        
        # Summary
        if overall_status != 'ok':
            typer.echo("\n💡 Issues detected. Run individual checks for details.")

    def _render_component(self, name: str, data: dict):
        """Render individual component status"""
        status = data.get('status', 'unknown')
        
        status_icons = {
            'connected': '🟢',
            'online': '🟢',
            'installed': '🟢',
            'ok': '🟢',
            'ready': '🟢',
            'disconnected': '🔴',
            'offline': '🔴',
            'not_found': '🔴',
            'error': '🔴',
            'timeout': '🟡',
            'incomplete': '🟡'
        }
        
        emoji = status_icons.get(status, '❓')
        typer.echo(f"{emoji} {name}: {status.upper()}")
        
        # Show key metrics
        if 'response_time_ms' in data:
            typer.echo(f"   └─ Response Time: {data['response_time_ms']}ms")
        if 'version' in data:
            typer.echo(f"   └─ Version: {data['version']}")
        if 'error' in data:
            typer.echo(f"   └─ ⚠️  Error: {data['error']}")
        
        typer.echo()

    def _handle_error(self, gc, message: str):
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)