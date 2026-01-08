"""
Server Manager - Core business logic for TCP multiplexer service.
Preserva el 100% de la lógica de multiplexación original con fixes para Session 0.
"""

import asyncio
import socket
import signal
import os
import sys
import time
import json
from pathlib import Path
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta

class ServerManager:
    """
    Manages the Brain TCP multiplexer service lifecycle.
    Mantiene la lógica de estados, estadísticas y broadcast intacta.
    """
    
    def __init__(self, host: str = "127.0.0.1", port: int = 5678, base_path: Optional[Path] = None):
        self.host = host
        self.port = port
        
        # --- FIX PRUDENTE DE RUTAS ---
        if base_path:
            self.base_dir = base_path
        else:
            if sys.platform == 'win32':
                # Buscamos LOCALAPPDATA (Usuario) o PROGRAMDATA (Sistema)
                # Esto evita que intente escribir en C:\Windows\System32
                app_data = os.environ.get('LOCALAPPDATA') or os.environ.get('PROGRAMDATA')
                self.base_dir = Path(app_data) / "Brain"
            else:
                self.base_dir = Path.home() / ".brain"
        
        self.pid_file = self.base_dir / "service.pid"
        self.log_file = self.base_dir / "service.log"
        self.stats_file = self.base_dir / "service.stats"
        
        # Asegurar directorio con permisos
        self.base_dir.mkdir(parents=True, exist_ok=True)
        
        # --- LÓGICA DE NEGOCIO ORIGINAL ---
        self.clients: Dict[asyncio.StreamWriter, Dict[str, Any]] = {}
        self.stats = {
            "start_time": None,
            "total_connections": 0,
            "messages_processed": 0,
            "active_clients": 0
        }
    
    def start_blocking(self) -> Dict[str, Any]:
        """Start the server in foreground mode (blocking)."""
        if sys.platform == 'win32':
            asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

        # FIX: Si somos un servicio, el archivo PID puede ser un falso positivo de una sesión caída
        # Intentamos verificar si el proceso realmente existe antes de fallar.
        if self._is_running():
            pid = self._get_pid()
            if pid != os.getpid(): # Si no soy yo mismo
                raise RuntimeError(f"Service already running (PID: {pid})")
        
        self.stats["start_time"] = datetime.now().isoformat()
        
        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
            server = loop.run_until_complete(self._start_server(loop))
            self._write_pid()
            
            # Logs de inicio
            sys.stdout.write(f"🚀 Brain Service listening on {self.host}:{self.port}\n")
            sys.stdout.write(f"📋 PID: {os.getpid()}\n")
            sys.stdout.flush() 
            
            # --- FIX DE SEÑALES EN WINDOWS ---
            # Para evitar el "✅ Service stopped (shutdown)" a los 4 segundos
            if sys.platform != 'win32':
                for sig in (signal.SIGTERM, signal.SIGINT):
                    signal.signal(sig, lambda s, f: loop.stop())
            else:
                # En Windows/NSSM, confiamos en que NSSM mate el proceso
                # pero evitamos que señales de consola cierren el loop prematuramente.
                signal.signal(signal.SIGINT, signal.SIG_IGN)
            
            try:
                loop.run_forever()
            finally:
                server.close()
                loop.run_until_complete(server.wait_closed())
                loop.close()
                self._cleanup_pid()
            
            return {
                "status": "success", "operation": "service_start",
                "data": {"host": self.host, "port": self.port, "stats": self._get_stats()}
            }
        except OSError as e:
            if "Address already in use" in str(e):
                raise RuntimeError(f"Port {self.port} is already in use")
            raise RuntimeError(f"Failed to start server: {e}")

    # ==================== LÓGICA DE MULTIPLEXACIÓN (INALTERADA) ====================

    async def _start_server(self, loop) -> asyncio.Server:
        return await asyncio.start_server(self._handle_client, self.host, self.port)

    async def _handle_client(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        addr = writer.get_extra_info('peername')
        self.stats["total_connections"] += 1
        self.stats["active_clients"] += 1
        
        self.clients[writer] = {"addr": addr, "type": "unknown", "pid": None}
        sys.stdout.write(f"✅ [NEW CONNECTION] {addr}\n")
        sys.stdout.flush()
        
        try:
            while True:
                length_data = await reader.readexactly(4)
                if not length_data: break
                msg_len = int.from_bytes(length_data, byteorder='big')
                data = await reader.readexactly(msg_len)
                if not data: break
                
                self.stats["messages_processed"] += 1
                try:
                    message = json.loads(data.decode('utf-8'))
                    msg_type = message.get('type')

                    if msg_type == 'REGISTER_HOST':
                        self.clients[writer].update({
                            "type": "host", "pid": message.get('pid'), "version": message.get('version')
                        })
                        sys.stdout.write(f"📡 [REGISTERED] Host PID: {message.get('pid')} desde {addr}\n")
                        sys.stdout.flush()
                        continue

                    elif msg_type == 'handshake':
                        sys.stdout.write(f"🤝 [HANDSHAKE] CLI Client: {addr}\n")
                        sys.stdout.flush()
                        continue

                    await self._broadcast(writer, length_data + data)
                except json.JSONDecodeError:
                    pass
                
        except (asyncio.IncompleteReadError, ConnectionResetError):
            pass
        except Exception as e:
            sys.stdout.write(f"⚠️ [ERROR] {addr}: {e}\n")
        finally:
            self.stats["active_clients"] -= 1
            if writer in self.clients: del self.clients[writer]
            sys.stdout.write(f"❌ [DISCONNECT] {addr}\n")
            sys.stdout.flush()
            writer.close()
            try: await writer.wait_closed()
            except: pass
            self._save_stats()

    async def _broadcast(self, sender_writer: asyncio.StreamWriter, raw_payload: bytes):
        if not self.clients: return
        disconnected = []
        for client_writer in list(self.clients.keys()):
            if client_writer != sender_writer:
                try:
                    client_writer.write(raw_payload)
                    await client_writer.drain()
                except:
                    disconnected.append(client_writer)
        
        for dead_client in disconnected:
            if dead_client in self.clients: del self.clients[dead_client]

    # ==================== HELPERS DE ESTADO (MANTENIDOS) ====================

    def _is_running(self) -> bool:
        pid = self._get_pid()
        if pid is None: return False
        try:
            os.kill(pid, 0)
            return True
        except: return False
    
    def _get_pid(self) -> Optional[int]:
        if not self.pid_file.exists(): return None
        try: return int(self.pid_file.read_text().strip())
        except: return None
    
    def _write_pid(self): self.pid_file.write_text(str(os.getpid()))
    def _cleanup_pid(self):
        if self.pid_file.exists():
            try: self.pid_file.unlink()
            except: pass
    
    def _save_stats(self):
        try: self.stats_file.write_text(json.dumps(self.stats))
        except: pass

    def _load_stats(self) -> Dict[str, Any]:
        if not self.stats_file.exists(): return {}
        try: return json.loads(self.stats_file.read_text())
        except: return {}

    def _get_stats(self) -> Dict[str, Any]:
        uptime = "N/A"
        if self.stats["start_time"]:
            try:
                start = datetime.fromisoformat(self.stats["start_time"])
                uptime = str(datetime.now() - start).split('.')[0]
            except: pass
        return {
            "total_connections": self.stats["total_connections"], 
            "messages_processed": self.stats["messages_processed"], 
            "uptime": uptime
        }
    
