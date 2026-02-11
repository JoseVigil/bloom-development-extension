"""
Server command for Brain CLI.
Manages the central TCP multiplexer server for Chrome Native Host connections.

REFACTORED: Usa brain.server logger especializado en lugar de emergency_log.
"""

import typer
import sys
import os
import logging
from typing import Optional
from pathlib import Path

from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory

# Logger especializado para el servidor
logger = logging.getLogger("brain.server")


# ============================================================================
# VALIDACIÓN DE ENTORNO
# ============================================================================
def validate_service_environment():
    """
    Valida que el entorno tenga todo lo necesario antes de arrancar.
    Esto previene crashes crípticos por módulos faltantes.
    """
    try:
        # Verificar que podemos importar dependencias críticas
        import asyncio
        import socket
        
        logger.info("OK Dependencias criticas OK")
        return True
        
    except ImportError as e:
        logger.error(f"ERROR Puerto {port} no disponible: {e}")
        logger.error("   -> Recompilar con: --hidden-import=asyncio")
        return False


# ============================================================================
# VALIDACIÓN DE PUERTO
# ============================================================================
def is_port_available(port: int, host: str = "127.0.0.1") -> bool:
    """
    Verifica si un puerto está disponible antes de intentar arrancar.
    """
    import socket
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind((host, port))
            return True
    except OSError as e:
        logger.error(f"ERROR Puerto {port} no disponible: {e}")
        return False


