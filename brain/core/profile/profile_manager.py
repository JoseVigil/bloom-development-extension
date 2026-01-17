"""
Profile Manager - Orchestrator Facade.
Versión refactorizada con soporte unificado para lanzamiento spec-driven.
Permite que Sentinel (Go) controle completamente el lanzamiento de navegadores.
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
        
        # Sync resources
        logger.info("🔄 Sincronizando recursos iniciales...")
        self.sync_profile_resources(profile_id)
        
        elapsed = time.time() - start_time
        logger.info(f"✅ Perfil creado en {elapsed:.2f}s")
        return data
    
    def launch_profile(
        self, 
        profile_id: str, 
        url: Optional[str] = None,
        spec_data: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Lanza un perfil de Chrome/Chromium.
        
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
            raise ValueError(f"Perfil no encontrado: {profile_id}")
        
        full_id = profile['id']
        
        # 2. SIEMPRE sincronizar recursos antes de lanzar
        logger.info("🔄 Sincronizando recursos del perfil...")
        self.sync_profile_resources(full_id)
        
        # 3. Decidir modo de lanzamiento
        if spec_data:
            logger.info("📋 Modo SPEC-DRIVEN detectado")
            return self._launch_with_spec(profile, spec_data)
        else:
            logger.info("🔧 Modo LEGACY detectado (estrategias predefinidas)")
            return self._launch_legacy(profile, url)
    
    def _launch_with_spec(self, profile: Dict[str, Any], spec: Dict[str, Any]) -> Dict[str, Any]:
        """
        Lanza el navegador usando una especificación JSON completa.
        Este es el modo preferido para automatización (Sentinel/Go).
        
        El spec debe contener:
        - executable_path: Ruta al binario del navegador
        - user_data_dir: Ruta al directorio del perfil
        - extension_path: Ruta a la extensión
        - url: URL de destino
        - flags: Lista de argumentos adicionales
        """
        logger.info("🎯 Ejecutando lanzamiento spec-driven")
        
        # Validar campos requeridos
        required_fields = ['executable_path', 'user_data_dir', 'extension_path', 'url', 'flags']
        missing_fields = [f for f in required_fields if f not in spec]
        
        if missing_fields:
            raise ValueError(f"Spec incompleto. Faltan campos: {', '.join(missing_fields)}")
        
        # Validar que el ejecutable existe
        exec_path = Path(spec['executable_path'])
        if not exec_path.exists():
            raise FileNotFoundError(f"Ejecutable no encontrado: {exec_path}")
        
        # Construir argumentos del navegador
        chrome_args = [
            str(exec_path),
            f"--user-data-dir={spec['user_data_dir']}",
            f"--load-extension={spec['extension_path']}",
            f"--app={spec['url']}",
            *spec['flags']  # Flags adicionales desde el spec
        ]
        
        logger.debug(f"📝 Comando construido desde spec:")
        logger.debug(f"   Ejecutable: {exec_path}")
        logger.debug(f"   User Data: {spec['user_data_dir']}")
        logger.debug(f"   Extension: {spec['extension_path']}")
        logger.debug(f"   URL: {spec['url']}")
        logger.debug(f"   Flags: {len(spec['flags'])} argumentos")
        
        # Ejecutar con las mismas garantías de aislamiento
        return self._execute_browser(chrome_args, profile['id'])
    
    def _launch_legacy(self, profile: Dict[str, Any], url: Optional[str]) -> Dict[str, Any]:
        """
        Modo legacy: usa las estrategias predefinidas según el navegador disponible.
        """
        logger.info("🔧 Usando estrategia legacy")
        
        # Detectar navegador disponible
        if self.launcher.chromium_path and self.launcher.chromium_path.exists():
            logger.info("   → Estrategia: Chromium Portable")
            return self._launch_internal_chromium(profile, url)
        elif self.launcher.chrome_path and self.launcher.chrome_path.exists():
            logger.info("   → Estrategia: Chrome del Sistema")
            return self._launch_system_chrome(profile, url)
        else:
            raise RuntimeError("No se encontró ningún navegador (Chromium ni Chrome)")
    
    def _launch_internal_chromium(self, profile: Dict, url: Optional[str]) -> Dict[str, Any]:
        """ESTRATEGIA CHROMIUM PORTABLE: Lanzamiento limpio con Electron."""
        import sys
        import logging
        
        full_id = profile['id']
        profile_path = Path(self.paths.profiles_dir) / full_id
        target_url = url if url else self.get_discovery_url(full_id)
        
        # 1. CONFIGURACIÓN DE RUTAS
        u_data = os.path.abspath(profile_path)
        e_path = os.path.abspath(profile_path / "extension")
        
        # Crear directorio de logs
        logs_dir = self.paths.base_dir / "logs" / "profiles" / full_id
        logs_dir.mkdir(parents=True, exist_ok=True)
        debug_log = str(logs_dir / "chrome_debug.log")
        net_log = str(logs_dir / "chrome_net.log")

        # 2. ARGUMENTOS CHROMIUM
        chrome_args = [
            str(self.launcher.chromium_path),
            f"--user-data-dir={u_data}",
            f"--load-extension={e_path}",
            f"--app={target_url}",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-features=RendererCodeIntegrity",
            "--disable-blink-features=AutomationControlled",
            "--disable-web-security",
            "--disable-site-isolation-trials",
            "--disable-features=IsolateOrigins,site-per-process",
            "--allow-running-insecure-content",
            "--disable-popup-blocking",
            f"--remote-debugging-port=0",
            "--test-type",
            f"--log-file={debug_log}",
            f"--log-net-log={net_log}", 
            "--enable-logging",
            "--v=1"
        ]

        try:
            # 3. LANZAMIENTO DESACOPLADO
            subprocess.Popen(
                chrome_args,
                creationflags=0x00000008 | 0x00000200,  # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                stdin=subprocess.DEVNULL,
                shell=False
            )

            # 4. SALIDA LIMPIA PARA ELECTRON (Evita JSON Parse Error)
            logging.disable(logging.CRITICAL)
            sys.stdout = sys.__stdout__
            
            # Electron espera esto para avanzar
            print(json.dumps({
                "status": "success",
                "data": {"profile_id": full_id, "url": target_url}
            }))
            sys.stdout.flush()
            
            # MATAMOS PYTHON PARA LIBERAR STDOUT
            time.sleep(0.2)
            os._exit(0) 
        except:
            os._exit(1)

    def _launch_system_chrome(self, profile: Dict, url: Optional[str]) -> Dict[str, Any]:
        """ESTRATEGIA CHROME SYSTEM: Lanzamiento de instancia única garantizado."""        
        full_id = profile['id']
        profile_path = Path(self.paths.profiles_dir) / full_id
        target_url = url if url else self.get_discovery_url(full_id)
        
        u_data = os.path.abspath(profile_path)
        e_path = os.path.abspath(profile_path / "extension")

        # Remover lock file si existe
        lock_file = os.path.join(u_data, "SingletonLock")
        if os.path.exists(lock_file):
            try: 
                os.remove(lock_file)
                logger.debug(f"🗑️ Lock removido: {full_id}")
            except: 
                pass

        chrome_args = [
            str(self.launcher.chrome_path),
            f"--user-data-dir={u_data}",
            f"--load-extension={e_path}",
            f"--app={target_url}",
            "--no-first-run",
            "--no-default-browser-check",
            f"--remote-debugging-port=0",
            "--disable-features=RendererCodeIntegrity",
            "--test-type"
        ]

        return self._execute_browser(chrome_args, full_id)

    def _execute_browser(self, args: list, profile_id: str) -> Dict[str, Any]:
        """
        Ejecuta el navegador con flags de aislamiento apropiados.
        Mantiene compatibilidad con IPC de Electron.
        """
        logger.debug(f"🚀 Ejecutando navegador con {len(args)} argumentos")
        
        # 1. Kill preventivo del host nativo (Windows)
        if platform.system() == 'Windows':
            os.system('taskkill /f /im bloom-host.exe >nul 2>&1')

        # 2. Flags de aislamiento según OS
        if platform.system() == 'Windows':
            # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW
            flags = 0x00000008 | 0x00000200 | 0x08000000
        else:
            flags = 0

        try:
            subprocess.Popen(
                args,
                creationflags=flags,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                stdin=subprocess.DEVNULL,
                shell=False
            )
            
            # Silenciar logging para mantener IPC limpio
            import logging
            for handler in logging.getLogger().handlers[:]:
                logging.getLogger().removeHandler(handler)
            logging.getLogger().addHandler(logging.NullHandler())
            
            logger.info(f"✅ Navegador lanzado exitosamente: {profile_id[:8]}")
            
            return {
                "status": "success",
                "data": {
                    "profile_id": profile_id,
                    "engine": "active"
                }
            }
        except Exception as e:
            logger.error(f"❌ Error al lanzar navegador: {e}")
            return {"status": "error", "message": f"Browser launch failed: {str(e)}"}

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