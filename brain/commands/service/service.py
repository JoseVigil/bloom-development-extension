"""
Service command for Brain CLI.
Manages the central TCP multiplexer server for Chrome Native Host connections.

FIXES CRÍTICOS:
- Logging defensivo antes de que el logger principal arranque
- Catch-all de excepciones para evitar crashes silenciosos
- Validación de puerto disponible
"""

import typer
import sys
import os
from typing import Optional
from pathlib import Path

# ============================================================================
# FIX CRÍTICO 1: LOGGING DE EMERGENCIA
# Si el logger principal falla, necesitamos escribir ALGO al log del servicio
# ============================================================================
def emergency_log(message: str, is_error: bool = False):
    """
    Escribe al log de emergencia si el logger principal falla.
    En servicios Windows, esto va a brain_service.err
    """
    try:
        stream = sys.stderr if is_error else sys.stdout
        stream.write(f"[EMERGENCY] {message}\n")
        stream.flush()
    except:
        pass  # Si hasta esto falla, no hay nada que hacer


# ============================================================================
# FIX CRÍTICO 2: VALIDAR ENTORNO ANTES DE IMPORTAR
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
        
        emergency_log("✅ Dependencias críticas OK")
        return True
        
    except ImportError as e:
        emergency_log(f"❌ FALTA DEPENDENCIA: {e}", is_error=True)
        emergency_log("   -> Recompilar con: --hidden-import=asyncio", is_error=True)
        return False


# ============================================================================
# FIX CRÍTICO 3: VALIDAR PUERTO DISPONIBLE
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
        emergency_log(f"❌ Puerto {port} no disponible: {e}", is_error=True)
        return False


# ============================================================================
# COMANDO SERVICE (CON FIXES)
# ============================================================================
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
            
            # ================================================================
            # FIX CRÍTICO: VALIDACIONES ANTES DE ARRANCAR
            # ================================================================
            emergency_log(f"🚀 Brain Service Starting...")
            emergency_log(f"   Host: {host}, Port: {port}, Daemon: {daemon}")
            
            # Validar entorno
            if not validate_service_environment():
                emergency_log("❌ Environment validation failed", is_error=True)
                sys.exit(1)
            
            # Validar puerto disponible
            if not is_port_available(port, host):
                emergency_log(f"❌ Puerto {port} ya está en uso", is_error=True)
                emergency_log("   Solución: matar proceso o cambiar puerto", is_error=True)
                sys.exit(1)
            
            # ================================================================
            # INICIO NORMAL CON CATCH-ALL
            # ================================================================
            try:
                # 1. Recuperar GlobalContext
                gc = ctx.obj
                if gc is None:
                    emergency_log("⚠️ No GlobalContext, creando uno nuevo...")
                    from brain.shared.context import GlobalContext
                    gc = GlobalContext()
                
                # 2. Lazy Import del Core
                emergency_log("📦 Importando ServerManager...")
                from brain.core.service.server_manager import ServerManager
                
                # 3. Verbose logging
                if gc.verbose:
                    typer.echo(f"🔌 Starting TCP server on {host}:{port}...", err=True)
                
                # 4. Ejecutar lógica del Core
                emergency_log("🔧 Creando ServerManager...")
                manager = ServerManager(host=host, port=port)
                
                if daemon:
                    # Daemon mode (background process)
                    emergency_log("🌙 Starting in daemon mode...")
                    result = manager.start_daemon()
                    gc.output(result, self._render_daemon_start)
                else:
                    # Foreground mode (blocking)
                    if gc.verbose:
                        typer.echo("ℹ️  Press Ctrl+C to stop the server", err=True)
                    
                    emergency_log("▶️ Starting in foreground mode (blocking)...")
                    result = manager.start_blocking()
                    
                    # This will only be reached after server stops
                    gc.output(result, self._render_stop)
                
                emergency_log("✅ Service started successfully")
                
            except KeyboardInterrupt:
                emergency_log("🛑 Received Ctrl+C, shutting down...")
                
                if gc.verbose:
                    typer.echo("\n🛑 Received shutdown signal...", err=True)
                
                result = {
                    "status": "success",
                    "operation": "service_shutdown",
                    "data": {"reason": "user_interrupt"}
                }
                gc.output(result, self._render_stop)
                
            except Exception as e:
                # ============================================================
                # FIX CRÍTICO: CATCH-ALL CON TRACEBACK COMPLETO
                # ============================================================
                import traceback
                error_details = traceback.format_exc()
                
                emergency_log("❌ FATAL ERROR EN SERVICE START:", is_error=True)
                emergency_log(error_details, is_error=True)
                emergency_log("\n📋 INFORMACIÓN DE DEBUG:", is_error=True)
                emergency_log(f"   Python: {sys.version}", is_error=True)
                emergency_log(f"   CWD: {os.getcwd()}", is_error=True)
                emergency_log(f"   Executable: {sys.executable}", is_error=True)
                
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
                emergency_log("🔍 Checking service status...")
                from brain.core.service.server_manager import ServerManager
                
                if gc.verbose:
                    typer.echo("🔍 Checking service status...", err=True)
                
                manager = ServerManager()
                result = manager.get_status()
                
                gc.output(result, self._render_status)
                
            except Exception as e:
                emergency_log(f"❌ Status check failed: {e}", is_error=True)
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
                emergency_log("🛑 Stopping service...")
                from brain.core.service.server_manager import ServerManager
                
                if gc.verbose:
                    typer.echo("🛑 Stopping service...", err=True)
                
                manager = ServerManager()
                result = manager.stop()
                
                gc.output(result, self._render_stop)
                
            except Exception as e:
                emergency_log(f"❌ Stop failed: {e}", is_error=True)
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