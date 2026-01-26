"""
Landing Page Generator - Profile dashboard interface.
Creates static HTML with embedded data.
"""

import json
import shutil
from pathlib import Path
from typing import Dict, Any
from datetime import datetime
from brain.shared.logger import get_logger

logger = get_logger(__name__)  # ✅ Agregar esta línea al inicio


def generate_profile_landing(target_ext_dir: Path, profile_data: Dict[str, Any]) -> None:
    """
    Generates landing page INSIDE the extension directory.
    
    Args:
        target_ext_dir: Path to profiles/[UUID]/extension/
        profile_data: Dict with {id, alias, created_at, linked_accounts, stats}
    """
    landing_dir = target_ext_dir / "landing"
    landing_dir.mkdir(parents=True, exist_ok=True)
    
    from brain.core.profile.path_resolver import PathResolver
    paths = PathResolver()
    
    _copy_static_assets(landing_dir)
    extension_id = paths.get_extension_id()
    _generate_data_loader(landing_dir, profile_data, extension_id)
    _generate_html(landing_dir, profile_data)
    _generate_manifest(landing_dir, profile_data)


def _copy_static_assets(landing_dir: Path) -> None:
    """Copies static CSS and JS from templates."""
    template_dir = Path(__file__).parent / "templates" / "landing"
    
    files_to_copy = [
        "styles.css",
        "landingProtocol.js",
        "landing.js",
        "index.html"
    ]
    
    for file_name in files_to_copy:
        source = template_dir / file_name
        if source.exists():
            shutil.copy2(source, landing_dir / file_name)
        else:
            logger.warning(f"Template not found: {source}")  # ✅ Cambio aquí


def _generate_data_loader(landing_dir: Path, profile_data: Dict[str, Any], extension_id: str) -> None:
    """
    Generates data-loader.js with injected profile data.
    """
    profile_json = {
        'id': profile_data.get('id'),
        'alias': profile_data.get('alias', 'Worker'),
        'role': profile_data.get('role', 'Worker'),
        'stats': {
            'totalLaunches': profile_data.get('total_launches', 0),
            'uptime': profile_data.get('uptime', 0),
            'intentsCompleted': profile_data.get('intents_done', 0),
            'lastSync': profile_data.get('last_synch')
        },
        'accounts': _format_linked_accounts(profile_data.get('linked_accounts', [])),
        'system': {
            'id': profile_data.get('id'),
            'created': profile_data.get('created_at'),
            'lastLaunch': datetime.now().isoformat()
        }
    }
    
    data_loader_content = f"""// ============================================================================
// DATA LOADER - Handles host-injected data
// Generated on: {datetime.now().isoformat()}
// ============================================================================

window.BLOOM_PROFILE_DATA = {json.dumps(profile_json, indent=2)};
window.BLOOM_EXTENSION_ID = '{extension_id}';
"""
    
    (landing_dir / "data-loader.js").write_text(data_loader_content, encoding='utf-8')
    logger.info(f"Generated data-loader.js for profile: {profile_data.get('alias')}")  # ✅ Cambio aquí


def _format_linked_accounts(accounts_data) -> list:
    """Formatea linked_accounts al formato esperado por el frontend."""
    if isinstance(accounts_data, list):
        return accounts_data
    
    if isinstance(accounts_data, dict):
        formatted = []
        for provider, data in accounts_data.items():
            account = {
                'provider': provider.capitalize(),
                'email': data.get('email'),
                'username': data.get('username'),
                'status': data.get('status', 'active')
            }
            formatted.append(account)
        return formatted
    
    return []


def _generate_html(landing_dir: Path, profile_data: Dict[str, Any]) -> None:
    """Copia el index.html template sin modificaciones."""
    template_dir = Path(__file__).parent / "templates" / "landing"
    template_path = template_dir / "index.html"
    
    if not template_path.exists():
        logger.warning(f"Template HTML not found: {template_path}")  # ✅ Cambio aquí
        return
    
    shutil.copy2(template_path, landing_dir / "index.html")
    logger.info("Copied index.html template")  # ✅ Cambio aquí


def _generate_manifest(landing_dir: Path, profile_data: Dict[str, Any]) -> None:
    """Generates manifest.json with profile metadata."""
    manifest = {
        "version": "1.0.0",
        "generated": datetime.now().isoformat(),
        "profile": {
            "id": profile_data.get('id'),
            "alias": profile_data.get('alias', 'Worker'),
            "role": profile_data.get('role', 'Worker'),
            "created": profile_data.get('created_at'),
            "lastLaunch": datetime.now().isoformat()
        },
        "accounts": _format_linked_accounts(profile_data.get('linked_accounts', [])),
        "stats": {
            "totalLaunches": profile_data.get('total_launches', 0),
            "uptime": profile_data.get('uptime', 0),
            "intentsCompleted": profile_data.get('intents_done', 0),
            "lastSync": profile_data.get('last_synch')
        }
    }
    
    (landing_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False),
        encoding='utf-8'
    )
    logger.info("Generated manifest.json")  # ✅ Cambio aquí


def update_landing_data(landing_dir: Path, stats_update: Dict[str, Any]) -> None:
    """Actualiza solo los stats en un landing existente."""
    data_loader_path = landing_dir / "data-loader.js"
    
    if not data_loader_path.exists():
        logger.warning("data-loader.js not found, cannot update")  # ✅ Cambio aquí
        return
    
    content = data_loader_path.read_text(encoding='utf-8')
    
    import re
    match = re.search(r'window\.BLOOM_PROFILE_DATA = ({.*?});', content, re.DOTALL)
    
    if not match:
        logger.warning("Could not parse BLOOM_PROFILE_DATA")  # ✅ Cambio aquí
        return
    
    try:
        current_data = json.loads(match.group(1))
        
        if 'stats' not in current_data:
            current_data['stats'] = {}
        
        current_data['stats'].update({
            'totalLaunches': stats_update.get('total_launches', current_data['stats'].get('totalLaunches', 0)),
            'uptime': stats_update.get('uptime', current_data['stats'].get('uptime', 0)),
            'intentsCompleted': stats_update.get('intents_done', current_data['stats'].get('intentsCompleted', 0)),
            'lastSync': stats_update.get('last_synch', current_data['stats'].get('lastSync'))
        })
        
        if 'system' in current_data:
            current_data['system']['lastLaunch'] = datetime.now().isoformat()
        
        new_content = content.replace(
            match.group(0),
            f"window.BLOOM_PROFILE_DATA = {json.dumps(current_data, indent=2)};"
        )
        
        data_loader_path.write_text(new_content, encoding='utf-8')
        logger.info(f"Updated landing stats: launches={stats_update.get('total_launches')}, intents={stats_update.get('intents_done')}")  # ✅ Cambio aquí
        
    except json.JSONDecodeError as e:
        logger.error(f"Error parsing JSON: {e}")  # ✅ Cambio aquí