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
        
        # Inicialización de sub-módulos con sus argumentos correctos
        self.store = ProfileStore(
            profiles_json=self.paths.profiles_json, 
            profiles_dir=self.paths.profiles_dir
        )
        self.synapse = SynapseHandler(
            base_dir=self.paths.base_dir, 
            extension_id=self.paths.extension_id
        )
        self.launcher = ChromeResolver()

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
    
    def sync_profile_resources(self, profile_id: str) -> None:
        """
        Sincroniza los recursos del perfil en el orden correcto:
        1. Copia extensión maestra
        2. Provisiona Synapse bridge
        3. Inyecta configuración de Synapse
        4. Genera páginas web (discovery/landing)
        """
        logger.info(f"🔄 Sincronizando recursos para {profile_id[:8]}")
        
        profile = self._find_profile(profile_id)
        if not profile:
            raise ValueError(f"Profile {profile_id} not found")
        
        full_id = profile['id']
        profile_path = self.paths.profiles_dir / full_id
        target_ext_dir = profile_path / "extension"

        # PASO 1: Copiar extensión maestra (Clonación del molde)
        logger.info("  📦 [1/4] Copiando extensión maestra...")
        try:
            if target_ext_dir.exists():
                logger.debug("    → Limpiando extensión previa")
                shutil.rmtree(target_ext_dir)
            
            shutil.copytree(self.paths.extension_path, target_ext_dir)
            logger.info("    ✓ Extensión clonada en perfil")
        except Exception as e:
            logger.error(f"    ❌ Error al copiar extensión: {e}")
            raise
        
        # PASO 2: Provisionar Synapse bridge (Registry + JSON nativo)
        logger.info("  🌉 [2/4] Provisionando Synapse bridge...")
        try:
            bridge_name = self.synapse.provision_bridge(full_id)
            logger.info(f"    ✓ Bridge provisionado: {bridge_name}")
        except Exception as e:
            logger.error(f"    ❌ Error al provisionar bridge: {e}")
            raise
        
        # PASO 3: Inyectar configuración en la extensión
        logger.info("  ⚙️ [3/4] Inyectando configuración de Synapse...")
        try:
            self.synapse.inject_extension_config(full_id, bridge_name)
            logger.info("    ✓ Configuración inyectada")
        except Exception as e:
            logger.error(f"    ❌ Error al inyectar config: {e}")
            raise
        
        # PASO 4: Generar páginas web (Discovery y Landing)
        logger.info("  🌐 [4/4] Generando páginas web...")
        try:
            generate_discovery_page(target_ext_dir, profile)
            generate_profile_landing(target_ext_dir, profile)
            logger.info("    ✓ Páginas generadas en extension/")
        except Exception as e:
            logger.error(f"    ❌ Error generando páginas: {e}")
            raise
        
        logger.info("  ✅ Sincronización completa")
    
    def get_discovery_url(self, profile_id: str) -> str:
        """
        Obtiene URL de discovery page (chrome-extension).
        Usa el extension_id hardcoded de Synapse v2.0.
        """
        logger.debug(f"🔗 Obteniendo discovery URL para {profile_id[:8]}")
        
        url = f"chrome-extension://{self.paths.extension_id}/discovery/index.html"
        
        logger.debug(f"  ✓ URL: {url}")
        return url
    
    def launch_profile(
        self, 
        profile_id: str, 
        url: Optional[str] = None,
        mode: str = "normal",
        verbose_network: bool = False
    ) -> Dict[str, Any]:
        """
        Lanza Chrome con perfil.
        
        Args:
            profile_id: UUID completo o prefijo
            url: URL a abrir (default: landing page)
            verbose_network: Activar logging de red detallado
        """
        logger.info(f"🚀 Lanzando perfil {profile_id[:8]}")
        start_time = time.time()
        
        profile = self._find_profile(profile_id)
        if not profile:
            logger.error(f"❌ Perfil no encontrado: {profile_id}")
            raise ValueError(f"Profile not found: {profile_id}")
        
        full_id = profile['id']
        profile_path = self.paths.profiles_dir / full_id      

        logger.info(f"  → Perfil: {profile.get('alias')} ({full_id[:8]})")
        logger.info(f"  → Path: {profile_path}")

        # Configurar logging de red si se solicita
        net_log_path = self.paths.base_dir / "logs" / "profiles" / full_id / "chrome_net.log"
        net_log_path.parent.mkdir(parents=True, exist_ok=True)
        
        if verbose_network:
            logger.debug(f"  → Net log habilitado: {net_log_path}")
        
        # Provisioning
        logger.info("  🔄 Sincronizando recursos...")
        self.sync_profile_resources(full_id)
        
        # Determinar URL (usar parámetro o landing por defecto)
        if url is None:
            try:
                url = self.get_landing_url(full_id)
                logger.debug(f"  → URL landing: {url}")
            except Exception as e:
                logger.warning(f"  ⚠️ Landing no disponible, usando about:blank: {e}")
                url = "about:blank"
        else:
            logger.debug(f"  → URL personalizada: {url}")
        
        # Obtener ruta de Chrome
        try:
            chrome_path = self.launcher.chrome_path
            logger.debug(f"  → Chrome: {chrome_path}")
        except FileNotFoundError as e:
            logger.error(f"❌ Chrome no encontrado: {e}", exc_info=True)
            raise
        
        # FIX: Usar extension/ interna del perfil
        extension_path = str((profile_path / "extension").resolve())
        logger.debug(f"  → Extension: {extension_path}")

        ext_id = "hpblclepliicmihaplldignhjdggnkdh"
        target_url = url if url else f"chrome-extension://{ext_id}/landing/index.html"
        
        chrome_args = [
            str(chrome_path),
            f"--user-data-dir={str(profile_path.resolve())}",
            f"--load-extension={str((profile_path / 'extension').resolve())}",
            # ESTE FLAG ES EL QUE ROMPE EL BLOQUEO:
            "--remote-debugging-port=9222", 
            # ESTOS EVITAN QUE CHROME INTENTE "UNIRSE" AL PROCESO VIEJO:
            "--no-first-run",
            "--no-default-browser-check",
            "--test-type", # Le avisa a Chrome que es una instancia de prueba
            
            "--enable-logging",
            "--v=1",

            target_url # La URL de discovery al final
        ]             

        # Activar logging de red si se solicita
        if verbose_network or os.environ.get("BLOOM_DEBUG_NET") == "true":
            chrome_args.append(f"--log-net-log={str(net_log_path)}")
            chrome_args.append("--net-log-capture-mode=Everything")
            logger.debug("  → Logging de red activado")

        logger.debug(f"  → Argumentos: {len(chrome_args)} args")
        
        # Lanzar proceso
        try:
            creation_flags = 0
            if platform.system() == 'Windows':
                # DETACHED_PROCESS (0x00000008) + CREATE_NEW_PROCESS_GROUP (0x00000200)
                creation_flags = 0x00000008 | 0x00000200
                logger.debug("  → Windows: usando DETACHED_PROCESS")
            
            logger.info("  ⏳ Lanzando proceso de Chrome...")
            
            process = subprocess.Popen(
                chrome_args,
                creationflags=creation_flags,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                stdin=subprocess.DEVNULL,
                shell=False
            )
            
            logger.debug(f"  → PID Inicial: {process.pid}")
            logger.debug("  → Verificando estado del proceso...")
            
            # Lógica de detección de éxito
            pid_final = process.pid
            
            try:
                # Esperamos hasta 2 segundos para ver si crashea
                exit_code = process.wait(timeout=2.0)
                
                if exit_code == 0:
                    # Exit Code 0 = Chrome delegó a proceso padre existente
                    logger.info("  ✓ Chrome delegated to main process (Exit Code 0)")
                else:
                    # Exit Code != 0 = ERROR REAL
                    _, stderr_out = process.communicate()
                    err_msg = stderr_out.decode('utf-8', errors='ignore') if stderr_out else f"Exit Code {exit_code}"
                    logger.error(f"❌ Chrome falló al iniciar: {err_msg}")
                    raise RuntimeError(f"Chrome failed to start: {err_msg}")
                    
            except subprocess.TimeoutExpired:
                # El proceso sigue corriendo - ÉXITO
                logger.info("  ✓ Chrome process is running stable")
            
            duration = time.time() - start_time
            logger.info(f"✅ Perfil lanzado exitosamente en {duration:.2f}s")
            
            return {
                "status": "success",
                "operation": "launch",
                "data": {
                    "status": "launched",
                    "profile_id": full_id,
                    "alias": profile.get('alias'),
                    "pid": pid_final,
                    "url": target_url,
                    "extension_loaded": True,
                    "verbose_network": verbose_network
                }
            }
            
        except Exception as e:
            duration = time.time() - start_time
            logger.error(f"❌ Fallo al lanzar perfil después de {duration:.2f}s: {e}", exc_info=True)
            raise RuntimeError(f"Failed to launch profile {full_id}: {e}")
    
    def get_landing_url(self, profile_id: str) -> str:
        """Obtiene URL de landing page (chrome-extension)."""
        logger.debug(f"🔗 Obteniendo landing URL para {profile_id[:8]}")
        
        url = f"chrome-extension://{self.paths.extension_id}/landing/index.html"
        
        logger.debug(f"  ✓ URL: {url}")
        return url
    
    def destroy_profile(self, profile_id: str) -> Dict[str, Any]:
        """Elimina un perfil completamente."""
        logger.info(f"🗑️ Destruyendo perfil: {profile_id[:8]}")
        start_time = time.time()
        
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
            logger.error(f"❌ Perfil no encontrado: {profile_id}")
            raise ValueError("Profile not found")
        
        # Cleanup Synapse bridge
        logger.info("  🌉 Limpiando Synapse Bridge...")
        self._cleanup_synapse_bridge(profile_found['id'])
        
        path = self.paths.profiles_dir / profile_found['id']
        count = 0
        
        if path.exists():
            logger.info(f"  🗂️ Eliminando carpeta: {path}")
            try:
                count = sum(1 for _ in path.rglob('*') if _.is_file())
                logger.debug(f"    → {count} archivos a eliminar")
                shutil.rmtree(path, ignore_errors=True)
                logger.debug("    ✓ Carpeta eliminada")
            except Exception as e:
                logger.error(f"❌ Error al eliminar carpeta: {e}", exc_info=True)
        else:
            logger.warning(f"  ⚠️ Carpeta no existe: {path}")
        
        self._save_profiles(updated)
        
        duration = time.time() - start_time
        logger.info(f"✅ Perfil destruido en {duration:.2f}s ({count} archivos)")
        
        return {
            "profile_id": profile_found['id'],
            "alias": profile_found.get('alias'),
            "deleted_files": count
        }
    
    def _cleanup_synapse_bridge(self, profile_id: str) -> None:
        """Elimina el bridge del perfil."""
        logger.debug(f"🧹 Limpiando bridge para {profile_id[:8]}")
        
        if platform.system() != 'Windows':
            logger.debug("  → Sistema no-Windows, no hay cleanup necesario")
            return
        
        try:
            import winreg
            short_id = profile_id[:8]
            bridge_name = f"com.bloom.synapse.{short_id}"
            
            # Eliminar manifest
            synapse_dir = self.paths.base_dir / "bin" / "native" / "synapse"
            manifest_path = synapse_dir / f"{bridge_name}.json"
            
            if manifest_path.exists():
                logger.debug(f"  → Eliminando manifest: {manifest_path}")
                manifest_path.unlink()
                logger.debug("    ✓ Manifest eliminado")
            
            # Eliminar registry
            reg_path = f"Software\\Google\\Chrome\\NativeMessagingHosts\\{bridge_name}"
            logger.debug(f"  → Eliminando registry: HKCU\\{reg_path}")
            
            try:
                winreg.DeleteKey(winreg.HKEY_CURRENT_USER, reg_path)
                logger.debug("    ✓ Registry key eliminada")
            except FileNotFoundError:
                logger.debug("    → Registry key no existía")
        except ImportError:
            logger.debug("  → winreg no disponible")
    
    def register_account(self, profile_id: str, provider: str, identifier: str) -> Dict[str, Any]:
        """Registra una cuenta en el perfil."""
        logger.info(f"🔐 Registrando cuenta {provider} en perfil {profile_id[:8]}")
        
        profiles = self._load_profiles()
        found = None
        
        for p in profiles:
            if p['id'].startswith(profile_id):
                if 'accounts' not in p:
                    p['accounts'] = {}
                p['accounts'][provider] = {
                    "identifier": identifier,
                    "registered_at": datetime.now().isoformat()
                }
                found = p
                logger.debug(f"  ✓ Cuenta registrada: {provider} - {identifier}")
                break
        
        if not found:
            logger.error(f"❌ Perfil no encontrado: {profile_id}")
            raise ValueError("Profile not found")
        
        self._save_profiles(profiles)
        logger.info(f"✅ Cuenta {provider} registrada")
        
        return {
            "profile_id": found['id'],
            "profile_alias": found.get('alias'),
            "provider": provider,
            "identifier": identifier
        }
    
    def remove_account(self, profile_id: str, provider: str) -> Dict[str, Any]:
        """Elimina una cuenta del perfil."""
        logger.info(f"🗑️ Eliminando cuenta {provider} de perfil {profile_id[:8]}")
        
        profiles = self._load_profiles()
        found = None
        
        for p in profiles:
            if p['id'].startswith(profile_id):
                if 'accounts' in p and provider in p['accounts']:
                    del p['accounts'][provider]
                    found = p
                    logger.debug(f"  ✓ Cuenta {provider} eliminada")
                break
        
        if not found:
            logger.error(f"❌ Cuenta o perfil no encontrado")
            raise ValueError("Account or profile not found")
        
        self._save_profiles(profiles)
        logger.info(f"✅ Cuenta {provider} eliminada")
        
        return {
            "profile_id": found['id'],
            "provider": provider,
            "remaining_accounts": list(found.get('accounts', {}).keys())
        }
    
    def link_account(self, profile_id: str, email: str) -> Dict[str, Any]:
        """Vincula email al perfil."""
        logger.info(f"🔗 Vinculando {email} a perfil {profile_id[:8]}")
        
        profiles = self._load_profiles()
        found = None
        
        for p in profiles:
            if p['id'].startswith(profile_id):
                p['linked_account'] = email
                found = p
                logger.debug(f"  ✓ Email vinculado")
                break
        
        if not found:
            logger.error(f"❌ Perfil no encontrado: {profile_id}")
            raise ValueError("Profile not found")
        
        self._save_profiles(profiles)
        logger.info(f"✅ Email vinculado: {email}")
        
        return {
            "profile_id": found['id'],
            "email": email
        }
    
    def unlink_account(self, profile_id: str) -> Dict[str, Any]:
        """Desvincula el email principal del perfil."""
        logger.info(f"🔓 Desvinculando cuenta del perfil {profile_id[:8]}")
        
        profiles = self._load_profiles()
        found = None
        
        for p in profiles:
            if p['id'].startswith(profile_id):
                p['linked_account'] = None
                found = p
                logger.debug(f"  ✓ Cuenta desvinculada")
                break
        
        if not found:
            logger.error(f"❌ Perfil no encontrado: {profile_id}")
            raise ValueError("Profile not found")
        
        self._save_profiles(profiles)
        logger.info(f"✅ Cuenta desvinculada exitosamente")
        
        return {
            "profile_id": found['id'],
            "status": "unlinked"
        }