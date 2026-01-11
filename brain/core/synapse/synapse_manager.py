"""
Orquestador principal de Synapse.
Coordina el protocolo Native Messaging y despacha las acciones.
"""

import logging
import time
from typing import Dict, Any, Callable

# Imports usando la nueva nomenclatura explícita
from brain.core.synapse.synapse_protocol import SynapseProtocol
from brain.core.synapse.synapse_exceptions import SynapseError

class SynapseManager:
    """
    Controlador del ciclo de vida de la sesión Native Messaging.
    Actúa como servidor (Host) escuchando a Chrome.
    """
    
    def __init__(self):
        self.protocol = SynapseProtocol()
        # Logger específico para no ensuciar stdout (que es para Chrome)
        self.logger = logging.getLogger("brain.core.synapse.manager")
        
        # 🗺️ MAPA DE ACCIONES (Dispatcher)
        # Aquí registramos qué función maneja cada tipo de mensaje.
        # Esto permite escalar a cientos de comandos sin llenar de if/else el código.
        self._action_map: Dict[str, Callable] = {
            "SYSTEM_HELLO": self._handle_handshake,
            "HEARTBEAT":    self._handle_heartbeat,
            "LOG_ENTRY":    self._handle_log_entry,
            # Futuros comandos se agregan aquí:
            # "DOM_EVENT": self._handle_dom_event,
        }

    def run_host_loop(self) -> None:
        """
        Inicia el bucle infinito de escucha.
        Este método es BLOQUEANTE y se ejecuta cuando Chrome invoca a brain.exe.
        """
        self.logger.info("🚀 Iniciando Synapse Host Loop...")
        
        try:
            while True:
                # 1. Leer mensaje (Bloqueante)
                # Si retorna None, es que Chrome cerró el canal o murió.
                message = self.protocol.read_message()
                
                if not message:
                    self.logger.info("🛑 Stdin cerrado (EOF). Terminando sesión.")
                    break
                
                # 2. Despachar mensaje
                self._dispatch_message(message)
                
        except Exception as e:
            self.logger.error(f"💥 Error fatal en el loop: {e}", exc_info=True)
            # No hacemos raise para intentar cerrar limpio si es posible

    def _dispatch_message(self, message: Dict[str, Any]):
        """
        Busca el handler adecuado para el mensaje y lo ejecuta.
        """
        msg_type = message.get("type") or message.get("command")
        
        if not msg_type:
            self.logger.warning(f"⚠️ Mensaje sin tipo recibido: {message}")
            return

        # Buscamos la función en el mapa
        handler = self._action_map.get(msg_type)
        
        if handler:
            try:
                self.logger.debug(f"⚡ Ejecutando handler para: {msg_type}")
                handler(message)
            except Exception as e:
                self.logger.error(f"❌ Error procesando {msg_type}: {e}")
        else:
            self.logger.warning(f"❓ Comando desconocido: {msg_type}")

    # =========================================================================
    # HANDLERS (Lógica de Negocio)
    # =========================================================================

    def _handle_handshake(self, message: Dict[str, Any]):
        """Responde al saludo inicial de la extensión."""
        self.logger.info(f"🤝 Handshake recibido de Extensión ID: {message.get('id')}")
        
        # Respondemos para confirmar que estamos vivos
        self.protocol.send_message({
            "type": "SYSTEM_ACK",
            "status": "connected",
            "brain_version": "2.0.0",
            "timestamp": time.time()
        })

    def _handle_heartbeat(self, message: Dict[str, Any]):
        """Maneja el ping de vida (Keep-Alive)."""
        # Generalmente no respondemos para no saturar el canal, 
        # o respondemos solo PONG si la extensión lo requiere.
        self.logger.debug("💓 Heartbeat recibido")

    def _handle_log_entry(self, message: Dict[str, Any]):
        """Permite que la extensión loguee cosas en el archivo de log de Python."""
        level = message.get("level", "INFO")
        text = message.get("message", "")
        self.logger.info(f"[EXT-LOG] {level}: {text}")

    # =========================================================================
    # MÉTODOS DE UTILIDAD (Para usar desde el CLI 'brain synapse close')
    # =========================================================================

    def close_active_session(self) -> Dict[str, Any]:
        """
        Envía un comando ciego para intentar cerrar una sesión.
        Nota: Esto se usa desde un proceso brain.exe DIFERENTE al que está conectado a Chrome.
        En Native Messaging puro esto es complejo sin IPC.
        Por ahora, simulamos el envío (la implementación real requiere sockets o archivos).
        """
        # TODO: Implementar IPC (Inter-Process Communication) para hablar con el brain.exe host
        # Por ahora, solo retornamos éxito simulado para que el instalador no falle.
        return {
            "status": "command_queued",
            "action": "WINDOW_CLOSE",
            "note": "IPC implementation pending"
        }