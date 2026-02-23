#!/usr/bin/env python3
"""
Hook: 00_generate_synapse_trace
Event: post_launch
Espera que los engine logs de Chrome existen en disco y ejecuta
'nucleus logs synapse' para consolidarlos en un synapse trace.
"""
import sys
import json
import subprocess
import pathlib
import time


def wait_for_chrome_logs(log_base_dir: str, launch_id: str, timeout: int = 120, interval: int = 5) -> bool:
    base = pathlib.Path(log_base_dir)
    deadline = time.time() + timeout
    while time.time() < deadline:
        matches = list(base.rglob(f"*{launch_id}_engine_mining.log"))
        if matches:
            parent = matches[0].parent
            if (parent / f"{launch_id}_engine_read.log").exists() and \
               (parent / f"{launch_id}_engine_network.log").exists():
                return True
        time.sleep(interval)
    return False


def main():
    raw = sys.stdin.read()
    ctx = json.loads(raw)

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

    found = wait_for_chrome_logs(log_base_dir, launch_id)
    if not found:
        sys.stderr.write(f"[warn] Timeout esperando logs de Chrome para {launch_id}\n")

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