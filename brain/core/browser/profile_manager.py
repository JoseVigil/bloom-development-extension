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
from brain.core.browser.landing_generator import generate_profile_landing


class ProfileManager:
    """
    Gestor de perfiles aislados de Chrome (Workers).
    Maneja el sistema de archivos y la ejecución de procesos.
    """
    
    def __init__(self):
        """Inicializa las rutas base según el sistema operativo"""
        self.base_dir = self._get_base_directory()
        self.workers_dir = self.base_dir / "profiles"
        self.profiles_file = self.base_dir / "profiles.json"
        
        # Crear directorios si no existen
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self.workers_dir.mkdir(parents=True, exist_ok=True)
        
        # Inicializar archivo JSON si no existe
        if not self.profiles_file.exists():
            self._save_profiles([])
        
        # Auto-recuperación de perfiles huérfanos
        self._auto_recover_orphaned_profiles()
    
    def _get_base_directory(self) -> Path:
        """Determina el directorio base según el sistema operativo"""
        system = platform.system()
        
        if system == "Windows":
            localappdata = os.environ.get("LOCALAPPDATA")
            if not localappdata:
                raise RuntimeError("Variable LOCALAPPDATA no encontrada")
            return Path(localappdata) / "BloomNucleus"
        
        elif system == "Darwin":  # macOS
            home = Path.home()
            return home / "Library" / "Application Support" / "BloomNucleus"
        
        else:  # Linux y otros
            home = Path.home()
            return home / ".local" / "share" / "BloomNucleus"
    
    def _load_profiles(self) -> List[Dict[str, Any]]:
        """Carga los perfiles desde el archivo JSON"""
        try:
            with open(self.profiles_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (json.JSONDecodeError, FileNotFoundError):
            return []
    
    def _save_profiles(self, profiles: List[Dict[str, Any]]) -> None:
        """Guarda los perfiles en el archivo JSON"""
        with open(self.profiles_file, 'w', encoding='utf-8') as f:
            json.dump(profiles, f, indent=2, ensure_ascii=False)
    
    def _auto_recover_orphaned_profiles(self) -> None:
        """
        Detecta y recupera perfiles físicos sin registro en JSON.
        
        Previene desincronización entre filesystem y database cuando:
        - profiles.json se corrompe o elimina
        - Hay cambio de rutas entre versiones
        - Perfiles creados manualmente o por scripts externos
        
        Ejecuta silenciosamente en __init__ sin output (excepto verbose mode).
        """
        if not self.workers_dir.exists():
            return
        
        profiles = self._load_profiles()
        registered_ids = {p['id'] for p in profiles}
        
        # Escanear carpetas físicas
        physical_folders = [f for f in self.workers_dir.iterdir() if f.is_dir()]
        
        orphaned = []
        for folder in physical_folders:
            folder_id = folder.name
            
            # Validar que es un UUID válido (formato de profile_id)
            try:
                uuid.UUID(folder_id)
            except ValueError:
                # No es un UUID válido, ignorar (podría ser otra carpeta)
                continue
            
            # Si no está registrado en JSON, es un perfil huérfano
            if folder_id not in registered_ids:
                # Intentar recuperar alias de landing/manifest.json
                alias = self._recover_alias_from_landing(folder)
                if not alias:
                    alias = f"Recovered {folder_id[:8]}"
                
                # Usar fecha de creación de la carpeta
                created_timestamp = folder.stat().st_ctime
                created_at = datetime.fromtimestamp(created_timestamp).isoformat()
                
                orphaned.append({
                    "id": folder_id,
                    "alias": alias,
                    "created_at": created_at,
                    "linked_account": None
                })
        
        # Registrar perfiles huérfanos silenciosamente
        if orphaned:
            profiles.extend(orphaned)
            self._save_profiles(profiles)
            # Note: No hay output aquí. El logging se maneja en CLI layer con verbose flag
    
    def _recover_alias_from_landing(self, folder: Path) -> Optional[str]:
        """
        Intenta recuperar el alias original desde landing/manifest.json.
        
        Args:
            folder: Path del perfil
            
        Returns:
            Alias encontrado o None si no existe
        """
        manifest_path = folder / "landing" / "manifest.json"
        if not manifest_path.exists():
            return None
        
        try:
            with open(manifest_path, 'r', encoding='utf-8') as f:
                manifest = json.load(f)
                return manifest.get('profile', {}).get('alias')
        except (json.JSONDecodeError, KeyError, IOError):
            return None
    
    def _find_profile(self, profile_id: str) -> Optional[Dict[str, Any]]:
        """Busca un perfil por su ID (soporta búsqueda parcial)"""
        profiles = self._load_profiles()
        
        # Búsqueda exacta primero
        for profile in profiles:
            if profile.get('id') == profile_id:
                return profile
        
        # Búsqueda parcial (prefijo)
        for profile in profiles:
            if profile.get('id', '').startswith(profile_id):
                return profile
        
        return None
    
    def list_profiles(self) -> List[Dict[str, Any]]:
        """Lista todos los perfiles existentes"""
        profiles = self._load_profiles()
        
        # Enriquecer con información de ruta
        for profile in profiles:
            profile_path = self.workers_dir / profile['id']
            profile['path'] = str(profile_path)
            profile['exists'] = profile_path.exists()
        
        return profiles
    
    def create_profile(self, alias: str) -> Dict[str, Any]:
        """
        Crea un nuevo perfil con el alias especificado.
        
        Args:
            alias: Nombre descriptivo del perfil
            
        Returns:
            Dict con los datos del perfil creado
        """
        profiles = self._load_profiles()
        
        # Generar UUID único
        profile_id = str(uuid.uuid4())
        profile_path = self.workers_dir / profile_id
        
        # Crear carpeta del perfil
        profile_path.mkdir(parents=True, exist_ok=True)
        
        # Crear registro del perfil
        profile_data = {
            "id": profile_id,
            "alias": alias,
            "created_at": datetime.now().isoformat(),
            "linked_account": None
        }
        
        profiles.append(profile_data)
        self._save_profiles(profiles)
        
        # 🆕 Generar landing page
        generate_profile_landing(profile_path, profile_data)
        
        return {
            **profile_data,
            "path": str(profile_path)
        }
    
    def get_landing_url(self, profile_id: str) -> str:
        """
        Genera la URL file:// para la landing page del perfil.
        
        Args:
            profile_id: ID del perfil (completo o prefijo)
            
        Returns:
            file:// URL absoluta de index.html
            
        Raises:
            ValueError: Si el perfil no existe
            FileNotFoundError: Si la landing page no existe
        """
        # Buscar perfil (soporta búsqueda parcial)
        profile = self._find_profile(profile_id)
        if not profile:
            raise ValueError(f"Perfil no encontrado: {profile_id}")
        
        # Usar el ID completo encontrado
        full_profile_id = profile['id']
        profile_path = self.workers_dir / full_profile_id
        landing_path = profile_path / 'landing' / 'index.html'
        
        if not landing_path.exists():
            raise FileNotFoundError(
                f"Landing page no encontrada.\n"
                f"Ruta esperada: {landing_path}\n"
                f"Tip: Crea la carpeta 'landing' con index.html en el perfil"
            )
        
        # Convertir a file:// URL según el sistema operativo
        absolute_path = landing_path.resolve()
        
        if platform.system() == "Windows":
            # Windows: C:\Users\... -> file:///C:/Users/...
            path_str = str(absolute_path).replace(os.sep, '/')
            url = f"file:///{path_str}"
        else:
            # Unix/Mac: /home/user/... -> file:///home/user/...
            url = f"file://{absolute_path}"
        
        return url
    
    def launch_profile(self, profile_id: str, url: Optional[str] = None) -> Dict[str, Any]:
        """
        Lanza Chrome con el perfil especificado (Versión Debuggeada).
        """
        # Verificar que el perfil existe
        profile = self._find_profile(profile_id)
        if not profile:
            raise ValueError(f"Perfil no encontrado: {profile_id}")
        
        full_profile_id = profile['id']
        profile_path = self.workers_dir / full_profile_id
        
        # Detectar Chrome
        chrome_path = self._find_chrome_executable()
        
        # --- DIAGNÓSTICO CRÍTICO ---
        print(f"\n🚀 [DEBUG-LAUNCH] Iniciando lanzamiento...")
        extension_path = self._get_extension_path() # <--- Aquí llama a tu función de búsqueda
        print(f"👉 [DEBUG-LAUNCH] _get_extension_path retornó: '{extension_path}'")
        
        # Construir argumentos
        chrome_args = [
            chrome_path,
            f"--user-data-dir={profile_path}",
            "--no-first-run",
            "--no-default-browser-check",
        ]
        
        # Lógica de Extensión
        if extension_path:
            print(f"✅ [DEBUG-LAUNCH] Agregando flag --load-extension")
            chrome_args.append(f"--load-extension={extension_path}")
        else:
            print(f"⚠️ [DEBUG-LAUNCH] extension_path es None/Empty. No se cargará extensión.")
        
        # URL Logic...
        if url:
            if url.startswith(("http://", "https://", "file://")):
                chrome_args.append(f"--app={url}")
            else:
                chrome_args.append(url)
        
        # Lanzamiento
        pid = None
        try:
            if platform.system() == "Windows":
                process = subprocess.Popen(
                    chrome_args,
                    creationflags=subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL
                )
            else:
                process = subprocess.Popen(
                    chrome_args,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    start_new_session=True
                )
            time.sleep(0.5)
            pid = process.pid if process.poll() is None else None
            print(f"🏁 [DEBUG-LAUNCH] Proceso lanzado. PID: {pid}")
            
        except Exception as e:
            raise RuntimeError(f"Error al lanzar Chrome: {e}")
        
        # Retorno explícito
        result_data = {
            "profile_id": full_profile_id,
            "alias": profile.get('alias'),
            "pid": pid,
            "url": url,
            "chrome_path": chrome_path,
            "extension_loaded": bool(extension_path), # Forzamos booleano
            "extension_path": extension_path
        }
        
        print(f"📦 [DEBUG-LAUNCH] Retornando datos al CLI: loaded={result_data['extension_loaded']}")
        return result_data
    
    def destroy_profile(self, profile_id: str) -> Dict[str, Any]:
        """
        Elimina un perfil y sus datos del disco.
        
        Args:
            profile_id: ID del perfil a eliminar (completo o prefijo)
            
        Returns:
            Dict con información de la eliminación
        """
        profiles = self._load_profiles()
        
        # Buscar perfil (soporta búsqueda parcial)
        profile_found = None
        updated_profiles = []
        
        for profile in profiles:
            pid = profile.get('id', '')
            if pid == profile_id or pid.startswith(profile_id):
                profile_found = profile
            else:
                updated_profiles.append(profile)
        
        if not profile_found:
            raise ValueError(f"Perfil no encontrado: {profile_id}")
        
        # Eliminar carpeta física
        full_profile_id = profile_found['id']
        profile_path = self.workers_dir / full_profile_id
        deleted_files = 0
        
        if profile_path.exists():
            # Contar archivos antes de borrar
            try:
                deleted_files = sum(1 for _ in profile_path.rglob('*') if _.is_file())
                shutil.rmtree(profile_path)
            except Exception as e:
                raise RuntimeError(f"Error al eliminar carpeta: {e}")
        
        # Guardar cambios en JSON
        self._save_profiles(updated_profiles)
        
        return {
            "profile_id": full_profile_id,
            "alias": profile_found.get('alias'),
            "deleted_files": deleted_files
        }
    
    def set_account(self, profile_id: str, email: Optional[str]) -> Dict[str, Any]:
        """
        Asocia o desasocia una cuenta de email al perfil.
        
        Args:
            profile_id: ID del perfil (completo o prefijo)
            email: Email a asociar (None para desasociar)
            
        Returns:
            Dict con los datos actualizados del perfil
        """
        profiles = self._load_profiles()
        
        profile_found = None
        for profile in profiles:
            pid = profile.get('id', '')
            if pid == profile_id or pid.startswith(profile_id):
                profile['linked_account'] = email
                profile_found = profile
                break
        
        if not profile_found:
            raise ValueError(f"Perfil no encontrado: {profile_id}")
        
        self._save_profiles(profiles)
        
        return {
            "profile_id": profile_found['id'],
            "alias": profile_found.get('alias'),
            "linked_account": email
        }
    
    def register_account(self, profile_id: str, provider: str, identifier: str) -> Dict[str, Any]:
        """
        Registra una cuenta multi-provider en un perfil.
        
        Args:
            profile_id: ID del perfil (completo o prefijo)
            provider: Proveedor (google, openai, anthropic, etc)
            identifier: Email o identificador de la cuenta
            
        Returns:
            Dict con información del registro
        """
        profiles = self._load_profiles()
        
        profile_found = None
        for profile in profiles:
            pid = profile.get('id', '')
            if pid == profile_id or pid.startswith(profile_id):
                profile_found = profile
                break
        
        if not profile_found:
            raise ValueError(f"Perfil no encontrado: {profile_id}")
        
        # Inicializar accounts si no existe
        if 'accounts' not in profile_found:
            profile_found['accounts'] = {}
        
        # Registrar cuenta
        profile_found['accounts'][provider] = {
            "identifier": identifier,
            "registered_at": datetime.now().isoformat()
        }
        
        self._save_profiles(profiles)
        
        return {
            "profile_id": profile_found['id'],
            "profile_alias": profile_found.get('alias'),
            "provider": provider,
            "identifier": identifier
        }
    
    def remove_account(self, profile_id: str, provider: str) -> Dict[str, Any]:
        """
        Remueve una cuenta de un perfil.
        
        Args:
            profile_id: ID del perfil (completo o prefijo)
            provider: Proveedor a remover
            
        Returns:
            Dict con información de la remoción
        """
        profiles = self._load_profiles()
        
        profile_found = None
        for profile in profiles:
            pid = profile.get('id', '')
            if pid == profile_id or pid.startswith(profile_id):
                profile_found = profile
                break
        
        if not profile_found:
            raise ValueError(f"Perfil no encontrado: {profile_id}")
        
        if 'accounts' not in profile_found or provider not in profile_found['accounts']:
            raise ValueError(f"Cuenta {provider} no encontrada en perfil")
        
        # Remover cuenta
        del profile_found['accounts'][provider]
        
        self._save_profiles(profiles)
        
        return {
            "profile_id": profile_found['id'],
            "provider": provider,
            "remaining_accounts": list(profile_found.get('accounts', {}).keys())
        }
    
    def link_account(self, profile_id: str, email: str) -> Dict[str, Any]:
        """DEPRECATED: Usar set_account o register_account"""
        return self.set_account(profile_id, email)
    
    def unlink_account(self, profile_id: str) -> Dict[str, Any]:
        """DEPRECATED: Usar set_account(profile_id, None) o remove_account"""
        return self.set_account(profile_id, None)
    
    def _find_chrome_executable(self) -> Optional[str]:
        """Busca el ejecutable de Chrome según el sistema operativo"""
        system = platform.system()
        
        possible_paths = []
        
        if system == "Windows":
            possible_paths = [
                os.path.join(os.environ.get("ProgramFiles", ""), "Google", "Chrome", "Application", "chrome.exe"),
                os.path.join(os.environ.get("ProgramFiles(x86)", ""), "Google", "Chrome", "Application", "chrome.exe"),
                os.path.join(os.environ.get("LOCALAPPDATA", ""), "Google", "Chrome", "Application", "chrome.exe"),
            ]
        
        elif system == "Darwin":  # macOS
            possible_paths = [
                "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            ]
        
        else:  # Linux
            possible_paths = [
                "/usr/bin/google-chrome",
                "/usr/bin/google-chrome-stable",
                "/usr/bin/chromium",
                "/usr/bin/chromium-browser",
            ]
        
        # Buscar el primer ejecutable que existe
        for path in possible_paths:
            if os.path.exists(path):
                return path
        
        return None
    
    def _get_extension_path(self) -> Optional[str]:
        """Busca la extensión Bloom con diagnóstico detallado."""
        import sys
        
        # Lista de candidatos a probar
        candidates = []
        
        # 1. Variable de entorno (Prioridad Máxima)
        env_path = os.environ.get("BLOOM_EXTENSION_PATH")
        if env_path:
            candidates.append(("ENV_VAR", Path(env_path)))

        # 2. Producción (AppData/BloomNucleus/extension)
        # Probamos FLAT (extension/manifest.json) y ANIDADA (extension/src/manifest.json)
        prod_root = self.base_dir / "extension"
        candidates.append(("PROD_FLAT", prod_root))
        candidates.append(("PROD_SRC", prod_root / "src"))

        # 3. Desarrollo (Relativo al script)
        try:
            dev_path = Path(__file__).parents[4] / "chrome-extension" / "src"
            candidates.append(("DEV_REPO", dev_path))
        except:
            pass

        # === DIAGNÓSTICO (Se imprimirá al lanzar) ===
        print(f"\n🔎 [DEBUG] Buscando extensión Bloom...")
        
        for source, path_obj in candidates:
            manifest = path_obj / "manifest.json"
            exists = path_obj.exists()
            has_manifest = manifest.exists()
            
            # Solo imprimimos si existe la carpeta para no ensuciar, 
            # o si es la variable de entorno (para ver si llega mal)
            if exists or source == "ENV_VAR":
                print(f"   - {source}: {path_obj}")
                print(f"     ¿Carpeta existe? {exists}")
                print(f"     ¿Tiene manifest? {has_manifest}")
            
            if exists and has_manifest:
                print(f"   ✅ ENCONTRADA en: {source}\n")
                return str(path_obj)
        
        print("   ❌ NO SE ENCONTRÓ LA EXTENSIÓN EN NINGUNA RUTA.\n")
        return None