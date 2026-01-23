"""
Discovery Page Generator - Extension validation interface.
Creates static HTML with embedded data (CSP compliant).
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
    
    from brain.core.profile.path_resolver import PathResolver
    paths = PathResolver()
    
    # Copy static assets (sin modificar)
    _copy_static_assets(discovery_dir)
    
    # Generate dynamic config file (único archivo con datos inyectados)
    _generate_config_file(discovery_dir, profile_data, paths.extension_id)
    
    logger.info(f"  ✅ Discovery page generada en: {discovery_dir}")


def _copy_static_assets(discovery_dir: Path) -> None:
    """Copies static HTML, CSS, and JS from templates WITHOUT modifications."""
    logger.debug("  📋 Copiando assets estáticos...")
    
    template_dir = Path(__file__).parent / "templates" / "discovery"
    
    # Archivos estáticos a copiar (sin modificación)
    files_to_copy = [
        "index.html",
        "discovery.js",
        "discoveryProtocol.js",
        "content-aistudio.js",
        "onboarding.js",
        "styles.css"
    ]
    
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


def _generate_config_file(discovery_dir: Path, profile_data: Dict[str, Any], extension_id: str) -> None:
    """
    Generates discovery.synapse.config.js with injected profile data.
    Este archivo ES MODULE reemplaza los placeholders con datos reales.
    """
    logger.debug("  ⚙️ Generando discovery.synapse.config.js...")
    
    # Construir objeto de configuración completo
    config_data = {
        'profileId': profile_data.get('id'),
        'bridge_name': f"com.bloom.synapse.{profile_data.get('id')[:8]}",
        'launchId': _generate_launch_id(profile_data.get('id')),
        'profile_alias': profile_data.get('alias', 'Worker'),
        'extension_id': extension_id,
        'register': profile_data.get('register', True),
        'email': profile_data.get('email')
    }
    
    # Generar contenido del config como ES module
    config_content = f"""// ============================================================================
// SYNAPSE DISCOVERY CONFIG - Auto-generated
// Generated on: {datetime.now().isoformat()}
// Profile: {profile_data.get('alias')}
// ============================================================================

export const SYNAPSE_CONFIG = {json.dumps(config_data, indent=4)};
"""
    
    config_path = discovery_dir / "discovery.synapse.config.js"
    config_path.write_text(config_content, encoding='utf-8')
    
    logger.debug(f"    ✓ discovery.synapse.config.js generado")
    logger.debug(f"      Profile: {config_data['profile_alias']}")
    logger.debug(f"      Register: {config_data['register']}")
    logger.debug(f"      Email: {config_data['email']}")


def _generate_launch_id(profile_id: str) -> str:
    """
    Generates a unique launch ID for this session.
    Format: XXX_XXXXXXXX_HHMMSS
    """
    from datetime import datetime
    import random
    
    now = datetime.now()
    sequence = str(random.randint(0, 999)).zfill(3)
    short_id = profile_id[:8] if profile_id else "unknown"
    timestamp = now.strftime("%H%M%S")
    
    return f"{sequence}_{short_id}_{timestamp}"


# ============================================================================
# HELPER: Update discovery config (para cambios de register/email)
# ============================================================================

def update_discovery_config(discovery_dir: Path, updates: Dict[str, Any]) -> None:
    """
    Actualiza el config de discovery sin regenerar todo.
    Útil para cambios de register=False después del onboarding.
    
    Args:
        discovery_dir: Path to discovery/
        updates: Dict con {register: bool, email: str}
    """
    config_path = discovery_dir / "discovery.synapse.config.js"
    
    if not config_path.exists():
        logger.warning(f"⚠️ discovery.synapse.config.js not found, cannot update")
        return
    
    # Leer el archivo actual
    content = config_path.read_text(encoding='utf-8')
    
    # Extraer el JSON actual
    import re
    match = re.search(r'export const SYNAPSE_CONFIG = ({.*?});', content, re.DOTALL)
    
    if not match:
        logger.warning(f"⚠️ Could not parse SYNAPSE_CONFIG")
        return
    
    try:
        current_config = json.loads(match.group(1))
        
        # Actualizar campos
        if 'register' in updates:
            current_config['register'] = updates['register']
            logger.debug(f"  Updated register: {updates['register']}")
        
        if 'email' in updates:
            current_config['email'] = updates['email']
            logger.debug(f"  Updated email: {updates['email']}")
        
        # Reescribir el archivo
        new_content = content.replace(
            match.group(0),
            f"export const SYNAPSE_CONFIG = {json.dumps(current_config, indent=4)};"
        )
        
        config_path.write_text(new_content, encoding='utf-8')
        logger.info(f"✅ Updated discovery config: register={current_config.get('register')}, email={current_config.get('email')}")
        
    except json.JSONDecodeError as e:
        logger.error(f"❌ Error parsing JSON: {e}")