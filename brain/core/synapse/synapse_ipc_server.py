# brain/core/synapse/synapse_ipc_server.py

import json
import logging
import socket
import threading
from pathlib import Path
from typing import Any, Dict, Set

logger = logging.getLogger(__name__)

# Commands that IonPump can send through this server to Chrome
_KNOWN_DOM_COMMANDS: Set[str] = {
    "DOM_WAIT",
    "DOM_CLICK",
    "DOM_TYPE",
    "DOM_FOCUS",
    "DOM_SCROLL",
    "DOM_EXTRACT",
    "EVENT_EMIT",
    "STATE_TRANSITION",
}

_READ_BUFFER = 65536


class SynapseIPCServer:
    """
    TCP IPC server that runs inside the Brain-Host process.

    Lifecycle:
    - Created by SynapseManager at the start of run_host_loop().
    - Binds to 127.0.0.1 on an ephemeral port — NEVER on 0.0.0.0.
    - Writes the port to BloomNucleus/run/ipc_{launch_id}.port.
    - Runs on a daemon thread — dies when the host process dies.
    - Deletes the port file on shutdown (try/finally guaranteed).

    Protocol (line-delimited JSON over TCP):
        Client → Server: JSON object ending with '\\n'
        Server → Client: JSON ACK ending with '\\n'
    """

    def __init__(self, protocol: Any, launch_id: str, run_dir: Path) -> None:
        """
        Args:
            protocol:   SynapseProtocol instance with a send_message() method.
            launch_id:  Unique identifier for this Brain-Host invocation.
            run_dir:    Directory where the port file is written
                        (BloomNucleus/run/).
        """
        self._protocol = protocol
        self._launch_id = launch_id
        self._run_dir = run_dir

        self._server_sock: socket.socket | None = None
        self._port: int = 0
        self._port_file: Path | None = None
        self._running = False
        self._thread: threading.Thread | None = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def start(self) -> int:
        """
        Bind to 127.0.0.1 on an ephemeral port, write the port file,
        and start the listener thread (daemon=True).

        Returns:
            The bound port number.
        """
        # Ensure the run directory exists
        self._run_dir.mkdir(parents=True, exist_ok=True)

        # Create and bind the server socket — localhost ONLY
        self._server_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self._server_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self._server_sock.bind(("127.0.0.1", 0))  # port=0 → OS assigns ephemeral
        self._server_sock.listen(16)
        self._server_sock.settimeout(1.0)  # allows graceful shutdown polling

        _, self._port = self._server_sock.getsockname()

        # Write the port file so IonPumpIPCClient can discover us
        self._port_file = self._run_dir / f"ipc_{self._launch_id}.port"
        self._port_file.write_text(str(self._port), encoding="utf-8")
        logger.info(
            "SynapseIPCServer: listening on 127.0.0.1:%d (launch_id=%s)",
            self._port,
            self._launch_id,
        )

        # Start daemon listener thread
        self._running = True
        self._thread = threading.Thread(
            target=self._serve_forever,
            name=f"SynapseIPCServer-{self._launch_id}",
            daemon=True,
        )
        self._thread.start()

        return self._port

    def stop(self) -> None:
        """
        Signal the listener to stop and clean up the port file.
        The port file is always deleted — even if an exception occurs.
        """
        self._running = False

        try:
            if self._server_sock is not None:
                try:
                    self._server_sock.close()
                except OSError:
                    pass
                self._server_sock = None

            if self._thread is not None and self._thread.is_alive():
                self._thread.join(timeout=5)
                self._thread = None

            logger.info(
                "SynapseIPCServer: stopped (launch_id=%s)", self._launch_id
            )
        finally:
            # Guaranteed cleanup of port file
            if self._port_file is not None and self._port_file.exists():
                try:
                    self._port_file.unlink()
                    logger.debug(
                        "SynapseIPCServer: removed port file %s", self._port_file
                    )
                except OSError as exc:
                    logger.warning(
                        "SynapseIPCServer: could not remove port file %s — %s",
                        self._port_file,
                        exc,
                    )

    # ------------------------------------------------------------------
    # Listener loop
    # ------------------------------------------------------------------

    def _serve_forever(self) -> None:
        """Main accept loop running in the daemon thread."""
        while self._running:
            try:
                conn, addr = self._server_sock.accept()
            except socket.timeout:
                continue  # allows _running flag to be checked
            except OSError:
                # Socket was closed (stop() called)
                break

            # Handle each connection in its own thread so one slow
            # client doesn't block others.
            handler = threading.Thread(
                target=self._handle_connection,
                args=(conn,),
                daemon=True,
            )
            handler.start()

    # ------------------------------------------------------------------
    # Connection handler
    # ------------------------------------------------------------------

    def _handle_connection(self, conn: socket.socket) -> None:
        """
        Read a newline-terminated JSON command, dispatch it, send ACK.
        """
        try:
            with conn:
                conn.settimeout(10.0)
                data = b""
                while b"\n" not in data:
                    chunk = conn.recv(_READ_BUFFER)
                    if not chunk:
                        return  # connection closed before full message
                    data += chunk

                # Take only up to the first newline
                line, _ = data.split(b"\n", 1)
                try:
                    command: Dict[str, Any] = json.loads(line.decode("utf-8"))
                except (json.JSONDecodeError, UnicodeDecodeError) as exc:
                    ack = {"status": "error", "detail": f"Invalid JSON: {exc}"}
                    conn.sendall((json.dumps(ack) + "\n").encode("utf-8"))
                    return

                ack = self._dispatch_ion_command(command)
                conn.sendall((json.dumps(ack) + "\n").encode("utf-8"))

        except socket.timeout:
            logger.warning("SynapseIPCServer: connection timed out")
        except OSError as exc:
            logger.debug("SynapseIPCServer: connection error — %s", exc)

    # ------------------------------------------------------------------
    # Dispatch
    # ------------------------------------------------------------------

    def _dispatch_ion_command(self, command: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validate the command type and forward to the SynapseProtocol.

        Returns:
            {"status": "ok"} on success
            {"status": "error", "detail": "..."} on failure
        """
        cmd_type = command.get("type")
        if cmd_type not in _KNOWN_DOM_COMMANDS:
            detail = (
                f"Unknown command type: '{cmd_type}'. "
                f"Expected one of: {sorted(_KNOWN_DOM_COMMANDS)}"
            )
            logger.warning("SynapseIPCServer: %s", detail)
            return {"status": "error", "detail": detail}

        try:
            self._protocol.send_message(command)
            return {"status": "ok"}
        except Exception as exc:
            logger.error(
                "SynapseIPCServer: protocol.send_message raised: %s", exc
            )
            return {"status": "error", "detail": str(exc)}
