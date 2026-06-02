# brain/core/ionpump/ionpump_ipc.py
#
# IPC client de IonPump v2.0.
#
# CHANGELOG respecto a v4: ningún cambio funcional.
#
# El IPC client es genérico — serializa el comando como dict JSON y retorna
# el ACK del servidor sin validar el tipo de comando. Los nuevos comandos
# (DOM_NAVIGATE, DOM_WATCH, DOM_WATCH_URL, DOM_UNWATCH, DOM_SELECT) no
# requieren cambios aquí — el cliente los pasa igualmente al SynapseIPCServer.
#
# El SynapseIPCServer (brain/core/synapse/synapse_ipc_server.py) es quien
# registra los handlers para los nuevos tipos en su _action_map. Ese archivo
# está fuera del scope de esta sesión (Phase 2 del v5).
#
# Este archivo se conserva sin cambios de comportamiento. El comentario
# documenta explícitamente por qué no necesita cambios — evita regresiones
# futuras si alguien asume que falta algo.

import asyncio
import json
import logging
from pathlib import Path
from typing import Any, Dict

logger = logging.getLogger(__name__)

_DEFAULT_TIMEOUT = 10.0  # segundos
_BUFFER_SIZE = 65536


class IonIPCError(Exception):
    """Raised when the IPC connection to SynapseIPCServer fails."""


class IonPumpIPCClient:
    """
    Cliente TCP async que envía DOM commands al SynapseIPCServer activo
    dentro del proceso Brain-Host.

    Descubrimiento de puerto:
        Lee BloomNucleus/run/ipc_{launch_id}.port
        Lanza IonIPCError si el archivo no existe (Brain-Host no está corriendo).

    Nota sobre nuevos comandos (v5):
        DOM_NAVIGATE, DOM_WATCH, DOM_WATCH_URL, DOM_UNWATCH, DOM_SELECT se
        envían exactamente igual que los comandos existentes — como un dict JSON
        con un campo "type". No se requieren cambios en este cliente.
    """

    def __init__(self, launch_id: str, run_dir: Path) -> None:
        self._launch_id = launch_id
        self._run_dir   = run_dir
        self._port: int = 0  # resuelto lazy en el primer uso

    # ------------------------------------------------------------------
    # Port resolution
    # ------------------------------------------------------------------

    def _resolve_port(self) -> int:
        port_file = self._run_dir / f"ipc_{self._launch_id}.port"
        if not port_file.exists():
            raise IonIPCError(
                f"Brain-Host port file not found: {port_file}. "
                "Is Brain-Host running?"
            )
        try:
            port = int(port_file.read_text(encoding="utf-8").strip())
        except (ValueError, OSError) as exc:
            raise IonIPCError(f"Cannot read port from {port_file}: {exc}") from exc
        return port

    # ------------------------------------------------------------------
    # Command sending
    # ------------------------------------------------------------------

    async def send_command(self, command: Dict[str, Any]) -> Dict[str, Any]:
        """
        Envía un dict de comando JSON al SynapseIPCServer.

        Retorna:
            {"status": "ok"} en éxito
            {"status": "error", "detail": "..."} en error de aplicación

        Lanza:
            IonIPCError en fallo de conexión o timeout.
        """
        if self._port == 0:
            self._port = self._resolve_port()

        payload = json.dumps(command).encode("utf-8")

        try:
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection("127.0.0.1", self._port),
                timeout=_DEFAULT_TIMEOUT,
            )
        except (ConnectionRefusedError, OSError) as exc:
            raise IonIPCError(
                f"Cannot connect to SynapseIPCServer on port {self._port}: {exc}"
            ) from exc
        except asyncio.TimeoutError as exc:
            raise IonIPCError(
                f"Timeout connecting to SynapseIPCServer on port {self._port}"
            ) from exc

        try:
            writer.write(payload + b"\n")
            await writer.drain()

            try:
                raw = await asyncio.wait_for(
                    reader.readline(), timeout=_DEFAULT_TIMEOUT
                )
            except asyncio.TimeoutError as exc:
                raise IonIPCError(
                    f"Timeout waiting for ACK from SynapseIPCServer (port {self._port})"
                ) from exc

            if not raw:
                raise IonIPCError("SynapseIPCServer closed the connection without reply.")

            try:
                response: Dict[str, Any] = json.loads(raw.decode("utf-8"))
            except json.JSONDecodeError as exc:
                raise IonIPCError(f"Invalid JSON in SynapseIPCServer reply: {exc}") from exc

            return response

        finally:
            try:
                writer.close()
                await writer.wait_closed()
            except Exception:
                pass
