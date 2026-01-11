"""
System introspection manager.
Pure business logic for gathering runtime and system information.
"""

import sys
import platform
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional


class ChangelogEntry:
    """Represents a changelog entry for a version."""
    
    def __init__(
        self,
        added: Optional[List[str]] = None,
        changed: Optional[List[str]] = None,
        details: Optional[List[str]] = None
    ):
        self.added = added or []
        self.changed = changed or []
        self.details = details or []
    
    def is_empty(self) -> bool:
        """Check if the changelog entry is empty."""
        return not (self.added or self.changed or self.details)
    
    def to_dict(self) -> Dict[str, List[str]]:
        """Convert to dictionary."""
        return {
            "added": self.added,
            "changed": self.changed,
            "details": self.details
        }


class SystemInfoManager:
    """
    Manager for system introspection operations.
    Handles version retrieval, executable location, and runtime metadata.
    """
    
    def __init__(self):
        """Initialize the system info manager."""
        self._is_frozen = self._detect_frozen()
    
    def get_version(self) -> str:
        """
        Get Brain CLI version from pyproject.toml (single source of truth).
        
        Returns:
            Version string (e.g., "0.1.0")
            
        Raises:
            FileNotFoundError: If pyproject.toml not found
            ValueError: If version cannot be parsed
        """
        if self._is_frozen:
            # In frozen mode, read from embedded metadata
            return self._get_frozen_version()
        else:
            # In development, read from pyproject.toml
            return self._get_dev_version()
    
    def increment_version(
        self,
        added: Optional[List[str]] = None,
        changed: Optional[List[str]] = None,
        details: Optional[List[str]] = None
    ) -> str:
        """
        Increment the patch version with changelog information.
        
        In frozen mode: Creates version_request.json for external processing
        In dev mode: Updates pyproject.toml directly
        
        Args:
            added: List of added features
            changed: List of changed features
            details: List of implementation details
            
        Returns:
            New version string
            
        Raises:
            FileNotFoundError: If pyproject.toml not found (dev mode)
            ValueError: If version cannot be parsed or no changelog provided
        """
        changelog = ChangelogEntry(added, changed, details)
        
        if changelog.is_empty():
            raise ValueError(
                "At least one changelog field required (--added, --changed, or --details)"
            )
        
        if self._is_frozen:
            # Frozen mode: Create request file for launcher to process
            return self._create_version_request(changelog)
        else:
            # Development mode: Update directly
            return self._increment_dev_version(changelog)
    
    def get_executable_path(self) -> Path:
        """
        Get absolute path to the brain executable.
        
        Returns:
            Absolute path to executable
        """
        if self._is_frozen:
            # PyInstaller frozen executable
            return Path(sys.executable).resolve()
        else:
            # Development mode - return __main__.py location
            import brain.__main__
            return Path(brain.__main__.__file__).resolve()
    
    def get_system_info(self) -> Dict[str, Any]:
        """
        Get comprehensive system information.
        
        Returns:
            Dictionary containing:
            - version: Brain CLI version
            - executable_path: Path to executable
            - execution_mode: "frozen" or "development"
            - python_version: Python runtime version
            - python_executable: Python interpreter path
            - platform: OS information
            - architecture: CPU architecture
            - working_directory: Current working directory
            - frozen_bundle_path: (frozen only) PyInstaller bundle path
        """
        info = {
            "version": self.get_version(),
            "executable_path": str(self.get_executable_path()),
            "execution_mode": "frozen" if self._is_frozen else "development",
            "python_version": platform.python_version(),
            "python_executable": sys.executable,
            "platform": f"{platform.system()} {platform.release()}",
            "architecture": platform.machine(),
            "working_directory": str(Path.cwd().resolve())
        }
        
        # Add frozen-specific info
        if self._is_frozen and hasattr(sys, '_MEIPASS'):
            info["frozen_bundle_path"] = sys._MEIPASS
        
        return info
    
    # Private methods
    
    def _detect_frozen(self) -> bool:
        """Detect if running as PyInstaller frozen executable."""
        return getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS')
    
    def _get_frozen_version(self) -> str:
        """
        Get version from frozen executable metadata.
        
        In frozen mode, version is embedded during build.
        Fallback to reading from pyproject.toml in bundle.
        """
        # Try to read from embedded version file (created during build)
        if hasattr(sys, '_MEIPASS'):
            version_file = Path(sys._MEIPASS) / "VERSION"
            if version_file.exists():
                return version_file.read_text().strip()
        
        # Fallback: try to find pyproject.toml in bundle
        try:
            return self._parse_version_from_pyproject()
        except Exception:
            return "unknown (frozen)"
    
    def _get_dev_version(self) -> str:
        """Get version from pyproject.toml in development mode."""
        return self._parse_version_from_pyproject()
    
    def _parse_version_from_pyproject(self) -> str:
        """
        Parse version from pyproject.toml.
        
        Returns:
            Version string
            
        Raises:
            FileNotFoundError: If pyproject.toml not found
            ValueError: If version cannot be parsed
        """
        # Find pyproject.toml
        pyproject_path = self._find_pyproject_toml()
        
        if not pyproject_path:
            raise FileNotFoundError("pyproject.toml not found")
        
        # Parse version using simple regex (avoid toml dependency)
        content = pyproject_path.read_text(encoding='utf-8')
        
        match = re.search(r'version\s*=\s*["\']([^"\']+)["\']', content)
        
        if not match:
            raise ValueError("Version not found in pyproject.toml")
        
        return match.group(1)
    
    def _find_pyproject_toml(self) -> Path | None:
        """
        Find pyproject.toml by traversing up from current location.
        
        Returns:
            Path to pyproject.toml or None if not found
        """
        # Start from executable/module location
        if self._is_frozen and hasattr(sys, '_MEIPASS'):
            search_start = Path(sys._MEIPASS)
        else:
            import brain
            search_start = Path(brain.__file__).parent.parent
        
        # Traverse up to find pyproject.toml
        current = search_start.resolve()
        
        for _ in range(5):  # Max 5 levels up
            candidate = current / "pyproject.toml"
            if candidate.exists():
                return candidate
            
            parent = current.parent
            if parent == current:  # Reached filesystem root
                break
            current = parent
        
        return None
    
    def _create_version_request(self, changelog: ChangelogEntry) -> str:
        """
        Create a version increment request file for external processing.
        
        This is used in frozen mode where the executable cannot modify
        its own source code. An external tool (like launcher.exe) can
        read this file and update pyproject.toml + rebuild.
        
        Args:
            changelog: Changelog entry with added/changed/details
            
        Returns:
            The new version string that was requested
        """
        # Parse current version
        current_version = self.get_version()
        match = re.match(r'(\d+)\.(\d+)\.(\d+)', current_version)
        if not match:
            raise ValueError(f"Cannot parse version: {current_version}")
        
        major, minor, patch = map(int, match.groups())
        new_patch = patch + 1
        new_version = f"{major}.{minor}.{new_patch}"
        
        # Create request file next to executable
        exe_dir = Path(sys.executable).parent
        request_file = exe_dir / "version_request.json"
        
        request_data = {
            "current_version": current_version,
            "new_version": new_version,
            "changelog": changelog.to_dict(),
            "timestamp": datetime.now().isoformat(),
            "requested_by": "brain.exe (frozen mode)"
        }
        
        with open(request_file, 'w', encoding='utf-8') as f:
            json.dump(request_data, f, indent=4, ensure_ascii=False)
        
        return new_version
    
    def _increment_dev_version(self, changelog: ChangelogEntry) -> str:
        """
        Increment version directly in development mode.
        
        Args:
            changelog: Changelog entry with added/changed/details
            
        Returns:
            New version string
            
        Raises:
            FileNotFoundError: If pyproject.toml not found
            ValueError: If version cannot be parsed
        """
        pyproject_path = self._find_pyproject_toml()
        if not pyproject_path:
            raise FileNotFoundError("pyproject.toml not found")
        
        content = pyproject_path.read_text(encoding='utf-8')
        
        # Parse current version
        match = re.search(r'version\s*=\s*["\'](\d+)\.(\d+)\.(\d+)["\']', content)
        if not match:
            raise ValueError("Version not found in pyproject.toml")
        
        major, minor, patch = map(int, match.groups())
        new_patch = patch + 1
        new_version = f"{major}.{minor}.{new_patch}"
        
        # Update version in pyproject.toml
        new_content = re.sub(
            r'version\s*=\s*["\'][^"\']+["\']',
            f'version = "{new_version}"',
            content
        )
        
        # Update changelog section in pyproject.toml
        new_content = self._update_changelog_in_toml(new_content, changelog)
        
        pyproject_path.write_text(new_content, encoding='utf-8')
        
        # Log the change in versions.json
        self._log_version_change(new_version, changelog)
        
        return new_version
    
    def _update_changelog_in_toml(self, content: str, changelog: ChangelogEntry) -> str:
        """
        Update the [tool.brain.changelog] section in pyproject.toml.
        
        Args:
            content: Current TOML content
            changelog: New changelog entry
            
        Returns:
            Updated TOML content
        """
        # Format changelog arrays
        def format_array(items: List[str]) -> str:
            if not items:
                return "[]"
            formatted_items = [f'    "{item}"' for item in items]
            return "[\n" + ",\n".join(formatted_items) + "\n]"
        
        added_str = format_array(changelog.added)
        changed_str = format_array(changelog.changed)
        details_str = format_array(changelog.details)
        
        # Find and replace changelog section
        changelog_pattern = r'\[tool\.brain\.changelog\].*?(?=\n\[|\Z)'
        
        new_changelog = f"""[tool.brain.changelog]
# Changelog semántico para versión actual
# Se actualiza automáticamente con: brain system version --added "..." --changed "..." --details "..."
added = {added_str}
changed = {changed_str}
details = {details_str}"""
        
        if re.search(changelog_pattern, content, re.DOTALL):
            # Replace existing changelog
            content = re.sub(changelog_pattern, new_changelog, content, flags=re.DOTALL)
        else:
            # Append new changelog section
            content += f"\n\n{new_changelog}\n"
        
        return content
    
    def _log_version_change(self, version: str, changelog: ChangelogEntry):
        """
        Log the version change to versions.json.
        
        Creates or appends to versions.json with timestamp and changelog.
        """
        versions_file = self._find_versions_file()
        
        # Load existing history
        if versions_file.exists():
            with open(versions_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
        else:
            data = {
                "project": "brain-cli",
                "history": []
            }
        
        # Create new entry
        new_entry = {
            "version": version,
            "timestamp": datetime.now().isoformat(),
            "changelog": changelog.to_dict()
        }
        
        data.setdefault("history", []).append(new_entry)
        
        # Save updated history
        with open(versions_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=4, ensure_ascii=False)
    
    def _find_versions_file(self) -> Path:
        """
        Find or create versions.json in the project root.
        """
        import brain
        root = Path(brain.__file__).parent.parent
        versions_path = root / "versions.json"
        if not versions_path.exists():
            versions_path.write_text(
                json.dumps({"project": "brain-cli", "history": []}, indent=4),
                encoding='utf-8'
            )
        return versions_path