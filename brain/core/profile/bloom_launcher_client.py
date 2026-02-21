"""
bloom_launcher_client.py — Cliente Python para bloom-launcher.exe

Permite a Brain (Session 0) delegar el lanzamiento de Chromium a
bloom-launcher.exe (Session 1) via named pipe, cruzando la barrera
de Session 0 isolation de Windows.

Ubicación destino: brain/core/profile/bloom_launcher_client.py

Dependencias:
    - pywin32 (win32file, win32pipe, pywintypes)
    - Instalar con: pip install pywin32

Protocolo:
    Request  → JSON line: {"request_id": str, "profile_id": str, "args": [str, ...]}
    Response ← JSON line: {"success": bool, "pid": int, "error": str | null}
"""

import json
import os
import subprocess
import time
import uuid
from pathlib import Path
from typing import List, Optional

from brain.shared.logger import get_logger

logger = get_logger("brain.profile.launcher_client")

PIPE_NAME = r"\\.\pipe\bloom-launcher"
CONNECT_TIMEOUT_MS = 5_000   # 5 s máximo para conectar
READ_TIMEOUT_MS    = 10_000  # 10 s máximo para respuesta del launcher
STARTUP_TIMEOUT_S  = 5       # 5 s para levantar el daemon si no corre
POLL_INTERVAL_S    = 0.25    # Intervalo de polling al esperar el daemon


class LauncherUnavailableError(Exception):
    """El daemon bloom-launcher no está disponible ni pudo levantarse."""


