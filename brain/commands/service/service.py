"""
Service command for Brain CLI.
Manages the central TCP multiplexer server for Chrome Native Host connections.
"""

import typer
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class ServiceCommand(BaseCommand):
    """
    Service management command for Brain's central TCP multiplexer.
    
    This command starts/stops/monitors the background service that acts as
    a central connection hub for all Chrome Native Host instances.
    """
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="service",
            category=CommandCategory.SERVICE,
            version="1.0.0",
            description="Manage the Brain TCP multiplexer service",
            examples=[
                "brain service start",
                "brain service start --port 5678 --host 0.0.0.0",
                "brain service start --json",
                "brain service status",
                "brain service stop"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        """
        Register service subcommands in the Typer application.
        
        IMPORTANTE: app ya es el grupo 'service' creado por __main__.py,
        así que registramos los subcomandos DIRECTAMENTE en él.
        """
        
        @app.command(name="start")
        def start(
            ctx: typer.Context,
            port: int = typer.Option(5678, "--port", "-p", help="TCP port to bind"),
            host: str = typer.Option("127.0.0.1", "--host", "-h", help="Host address to bind"),
            daemon: bool = typer.Option(False, "--daemon", "-d", help="Run as background daemon")
        ):
            """
            Start the Brain TCP multiplexer service.
            
            The service acts as a central hub for Chrome Native Host connections,
            handling message routing and client management.
            """
            
            # 1. Recuperar GlobalContext
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                # 2. Lazy Import del Core
                from brain.core.service.server_manager import ServerManager
                
                # 3. Verbose logging
                if gc.verbose:
                    typer.echo(f"🔌 Starting TCP server on {host}:{port}...", err=True)
                
                # 4. Ejecutar lógica del Core
                manager = ServerManager(host=host, port=port)
                
                if daemon:
                    # Daemon mode (background process)
                    result = manager.start_daemon()
                    gc.output(result, self._render_daemon_start)
                else:
                    # Foreground mode (blocking)
                    if gc.verbose:
                        typer.echo("ℹ️  Press Ctrl+C to stop the server", err=True)
                    
                    result = manager.start_blocking()
                    
                    # This will only be reached after server stops
                    gc.output(result, self._render_stop)
                
            except KeyboardInterrupt:
                if gc.verbose:
                    typer.echo("\n🛑 Received shutdown signal...", err=True)
                
                result = {
                    "status": "success",
                    "operation": "service_shutdown",
                    "data": {"reason": "user_interrupt"}
                }
                gc.output(result, self._render_stop)
                
            except Exception as e:
                self._handle_error(gc, f"Failed to start service: {e}")
        
        @app.command(name="status")
        def status(ctx: typer.Context):
            """
            Check the current status of the Brain service.
            """
            
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                from brain.core.service.server_manager import ServerManager
                
                if gc.verbose:
                    typer.echo("🔍 Checking service status...", err=True)
                
                manager = ServerManager()
                result = manager.get_status()
                
                gc.output(result, self._render_status)
                
            except Exception as e:
                self._handle_error(gc, f"Failed to check status: {e}")
        
        @app.command(name="stop")
        def stop(ctx: typer.Context):
            """
            Stop the running Brain service.
            """
            
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                from brain.core.service.server_manager import ServerManager
                
                if gc.verbose:
                    typer.echo("🛑 Stopping service...", err=True)
                
                manager = ServerManager()
                result = manager.stop()
                
                gc.output(result, self._render_stop)
                
            except Exception as e:
                self._handle_error(gc, f"Failed to stop service: {e}")
    
    def _render_daemon_start(self, data: dict):
        """Output humano para inicio en modo daemon."""
        typer.echo(f"✅ Service started in background")
        typer.echo(f"   PID: {data['data'].get('pid', 'unknown')}")
        typer.echo(f"   Port: {data['data'].get('port', 5678)}")
        typer.echo(f"   Log: {data['data'].get('log_file', 'N/A')}")
    
    def _render_stop(self, data: dict):
        """Output humano para detención del servicio."""
        reason = data['data'].get('reason', 'unknown')
        typer.echo(f"✅ Service stopped ({reason})")
        
        stats = data['data'].get('stats', {})
        if stats:
            typer.echo(f"\n📊 Session Statistics:")
            typer.echo(f"   Total connections: {stats.get('total_connections', 0)}")
            typer.echo(f"   Messages processed: {stats.get('messages_processed', 0)}")
            typer.echo(f"   Uptime: {stats.get('uptime', 'N/A')}")
    
    def _render_status(self, data: dict):
        """Output humano para estado del servicio."""
        status_data = data['data']
        running = status_data.get('running', False)
        
        if running:
            typer.echo(f"✅ Service is running")
            typer.echo(f"   Host: {status_data.get('host', 'N/A')}")
            typer.echo(f"   Port: {status_data.get('port', 'N/A')}")
            typer.echo(f"   PID: {status_data.get('pid', 'N/A')}")
            typer.echo(f"   Uptime: {status_data.get('uptime', 'N/A')}")
            typer.echo(f"   Active clients: {status_data.get('active_clients', 0)}")
        else:
            typer.echo(f"⚠️  Service is not running")
    
    def _handle_error(self, gc, message: str):
        """Manejo unificado de errores."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)