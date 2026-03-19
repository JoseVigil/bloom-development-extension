#!/usr/bin/env python3
"""
hooks/profile_disconnected/00_notify_temporal.py

Event: profile_disconnected
Notifica al workflow de Temporal que Chrome se desconectó,
enviando la señal SHUTDOWN para resetear el estado a SEEDED
y permitir que el perfil sea relanzado sin "already running" error.

Contrato de entrada (stdin): HookContext JSON
  {
    "launch_id":    "",
    "profile_id":   "8aafd714-9034-4f27-833a-8452259aef65",
    "log_base_dir": "C:\\Users\\...\\BloomNucleus\\logs",
    "nucleus_bin":  "C:\\...\\BloomNucleus\\bin\\nucleus\\nucleus.exe"
  }

Contrato de salida (stdout): HookResult JSON
  {
    "hook":    "00_notify_temporal.py",
    "success": true,
    "stdout":  "shutdown signal sent to profile 8aafd714",
    "stderr":  "",
    "error":   ""
  }
"""

import json
import subprocess
import sys

HOOK_NAME = "00_notify_temporal.py"
SUBPROCESS_TIMEOUT = 30  # segundos


def main():
    # 1. Leer HookContext desde stdin
    try:
        raw = sys.stdin.read()
        ctx = json.loads(raw) if raw.strip() else {}
    except Exception as e:
        _fail(f"failed to parse HookContext from stdin: {e}")
        return

    # 2. Validar campos requeridos
    profile_id = ctx.get("profile_id", "").strip()
    if not profile_id:
        _fail("profile_id is required in HookContext but was empty")
        return

    nucleus_bin = ctx.get("nucleus_bin", "") or "nucleus"

    # 3. Ejecutar: nucleus --json synapse shutdown <profile_id>
    cmd = [nucleus_bin, "--json", "synapse", "shutdown", profile_id]
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=SUBPROCESS_TIMEOUT,
        )
    except subprocess.TimeoutExpired:
        _fail(
            f"nucleus synapse shutdown timed out after {SUBPROCESS_TIMEOUT}s",
            stderr=f"cmd: {' '.join(cmd)}",
        )
        return
    except FileNotFoundError:
        _fail(
            f"nucleus binary not found at: {nucleus_bin}",
            stderr=f"cmd: {' '.join(cmd)}",
        )
        return
    except Exception as e:
        _fail(str(e), stderr=f"cmd: {' '.join(cmd)}")
        return

    stdout_raw = result.stdout.strip()
    stderr_raw = result.stderr.strip()

    # 4. Parsear respuesta JSON de nucleus
    # nucleus --json siempre emite un JSON en stdout; buscamos la primera línea con '{'
    nucleus_response = None
    for line in stdout_raw.splitlines():
        line = line.strip()
        if line.startswith("{"):
            try:
                nucleus_response = json.loads(line)
                break
            except json.JSONDecodeError:
                continue

    # Si nucleus no retornó JSON válido, considerar éxito parcial si exit code 0
    if nucleus_response is None:
        if result.returncode == 0:
            _success(
                stdout=f"shutdown signal sent to profile {profile_id[:8]} (no JSON response)",
                stderr=stderr_raw,
            )
        else:
            _fail(
                f"nucleus exited with code {result.returncode} and no JSON output",
                stdout=stdout_raw,
                stderr=stderr_raw,
            )
        return

    # 5. Verificar que nucleus reportó éxito
    if not nucleus_response.get("success", False):
        error_msg = nucleus_response.get("error", "nucleus reported failure without error message")
        _fail(error_msg, stdout=stdout_raw, stderr=stderr_raw)
        return

    # 6. Éxito
    _success(
        stdout=f"shutdown signal sent to profile {profile_id[:8]}",
        stderr=stderr_raw,
    )


def _success(stdout: str = "", stderr: str = "") -> None:
    print(json.dumps({
        "hook":    HOOK_NAME,
        "success": True,
        "stdout":  stdout,
        "stderr":  stderr,
        "error":   "",
    }))


def _fail(error: str, stdout: str = "", stderr: str = "") -> None:
    print(json.dumps({
        "hook":    HOOK_NAME,
        "success": False,
        "stdout":  stdout,
        "stderr":  stderr,
        "error":   error,
    }))


if __name__ == "__main__":
    main()