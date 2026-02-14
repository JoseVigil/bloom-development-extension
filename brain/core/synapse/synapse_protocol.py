"""
Manejo de bajo nivel del protocolo Native Messaging de Chrome.
Lee y escribe mensajes JSON con prefijo de longitud binaria (4 bytes).
"""

import sys
import json
import struct
import logging
from typing import Optional, Dict, Any, Callable
from .synapse_exceptions import SynapseConnectionError
from .handlers.api_key_handler import register_handler

class SynapseProtocol:
    """
    Encapsula la lectura/escritura binaria de stdin/stdout
    siguiendo el estándar de Google Chrome Native Messaging.
    """

    def __init__(self):
        self.logger = logging.getLogger("brain.core.synapse.protocol")
        self._event_handlers: Dict[str, Callable] = {}
        
        # Registrar handler de API keys
        self.api_key_handler = register_handler(self)

    def read_message(self) -> Optional[Dict[str, Any]]:
        """
        Lee un mensaje de stdin. Bloqueante.
        Retorna None si el canal se cierra (Chrome se desconecta).
        """
        try:
            # 1. Leer los primeros 4 bytes (longitud del mensaje)
            text_length_bytes = sys.stdin.buffer.read(4)

            if not text_length_bytes:
                self.logger.info("Stdin cerrado. Chrome se desconectó.")
                return None

            # 2. Desempaquetar longitud (Little Endian integer)
            text_length = struct.unpack('i', text_length_bytes)[0]

            # 3. Leer el contenido JSON exacto
            text = sys.stdin.buffer.read(text_length).decode('utf-8')
            
            return json.loads(text)

        except Exception as e:
            self.logger.error(f"Error leyendo protocolo: {e}")
            return None

    def send_message(self, message: Dict[str, Any]) -> None:
        """
        Envía un mensaje JSON a stdout.
        """
        try:
            json_msg = json.dumps(message)
            encoded_msg = json_msg.encode('utf-8')
            
            # 1. Escribir longitud (4 bytes)
            sys.stdout.buffer.write(struct.pack('I', len(encoded_msg)))
            
            # 2. Escribir contenido
            sys.stdout.buffer.write(encoded_msg)
            
            # 3. Flush vital
            sys.stdout.buffer.flush()
            
        except Exception as e:
            self.logger.error(f"Error enviando protocolo: {e}")
            raise SynapseConnectionError(f"Fallo al enviar mensaje: {e}")
    
    def register_event_handler(self, event_name: str, handler_fn: Callable) -> None:
        """
        Register custom event handler.
        
        Args:
            event_name: Name of the event to handle
            handler_fn: Callback function to execute when event is received
        """
        self._event_handlers[event_name] = handler_fn
    
    def handle_message(self, message: Dict[str, Any]) -> None:
        """
        Handle incoming message and route to appropriate handler.
        
        Args:
            message: The incoming message dictionary
        """
        msg_type = message.get('type')
        event = message.get('event')
        
        # Check custom event handlers
        if event and event in self._event_handlers:
            self._event_handlers[event](message)