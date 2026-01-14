"""
Discovery Page Generator - Extension validation interface.
Creates dynamic config.js and copies static assets.
"""

import json
import shutil
from pathlib import Path
from typing import Dict, Any
from datetime import datetime
from brain.shared.logger import get_logger

logger = get_logger(__name__)


def generate_discovery_page(target_ext_dir: Path, profile_data: Dict[str, Any]) -> None:
    """
    Generates discovery page INSIDE the extension directory.
    
    Args:
        target_ext_dir: Path to profiles/[UUID]/extension/
        profile_data: Dict with profile metadata
    """
    logger.info(f"🔍 Generando discovery page para perfil: {profile_data.get('alias')}")
    
    discovery_dir = target_ext_dir / "discovery"
    discovery_dir.mkdir(parents=True, exist_ok=True)
    
    # Generate dynamic configuration
    _write_config_js(discovery_dir, profile_data)
    
    # Copy static assets
    _copy_static_assets(discovery_dir)
    
    logger.info(f"  ✅ Discovery page generada en: {discovery_dir}")


def _write_config_js(discovery_dir: Path, profile_data: Dict[str, Any]) -> None:
    """
    Writes config.js with profile-specific data.
    Avoids CSP issues by keeping dynamic data external.
    """
    logger.debug("  ⚙️ Generando config.js...")
    
    from brain.core.profile.path_resolver import PathResolver
    paths = PathResolver()
    
    config_dict = {
        "extension_id": "hpblclepliicmihaplldignhjdggnkdh",
        "profile_id": profile_data.get('id'),
        "profile_alias": profile_data.get('alias'),
        "bridge_name": f"com.bloom.synapse.{profile_data.get('id')[:8]}",
        "timestamp": datetime.now().isoformat()
    }
    
    content = f"window.BLOOM_CONFIG = {json.dumps(config_dict, indent=2)};"
    (discovery_dir / "config.js").write_text(content, encoding='utf-8')
    
    logger.debug("    ✓ config.js generado")


def _copy_static_assets(discovery_dir: Path) -> None:
    """Copies static HTML, CSS, and JS from templates."""
    logger.debug("  📋 Copiando assets estáticos...")
    
    template_dir = Path(__file__).parent / "templates" / "discovery"
    
    files_to_copy = ["index.html", "script.js", "styles.css"]
    
    copied = 0
    for file_name in files_to_copy:
        source = template_dir / file_name
        if source.exists():
            shutil.copy2(source, discovery_dir / file_name)
            copied += 1
            logger.debug(f"    ✓ {file_name}")
        else:
            logger.warning(f"    ⚠️ Template no encontrado: {source}")
    
    logger.debug(f"  ✓ {copied}/{len(files_to_copy)} assets copiados")