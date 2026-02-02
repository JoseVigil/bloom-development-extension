"""
Server Manager Core - The TCP Concierge
Minimal network layer that coordinates ProfileStateManager and EventBus.
Handles asyncio server, 4-byte BigEndian protocol, and message routing.
"""

import asyncio
import os
import sys
import json
import logging
import signal
from pathlib import Path
from typing import Dict, Any, Optional
from brain.shared.logger import get_logger

# Import the Trinity modules
from brain.core.server.server_event_bus import EventBus
from brain.core.profile.profile_state_manager import ProfileStateManager

# Logger with DEBUG level
logger = get_logger("brain.server.manager")
logger.setLevel(logging.DEBUG)


class ServerManager:
    """
    The TCP Concierge - Minimal network orchestration layer.
    
    Responsibilities:
    - Manage asyncio.start_server and TCP protocol
    - Handle 4-byte BigEndian message framing
    - Route messages between clients (CLI <-> Host)
    - Coordinate ProfileStateManager and EventBus
    - Implement 1MB message size limit
    - Handle graceful shutdown (SIGINT/SIGTERM)
    """
    
    def __init__(self, host: str = "127.0.0.1", port: int = 5678):
        """
        Initialize ServerManager with network and worker paths.
        
        Args:
            host: TCP bind address
            port: TCP bind port
        """
        self.host = host
        self.port = port
        
        # Workers directory structure: BloomNucleus/workers/brain/
        app_data = os.environ.get('LOCALAPPDATA') or os.environ.get('PROGRAMDATA')
        self.base_dir = Path(app_data) / "BloomNucleus"
        self.config_dir = self.base_dir / "config"
        self.workers_brain_dir = self.base_dir / "workers" / "brain"
        
        # Ensure directories exist
        self.config_dir.mkdir(parents=True, exist_ok=True)
        self.workers_brain_dir.mkdir(parents=True, exist_ok=True)
        
        # Worker files
        self.pid_file = self.workers_brain_dir / "service.pid"
        self.traffic_log = self.workers_brain_dir / "tcp_traffic.log"
        
        # Initialize Trinity components
        self.event_bus = EventBus(
            events_file=self.workers_brain_dir / "events.jsonl",
            max_memory=1000
        )
        
        self.profile_manager = ProfileStateManager(
            profiles_json_path=self.config_dir / "profiles.json"
        )
        
        # ROUTING REGISTRY
        self.clients = {}  # writer -> client_info
        self.profile_registry = {}  # profile_id -> writer
        
        # FORENSIC: Counters
        self.connection_counter = 0
        self.message_counter = 0
        
        # Control signals
        self.shutdown_event = asyncio.Event()
        self.server = None
        
        logger.info(f"🚀 ServerManager initialized")
        logger.info(f"   Config: {self.config_dir}")
        logger.info(f"   Workers: {self.workers_brain_dir}")
    
    def _is_running(self) -> bool:
        """Check if service is already running via PID file"""
        if not self.pid_file.exists():
            return False
        
        try:
            pid = int(self.pid_file.read_text().strip())
            # Check if process exists
            import psutil
            return psutil.pid_exists(pid)
        except (ValueError, ImportError):
            return False
    
    def _get_sentinels(self):
        """Get list of CLI sentinel connections for event broadcasting"""
        return [
            (writer, info) for writer, info in self.clients.items()
            if info.get('type') == 'cli'
        ]
    
    async def _handle_client(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        """
        Handle individual TCP client connection.
        Implements 4-byte BigEndian protocol and message routing.
        """
        self.connection_counter += 1
        conn_id = f"CONN-{self.connection_counter:04d}"
        
        addr = writer.get_extra_info('peername')
        logger.info(f"🔌 [{conn_id}] New connection from {addr}")
        
        # Register client (type unknown until first message)
        self.clients[writer] = {
            'conn_id': conn_id,
            'addr': addr,
            'type': None,
            'profile_id': None
        }
        
        try:
            while True:
                # Read 4-byte header (message length)
                header = await reader.readexactly(4)
                msg_len = int.from_bytes(header, byteorder='big')
                
                # Enforce 1MB limit
                if msg_len > 1024 * 1024:
                    logger.error(f"❌ [{conn_id}] Message exceeds 1MB: {msg_len} bytes")
                    break
                
                # Read message body
                data = await reader.readexactly(msg_len)
                self.message_counter += 1
                
                # Log traffic
                await self._log_traffic(conn_id, 'RECV', data)
                
                try:
                    msg = json.loads(data.decode('utf-8'))
                except json.JSONDecodeError as e:
                    logger.error(f"❌ [{conn_id}] Invalid JSON: {e}")
                    continue
                
                msg_type = msg.get('type')
                logger.debug(f"📥 [{conn_id}] Message: {msg_type}")
                
                # === MESSAGE HANDLERS ===
                
                if msg_type == 'REGISTER_CLI':
                    # Sentinel registration
                    self.clients[writer]['type'] = 'cli'
                    logger.info(f"🎯 [{conn_id}] Registered as CLI Sentinel")
                    
                    ack = {
                        "type": "REGISTER_ACK",
                        "conn_id": conn_id,
                        "role": "cli"
                    }
                    await self._send_to_writer(writer, ack)
                
                elif msg_type == 'REGISTER_HOST':
                    # Chrome Host registration
                    profile_id = msg.get('profile_id')
                    pid = msg.get('pid')
                    launch_id = msg.get('launch_id')
                    
                    if not profile_id:
                        logger.error(f"❌ [{conn_id}] Missing profile_id in REGISTER_HOST")
                        continue
                    
                    # Update client registry
                    self.clients[writer]['type'] = 'host'
                    self.clients[writer]['profile_id'] = profile_id
                    self.profile_registry[profile_id] = writer
                    
                    # Update profile state (online)
                    await self.profile_manager.set_profile_online(
                        profile_id=profile_id,
                        pid=pid,
                        launch_id=launch_id
                    )
                    
                    logger.info(f"🎯 [{conn_id}] Host registered: {profile_id[:8]}")
                    
                    ack = {
                        "type": "REGISTER_ACK",
                        "conn_id": conn_id,
                        "role": "host",
                        "profile_id": profile_id
                    }
                    await self._send_to_writer(writer, ack)
                
                elif msg_type == 'PROFILE_CONNECTED':
                    # Handshake confirmation from Host
                    profile_id = msg.get('profile_id')
                    
                    if profile_id:
                        # Confirm handshake in profile state
                        await self.profile_manager.confirm_handshake(profile_id)
                        
                        # Emit event via EventBus
                        event = await self.event_bus.add_event(
                            'PROFILE_CONNECTED',
                            {
                                'profile_id': profile_id,
                                'conn_id': conn_id,
                                'timestamp': msg.get('timestamp')
                            }
                        )
                        
                        # Broadcast to sentinels
                        await self._broadcast_event(event)
                        
                        logger.info(f"🤝 [{conn_id}] Profile connected: {profile_id[:8]}")
                
                elif msg_type == 'HEARTBEAT':
                    # Update heartbeat timestamp
                    profile_id = self.clients[writer].get('profile_id')
                    if profile_id:
                        await self.profile_manager.update_heartbeat(profile_id)
                        logger.debug(f"💓 [{conn_id}] Heartbeat from {profile_id[:8]}")
                
                elif msg_type == 'POLL_EVENTS':
                    # Event polling request
                    since = msg.get('since')
                    events = self.event_bus.poll_events(since_timestamp=since)
                    
                    response = {
                        "type": "EVENTS",
                        "events": events,
                        "count": len(events)
                    }
                    await self._send_to_writer(writer, response)
                    
                    logger.info(f"📊 [{conn_id}] POLL_EVENTS: {len(events)} events")
                
                elif msg_type == 'GET_PROFILE_STATE':
                    # Profile state query
                    profile_id = msg.get('profile_id')
                    state = await self.profile_manager.get_profile_state(profile_id)
                    
                    response = {
                        "type": "PROFILE_STATE",
                        "profile_id": profile_id,
                        "state": state
                    }
                    await self._send_to_writer(writer, response)
                
                else:
                    # === ROUTING LOGIC ===
                    target_profile = msg.get('target_profile')
                    request_id = msg.get('request_id')
                    
                    if target_profile:
                        # Direct routing to specific profile
                        logger.debug(f"🎯 [{conn_id}] Routing to {target_profile[:8]}...")
                        target_writer = self.profile_registry.get(target_profile)
                        
                        if target_writer and target_writer in self.clients:
                            try:
                                target_writer.write(header + data)
                                await target_writer.drain()
                                logger.info(f"📨 [{conn_id}] Routed to {target_profile[:8]}")
                                
                                # ACK to CLI if applicable
                                if request_id and self.clients[writer]['type'] == 'cli':
                                    ack = {
                                        "request_id": request_id,
                                        "status": "routed",
                                        "target": target_profile
                                    }
                                    await self._send_to_writer(writer, ack)
                            except Exception as e:
                                logger.error(f"❌ [{conn_id}] Routing failed: {e}")
                                await self._cleanup_client(target_writer)
                        else:
                            logger.warning(f"⚠️ [{conn_id}] Target offline: {target_profile[:8]}")
                            if request_id:
                                error_msg = {
                                    "status": "error",
                                    "message": "Profile not connected",
                                    "request_id": request_id
                                }
                                await self._send_to_writer(writer, error_msg)
                    else:
                        # Broadcast to all hosts
                        logger.debug(f"📢 [{conn_id}] Broadcasting...")
                        count = 0
                        for client_writer, client_info in list(self.clients.items()):
                            if client_writer != writer and client_info['type'] == 'host':
                                try:
                                    client_writer.write(header + data)
                                    await client_writer.drain()
                                    count += 1
                                except:
                                    await self._cleanup_client(client_writer)
                        logger.info(f"📢 [{conn_id}] Broadcast to {count} hosts")
        
        except asyncio.IncompleteReadError:
            logger.info(f"ℹ️ [{conn_id}] Connection closed by client")
        except Exception as e:
            logger.error(f"💥 [{conn_id}] Error: {e}", exc_info=True)
        finally:
            logger.info(f"🔌 [{conn_id}] Cleanup")
            await self._cleanup_client(writer)
    
    async def _send_to_writer(self, writer: asyncio.StreamWriter, message_dict: Dict[str, Any]):
        """
        Send JSON message to client with 1MB size validation.
        
        Args:
            writer: StreamWriter to send to
            message_dict: Message payload as dictionary
        """
        try:
            resp_str = json.dumps(message_dict, ensure_ascii=False)
            resp_bytes = resp_str.encode('utf-8')
            
            # Enforce 1MB limit (last line of defense)
            if len(resp_bytes) > 1024 * 1024:
                logger.error(f"❌ Message exceeds 1MB: {len(resp_bytes)} bytes. CANCELLED.")
                return
            
            header = len(resp_bytes).to_bytes(4, byteorder='big')
            writer.write(header + resp_bytes)
            await writer.drain()
            logger.debug(f"📤 Sent: {resp_str[:100]}")
        except Exception as e:
            logger.error(f"❌ Send failed: {e}")
    
    async def _broadcast_event(self, event: Dict[str, Any]):
        """
        Broadcast event to all connected Sentinel clients.
        
        Args:
            event: Event dictionary to broadcast
        """
        sentinels = self._get_sentinels()
        if not sentinels:
            return
        
        event_str = json.dumps(event, ensure_ascii=False)
        event_bytes = event_str.encode('utf-8')
        
        # Validate 1MB limit
        if len(event_bytes) > 1024 * 1024:
            logger.error(f"❌ Event exceeds 1MB: {len(event_bytes)} bytes. CANCELLED.")
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
                logger.error(f"❌ Error broadcasting to Sentinel: {e}")
        
        if broadcast_count > 0:
            logger.debug(f"📢 Broadcast to {broadcast_count} Sentinel(s)")
    
    async def _cleanup_client(self, writer: asyncio.StreamWriter):
        """
        Clean up client connection and emit disconnect event if profile.
        
        Args:
            writer: StreamWriter to clean up
        """
        info = self.clients.pop(writer, None)
        if info:
            p_id = info.get('profile_id')
            client_type = info.get('type')
            
            # Handle profile disconnection
            if client_type == 'host' and p_id:
                # Update profile state (offline)
                await self.profile_manager.set_profile_offline(p_id)
                
                # Emit disconnect event
                event = await self.event_bus.add_event(
                    'PROFILE_DISCONNECTED',
                    {
                        'profile_id': p_id,
                        'conn_id': info.get('conn_id')
                    }
                )
                
                # Broadcast to sentinels
                await self._broadcast_event(event)
            
            # Remove from profile registry
            if p_id and p_id in self.profile_registry:
                del self.profile_registry[p_id]
                logger.info(f"🔌 Profile unregistered: {p_id[:8]}")
        
        try:
            writer.close()
            await writer.wait_closed()
        except:
            pass
    
    async def _log_traffic(self, conn_id: str, direction: str, data: bytes):
        """
        Log network traffic to tcp_traffic.log asynchronously.
        
        Args:
            conn_id: Connection identifier
            direction: 'RECV' or 'SEND'
            data: Raw message bytes
        """
        try:
            timestamp = asyncio.get_event_loop().time()
            log_entry = f"[{timestamp:.3f}] {conn_id} {direction} {len(data)} bytes\n"
            
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                self._sync_log_traffic,
                log_entry
            )
        except Exception as e:
            logger.debug(f"Traffic log error: {e}")
    
    def _sync_log_traffic(self, log_entry: str):
        """Synchronous fallback for traffic logging"""
        with open(self.traffic_log, 'a', encoding='utf-8') as f:
            f.write(log_entry)
    
    def _setup_signal_handlers(self, loop: asyncio.AbstractEventLoop):
        """
        Configure signal handlers for graceful shutdown.
        
        Args:
            loop: Event loop to bind signals to
        """
        def signal_handler(signum, frame):
            logger.info(f"🛑 Signal received: {signal.Signals(signum).name}")
            loop.call_soon_threadsafe(self.shutdown_event.set)
        
        if sys.platform != 'win32':
            signal.signal(signal.SIGTERM, signal_handler)
            signal.signal(signal.SIGINT, signal_handler)
        else:
            # Windows only supports SIGINT (Ctrl+C)
            signal.signal(signal.SIGINT, signal_handler)
    
    async def _shutdown(self):
        """
        Execute graceful shutdown sequence.
        Emits shutdown event, closes connections, removes PID file.
        """
        logger.info("🛑 Initiating shutdown...")
        
        # Emit shutdown event
        event = await self.event_bus.add_event(
            'BRAIN_SERVICE_STATUS',
            {'status': 'shutting_down'}
        )
        await self._broadcast_event(event)
        
        # Close all client connections
        for writer in list(self.clients.keys()):
            try:
                writer.close()
                await writer.wait_closed()
            except:
                pass
        
        # Close server
        if self.server:
            self.server.close()
            await self.server.wait_closed()
        
        # Remove PID file
        self.pid_file.unlink(missing_ok=True)
        
        logger.info("✅ Shutdown complete")
    
    def start_blocking(self):
        """
        Start server in blocking mode (main entry point).
        Handles event loop creation, signal setup, and shutdown coordination.
        """
        if self._is_running():
            logger.warning("⚠️ Service already running")
            return
        
        logger.info("=" * 60)
        logger.info("🚀 BRAIN SERVICE STARTUP")
        logger.info(f"   Host: {self.host}:{self.port}")
        logger.info(f"   PID: {os.getpid()}")
        logger.info(f"   Workers dir: {self.workers_brain_dir}")
        logger.info("=" * 60)
        
        # Windows event loop policy
        if sys.platform == 'win32':
            asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
        
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        # Setup signal handlers
        self._setup_signal_handlers(loop)
        
        # Write PID file
        self.pid_file.write_text(str(os.getpid()))
        
        try:
            # Rehydrate events from disk
            loop.run_until_complete(self.event_bus.hydrate_from_disk())
            
            # Clean previous traffic log
            if self.traffic_log.exists():
                self.traffic_log.unlink()
            
            # Start TCP server
            self.server = loop.run_until_complete(
                asyncio.start_server(self._handle_client, self.host, self.port)
            )
            logger.info(f"✨ Listening on {self.host}:{self.port}")
            
            # Emit startup event
            loop.run_until_complete(
                self.event_bus.add_event(
                    'BRAIN_SERVICE_STATUS',
                    {
                        'status': 'started',
                        'pid': os.getpid(),
                        'host': self.host,
                        'port': self.port
                    }
                )
            )
            
            # Wait for shutdown signal
            loop.run_until_complete(self.shutdown_event.wait())
            
            # Execute graceful shutdown
            loop.run_until_complete(self._shutdown())
            
        except KeyboardInterrupt:
            logger.info("🛑 Stopped by user (KeyboardInterrupt)")
            loop.run_until_complete(self._shutdown())
        except Exception as e:
            logger.critical(f"💥 FATAL: {e}", exc_info=True)
        finally:
            loop.close()
            logger.info("--- SHUTDOWN COMPLETE ---")