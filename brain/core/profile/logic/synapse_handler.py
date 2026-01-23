"""
Synapse Bridge Handler - Gestión de puentes y extensiones.
Versión v2.3 - Autoridad delegada a Sentinel (Go).
Python solo gestiona carpetas y archivos locales del perfil.
"""

import json
import shutil
from pathlib import Path
from brain.shared.logger import get_logger

logger = get_logger(__name__)


class SynapseHandler:
    """
    Gestiona la configuración de extensión Synapse para perfiles.
    
    IMPORTANTE: Sentinel (Go) maneja:
    - Registro de Windows
    - Manifiestos nativos en carpeta synapse/
    
    Python (Brain) solo maneja:
    - Clonación de la extensión base al perfil
    - Generación de páginas discovery/landing
    - Retorno del bridge_name para que Sentinel lo registre
    """
    
    def __init__(self, base_dir: Path, extension_id: str):
        """
        Args:
            base_dir: Directorio base de perfiles y binarios
            extension_id: ID de la extensión Chrome para allowed_origins
        """
        logger.info("🔧 Inicializando SynapseHandler (v2.3 - Sentinel Authority)")
        logger.debug(f"  Base dir: {base_dir}")
        logger.debug(f"  Extension ID: {extension_id}")
        
        self.base_dir = Path(base_dir) if not isinstance(base_dir, Path) else base_dir
        self.extension_id = extension_id
        self.extension_template = base_dir / "extension"
        
        logger.debug(f"  Extension template: {self.extension_template}")
        
        if not self.extension_template.exists():
            logger.warning(f"⚠️ Extension template no encontrada: {self.extension_template}")
        else:
            logger.debug("✅ Extension template existe")
    
    def provision_bridge(self, profile_id: str) -> str:
        """
        Provisiona un bridge único para un perfil.
        
        SCOPE LIMITADO (v2.3):
        - Retorna el bridge_name (formato: com.bloom.synapse.[short_id])
        - Asegura que la carpeta del perfil exista
        - NO escribe manifiestos nativos (responsabilidad de Sentinel)
        - NO toca el registro de Windows (responsabilidad de Sentinel)
        
        Args:
            profile_id: UUID completo del perfil
            
        Returns:
            bridge_name: e.g., 'com.bloom.synapse.abc12345'
        """
        short_id = profile_id[:8]
        bridge_name = f"com.bloom.synapse.{short_id}"
        
        logger.info(f"🌉 Provisioning bridge para perfil: {short_id}...")
        logger.debug(f"  Full profile ID: {profile_id}")
        logger.debug(f"  Bridge name: {bridge_name}")
        
        # Asegurar que la carpeta del perfil existe
        profile_dir = self.base_dir / "profiles" / profile_id
        if not profile_dir.exists():
            logger.info(f"📁 Creando directorio de perfil: {profile_dir}")
            profile_dir.mkdir(parents=True, exist_ok=True)
        
        logger.info(f"✅ Bridge name generado: {bridge_name}")
        logger.info("ℹ️  Sentinel (Go) debe registrar el bridge en el OS")
        
        return bridge_name
    
    def sync_profile_resources(self, profile_id: str, bridge_name: str) -> None:
        """
        Sincroniza recursos del perfil (extensión y páginas HTML).
        
        Realiza:
        1. Clonación de extension/ a profiles/[UUID]/extension/
        2. Generación de discovery/index.html
        3. Generación de landing/index.html
        
        Args:
            profile_id: UUID completo del perfil
            bridge_name: Nombre del bridge (para inyección en config)
        """
        logger.info(f"🔄 Sincronizando recursos para perfil: {profile_id[:8]}...")
        
        profile_dir = self.base_dir / "profiles" / profile_id
        extension_dir = profile_dir / "extension"
        
        # 1. Clonar extensión base
        logger.debug("📦 Clonando extensión base...")
        if extension_dir.exists():
            logger.debug(f"  🗑️ Limpiando extensión anterior: {extension_dir}")
            shutil.rmtree(extension_dir, ignore_errors=True)
        
        if not self.extension_template.exists():
            raise FileNotFoundError(f"Extension template no encontrada: {self.extension_template}")
        
        shutil.copytree(self.extension_template, extension_dir)
        logger.info(f"  ✅ Extensión clonada: {extension_dir}")
        
        # 2. Inyectar configuración de bridge
        self._inject_extension_config(profile_id, bridge_name)
        
        # 3. Generar páginas HTML
        self._generate_html_pages(profile_id)
        
        logger.info(f"✅ Recursos sincronizados para perfil: {profile_id[:8]}")
    
    def _inject_extension_config(self, profile_id: str, bridge_name: str) -> None:
        """
        Escribe synapse.config.js en la extensión del perfil.
        
        Crea: profiles/[UUID]/extension/synapse.config.js
        Formato: self.SYNAPSE_CONFIG = { bridge_name: '[bridge_name]' };
        
        Args:
            profile_id: UUID completo del perfil
            bridge_name: Nombre del bridge a inyectar
        """
        logger.debug(f"💉 Inyectando config de extensión para: {profile_id[:8]}...")
        
        extension_dir = self.base_dir / "profiles" / profile_id / "extension"
        config_path = extension_dir / "synapse.config.js"
        
        if not extension_dir.exists():
            raise FileNotFoundError(f"Extension dir no existe: {extension_dir}")
        
        content = f"self.SYNAPSE_CONFIG = {{ bridge_name: '{bridge_name}' }};"
        config_path.write_text(content, encoding='utf-8')
        
        logger.debug(f"  ✅ Config inyectado: {config_path}")
    
    def _generate_html_pages(self, profile_id: str) -> None:
        """
        Genera páginas discovery y landing en la extensión del perfil.
        
        Args:
            profile_id: UUID completo del perfil
        """
        logger.debug(f"📄 Generando páginas HTML para: {profile_id[:8]}...")
        
        extension_dir = self.base_dir / "profiles" / profile_id / "extension"
        
        # Importar generadores (asumiendo que existen en brain.core.profile.web)
        try:
            from brain.core.profile.web.discovery_generator import generate_discovery_page
            from brain.core.profile.web.landing_generator import generate_profile_landing
            
            # Discovery page
            discovery_dir = extension_dir / "discovery"
            discovery_dir.mkdir(exist_ok=True)
            discovery_html = discovery_dir / "index.html"
            discovery_html.write_text(generate_discovery_page(), encoding='utf-8')
            logger.debug(f"  ✅ Discovery generado: {discovery_html}")
            
            # Landing page
            landing_dir = extension_dir / "landing"
            landing_dir.mkdir(exist_ok=True)
            landing_html = landing_dir / "index.html"
            landing_html.write_text(generate_profile_landing(profile_id), encoding='utf-8')
            logger.debug(f"  ✅ Landing generado: {landing_html}")
            
        except ImportError as e:
            logger.warning(f"⚠️ No se pudieron importar generadores HTML: {e}")
            logger.warning("  → Páginas HTML no generadas")
    
    def cleanup_bridge(self, profile_id: str) -> None:
        """
        Limpia recursos del bridge para un perfil.
        
        SCOPE LIMITADO (v2.3):
        - Solo elimina archivos locales del perfil
        - NO toca registro de Windows (responsabilidad de Sentinel)
        - NO elimina manifiestos nativos (responsabilidad de Sentinel)
        
        Args:
            profile_id: UUID completo del perfil
        """
        short_id = profile_id[:8]
        logger.info(f"🗑️ Limpiando recursos de bridge para: {short_id}...")
        
        # Eliminar carpeta de extensión del perfil
        extension_dir = self.base_dir / "profiles" / profile_id / "extension"
        if extension_dir.exists():
            try:
                logger.debug(f"  🗑️ Eliminando extensión: {extension_dir}")
                shutil.rmtree(extension_dir, ignore_errors=True)
                logger.info("  ✅ Extensión eliminada")
            except Exception as e:
                logger.error(f"  ❌ Error al eliminar extensión: {e}")
        else:
            logger.debug(f"  ℹ️ Extensión no existe: {extension_dir}")
        
        logger.info(f"✅ Recursos locales limpiados para: {short_id}")
        logger.info("ℹ️  Sentinel (Go) debe limpiar manifiestos y registro del OS")