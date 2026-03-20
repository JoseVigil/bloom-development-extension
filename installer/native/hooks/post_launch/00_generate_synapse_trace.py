#!/usr/bin/env python3
"""
Hook: 00_generate_synapse_trace
Event: post_launch
Espera que los engine logs de Chrome existan en disco y ejecuta
'nucleus logs synapse' para consolidarlos en un synapse trace.

Trigger: {launch_id}_debug.log + {launch_id}_netlog.json
"""
import sys
import json
import subprocess
import pathlib
import time
from datetime import datetime, timezone
from pathlib import Path

EVENT_NAME = "post_launch"


def get_log_path(log_base_dir: str) -> Path:
    date_str = datetime.now().strftime("%Y%m%d")
    log_dir = Path(log_base_dir) / "nucleus" / "hooks" / "post_launch"
    log_dir.mkdir(parents=True, exist_ok=True)
    return log_dir / f"nucleus_post_launch_{date_str}.log"


def register_telemetry(nucleus_bin: str, log_path: Path) -> None:
    try:
        subprocess.run(
            [
                nucleus_bin, "telemetry", "register",
                "--stream",      "nucleus_hook_post_launch",
                "--label",       "POST LAUNCH HOOK",
                "--path",        str(log_path).replace("\\", "/"),
                "--priority",    "2",
                "--category",    "nucleus",
                "--source",      "nucleus",
                "--description", "post_launch hook log — synapse trace generation after Chrome profile launch",
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


def wait_for_chrome_logs(log_base_dir: str, launch_id: str, timeout: int = 30, interval: int = 2) -> bool:
    """
    Espera que los logs reales de Chrome, Cortex y Host del launch existan en disco.
    Retorna True en cuanto todos los archivos requeridos están presentes,
    False si se agota el timeout.

    Archivos esperados:
      - {launch_id}_debug.log        (Sentinel/Chrome engine)
      - {launch_id}_netlog.json      (Chrome net-log)
      - cortex_extension_*.log       (Cortex extension — generado por Brain)
      - host_*.log                   (bloom-host — generado por Brain)
    """
    base = pathlib.Path(log_base_dir)
    deadline = time.time() + timeout
    while time.time() < deadline:
        debug_logs   = list(base.rglob(f"{launch_id}_debug.log"))
        netlog_logs  = list(base.rglob(f"{launch_id}_netlog.json"))
        cortex_logs  = list(base.rglob("cortex_extension_*.log"))
        host_logs    = list(base.rglob("host_*.log"))
        if debug_logs and netlog_logs and cortex_logs and host_logs:
            return True
        time.sleep(interval)
    return False


def main():
    raw = sys.stdin.read()
    try:
        ctx = json.loads(raw)
    except json.JSONDecodeError as e:
        print(json.dumps({
            "hook":    "00_generate_synapse_trace",
            "success": False,
            "error":   f"invalid context JSON: {e}",
        }))
        sys.exit(1)

    launch_id    = ctx.get("launch_id", "")
    log_base_dir = ctx.get("log_base_dir", "")
    nucleus_bin  = ctx.get("nucleus_bin", "nucleus")

    if not launch_id:
        print(json.dumps({
            "hook":    "00_generate_synapse_trace",
            "success": False,
            "error":   "launch_id missing from context",
        }))
        sys.exit(1)

    if not log_base_dir:
        print(json.dumps({
            "hook":    "00_generate_synapse_trace",
            "success": False,
            "error":   "log_base_dir missing from context",
        }))
        sys.exit(1)

    log_path = get_log_path(log_base_dir)
    register_telemetry(nucleus_bin, log_path)
    write_log(log_path, "INFO", "=== post_launch hook started ===")

    found = wait_for_chrome_logs(log_base_dir, launch_id)
    if not found:
        base = pathlib.Path(log_base_dir)
        missing = []
        if not list(base.rglob(f"{launch_id}_debug.log")):
            missing.append(f"{launch_id}_debug.log")
        if not list(base.rglob(f"{launch_id}_netlog.json")):
            missing.append(f"{launch_id}_netlog.json")
        if not list(base.rglob("cortex_extension_*.log")):
            missing.append("cortex_extension_*.log")
        if not list(base.rglob("host_*.log")):
            missing.append("host_*.log")
        sys.stderr.write(
            f"[warn] Timeout esperando logs para {launch_id} "
            f"en {log_base_dir} — archivos no encontrados: {', '.join(missing)} "
            f"— ejecutando nucleus de todas formas\n"
        )
        write_log(log_path, "WARN", f"Timeout waiting for Chrome logs for {launch_id} — proceeding anyway. Missing: {', '.join(missing)}")
    else:
        write_log(log_path, "INFO", f"Chrome logs found for {launch_id} — proceeding with synapse trace")

    result = subprocess.run(
        [nucleus_bin, "--json", "logs", "synapse"],
        capture_output=True,
        text=True,
    )

    if result.returncode == 0:
        write_log(log_path, "INFO", "nucleus logs synapse completed successfully")
    else:
        write_log(log_path, "ERROR", f"nucleus logs synapse failed (exit {result.returncode}): {result.stderr.strip()}")

    write_log(log_path, "INFO", "=== post_launch hook completed ===")

    print(json.dumps({
        "hook":    "00_generate_synapse_trace",
        "success": result.returncode == 0,
        "stdout":  result.stdout.strip(),
        "stderr":  result.stderr.strip(),
    }))
    sys.exit(result.returncode)


if __name__ == "__main__":
    main()