# ============================================================================
# COMANDO SERVER
# ============================================================================
class ServerCommand(BaseCommand):
    """
    Server management command for Brain's central TCP multiplexer.
    
    This command starts/stops/monitors the background service that acts as
    a central connection hub for all Chrome Native Host instances.
    """
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="server",
            category=CommandCategory.SERVICE,
            version="1.0.0",
            description="Manage the Brain TCP multiplexer server",
            examples=[
                "brain server start",
                "brain server start --port 5678 --host 0.0.0.0",
                "brain server start --json",
                "brain server status",
                "brain server stop"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        """
        Register server subcommands in the Typer application.
        """
        
        @app.command(name="start")
        def start(
            ctx: typer.Context,
            port: int = typer.Option(5678, "--port", "-p", help="TCP port to bind"),
            host: str = typer.Option("127.0.0.1", "--host", "-h", help="Host address to bind"),
            daemon: bool = typer.Option(False, "--daemon", "-d", help="Run as background daemon")
        ):
            """
            Start the Brain TCP multiplexer server.
            
            The service acts as a central hub for Chrome Native Host connections,
            handling message routing and client management.
            """
            
            # ================================================================
            # VALIDACIONES ANTES DE ARRANCAR
            # ================================================================
            logger.info("Brain Server Starting...")
            logger.info(f"   Host: {host}, Port: {port}, Daemon: {daemon}")
            
            # Validar entorno
            if not validate_service_environment():
                logger.error("ERROR Environment validation failed")
                sys.exit(1)
            
            # Validar puerto disponible
            if not is_port_available(port, host):
                logger.error(f"ERROR Puerto {port} ya esta en uso")
                logger.error("   Solución: matar proceso o cambiar puerto")
                sys.exit(1)
            
            # ================================================================
            # INICIO NORMAL CON CATCH-ALL
            # ================================================================
            try:
                # 1. Recuperar GlobalContext
                gc = ctx.obj
                if gc is None:
                    logger.warning("WARN No GlobalContext, creando uno nuevo...")
                    from brain.shared.context import GlobalContext
                    gc = GlobalContext()
                
                # 2. Lazy Import del Core
                logger.info("Importando ServerManager...")
                from brain.core.server.server_manager import ServerManager
                
                # 3. Verbose logging
                if gc.verbose:
                    typer.echo(f"[START] Starting TCP server on {host}:{port}...", err=True)
                
                # 4. Ejecutar lógica del Core
                logger.info("Creando ServerManager...")
                manager = ServerManager(host=host, port=port)
                
                if daemon:
                    # Daemon mode (background process)
                    logger.info("Starting in daemon mode...")
                    result = manager.start_daemon()
                    gc.output(result, self._render_daemon_start)
                else:
                    # Foreground mode (blocking)
                    if gc.verbose:
                        typer.echo("[INFO]  Press Ctrl+C to stop the server", err=True)
                    
                    logger.info("Starting in foreground mode (blocking)...")
                    result = manager.start_blocking()
                    
                    # This will only be reached after server stops
                    gc.output(result, self._render_stop)
                
                logger.info("OK Server started successfully")
                
            except KeyboardInterrupt:
                logger.info("STOP Received Ctrl+C, shutting down...")
                
                if gc.verbose:
                    typer.echo("\n[STOP] Received shutdown signal...", err=True)
                
                result = {
                    "status": "success",
                    "operation": "server_shutdown",
                    "data": {"reason": "user_interrupt"}
                }
                gc.output(result, self._render_stop)
                
            except Exception as e:
                # ============================================================
                # CATCH-ALL CON TRACEBACK COMPLETO
                # ============================================================
                import traceback
                logger.critical("FATAL ERROR EN SERVER START:", exc_info=True)
                logger.debug(f"   Python: {sys.version}")
                logger.debug(f"   CWD: {os.getcwd()}")
                logger.debug(f"   Executable: {sys.executable}")
                
                self._handle_error(gc, f"Failed to start server: {e}")
        
        @app.command(name="status")
        def status(ctx: typer.Context):
            """
            Check the current status of the Brain server.
            """
            
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                logger.info("Checking server status...")
                from brain.core.server.server_manager import ServerManager
                
                if gc.verbose:
                    typer.echo("Checking server status...", err=True)
                
                manager = ServerManager()
                result = manager.get_status()
                
                gc.output(result, self._render_status)
                
            except Exception as e:
                logger.error(f"ERROR Status check failed: {e}", exc_info=True)
                self._handle_error(gc, f"Failed to check status: {e}")
        
        @app.command(name="stop")
        def stop(ctx: typer.Context):
            """
            Stop the running Brain server.
            """
            
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                logger.info("STOP Stopping server...")
                from brain.core.server.server_manager import ServerManager
                
                if gc.verbose:
                    typer.echo("[STOP] Stopping server...", err=True)
                
                manager = ServerManager()
                result = manager.stop()
                
                gc.output(result, self._render_stop)
                
            except Exception as e:
                logger.error(f"ERROR Stop failed: {e}", exc_info=True)
                self._handle_error(gc, f"Failed to stop server: {e}")
    
    def _render_daemon_start(self, data: dict):
        """Output humano para inicio en modo daemon."""
        typer.echo(f"[OK] Server started in background")
        typer.echo(f"   PID: {data.get('data', {}).get('pid', 'unknown')}")
        typer.echo(f"   Port: {data.get('data', {}).get('port', 5678)}")
        typer.echo(f"   Log: {data.get('data', {}).get('log_file', 'N/A')}")
    
    def _render_stop(self, data: dict):
        """
        Output humano para detención del servicio.
        
        Con guardas defensivas contra NoneType.
        """
        # GUARDA 1: Validar que data no sea None
        if data is None:
            typer.echo("[WARN]  Server stopped (no status data available)")
            return
        
        # GUARDA 2: Validar que 'data' key exista
        if 'data' not in data:
            typer.echo("[WARN]  Server stopped (incomplete status data)")
            return
        
        # GUARDA 3: Extraer data_dict de forma segura
        data_dict = data.get('data', {})
        
        # GUARDA 4: Validar que data_dict no sea None
        if data_dict is None:
            data_dict = {}
        
        # Ahora sí, extracción segura
        reason = data_dict.get('reason', 'unknown')
        typer.echo(f"[OK] Server stopped ({reason})")
        
        # GUARDA 5: Stats puede no existir
        stats = data_dict.get('stats')
        if stats and isinstance(stats, dict):
            typer.echo(f"\n[STATS] Session Statistics:")
            typer.echo(f"   Total connections: {stats.get('total_connections', 0)}")
            typer.echo(f"   Messages processed: {stats.get('messages_processed', 0)}")
            typer.echo(f"   Uptime: {stats.get('uptime', 'N/A')}")
    
    def _render_status(self, data: dict):
        """
        Output humano para estado del servicio.
        
        Con guardas defensivas contra NoneType.
        """
        # GUARDA 1: Validar data
        if data is None or 'data' not in data:
            typer.echo("[WARN]  Cannot determine server status")
            return
        
        status_data = data.get('data', {})
        
        # GUARDA 2: Validar status_data
        if status_data is None:
            status_data = {}
        
        running = status_data.get('running', False)
        
        if running:
            typer.echo(f"[OK] Server is running")
            typer.echo(f"   Host: {status_data.get('host', 'N/A')}")
            typer.echo(f"   Port: {status_data.get('port', 'N/A')}")
            typer.echo(f"   PID: {status_data.get('pid', 'N/A')}")
            typer.echo(f"   Uptime: {status_data.get('uptime', 'N/A')}")
            typer.echo(f"   Active clients: {status_data.get('active_clients', 0)}")
        else:
            typer.echo(f"[WARN]  Server is not running")
    
    def _handle_error(self, gc, message: str):
        """Manejo unificado de errores."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"[ERROR] {message}", err=True)
        raise typer.Exit(code=1)