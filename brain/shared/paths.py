"""
Centralized path resolution for Bloom Nucleus.
Single source of truth for all filesystem paths across the application.
"""

import json
import os
import platform
import sys
from pathlib import Path
from typing import Optional
from brain.shared.logger import get_logger

logger = get_logger(__name__)


class Paths:
    """Singleton for resolving all Bloom Nucleus paths."""

    _instance = None
    _base_dir: Optional[Path] = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            logger.debug("🔍 Paths singleton created")
        return cls._instance

    def __init__(self):
        if self._base_dir is None:
            logger.info("🔍 Initializing Paths...")
            self._base_dir = self._resolve_base_directory()
            logger.info(f"✅ Base directory resolved: {self._base_dir}")

    # -------------------------------------------------------------------------
    # Base directories
    # -------------------------------------------------------------------------

    @property
    def base_dir(self) -> Path:
        """BloomNucleus root directory."""
        return self._base_dir

    @property
    def bin_dir(self) -> Path:
        """bin/ directory."""
        return self._base_dir / "bin"

    @property
    def config_dir(self) -> Path:
        """config/ directory."""
        return self._base_dir / "config"

    @property
    def profiles_dir(self) -> Path:
        """profiles/ directory."""
        return self._base_dir / "profiles"

    @property
    def logs_dir(self) -> Path:
        """logs/ directory."""
        return self._base_dir / "logs"

    @property
    def workers_dir(self) -> Path:
        """workers/ directory."""
        return self._base_dir / "workers"

    # -------------------------------------------------------------------------
    # Workers subdirectories
    # -------------------------------------------------------------------------

    @property
    def workers_brain_dir(self) -> Path:
        """workers/brain/ — Brain service worker files (PID, events, traffic log)."""
        return self.workers_dir / "brain"

    # -------------------------------------------------------------------------
    # Config files
    # -------------------------------------------------------------------------

    @property
    def profiles_json(self) -> Path:
        """config/profiles.json"""
        return self.config_dir / "profiles.json"

    @property
    def nucleus_json(self) -> Path:
        """config/nucleus.json"""
        return self.config_dir / "nucleus.json"

    # -------------------------------------------------------------------------
    # Binary executables
    # -------------------------------------------------------------------------

    @property
    def nucleus_exe(self) -> Path:
        """bin/nucleus/nucleus.exe"""
        return self.bin_dir / "nucleus" / "nucleus.exe"

    @property
    def sentinel_exe(self) -> Path:
        """bin/sentinel/sentinel.exe"""
        return self.bin_dir / "sentinel" / "sentinel.exe"

    @property
    def conductor_exe(self) -> Path:
        """bin/conductor/bloom-conductor.exe"""
        return self.bin_dir / "conductor" / "bloom-conductor.exe"

    @property
    def launcher_exe(self) -> Path:
        """bin/launcher/bloom-launcher.exe"""
        return self.bin_dir / "launcher" / "bloom-launcher.exe"

    # -------------------------------------------------------------------------
    # Log directories
    # -------------------------------------------------------------------------

    @property
    def brain_logs_dir(self) -> Path:
        """logs/brain/ — root for all Brain log files."""
        return self.logs_dir / "brain"

    @property
    def sentinel_logs_dir(self) -> Path:
        """logs/sentinel/ — root for all Sentinel log files."""
        return self.logs_dir / "sentinel"

    @property
    def chromium_logs_dir(self) -> Path:
        """logs/chromium/ — Chromium instance log files."""
        return self.logs_dir / "chromium"

    def sentinel_profile_logs_dir(self, profile_id: str) -> Path:
        """logs/sentinel/profiles/{profile_id}/ — per-profile sentinel logs."""
        return self.sentinel_logs_dir / "profiles" / profile_id

    # -------------------------------------------------------------------------
    # Config-driven lookups
    # -------------------------------------------------------------------------

    def get_master_profile_extension_path(self) -> Path:
        """
        Obtiene la ruta de la extensión del perfil maestro desde profiles.json.

        Returns:
            Path: Ruta absoluta a la extensión del perfil maestro

        Raises:
            FileNotFoundError: Si profiles.json no existe
            ValueError: Si no hay perfil maestro o no tiene extension_path
        """
        if not self.profiles_json.exists():
            raise FileNotFoundError(f"❌ profiles.json no encontrado: {self.profiles_json}")

        try:
            with open(self.profiles_json, 'r', encoding='utf-8') as f:
                data = json.load(f)

            profiles = data.get('profiles', [])
            master = next((p for p in profiles if p.get('master')), None)

            if not master:
                raise ValueError("❌ No se encontró perfil maestro en profiles.json")

            ext_path = master.get('extension_path')
            if not ext_path:
                raise ValueError(
                    f"❌ Perfil maestro no tiene 'extension_path': {master.get('id')}"
                )

            resolved_path = Path(ext_path)
            logger.debug(f"✅ Extension path del perfil maestro: {resolved_path}")
            return resolved_path

        except json.JSONDecodeError as e:
            raise ValueError(f"❌ Error al parsear profiles.json: {e}")

    def get_extension_id(self) -> str:
        """
        Obtiene el extension_id desde nucleus.json (system_map.extension_id).

        Returns:
            str: Extension ID

        Raises:
            FileNotFoundError: Si nucleus.json no existe
            ValueError: Si no se encuentra extension_id en system_map
        """
        if not self.nucleus_json.exists():
            raise FileNotFoundError(f"❌ nucleus.json no encontrado: {self.nucleus_json}")

        try:
            with open(self.nucleus_json, 'r', encoding='utf-8') as f:
                data = json.load(f)

            system_map = data.get('system_map', {})
            extension_id = system_map.get('extension_id')

            if not extension_id:
                raise ValueError("❌ 'extension_id' no encontrado en nucleus.json/system_map")

            logger.debug(f"✅ Extension ID desde nucleus.json: {extension_id}")
            return extension_id

        except json.JSONDecodeError as e:
            raise ValueError(f"❌ Error al parsear nucleus.json: {e}")

    # -------------------------------------------------------------------------
    # Internal resolution
    # -------------------------------------------------------------------------

    def _resolve_base_directory(self) -> Path:
        is_frozen = getattr(sys, 'frozen', False)

        if is_frozen:
            exe_path = Path(sys.executable).resolve()
            # Estructura: BloomNucleus/bin/brain/brain.exe
            # brain.exe → brain/ → bin/ → BloomNucleus/
            base = exe_path.parent.parent.parent

            logger.info(f"🔍 [PATHS] Modo Frozen detectado")
            logger.info(f"🔍 [PATHS] Ejecutable: {exe_path}")
            logger.info(f"🔍 [PATHS] BASE CALCULADA: {base}")

            for dirname in ['bin', 'config', 'profiles', 'workers', 'logs']:
                (base / dirname).mkdir(parents=True, exist_ok=True)

            return base

        # Modo desarrollo
        system = platform.system()
        if system == "Windows":
            localappdata = os.environ.get("LOCALAPPDATA")
            base = (
                Path(localappdata) / "BloomNucleus"
                if localappdata
                else Path.home() / "AppData" / "Local" / "BloomNucleus"
            )
        elif system == "Darwin":
            base = Path.home() / "Library" / "Application Support" / "BloomNucleus"
        else:
            xdg = os.environ.get("XDG_DATA_HOME")
            base = (
                Path(xdg) / "BloomNucleus"
                if xdg
                else Path.home() / ".local" / "share" / "BloomNucleus"
            )

        logger.info(f"🔧 [PATHS] Modo Desarrollo: {base}")
        base.mkdir(parents=True, exist_ok=True)
        return base