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
from datetime import datetime, timezone
from pathlib import Path

HOOK_NAME = "00_notify_temporal.py"
SUBPROCESS_TIMEOUT = 30  # segundos

EVENT_NAME = "profile_disconnected"


def get_log_path(log_base_dir: str) -> Path:
    date_str = datetime.now().strftime("%Y%m%d")
    log_dir = Path(log_base_dir) / "nucleus" / "hooks" / "profile_disconnected"
    log_dir.mkdir(parents=True, exist_ok=True)
    return log_dir / f"nucleus_profile_disconnected_{date_str}.log"


def register_telemetry(nucleus_bin: str, log_path: Path) -> None:
    try:
        subprocess.run(
            [
                nucleus_bin, "telemetry", "register",
                "--stream",      "nucleus_hook_profile_disconnected",
                "--label",       "PROFILE DISCONNECTED HOOK",
                "--path",        str(log_path).replace("\\", "/"),
                "--priority",    "2",
                "--category",    "nucleus",
                "--source",      "nucleus",
                "--description", "profile_disconnected hook log — Temporal shutdown signal dispatch on Chrome disconnect",
            ],
            capture_output=True,
            timeout=10,
        )
    except Exception:
        pass


def write_log(log_path: Path, level: str, message: str) -> None:
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(f"[{ts}] {level:<7} {message}\n")


def main():
    # 1. Leer HookContext desde stdin
    try:
        raw = sys.stdin.read()
        ctx = json.loads(raw) if raw.strip() else {}
    except Exception as e:
        _fail(f"failed to parse HookContext from stdin: {e}")
        return

    profile_id   = ctx.get("profile_id", "").strip()
    nucleus_bin  = ctx.get("nucleus_bin", "") or "nucleus"
    log_base_dir = ctx.get("log_base_dir", "")

    # 2. Inicializar logging — antes de cualquier validación
    #    Si log_base_dir está vacío, usar fallback temporal
    effective_log_dir = log_base_dir if log_base_dir else "logs"
    log_path = get_log_path(effective_log_dir)
    register_telemetry(nucleus_bin, log_path)
    write_log(log_path, "INFO", "=== profile_disconnected hook started ===")

    # 3. Validar campos requeridos
    if not profile_id:
        write_log(log_path, "ERROR", "profile_id is required but was empty")
        _fail("profile_id is required in HookContext but was empty")
        return

    write_log(log_path, "INFO", f"Sending shutdown signal to profile {profile_id[:8]}")

    # 4. Ejecutar: nucleus --json synapse shutdown <profile_id>
    cmd = [nucleus_bin, "--json", "synapse", "shutdown", profile_id]
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=SUBPROCESS_TIMEOUT,
        )
    except subprocess.TimeoutExpired:
        msg = f"nucleus synapse shutdown timed out after {SUBPROCESS_TIMEOUT}s"
        write_log(log_path, "ERROR", msg)
        write_log(log_path, "INFO", "=== profile_disconnected hook completed ===")
        _fail(msg, stderr=f"cmd: {' '.join(cmd)}")
        return
    except FileNotFoundError:
        msg = f"nucleus binary not found at: {nucleus_bin}"
        write_log(log_path, "ERROR", msg)
        write_log(log_path, "INFO", "=== profile_disconnected hook completed ===")
        _fail(msg, stderr=f"cmd: {' '.join(cmd)}")
        return
    except Exception as e:
        write_log(log_path, "ERROR", str(e))
        write_log(log_path, "INFO", "=== profile_disconnected hook completed ===")
        _fail(str(e), stderr=f"cmd: {' '.join(cmd)}")
        return

    stdout_raw = result.stdout.strip()
    stderr_raw = result.stderr.strip()

    # 5. Parsear respuesta JSON de nucleus
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
            write_log(log_path, "WARN", "Shutdown signal sent but nucleus returned no JSON (exit 0)")
            write_log(log_path, "INFO", "=== profile_disconnected hook completed ===")
            _success(
                stdout=f"shutdown signal sent to profile {profile_id[:8]} (no JSON response)",
                stderr=stderr_raw,
            )
        else:
            msg = f"nucleus exited with code {result.returncode} and no JSON output"
            write_log(log_path, "ERROR", msg)
            write_log(log_path, "INFO", "=== profile_disconnected hook completed ===")
            _fail(msg, stdout=stdout_raw, stderr=stderr_raw)
        return

    # 6. Verificar que nucleus reportó éxito
    if not nucleus_response.get("success", False):
        error_msg = nucleus_response.get("error", "nucleus reported failure without error message")
        write_log(log_path, "ERROR", f"Shutdown signal failed: {error_msg}")
        write_log(log_path, "INFO", "=== profile_disconnected hook completed ===")
        _fail(error_msg, stdout=stdout_raw, stderr=stderr_raw)
        return

    # 7. Éxito
    write_log(log_path, "INFO", f"Shutdown signal sent successfully to profile {profile_id[:8]}")
    write_log(log_path, "INFO", "=== profile_disconnected hook completed ===")
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