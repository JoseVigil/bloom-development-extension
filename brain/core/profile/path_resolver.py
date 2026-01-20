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
                raise ValueError(f"❌ Perfil maestro no tiene 'extension_path': {master.get('id')}")
            
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
    
    def get_native_manifest_path(self) -> Path:
        """
        DEPRECATED: Sentinel (Go) se encarga de la gestión del native manifest.
        
        Este método retorna la ubicación esperada del native manifest,
        pero su creación y gestión es responsabilidad de Sentinel durante
        la creación del perfil.
        
        Returns:
            Path: Ruta esperada del native manifest
        """
        path = self.bin_dir / "native" / "com.bloom.nucleus.bridge.json"
        logger.warning(
            "⚠️  get_native_manifest_path() es DEPRECATED. "
            "Sentinel (Go) gestiona el native manifest durante la creación del perfil."
        )
        return path
    
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