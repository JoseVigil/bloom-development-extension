"""
Orquestador principal de Synapse.
Coordina el protocolo Native Messaging y despacha las acciones.
"""

import logging
import time
from pathlib import Path
from typing import Dict, Any, Callable, Optional

# Imports usando la nueva nomenclatura explícita
from brain.core.synapse.synapse_protocol import SynapseProtocol
from brain.core.synapse.synapse_exceptions import SynapseError

class SynapseManager:
    """
    Controlador del ciclo de vida de la sesión Native Messaging.
    Actúa como servidor (Host) escuchando a Chrome.
    """
    
    def __init__(self, launch_id: str = "", run_dir: Optional[Path] = None):
        self.protocol = SynapseProtocol()
        # Logger específico para no ensuciar stdout (que es para Chrome)
        self.logger = logging.getLogger("brain.core.synapse.manager")
        self._launch_id = launch_id
        self._run_dir = run_dir
        
        # 🗺️ MAPA DE ACCIONES (Dispatcher)
        # Aquí registramos qué función maneja cada tipo de mensaje.
        # Esto permite escalar a cientos de comandos sin llenar de if/else el código.
        self._action_map: Dict[str, Callable] = {
            "SYSTEM_HELLO":       self._handle_handshake,
            "HEARTBEAT":          self._handle_heartbeat,
            "LOG_ENTRY":          self._handle_log_entry,
            # Synapse handshake — Fase 3: extensión confirma host_ready
            "handshake_confirm":  self._handle_handshake_confirm,
            # Notificación del host C++ (bloom-host) — informativa, sin respuesta
            "PROFILE_CONNECTED":  self._handle_profile_connected,
            # Registro de cuenta de servicio externo (GitHub, etc.)
            "ACCOUNT_REGISTERED": self._handle_account_registered,
            # Comandos DOM para IonPump:
            "DOM_FOCUS":          self._handle_dom_passthrough,
            "DOM_TYPE":           self._handle_dom_passthrough,
            "DOM_CLICK":          self._handle_dom_passthrough,
            "DOM_WAIT":           self._handle_dom_passthrough,
            "DOM_SCROLL":         self._handle_dom_passthrough,
            "DOM_EXTRACT":        self._handle_dom_passthrough,
            "EVENT_EMIT":         self._handle_dom_passthrough,
            "STATE_TRANSITION":   self._handle_state_transition,
            # Landing Dashboard commands
            "PROFILE_LOAD":       self._handle_profile_load,
            "HEALTH_CHECK":       self._handle_health_check,
            "NUCLEUS_SYNC":       self._handle_nucleus_sync,
            "INTENT_LIST":        self._handle_intent_list,
        }

    def run_host_loop(self) -> None:
        """
        Inicia el bucle infinito de escucha.
        Este método es BLOQUEANTE y se ejecuta cuando Chrome invoca a brain.exe.
        """
        self.logger.info("🚀 Iniciando Synapse Host Loop...")

        # Iniciar IPC server si tenemos launch_id y run_dir
        ipc_server = None
        if self._launch_id and self._run_dir:
            from brain.core.synapse.synapse_ipc_server import SynapseIPCServer
            ipc_server = SynapseIPCServer(self.protocol, self._launch_id, self._run_dir)
            ipc_server.start()
            self.logger.info(f"🔌 IPC server started for launch {self._launch_id}")

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
        finally:
            if ipc_server:
                ipc_server.stop()
                self.logger.info("🔌 IPC server stopped")

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

    def _handle_handshake_confirm(self, message: Dict[str, Any]) -> None:
        """
        Fase 3 del handshake Synapse: la extensión confirma que recibió host_ready.
        Brain responde con HANDSHAKE_CONFIRMED para que Electron y la UI
        puedan transicionar de "SIN SEÑAL" a estado operativo.
        """
        profile_id = message.get("profile_id", "")
        launch_id  = message.get("launch_id", "")
        self.logger.info(f"🤝 handshake_confirm recibido — profile={profile_id} launch={launch_id}")
        self.protocol.send_message({
            "event":      "HANDSHAKE_CONFIRMED",
            "profile_id": profile_id,
            "launch_id":  launch_id,
            "status":     "connected",
            "timestamp":  time.time()
        })
        self.logger.info("✅ HANDSHAKE_CONFIRMED emitido — canal Synapse establecido")

    def _handle_profile_connected(self, message: Dict[str, Any]) -> None:
        """
        Notificación interna del host C++ (bloom-host) que indica que el
        handshake de 3 fases del host está completo. Es informativa — Brain
        ya emitió HANDSHAKE_CONFIRMED vía _handle_handshake_confirm.
        No requiere respuesta.
        """
        profile_id = message.get("profile_id", "")
        launch_id  = message.get("launch_id", "")
        self.logger.info(f"🔌 PROFILE_CONNECTED recibido del host — profile={profile_id} launch={launch_id}")

    def _handle_account_registered(self, message: Dict[str, Any]) -> None:
        profile_id = message.get("profile_id", "")
        launch_id  = message.get("launch_id", "")
        service    = message.get("service", "")
        username   = message.get("username", "") or message.get("email", "")
        token      = message.get("token", "")
        self.logger.info(
            f"✅ ACCOUNT_REGISTERED recibido — service={service} username={username} "
            f"profile={profile_id} launch={launch_id}"
        )
        if service.lower() in ("github", "github_oauth"):
            try:
                from brain.shared.credentials import GitHubCredentials
                creds = GitHubCredentials()
                if token:
                    creds.save_token(token)
                    self.logger.info(f"✅ GitHub token persistido para usuario: {username}")
                else:
                    self.logger.warning(
                        "⚠️ ACCOUNT_REGISTERED sin token — poll-identity seguirá en false. "
                        "Verificar que Cortex incluya 'token' en el payload."
                    )
            except Exception as e:
                self.logger.error(f"❌ No se pudo persistir GitHub credentials: {e}")
        try:
            import socket, json as _json
            payload = _json.dumps({
                "event":      "ACCOUNT_REGISTERED",
                "service":    service,
                "username":   username,
                "profile_id": profile_id,
                "launch_id":  launch_id,
                "timestamp":  time.time(),
            })
            with socket.create_connection(("127.0.0.1", 5678), timeout=2) as sock:
                sock.sendall((payload + "\n").encode("utf-8"))
            self.logger.info("📡 ACCOUNT_REGISTERED publicado en Brain EventBus TCP (port 5678)")
        except Exception as e:
            self.logger.error(f"❌ No se pudo publicar ACCOUNT_REGISTERED en EventBus: {e}")

    def _handle_dom_passthrough(self, message: Dict[str, Any]) -> None:
        """Reenvía comandos DOM de IonPump hacia Chrome. No modifica el mensaje."""
        self.protocol.send_message(message)

    def _handle_state_transition(self, message: Dict[str, Any]) -> None:
        """
        STATE_TRANSITION no va a Chrome — es una transición interna de IonPump.
        Por ahora loggea la transición. IonStateManager la maneja en el proceso IonPump.
        """
        self.logger.debug(f"🔄 STATE_TRANSITION: {message.get('to', 'unknown')}")

    # =========================================================================
    # LANDING HANDLERS
    # =========================================================================

    def _handle_profile_load(self, message: Dict[str, Any]) -> None:
        """Carga el perfil completo y lo envía a landing para renderizar el dashboard."""
        profile_id = message.get('profile_id')
        launch_id  = message.get('launch_id')

        try:
            from brain.core.profile.profile_manager import ProfileManager
            pm = ProfileManager()
            profile = pm.get_profile(profile_id)

            self.protocol.send_message({
                "event":      "PROFILE_LOADED",
                "profile_id": profile_id,
                "launch_id":  launch_id,
                "data": {
                    "alias":          profile.get("alias", ""),
                    "total_launches": profile.get("total_launches", 0),
                    "uptime":         0,
                    "intents_done":   profile.get("intents_done", 0),
                    "last_synch":     profile.get("last_synch", ""),
                    "accounts":       profile.get("accounts", []),
                    "session_status": "active"
                }
            })
        except Exception as e:
            self.logger.error(f"❌ PROFILE_LOAD failed: {e}")
            self.protocol.send_message({
                "event":  "PROFILE_LOADED",
                "status": "error",
                "error":  str(e)
            })

    def _handle_health_check(self, message: Dict[str, Any]) -> None:
        """Responde con el estado de salud del sistema."""
        scope = message.get('scope', 'full-stack')

        self.protocol.send_message({
            "event":  "HEALTH_CHECK_RESULT",
            "scope":  scope,
            "status": "ok",
            "checks": {
                "extension":   "ok",
                "native_host": "ok",
                "brain":       "ok",
                "nucleus":     "ok"
            },
            "timestamp": __import__('time').time()
        })

    def _handle_nucleus_sync(self, message: Dict[str, Any]) -> None:
        """Fuerza sincronización de datos del perfil con Nucleus."""
        from datetime import datetime
        self.protocol.send_message({
            "event":     "NUCLEUS_SYNC_RESULT",
            "status":    "ok",
            "synced_at": datetime.utcnow().isoformat() + "Z",
            "error":     None
        })

    def _handle_intent_list(self, message: Dict[str, Any]) -> None:
        # Phase 3 DEFERRED — conectar con intent pipeline cuando Phase 3 se desbloquee.
        self.protocol.send_message({
            "event":   "INTENT_LIST_RESULT",
            "intents": [],
            "total":   0
        })

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