class LauncherClient:
    """
    Cliente para bloom-launcher.exe.

    Uso típico (en ProfileLauncher._execute_handoff):

        client = LauncherClient(base_dir)
        pid    = client.launch_chrome(args, profile_id)
    """

    def __init__(self, base_dir: Path):
        """
        Args:
            base_dir: Directorio raíz de Bloom Nucleus.
                      Se usa para localizar bloom-launcher.exe si necesita
                      auto-arrancarlo.
        """
        self.base_dir   = Path(base_dir)
        self._exe_path  = self._resolve_exe()

    # ------------------------------------------------------------------
    # API pública
    # ------------------------------------------------------------------

    def launch_chrome(self, args: List[str], profile_id: str) -> int:
        """
        Lanza Chromium via bloom-launcher y devuelve el PID del proceso.

        Args:
            args:       Lista completa de argumentos (args[0] = ejecutable).
            profile_id: ID del perfil (para logging).

        Returns:
            PID del proceso Chromium creado en Session 1.

        Raises:
            LauncherUnavailableError: Si el daemon no está disponible.
            RuntimeError:             Si el daemon reporta un error al lanzar.
        """
        # Asegurar que el daemon esté corriendo antes de conectar
        self._ensure_running()

        request_id = str(uuid.uuid4())
        payload    = json.dumps({
            "request_id": request_id,
            "profile_id": profile_id,
            "args":       args,
        })

        logger.debug(f"→ Enviando launch request (request_id={request_id[:8]}...)")
        response = self._send_request(payload)

        if not response.get("success"):
            error_msg = response.get("error", "unknown error from bloom-launcher")
            raise RuntimeError(f"bloom-launcher reportó error: {error_msg}")

        pid = response["pid"]
        logger.debug(f"← Recibida respuesta: pid={pid}")
        return pid

    # ------------------------------------------------------------------
    # Internals: disponibilidad del daemon
    # ------------------------------------------------------------------

    def _is_pipe_available(self) -> bool:
        """Devuelve True si el named pipe existe y acepta conexiones."""
        try:
            import win32pipe
            import pywintypes

            handle = win32pipe.WaitNamedPipe(PIPE_NAME, 1)  # 1 ms timeout
            # WaitNamedPipe no devuelve handle; si no lanza excepción → disponible
            return True
        except Exception:
            return False

    def _ensure_running(self) -> None:
        """
        Verifica que bloom-launcher esté activo.
        Si no lo está, intenta arrancarlo y espera hasta STARTUP_TIMEOUT_S.

        Raises:
            LauncherUnavailableError: Si no logra disponibilidad en el timeout.
        """
        if self._is_pipe_available():
            return

        logger.warning("⚠️  bloom-launcher no detectado — intentando arrancar...")

        if not self._exe_path or not self._exe_path.exists():
            raise LauncherUnavailableError(
                f"bloom-launcher.exe no encontrado en '{self._exe_path}'. "
                "Asegúrese de que el instalador lo haya desplegado."
            )

        try:
            # Arrancar daemon desacoplado (DETACHED_PROCESS + CREATE_NEW_PROCESS_GROUP)
            DETACHED = 0x00000008
            NEW_GRP  = 0x00000200
            subprocess.Popen(
                [str(self._exe_path), "serve"],
                creationflags=DETACHED | NEW_GRP,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                stdin=subprocess.DEVNULL,
                close_fds=True,
            )
            logger.info(f"🔄 bloom-launcher arrancado: {self._exe_path}")
        except Exception as exc:
            raise LauncherUnavailableError(
                f"No se pudo arrancar bloom-launcher.exe: {exc}"
            ) from exc

        # Esperar a que el pipe esté disponible
        deadline = time.monotonic() + STARTUP_TIMEOUT_S
        while time.monotonic() < deadline:
            time.sleep(POLL_INTERVAL_S)
            if self._is_pipe_available():
                logger.info("✅ bloom-launcher respondiendo en el pipe")
                return

        raise LauncherUnavailableError(
            f"bloom-launcher no respondió en {STARTUP_TIMEOUT_S}s tras el arranque. "
            "El usuario puede no tener sesión interactiva activa."
        )

    # ------------------------------------------------------------------
    # Internals: comunicación por named pipe
    # ------------------------------------------------------------------

    def _send_request(self, payload: str) -> dict:
        """
        Envía payload JSON al named pipe y devuelve la respuesta como dict.

        Raises:
            LauncherUnavailableError: Si no puede conectar al pipe.
            RuntimeError:             Si la respuesta no es JSON válido.
        """
        try:
            import win32file
            import win32pipe
            import pywintypes

            # Abrir el pipe en modo mensaje
            handle = win32file.CreateFile(
                PIPE_NAME,
                win32file.GENERIC_READ | win32file.GENERIC_WRITE,
                0,       # no compartir
                None,    # seguridad por defecto
                win32file.OPEN_EXISTING,
                0,
                None,
            )
        except Exception as exc:
            raise LauncherUnavailableError(
                f"No se pudo abrir el named pipe '{PIPE_NAME}': {exc}"
            ) from exc

        try:
            # Cambiar a modo mensaje para lecturas limpias
            win32pipe.SetNamedPipeHandleState(
                handle,
                win32pipe.PIPE_READMODE_MESSAGE,
                None,
                None,
            )

            # Enviar request (newline como delimitador de mensaje)
            message = (payload + "\n").encode("utf-8")
            win32file.WriteFile(handle, message)

            # Leer respuesta (hasta 64 KB)
            _err, data = win32file.ReadFile(handle, 65536)
            raw = data.decode("utf-8").strip()

        except Exception as exc:
            raise LauncherUnavailableError(
                f"Error en comunicación con bloom-launcher: {exc}"
            ) from exc
        finally:
            win32file.CloseHandle(handle)

        try:
            return json.loads(raw)
        except json.JSONDecodeError as exc:
            raise RuntimeError(
                f"Respuesta inválida de bloom-launcher (no JSON): {raw!r}"
            ) from exc

    # ------------------------------------------------------------------
    # Internals: resolución del ejecutable
    # ------------------------------------------------------------------

    def _resolve_exe(self) -> Optional[Path]:
        """
        Intenta localizar bloom-launcher.exe en ubicaciones conocidas.

        Orden de búsqueda:
        1. <base_dir>/bin/launcher/bloom-launcher.exe
        2. <base_dir>/launcher/bloom-launcher.exe
        3. <base_dir>/bloom-launcher.exe
        4. Variable de entorno BLOOM_LAUNCHER_EXE
        """
        candidates = [
            self.base_dir / "bin" / "launcher" / "bloom-launcher.exe",
            self.base_dir / "launcher" / "bloom-launcher.exe",
            self.base_dir / "bloom-launcher.exe",
        ]

        env_override = os.environ.get("BLOOM_LAUNCHER_EXE")
        if env_override:
            candidates.insert(0, Path(env_override))

        for candidate in candidates:
            if candidate.exists():
                logger.debug(f"bloom-launcher.exe encontrado: {candidate}")
                return candidate

        logger.warning(
            "⚠️  bloom-launcher.exe no encontrado en ubicaciones estándar. "
            f"Buscado en: {[str(c) for c in candidates]}"
        )
        return None