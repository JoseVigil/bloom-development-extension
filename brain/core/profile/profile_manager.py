"""
Profile Manager - Orchestrator Facade.
Versión refactorizada con orden de sincronización corregido.
"""

import json
import shutil
import subprocess
import os
import uuid
import platform
import time
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import datetime
from brain.shared.logger import get_logger

# Imports de lógica (Subcarpeta logic)
from brain.core.profile.logic import ProfileStore, ChromeResolver, SynapseHandler
from .path_resolver import PathResolver

# Imports de web (Subcarpeta web)
from .web.discovery_generator import generate_discovery_page
from .web.landing_generator import generate_profile_landing

# Crear logger para este módulo
logger = get_logger(__name__)


class ProfileManager:
    """Chrome Worker profile manager."""
    
    def __init__(self):
        logger.info("🚀 Inicializando ProfileManager")
        self.paths = PathResolver()
        
        # Pasamos bin_dir para que el resolver encuentre chrome-win o chrome-mac
        self.launcher = ChromeResolver(bin_dir=self.paths.bin_dir)
        
        self.store = ProfileStore(self.paths.profiles_json, self.paths.profiles_dir)
        self.synapse = SynapseHandler(self.paths.base_dir, self.paths.extension_id)

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
        return self.store.load()
        
    def _save_profiles(self, profiles: List[Dict[str, Any]]) -> None:
        """Guarda perfiles en JSON usando ProfileStore."""
        self.store.save(profiles)
    
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
        
        logger.warning(f"  ❌ Perfil no encontrado: {profile_id}")
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
            
            # 2. Verificar existencia en disco
            for p in profiles:
                p['path'] = str(self.paths.profiles_dir / p['id'])
                p['exists'] = Path(p['path']).exists()
                logger.debug(f"  → Perfil: {p.get('alias')} | Existe: {p['exists']}")
            
            return profiles

        except Exception as e:
            logger.error(f"❌ Error en la lógica de list_profiles: {str(e)}", exc_info=True)
            raise e
    
    def create_profile(self, alias: str) -> Dict[str, Any]:
        """Crea un nuevo perfil."""
        logger.info(f"✨ Creando perfil: {alias}")
        start_time = time.time()
        
        profiles = self._load_profiles()
        profile_id = str(uuid.uuid4())
        profile_path = self.paths.profiles_dir / profile_id
        
        logger.debug(f"  → ID generado: {profile_id}")
        logger.debug(f"  → Path: {profile_path}")
        
        try:
            profile_path.mkdir(parents=True, exist_ok=True)
            logger.debug("  ✓ Carpeta de perfil creada")
        except Exception as e:
            logger.error(f"❌ Error al crear carpeta: {e}", exc_info=True)
            raise
        
        # Provision Synapse bridge
        logger.info("🌉 Provisionando Synapse Bridge...")
        bridge_name = self.synapse.provision_bridge(profile_id)
        logger.info(f"  ✓ Bridge provisionado: {bridge_name}")
        
        data = {
            "id": profile_id,
            "alias": alias,
            "bridge_name": bridge_name,
            "created_at": datetime.now().isoformat(),
            "linked_account": None,
            "path": str(profile_path),
            "net_log_path": str(self.paths.base_dir / "logs" / "profiles" / profile_id / "chrome_net.log")
        }
        profiles.append(data)
        self._save_profiles(profiles)
        
        # Landing se genera en sync_profile_resources, no aquí
        logger.debug("Landing se generará en el primer launch")
        
        duration = time.time() - start_time
        logger.info(f"✅ Perfil '{alias}' creado en {duration:.2f}s")
        
        return {**data, "path": str(profile_path)}
    
    def launch_profile(self, profile_id: str, url: Optional[str] = None, mode: str = "normal", verbose_network: bool = False) -> Dict[str, Any]:
        """Dispatcher: Selecciona la estrategia de lanzamiento según el .env"""
        strategy = os.environ.get("BLOOM_BROWSER_STRATEGY", "internal").lower()
        
        # 1. Preparación común de recursos
        profile = self._find_profile(profile_id)
        if not profile: return {"status": "error", "message": "Profile not found"}
        full_id = profile['id']
        self.sync_profile_resources(full_id)
        
        logger.info(f"🚀 Lanzando perfil {full_id[:8]} usando estrategia: {strategy}")

        # 2. Despacho a método específico
        if strategy == "internal":
            return self._launch_internal_chromium(profile, url)
        else:
            return self._launch_system_chrome(profile, url)

    def _launch_internal_chromium(self, profile: Dict, url: Optional[str]) -> Dict[str, Any]:
        full_id = profile['id']
        profile_path = Path(self.paths.profiles_dir) / full_id
        
        # Sincronización
        self.sync_profile_resources(full_id)

        # RUTA NORMALIZADA (Sin comillas, barras dobles de Windows)
        chrome_path = str(self.launcher.chrome_path)
        u_data = os.path.abspath(profile_path).replace("/", "\\")
        e_path = os.path.abspath(profile_path / "extension").replace("/", "\\")
        target_url = url if url else self.get_discovery_url(full_id)

        chrome_args = [
            chrome_path,
            f"--user-data-dir={u_data}",
            f"--load-extension={e_path}",
            f"--app={target_url}",
            "--test-type",
            "--no-sandbox",
            "--disable-web-security",
            "--remote-debugging-port=9222",
            "--no-first-run"
        ]

        # KILL PREVENTIVO (Nivel 0.1%)
        # Si no matamos el chrome.exe portable, el Singleton de Chromium 
        # nos va a mandar siempre a la ventana genérica.
        if platform.system() == 'Windows':
            os.system('taskkill /f /im chrome.exe >nul 2>&1')
            os.system('taskkill /f /im bloom-host.exe >nul 2>&1')

        try:
            subprocess.Popen(
                chrome_args,
                creationflags=0x00000008 | 0x00000200 | 0x08000000,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                stdin=subprocess.DEVNULL
            )
            
            # Matamos el logger para Electron
            import logging
            logging.disable(logging.CRITICAL)
            
            print(json.dumps({"status": "success", "data": {"profile_id": full_id}}))
            os._exit(0) # Muerte atómica de Python
        except Exception as e:
            os._exit(1)

    def _launch_system_chrome(self, profile: Dict, url: Optional[str]) -> Dict[str, Any]:
        """ESTRATEGIA CHROME SYSTEM: Compatible, limitado por Google Stable."""
        full_id = profile['id']
        profile_path = Path(self.paths.profiles_dir) / full_id
        target_url = url if url else self.get_discovery_url(full_id)
        
        u_data = os.path.abspath(profile_path)
        e_path = os.path.abspath(profile_path / "extension")

        chrome_args = [
            self.launcher.chrome_path, # Resolverá a Program Files
            f"--user-data-dir={u_data}",
            #f"--load-extension={e_path}",
            f"--app={target_url}",
            "--enable-automation",      # Única forma de que Stable cargue la ext
            "--test-type",
            "--no-first-run",
            "--remote-debugging-port=0" # Puerto dinámico para evitar delegación
        ]

        return self._execute_popen(chrome_args, full_id)

    def _execute_popen(self, args: list, profile_id: str) -> Dict[str, Any]:
        """Maneja el Popen y silencia los logs para Electron."""
        # 1. Kill preventivo del host nativo (Windows)
        if platform.system() == 'Windows':
            os.system('taskkill /f /im bloom-host.exe >nul 2>&1')

        # 2. Flags de aislamiento OS
        flags = 0x00000008 | 0x00000200 | 0x08000000 if platform.system() == 'Windows' else 0

        try:
            subprocess.Popen(
                args,
                creationflags=flags,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                stdin=subprocess.DEVNULL,
                shell=False
            )
            
            # --- EL SECRETO PARA ELECTRON ---
            import logging
            # Borramos todos los handlers que imprimen en consola para que el JSON sea puro
            for handler in logging.getLogger().handlers[:]:
                logging.getLogger().removeHandler(handler)
            logging.getLogger().addHandler(logging.NullHandler())
            
            return {
                "status": "success",
                "data": {
                    "profile_id": profile_id,
                    "engine": "active"
                }
            }
        except Exception as e:
            return {"status": "error", "message": f"Popen failed: {str(e)}"}

    def get_discovery_url(self, profile_id: str) -> str:
        """Obtiene URL de discovery page."""
        return f"chrome-extension://{self.paths.extension_id}/discovery/index.html"

    def sync_profile_resources(self, profile_id: str) -> None:
        """Sincroniza los recursos del perfil (Extensión + Config + Web)."""
        logger.info(f"🔄 Sincronizando recursos para {profile_id[:8]}")
        
        profile = self._find_profile(profile_id)
        if not profile: return
        
        full_id = profile['id']
        profile_path = self.paths.profiles_dir / full_id
        target_ext_dir = profile_path / "extension"

        try:
            # PASO 1: Clonar extensión
            if target_ext_dir.exists():
                shutil.rmtree(target_ext_dir)
            shutil.copytree(self.paths.extension_path, target_ext_dir)
            
            # PASO 2: Bridge y Configuración
            bridge_name = self.synapse.provision_bridge(full_id)
            self.synapse.inject_extension_config(full_id, bridge_name)
            
            # PASO 3: Generar páginas
            generate_discovery_page(target_ext_dir, profile)
            generate_profile_landing(target_ext_dir, profile)
            
            logger.info("  ✅ Sincronización completa")
        except Exception as e:
            logger.error(f"  ❌ Error en sincronización: {e}")
            raise

    def get_landing_url(self, profile_id: str) -> str:
        """Obtiene URL de landing page."""
        return f"chrome-extension://{self.paths.extension_id}/landing/index.html"

    def destroy_profile(self, profile_id: str) -> Dict[str, Any]:
        """Elimina un perfil completamente."""
        profiles = self._load_profiles()
        profile_found = None
        updated = []
        
        for p in profiles:
            if p['id'] == profile_id or p['id'].startswith(profile_id):
                profile_found = p
            else:
                updated.append(p)
        
        if not profile_found: raise ValueError("Profile not found")
        
        self._cleanup_synapse_bridge(profile_found['id'])
        path = self.paths.profiles_dir / profile_found['id']
        if path.exists():
            shutil.rmtree(path, ignore_errors=True)
        
        self._save_profiles(updated)
        return {"profile_id": profile_found['id'], "status": "destroyed"}

    def _cleanup_synapse_bridge(self, profile_id: str) -> None:
        """Elimina el bridge del registro y disco."""
        if platform.system() != 'Windows': return
        try:
            import winreg
            bridge_name = f"com.bloom.synapse.{profile_id[:8]}"
            reg_path = f"Software\\Google\\Chrome\\NativeMessagingHosts\\{bridge_name}"
            try:
                winreg.DeleteKey(winreg.HKEY_CURRENT_USER, reg_path)
            except FileNotFoundError: pass
        except: pass

    def register_account(self, profile_id: str, provider: str, identifier: str) -> Dict[str, Any]:
        profiles = self._load_profiles()
        for p in profiles:
            if p['id'].startswith(profile_id):
                if 'accounts' not in p: p['accounts'] = {}
                p['accounts'][provider] = {"identifier": identifier, "registered_at": datetime.now().isoformat()}
                self._save_profiles(profiles)
                return {"status": "registered"}
        raise ValueError("Profile not found")

    def link_account(self, profile_id: str, email: str) -> Dict[str, Any]:
        profiles = self._load_profiles()
        for p in profiles:
            if p['id'].startswith(profile_id):
                p['linked_account'] = email
                self._save_profiles(profiles)
                return {"status": "linked"}
        raise ValueError("Profile not found")

    def unlink_account(self, profile_id: str) -> Dict[str, Any]:
        profiles = self._load_profiles()
        for p in profiles:
            if p['id'].startswith(profile_id):
                p['linked_account'] = None
                self._save_profiles(profiles)
                return {"status": "unlinked"}
        raise ValueError("Profile not found")