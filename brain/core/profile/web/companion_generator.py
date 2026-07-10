# brain/core/profile/web/companion_generator.py

import shutil
from pathlib import Path
from typing import Dict, Any
from brain.shared.logger import get_logger

logger = get_logger(__name__)


def generate_companion_page(target_ext_dir: Path, profile_data: Dict[str, Any]) -> None:
    """
    Genera assets estáticos del Companion dentro del directorio de extensión.

    A diferencia de discovery/landing/harness, el Companion (guía v1.2 §6) no
    tiene un *.synapse.config.js con identidad de sesión — companionProtocol.js
    es un manifiesto de protocolo estático (declara INJECT_BISP, INJECT_BRIEF,
    INJECT_TEXT, NEW_SESSION) y no requiere generación en el launch sequence.

    Patrón: idéntico a generate_harness_page() — solo copia assets estáticos.

    Args:
        target_ext_dir: Path a profiles/[UUID]/extension/
        profile_data: Dict con metadata del perfil (solo para logging)
    """
    logger.info(f"🔧 Desplegando assets estáticos del Companion para: {profile_data.get('alias')}")

    companion_dir = target_ext_dir / "companion"
    companion_dir.mkdir(parents=True, exist_ok=True)

    _copy_static_assets(companion_dir)

    logger.info(f"  ✅ Assets del Companion desplegados en: {companion_dir}")


def _copy_static_assets(companion_dir: Path) -> None:
    """
    Copia archivos estáticos desde templates/companion/ SIN modificaciones.
    No hay archivos de configuración que excluir — el Companion no tiene
    equivalente a *.synapse.config.js.
    """
    logger.debug("  📋 Copiando assets estáticos del Companion...")

    template_dir = Path(__file__).parent / "templates" / "companion"

    files_to_copy = [
        "index.html",
        "companion.js",
        "companionProtocol.js",
        "styles.css",
    ]

    copied = 0
    for file_name in files_to_copy:
        source = template_dir / file_name
        if source.exists():
            shutil.copy2(source, companion_dir / file_name)
            copied += 1
            logger.debug(f"    ✓ {file_name}")
        else:
            logger.warning(f"    ⚠️ Template no encontrado: {source}")

    logger.debug(f"  ✓ {copied}/{len(files_to_copy)} assets copiados")
