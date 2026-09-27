"""Recolector Windows: Win32 via ctypes y registro en solo lectura. Sin procesos externos.

Sin evidencia real en Windows todavia (encargo §4.6): este recolector reporta
lo observable y el catalogo marca la plataforma como "a_medir".
"""
from __future__ import annotations

import ctypes
import platform
from pathlib import Path
from typing import Any

from aitap.local.preflight.common import companion_present, normalize_arch

SERVICE_NAME = "BloomOllamaService"
PF_AVX2_INSTRUCTIONS_AVAILABLE = 40


class _MemoryStatusEx(ctypes.Structure):
    _fields_ = [("dwLength", ctypes.c_ulong), ("dwMemoryLoad", ctypes.c_ulong),
                ("ullTotalPhys", ctypes.c_ulonglong), ("ullAvailPhys", ctypes.c_ulonglong),
                ("ullTotalPageFile", ctypes.c_ulonglong), ("ullAvailPageFile", ctypes.c_ulonglong),
                ("ullTotalVirtual", ctypes.c_ulonglong), ("ullAvailVirtual", ctypes.c_ulonglong),
                ("ullAvailExtendedVirtual", ctypes.c_ulonglong)]


def _memory() -> _MemoryStatusEx | None:
    try:
        status = _MemoryStatusEx()
        status.dwLength = ctypes.sizeof(_MemoryStatusEx)
        if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):  # type: ignore[attr-defined]
            return status
    except (AttributeError, OSError):
        pass
    return None


def _cpu_features() -> list[str]:
    try:
        present = ctypes.windll.kernel32.IsProcessorFeaturePresent(PF_AVX2_INSTRUCTIONS_AVAILABLE)  # type: ignore[attr-defined]
    except (AttributeError, OSError):
        return []
    return ["AVX2"] if present else []


def _service() -> dict[str, Any]:
    try:
        import winreg  # type: ignore[import-not-found]
    except ImportError:
        return {"defined": False, "env": {}}
    key_path = rf"SYSTEM\CurrentControlSet\Services\{SERVICE_NAME}"
    try:
        winreg.CloseKey(winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, key_path, 0, winreg.KEY_READ))
    except OSError:
        return {"defined": False, "env": {}}
    env: dict[str, str] = {}
    try:
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, key_path + r"\Parameters", 0, winreg.KEY_READ) as key:
            values, _kind = winreg.QueryValueEx(key, "AppEnvironmentExtra")
        for item in values if isinstance(values, list) else [values]:
            name, sep, value = str(item).partition("=")
            if sep and name in {"OLLAMA_MODELS", "OLLAMA_HOST"}:
                env[name] = value
    except OSError:
        pass
    return {"defined": True, "env": env}


def collect(base: Path, home: Path | None = None) -> dict[str, Any]:
    memory = _memory()
    binary = base / "bin" / "ollama" / "ollama.exe"
    service = _service()
    stable = {
        "os": "windows",
        "os_version": platform.version() or None,
        "arch": normalize_arch(platform.machine()),
        "cpu_features": _cpu_features(),
        "ram_total_mb": int(memory.ullTotalPhys // (1024 * 1024)) if memory else None,
        "ollama": {
            "service_kind": "nssm",
            "service_defined": service["defined"],
            "binary_present": binary.exists(),
            "binary_minos": None,
            "companion_present": companion_present(binary),
            "models_dir_effective": service["env"].get("OLLAMA_MODELS"),
        },
    }
    readiness = {
        "free_memory_pct": 100 - int(memory.dwMemoryLoad) if memory else None,
        "swap_used_mb": None,
        "memory_pressure": None,
        "heavy_processes": None,
        "heavy_processes_note": "no recolectado en Windows en esta version",
    }
    return {"stable": stable, "readiness": readiness, "ollama_host": service["env"].get("OLLAMA_HOST")}
