"""
Centralized path resolution for Bloom Nucleus.
Handles all filesystem navigation and configuration loading.
"""

import json
import os
import platform
import sys
from pathlib import Path
from typing import Optional
from brain.shared.logger import get_logger

logger = get_logger(__name__)


class PathResolver:
    """Singleton for resolving all Bloom Nucleus paths."""
    
    _instance = None
    _base_dir: Optional[Path] = None
    _extension_id: Optional[str] = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            logger.debug("🔍 PathResolver singleton created")
        return cls._instance
    
    def __init__(self):
        if self._base_dir is None:
            logger.info("🔍 Initializing PathResolver...")
            self._base_dir = self._resolve_base_directory()
            logger.info(f"✅ Base directory resolved: {self._base_dir}")
    
    @property
    def base_dir(self) -> Path:
        """BloomNucleus root directory."""
        return self._base_dir
    
    @property
    def config_dir(self) -> Path:
        """config/ directory."""
        path = self._base_dir / "config"
        logger.debug(f"Config dir: {path}")
        return path
    
    @property
    def profiles_dir(self) -> Path:
        """profiles/ directory."""
        path = self._base_dir / "profiles"
        logger.debug(f"Profiles dir: {path}")
        return path
    
    @property
    def bin_dir(self) -> Path:
        """bin/ directory."""
        path = self._base_dir / "bin"
        logger.debug(f"Bin dir: {path}")
        return path
    
    @property
    def profiles_json(self) -> Path:
        """config/profiles.json file."""
        return self.config_dir / "profiles.json"
    
    @property
    def nucleus_json(self) -> Path:
        """config/nucleus.json file."""
        return self.config_dir / "nucleus.json"
    
    @property
    def extension_path(self) -> Path:
        """
        Ruta real de la extensión maestra.
        Apunta a bin/extension/
        """
        target = self.bin_dir / "extension"

        if (target / "manifest.json").exists():
            return target

        raise FileNotFoundError(f"❌ CRÍTICO: manifest.json no encontrado en {target}")

    @property
    def extension_id(self) -> str:
        """ID fijo de la extensión para Synapse v2.0"""
        if self._extension_id:
            return self._extension_id
        
        # Hardcoded para Synapse v2.0
        self._extension_id = "hpblclepliicmihaplldignhjdggnkdh"
        logger.info(f"✅ Extension ID (Synapse v2.0): {self._extension_id}")
        return self._extension_id
    
    @property
    def native_manifest(self) -> Path:
        """bin/native/com.bloom.nucleus.bridge.json."""
        return self.bin_dir / "native" / "com.bloom.nucleus.bridge.json"
    
    def _resolve_base_directory(self) -> Path:
        is_frozen = getattr(sys, 'frozen', False)
        
        if is_frozen:
            exe_path = Path(sys.executable).resolve()
            # Estructura: BloomNucleus/bin/brain/brain.exe
            # Subimos de 'brain.exe' a 'brain/' (1), de 'brain/' a 'bin' (2), de 'bin' a 'BloomNucleus' (3)
            base = exe_path.parent.parent.parent
            
            # LOG CRÍTICO: Aquí es donde veremos la verdad
            logger.info(f"🔍 [PATH_RESOLVER] Modo Frozen detectado")
            logger.info(f"🔍 [PATH_RESOLVER] Ejecutable: {exe_path}")
            logger.info(f"🔍 [PATH_RESOLVER] BASE CALCULADA: {base}")
            
            # Asegurar que existan los directorios
            for dirname in ['bin', 'config', 'profiles']:
                (base / dirname).mkdir(parents=True, exist_ok=True)
            
            return base
        
        # --- Modo Development (Sin cambios) ---
        system = platform.system()
        if system == "Windows":
            localappdata = os.environ.get("LOCALAPPDATA")
            base = Path(localappdata) / "BloomNucleus" if localappdata else Path.home() / "AppData/Local/BloomNucleus"
        elif system == "Darwin":
            base = Path.home() / "Library/Application Support/BloomNucleus"
        else:
            base = Path.home() / ".local/share/BloomNucleus"
        
        logger.info(f"🔧 [PATH_RESOLVER] Modo Desarrollo: {base}")
        base.mkdir(parents=True, exist_ok=True)
        return base