import asyncio
import os
import sys
import json
import logging
import signal
from pathlib import Path
from typing import Dict, Any, Optional, List
from datetime import datetime
from collections import deque
from brain.shared.logger import get_logger

# Logger con nivel DEBUG
logger = get_logger("brain.service")
logger.setLevel(logging.DEBUG)

try:
    import aiofiles
    AIOFILES_AVAILABLE = True
except ImportError:
    AIOFILES_AVAILABLE = False
    logger.warning("⚠️ aiofiles no disponible, usando escritura síncrona")


class EventBroadcaster:
    """Motor de eventos del Brain - Historiador y Emisor"""
    
    def __init__(self, events_file: Path, max_memory: int = 1000):
        self.events_file = events_file
        self.event_queue = deque(maxlen=max_memory)
        self.max_memory = max_memory
        
        # Eventos críticos que requieren persistencia inmediata
        self.CRITICAL_EVENTS = {
            'ONBOARDING_COMPLETE',
            'INTENT_COMPLETE',
            'INTENT_FAILED',
            'EXTENSION_ERROR',
            'PROFILE_STATUS_CHANGE',
            'BRAIN_SERVICE_STATUS',
            'PROFILE_CONNECTED',
            'PROFILE_DISCONNECTED'
        }
        
        logger.info(f"📚 EventBroadcaster inicializado (max_memory={max_memory})")
    
    async def hydrate_from_disk(self):
        """Rehidrata la cola en memoria desde events.jsonl"""
        if not self.events_file.exists():
            logger.info("📖 No hay historial previo de eventos")
            return
        
        try:
            logger.info(f"📖 Rehidratando eventos desde {self.events_file}")
            
            if AIOFILES_AVAILABLE:
                async with aiofiles.open(self.events_file, 'r', encoding='utf-8') as f:
                    lines = await f.readlines()
            else:
                with open(self.events_file, 'r', encoding='utf-8') as f:
                    lines = f.readlines()
            
            # Cargar las últimas N líneas
            recent_lines = lines[-self.max_memory:] if len(lines) > self.max_memory else lines
            
            loaded_count = 0
            for line in recent_lines:
                line = line.strip()
                if not line:
                    continue
                try:
                    event = json.loads(line)
                    self.event_queue.append(event)
                    loaded_count += 1
                except json.JSONDecodeError as e:
                    logger.warning(f"⚠️ Línea corrupta en events.jsonl: {e}")
            
            logger.info(f"✅ {loaded_count} eventos rehidratados en memoria")
            
        except Exception as e:
            logger.error(f"❌ Error rehidratando eventos: {e}", exc_info=True)
            self.event_queue.clear()
    
    async def persist_event(self, event: Dict[str, Any]):
        """Escribe evento crítico en disco de forma asíncrona"""
        try:
            event_line = json.dumps(event, ensure_ascii=False) + '\n'
            
            if AIOFILES_AVAILABLE:
                async with aiofiles.open(self.events_file, 'a', encoding='utf-8') as f:
                    await f.write(event_line)
            else:
                # Fallback síncrono ejecutado en executor
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(
                    None,
                    self._sync_write,
                    event_line
                )
            
            logger.debug(f"💾 Evento persistido: {event.get('type', 'UNKNOWN')}")
            
        except Exception as e:
            logger.error(f"❌ Error persistiendo evento: {e}", exc_info=True)
    
    def _sync_write(self, event_line: str):
        """Escritura síncrona de respaldo"""
        with open(self.events_file, 'a', encoding='utf-8') as f:
            f.write(event_line)
    
    async def emit_event(self, event_type: str, data: Dict[str, Any], sentinels: List):
        """Emite un evento: lo guarda en memoria, lo persiste si es crítico, y lo broadcast"""
        timestamp = datetime.utcnow().isoformat() + 'Z'
        
        event = {
            'type': event_type,
            'timestamp': timestamp,
            'data': data
        }
        
        # Agregar a cola en memoria
        self.event_queue.append(event)
        
        # Persistir si es crítico
        if event_type in self.CRITICAL_EVENTS:
            await self.persist_event(event)
        
        # Broadcast a todos los Sentinels
        await self._broadcast_to_sentinels(event, sentinels)
        
        logger.info(f"📡 Evento emitido: {event_type}")
    
    async def _broadcast_to_sentinels(self, event: Dict[str, Any], sentinels: List):
        """Envía el evento a todos los Sentinels conectados"""
        if not sentinels:
            return
        
        event_str = json.dumps(event, ensure_ascii=False)
        event_bytes = event_str.encode('utf-8')
        
        # Validar límite de tamaño (1,024 KB)
        if len(event_bytes) > 1024 * 1024:
            logger.error(f"❌ Evento excede límite de 1MB: {len(event_bytes)} bytes. CANCELADO.")
            return
        
        header = len(event_bytes).to_bytes(4, byteorder='big')
        message = header + event_bytes
        
        broadcast_count = 0
        for writer, info in sentinels:
            try:
                writer.write(message)
                await writer.drain()
                broadcast_count += 1
            except Exception as e:
                logger.error(f"❌ Error broadcasting a Sentinel: {e}")
        
        if broadcast_count > 0:
            logger.debug(f"📢 Broadcast a {broadcast_count} Sentinel(s)")
    
    def poll_events(self, since_timestamp: Optional[str] = None) -> List[Dict[str, Any]]:
        """Retorna eventos desde un timestamp dado"""
        if not since_timestamp:
            return list(self.event_queue)
        
        filtered = []
        for event in self.event_queue:
            event_time = event.get('timestamp', '')
            if event_time > since_timestamp:
                filtered.append(event)
        
        logger.info(f"📊 POLL_EVENTS: {len(filtered)} eventos desde {since_timestamp}")
        return filtered


