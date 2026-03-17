#!/usr/bin/env python3
"""
hooks/system_health/00_health_check.py

Ejecuta nucleus health, evalúa el estado del sistema,
intenta fix automático si hay degradación, y loguea todo.

Contrato de entrada (stdin): HookContext JSON
  {"launch_id": "", "profile_id": "", "log_base_dir": "...", "nucleus_bin": "..."}

Contrato de salida (stdout): HookResult JSON extendido
  {
    "hook":    "00_health_check.py",
    "success": true,
    "stdout":  "{\"health_state\":\"HEALTHY\",\"fix_attempted\":false,...}",
    "stderr":  ""
  }

El campo stdout contiene un JSON string con la metadata extendida que
la Activity Go parsea para exponer health_state, fix_attempted, etc.
en el resultado del workflow (visible en Temporal UI).
"""

import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def get_log_path(log_base_dir: str) -> Path:
    date_str = datetime.now().strftime("%Y%m%d")
    log_dir = Path(log_base_dir) / "nucleus" / "system_health"
    log_dir.mkdir(parents=True, exist_ok=True)
    return log_dir / f"nucleus_system_health_{date_str}.log"


def register_telemetry(nucleus_bin: str, log_path: Path) -> None:
    """
    Registra el stream en telemetry.json via nucleus telemetry register.

    Campos según BLOOM_NUCLEUS_LOGGING_SPEC:
      - stream_id : nucleus_system_health (snake_case, estable)
      - priority  : 1 (Critical — monitoreo de infraestructura)
      - category  : nucleus
      - source    : nucleus (nucleus.exe escribe el log via este hook)
    """
    try:
        subprocess.run(
            [
                nucleus_bin, "telemetry", "register",
                "--stream",      "nucleus_system_health",
                "--label",       "🏥 SYSTEM HEALTH",
                "--path",        str(log_path).replace("\\", "/"),
                "--priority",    "1",
                "--category",    "nucleus",
                "--source",      "nucleus",
                "--description", (
                    "System health monitor log — periodic health checks, "
                    "degradation events and auto-fix attempts"
                ),
            ],
            capture_output=True,
            timeout=10,
        )
    except Exception:
        pass  # telemetry register es best-effort


def write_log(log_path: Path, level: str, message: str) -> None:
    ts = utc_now()
    line = f"[{ts}] {level:<7} {message}\n"
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(line)


def run_nucleus_health(nucleus_bin: str, fix: bool = False) -> dict:
    """
    Ejecuta `nucleus --json health [--fix]` y retorna el JSON parseado.

    En caso de error (timeout, binario no encontrado, JSON inválido)
    retorna un dict con state=FAILED para que el hook lo trate correctamente.
    """
    cmd = [nucleus_bin, "--json", "health"]
    if fix:
        cmd.append("--fix")
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=15,
        )
        return json.loads(result.stdout)
    except json.JSONDecodeError as e:
        return {
            "success": False,
            "state": "FAILED",
            "error": f"invalid JSON from nucleus health: {e}",
        }
    except Exception as e:
        return {
            "success": False,
            "state": "FAILED",
            "error": str(e),
        }


def main():
    # 0. Leer HookContext desde stdin
    try:
        raw = sys.stdin.read()
        hctx = json.loads(raw) if raw.strip() else {}
    except Exception:
        hctx = {}

    log_base_dir = hctx.get("log_base_dir", "")
    nucleus_bin  = hctx.get("nucleus_bin", "nucleus")

    # Resolver log_base_dir si no viene en el contexto
    if not log_base_dir:
        local_appdata = os.environ.get("LOCALAPPDATA", "")
        log_base_dir = (
            str(Path(local_appdata) / "BloomNucleus" / "logs")
            if local_appdata
            else "logs"
        )

    log_path = get_log_path(log_base_dir)
    register_telemetry(nucleus_bin, log_path)

    write_log(log_path, "INFO", "=== System health check started ===")

    # 1. Ejecutar health check inicial
    health = run_nucleus_health(nucleus_bin, fix=False)
    state  = health.get("state", "UNKNOWN")

    write_log(log_path, "INFO", f"Health state: {state}")

    # Loguear componentes no saludables
    components_summary: dict[str, str] = {}
    for name, comp in health.get("components", {}).items():
        comp_state = comp.get("state", "UNKNOWN")
        components_summary[name] = comp_state
        if not comp.get("healthy", True):
            error = comp.get("error", "")
            write_log(log_path, "WARN", f"  {name}: {comp_state} — {error}")

    fix_attempted = False
    fix_applied   = False

    # 2. Si está degradado o fallido, intentar fix automático
    if state in ("DEGRADED", "FAILED"):
        write_log(log_path, "WARN", f"System {state} — attempting auto-fix")
        fix_attempted = True

        health_fixed = run_nucleus_health(nucleus_bin, fix=True)
        state_after  = health_fixed.get("state", "UNKNOWN")

        if state_after == "HEALTHY":
            fix_applied = True
            write_log(log_path, "INFO", f"Fix successful — system now {state_after}")
        else:
            write_log(log_path, "ERROR", f"Fix attempted but system still {state_after}")

        # Actualizar summary de componentes con estado post-fix
        for name, comp in health_fixed.get("components", {}).items():
            components_summary[name] = comp.get("state", "UNKNOWN")

    write_log(log_path, "INFO", "=== Health check completed ===")

    # 3. Construir metadata extendida para la Activity Go
    #    Este JSON se pasa como string en HookResult.Stdout y es parseado
    #    por RunSystemHealthActivity para exponer los campos en Temporal UI.
    metadata = {
        "health_state":  state,
        "fix_attempted": fix_attempted,
        "fix_applied":   fix_applied,
        "components":    components_summary,
        "timestamp":     utc_now(),
    }

    # 4. Devolver HookResult JSON a stdout (primera línea que empiece con '{')
    hook_result = {
        "hook":    "00_health_check.py",
        "success": True,
        "stdout":  json.dumps(metadata),
        "stderr":  "",
    }
    print(json.dumps(hook_result))


if __name__ == "__main__":
    main()