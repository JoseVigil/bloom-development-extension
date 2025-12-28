"""
WebSocket health check command.
Verifies WebSocket server connectivity and responsiveness on port 4124.
"""

import typer
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class HealthWebSocketStatusCommand(BaseCommand):
    """
    Check WebSocket server health and connectivity.
    Verifies connection, ping/pong, and optional event subscription capability.
    """
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="websocket-status",
            category=CommandCategory.HEALTH,
            version="1.0.0",
            description="Verify WebSocket server status on localhost:4124",
            examples=[
                "brain health websocket-status",
                "brain health websocket-status --json",
                "brain health websocket-status --verbose --timeout 10",
                "brain health websocket-status --test-sub"
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
                help="Connection timeout in seconds"
            ),
            test_subscription: bool = typer.Option(
                False,
                "--test-sub",
                help="Test event subscription capability"
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
                help="Detailed connection logging"
            )
        ):
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            if verbose:
                gc.verbose = True
            
            if gc.verbose:
                typer.echo("🔍 Verificando WebSocket server (localhost:4124)...", err=True)
            
            try:
                from brain.core.health.websocket_status_manager import WebSocketStatusManager
                
                manager = WebSocketStatusManager(gc)
                status_data = manager.check_websocket_status(
                    timeout=timeout,
                    test_subscription=test_subscription
                )
                
                result = {
                    "status": "success",
                    "operation": self.metadata().name,
                    "data": status_data
                }
                
                if json_output:
                    import json
                    typer.echo(json.dumps(result, indent=2))
                else:
                    gc.output(result, self._render_success)
                
            except Exception as e:
                self._handle_error(gc, f"Error checking WebSocket status: {str(e)}")

    def _render_success(self, result: dict):
        """Render human-friendly WebSocket status"""
        data = result['data']
        status = data.get('status', 'unknown')
        
        # Header
        status_emoji = {
            'connected': '🟢',
            'disconnected': '🔴',
            'error': '⚠️'
        }.get(status, '❓')
        
        typer.echo(f"\n{status_emoji} WebSocket Status: {status.upper()}")
        
        # Connection details
        details = data.get('details', {})
        typer.echo(f"\nConnection:")
        typer.echo(f"  Host: {details.get('host', 'unknown')}")
        typer.echo(f"  Port: {details.get('port', 'unknown')}")
        typer.echo(f"  Protocol: {details.get('protocol', 'ws')}")
        typer.echo(f"  Connected: {'Yes' if details.get('connected') else 'No'}")
        
        # Show error if present
        if 'error' in details:
            typer.echo(f"  Error: {details['error']}")
        
        # Performance metrics
        if details.get('ping_response'):
            typer.echo(f"\nPerformance:")
            typer.echo(f"  Ping Response: ✅")
            typer.echo(f"  Latency: {details.get('ping_latency_ms', 'N/A')} ms")
            typer.echo(f"  Connection Time: {data.get('connection_duration_ms', 'N/A')} ms")
        
        # Capabilities
        if 'subscription_capable' in details:
            typer.echo(f"\nCapabilities:")
            typer.echo(f"  Event Subscriptions: {'✅' if details.get('subscription_capable') else '❌'}")
        
        # Server info
        if 'server_version' in details:
            typer.echo(f"\nServer:")
            typer.echo(f"  Version: {details.get('server_version', 'unknown')}")
        
        if 'uptime_seconds' in data and data['uptime_seconds'] != 'N/A':
            uptime = data['uptime_seconds']
            hours = uptime // 3600
            minutes = (uptime % 3600) // 60
            typer.echo(f"  Uptime: {hours}h {minutes}m")
        
        typer.echo(f"\nTimestamp: {data.get('timestamp', 'N/A')}")

    def _handle_error(self, gc, message: str):
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)