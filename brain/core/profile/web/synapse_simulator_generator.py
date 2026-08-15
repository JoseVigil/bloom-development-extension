# brain/core/profile/web/synapse_simulator_generator.py

import shutil
from pathlib import Path
from typing import Dict, Any
from brain.shared.logger import get_logger

logger = get_logger(__name__)


def generate_synapse_simulator_page(target_ext_dir: Path, profile_data: Dict[str, Any], dev_mode: bool = False) -> None:
    """
    Genera assets estáticos del SynapseSimulator dentro del directorio de extensión.

    Siempre despliega los assets estáticos de synapse-simulator/ al extensionDir/synapse-simulator/.
    El parámetro dev_mode se mantiene por compatibilidad pero ya no suprime el deploy.

    Patrón: idéntico a generate_discovery_page() — solo copia assets estáticos.
    La configuración (synapse-simulator.synapse.config.js) es responsabilidad de Sentinel
    en el launch sequence (ignition_identity.go::prepareSessionFiles()).

    Args:
        target_ext_dir: Path a profiles/[UUID]/extension/
        profile_data: Dict con metadata del perfil (solo para logging)
        dev_mode: Reservado para uso futuro. Ya no suprime el despliegue.
    """
    # TODO: dev_mode puede usarse a futuro para assets o config adicional de desarrollo.
    # Por ahora synapse-simulator siempre se despliega igual que discovery y landing.

    logger.info(f"🔧 Desplegando assets estáticos del SynapseSimulator para: {profile_data.get('alias')}")

    synapse_simulator_dir = target_ext_dir / "synapse-simulator"
    synapse_simulator_dir.mkdir(parents=True, exist_ok=True)

    _copy_static_assets(synapse_simulator_dir)

    logger.info(f"  ✅ Assets del SynapseSimulator desplegados en: {synapse_simulator_dir}")
    logger.info(f"  ℹ️  synapse-simulator.synapse.config.js será generado por Sentinel en launch")



def _copy_static_assets(synapse_simulator_dir: Path) -> None:
    """
    Copia archivos estáticos desde templates/synapse-simulator/ SIN modificaciones.
    No incluye archivos de configuración — son responsabilidad de Sentinel.
    """
    logger.debug("  📋 Copiando assets estáticos del SynapseSimulator...")

    template_dir = Path(__file__).parent / "templates" / "synapse-simulator"

    files_to_copy = [
        "index.html",
        "synapse-simulator.js",
        "synapseSimulatorProtocol.js",
    ]

    copied = 0
    for file_name in files_to_copy:
        source = template_dir / file_name
        if source.exists():
            shutil.copy2(source, synapse_simulator_dir / file_name)
            copied += 1
            logger.debug(f"    ✓ {file_name}")
        else:
            logger.warning(f"    ⚠️ Template no encontrado: {source}")

    logger.debug(f"  ✓ {copied}/{len(files_to_copy)} assets copiados")
