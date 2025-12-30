"""
ExtensionManager - Core logic for Chrome extension lifecycle management
Handles installation, updates, verification, and backup management.
"""

import json
import shutil
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, List, Any


class ExtensionManager:
    """
    Manages Bloom Chrome Extension installation and version control.
    Returns pure data structures without CLI dependencies.
    """
    
    EXCLUDED_PATTERNS = {
        'node_modules', '.git', '__pycache__', '.DS_Store',
        '*.map', '*.ts', 'tsconfig.json'
    }
    
    def __init__(self, base_path: Optional[Path] = None):
        """
        Initialize extension manager with paths.
        
        Args:
            base_path: Base directory for extension files (auto-detects if None)
        """
        if base_path is None:
            base_path = self._get_default_base_path()
        
        self.base_path = base_path
        self.extension_dir = base_path / 'extension'
        self.backups_dir = base_path / 'extension-backups'
        self.config_dir = base_path / 'config'
        self.version_file = self.config_dir / 'extension-version.json'
    
    # ========================================================================
    # INSTALLATION
    # ========================================================================
    
    def install(self, source_dir: Optional[Path] = None) -> Dict[str, Any]:
        """
        Install extension to permanent location.
        
        Args:
            source_dir: Source directory (auto-detects if None)
            
        Returns:
            Dict with installation result:
            {
                "success": bool,
                "action": "installed" | "updated" | "already_installed",
                "version": str,
                "previous_version": str | None,
                "error": str | None
            }
        """
        # Auto-detect source if not provided
        if not source_dir:
            source_dir = self._find_extension_source()
        
        if not source_dir:
            return {
                'success': False,
                'error': 'Extension source not found'
            }
        
        # Validate source has manifest
        manifest_path = source_dir / 'manifest.json'
        if not manifest_path.exists():
            return {
                'success': False,
                'error': f'manifest.json not found at {manifest_path}'
            }
        
        # Load manifest to get version
        try:
            with open(manifest_path, 'r', encoding='utf-8') as f:
                manifest = json.load(f)
        except Exception as e:
            return {
                'success': False,
                'error': f'Failed to read manifest: {e}'
            }
        
        new_version = manifest.get('version')
        if not new_version:
            return {
                'success': False,
                'error': 'No version found in manifest.json'
            }
        
        # Check current version
        current_version = self.get_current_version()
        
        if current_version == new_version:
            return {
                'success': True,
                'action': 'already_installed',
                'version': current_version
            }
        
        # Backup current version if exists
        if current_version:
            self._backup_current_version(current_version)
        
        # Install extension
        try:
            self._copy_extension_files(source_dir, self.extension_dir)
            
            # Save version metadata
            self._save_version_info({
                'version': new_version,
                'installed_at': datetime.now().isoformat(),
                'source': str(source_dir),
                'manifest': manifest
            })
            
            return {
                'success': True,
                'action': 'updated' if current_version else 'installed',
                'version': new_version,
                'previous_version': current_version
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': f'Installation failed: {e}'
            }
    
    # ========================================================================
    # UPDATE
    # ========================================================================
    
    def update(self, source_dir: Optional[Path] = None) -> Dict[str, Any]:
        """
        Update extension if new version available.
        
        Args:
            source_dir: Source directory (auto-detects if None)
            
        Returns:
            Dict with update result (same structure as install())
        """
        if not source_dir:
            source_dir = self._find_extension_source()
        
        if not source_dir:
            return {
                'success': False,
                'error': 'Extension source not found'
            }
        
        # Read new version
        manifest_path = source_dir / 'manifest.json'
        try:
            with open(manifest_path, 'r', encoding='utf-8') as f:
                new_manifest = json.load(f)
        except Exception as e:
            return {
                'success': False,
                'error': f'Failed to read source manifest: {e}'
            }
        
        new_version = new_manifest.get('version')
        current_version = self.get_current_version()
        
        # No extension installed
        if not current_version:
            return self.install(source_dir)
        
        # Already up to date
        if current_version == new_version:
            return {
                'success': True,
                'action': 'no_update_needed',
                'version': current_version
            }
        
        # Update available
        return self.install(source_dir)
    
    # ========================================================================
    # VERIFICATION
    # ========================================================================
    
    def verify(self) -> Dict[str, Any]:
        """
        Verify extension installation integrity.
        
        Returns:
            Dict with verification result:
            {
                "success": bool,
                "version": str | None,
                "checks": {
                    "directory": bool,
                    "manifest": bool,
                    "background": bool,
                    "content": bool,
                    "version_info": bool
                }
            }
        """
        checks = {
            'directory': self.extension_dir.exists(),
            'manifest': (self.extension_dir / 'manifest.json').exists(),
            'background': (self.extension_dir / 'background.js').exists(),
            'content': (self.extension_dir / 'content.js').exists(),
            'version_info': self.version_file.exists()
        }
        
        all_valid = all(checks.values())
        version = self.get_current_version() if all_valid else None
        
        return {
            'success': all_valid,
            'version': version,
            'checks': checks
        }
    
    # ========================================================================
    # VERSION MANAGEMENT
    # ========================================================================
    
    def get_current_version(self) -> Optional[str]:
        """
        Get currently installed version.
        
        Returns:
            Version string or None if not installed
        """
        try:
            # Try version file first
            if self.version_file.exists():
                with open(self.version_file, 'r', encoding='utf-8') as f:
                    info = json.load(f)
                return info.get('version')
            
            # Fallback: read from manifest
            manifest_path = self.extension_dir / 'manifest.json'
            if manifest_path.exists():
                with open(manifest_path, 'r', encoding='utf-8') as f:
                    manifest = json.load(f)
                return manifest.get('version')
            
            return None
            
        except Exception:
            return None
    
    # ========================================================================
    # BACKUP MANAGEMENT
    # ========================================================================
    
    def list_backups(self) -> List[Dict[str, Any]]:
        """
        List all available backups.
        
        Returns:
            List of backup metadata dicts:
            [
                {
                    "version": str,
                    "path": str,
                    "date": datetime
                },
                ...
            ]
        """
        if not self.backups_dir.exists():
            return []
        
        backups = []
        for backup_dir in self.backups_dir.iterdir():
            if not backup_dir.is_dir():
                continue
            
            manifest_path = backup_dir / 'manifest.json'
            if not manifest_path.exists():
                continue
            
            try:
                with open(manifest_path, 'r', encoding='utf-8') as f:
                    manifest = json.load(f)
                
                backups.append({
                    'version': manifest.get('version', 'unknown'),
                    'path': str(backup_dir),
                    'date': datetime.fromtimestamp(backup_dir.stat().st_mtime)
                })
            except Exception:
                continue
        
        return sorted(backups, key=lambda x: x['date'], reverse=True)
    
    def restore_backup(self, version: str) -> Dict[str, Any]:
        """
        Restore a specific backup version.
        
        Args:
            version: Version to restore
            
        Returns:
            Dict with restoration result:
            {
                "success": bool,
                "version": str,
                "previous_version": str | None,
                "error": str | None
            }
        """
        backup_dir = self.backups_dir / version
        
        if not backup_dir.exists():
            return {
                'success': False,
                'error': f'Backup for version {version} not found'
            }
        
        # Backup current version
        current_version = self.get_current_version()
        if current_version:
            self._backup_current_version(current_version)
        
        # Restore backup
        try:
            self._copy_extension_files(backup_dir, self.extension_dir)
            
            self._save_version_info({
                'version': version,
                'installed_at': datetime.now().isoformat(),
                'restored_from': current_version,
                'action': 'restored'
            })
            
            return {
                'success': True,
                'version': version,
                'previous_version': current_version
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': f'Restore failed: {e}'
            }
    
    # ========================================================================
    # PRIVATE HELPERS
    # ========================================================================
    
    def _get_default_base_path(self) -> Path:
        """Get default base path based on OS."""
        import os
        if os.name == 'nt':  # Windows
            base = Path(os.getenv('LOCALAPPDATA')) / 'BloomNucleus'
        else:  # macOS/Linux
            base = Path.home() / '.bloom'
        return base
    
    def _find_extension_source(self) -> Optional[Path]:
        """
        Auto-detect extension source from common locations.
        
        Returns:
            Path to source directory or None if not found
        """
        possible_sources = [
            # From installer
            Path(__file__).parents[3] / 'installer' / 'chrome-extension' / 'src',
            
            # From resources (packaged app)
            self.base_path.parent / 'resources' / 'extension',
            
            # From repo
            Path.cwd() / 'installer' / 'chrome-extension' / 'src',
            Path.cwd() / 'chrome-extension' / 'src',
        ]
        
        for source in possible_sources:
            manifest_path = source / 'manifest.json'
            if manifest_path.exists():
                return source
        
        return None
    
    def _copy_extension_files(self, source: Path, dest: Path):
        """
        Copy extension files excluding development artifacts.
        
        Args:
            source: Source directory
            dest: Destination directory
        """
        # Create destination
        dest.mkdir(parents=True, exist_ok=True)
        
        # Clean destination
        for item in dest.iterdir():
            if item.is_file():
                item.unlink()
            elif item.is_dir():
                shutil.rmtree(item)
        
        # Copy files
        for item in source.iterdir():
            # Skip excluded patterns
            if item.name in self.EXCLUDED_PATTERNS:
                continue
            if item.suffix in ['.map', '.ts']:
                continue
            
            dest_item = dest / item.name
            
            if item.is_file():
                shutil.copy2(item, dest_item)
            elif item.is_dir():
                shutil.copytree(item, dest_item, dirs_exist_ok=True)
    
    def _backup_current_version(self, version: str):
        """
        Create backup of current version.
        
        Args:
            version: Version to backup
        """
        if not self.extension_dir.exists():
            return
        
        backup_dir = self.backups_dir / version
        self.backups_dir.mkdir(parents=True, exist_ok=True)
        
        # Copy current to backup
        shutil.copytree(self.extension_dir, backup_dir, dirs_exist_ok=True)
        
        # Cleanup old backups (keep last 3)
        self._cleanup_old_backups(keep_last=3)
    
    def _cleanup_old_backups(self, keep_last: int = 3):
        """
        Remove old backups, keeping only the most recent ones.
        
        Args:
            keep_last: Number of backups to keep
        """
        backups = self.list_backups()
        
        if len(backups) <= keep_last:
            return
        
        # Delete oldest backups
        to_delete = backups[keep_last:]
        for backup in to_delete:
            backup_path = Path(backup['path'])
            shutil.rmtree(backup_path)
    
    def _save_version_info(self, info: Dict[str, Any]):
        """
        Save version metadata to config file.
        
        Args:
            info: Version information dict
        """
        self.config_dir.mkdir(parents=True, exist_ok=True)
        with open(self.version_file, 'w', encoding='utf-8') as f:
            json.dump(info, f, indent=2, ensure_ascii=False)