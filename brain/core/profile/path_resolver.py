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


class PathResolver:
    """Singleton for resolving all Bloom Nucleus paths."""
    
    _instance = None
    _base_dir: Optional[Path] = None
    _extension_id: Optional[str] = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        if self._base_dir is None:
            self._base_dir = self._resolve_base_directory()
    
    @property
    def base_dir(self) -> Path:
        """BloomNucleus root directory."""
        return self._base_dir
    
    @property
    def config_dir(self) -> Path:
        """config/ directory."""
        return self._base_dir / "config"
    
    @property
    def profiles_dir(self) -> Path:
        """profiles/ directory."""
        return self._base_dir / "profiles"
    
    @property
    def bin_dir(self) -> Path:
        """bin/ directory."""
        return self._base_dir / "bin"
    
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
        """bin/extension/ directory."""
        env_path = os.environ.get("BLOOM_EXTENSION_PATH")
        if env_path:
            return Path(env_path)
        
        if getattr(sys, 'frozen', False):
            ext_path = self.bin_dir / "extension"
            if not (ext_path / "manifest.json").exists():
                raise FileNotFoundError(
                    f"Extension manifest.json NOT FOUND\n"
                    f"Expected: {ext_path}\n"
                    f"Executable: {sys.executable}"
                )
            return ext_path
        
        # Development
        try:
            current_file = Path(__file__).resolve()
            repo_root = current_file.parent.parent.parent.parent
            dev_path = repo_root / "chrome-extension" / "src"
            if (dev_path / "manifest.json").exists():
                return dev_path
        except Exception:
            pass
        
        raise FileNotFoundError("Extension manifest.json NOT FOUND")
    
    @property
    def native_manifest(self) -> Path:
        """bin/native/com.bloom.nucleus.bridge.json."""
        return self.bin_dir / "native" / "com.bloom.nucleus.bridge.json"
    
    @property
    def extension_id(self) -> str:
        """Extension ID from native manifest or nucleus.json."""
        if self._extension_id:
            return self._extension_id
        
        # Priority 1: Native Host Manifest
        if self.native_manifest.exists():
            try:
                with open(self.native_manifest, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    allowed_origins = data.get("allowed_origins", [])
                    if allowed_origins:
                        origin = allowed_origins[0]
                        self._extension_id = origin.replace("chrome-extension://", "").rstrip("/")
                        return self._extension_id
            except Exception:
                pass
        
        # Priority 2: nucleus.json
        if self.nucleus_json.exists():
            try:
                with open(self.nucleus_json, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    ext_id = data.get("extensionId") or data.get("extension", {}).get("id")
                    if ext_id:
                        self._extension_id = ext_id
                        return self._extension_id
            except Exception:
                pass
        
        # Fallback
        self._extension_id = "EXTENSION_ID_PLACEHOLDER"
        return self._extension_id
    
    def _resolve_base_directory(self) -> Path:
        """
        Resolve BloomNucleus root.
        
        Production: BloomNucleus/bin/brain/brain.exe → BloomNucleus/
        Development: OS-specific AppData paths
        """
        if getattr(sys, 'frozen', False):
            exe_path = Path(sys.executable).resolve()
            base = exe_path.parent.parent.parent
            
            # Ensure critical directories
            for dirname in ['bin', 'config', 'profiles']:
                (base / dirname).mkdir(parents=True, exist_ok=True)
            
            return base
        
        # Development
        system = platform.system()
        if system == "Windows":
            localappdata = os.environ.get("LOCALAPPDATA")
            base = Path(localappdata) / "BloomNucleus" if localappdata else Path.home() / "AppData/Local/BloomNucleus"
        elif system == "Darwin":
            base = Path.home() / "Library/Application Support/BloomNucleus"
        else:
            base = Path.home() / ".local/share/BloomNucleus"
        
        base.mkdir(parents=True, exist_ok=True)
        return base