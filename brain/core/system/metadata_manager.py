"""
System metadata manager for Brain CLI.
Handles automatic detection and collection of runtime and build metadata.
NO DEPENDENCIES ON CLI FRAMEWORKS (pure Python logic).
"""

import sys
import os
import platform
from pathlib import Path
from typing import Dict, Any
from datetime import datetime
import importlib.metadata


class MetadataManager:
    """
    Manager for collecting system and build metadata.
    All data is detected automatically at runtime or build time.
    """
    
    def __init__(self):
        """Initialize the metadata manager."""
        self._root_path = self._detect_root_path()
    
    def _detect_root_path(self) -> Path:
        """
        Detect the root path of the Brain executable/package.
        
        Returns:
            Path to the Brain root directory
        """
        if getattr(sys, 'frozen', False):
            # Running as PyInstaller executable
            # sys._MEIPASS is the temp folder where PyInstaller extracts files
            return Path(getattr(sys, '_MEIPASS', sys.executable)).parent
        else:
            # Running in development
            return Path(__file__).parent.parent.parent
    
    def _get_version(self) -> str:
        """
        Get semantic version from VERSION file or pyproject.toml.
        
        Returns:
            Semantic version string (e.g., "2.1.0")
        """
        # Strategy 1: Try VERSION file in frozen executable (PyInstaller extracts to _MEIPASS)
        if getattr(sys, 'frozen', False):
            meipass = Path(getattr(sys, '_MEIPASS', ''))
            if meipass.exists():
                version_file = meipass / "VERSION"
                if version_file.exists():
                    try:
                        return version_file.read_text(encoding='utf-8').strip()
                    except Exception:
                        pass
        
        # Strategy 2: Try VERSION file in root path
        version_file = self._root_path / "VERSION"
        if version_file.exists():
            try:
                return version_file.read_text(encoding='utf-8').strip()
            except Exception:
                pass
        
        # Strategy 3: Try pyproject.toml
        pyproject = self._root_path / "pyproject.toml"
        if pyproject.exists():
            import re
            try:
                content = pyproject.read_text(encoding='utf-8')
                match = re.search(r'version\s*=\s*["\']([^"\']+)["\']', content)
                if match:
                    return match.group(1)
            except Exception:
                pass
        
        # Strategy 4: Try parent directories (development mode)
        if not getattr(sys, 'frozen', False):
            brain_dir = Path(__file__).parent.parent.parent  # brain/
            version_file = brain_dir / "VERSION"
            if version_file.exists():
                try:
                    return version_file.read_text(encoding='utf-8').strip()
                except Exception:
                    pass
            
            pyproject = brain_dir / "pyproject.toml"
            if pyproject.exists():
                import re
                try:
                    content = pyproject.read_text(encoding='utf-8')
                    match = re.search(r'version\s*=\s*["\']([^"\']+)["\']', content)
                    if match:
                        return match.group(1)
                except Exception:
                    pass
        
        # Strategy 5: Try package metadata
        try:
            return importlib.metadata.version('brain-cli')
        except importlib.metadata.PackageNotFoundError:
            pass
        
        return "unknown"
    
    def _get_build_number(self) -> int:
        """
        Get build number from __build__.py module.
        
        Returns:
            Build number (0 if not found)
        """
        # Strategy 1: Try to import __build__ module (works in frozen and dev)
        try:
            import __build__
            return getattr(__build__, 'BUILD_NUMBER', 0)
        except ImportError:
            pass
        
        # Strategy 2: Try to read from _MEIPASS (frozen executable)
        if getattr(sys, 'frozen', False):
            meipass = Path(getattr(sys, '_MEIPASS', ''))
            if meipass.exists():
                build_file = meipass / "__build__.py"
                if build_file.exists():
                    try:
                        # Parse the file manually to extract BUILD_NUMBER
                        import re
                        content = build_file.read_text(encoding='utf-8')
                        match = re.search(r'BUILD_NUMBER\s*=\s*(\d+)', content)
                        if match:
                            return int(match.group(1))
                    except Exception:
                        pass
        
        # Strategy 3: Try to read from build_number.txt
        build_file = self._root_path / "build_number.txt"
        if build_file.exists():
            try:
                return int(build_file.read_text(encoding='utf-8').strip())
            except ValueError:
                pass
        
        # Strategy 4: Try parent directories (development mode)
        if not getattr(sys, 'frozen', False):
            brain_dir = Path(__file__).parent.parent.parent  # brain/
            build_file = brain_dir / "build_number.txt"
            if build_file.exists():
                try:
                    return int(build_file.read_text(encoding='utf-8').strip())
                except ValueError:
                    pass
        
        return 0
    
    def _get_app_name(self) -> str:
        """
        Auto-detect executable name from sys.argv[0].
        
        Returns:
            Executable name (e.g., "brain.exe" or "brain")
        """
        exe_path = Path(sys.argv[0])
        return exe_path.name if exe_path.name else "brain"
    
    def _get_compile_date(self) -> str:
        """
        Get approximate compilation date using file modification time.
        
        Returns:
            Date string in YYYY-MM-DD format
        """
        try:
            if getattr(sys, 'frozen', False):
                # Use executable modification time
                mtime = os.path.getmtime(sys.executable)
            else:
                # Use this file's modification time
                mtime = os.path.getmtime(__file__)
            
            return datetime.fromtimestamp(mtime).strftime('%Y-%m-%d')
        except Exception:
            return datetime.now().strftime('%Y-%m-%d')
    
    def _get_loaded_modules(self) -> str:
        """
        Detect loaded packages using importlib.metadata.
        
        Returns:
            Comma-separated list of "package=version" or "none"
        """
        try:
            distributions = list(importlib.metadata.distributions())
            
            if not distributions:
                return "none"
            
            # Filter and format packages
            packages = []
            for dist in distributions:
                name = dist.metadata.get('Name', '')
                version = dist.metadata.get('Version', '')
                
                # Skip built-in packages and stdlib
                if name and version and not name.startswith('_'):
                    packages.append(f"{name}={version}")
            
            # Sort and limit to avoid excessive output
            packages.sort()
            return ", ".join(packages[:20]) if packages else "none"
            
        except Exception:
            return "none"
    
    def _get_custom_params(self) -> str:
        """
        Get custom configuration parameters from environment or globals.
        
        Returns:
            Formatted string of custom parameters or "none"
        """
        params = []
        
        # Example: Check for custom port configuration
        if 'DEFAULT_PORT' in globals():
            params.append(f"custom_tcp_port={globals()['DEFAULT_PORT']}")
        
        # Add more custom params as needed
        # Example: Environment variables
        custom_env_vars = ['BRAIN_PORT', 'BRAIN_DEBUG', 'BRAIN_CONFIG']
        for var in custom_env_vars:
            value = os.environ.get(var)
            if value:
                params.append(f"{var.lower()}={value}")
        
        return ", ".join(params) if params else "none"
    
    def get_release_info(self) -> Dict[str, Any]:
        """
        Get release information (version and build number).
        
        Returns:
            Dictionary with release metadata
        """
        return {
            "app_name": self._get_app_name(),
            "app_release": self._get_version(),
            "build_counter": self._get_build_number()
        }
    
    def get_system_specs(self) -> Dict[str, Any]:
        """
        Get comprehensive system specifications.
        All fields are detected automatically.
        
        Returns:
            Dictionary with all system metadata (alphabetically ordered keys)
        """
        specs = {
            "app_name": self._get_app_name(),
            "app_release": self._get_version(),
            "build_counter": self._get_build_number(),
            "compile_date": self._get_compile_date(),
            "current_time": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            "custom_params": self._get_custom_params(),
            "modules_loaded": self._get_loaded_modules(),
            "platform_arch": platform.machine(),
            "platform_os": platform.system(),
            "runtime_engine": "Python",
            "runtime_release": sys.version.split()[0]
        }
        
        # Return sorted by key (alphabetical)
        return dict(sorted(specs.items()))