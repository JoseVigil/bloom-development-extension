"""
session1_launcher.py — Lanza un proceso en la sesión interactiva del usuario (Session 1)
directamente desde un proceso SYSTEM (Session 0), sin intermediarios.

Por qué funciona desde Brain directamente:
    Brain.exe corre como servicio Windows con cuenta LocalSystem (SYSTEM).
    SYSTEM tiene SeTcbPrivilege implícito, que es el único requisito para
    llamar WTSQueryUserToken. No se necesita ningún proceso intermediario.
    El error anterior (bloom-launcher) ocurría porque ese exe era lanzado
    via subprocess.Popen desde Brain — heredaba el token de Brain pero
    *no* los privilegios de SYSTEM, que no se propagan así en Windows.

    La solución correcta es hacer la llamada WTS directamente desde Brain,
    que ya tiene el token de SYSTEM con todos sus privilegios intactos.

API Win32 utilizada:
    WTSGetActiveConsoleSessionId  → ID de la sesión interactiva
    WTSQueryUserToken             → Token del usuario en esa sesión
    DuplicateTokenEx              → Convertir a token primario
    CreateEnvironmentBlock        → Bloque de entorno del usuario
    CreateProcessAsUserW          → Lanzar proceso en Session 1

Dependencias: solo ctypes (stdlib) — sin pywin32, sin Go, sin pipes.
"""

import ctypes
import ctypes.wintypes as wt
import os
import subprocess
from pathlib import Path
from typing import List

from brain.shared.logger import get_logger

logger = get_logger("brain.profile.session1_launcher")

# ---------------------------------------------------------------------------
# Win32 constantes
# ---------------------------------------------------------------------------
TOKEN_PRIMARY        = 1
SECURITY_IMPERSONATION = 2
MAXIMUM_ALLOWED      = 0x02000000

CREATE_UNICODE_ENVIRONMENT = 0x00000400
CREATE_NEW_PROCESS_GROUP   = 0x00000200
DETACHED_PROCESS           = 0x00000008

WTS_NO_SESSION = 0xFFFFFFFF

# ---------------------------------------------------------------------------
# Win32 estructuras
# ---------------------------------------------------------------------------

class STARTUPINFOW(ctypes.Structure):
    _fields_ = [
        ("cb",              wt.DWORD),
        ("lpReserved",      wt.LPWSTR),
        ("lpDesktop",       wt.LPWSTR),
        ("lpTitle",         wt.LPWSTR),
        ("dwX",             wt.DWORD),
        ("dwY",             wt.DWORD),
        ("dwXSize",         wt.DWORD),
        ("dwYSize",         wt.DWORD),
        ("dwXCountChars",   wt.DWORD),
        ("dwYCountChars",   wt.DWORD),
        ("dwFillAttribute", wt.DWORD),
        ("dwFlags",         wt.DWORD),
        ("wShowWindow",     wt.WORD),
        ("cbReserved2",     wt.WORD),
        ("lpReserved2",     ctypes.POINTER(wt.BYTE)),
        ("hStdInput",       wt.HANDLE),
        ("hStdOutput",      wt.HANDLE),
        ("hStdError",       wt.HANDLE),
    ]


class PROCESS_INFORMATION(ctypes.Structure):
    _fields_ = [
        ("hProcess",    wt.HANDLE),
        ("hThread",     wt.HANDLE),
        ("dwProcessId", wt.DWORD),
        ("dwThreadId",  wt.DWORD),
    ]


# ---------------------------------------------------------------------------
# DLLs y funciones
# ---------------------------------------------------------------------------

_kernel32  = ctypes.WinDLL("kernel32",  use_last_error=True)
_advapi32  = ctypes.WinDLL("advapi32",  use_last_error=True)
_userenv   = ctypes.WinDLL("userenv",   use_last_error=True)
_wtsapi32  = ctypes.WinDLL("wtsapi32",  use_last_error=True)

# WTSGetActiveConsoleSessionId
_WTSGetActiveConsoleSessionId = _kernel32.WTSGetActiveConsoleSessionId
_WTSGetActiveConsoleSessionId.restype  = wt.DWORD
_WTSGetActiveConsoleSessionId.argtypes = []

