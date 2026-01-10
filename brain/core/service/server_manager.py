import asyncio
import os
import sys
import json
from pathlib import Path
from typing import Dict, Any, Optional

class ServerManager:
    def __init__(self, host: str = "127.0.0.1", port: int = 5678):
        self.host = host
        self.port = port
        app_data = os.environ.get('LOCALAPPDATA') or os.environ.get('PROGRAMDATA')
        self.base_dir = Path(app_data) / "BloomNucleus" / ".brain"
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self.pid_file = self.base_dir / "service.pid"
        
        # ROUTING REGISTRY: Mapeo writer -> client_info
        self.clients = {}
        # PROFILE REGISTRY: Mapeo profile_id -> writer
        self.profile_registry = {}

    def _get_pid(self):
        try: return int(self.pid_file.read_text().strip())
        except: return None

    def _is_running(self):
        pid = self._get_pid()
        if not pid: return False
        try: os.kill(pid, 0); return True
        except: return False

    def get_status(self):
        return {
            "status": "success", 
            "data": {
                "running": self._is_running(), 
                "active_clients": len(self.clients),
                "registered_profiles": len(self.profile_registry)
            }
        }

    async def _handle_client(self, reader, writer):
        addr = writer.get_extra_info('peername')
        
        # Inicializar registro de cliente sin profile_id (pendiente de handshake)
        self.clients[writer] = {
            "addr": addr, 
            "profile_id": None,
            "type": None  # 'host' o 'cli'
        }
        
        try:
            while True:
                header = await reader.readexactly(4)
                length = int.from_bytes(header, byteorder='big')
                data = await reader.readexactly(length)
                msg_str = data.decode('utf-8')
                
                try:
                    msg = json.loads(msg_str)
                except json.JSONDecodeError:
                    continue
                
                # HANDSHAKE: Registrar conexion con profile_id
                if msg.get('type') == 'REGISTER_HOST':
                    profile_id = msg.get('profile_id')
                    if profile_id:
                        self.clients[writer]['profile_id'] = profile_id
                        self.clients[writer]['type'] = 'host'
                        self.profile_registry[profile_id] = writer
                        print(f"[Routing] Host registrado: {profile_id} desde {addr}")
                    continue
                
                # REGISTRO DE CLI (para comandos directos)
                if msg.get('type') == 'REGISTER_CLI':
                    self.clients[writer]['type'] = 'cli'
                    print(f"[Routing] CLI conectado desde {addr}")
                    # Responder con lista de perfiles activos
                    response = {
                        "type": "REGISTRY_STATUS",
                        "active_profiles": list(self.profile_registry.keys())
                    }
                    response_str = json.dumps(response)
                    response_bytes = response_str.encode('utf-8')
                    response_len = len(response_bytes).to_bytes(4, byteorder='big')
                    writer.write(response_len + response_bytes)
                    await writer.drain()
                    continue
                
                # ROUTING ESPECIFICO
                target_profile = msg.get('target_profile')
                request_id = msg.get('request_id')  # Para respuestas sincronas
                
                if target_profile:
                    # Ruteo directo a un perfil especifico
                    target_writer = self.profile_registry.get(target_profile)
                    if target_writer and target_writer in self.clients:
                        try:
                            target_writer.write(header + data)
                            await target_writer.drain()
                            print(f"[Routing] Mensaje enviado a perfil: {target_profile}")
                            
                            # ACK SINCRONO: Responder al CLI si tiene request_id
                            if request_id and self.clients[writer]['type'] == 'cli':
                                ack = {
                                    "request_id": request_id,
                                    "status": "routed",
                                    "target": target_profile
                                }
                                ack_str = json.dumps(ack)
                                ack_bytes = ack_str.encode('utf-8')
                                ack_len = len(ack_bytes).to_bytes(4, byteorder='big')
                                writer.write(ack_len + ack_bytes)
                                await writer.drain()
                                print(f"[Routing] ACK enviado al CLI para request_id: {request_id}")
                        except Exception as e:
                            # Limpiar conexion muerta
                            print(f"[Routing] Error enviando a {target_profile}: {e}")
                            if target_writer in self.clients:
                                del self.clients[target_writer]
                            if target_profile in self.profile_registry:
                                del self.profile_registry[target_profile]
                    else:
                        # Perfil no encontrado, notificar al emisor
                        error_msg = {
                            "status": "error",
                            "message": f"Profile {target_profile} not connected",
                            "request_id": request_id
                        }
                        error_str = json.dumps(error_msg)
                        error_bytes = error_str.encode('utf-8')
                        error_len = len(error_bytes).to_bytes(4, byteorder='big')
                        writer.write(error_len + error_bytes)
                        await writer.drain()
                        print(f"[Routing] Error notificado: Perfil {target_profile} no encontrado")
                else:
                    # BROADCAST CONTROLADO: Solo a hosts sin target especifico
                    # Esto permite comandos globales como "list profiles"
                    for client_writer, client_info in list(self.clients.items()):
                        if client_writer != writer and client_info['type'] == 'host':
                            try:
                                client_writer.write(header + data)
                                await client_writer.drain()
                            except:
                                profile_id = client_info.get('profile_id')
                                if profile_id and profile_id in self.profile_registry:
                                    del self.profile_registry[profile_id]
                                if client_writer in self.clients:
                                    del self.clients[client_writer]
        
        except asyncio.IncompleteReadError:
            pass
        except Exception as e:
            print(f"[Routing] Error en cliente {addr}: {e}")
        finally:
            # Limpieza al desconectar
            profile_id = self.clients.get(writer, {}).get('profile_id')
            if profile_id and profile_id in self.profile_registry:
                del self.profile_registry[profile_id]
                print(f"[Routing] Perfil desregistrado: {profile_id}")
            
            if writer in self.clients:
                del self.clients[writer]
            
            writer.close()

    def start_blocking(self):
        if self._is_running(): return
        if sys.platform == 'win32':
            asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        self.pid_file.write_text(str(os.getpid()))
        server = loop.run_until_complete(asyncio.start_server(self._handle_client, self.host, self.port))
        print(f"Brain Service activo en {self.host}:{self.port}")
        print(f"Modo: Routing Inteligente (Hub-and-Spoke)")
        try: 
            loop.run_forever()
        except KeyboardInterrupt: 
            pass
        finally: 
            self.pid_file.unlink(missing_ok=True)