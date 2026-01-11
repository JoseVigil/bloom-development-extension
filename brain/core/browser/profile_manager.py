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
    FIX: Lanzamiento totalmente desacoplado + rutas normalizadas + extensión cargada
    """
    
    def __init__(self):
        """Inicializa las rutas base segun el sistema operativo"""
        self.base_dir = self._get_base_directory()
        self.workers_dir = self.base_dir / "profiles"
        self.profiles_file = self.base_dir / "profiles.json"
        
        # Crear directorios si no existen
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self.workers_dir.mkdir(parents=True, exist_ok=True)
        
        # Inicializar archivo JSON si no existe
        if not self.profiles_file.exists():
            self._save_profiles([])
        
        # Auto-recuperacion de perfiles huerfanos
        self._auto_recover_orphaned_profiles()
    
    def _get_base_directory(self) -> Path:
        """
        Determina el directorio raíz de BloomNucleus.
        
        Estrategia:
        1. PROD: Si corre como ejecutable compilado (frozen), usa su ubicación relativa.
           Esto hace que la app sea "portable" y robusta en Windows/Mac/Linux.
        2. DEV: Si corre como script Python, usa las rutas estándar del SO (AppData, Library, etc).
        """
        import sys # Asegúrate de tener import sys arriba

        # --- ESCENARIO 1: PRODUCCIÓN (Ejecutable Compilado) ---
        if getattr(sys, 'frozen', False):
            # sys.executable apunta a: .../BloomNucleus/bin/brain.exe (o similar)
            # Queremos llegar a:       .../BloomNucleus
            exe_path = Path(sys.executable)
            
            # Subimos 2 niveles (bin -> BloomNucleus)
            # Ajusta esto si tu exe está en la raíz o en otra subcarpeta
            return exe_path.parent.parent

        # --- ESCENARIO 2: DESARROLLO (Script Python) ---
        system = platform.system()
        
        if system == "Windows":
            localappdata = os.environ.get("LOCALAPPDATA")
            if not localappdata:
                # Fallback seguro por si la variable de entorno falla
                return Path.home() / "AppData" / "Local" / "BloomNucleus"
            return Path(localappdata) / "BloomNucleus"
        
        elif system == "Darwin":  # macOS
            return Path.home() / "Library" / "Application Support" / "BloomNucleus"
        
        else:  # Linux y otros (Unix standard)
            return Path.home() / ".local" / "share" / "BloomNucleus"
    
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
        Detecta y recupera perfiles fisicos sin registro en JSON.
        """
        if not self.workers_dir.exists():
            return
        
        profiles = self._load_profiles()
        registered_ids = {p['id'] for p in profiles}
        
        # Escanear carpetas fisicas
        physical_folders = [f for f in self.workers_dir.iterdir() if f.is_dir()]
        
        orphaned = []
        for folder in physical_folders:
            folder_id = folder.name
            
            # Validar que es un UUID valido (formato de profile_id)
            try:
                uuid.UUID(folder_id)
            except ValueError:
                continue
            
            # Si no esta registrado en JSON, es un perfil huerfano
            if folder_id not in registered_ids:
                alias = self._recover_alias_from_landing(folder)
                if not alias:
                    alias = f"Recovered {folder_id[:8]}"
                
                created_timestamp = folder.stat().st_ctime
                created_at = datetime.fromtimestamp(created_timestamp).isoformat()
                
                orphaned.append({
                    "id": folder_id,
                    "alias": alias,
                    "created_at": created_at,
                    "linked_account": None
                })
        
        # Registrar perfiles huerfanos silenciosamente
        if orphaned:
            profiles.extend(orphaned)
            self._save_profiles(profiles)
    
    def _recover_alias_from_landing(self, folder: Path) -> Optional[str]:
        """Intenta recuperar el alias original desde landing/manifest.json."""
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
        """Busca un perfil por su ID (soporta busqueda parcial)"""
        profiles = self._load_profiles()
        
        # Busqueda exacta primero
        for profile in profiles:
            if profile.get('id') == profile_id:
                return profile
        
        # Busqueda parcial (prefijo)
        for profile in profiles:
            if profile.get('id', '').startswith(profile_id):
                return profile
        
        return None
    
    def list_profiles(self) -> List[Dict[str, Any]]:
        """Lista todos los perfiles existentes"""
        profiles = self._load_profiles()
        
        # Enriquecer con informacion de ruta
        for profile in profiles:
            profile_path = self.workers_dir / profile['id']
            profile['path'] = str(profile_path)
            profile['exists'] = profile_path.exists()
        
        return profiles
    
    def create_profile(self, alias: str) -> Dict[str, Any]:
        """Crea un nuevo perfil con el alias especificado."""
        profiles = self._load_profiles()
        
        # Generar UUID unico
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
        
        # Generar landing page
        generate_profile_landing(profile_path, profile_data)
        
        return {
            **profile_data,
            "path": str(profile_path)
        }
    
    def get_landing_url(self, profile_id: str) -> str:
        """Genera la URL file:// para la landing page del perfil."""
        profile = self._find_profile(profile_id)
        if not profile:
            raise ValueError(f"Perfil no encontrado: {profile_id}")
        
        full_profile_id = profile['id']
        profile_path = self.workers_dir / full_profile_id
        landing_path = profile_path / 'landing' / 'index.html'
        
        if not landing_path.exists():
            raise FileNotFoundError(
                f"Landing page no encontrada.\n"
                f"Ruta esperada: {landing_path}\n"
                f"Tip: Crea la carpeta 'landing' con index.html en el perfil"
            )
        
        # Convertir a file:// URL segun el sistema operativo
        absolute_path = landing_path.resolve()
        
        if platform.system() == "Windows":
            path_str = str(absolute_path).replace(os.sep, '/')
            url = f"file:///{path_str}"
        else:
            url = f"file://{absolute_path}"
        
        return url
    
    def _get_extension_path(self) -> str:
        """
        Busca la extensión en este orden de prioridad:
        1. Variable de entorno BLOOM_EXTENSION_PATH
        2. Ruta de desarrollo relativa (dentro del repo)
        3. Ruta de instalación en AppData (Producción)
        """
        # 1. Variable de Entorno
        env_path = os.environ.get("BLOOM_EXTENSION_PATH")
        if env_path:
            path_obj = Path(env_path)
            if (path_obj / "manifest.json").exists():
                return str(path_obj)

        # 2. Modo Desarrollo (Asumiendo estructura: repo/installer/brain/profile_manager.py)
        # Subimos niveles hasta encontrar chrome-extension/src
        current_file = Path(__file__).resolve()
        # Ajusta estos .parent según la profundidad de tu archivo python en el repo
        # Si estás en repo/brain/core/browser/profile_manager.py (ejemplo)
        repo_root = current_file.parent.parent.parent.parent 
        dev_path = repo_root / "chrome-extension" / "src"
        
        if (dev_path / "manifest.json").exists():
            print(f"🐛 [DEV MODE] Usando extensión desde repo: {dev_path}")
            return str(dev_path)

        # 3. Modo Producción (AppData)
        prod_path = self.base_dir / "bin" / "extension"
        # A veces copiamos src dentro de extension, o el contenido directo. 
        # Verificamos ambas.
        if (prod_path / "manifest.json").exists():
            return str(prod_path)
        if (prod_path / "src" / "manifest.json").exists():
            return str(prod_path / "src")

        # Si llegamos aquí, pánico.
        raise FileNotFoundError(
            f"❌ MANIFEST NO ENCONTRADO.\n"
            f"Buscado en:\n"
            f"1. Env Var BLOOM_EXTENSION_PATH\n"
            f"2. Dev: {dev_path}\n"
            f"3. Prod: {prod_path}"
        )

    def launch_profile(self, profile_id: str, url: Optional[str] = None) -> Dict[str, Any]:
        profile = self._find_profile(profile_id)
        if not profile:
            raise ValueError(f"Perfil no encontrado: {profile_id}")
        
        full_profile_id = profile['id']
        profile_path = os.path.normpath(str(self.workers_dir / full_profile_id))
        chrome_path = os.path.normpath(self._find_chrome_executable())
        
        # Intentar obtener extensión, si falla, lanzamos error (es vital para Bloom)
        try:
            extension_path = os.path.normpath(self._get_extension_path())
        except FileNotFoundError as e:
            print(e)
            # En modo dev, quizás quieras fallar. En prod, quizás no.
            # Por ahora dejemos que falle para que te des cuenta.
            raise e 

        if not url:
            try:
                url = self.get_landing_url(full_profile_id)
            except:
                url = "about:blank"

        # Argumentos Chrome
        chrome_args = [
            chrome_path,
            f'--user-data-dir={profile_path}',
            f'--load-extension={extension_path}', # Fundamental
            '--no-first-run',
            '--no-default-browser-check',
            '--enable-logging', # Útil para debug
            '--v=1',
            url
        ]
        
        print(f"🚀 Lanzando Chrome con perfil: {full_profile_id}")
        
        try:
            # En Windows DETACHED es bueno para prod, pero en dev a veces oculta errores
            creation_flags = 0
            if platform.system() == 'Windows':
                creation_flags = subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP
            
            process = subprocess.Popen(
                chrome_args,
                creationflags=creation_flags,
                # Quitamos DEVNULL en stderr para ver si Chrome grita algo en consola
                stdout=subprocess.DEVNULL, 
                stderr=subprocess.PIPE if platform.system() == 'Windows' else subprocess.DEVNULL,
                stdin=subprocess.DEVNULL,
                shell=False
            )
            
            # Esperar un poco más para asegurar que no sea un crash inmediato
            time.sleep(1.0) 
            
            # Verificar si murió
            if process.poll() is not None:
                _, stderr_out = process.communicate()
                err_msg = stderr_out.decode('utf-8', errors='ignore') if stderr_out else "Sin output de error"
                raise RuntimeError(f"Chrome murió inmediatamente. Stderr: {err_msg}")
            
            return {
                "status": "launched",
                "profile_id": full_profile_id,
                "alias": profile.get('alias'),
                "pid": process.pid,
                "extension_path": extension_path
            }
            
        except Exception as e:
            raise RuntimeError(f"Fallo al lanzar Chrome: {e}")
    
    def destroy_profile(self, profile_id: str) -> Dict[str, Any]:
        """Elimina un perfil y sus datos del disco."""
        profiles = self._load_profiles()
        
        # Buscar perfil (soporta busqueda parcial)
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
        
        # Eliminar carpeta fisica
        full_profile_id = profile_found['id']
        profile_path = self.workers_dir / full_profile_id
        deleted_files = 0
        
        if profile_path.exists():
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
        """Asocia o desasocia una cuenta de email al perfil."""
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
        """Registra una cuenta multi-provider en un perfil."""
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
        """Remueve una cuenta de un perfil."""
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
    
    def _find_chrome_executable(self) -> str:
        """Busca el ejecutable de Chrome segun el sistema operativo"""
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
        
        raise FileNotFoundError("Chrome no encontrado en rutas estandar")
    
    