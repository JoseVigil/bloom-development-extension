# brain/core/ionpump/ionpump_ipc.py

import asyncio
import json
import logging
from pathlib import Path
from typing import Any, Dict

logger = logging.getLogger(__name__)

_DEFAULT_TIMEOUT = 10.0  # seconds
_BUFFER_SIZE = 65536


class IonIPCError(Exception):
    """Raised when the IPC connection to SynapseIPCServer fails."""


class IonPumpIPCClient:
    """
    Async TCP client that sends DOM commands to the active SynapseIPCServer
    running inside the Brain-Host process.

    Port discovery:
        Reads  BloomNucleus/run/ipc_{launch_id}.port
        Raises IonIPCError if that file does not exist (Brain-Host not running).
    """

    def __init__(self, launch_id: str, run_dir: Path) -> None:
        self._launch_id = launch_id
        self._run_dir = run_dir
        self._port: int = 0  # resolved lazily on first use

    # ------------------------------------------------------------------
    # Port resolution
    # ------------------------------------------------------------------

    def _resolve_port(self) -> int:
        """
        Read the ephemeral port from the run-dir port file.
        Raises IonIPCError if the file does not exist.
        """
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
        Send a JSON command dict to SynapseIPCServer.

        Returns:
            {"status": "ok"} on success
            {"status": "error", "detail": "..."} on application-level error

        Raises:
            IonIPCError on connection failure or timeout.
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