# WTSQueryUserToken
_WTSQueryUserToken = _wtsapi32.WTSQueryUserToken
_WTSQueryUserToken.restype  = wt.BOOL
_WTSQueryUserToken.argtypes = [wt.DWORD, ctypes.POINTER(wt.HANDLE)]

# DuplicateTokenEx
_DuplicateTokenEx = _advapi32.DuplicateTokenEx
_DuplicateTokenEx.restype  = wt.BOOL
_DuplicateTokenEx.argtypes = [
    wt.HANDLE,          # hExistingToken
    wt.DWORD,           # dwDesiredAccess
    ctypes.c_void_p,    # lpTokenAttributes (NULL)
    ctypes.c_int,       # ImpersonationLevel
    ctypes.c_int,       # TokenType
    ctypes.POINTER(wt.HANDLE),  # phNewToken
]

# CreateEnvironmentBlock
_CreateEnvironmentBlock = _userenv.CreateEnvironmentBlock
_CreateEnvironmentBlock.restype  = wt.BOOL
_CreateEnvironmentBlock.argtypes = [
    ctypes.POINTER(ctypes.c_void_p),  # lpEnvironment [OUT]
    wt.HANDLE,                         # hToken
    wt.BOOL,                           # bInherit
]

# DestroyEnvironmentBlock
_DestroyEnvironmentBlock = _userenv.DestroyEnvironmentBlock
_DestroyEnvironmentBlock.restype  = wt.BOOL
_DestroyEnvironmentBlock.argtypes = [ctypes.c_void_p]

# CreateProcessAsUserW
_CreateProcessAsUserW = _advapi32.CreateProcessAsUserW
_CreateProcessAsUserW.restype  = wt.BOOL
_CreateProcessAsUserW.argtypes = [
    wt.HANDLE,           # hToken
    wt.LPCWSTR,          # lpApplicationName
    wt.LPWSTR,           # lpCommandLine (mutable)
    ctypes.c_void_p,     # lpProcessAttributes
    ctypes.c_void_p,     # lpThreadAttributes
    wt.BOOL,             # bInheritHandles
    wt.DWORD,            # dwCreationFlags
    ctypes.c_void_p,     # lpEnvironment
    wt.LPCWSTR,          # lpCurrentDirectory
    ctypes.POINTER(STARTUPINFOW),        # lpStartupInfo
    ctypes.POINTER(PROCESS_INFORMATION), # lpProcessInformation
]

# CloseHandle
_CloseHandle = _kernel32.CloseHandle
_CloseHandle.restype  = wt.BOOL
_CloseHandle.argtypes = [wt.HANDLE]


# ---------------------------------------------------------------------------
# Función pública
# ---------------------------------------------------------------------------

