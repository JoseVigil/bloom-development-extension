"""
Profile Manager - Orchestrator Facade.
Versión refactorizada con logger dedicado para aislamiento total.
Lógica de launch delegada a ProfileLauncher para mejor troubleshooting.
Sincronización de recursos delegada completamente a Sentinel (Go).
"""
import sys
import json
import shutil
import os
import uuid
import platform
import time
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import datetime

# Imports de lógica (Subcarpeta logic)
from brain.core.profile.logic import ProfileStore, ChromeResolver, SynapseHandler
from .path_resolver import PathResolver

# Imports de web (Subcarpeta web)
from .web.discovery_generator import generate_discovery_page
from .web.landing_generator import generate_profile_landing

# Import del launcher aislado
from .profile_launcher import ProfileLauncher

from brain.shared.logger import get_logger
logger = get_logger("brain.profile.manager")


class ProfileManager:
    """Chrome Worker profile manager."""
    
    def __init__(self):
        logger.info("🚀 Inicializando ProfileManager")
        self.paths = PathResolver()
        
        # Pasamos bin_dir para que el resolver encuentre chrome-win o chrome-mac
        self.launcher = ChromeResolver(bin_dir=self.paths.bin_dir)
        
        self.store = ProfileStore(self.paths.profiles_json, self.paths.profiles_dir)
        self.synapse = SynapseHandler(self.paths.base_dir, self.paths.get_extension_id())
        
        # ✅ NUEVO: Inicializar ProfileLauncher (lógica de launch aislada)
        self.profile_launcher = ProfileLauncher(self.paths, self.launcher)

        self.verbose_network = False 
        
        logger.debug(f"  → profiles_json: {self.paths.profiles_json}")
        logger.debug(f"  → profiles_dir: {self.paths.profiles_dir}")
        
        if not self.paths.profiles_json.exists():
            logger.info("📄 Creando profiles.json inicial")
            self._save_profiles([])
        
        logger.info("🔍 Auto-recuperando perfiles huérfanos...")
        self._auto_recover_orphaned_profiles()
        logger.info("✅ ProfileManager inicializado")
    
    def _load_profiles(self) -> List[Dict[str, Any]]:
        """Carga perfiles desde JSON usando ProfileStore."""
        logger.debug("📖 Cargando perfiles desde JSON")
        profiles = self.store.load()
        logger.debug(f"  → {len(profiles)} perfiles cargados")
        return profiles
        
    def _save_profiles(self, profiles: List[Dict[str, Any]]) -> None:
        """Guarda perfiles en JSON usando ProfileStore."""
        logger.debug(f"💾 Guardando {len(profiles)} perfiles en JSON")
        self.store.save(profiles)
        logger.debug("  ✓ Perfiles guardados exitosamente")
    
    def _auto_recover_orphaned_profiles(self) -> None:
        """Recupera perfiles huérfanos (carpetas sin registro en JSON)."""
        logger.debug("🔍 Buscando perfiles huérfanos...")
        
        if not self.paths.profiles_dir.exists():
            logger.debug("  → profiles_dir no existe, saltando recuperación")
            return
        
        profiles = self._load_profiles()
        registered_ids = {p['id'] for p in profiles}
        physical_folders = [f for f in self.paths.profiles_dir.iterdir() if f.is_dir()]
        
        logger.debug(f"  → Perfiles registrados: {len(registered_ids)}")
        logger.debug(f"  → Carpetas físicas: {len(physical_folders)}")
        
        orphaned = []
        
        for folder in physical_folders:
            folder_id = folder.name
            try:
                uuid.UUID(folder_id)
            except ValueError:
                logger.debug(f"  → Ignorando carpeta no-UUID: {folder_id}")
                continue
            
            if folder_id not in registered_ids:
                logger.warning(f"⚠️ Perfil huérfano detectado: {folder_id}")
                alias = self._recover_alias_from_landing(folder) or f"Recovered-{folder_id[:8]}"
                created_at = datetime.fromtimestamp(folder.stat().st_ctime).isoformat()
                orphaned.append({
                    "id": folder_id,
                    "alias": alias,
                    "created_at": created_at,
                    "linked_account": None,
                    "recovered": True
                })
                logger.info(f"  ✓ Recuperado: {alias} ({folder_id[:8]})")
        
        if orphaned:
            profiles.extend(orphaned)
            self._save_profiles(profiles)
            logger.info(f"✅ {len(orphaned)} perfiles huérfanos recuperados")
        else:
            logger.debug("  ✓ No se encontraron perfiles huérfanos")
    
    def _recover_alias_from_landing(self, folder: Path) -> Optional[str]:
        """Intenta recuperar el alias desde manifest.json de landing."""
        manifest_path = folder / "landing" / "manifest.json"
        if not manifest_path.exists():
            logger.debug(f"  → No hay manifest en {folder.name}")
            return None
        try:
            with open(manifest_path, 'r', encoding='utf-8') as f:
                alias = json.load(f).get('profile', {}).get('alias')
            logger.debug(f"  ✓ Alias recuperado desde manifest: {alias}")
            return alias
        except Exception as e:
            logger.warning(f"  ⚠️ Error al leer manifest: {e}")
            return None
    
    def _find_profile(self, profile_id: str) -> Optional[Dict[str, Any]]:
        """Busca perfil por ID completo o prefijo."""
        logger.debug(f"🔍 Buscando perfil: {profile_id}")
        profiles = self._load_profiles()
        
        # Búsqueda exacta
        for p in profiles:
            if p.get('id') == profile_id:
                logger.debug(f"  ✓ Perfil encontrado (match exacto): {p.get('alias')}")
                return p
        
        # Búsqueda por prefijo
        for p in profiles:
            if p.get('id', '').startswith(profile_id):
                logger.debug(f"  ✓ Perfil encontrado (prefijo): {p.get('alias')} - {p.get('id')}")
                return p
        
        logger.warning(f"  ✗ Perfil no encontrado: {profile_id}")
        return None
    
    def list_profiles(self) -> List[Dict[str, Any]]:
        """
        Lista todos los perfiles con info de existencia física.
        Lógica pura de negocio (Core).
        """
        logger.info("📋 Consultando lista de perfiles en el Core")
        try:
            # 1. Cargar perfiles desde el JSON
            profiles = self._load_profiles()
            
            # 2. Verificar existencia en disco y agregar metadata
            for p in profiles:
                p['path'] = str(self.paths.profiles_dir / p['id'])
                p['exists'] = Path(p['path']).exists()
                
                # ✅ ACTUALIZADO: Garantizar que master_profile siempre exista
                if 'master_profile' not in p:
                    p['master_profile'] = False
                
                logger.debug(f"  → Perfil: {p.get('alias')} | Existe: {p['exists']} | Master: {p.get('master_profile', False)}")
            
            logger.info(f"✅ Lista generada: {len(profiles)} perfiles")
            return profiles

        except Exception as e:
            logger.error(f"✗ Error en la lógica de list_profiles: {str(e)}", exc_info=True)
            raise e
    
    def create_profile(self, alias: str, is_master: bool = False) -> Dict[str, Any]:
        """
        Crea un nuevo perfil.
        NOTA: La sincronización de recursos (extensión, bridge, páginas) 
        es responsabilidad de Sentinel (Go).
        
        Args:
            alias: Nombre descriptivo del perfil
            is_master: Si True, marca el perfil como master_profile
        
        Returns:
            Diccionario con los datos del perfil creado
        """
        logger.info(f"✨ Creando perfil: {alias} (master={is_master})")
        start_time = time.time()
        
        profiles = self._load_profiles()
        profile_id = str(uuid.uuid4())
        profile_path = self.paths.profiles_dir / profile_id
        
        logger.debug(f"  → ID generado: {profile_id}")
        logger.debug(f"  → Path: {profile_path}")
        logger.debug(f"  → Master: {is_master}")
        
        try:
            profile_path.mkdir(parents=True, exist_ok=True)
            logger.debug("  ✓ Carpeta de perfil creada")
        except Exception as e:
            logger.error(f"✗ Error al crear carpeta: {e}", exc_info=True)
            raise
        
        # Provision Synapse bridge
        logger.info("🌉 Provisionando Synapse Bridge...")
        bridge_name = self.synapse.provision_bridge(profile_id)
        logger.info(f"  ✓ Bridge provisionado: {bridge_name}")
        
        # Crear datos del perfil con el campo master_profile
        data = {
            "id": profile_id,
            "alias": alias,
            "bridge_name": bridge_name,
            "created_at": datetime.now().isoformat(),
            "linked_account": None,
            "master_profile": is_master,  # ✅ NUEVO CAMPO
            "path": str(profile_path),
            "net_log_path": str(self.paths.base_dir / "logs" / "profiles" / profile_id / "chrome_net.log")
        }
        
        profiles.append(data)
        self._save_profiles(profiles)
        
        elapsed = time.time() - start_time
        master_msg = " como MASTER" if is_master else ""
        logger.info(f"✅ Perfil creado{master_msg} en {elapsed:.2f}s")
        logger.info("⚠️  Sentinel (Go) debe sincronizar recursos antes del primer launch")
        
        return data
    
    def launch_profile(
        self, 
        profile_id: str, 
        url: Optional[str] = None,
        spec_data: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Lanza un perfil de Chrome/Chromium.
        Delega la lógica de lanzamiento a ProfileLauncher.
        
        NOTA: La sincronización de recursos es responsabilidad de Sentinel (Go).
        Brain solo ejecuta el lanzamiento con la spec provista.
        
        Args:
            profile_id: ID del perfil a lanzar
            url: URL opcional para abrir (ignorado si se usa spec_data)
            spec_data: Diccionario con especificación completa de lanzamiento
        
        Returns:
            Diccionario con el resultado del lanzamiento
        """
        logger.info(f"🚀 Iniciando lanzamiento de perfil: {profile_id[:8]}...")
        
        # 1. Buscar perfil
        profile = self._find_profile(profile_id)
        if not profile:
            logger.error(f"✗ Perfil no encontrado: {profile_id}")
            raise ValueError(f"Perfil no encontrado: {profile_id}")
        
        full_id = profile['id']
        logger.debug(f"  → Perfil encontrado: {profile.get('alias')} ({full_id[:8]})")
        
        # 2. Delegar a ProfileLauncher
        logger.info("🎯 Delegando lanzamiento a ProfileLauncher...")
        return self.profile_launcher.launch(profile, url, spec_data)

    def get_discovery_url(self, profile_id: str) -> str:
        """Obtiene URL de discovery page."""
        url = f"chrome-extension://{self.paths.get_extension_id()}/discovery/index.html"
        logger.debug(f"🔍 Discovery URL generada: {url}")
        return url

    def get_landing_url(self, profile_id: str) -> str:
        """Obtiene URL de landing page."""
        url = f"chrome-extension://{self.paths.get_extension_id()}/landing/index.html"
        logger.debug(f"🏠 Landing URL generada: {url}")
        return url

    def destroy_profile(self, profile_id: str) -> Dict[str, Any]:
        """Elimina un perfil completamente."""
        logger.info(f"🗑️ Destruyendo perfil: {profile_id[:8]}")
        
        profiles = self._load_profiles()
        profile_found = None
        updated = []
        
        for p in profiles:
            if p['id'] == profile_id or p['id'].startswith(profile_id):
                profile_found = p
                logger.debug(f"  → Perfil encontrado: {p.get('alias')}")
            else:
                updated.append(p)
        
        if not profile_found:
            logger.error(f"✗ Perfil no encontrado: {profile_id}")
            raise ValueError("Profile not found")
        
        logger.debug("  → Limpiando Synapse bridge...")
        self._cleanup_synapse_bridge(profile_found['id'])
        
        path = self.paths.profiles_dir / profile_found['id']
        if path.exists():
            logger.debug(f"  → Eliminando carpeta: {path}")
            shutil.rmtree(path, ignore_errors=True)
            logger.debug("  ✓ Carpeta eliminada")
        
        self._save_profiles(updated)
        logger.info(f"✅ Perfil destruido: {profile_found['id'][:8]}")
        
        return {"profile_id": profile_found['id'], "status": "destroyed"}

    def _cleanup_synapse_bridge(self, profile_id: str) -> None:
        """Elimina el bridge del registro y disco."""
        if platform.system() != 'Windows':
            logger.debug("  → No es Windows, saltando cleanup de bridge")
            return
        
        try:
            import winreg
            bridge_name = f"com.bloom.synapse.{profile_id[:8]}"
            reg_path = f"Software\\Google\\Chrome\\NativeMessagingHosts\\{bridge_name}"
            
            logger.debug(f"  → Intentando eliminar: {reg_path}")
            try:
                winreg.DeleteKey(winreg.HKEY_CURRENT_USER, reg_path)
                logger.debug("  ✓ Bridge eliminado del registro")
            except FileNotFoundError:
                logger.debug("  → Bridge no estaba en el registro")
        except Exception as e:
            logger.warning(f"  ⚠️ Error al limpiar bridge: {e}")

    def register_account(self, profile_id: str, provider: str, identifier: str) -> Dict[str, Any]:
        """Registra una cuenta en un perfil."""
        logger.info(f"🔗 Registrando cuenta {provider}/{identifier} en {profile_id[:8]}")
        
        profiles = self._load_profiles()
        for p in profiles:
            if p['id'].startswith(profile_id):
                if 'accounts' not in p:
                    p['accounts'] = {}
                p['accounts'][provider] = {
                    "identifier": identifier,
                    "registered_at": datetime.now().isoformat()
                }
                self._save_profiles(profiles)
                logger.info(f"✅ Cuenta registrada: {provider}/{identifier}")
                return {"status": "registered"}
        
        logger.error(f"✗ Perfil no encontrado: {profile_id}")
        raise ValueError("Profile not found")

    def link_account(self, profile_id: str, email: str) -> Dict[str, Any]:
        """Vincula un email a un perfil."""
        logger.info(f"🔗 Vinculando {email} a {profile_id[:8]}")
        
        profiles = self._load_profiles()
        for p in profiles:
            if p['id'].startswith(profile_id):
                p['linked_account'] = email
                self._save_profiles(profiles)
                logger.info(f"✅ Email vinculado: {email}")
                return {"status": "linked"}
        
        logger.error(f"✗ Perfil no encontrado: {profile_id}")
        raise ValueError("Profile not found")

    def unlink_account(self, profile_id: str) -> Dict[str, Any]:
        """Desvincula la cuenta de un perfil."""
        logger.info(f"🔓 Desvinculando cuenta de {profile_id[:8]}")
        
        profiles = self._load_profiles()
        for p in profiles:
            if p['id'].startswith(profile_id):
                p['linked_account'] = None
                self._save_profiles(profiles)
                logger.info(f"✅ Cuenta desvinculada")
                return {"status": "unlinked"}
        
        logger.error(f"✗ Perfil no encontrado: {profile_id}")
        raise ValueError("Profile not found")