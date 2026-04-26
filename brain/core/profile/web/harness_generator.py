# brain/core/profile/web/harness_generator.py

import shutil
from pathlib import Path
from typing import Dict, Any
from brain.shared.logger import get_logger

logger = get_logger(__name__)


def generate_harness_page(target_ext_dir: Path, profile_data: Dict[str, Any], dev_mode: bool = False) -> None:
    """
    Genera assets estáticos del Harness dentro del directorio de extensión.

    En dev_mode=False: no-op completo. No crea ningún archivo.
    En dev_mode=True: copia harness/ assets al extensionDir/harness/

    Patrón: idéntico a generate_discovery_page() — solo copia assets estáticos.
    La configuración (harness.synapse.config.js) es responsabilidad de Sentinel
    en el launch sequence (ignition_identity.go::prepareSessionFiles()).

    Args:
        target_ext_dir: Path a profiles/[UUID]/extension/
        profile_data: Dict con metadata del perfil (solo para logging)
        dev_mode: Si False, es no-op. Si True, despliega assets.
    """
    if not dev_mode:
        logger.debug("⏭️  Harness generator skipped (dev_mode=False)")
        return

    logger.info(f"🔧 Desplegando assets estáticos del Harness para: {profile_data.get('alias')}")

    harness_dir = target_ext_dir / "harness"
    harness_dir.mkdir(parents=True, exist_ok=True)

    _copy_static_assets(harness_dir)

    logger.info(f"  ✅ Assets del Harness desplegados en: {harness_dir}")
    logger.info(f"  ℹ️  harness.synapse.config.js será generado por Sentinel en launch")


def _copy_static_assets(harness_dir: Path) -> None:
    """
    Copia archivos estáticos desde templates/harness/ SIN modificaciones.
    No incluye archivos de configuración — son responsabilidad de Sentinel.
    """
    logger.debug("  📋 Copiando assets estáticos del Harness...")

    template_dir = Path(__file__).parent / "templates" / "harness"

    files_to_copy = [
        "index.html",
        "ionpump_protocol.js",
        "ion.manifest.json",
    ]

    copied = 0
    for file_name in files_to_copy:
        source = template_dir / file_name
        if source.exists():
            shutil.copy2(source, harness_dir / file_name)
            copied += 1
            logger.debug(f"    ✓ {file_name}")
        else:
            logger.warning(f"    ⚠️ Template no encontrado: {source}")

    logger.debug(f"  ✓ {copied}/{len(files_to_copy)} assets copiados")
