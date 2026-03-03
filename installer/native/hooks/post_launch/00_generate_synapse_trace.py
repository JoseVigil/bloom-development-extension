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


def wait_for_chrome_logs(log_base_dir: str, launch_id: str, timeout: int = 30, interval: int = 2) -> bool:
    """
    Espera que los logs reales de Chrome del launch existan en disco.
    Retorna True en cuanto ambos archivos están presentes, False si se agota el timeout.
    """
    base = pathlib.Path(log_base_dir)
    deadline = time.time() + timeout
    while time.time() < deadline:
        debug_logs  = list(base.rglob(f"{launch_id}_debug.log"))
        netlog_logs = list(base.rglob(f"{launch_id}_netlog.json"))
        if debug_logs and netlog_logs:
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

    found = wait_for_chrome_logs(log_base_dir, launch_id)
    if not found:
        sys.stderr.write(
            f"[warn] Timeout esperando logs de Chrome para {launch_id} "
            f"en {log_base_dir} — ejecutando nucleus de todas formas\n"
        )

    result = subprocess.run(
        [nucleus_bin, "logs", "synapse"],
        capture_output=True,
        text=True,
    )

    print(json.dumps({
        "hook":    "00_generate_synapse_trace",
        "success": result.returncode == 0,
        "stdout":  result.stdout.strip(),
        "stderr":  result.stderr.strip(),
    }))
    sys.exit(result.returncode)


if __name__ == "__main__":
    main()