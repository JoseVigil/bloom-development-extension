"""
Static landing page generator for Chrome profiles.
Self-contained HTML/CSS/JS with no external dependencies.
"""

import json
import shutil
from pathlib import Path
from typing import Dict, Any
from datetime import datetime
from brain.core.profile.path_resolver import PathResolver


def generate_profile_landing(profile_path: Path, profile_data: Dict[str, Any]) -> None:
    """
    Generate static landing page for profile.
    
    Args:
        profile_path: Path to profile directory (e.g., profiles/abc-123/)
        profile_data: Dict with {id, alias, created_at, linked_account}
    """
    landing_dir = profile_path / "landing"
    landing_dir.mkdir(parents=True, exist_ok=True)
    
    paths = PathResolver()
    extension_id = paths.extension_id
    
    _copy_static_assets(landing_dir)
    _generate_html(landing_dir, profile_data, extension_id)
    _generate_manifest(landing_dir, profile_data)


def _copy_static_assets(landing_dir: Path) -> None:
    """Copy static assets from templates directory."""
    template_dir = Path(__file__).parent / "html" / "landing"
    
    files_to_copy = ["styles.css", "script.js"]
    
    for file_name in files_to_copy:
        source = template_dir / file_name
        if source.exists():
            shutil.copy2(source, landing_dir / file_name)
        else:
            print(f"⚠️ Error: Template not found {source}")


def _generate_html(landing_dir: Path, profile_data: Dict[str, Any], extension_id: str) -> None:
    """Generate index.html from template with injected data."""
    template_dir = Path(__file__).parent / "html" / "landing"
    template_path = template_dir / "index.html"
    
    if not template_path.exists():
        print(f"⚠️ Error: Template not found {template_path}")
        return
    
    template_content = template_path.read_text(encoding='utf-8')
    
    profile_json = {
        'id': profile_data.get('id'),
        'alias': profile_data.get('alias'),
        'role': 'Worker Profile',
        'created': profile_data.get('created_at'),
        'lastLaunch': datetime.now().isoformat(),
        'accounts': [],
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
    """Generate manifest.json with profile metadata."""
    
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
        "accounts": [],
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