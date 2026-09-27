"""Recolector Linux: lectura de /proc, /etc y la unit de usuario. Sin procesos externos."""
from __future__ import annotations

import os
import platform
import shlex
from pathlib import Path
from typing import Any

from aitap.local.preflight.common import companion_present, normalize_arch

UNIT_NAME = "com.bloom.ollama.service"


def _read(path: str | Path) -> str | None:
    try:
        return Path(path).read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None


def _meminfo(text: str | None) -> dict[str, int]:
    values: dict[str, int] = {}
    for line in (text or "").splitlines():
        key, _, rest = line.partition(":")
        parts = rest.split()
        if parts and parts[0].isdigit():
            values[key.strip()] = int(parts[0])  # kB
    return values


def _os_release(text: str | None) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in (text or "").splitlines():
        key, sep, value = line.partition("=")
        if sep:
            values[key.strip()] = value.strip().strip('"')
    return values


def _cpu_features(text: str | None) -> list[str]:
    for line in (text or "").splitlines():
        if line.startswith("flags"):
            flags = set(line.partition(":")[2].split())
            return sorted(name for name, flag in (("AVX2", "avx2"), ("FMA", "fma"), ("F16C", "f16c")) if flag in flags)
    return []


def _pressure(text: str | None) -> str | None:
    for line in (text or "").splitlines():
        if line.startswith("some"):
            for token in line.split():
                if token.startswith("avg10="):
                    try:
                        value = float(token[6:])
                    except ValueError:
                        return None
                    return "critical" if value >= 40 else "warn" if value >= 10 else "normal"
    return None


def _unit(home: Path) -> dict[str, Any]:
    config_home = Path(os.environ.get("XDG_CONFIG_HOME", str(home / ".config")))
    text = _read(config_home / "systemd" / "user" / UNIT_NAME)
    if text is None:
        return {"defined": False, "env": {}}
    env: dict[str, str] = {}
    for line in text.splitlines():
        if line.strip().startswith("Environment="):
            try:
                assignments = shlex.split(line.strip()[len("Environment="):])
            except ValueError:
                continue
            for item in assignments:
                key, sep, value = item.partition("=")
                if sep and key in {"OLLAMA_MODELS", "OLLAMA_HOST"}:
                    env[key] = value
    return {"defined": True, "env": env}


def _heavy_processes(limit: int = 8) -> list[dict[str, Any]]:
    rows = []
    try:
        entries = [p for p in os.listdir("/proc") if p.isdigit()]
    except OSError:
        return []
    for pid in entries:
        status = _read(f"/proc/{pid}/status")
        if not status:
            continue
        name, rss = None, None
        for line in status.splitlines():
            if line.startswith("Name:"):
                name = line.split(":", 1)[1].strip()
            elif line.startswith("VmRSS:"):
                parts = line.split()
                rss = int(parts[1]) // 1024 if len(parts) > 1 and parts[1].isdigit() else None
        if name and rss:
            rows.append({"name": name, "rss_mb": rss})
    return sorted(rows, key=lambda r: r["rss_mb"], reverse=True)[:limit]


def collect(base: Path, home: Path | None = None) -> dict[str, Any]:
    home = home or Path.home()
    mem = _meminfo(_read("/proc/meminfo"))
    release = _os_release(_read("/etc/os-release"))
    binary = base / "bin" / "ollama" / "ollama"
    unit = _unit(home)
    total_kb, available_kb = mem.get("MemTotal"), mem.get("MemAvailable")
    swap_used = None
    if "SwapTotal" in mem and "SwapFree" in mem:
        swap_used = (mem["SwapTotal"] - mem["SwapFree"]) // 1024
    stable = {
        "os": "linux",
        "os_version": release.get("VERSION_ID") or platform.release() or None,
        "arch": normalize_arch(platform.machine()),
        "cpu_features": _cpu_features(_read("/proc/cpuinfo")),
        "ram_total_mb": total_kb // 1024 if total_kb else None,
        "ollama": {
            "service_kind": "systemd_user",
            "service_defined": unit["defined"],
            "binary_present": binary.exists(),
            "binary_minos": None,
            "companion_present": companion_present(binary),
            "models_dir_effective": unit["env"].get("OLLAMA_MODELS"),
        },
    }
    readiness = {
        "free_memory_pct": int(available_kb * 100 // total_kb) if total_kb and available_kb is not None else None,
        "swap_used_mb": swap_used,
        "memory_pressure": _pressure(_read("/proc/pressure/memory")),
        "heavy_processes": _heavy_processes(),
        "heavy_processes_note": None,
        "distribution": release.get("ID"),
    }
    return {"stable": stable, "readiness": readiness, "ollama_host": unit["env"].get("OLLAMA_HOST")}
