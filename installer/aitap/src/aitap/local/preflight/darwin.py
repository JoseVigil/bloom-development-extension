"""Recolector macOS: llamadas nativas via ctypes, sin procesos externos.

Nunca lanza ``sysctl``, ``vm_stat``, ``launchctl`` ni ``lsof`` (leccion del
laboratorio: abrir procesos desde un proceso con PyTorch produce avisos y
contamina la medicion). Cada sonda falla a ``None`` sin romper el resultado.
"""
from __future__ import annotations

import ctypes
import ctypes.util
import platform
import plistlib
import struct
from pathlib import Path
from typing import Any

from aitap.local.preflight.common import companion_present, normalize_arch
from aitap.local.preflight.macho import read_minos

LAUNCH_AGENT_LABEL = "com.bloom.ollama"
PRESSURE_LEVELS = {1: "normal", 2: "warn", 4: "critical"}

_libc = None


def _lib():
    global _libc
    if _libc is None:
        _libc = ctypes.CDLL(ctypes.util.find_library("c"), use_errno=True)
    return _libc


def _sysctl_raw(name: str) -> bytes | None:
    try:
        libc = _lib()
        size = ctypes.c_size_t(0)
        if libc.sysctlbyname(name.encode(), None, ctypes.byref(size), None, ctypes.c_size_t(0)) != 0:
            return None
        buffer = ctypes.create_string_buffer(size.value)
        if libc.sysctlbyname(name.encode(), buffer, ctypes.byref(size), None, ctypes.c_size_t(0)) != 0:
            return None
        return buffer.raw[: size.value]
    except (OSError, AttributeError, TypeError):
        return None


def _sysctl_int(name: str) -> int | None:
    raw = _sysctl_raw(name)
    if raw is None:
        return None
    if len(raw) == 8:
        return struct.unpack("<q", raw)[0]
    if len(raw) == 4:
        return struct.unpack("<i", raw)[0]
    return None


def _sysctl_str(name: str) -> str | None:
    raw = _sysctl_raw(name)
    return raw.split(b"\x00", 1)[0].decode("utf-8", "replace") if raw else None


def _cpu_features() -> list[str]:
    tokens = set((_sysctl_str("machdep.cpu.features") or "").upper().split())
    tokens |= set((_sysctl_str("machdep.cpu.leaf7_features") or "").upper().split())
    return sorted(flag for flag in ("AVX2", "FMA", "F16C") if flag in tokens)


def _launch_agent(home: Path) -> dict[str, Any]:
    path = home / "Library" / "LaunchAgents" / f"{LAUNCH_AGENT_LABEL}.plist"
    try:
        with path.open("rb") as stream:
            document = plistlib.load(stream)
    except (OSError, plistlib.InvalidFileException, ValueError):
        return {"defined": False, "env": {}}
    env = document.get("EnvironmentVariables") or {}
    return {"defined": True, "env": {k: str(v) for k, v in env.items() if k in {"OLLAMA_MODELS", "OLLAMA_HOST"}}}


def collect(base: Path, home: Path | None = None) -> dict[str, Any]:
    home = home or Path.home()
    machine = normalize_arch(platform.machine())
    translated = _sysctl_int("sysctl.proc_translated") == 1
    arch = "arm64" if (translated or _sysctl_int("hw.optional.arm64") == 1) else machine
    os_version = _sysctl_str("kern.osproductversion") or platform.mac_ver()[0] or None
    memsize = _sysctl_int("hw.memsize")
    binary = base / "bin" / "ollama" / "ollama"
    minos_by_arch = read_minos(binary) if binary.exists() else {}
    agent = _launch_agent(home)
    swap_raw = _sysctl_raw("vm.swapusage")
    swap_used = None
    if swap_raw and len(swap_raw) >= 24:
        _total, _avail, used = struct.unpack_from("<QQQ", swap_raw, 0)
        swap_used = int(used // (1024 * 1024))
    pressure = _sysctl_int("kern.memorystatus_vm_pressure_level")
    stable = {
        "os": "darwin",
        "os_version": os_version,
        "arch": arch,
        "cpu_features": _cpu_features() if arch == "x86_64" else [],
        "ram_total_mb": int(memsize // (1024 * 1024)) if memsize else None,
        "ollama": {
            "service_kind": "launchd",
            "service_defined": agent["defined"],
            "binary_present": binary.exists(),
            "binary_minos": minos_by_arch.get(arch),
            "companion_present": companion_present(binary),
            "models_dir_effective": agent["env"].get("OLLAMA_MODELS"),
        },
    }
    readiness = {
        "free_memory_pct": _sysctl_int("kern.memorystatus_level"),
        "swap_used_mb": swap_used,
        "memory_pressure": PRESSURE_LEVELS.get(pressure) if pressure is not None else None,
        "heavy_processes": None,
        "heavy_processes_note": "no recolectado en macOS en esta version (requiere libproc)",
        "rosetta_translated": translated,
    }
    return {"stable": stable, "readiness": readiness, "ollama_host": agent["env"].get("OLLAMA_HOST")}
