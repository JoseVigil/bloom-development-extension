"""
Discovery Page Generator - Extension validation interface.
Creates dynamic config.js and copies static assets.
"""

import json
import shutil
from pathlib import Path
from typing import Dict, Any
from datetime import datetime


def generate_discovery_page(profile_path: Path, profile_data: Dict[str, Any]) -> None:
    """
    Generates discovery/validation page for profile.
    
    Args:
        profile_path: Path to profile directory
        profile_data: Dict with profile metadata
    """
    discovery_dir = profile_path / "discovery"
    discovery_dir.mkdir(parents=True, exist_ok=True)
    
    # Generate dynamic configuration
    _write_config_js(discovery_dir, profile_data)
    
    # Copy static assets
    _copy_static_assets(discovery_dir)


def _write_config_js(discovery_dir: Path, profile_data: Dict[str, Any]) -> None:
    """
    Writes config.js with profile-specific data.
    Avoids CSP issues by keeping dynamic data external.
    """
    from brain.core.profile.path_resolver import PathResolver
    paths = PathResolver()
    
    config_dict = {
        "extension_id": paths.extension_id,
        "profile_id": profile_data.get('id'),
        "profile_alias": profile_data.get('alias'),
        "bridge_name": profile_data.get('bridge_name', 'com.bloom.synapse.unknown'),
        "timestamp": datetime.now().isoformat()
    }
    
    content = f"window.BLOOM_CONFIG = {json.dumps(config_dict, indent=2)};"
    (discovery_dir / "config.js").write_text(content, encoding='utf-8')


def _copy_static_assets(discovery_dir: Path) -> None:
    """Copies static HTML, CSS, and JS from templates."""
    template_dir = Path(__file__).parent / "templates" / "discovery"
    
    files_to_copy = ["index.html", "script.js", "styles.css"]
    
    for file_name in files_to_copy:
        source = template_dir / file_name
        if source.exists():
            shutil.copy2(source, discovery_dir / file_name)