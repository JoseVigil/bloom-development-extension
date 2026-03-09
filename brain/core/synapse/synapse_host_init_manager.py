"""
Lógica de negocio pura para inicialización del host Synapse.
Sin dependencias de CLI. Ejecuta bloom-host.exe --init desde el proceso Brain,
garantizando autoridad de escritura sobre nucleus.
"""

import subprocess
import os
import logging
from pathlib import Path
from typing import Dict, Any, Optional

_diag = logging.getLogger("brain.core.synapse")


class SynapseHostInitManager:

    def __init__(self, bloom_root: Optional[str] = None):
        self._bloom_root = bloom_root

    def init_host(self, profile_id: str, launch_id: str, bloom_root: Optional[str] = None) -> Dict[str, Any]:
        if not profile_id:
            raise ValueError("profile_id no puede estar vacío")
        if not launch_id:
            raise ValueError("launch_id no puede estar vacío")

        resolved_root = self._resolve_bloom_root(bloom_root)
        host_bin = self._resolve_host_binary(resolved_root)
        env = self._build_env(resolved_root)

        cmd = [
            str(host_bin),
            "--init",
            "--json",
            "--profile-id", profile_id,
            "--launch-id", launch_id,
        ]

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='replace',
            cwd=str(resolved_root),
            env=env,
            timeout=30,
        )

        _diag.debug(f"[HOST-INIT] bloom-host exit={result.returncode} stdout={result.stdout!r}")
        _diag.debug(f"[HOST-INIT] bloom-host stderr={result.stderr!r}")

        if result.returncode != 0:
            detail = (result.stdout + result.stderr).strip()
            raise RuntimeError(
                f"bloom-host --init falló (exit={result.returncode}) "
                f"profile={profile_id} launch={launch_id} — {detail}"
            )

        parsed = self._parse_host_output(result.stdout)
        _diag.debug(f"[HOST-INIT] parsed={parsed}")

        data = {
            "profile_id":    profile_id,
            "launch_id":     launch_id,
            "bloom_root":    str(resolved_root),
            "host_binary":   str(host_bin),
            "exit_code":     result.returncode,
            "log_directory": parsed.get("log_directory", ""),
            "host_log":      parsed.get("host_log", ""),
            "extension_log": parsed.get("extension_log", ""),
            "timestamp":     parsed.get("timestamp"),
            "raw_output":    result.stdout.strip(),
        }

        self._register_telemetry_streams(resolved_root, profile_id, launch_id, data)

        return data

    def _register_telemetry_streams(
        self,
        bloom_root: Path,
        profile_id: str,
        launch_id: str,
        data: Dict[str, Any],
    ) -> None:
        nucleus_bin = bloom_root / "bin" / "nucleus" / "nucleus.exe"
        if not nucleus_bin.exists():
            _diag.warning(f"[HOST-INIT] nucleus.exe no encontrado en {nucleus_bin} — streams no registrados")
            return

        env = self._build_env(bloom_root)
        _diag.debug(f"[HOST-INIT] nucleus={nucleus_bin} host_log={data.get('host_log')!r} extension_log={data.get('extension_log')!r}")

        streams = [
            {
                "path":        data.get("host_log", ""),
                "stream_id":   f"host_{launch_id}",
                "label":       "🖥️ HOST",
                "priority":    "2",
                "category":    "host",
                "description": f"bloom-host log for launch {launch_id}",
            },
            {
                "path":        data.get("extension_log", ""),
                "stream_id":   f"cortex_{launch_id}",
                "label":       "🧠 CORTEX",
                "priority":    "2",
                "category":    "synapse",
                "description": f"Cortex extension log for launch {launch_id}",
            },
        ]

        for s in streams:
            if not s["path"]:
                _diag.warning(f"[HOST-INIT] stream '{s['stream_id']}' skipped — path vacío")
                continue
            nr = subprocess.run(
                [
                    str(nucleus_bin),
                    "telemetry", "register",
                    "--stream",      s["stream_id"],
                    "--label",       s["label"],
                    "--path",        s["path"].replace("\\", "/"),
                    "--priority",    s["priority"],
                    "--category",    "host",
                    "--category",    "synapse",
                    "--source",      "brain",
                    "--description", s["description"],
                ],
                capture_output=True,
                text=True,
                encoding='utf-8',
                errors='replace',
                env=env,
                timeout=10,
            )
            _diag.debug(
                f"[HOST-INIT] nucleus register '{s['stream_id']}' "
                f"exit={nr.returncode} stdout={nr.stdout!r} stderr={nr.stderr!r}"
            )
            
    def _resolve_bloom_root(self, override: Optional[str] = None) -> Path:
        if override:
            return Path(override)
        if self._bloom_root:
            return Path(self._bloom_root)
        bloom_dir = os.environ.get("BLOOM_DIR")
        if bloom_dir:
            return Path(bloom_dir)
        local_appdata = os.environ.get("LOCALAPPDATA")
        if local_appdata:
            return Path(local_appdata) / "BloomNucleus"
        return Path("/tmp/bloom-nucleus")

    def _resolve_host_binary(self, bloom_root: Path) -> Path:
        binary_name = "bloom-host.exe" if os.name == "nt" else "bloom-host"
        host_bin = bloom_root / "bin" / "host" / binary_name
        if not host_bin.exists():
            raise FileNotFoundError(
                f"bloom-host no encontrado en {host_bin} — verificar instalación"
            )
        return host_bin

    def _build_env(self, bloom_root: Path) -> Dict[str, str]:
        env = os.environ.copy()
        env["BLOOM_DIR"] = str(bloom_root)
        env["LOCALAPPDATA"] = str(bloom_root.parent)
        return env

    def _parse_host_output(self, stdout: str) -> Dict[str, Any]:
        import json
        stdout = stdout.strip()
        if not stdout:
            return {}
        for line in reversed(stdout.splitlines()):
            line = line.strip()
            if line.startswith("{"):
                try:
                    return json.loads(line)
                except json.JSONDecodeError:
                    continue
        return {}