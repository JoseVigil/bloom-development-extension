import asyncio
import os
import sys
import json
import logging
from pathlib import Path
from typing import Dict, Any, Optional
from datetime import datetime
from brain.shared.logger import get_logger

# Logger con nivel DEBUG
logger = get_logger("brain.service")
logger.setLevel(logging.DEBUG)

class ServerManager:
    def __init__(self, host: str = "127.0.0.1", port: int = 5678):
        self.host = host
        self.port = port
        app_data = os.environ.get('LOCALAPPDATA') or os.environ.get('PROGRAMDATA')
        self.base_dir = Path(app_data) / "BloomNucleus" / ".brain"
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self.pid_file = self.base_dir / "service.pid"
        
        # FORENSIC: Archivo de tráfico TCP
        self.traffic_log = self.base_dir / "tcp_traffic.log"
        
        # ROUTING REGISTRY
        self.clients = {}
        self.profile_registry = {}
        
        # FORENSIC: Contadores
        self.connection_counter = 0
        self.message_counter = 0
        
        logger.info(f"🚀 Brain Service inicializado en {host}:{port}")
        logger.debug(f"📁 Base dir: {self.base_dir}")

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
        if not pid: return False
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
                "registered_profiles": len(self.profile_registry)
            }
        }
        logger.debug(f"📊 Status: {status['data']}")
        return status

    async def _handle_client(self, reader, writer):
        """FORENSIC VERSION - Logs every step"""
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
                logger.info(f"📥 [{conn_id}] TYPE: {msg_type}")

                # REGISTER_HOST
                if msg_type == 'REGISTER_HOST':
                    profile_id = msg.get('profile_id')
                    pid = msg.get('pid')
                    
                    logger.info(f"🔐 [{conn_id}] REGISTER_HOST:")
                    logger.info(f"   Profile: {profile_id}")
                    logger.info(f"   PID: {pid}")
                    
                    if profile_id:
                        self.clients[writer]['profile_id'] = profile_id
                        self.clients[writer]['type'] = 'host'
                        self.profile_registry[profile_id] = writer
                        
                        logger.info(f"✅ [{conn_id}] Host registered")
                        logger.info(f"   Total profiles: {len(self.profile_registry)}")
                        
                        self._log_traffic("REGISTER", addr, f"Host {profile_id[:8]}")
                    continue
                
                # REGISTER_CLI
                if msg_type == 'REGISTER_CLI':
                    self.clients[writer]['type'] = 'cli'
                    logger.info(f"💻 [{conn_id}] CLI registered")
                    
                    response = {
                        "type": "REGISTRY_STATUS",
                        "active_profiles": list(self.profile_registry.keys())
                    }
                    await self._send_to_writer(writer, response)
                    continue
                
                # ROUTING
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
                    # BROADCAST
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
            self._cleanup_client(writer)

    async def _send_to_writer(self, writer, message_dict):
        try:
            resp_str = json.dumps(message_dict)
            resp_bytes = resp_str.encode('utf-8')
            header = len(resp_bytes).to_bytes(4, byteorder='big')
            writer.write(header + resp_bytes)
            await writer.drain()
            logger.debug(f"📤 Sent: {resp_str[:100]}")
        except Exception as e:
            logger.error(f"❌ Send failed: {e}")

    def _cleanup_client(self, writer):
        info = self.clients.pop(writer, None)
        if info:
            p_id = info.get('profile_id')
            if p_id and p_id in self.profile_registry:
                del self.profile_registry[p_id]
                logger.info(f"📌 Profile unregistered: {p_id[:8]}")
        try:
            writer.close()
        except:
            pass

    def start_blocking(self):
        if self._is_running(): 
            logger.warning("⚠️ Service already running")
            return
        
        logger.info("=" * 60)
        logger.info("🚀 BRAIN SERVICE STARTUP")
        logger.info(f"   Host: {self.host}:{self.port}")
        logger.info(f"   PID: {os.getpid()}")
        logger.info("=" * 60)
        
        if sys.platform == 'win32':
            asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
        
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        self.pid_file.write_text(str(os.getpid()))
        
        try:
            server = loop.run_until_complete(
                asyncio.start_server(self._handle_client, self.host, self.port)
            )
            logger.info(f"✨ Listening on {self.host}:{self.port}")
            
            if self.traffic_log.exists():
                self.traffic_log.unlink()
            
            loop.run_forever()
            
        except KeyboardInterrupt:
            logger.info("🛑 Stopped by user")
        except Exception as e:
            logger.critical(f"💥 FATAL: {e}", exc_info=True)
        finally:
            self.pid_file.unlink(missing_ok=True)
            logger.info("--- SHUTDOWN ---")