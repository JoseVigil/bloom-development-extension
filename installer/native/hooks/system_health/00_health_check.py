#!/usr/bin/env python3
"""
hooks/system_health/00_health_check.py

Ejecuta nucleus health, evalua el estado del sistema,
intenta fix automatico si hay degradacion, y loguea todo.

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


# Componentes que el hook puede remediar automaticamente en produccion.
# Tienen un mecanismo de restart conocido (bootstrap, nssm, ollama serve, npm run dev, etc.)
FIXABLE_COMPONENTS = {
    "control_plane",   # restart-bootstrap
    "worker",          # worker start
    "brain_service",   # nssm BloomBrainService
    "ollama",          # ollama serve
    "svelte_dev",      # npm run dev -- gestionado por supervisor via nucleus health --fix
    "temporal",        # nucleus temporal ensure -- CRÍTICO: debe corregirse antes que worker
}

# Componentes non-critical que NO deben disparar el auto-fix.
# bloom_api, governance, vault: aliases o capas que nucleus no puede fixear directamente.
SKIP_FIX = {"bloom_api", "governance", "vault"}

# Timeout para nucleus health sin --fix (chequeo rapido de puertos, <3s por diseno)
HEALTH_CHECK_TIMEOUT_S = 15

# Timeout para nucleus health --fix: svelte_dev necesita hasta 30s para que
# Vite compile TypeScript en el primer arranque. Los demas fixes (nssm, worker)
# toman <10s. 45s da margen suficiente sin bloquear Temporal indefinidamente.
HEALTH_FIX_TIMEOUT_S = 45


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

    Campos segun BLOOM_NUCLEUS_LOGGING_SPEC:
      - stream_id : nucleus_system_health (snake_case, estable)
      - priority  : 1 (Critical -- monitoreo de infraestructura)
      - category  : nucleus
      - source    : nucleus (nucleus.exe escribe el log via este hook)
    """
    try:
        subprocess.run(
            [
                nucleus_bin, "telemetry", "register",
                "--stream",      "nucleus_system_health",
                "--label",       "SYSTEM HEALTH",
                "--path",        str(log_path).replace("\\", "/"),
                "--priority",    "1",
                "--category",    "nucleus",
                "--source",      "nucleus",
                "--description", (
                    "System health monitor log -- periodic health checks, "
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

    Usa HEALTH_FIX_TIMEOUT_S cuando fix=True para dar margen a svelte_dev
    (Vite puede tardar hasta 30s compilando en el primer arranque).

    En caso de error retorna un dict con state=FAILED.
    """
    cmd = [nucleus_bin, "--json", "health"]
    if fix:
        cmd.append("--fix")
    timeout = HEALTH_FIX_TIMEOUT_S if fix else HEALTH_CHECK_TIMEOUT_S
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return json.loads(result.stdout)
    except subprocess.TimeoutExpired:
        return {
            "success": False,
            "state": "FAILED",
            "error": f"nucleus health {'--fix ' if fix else ''}timed out after {timeout}s",
        }
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
            write_log(log_path, "WARN", f"  {name}: {comp_state} -- {error}")

    fix_attempted = False
    fix_applied   = False

    # 2. Solo intentar fix si hay componentes FIXABLE caidos.
    #    Componentes en SKIP_FIX (bloom_api, governance, vault) no tienen
    #    mecanismo de restart automatico -- nucleus --fix no puede ayudarlos.
    fixable_failures = [
        name for name, comp in health.get("components", {}).items()
        if not comp.get("healthy", True) and name in FIXABLE_COMPONENTS
    ]

    skipped_failures = [
        name for name, comp in health.get("components", {}).items()
        if not comp.get("healthy", True) and name in SKIP_FIX
    ]

    if skipped_failures:
        write_log(
            log_path, "INFO",
            f"Non-critical components unhealthy (fix skipped): {', '.join(skipped_failures)}"
        )

    if fixable_failures:
        write_log(
            log_path, "WARN",
            f"System {state} -- fixable components down: {', '.join(fixable_failures)} -- attempting auto-fix"
        )
        fix_attempted = True

        health_fixed = run_nucleus_health(nucleus_bin, fix=True)
        state_after  = health_fixed.get("state", "UNKNOWN")

        # Considerar el fix exitoso si el sistema mejoro a HEALTHY,
        # o si los componentes especificos que dispararon el fix ya estan sanos.
        if state_after == "HEALTHY":
            fix_applied = True
            write_log(log_path, "INFO", f"Fix successful -- system now {state_after}")
        else:
            fixed_components = [
                name for name in fixable_failures
                if health_fixed.get("components", {}).get(name, {}).get("healthy", False)
            ]
            still_broken = [n for n in fixable_failures if n not in fixed_components]

            if fixed_components and not still_broken:
                # Todos los componentes fixables se recuperaron; el sistema puede
                # seguir en DEGRADED por otros no-fixables -- eso es aceptable.
                fix_applied = True
                write_log(
                    log_path, "INFO",
                    f"Fix successful -- recovered: {', '.join(fixed_components)} "
                    f"(system state: {state_after})"
                )
            elif fixed_components:
                # Fix parcial: algunos mejoraron, otros no
                fix_applied = True
                write_log(
                    log_path, "WARN",
                    f"Fix partial -- recovered: {', '.join(fixed_components)}, "
                    f"still down: {', '.join(still_broken)} "
                    f"(system state: {state_after})"
                )
            else:
                write_log(
                    log_path, "ERROR",
                    f"Fix attempted but system still {state_after} -- "
                    f"components still down: {', '.join(fixable_failures)}"
                )

        # Actualizar summary de componentes con estado post-fix
        for name, comp in health_fixed.get("components", {}).items():
            components_summary[name] = comp.get("state", "UNKNOWN")

    write_log(log_path, "INFO", "=== Health check completed ===")

    # 3. Construir metadata extendida para la Activity Go
    metadata = {
        "health_state":  state,
        "fix_attempted": fix_attempted,
        "fix_applied":   fix_applied,
        "components":    components_summary,
        "timestamp":     utc_now(),
    }

    # 4. Devolver HookResult JSON a stdout
    hook_result = {
        "hook":    "00_health_check.py",
        "success": True,
        "stdout":  json.dumps(metadata),
        "stderr":  "",
    }
    print(json.dumps(hook_result))


if __name__ == "__main__":
    main()