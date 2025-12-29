"""
Sistema de detección de entorno para Brain CLI.
Determina si está corriendo en desarrollo o producción y resuelve rutas críticas.
"""

import os
import sys
import platform
from pathlib import Path
from typing import Optional, Dict, Any, List
from enum import Enum


class Environment(Enum):
    """Tipo de entorno de ejecución."""
    DEVELOPMENT = "development"
    PRODUCTION = "production"
    UNKNOWN = "unknown"


class EnvironmentDetector:
    """
    Detecta el entorno de ejecución y provee rutas específicas.
    
    Estrategia de detección:
    1. Marker file: brain/.production_marker (creado por instalador)
    2. Heurística: Si ejecutable está en %LOCALAPPDATA%/BloomNucleus → producción
    3. Fallback: Si existe .git en ancestors → desarrollo
    """
    
    def __init__(self):
        self._env_type: Optional[Environment] = None
        self._repo_root: Optional[Path] = None
        self._data_dir: Optional[Path] = None
        self._cache: Dict[str, Any] = {}
    
    @property
    def environment(self) -> Environment:
        """Detecta y cachea el tipo de entorno."""
        if self._env_type is not None:
            return self._env_type
        
        # 1. Buscar marker file de producción
        brain_module_path = Path(__file__).resolve().parent.parent  # brain/shared → brain/
        production_marker = brain_module_path / ".production_marker"
        
        if production_marker.exists():
            self._env_type = Environment.PRODUCTION
            return self._env_type
        
        # 2. Heurística: Ejecutable en %LOCALAPPDATA%/BloomNucleus
        executable = Path(sys.executable).resolve()
        if platform.system() == "Windows":
            localappdata = os.environ.get("LOCALAPPDATA")
            if localappdata and executable.is_relative_to(Path(localappdata) / "BloomNucleus"):
                self._env_type = Environment.PRODUCTION
                return self._env_type
        
        # 3. Buscar .git en ancestors (desarrollo)
        current = brain_module_path
        for parent in [current] + list(current.parents):
            if (parent / ".git").exists():
                self._env_type = Environment.DEVELOPMENT
                self._repo_root = parent
                return self._env_type
        
        # 4. Fallback: Unknown
        self._env_type = Environment.UNKNOWN
        return self._env_type
    
    @property
    def is_development(self) -> bool:
        """True si está en entorno de desarrollo."""
        return self.environment == Environment.DEVELOPMENT
    
    @property
    def is_production(self) -> bool:
        """True si está en entorno de producción."""
        return self.environment == Environment.PRODUCTION
    
    @property
    def repo_root(self) -> Optional[Path]:
        """Ruta raíz del repositorio (solo en desarrollo)."""
        if self.is_development and self._repo_root:
            return self._repo_root
        return None
    
    def get_data_directory(self) -> Path:
        """
        Retorna el directorio base de datos según el sistema operativo.
        
        Windows: %APPDATA%\BloomNucleus
        macOS: ~/Library/Application Support/BloomNucleus
        Linux: ~/.local/share/BloomNucleus
        """
        if self._data_dir is not None:
            return self._data_dir
        
        system = platform.system()
        
        if system == "Windows":
            appdata = os.environ.get("APPDATA")
            if not appdata:
                raise RuntimeError("Variable APPDATA no encontrada")
            self._data_dir = Path(appdata) / "BloomNucleus"
        
        elif system == "Darwin":  # macOS
            home = Path.home()
            self._data_dir = home / "Library" / "Application Support" / "BloomNucleus"
        
        else:  # Linux y otros
            home = Path.home()
            self._data_dir = home / ".local" / "share" / "BloomNucleus"
        
        return self._data_dir
    
    def get_extension_path(self) -> Optional[Path]:
        """
        Busca la extensión de Chrome en orden de prioridad:
        
        1. Variable de entorno BLOOM_EXTENSION_PATH (override manual)
        2. Producción: %LOCALAPPDATA%/BloomNucleus/extensions/chrome/
        3. VSCode Extensions: ~/.vscode/extensions/bloom-nucleus-*/installer/chrome-extension/src
        4. Desarrollo: repo_root/installer/chrome-extension/src
        
        Returns:
            Path si encuentra manifest.json, None si no existe
        """
        candidates: List[Path] = []
        
        # 1. Variable de entorno (máxima prioridad - override manual)
        env_path = os.environ.get("BLOOM_EXTENSION_PATH")
        if env_path:
            candidates.append(Path(env_path))
        
        # 2. Producción: %LOCALAPPDATA%/BloomNucleus/extensions/chrome/
        if self.is_production or self.environment == Environment.UNKNOWN:
            system = platform.system()
            
            if system == "Windows":
                localappdata = os.environ.get("LOCALAPPDATA")
                if localappdata:
                    candidates.append(Path(localappdata) / "BloomNucleus" / "extensions" / "chrome")
            
            elif system == "Darwin":  # macOS
                home = Path.home()
                candidates.append(home / "Library" / "Application Support" / "BloomNucleus" / "extensions" / "chrome")
            
            else:  # Linux
                home = Path.home()
                candidates.append(home / ".local" / "share" / "BloomNucleus" / "extensions" / "chrome")
        
        # 3. VSCode Extensions (desarrollo con plugin instalado)
        vscode_extensions = Path.home() / ".vscode" / "extensions"
        if vscode_extensions.exists():
            # Buscar bloom-nucleus-* (puede haber múltiples versiones)
            for ext_dir in vscode_extensions.glob("bloom-nucleus-*"):
                ext_path = ext_dir / "installer" / "chrome-extension" / "src"
                candidates.append(ext_path)
        
        # 4. Desarrollo: repo_root/installer/chrome-extension/src
        if self.is_development and self.repo_root:
            candidates.append(self.repo_root / "installer" / "chrome-extension" / "src")
        
        # Validar candidates
        for candidate in candidates:
            if candidate.exists() and (candidate / "manifest.json").exists():
                return candidate
        
        return None
    
    def get_info(self) -> Dict[str, Any]:
        """Retorna información completa del entorno para debugging."""
        extension_path = self.get_extension_path()
        
        return {
            "environment": self.environment.value,
            "is_development": self.is_development,
            "is_production": self.is_production,
            "repo_root": str(self.repo_root) if self.repo_root else None,
            "data_directory": str(self.get_data_directory()),
            "extension_path": str(extension_path) if extension_path else None,
            "extension_found": extension_path is not None,
            "platform": platform.system(),
            "python_executable": sys.executable,
            "search_paths": self._get_search_paths_debug()
        }
    
    def _get_search_paths_debug(self) -> Dict[str, Any]:
        """Retorna las rutas de búsqueda para debugging."""
        paths = {
            "env_var": os.environ.get("BLOOM_EXTENSION_PATH"),
            "production": None,
            "vscode_extensions": [],
            "repo_dev": None
        }
        
        # Producción
        system = platform.system()
        if system == "Windows":
            localappdata = os.environ.get("LOCALAPPDATA")
            if localappdata:
                prod_path = Path(localappdata) / "BloomNucleus" / "extensions" / "chrome"
                paths["production"] = {
                    "path": str(prod_path),
                    "exists": prod_path.exists(),
                    "has_manifest": (prod_path / "manifest.json").exists() if prod_path.exists() else False
                }
        
        # VSCode Extensions
        vscode_ext = Path.home() / ".vscode" / "extensions"
        if vscode_ext.exists():
            for ext_dir in vscode_ext.glob("bloom-nucleus-*"):
                ext_path = ext_dir / "installer" / "chrome-extension" / "src"
                paths["vscode_extensions"].append({
                    "path": str(ext_path),
                    "exists": ext_path.exists(),
                    "has_manifest": (ext_path / "manifest.json").exists() if ext_path.exists() else False
                })
        
        # Repo dev
        if self.repo_root:
            repo_ext = self.repo_root / "installer" / "chrome-extension" / "src"
            paths["repo_dev"] = {
                "path": str(repo_ext),
                "exists": repo_ext.exists(),
                "has_manifest": (repo_ext / "manifest.json").exists() if repo_ext.exists() else False
            }
        
        return paths


# Singleton global
_detector: Optional[EnvironmentDetector] = None


def get_environment_detector() -> EnvironmentDetector:
    """Retorna el detector de entorno singleton."""
    global _detector
    if _detector is None:
        _detector = EnvironmentDetector()
    return _detector