def launch_in_user_session(args: List[str]) -> int:
    """
    Lanza el proceso indicado en la sesión interactiva del usuario (Session 1).

    Debe llamarse desde un proceso con token SYSTEM (SeTcbPrivilege).
    Brain.exe como servicio Windows cumple este requisito.

    Args:
        args: Lista de argumentos. args[0] es el ejecutable (ruta completa).

    Returns:
        PID del proceso creado.

    Raises:
        OSError:    Si alguna llamada Win32 falla (incluye código de error Win32).
        ValueError: Si args está vacío o no hay sesión interactiva activa.
    """
    if not args:
        raise ValueError("args no puede estar vacío")

    # 1. Sesión interactiva activa (consola física del usuario)
    session_id = _WTSGetActiveConsoleSessionId()
    if session_id == WTS_NO_SESSION:
        raise ValueError(
            "No hay sesión de usuario interactiva activa. "
            "El sistema puede estar en modo headless o la sesión no está iniciada."
        )
    logger.debug(f"  Session ID activa: {session_id}")

    # 2. Token del usuario en esa sesión — requiere SeTcbPrivilege (SYSTEM lo tiene)
    user_token = wt.HANDLE()
    ok = _WTSQueryUserToken(session_id, ctypes.byref(user_token))
    if not ok:
        err = ctypes.get_last_error()
        raise OSError(err, f"WTSQueryUserToken(session={session_id}) falló", hex(err))
    logger.debug(f"  WTSQueryUserToken: OK (token={user_token.value})")

    try:
        # 3. Duplicar como token primario (CreateProcessAsUser lo requiere)
        primary_token = wt.HANDLE()
        ok = _DuplicateTokenEx(
            user_token,
            MAXIMUM_ALLOWED,
            None,
            SECURITY_IMPERSONATION,
            TOKEN_PRIMARY,
            ctypes.byref(primary_token),
        )
        if not ok:
            err = ctypes.get_last_error()
            raise OSError(err, "DuplicateTokenEx falló", hex(err))
        logger.debug(f"  DuplicateTokenEx: OK (primary_token={primary_token.value})")

        try:
            # 4. Bloque de entorno del usuario (USERPROFILE, APPDATA, TEMP, etc.)
            env_block = ctypes.c_void_p()
            ok = _CreateEnvironmentBlock(
                ctypes.byref(env_block),
                primary_token,
                False,
            )
            if not ok:
                err = ctypes.get_last_error()
                raise OSError(err, "CreateEnvironmentBlock falló", hex(err))
            logger.debug(f"  CreateEnvironmentBlock: OK")

            try:
                # 5. Command line en buffer mutable (Windows lo requiere así)
                cmd_line = _build_command_line(args)
                cmd_buf  = ctypes.create_unicode_buffer(cmd_line)

                # 6. STARTUPINFOW con desktop interactivo del usuario
                si = STARTUPINFOW()
                si.cb        = ctypes.sizeof(STARTUPINFOW)
                si.lpDesktop = "winsta0\\default"

                pi = PROCESS_INFORMATION()

                creation_flags = (
                    CREATE_UNICODE_ENVIRONMENT |
                    DETACHED_PROCESS           |
                    CREATE_NEW_PROCESS_GROUP
                )

                logger.debug(f"  CreateProcessAsUserW: exe={args[0]!r}")
                ok = _CreateProcessAsUserW(
                    primary_token,           # token del usuario interactivo
                    args[0],                 # lpApplicationName
                    cmd_buf,                 # lpCommandLine (mutable)
                    None,                    # lpProcessAttributes
                    None,                    # lpThreadAttributes
                    False,                   # bInheritHandles
                    creation_flags,
                    env_block,               # entorno del usuario
                    None,                    # lpCurrentDirectory (hereda)
                    ctypes.byref(si),
                    ctypes.byref(pi),
                )
                if not ok:
                    err = ctypes.get_last_error()
                    raise OSError(err, f"CreateProcessAsUserW falló", hex(err))

                pid = pi.dwProcessId
                logger.debug(f"  CreateProcessAsUserW: OK (PID={pid})")

                # Cerrar handles — Brain no monitorea el proceso de Chrome
                _CloseHandle(pi.hProcess)
                _CloseHandle(pi.hThread)

                return pid

            finally:
                _DestroyEnvironmentBlock(env_block)

        finally:
            _CloseHandle(primary_token)

    finally:
        _CloseHandle(user_token)


# ---------------------------------------------------------------------------
# Helper: command line correctamente escapada para Windows
# ---------------------------------------------------------------------------

def _build_command_line(args: List[str]) -> str:
    """
    Construye la command line con escapado correcto para CommandLineToArgvW
    (reglas de Raymond Chen: backslashes antes de comillas se doblan).
    """
    parts = []
    for arg in args:
        if not arg or any(c in arg for c in (' ', '\t', '\n', '"')):
            # Necesita comillas
            escaped = []
            slashes = 0
            for ch in arg:
                if ch == '\\':
                    slashes += 1
                elif ch == '"':
                    escaped.append('\\' * (slashes * 2) + '\\"')
                    slashes = 0
                else:
                    escaped.append('\\' * slashes + ch)
                    slashes = 0
            escaped.append('\\' * (slashes * 2))
            parts.append('"' + ''.join(escaped) + '"')
        else:
            parts.append(arg)
    return ' '.join(parts)