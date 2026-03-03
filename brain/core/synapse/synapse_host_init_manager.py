"""
Lógica de negocio pura para inicialización del host Synapse.
Sin dependencias de CLI. Ejecuta bloom-host.exe --init desde el proceso Brain,
garantizando autoridad de escritura sobre nucleus.
"""

import subprocess
import os
from pathlib import Path
from typing import Dict, Any, Optional


class SynapseHostInitManager:
    """
    Ejecuta bloom-host.exe --init con la autoridad del proceso Brain.

    Contexto del problema:
        Sentinel (no-servicio, sesión usuario) no tenía autoridad para que
        nucleus aceptara el registro de telemetría al spawner bloom-host.
        Brain (servicio) sí la tiene. Este manager es el puente: Sentinel
        delega la inicialización del host a Brain via CLI, y Brain la ejecuta
        con sus propios permisos.

    Contrato:
        - bloom-host.exe debe existir en <bloom_root>/bin/host/bloom-host.exe
        - bloom_root se resuelve desde LOCALAPPDATA/BloomNucleus
        - Exit code 0 de bloom-host indica éxito y escritura en telemetry.json
        - Exit code != 0 lanza RuntimeError con el output completo para diagnóstico
    """

    def __init__(self, bloom_root: Optional[str] = None):
        """
        Inicializa el manager.

        Args:
            bloom_root: Ruta raíz de BloomNucleus. Si None, se resuelve
                        automáticamente desde LOCALAPPDATA.
        """
        self._bloom_root = bloom_root

    def init_host(self, profile_id: str, launch_id: str, bloom_root: Optional[str] = None) -> Dict[str, Any]:
        """
        Ejecuta bloom-host.exe --init para la sesión indicada.

        Args:
            profile_id: UUID del perfil Chrome (ej: 99bbdaf0-fc8f-4e6f-8284-216482f2675a)
            launch_id:  Launch ID de la sesión (ej: 001_99bbdaf0_161909)

        Returns:
            Diccionario con los paths creados y metadata de la sesión.
            Incluye: profile_id, launch_id, log_directory, host_log,
                     extension_log, bloom_root, exit_code.

        Raises:
            ValueError:      Si profile_id o launch_id están vacíos.
            FileNotFoundError: Si bloom-host.exe no existe en la ruta esperada.
            RuntimeError:    Si bloom-host --init sale con exit code != 0.
        """
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
            cwd=str(resolved_root),
            env=env,
            timeout=30,
        )

        if result.returncode != 0:
            detail = (result.stdout + result.stderr).strip()
            raise RuntimeError(
                f"bloom-host --init falló (exit={result.returncode}) "
                f"profile={profile_id} launch={launch_id} — {detail}"
            )

        parsed = self._parse_host_output(result.stdout)

        return {
            "profile_id":      profile_id,
            "launch_id":       launch_id,
            "bloom_root":      str(resolved_root),
            "host_binary":     str(host_bin),
            "exit_code":       result.returncode,
            "log_directory":   parsed.get("log_directory", ""),
            "host_log":        parsed.get("host_log", ""),
            "extension_log":   parsed.get("extension_log", ""),
            "timestamp":       parsed.get("timestamp"),
            "raw_output":      result.stdout.strip(),
        }

    # -------------------------------------------------------------------------
    # Métodos privados
    # -------------------------------------------------------------------------

    def _resolve_bloom_root(self, override: Optional[str] = None) -> Path:
        """
        Resuelve la raíz de BloomNucleus.

        Orden de prioridad:
          1. bloom_root inyectado en el constructor
          2. Variable de entorno BLOOM_DIR
          3. LOCALAPPDATA/BloomNucleus (Windows)
          4. /tmp/bloom-nucleus (fallback Unix)

        Returns:
            Path a la raíz de BloomNucleus.

        Raises:
            FileNotFoundError: Si no se puede determinar la raíz.
        """
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

        # Fallback Unix (dev/testing)
        return Path("/tmp/bloom-nucleus")

    def _resolve_host_binary(self, bloom_root: Path) -> Path:
        """
        Resuelve la ruta absoluta a bloom-host.exe.

        Args:
            bloom_root: Raíz de BloomNucleus.

        Returns:
            Path absoluto al binario.

        Raises:
            FileNotFoundError: Si el binario no existe.
        """
        binary_name = "bloom-host.exe" if os.name == "nt" else "bloom-host"
        host_bin = bloom_root / "bin" / "host" / binary_name

        if not host_bin.exists():
            raise FileNotFoundError(
                f"bloom-host no encontrado en {host_bin} — verificar instalación"
            )

        return host_bin

    def _build_env(self, bloom_root: Path) -> Dict[str, str]:
        """
        Construye el entorno de ejecución para bloom-host.

        Copia el entorno actual de Brain e inyecta/sobreescribe BLOOM_DIR
        con el valor correcto derivado de bloom_root. Esto garantiza que
        nucleus CLI (spawneado por bloom-host) encuentre telemetry.json
        independientemente del entorno heredado.

        Args:
            bloom_root: Raíz de BloomNucleus a inyectar como BLOOM_DIR.

        Returns:
            Diccionario de variables de entorno listo para subprocess.
        """
        env = os.environ.copy()
        env["BLOOM_DIR"] = str(bloom_root)
        env["LOCALAPPDATA"] = str(bloom_root.parent)  # BloomNucleus → AppData/Local
        return env

    def _parse_host_output(self, stdout: str) -> Dict[str, Any]:
        """
        Parsea el JSON que bloom-host imprime en stdout con --json.

        Args:
            stdout: Salida estándar del proceso bloom-host.

        Returns:
            Diccionario con los campos del JSON, o dict vacío si falla el parse.
        """
        import json

        stdout = stdout.strip()
        if not stdout:
            return {}

        # bloom-host puede emitir líneas de log antes del JSON final;
        # buscamos la última línea que sea JSON válido.
        for line in reversed(stdout.splitlines()):
            line = line.strip()
            if line.startswith("{"):
                try:
                    return json.loads(line)
                except json.JSONDecodeError:
                    continue

        return {}