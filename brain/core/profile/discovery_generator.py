"""
Generador de página de discovery/validación para perfiles de Chrome.
Valida conexión Extension <-> Native Host durante instalación.
"""

import json
from pathlib import Path
from typing import Dict, Any
from datetime import datetime
from brain.core.profile.path_resolver import PathResolver


def generate_discovery_page(profile_path: Path, profile_data: Dict[str, Any]) -> None:
    discovery_dir = profile_path / "discovery"
    discovery_dir.mkdir(parents=True, exist_ok=True)
    
    # 1. Escribir el archivo DINÁMICO (El que cambia por perfil)
    # Lo creamos como un archivo .js independiente para saltar el CSP
    _write_config_js(discovery_dir, profile_data)
    
    # 2. Copiar los archivos ESTÁTICOS (Los que son siempre iguales)
    _copy_static_assets(discovery_dir)


def _write_config_js(discovery_dir: Path, profile_data: Dict[str, Any]) -> None:
    """Crea el archivo config.js con los datos únicos del perfil"""
    config_dict = {
        "extension_id": profile_data.get('extension_id', 'hpblclepliicmihaplldignhjdggnkdh'),
        "profile_id": profile_data.get('id'),
        "profile_alias": profile_data.get('alias'),
        "timestamp": datetime.now().isoformat()
    }
    
    # Escribimos el JS que define la variable global
    content = f"window.BLOOM_CONFIG = {json.dumps(config_dict, indent=2)};"
    (discovery_dir / "config.js").write_text(content, encoding='utf-8')


def _copy_static_assets(discovery_dir: Path) -> None:
    """Copia el resto de los archivos desde la carpeta de templates de Brain"""
    import shutil
    template_dir = Path(__file__).parent / "html" / "discovery"
    
    files_to_copy = ["index.html", "script.js", "styles.css"]
    
    for file_name in files_to_copy:
        source = template_dir / file_name
        if source.exists():
            shutil.copy2(source, discovery_dir / file_name)
        else:
            print(f"⚠️ Error: No se encontró el template {source}")