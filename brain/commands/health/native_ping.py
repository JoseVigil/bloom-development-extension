"""
Native host ping health check command.
Tests direct connectivity to bloom-host.exe via TCP socket using binary framing.
"""

import typer
import json
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class HealthNativePingCommand(BaseCommand):
    """
    Check native host connectivity via direct TCP ping with binary framing protocol.
    Tests if bloom-host.exe is running and responding using Length-Prefix Framing.
    """
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="native-ping",
            category=CommandCategory.HEALTH,
            version="2.0.0",  # Updated for binary framing
            description="Ping native host (bloom-host.exe) via TCP using binary framing protocol",
            examples=[
                "brain health native-ping",
                "brain health native-ping --json",
                "brain health native-ping --timeout 1000 --verbose"
            ]
        )

    def register(self, app: typer.Typer):
        @app.command(
            name=self.metadata().name,
            help=self.metadata().description
        )
        def execute(
            ctx: typer.Context,
            timeout: int = typer.Option(
                500,
                "--timeout",
                "-t",
                help="Timeout in milliseconds for ping response"
            ),
            port: Optional[int] = typer.Option(
                None,
                "--port",
                "-p",
                help="Specific TCP port to test (auto-detect if not provided)"
            ),
            check_ws: bool = typer.Option(
                True,
                "--check-ws/--no-check-ws",
                help="Also verify WebSocket port status"
            )
        ):
            """
            Ping the native host to verify it's alive and responding.
            
            This command tests direct TCP connectivity to bloom-host.exe
            using the proper binary framing protocol (4-byte length prefix + JSON).
            """
            # 1. Recuperar GlobalContext
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                # 2. Lazy Import del Core
                from brain.core.health.native_host_manager import NativeHostManager
                
                # 3. Verbose logging
                if gc.verbose:
                    typer.echo("🔍 Pinging native host...", err=True)
                    if port:
                        typer.echo(f"   Using port: {port}", err=True)
                    typer.echo(f"   Timeout: {timeout}ms", err=True)
                    typer.echo(f"   Protocol: Length-Prefix Framing (4-byte header)", err=True)
                
                # 4. Ejecutar lógica del Core
                manager = NativeHostManager(verbose=gc.verbose)
                ping_data = manager.ping_native_host(
                    timeout_ms=timeout,
                    specific_port=port,
                    check_websocket=check_ws
                )
                
                # 5. Empaquetar resultado
                result = {
                    "status": "success" if ping_data.get("connected") else "error",
                    "operation": "native-ping",
                    "data": ping_data,
                    "timestamp": ping_data.get("timestamp")
                }
                
                # 6. Output dual
                gc.output(result, self._render_success)
                
                # Exit with error code if not connected
                if not ping_data.get("connected"):
                    raise typer.Exit(code=1)
                
            except Exception as e:
                self._handle_error(gc, f"Native ping failed: {str(e)}")
    
    def _render_success(self, result: dict):
        """Output humano para resultado del ping."""
        data = result.get("data", {})
        connected = data.get("connected", False)
        
        # Header
        if connected:
            typer.echo("\n✅ Native Host: CONNECTED")
        else:
            typer.echo("\n❌ Native Host: DISCONNECTED")
        
        # Host process status
        host_running = data.get("host_running", False)
        process_emoji = "🟢" if host_running else "🔴"
        typer.echo(f"{process_emoji} Process Status: {'Running' if host_running else 'Not Found'}")
        
        # Connection details
        if connected:
            port = data.get("port")
            response_time = data.get("response_time_ms")
            version = data.get("version")
            
            typer.echo(f"🔌 Port: {port}")
            typer.echo(f"⚡ Response Time: {response_time}ms")
            
            if version and version != "unknown":
                typer.echo(f"📦 Version: {version}")
            
            # WebSocket status
            ws_status = data.get("ws_status", "unknown")
            ws_emoji = "🟢" if ws_status == "up" else "🟡" if ws_status == "unknown" else "🔴"
            typer.echo(f"{ws_emoji} WebSocket: {ws_status.upper()}")
            
            # Protocol info
            typer.echo("🔐 Protocol: Binary Framing (4-byte header)")
        else:
            # Error details
            error = data.get("error", "Unknown error")
            typer.echo(f"\n⚠️  Error: {error}")
            
            # Troubleshooting hints
            if not host_running:
                typer.echo("\n💡 Troubleshooting:")
                typer.echo("   • Ensure bloom-host.exe is running")
                typer.echo("   • Check if Chrome extension is installed")
                typer.echo("   • Try restarting the extension")
            elif data.get("port") is None:
                typer.echo("\n💡 Troubleshooting:")
                typer.echo("   • All ports (5678-5698) were unreachable")
                typer.echo("   • Verify binary framing protocol compatibility")
                typer.echo("   • Check firewall settings")
                typer.echo("   • Verify host is bound to localhost")
        
        typer.echo()  # Newline
    
    def _handle_error(self, gc, message: str):
        """Manejo unificado de errores."""
        if gc.json_mode:
            error_result = {
                "status": "error",
                "operation": "native-ping",
                "message": message,
                "data": {
                    "host_running": False,
                    "connected": False,
                    "error": message
                }
            }
            typer.echo(json.dumps(error_result))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)