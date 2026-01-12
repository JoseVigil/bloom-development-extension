"""
Profile Manager - Orchestrator Facade.
Versión compatible con build actual (sin refactorización de logic/).
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

from brain.core.profile.path_resolver import PathResolver
from brain.shared.logger import get_logger

from .web.discovery_generator import generate_discovery_page
from .web.landing_generator import generate_profile_landing


# Crear logger para este módulo
logger = get_logger(__name__)


class ProfileManager:
    """Chrome Worker profile manager."""
    
    def __init__(self):
        logger.info("🚀 Inicializando ProfileManager")
        self.paths = PathResolver()
        logger.debug(f"  → profiles_json: {self.paths.profiles_json}")
        logger.debug(f"  → profiles_dir: {self.paths.profiles_dir}")
        
        if not self.paths.profiles_json.exists():
            logger.info("📄 Creando profiles.json inicial")
            self._save_profiles([])
        
        logger.info("🔍 Auto-recuperando perfiles huérfanos...")
        self._auto_recover_orphaned_profiles()
        logger.info("✅ ProfileManager inicializado")
    
    def _load_profiles(self) -> List[Dict[str, Any]]:
        """Carga perfiles desde JSON."""
        # LOG DE RUTA ABSOLUTA
        target_file = self.paths.profiles_json.absolute()
        logger.info(f"📖 [PROFILE_MANAGER] Intentando cargar JSON desde: {target_file}")
        
        try:
            if not target_file.exists():
                logger.warning(f"⚠️ [PROFILE_MANAGER] El archivo NO EXISTE en esa ruta")
                return []
                
            with open(target_file, 'r', encoding='utf-8') as f:
                profiles = json.load(f)
            logger.info(f"✅ [PROFILE_MANAGER] {len(profiles)} perfiles cargados exitosamente")
            return profiles
        except Exception as e:
            logger.error(f"❌ [PROFILE_MANAGER] Error al cargar: {e}")
            return []
    
    def _save_profiles(self, profiles: List[Dict[str, Any]]) -> None:
        """Guarda perfiles en JSON."""
        try:
            logger.debug(f"💾 Guardando {len(profiles)} perfiles en {self.paths.profiles_json}")
            with open(self.paths.profiles_json, 'w', encoding='utf-8') as f:
                json.dump(profiles, f, indent=2, ensure_ascii=False)
            logger.debug("  ✓ Perfiles guardados exitosamente")
        except Exception as e:
            logger.error(f"❌ Error al guardar perfiles: {e}", exc_info=True)
            raise
    
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
                # Usamos self.paths que es el PathResolver del Manager
                p['path'] = str(self.paths.profiles_dir / p['id'])
                p['exists'] = Path(p['path']).exists()
                logger.debug(f"  → Perfil: {p.get('alias')} | Existe: {p['exists']}")
            
            return profiles

        except Exception as e:
            logger.error(f"❌ Error en la lógica de list_profiles: {str(e)}", exc_info=True)
            raise e
            
        except Exception as e:
            logger.error(f"❌ Error al listar perfiles: {str(e)}", exc_info=True)
            self._handle_error(gc, f"Error al listar perfiles: {str(e)}")
    
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
        bridge_name = self._provision_synapse_bridge(profile_id)
        logger.info(f"  ✓ Bridge provisionado: {bridge_name}")
        
        data = {
            "id": profile_id,
            "alias": alias,
            "bridge_name": bridge_name,
            "created_at": datetime.now().isoformat(),
            "linked_account": None
        }
        profiles.append(data)
        self._save_profiles(profiles)
        
        # Generate landing page
        logger.info("📄 Generando landing page...")
        try:
            self._generate_landing(profile_path, data)
            logger.debug("  ✓ Landing page generada")
        except Exception as e:
            logger.error(f"❌ Error al generar landing: {e}", exc_info=True)
        
        duration = time.time() - start_time
        logger.info(f"✅ Perfil '{alias}' creado en {duration:.2f}s")
        
        return {**data, "path": str(profile_path)}
    
    def _provision_synapse_bridge(self, profile_id: str) -> str:
        """
        Configura el Native Messaging Host para este perfil.
        Crea el JSON único y registra en Windows Registry.
        """
        logger.debug(f"🌉 Provisionando bridge para {profile_id[:8]}")
        
        if platform.system() != 'Windows':
            logger.debug("  → Sistema no-Windows, usando bridge dummy")
            return "com.bloom.synapse.dummy"
        
        try:
            import winreg
        except ImportError:
            logger.warning("⚠️ winreg no disponible, usando bridge dummy")
            return "com.bloom.synapse.dummy"
        
        short_id = profile_id[:8]
        bridge_name = f"com.bloom.synapse.{short_id}"
        logger.debug(f"  → Bridge name: {bridge_name}")
        
        # Ubicación: AppData/Local/BloomNucleus/bin/native/synapse/
        synapse_dir = self.paths.base_dir / "bin" / "native" / "synapse"
        synapse_dir.mkdir(parents=True, exist_ok=True)
        
        bridge_json_path = synapse_dir / f"{bridge_name}.json"
        host_exe_path = self.paths.base_dir / "bin" / "native" / "bloom-host.exe"
        
        logger.debug(f"  → Manifest path: {bridge_json_path}")
        logger.debug(f"  → Host exe: {host_exe_path}")
        
        # Crear manifest JSON
        manifest_data = {
            "name": bridge_name,
            "description": f"Bloom Synapse Bridge for Profile {profile_id}",
            "path": str(host_exe_path.resolve()),
            "type": "stdio",
            "allowed_origins": [
                f"chrome-extension://{self.paths.extension_id}/"
            ],
            "args": ["--profile-id", profile_id]
        }
        
        try:
            with open(bridge_json_path, 'w', encoding='utf-8') as f:
                json.dump(manifest_data, f, indent=2)
            logger.debug("  ✓ Manifest JSON escrito")
        except Exception as e:
            logger.error(f"❌ Error al escribir manifest: {e}", exc_info=True)
            raise
        
        # Registrar en Windows Registry (HKCU)
        reg_path = f"Software\\Google\\Chrome\\NativeMessagingHosts\\{bridge_name}"
        logger.debug(f"  → Registrando en: HKCU\\{reg_path}")
        
        try:
            with winreg.CreateKey(winreg.HKEY_CURRENT_USER, reg_path) as key:
                winreg.SetValueEx(key, "", 0, winreg.REG_SZ, str(bridge_json_path.resolve()))
            logger.debug("  ✓ Registry key creada")
        except Exception as e:
            logger.warning(f"⚠️ Registry write failed: {e}")
        
        return bridge_name
    
    def _inject_extension_config(self, profile_id: str, bridge_name: str) -> None:
        """Escribe synapse.config.js en la extensión del perfil."""
        config_path = self.paths.profiles_dir / profile_id / "extension" / "synapse.config.js"
        logger.debug(f"📝 Inyectando config en: {config_path}")
        
        try:
            config_path.parent.mkdir(parents=True, exist_ok=True)
            content = f"self.SYNAPSE_CONFIG = {{ bridge_name: '{bridge_name}' }};"
            config_path.write_text(content, encoding='utf-8')
            logger.debug("  ✓ Config inyectada")
        except Exception as e:
            logger.error(f"❌ Error al inyectar config: {e}", exc_info=True)
            raise
    
    def sync_profile_resources(self, profile_id: str) -> None:
        """
        Garantiza que todos los archivos necesarios existan en la carpeta del perfil.
        """
        logger.info(f"🔄 Sincronizando recursos para {profile_id[:8]}")
        start_time = time.time()
        
        profile = self._find_profile(profile_id)
        if not profile:
            logger.error(f"❌ Perfil no encontrado: {profile_id}")
            raise ValueError(f"Profile {profile_id} not found")
        
        full_id = profile['id']
        profile_path = self.paths.profiles_dir / full_id
        profile_path.mkdir(parents=True, exist_ok=True)
        
        # 1. Copiar extensión (siempre refrescar)
        logger.info("  📦 Copiando extensión...")
        target_ext_dir = profile_path / "extension"
        
        try:
            if target_ext_dir.exists():
                logger.debug("    → Eliminando extensión anterior")
                shutil.rmtree(target_ext_dir)
            
            logger.debug(f"    → Copiando desde: {self.paths.extension_path}")
            shutil.copytree(self.paths.extension_path, target_ext_dir)
            logger.debug("    ✓ Extensión copiada")
        except Exception as e:
            logger.error(f"❌ Error al copiar extensión: {e}", exc_info=True)
            raise
        
        # 2. Configurar Synapse Bridge
        logger.info("  🌉 Configurando Synapse Bridge...")
        bridge_name = self._provision_synapse_bridge(full_id)
        self._inject_extension_config(full_id, bridge_name)
        
        # 3. Generar Discovery
        logger.info("  🔍 Generando discovery page...")
        try:
            self._generate_discovery(profile_path, profile)
        except Exception as e:
            logger.error(f"❌ Error en discovery: {e}", exc_info=True)
        
        # 4. Generar Landing
        logger.info("  📄 Generando landing page...")
        try:
            self._generate_landing(profile_path, profile)
        except Exception as e:
            logger.error(f"❌ Error en landing: {e}", exc_info=True)
        
        duration = time.time() - start_time
        logger.info(f"✅ Recursos sincronizados en {duration:.2f}s")
    
    def _generate_discovery(self, profile_path: Path, profile_data: Dict[str, Any]) -> None:
        """Genera la página de discovery."""
        logger.debug("🔍 Generando discovery page...")
        try:
            generate_discovery_page(profile_path, profile_data)
            logger.debug("  ✓ Discovery page generada")
        except Exception as e:
            logger.error(f"❌ Error en generate_discovery_page: {e}", exc_info=True)
            raise
    
    def _generate_landing(self, profile_path: Path, profile_data: Dict[str, Any]) -> None:
        """Genera la página de landing."""
        logger.debug("📄 Generando landing page...")
        try:
            generate_profile_landing(profile_path, profile_data)
            logger.debug("  ✓ Landing page generada")
        except Exception as e:
            logger.error(f"❌ Error en generate_profile_landing: {e}", exc_info=True)
            raise
    
    def launch_profile(self, profile_id: str, mode: str = "normal") -> Dict[str, Any]:
        """
        Lanza Chrome con perfil en el modo especificado.
        
        Args:
            profile_id: UUID completo o prefijo
            mode: 'normal' (landing) o 'discovery' (validación)
        """
        logger.info(f"🚀 Lanzando perfil {profile_id[:8]} en modo '{mode}'")
        start_time = time.time()
        
        profile = self._find_profile(profile_id)
        if not profile:
            logger.error(f"❌ Perfil no encontrado: {profile_id}")
            raise ValueError(f"Profile not found: {profile_id}")
        
        full_id = profile['id']
        profile_path = self.paths.profiles_dir / full_id
        
        logger.info(f"  → Perfil: {profile.get('alias')} ({full_id[:8]})")
        logger.info(f"  → Path: {profile_path}")
        
        # Provisioning
        logger.info("  🔄 Sincronizando recursos...")
        self.sync_profile_resources(full_id)
        
        # Determinar URL
        if mode == "discovery":
            url = f"chrome-extension://{self.paths.extension_id}/discovery/index.html"
            logger.debug(f"  → URL discovery: {url}")
        else:
            try:
                url = self.get_landing_url(full_id)
                logger.debug(f"  → URL landing: {url}")
            except Exception as e:
                logger.warning(f"  ⚠️ Landing no disponible, usando about:blank: {e}")
                url = "about:blank"
        
        # Rutas
        try:
            chrome_path = self._find_chrome_executable()
            logger.debug(f"  → Chrome: {chrome_path}")
        except FileNotFoundError as e:
            logger.error(f"❌ Chrome no encontrado: {e}", exc_info=True)
            raise
        
        extension_path = str((profile_path / "extension").resolve())
        logger.debug(f"  → Extension: {extension_path}")
        
        # Argumentos de Chrome
        chrome_args = [
            chrome_path,
            f"--user-data-dir={str(profile_path.resolve())}",
            f"--load-extension={extension_path}",
            f"--app={url}",
            "--enable-logging",
            "--v=1",
            "--no-first-run",
            "--no-default-browser-check",
            "--no-service-autorun",
            "--password-store=basic",
            "--restore-last-session"
        ]
        
        logger.debug(f"  → Argumentos: {len(chrome_args)} args")
        
        # Lanzar proceso
        try:
            creation_flags = 0
            if platform.system() == 'Windows':
                creation_flags = subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP
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
            
            logger.debug(f"  → PID: {process.pid}")
            logger.debug("  → Esperando 2s para verificar inicio...")
            time.sleep(2.0)
            
            if process.poll() is not None:
                _, stderr_out = process.communicate()
                err_msg = stderr_out.decode('utf-8', errors='ignore') if stderr_out else f"Exit Code {process.returncode}"
                logger.error(f"❌ Chrome falló al iniciar: {err_msg}")
                raise RuntimeError(f"Chrome failed to start: {err_msg}")
            
            duration = time.time() - start_time
            logger.info(f"✅ Perfil lanzado exitosamente en {duration:.2f}s (PID: {process.pid})")
            
            return {
                "status": "success",
                "operation": "launch",
                "data": {
                    "status": "launched",
                    "profile_id": full_id,
                    "alias": profile.get('alias'),
                    "pid": process.pid,
                    "url": url,
                    "extension_loaded": True,
                    "mode": mode
                }
            }
        except Exception as e:
            duration = time.time() - start_time
            logger.error(f"❌ Fallo al lanzar perfil después de {duration:.2f}s: {e}", exc_info=True)
            raise RuntimeError(f"Failed to launch profile {full_id}: {e}")
    
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
    
    def get_landing_url(self, profile_id: str) -> str:
        """Obtiene URL de landing page."""
        logger.debug(f"🔗 Obteniendo landing URL para {profile_id[:8]}")
        profile = self._find_profile(profile_id)
        
        if not profile:
            logger.error(f"❌ Perfil no encontrado: {profile_id}")
            raise ValueError("Profile not found")
        
        landing_path = self.paths.profiles_dir / profile['id'] / 'landing' / 'index.html'
        
        if not landing_path.exists():
            logger.error(f"❌ Landing page no existe: {landing_path}")
            raise FileNotFoundError("Landing page not found")
        
        url = landing_path.as_uri()
        logger.debug(f"  ✓ URL: {url}")
        return url
    
    def get_discovery_url(self, profile_id: str) -> str:
        """Obtiene URL de discovery page."""
        logger.debug(f"🔗 Obteniendo discovery URL para {profile_id[:8]}")
        profile = self._find_profile(profile_id)
        
        if not profile:
            logger.error(f"❌ Perfil no encontrado: {profile_id}")
            raise ValueError("Profile not found")
        
        path = self.paths.profiles_dir / profile['id']
        self._generate_discovery(path, profile)
        
        discovery_path = path / "discovery" / "index.html"
        if not discovery_path.exists():
            logger.error(f"❌ Discovery page no generada: {discovery_path}")
            raise FileNotFoundError("Discovery page generation failed")
        
        url = discovery_path.as_uri()
        logger.debug(f"  ✓ URL: {url}")
        return url
    
    def register_account(self, profile_id: str, provider: str, identifier: str) -> Dict[str, Any]:
        """Registra una cuenta en el perfil."""
        logger.info(f"📝 Registrando cuenta {provider} en perfil {profile_id[:8]}")
        
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