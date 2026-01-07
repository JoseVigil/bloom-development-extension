"""
Server Manager - Core business logic for TCP multiplexer service.
Pure logic without CLI dependencies.
"""

import asyncio
import socket
import signal
import os
import sys
import time
import json
from pathlib import Path
from typing import Dict, Any, Optional
from datetime import datetime, timedelta


class ServerManager:
    """
    Manages the Brain TCP multiplexer service lifecycle.
    
    This class handles server startup, shutdown, status checks, and
    process management without any CLI dependencies.
    """
    
    def __init__(self, host: str = "127.0.0.1", port: int = 5678):
        """
        Initialize the server manager.
        
        Args:
            host: Host address to bind (default: 127.0.0.1)
            port: TCP port to bind (default: 5678)
        """
        self.host = host
        self.port = port
        self.pid_file = Path.home() / ".brain" / "service.pid"
        self.log_file = Path.home() / ".brain" / "service.log"
        self.stats_file = Path.home() / ".brain" / "service.stats"
        
        # Ensure .brain directory exists
        self.pid_file.parent.mkdir(parents=True, exist_ok=True)
        
        # Session statistics
        self.stats = {
            "start_time": None,
            "total_connections": 0,
            "messages_processed": 0,
            "active_clients": 0
        }
    
    def start_blocking(self) -> Dict[str, Any]:
        """
        Start the server in foreground mode (blocking).
        """
        # ✅ FIX: Configurar política de loop para Windows (Crítico para Python 3.13 + Sockets)
        if sys.platform == 'win32':
            asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

        # Check if already running
        if self._is_running():
            raise RuntimeError(f"Service already running (PID: {self._get_pid()})")
        
        # Initialize stats
        self.stats["start_time"] = datetime.now().isoformat()
        
        try:
            # Create and run the asyncio event loop
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
            # Start the server
            server = loop.run_until_complete(self._start_server(loop))
            
            # Write PID file
            self._write_pid()
            
            # ✅ Confirmation message with FORCED FLUSH
            sys.stdout.write(f"🚀 Brain Service listening on {self.host}:{self.port}\n")
            sys.stdout.write(f"📋 PID: {os.getpid()}\n")
            sys.stdout.write(f"⏳ Waiting for connections...\n\n")
            sys.stdout.flush() 
            
            # Setup signal handlers
            if sys.platform != 'win32':
                for sig in (signal.SIGTERM, signal.SIGINT):
                    signal.signal(sig, lambda s, f: loop.stop())
            else:
                # En Windows, SIGTERM no es estándar de la misma forma
                signal.signal(signal.SIGINT, lambda s, f: loop.stop())
            
            # Run until interrupted
            try:
                loop.run_forever()
            finally:
                # Cleanup
                server.close()
                loop.run_until_complete(server.wait_closed())
                loop.close()
                self._cleanup_pid()
            
            return {
                "status": "success",
                "operation": "service_start",
                "data": {
                    "host": self.host,
                    "port": self.port,
                    "mode": "foreground",
                    "reason": "shutdown",
                    "stats": self._get_stats()
                }
            }
            
        except OSError as e:
            if "Address already in use" in str(e):
                raise RuntimeError(f"Port {self.port} is already in use")
            raise RuntimeError(f"Failed to start server: {e}")

    def start_daemon(self) -> Dict[str, Any]:
        """
        Start the server in background daemon mode.
        """
        # ✅ FIX: Windows no soporta fork()
        if sys.platform == 'win32':
            raise RuntimeError(
                "Daemon mode via fork is not supported on Windows. "
                "Please run the service without the --daemon flag or use a Windows service wrapper."
            )

        # Check if already running
        if self._is_running():
            raise RuntimeError(f"Service already running (PID: {self._get_pid()})")
        
        # Fork process for daemon mode (Solo Unix)
        try:
            pid = os.fork()
            if pid > 0:
                # Parent process
                time.sleep(0.5)
                if not self._is_running():
                    raise RuntimeError("Daemon failed to start")
                
                return {
                    "status": "success",
                    "operation": "service_start_daemon",
                    "data": {
                        "pid": self._get_pid(),
                        "port": self.port,
                        "host": self.host,
                        "log_file": str(self.log_file)
                    }
                }
        except OSError as e:
            raise RuntimeError(f"Failed to fork daemon: {e}")
        
        # Child process
        os.setsid()
        with open(self.log_file, 'w') as log:
            os.dup2(log.fileno(), 1)
            os.dup2(log.fileno(), 2)
        
        self.start_blocking()
        os._exit(0)
    
    def stop(self) -> Dict[str, Any]:
        """
        Stop the running service.
        """
        if not self._is_running():
            raise RuntimeError("Service is not running")
        
        pid = self._get_pid()
        
        try:
            # En Windows usamos signal.CTRL_C_EVENT o simplemente matamos el proceso
            if sys.platform == 'win32':
                os.kill(pid, signal.SIGTERM)
            else:
                os.kill(pid, signal.SIGTERM)
            
            # Wait for process to terminate
            for _ in range(50):
                if not self._is_running():
                    break
                time.sleep(0.1)
            
            if self._is_running():
                # Force kill
                if sys.platform == 'win32':
                    import subprocess
                    subprocess.run(['taskkill', '/F', '/PID', str(pid)], capture_output=True)
                else:
                    os.kill(pid, signal.SIGKILL)
                time.sleep(0.5)
            
            stats = self._load_stats()
            self._cleanup_pid()
            
            return {
                "status": "success",
                "operation": "service_stop",
                "data": {
                    "pid": pid,
                    "reason": "manual_stop",
                    "stats": stats
                }
            }
            
        except (ProcessLookupError, PermissionError) as e:
            self._cleanup_pid()
            return {
                "status": "success",
                "operation": "service_stop",
                "data": {"pid": pid, "reason": "already_stopped", "stats": {}}
            }
    
    def get_status(self) -> Dict[str, Any]:
        """Get the current service status."""
        if not self._is_running():
            return {
                "status": "success",
                "operation": "service_status",
                "data": {"running": False}
            }
        
        pid = self._get_pid()
        stats = self._load_stats()
        
        uptime = "N/A"
        if stats.get("start_time"):
            try:
                start = datetime.fromisoformat(stats["start_time"])
                delta = datetime.now() - start
                uptime = str(delta).split('.')[0]
            except:
                pass
        
        return {
            "status": "success",
            "operation": "service_status",
            "data": {
                "running": True,
                "host": self.host,
                "port": self.port,
                "pid": pid,
                "uptime": uptime,
                "active_clients": stats.get("active_clients", 0),
                "total_connections": stats.get("total_connections", 0),
                "messages_processed": stats.get("messages_processed", 0)
            }
        }
    
    # ==================== Private Methods ====================
    
    async def _start_server(self, loop) -> asyncio.Server:
        server = await asyncio.start_server(
            self._handle_client,
            self.host,
            self.port
        )
        return server
    
    async def _handle_client(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        addr = writer.get_extra_info('peername')
        self.stats["total_connections"] += 1
        self.stats["active_clients"] += 1
        
        sys.stdout.write(f"✅ [NEW CONNECTION] Client connected from {addr}\n")
        sys.stdout.flush()
        
        try:
            while True:
                length_data = await reader.readexactly(4)
                if not length_data:
                    break
                
                message_length = int.from_bytes(length_data, byteorder='big')
                data = await reader.readexactly(message_length)
                
                if not data:
                    break
                
                self.stats["messages_processed"] += 1
                
                try:
                    message = json.loads(data.decode('utf-8'))
                    if message.get('type') == 'handshake':
                        sys.stdout.write(f"📦 [HANDSHAKE] Registered Host | PID: {message.get('pid', 'N/A')}\n")
                        sys.stdout.flush()
                    
                    response = data
                    response_length = len(response).to_bytes(4, byteorder='big')
                    writer.write(response_length + response)
                    await writer.drain()
                except json.JSONDecodeError:
                    pass
                
        except (asyncio.IncompleteReadError, ConnectionResetError):
            pass
        except Exception as e:
            sys.stdout.write(f"⚠️  [ERROR] Client handler error: {e}\n")
            sys.stdout.flush()
        finally:
            self.stats["active_clients"] -= 1
            sys.stdout.write(f"❌ [DISCONNECT] Client disconnected from {addr}\n")
            sys.stdout.flush()
            writer.close()
            try:
                await writer.wait_closed()
            except:
                pass
            self._save_stats()
    
    def _is_running(self) -> bool:
        pid = self._get_pid()
        if pid is None:
            return False
        try:
            if sys.platform == 'win32':
                # En Windows, os.kill(pid, 0) funciona para chequear existencia
                os.kill(pid, 0)
            else:
                os.kill(pid, 0)
            return True
        except (ProcessLookupError, PermissionError, OSError):
            return False
    
    def _get_pid(self) -> Optional[int]:
        if not self.pid_file.exists():
            return None
        try:
            return int(self.pid_file.read_text().strip())
        except:
            return None
    
    def _write_pid(self):
        self.pid_file.write_text(str(os.getpid()))
    
    def _cleanup_pid(self):
        if self.pid_file.exists():
            try:
                self.pid_file.unlink()
            except:
                pass
    
    def _save_stats(self):
        try:
            self.stats_file.write_text(json.dumps(self.stats))
        except:
            pass
    
    def _load_stats(self) -> Dict[str, Any]:
        if not self.stats_file.exists():
            return {}
        try:
            return json.loads(self.stats_file.read_text())
        except:
            return {}
    
    def _get_stats(self) -> Dict[str, Any]:
        if self.stats["start_time"]:
            try:
                start = datetime.fromisoformat(self.stats["start_time"])
                uptime = str(datetime.now() - start).split('.')[0]
            except:
                uptime = "N/A"
        else:
            uptime = "N/A"
        
        return {
            "total_connections": self.stats["total_connections"],
            "messages_processed": self.stats["messages_processed"],
            "uptime": uptime
        }