class ServerManager:
    def __init__(self, host: str = "127.0.0.1", port: int = 5678):
        self.host = host
        self.port = port
        
        # Nueva estructura de carpetas: BloomNucleus/workers/brain/
        app_data = os.environ.get('LOCALAPPDATA') or os.environ.get('PROGRAMDATA')
        self.base_dir = Path(app_data) / "BloomNucleus"
        self.workers_brain_dir = self.base_dir / "workers" / "brain"
        self.workers_brain_dir.mkdir(parents=True, exist_ok=True)
        
        # Archivos en workers/brain/
        self.pid_file = self.workers_brain_dir / "service.pid"
        self.traffic_log = self.workers_brain_dir / "tcp_traffic.log"
        self.events_file = self.workers_brain_dir / "events.jsonl"
        
        # Event Broadcaster
        self.event_broadcaster = EventBroadcaster(self.events_file)
        
        # ROUTING REGISTRY
        self.clients = {}
        self.profile_registry = {}
        
        # FORENSIC: Contadores
        self.connection_counter = 0
        self.message_counter = 0
        
        # Control de shutdown
        self.shutdown_event = asyncio.Event()
        self.server = None
        
        logger.info(f"🚀 Brain Service inicializado en {host}:{port}")
        logger.debug(f"📁 Workers dir: {self.workers_brain_dir}")

    def _log_traffic(self, direction: str, addr: tuple, data: str):
        """Log forensic de todo el tráfico TCP"""
        timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]
        try:
            with open(self.traffic_log, 'a', encoding='utf-8') as f:
                f.write(f"[{timestamp}] {direction} {addr[0]}:{addr[1]} | {data}\n")
        except Exception as e:
            logger.error(f"Failed to write traffic log: {e}")

    def _get_pid(self):
        try: 
            return int(self.pid_file.read_text().strip())
        except: 
            return None

    def _is_running(self):
        pid = self._get_pid()
        if not pid: 
            return False
        try: 
            os.kill(pid, 0)
            return True
        except: 
            return False

    def get_status(self):
        status = {
            "status": "success", 
            "data": {
                "running": self._is_running(), 
                "active_clients": len(self.clients),
                "registered_profiles": len(self.profile_registry),
                "events_in_memory": len(self.event_broadcaster.event_queue)
            }
        }
        logger.debug(f"📊 Status: {status['data']}")
        return status

    def _get_sentinels(self) -> List[tuple]:
        """Retorna lista de (writer, info) para todos los Sentinels conectados"""
        return [(w, i) for w, i in self.clients.items() if i.get('type') == 'sentinel']

    async def _handle_client(self, reader, writer):
        """FORENSIC VERSION - Logs every step + Event Broadcasting"""
        self.connection_counter += 1
        conn_id = self.connection_counter
        
        addr = writer.get_extra_info('peername')
        logger.info(f"🔌 [{conn_id}] NEW CONNECTION from {addr}")
        
        self.clients[writer] = {
            "addr": addr, 
            "profile_id": None,
            "type": None,
            "conn_id": conn_id
        }
        
        self._log_traffic("CONNECT", addr, f"Connection #{conn_id}")
        
        try:
            while True:
                logger.debug(f"📥 [{conn_id}] Waiting for header...")
                header = await reader.readexactly(4)
                
                length = int.from_bytes(header, byteorder='big')
                logger.debug(f"📦 [{conn_id}] Header: {header.hex()} → length={length}")
                
                if length > 10000:
                    logger.warning(f"⚠️ [{conn_id}] Message too large: {length}")
                    break
                
                logger.debug(f"📥 [{conn_id}] Reading {length} bytes...")
                data = await reader.readexactly(length)
                
                try:
                    msg_str = data.decode('utf-8')
                    logger.debug(f"📨 [{conn_id}] Payload: {msg_str[:200]}")
                except:
                    logger.error(f"❌ [{conn_id}] UTF-8 decode failed")
                    continue
                
                self._log_traffic("RECV", addr, msg_str)
                
                try:
                    msg = json.loads(msg_str)
                    self.message_counter += 1
                    logger.info(f"✅ [{conn_id}] Message #{self.message_counter} parsed")
                except json.JSONDecodeError as e:
                    logger.warning(f"⚠️ [{conn_id}] Invalid JSON: {e}")
                    continue
                
                msg_type = msg.get('type', 'UNKNOWN')
                logger.info(f"🔥 [{conn_id}] TYPE: {msg_type}")

                # === REGISTER_SENTINEL ===
                if msg_type == 'REGISTER_SENTINEL':
                    version = msg.get('version', 'unknown')
                    capabilities = msg.get('capabilities', [])
                    
                    logger.info(f"🎯 [{conn_id}] REGISTER_SENTINEL:")
                    logger.info(f"   Version: {version}")
                    logger.info(f"   Capabilities: {capabilities}")
                    
                    self.clients[writer]['type'] = 'sentinel'
                    
                    # Emitir evento de conexión de Sentinel
                    await self.event_broadcaster.emit_event(
                        'SENTINEL_CONNECTED',
                        {'conn_id': conn_id, 'version': version, 'capabilities': capabilities},
                        self._get_sentinels()
                    )
                    
                    logger.info(f"✅ [{conn_id}] Sentinel registered")
                    continue

                # === REGISTER_HOST ===
                if msg_type == 'REGISTER_HOST':
                    profile_id = msg.get('profile_id')
                    pid = msg.get('pid')
                    
                    logger.info(f"🔑 [{conn_id}] REGISTER_HOST:")
                    logger.info(f"   Profile: {profile_id}")
                    logger.info(f"   PID: {pid}")
                    
                    if profile_id:
                        self.clients[writer]['profile_id'] = profile_id
                        self.clients[writer]['type'] = 'host'
                        self.profile_registry[profile_id] = writer
                        
                        # Emitir evento de cambio de estado de perfil
                        await self.event_broadcaster.emit_event(
                            'PROFILE_STATUS_CHANGE',
                            {
                                'profile_id': profile_id,
                                'status': 'connected',
                                'pid': pid,
                                'conn_id': conn_id
                            },
                            self._get_sentinels()
                        )
                        
                        logger.info(f"✅ [{conn_id}] Host registered")
                        logger.info(f"   Total profiles: {len(self.profile_registry)}")
                        
                        self._log_traffic("REGISTER", addr, f"Host {profile_id[:8]}")
                    continue
                
                # === REGISTER_CLI ===
                if msg_type == 'REGISTER_CLI':
                    self.clients[writer]['type'] = 'cli'
                    logger.info(f"💻 [{conn_id}] CLI registered")
                    
                    response = {
                        "type": "REGISTRY_STATUS",
                        "active_profiles": list(self.profile_registry.keys())
                    }
                    await self._send_to_writer(writer, response)
                    continue

                # === POLL_EVENTS ===
                if msg_type == 'POLL_EVENTS':
                    since = msg.get('since')
                    logger.info(f"📊 [{conn_id}] POLL_EVENTS since={since}")
                    
                    events = self.event_broadcaster.poll_events(since)
                    
                    response = {
                        "type": "EVENTS_BATCH",
                        "count": len(events),
                        "events": events,
                        "timestamp": datetime.utcnow().isoformat() + 'Z'
                    }
                    
                    await self._send_to_writer(writer, response)
                    logger.info(f"📤 [{conn_id}] Sent {len(events)} events")
                    continue

                # === PROFILE_CONNECTED (Handshake desde Host C++) ===
                if msg_type == 'PROFILE_CONNECTED':
                    profile_id = msg.get('profile_id')
                    logger.info(f"🤝 [{conn_id}] PROFILE_CONNECTED: {profile_id}")
                    
                    await self.event_broadcaster.emit_event(
                        'PROFILE_CONNECTED',
                        msg.get('data', {}),
                        self._get_sentinels()
                    )
                    continue

                # === ONBOARDING_COMPLETE ===
                if msg_type == 'ONBOARDING_COMPLETE':
                    logger.info(f"🎉 [{conn_id}] ONBOARDING_COMPLETE")
                    
                    await self.event_broadcaster.emit_event(
                        'ONBOARDING_COMPLETE',
                        msg.get('data', {}),
                        self._get_sentinels()
                    )
                    continue

                # === INTENT_RESULT (transformar a INTENT_COMPLETE/FAILED) ===
                if msg_type == 'INTENT_RESULT':
                    success = msg.get('success', False)
                    result_type = 'INTENT_COMPLETE' if success else 'INTENT_FAILED'
                    
                    logger.info(f"🎯 [{conn_id}] {result_type}")
                    
                    await self.event_broadcaster.emit_event(
                        result_type,
                        msg.get('data', {}),
                        self._get_sentinels()
                    )
                    continue

                # === EXTENSION_ERROR ===
                if msg_type == 'EXTENSION_ERROR':
                    logger.error(f"❌ [{conn_id}] EXTENSION_ERROR: {msg.get('error')}")
                    
                    await self.event_broadcaster.emit_event(
                        'EXTENSION_ERROR',
                        msg.get('data', {}),
                        self._get_sentinels()
                    )
                    continue

                # === TASK_PROGRESS (opcional) ===
                if msg_type == 'TASK_PROGRESS':
                    logger.debug(f"📊 [{conn_id}] TASK_PROGRESS")
                    
                    await self.event_broadcaster.emit_event(
                        'TASK_PROGRESS',
                        msg.get('data', {}),
                        self._get_sentinels()
                    )
                    continue
                
                # === ROUTING ===
                target_profile = msg.get('target_profile')
                request_id = msg.get('request_id')
                
                if target_profile:
                    logger.debug(f"🎯 [{conn_id}] Routing to {target_profile[:8]}...")
                    target_writer = self.profile_registry.get(target_profile)
                    
                    if target_writer and target_writer in self.clients:
                        try:
                            target_writer.write(header + data)
                            await target_writer.drain()
                            logger.info(f"📨 [{conn_id}] Routed to {target_profile[:8]}")
                            
                            if request_id and self.clients[writer]['type'] == 'cli':
                                ack = {"request_id": request_id, "status": "routed", "target": target_profile}
                                await self._send_to_writer(writer, ack)
                        except Exception as e:
                            logger.error(f"❌ [{conn_id}] Routing failed: {e}")
                            self._cleanup_client(target_writer)
                    else:
                        logger.warning(f"⚠️ [{conn_id}] Target offline: {target_profile[:8]}")
                        if request_id:
                            error_msg = {"status": "error", "message": "Profile not connected", "request_id": request_id}
                            await self._send_to_writer(writer, error_msg)
                else:
                    # === BROADCAST ===
                    logger.debug(f"📢 [{conn_id}] Broadcasting...")
                    count = 0
                    for client_writer, client_info in list(self.clients.items()):
                        if client_writer != writer and client_info['type'] == 'host':
                            try:
                                client_writer.write(header + data)
                                await client_writer.drain()
                                count += 1
                            except:
                                self._cleanup_client(client_writer)
                    logger.info(f"📢 [{conn_id}] Broadcast to {count} hosts")
        
        except asyncio.IncompleteReadError:
            logger.info(f"ℹ️ [{conn_id}] Connection closed by client")
        except Exception as e:
            logger.error(f"💥 [{conn_id}] Error: {e}", exc_info=True)
        finally:
            logger.info(f"🔌 [{conn_id}] Cleanup")
            await self._cleanup_client(writer)

    async def _send_to_writer(self, writer, message_dict):
        """Envía mensaje con validación de tamaño (límite 1MB)"""
        try:
            resp_str = json.dumps(message_dict, ensure_ascii=False)
            resp_bytes = resp_str.encode('utf-8')
            
            # Validar límite de 1,024 KB
            if len(resp_bytes) > 1024 * 1024:
                logger.error(f"❌ Mensaje excede 1MB: {len(resp_bytes)} bytes. CANCELADO.")
                return
            
            header = len(resp_bytes).to_bytes(4, byteorder='big')
            writer.write(header + resp_bytes)
            await writer.drain()
            logger.debug(f"📤 Sent: {resp_str[:100]}")
        except Exception as e:
            logger.error(f"❌ Send failed: {e}")

    async def _cleanup_client(self, writer):
        """Limpia cliente y emite evento si es un profile"""
        info = self.clients.pop(writer, None)
        if info:
            p_id = info.get('profile_id')
            client_type = info.get('type')
            
            # Emitir evento de desconexión de perfil
            if client_type == 'host' and p_id:
                await self.event_broadcaster.emit_event(
                    'PROFILE_DISCONNECTED',
                    {
                        'profile_id': p_id,
                        'conn_id': info.get('conn_id')
                    },
                    self._get_sentinels()
                )
            
            if p_id and p_id in self.profile_registry:
                del self.profile_registry[p_id]
                logger.info(f"🔌 Profile unregistered: {p_id[:8]}")
        
        try:
            writer.close()
            await writer.wait_closed()
        except:
            pass

    def _setup_signal_handlers(self, loop):
        """Configura manejo de señales para shutdown limpio"""
        def signal_handler(signum, frame):
            logger.info(f"🛑 Señal recibida: {signal.Signals(signum).name}")
            loop.call_soon_threadsafe(self.shutdown_event.set)
        
        if sys.platform != 'win32':
            signal.signal(signal.SIGTERM, signal_handler)
            signal.signal(signal.SIGINT, signal_handler)
        else:
            # En Windows solo SIGINT (Ctrl+C)
            signal.signal(signal.SIGINT, signal_handler)

    async def _shutdown(self):
        """Shutdown limpio con cierre de archivos y limpieza"""
        logger.info("🛑 Iniciando shutdown...")
        
        # Emitir evento de shutdown
        await self.event_broadcaster.emit_event(
            'BRAIN_SERVICE_STATUS',
            {'status': 'shutting_down'},
            self._get_sentinels()
        )
        
        # Cerrar todas las conexiones
        for writer in list(self.clients.keys()):
            try:
                writer.close()
                await writer.wait_closed()
            except:
                pass
        
        # Cerrar servidor
        if self.server:
            self.server.close()
            await self.server.wait_closed()
        
        # Eliminar PID file
        self.pid_file.unlink(missing_ok=True)
        
        logger.info("✅ Shutdown completo")

    def start_blocking(self):
        if self._is_running(): 
            logger.warning("⚠️ Service already running")
            return
        
        logger.info("=" * 60)
        logger.info("🚀 BRAIN SERVICE STARTUP")
        logger.info(f"   Host: {self.host}:{self.port}")
        logger.info(f"   PID: {os.getpid()}")
        logger.info(f"   Workers dir: {self.workers_brain_dir}")
        logger.info("=" * 60)
        
        if sys.platform == 'win32':
            asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
        
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        # Setup signal handlers
        self._setup_signal_handlers(loop)
        
        self.pid_file.write_text(str(os.getpid()))
        
        try:
            # Rehidratar eventos
            loop.run_until_complete(self.event_broadcaster.hydrate_from_disk())
            
            # Limpiar traffic log anterior
            if self.traffic_log.exists():
                self.traffic_log.unlink()
            
            # Iniciar servidor
            self.server = loop.run_until_complete(
                asyncio.start_server(self._handle_client, self.host, self.port)
            )
            logger.info(f"✨ Listening on {self.host}:{self.port}")
            
            # Emitir evento de inicio
            loop.run_until_complete(
                self.event_broadcaster.emit_event(
                    'BRAIN_SERVICE_STATUS',
                    {
                        'status': 'started',
                        'pid': os.getpid(),
                        'host': self.host,
                        'port': self.port
                    },
                    self._get_sentinels()
                )
            )
            
            # Esperar hasta señal de shutdown
            loop.run_until_complete(self.shutdown_event.wait())
            
            # Ejecutar shutdown limpio
            loop.run_until_complete(self._shutdown())
            
        except KeyboardInterrupt:
            logger.info("🛑 Stopped by user (KeyboardInterrupt)")
            loop.run_until_complete(self._shutdown())
        except Exception as e:
            logger.critical(f"💥 FATAL: {e}", exc_info=True)
        finally:
            loop.close()
            logger.info("--- SHUTDOWN COMPLETE ---")