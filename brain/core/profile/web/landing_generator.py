"""
Landing Page Generator - Profile dashboard interface.
Creates static HTML with embedded data.
"""

import json
import shutil
from pathlib import Path
from typing import Dict, Any
from datetime import datetime


def generate_profile_landing(profile_path: Path, profile_data: Dict[str, Any]) -> None:
    """
    Generates landing page for profile.
    
    Args:
        profile_path: Path to profile directory
        profile_data: Dict with {id, alias, created_at, linked_account}
    """
    landing_dir = profile_path / "landing"
    landing_dir.mkdir(parents=True, exist_ok=True)
    
    from brain.core.profile.path_resolver import PathResolver
    paths = PathResolver()
    
    _copy_static_assets(landing_dir)
    _generate_html(landing_dir, profile_data, paths.extension_id)
    _generate_manifest(landing_dir, profile_data)


def _copy_static_assets(landing_dir: Path) -> None:
    """Copies static CSS and JS from templates."""
    template_dir = Path(__file__).parent / "templates" / "landing"
    
    files_to_copy = ["styles.css", "script.js"]
    
    for file_name in files_to_copy:
        source = template_dir / file_name
        if source.exists():
            shutil.copy2(source, landing_dir / file_name)


def _generate_html(landing_dir: Path, profile_data: Dict[str, Any], extension_id: str) -> None:
    """Generates index.html with injected profile data."""
    template_dir = Path(__file__).parent / "templates" / "landing"
    template_path = template_dir / "index.html"
    
    if not template_path.exists():
        return
    
    template_content = template_path.read_text(encoding='utf-8')
    
    profile_json = {
        'id': profile_data.get('id'),
        'alias': profile_data.get('alias'),
        'role': 'Worker Profile',
        'created': profile_data.get('created_at'),
        'lastLaunch': datetime.now().isoformat(),
        'accounts': profile_data.get('accounts', {}),
        'stats': {
            'totalLaunches': 0,
            'uptime': '0h',
            'intentsCompleted': 0,
            'lastSync': None
        }
    }
    
    html_content = template_content.replace('{{PROFILE_ALIAS}}', profile_data.get('alias', 'Worker'))
    html_content = html_content.replace('{{PROFILE_DATA_JSON}}', json.dumps(profile_json, indent=2))
    html_content = html_content.replace('{{EXTENSION_ID}}', extension_id)
    
    (landing_dir / "index.html").write_text(html_content, encoding='utf-8')


def _generate_manifest(landing_dir: Path, profile_data: Dict[str, Any]) -> None:
    """Generates manifest.json with profile metadata."""
    manifest = {
        "version": "1.0.0",
        "generated": datetime.now().isoformat(),
        "profile": {
            "id": profile_data.get('id'),
            "alias": profile_data.get('alias'),
            "role": "Worker Profile",
            "created": profile_data.get('created_at'),
            "lastLaunch": datetime.now().isoformat()
        },
        "accounts": profile_data.get('accounts', {}),
        "stats": {
            "totalLaunches": 0,
            "uptime": "0h",
            "intentsCompleted": 0,
            "lastSync": None
        }
    }
    
    (landing_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False),
        encoding='utf-8'
    )