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
from brain.core.profile.landing_generator import generate_profile_landing
from brain.core.profile.discovery_generator import generate_discovery_page


class ProfileManager:
    """Chrome Worker profile manager."""
    
    def __init__(self):
        self.paths = PathResolver()
        if not self.paths.profiles_json.exists():
            self._save_profiles([])
        self._auto_recover_orphaned_profiles()
    
    def _load_profiles(self) -> List[Dict[str, Any]]:
        try:
            with open(self.paths.profiles_json, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (json.JSONDecodeError, FileNotFoundError):
            return []
    
    def _save_profiles(self, profiles: List[Dict[str, Any]]) -> None:
        with open(self.paths.profiles_json, 'w', encoding='utf-8') as f:
            json.dump(profiles, f, indent=2, ensure_ascii=False)
    
    def _auto_recover_orphaned_profiles(self) -> None:
        if not self.paths.profiles_dir.exists():
            return
        
        profiles = self._load_profiles()
        registered_ids = {p['id'] for p in profiles}
        physical_folders = [f for f in self.paths.profiles_dir.iterdir() if f.is_dir()]
        orphaned = []
        
        for folder in physical_folders:
            folder_id = folder.name
            try:
                uuid.UUID(folder_id)
            except ValueError:
                continue
            
            if folder_id not in registered_ids:
                alias = self._recover_alias_from_landing(folder) or f"Recovered {folder_id[:8]}"
                created_at = datetime.fromtimestamp(folder.stat().st_ctime).isoformat()
                orphaned.append({
                    "id": folder_id,
                    "alias": alias,
                    "created_at": created_at,
                    "linked_account": None
                })
        
        if orphaned:
            profiles.extend(orphaned)
            self._save_profiles(profiles)
    
    def _recover_alias_from_landing(self, folder: Path) -> Optional[str]:
        manifest_path = folder / "landing" / "manifest.json"
        if not manifest_path.exists():
            return None
        try:
            with open(manifest_path, 'r', encoding='utf-8') as f:
                return json.load(f).get('profile', {}).get('alias')
        except:
            return None
    
    def _find_profile(self, profile_id: str) -> Optional[Dict[str, Any]]:
        profiles = self._load_profiles()
        for p in profiles:
            if p.get('id') == profile_id:
                return p
        for p in profiles:
            if p.get('id', '').startswith(profile_id):
                return p
        return None
    
    def list_profiles(self) -> List[Dict[str, Any]]:
        profiles = self._load_profiles()
        for p in profiles:
            p['path'] = str(self.paths.profiles_dir / p['id'])
            p['exists'] = Path(p['path']).exists()
        return profiles
    
    def create_profile(self, alias: str) -> Dict[str, Any]:
        profiles = self._load_profiles()
        pid = str(uuid.uuid4())
        path = self.paths.profiles_dir / pid
        path.mkdir(parents=True, exist_ok=True)
        
        # NUEVO: Preparamos el Bridge al crear el perfil
        bridge_name = self._prepare_synapse_bridge(pid)
        
        data = {
            "id": pid,
            "alias": alias,
            "bridge_name": bridge_name, 
            "created_at": datetime.now().isoformat(),
            "linked_account": None
        }
        profiles.append(data)
        self._save_profiles(profiles)
        generate_profile_landing(path, data)
        return {**data, "path": str(path)}    

    def _prepare_synapse_bridge(self, profile_id: str) -> str:
        """
        Configura dinámicamente el Native Messaging Host para este perfil.
        Crea el JSON único y registra la entrada en Windows Registry.
        """
        if platform.system() != 'Windows':
            return "com.bloom.synapse.dummy" # Fallback para otros OS

        import winreg
        short_id = profile_id[:8]
        bridge_name = f"com.bloom.synapse.{short_id}"
        
        # 1. Definir y asegurar rutas
        # Ubicación: AppData/Local/BloomNucleus/bin/native/synapse/
        synapse_dir = self.paths.base_dir / "bin" / "native" / "synapse"
        synapse_dir.mkdir(parents=True, exist_ok=True)
        
        bridge_json_path = synapse_dir / f"{bridge_name}.json"
        host_exe_path = self.paths.base_dir / "bin" / "native" / "bloom-host.exe"

        # 2. Crear el contenido del JSON (Manifest Nativo)
        manifest_data = {
            "name": bridge_name,
            "description": f"Bloom Synapse Bridge for Profile {profile_id}",
            "path": str(host_exe_path.resolve()),
            "type": "stdio",
            "allowed_origins": [
                f"chrome-extension://{self.paths.extension_id}/"
            ],
            "args": ["--profile-id", profile_id] # <--- Identidad inyectada
        }

        with open(bridge_json_path, 'w', encoding='utf-8') as f:
            json.dump(manifest_data, f, indent=2)

        # 3. Registrar en Windows Registry (HKCU - No requiere Admin)
        reg_path = f"Software\\Google\\Chrome\\NativeMessagingHosts\\{bridge_name}"
        try:
            with winreg.CreateKey(winreg.HKEY_CURRENT_USER, reg_path) as key:
                winreg.SetValueEx(key, "", 0, winreg.REG_SZ, str(bridge_json_path.resolve()))
        except Exception as e:
            print(f"❌ Error escribiendo Registry: {e}")
            raise RuntimeError(f"Registry access failed: {e}")

        return bridge_name

    def _inject_extension_env(self, profile_id: str, bridge_name: str):
        """
        Escribe la configuración dinámica directamente en la carpeta 
        de la extensión para ese perfil.
        """
        # La extensión debe estar copiada en la carpeta del perfil para ser única
        extension_dir = self.paths.profiles_dir / profile_id / "extension"
        extension_dir.mkdir(parents=True, exist_ok=True)
        
        config_path = extension_dir / "synapse.config.js"
        
        # Escribimos usando 'self' para compatibilidad con Service Worker
        content = f"self.SYNAPSE_CONFIG = {{ bridge_name: '{bridge_name}' }};"
        
        with open(config_path, 'w', encoding='utf-8') as f:
            f.write(content)
        
        print(f"🧬 [Config] Inyectado bridge '{bridge_name}' en {config_path}")
    
    def get_landing_url(self, profile_id: str) -> str:
        """Get landing page URL."""
        profile = self._find_profile(profile_id)
        if not profile:
            raise ValueError("Profile not found")
        landing_path = self.paths.profiles_dir / profile['id'] / 'landing' / 'index.html'
        if not landing_path.exists():
            raise FileNotFoundError("Landing page not found")
        return landing_path.as_uri()
    
    def get_discovery_url(self, profile_id: str) -> str:
        """Generate and return discovery page URL."""
        profile = self._find_profile(profile_id)
        if not profile:
            raise ValueError("Profile not found")
        path = self.paths.profiles_dir / profile['id']
        generate_discovery_page(path, profile)
        discovery_path = path / "discovery" / "index.html"
        if not discovery_path.exists():
            raise FileNotFoundError("Discovery page generation failed")
        return discovery_path.as_uri()

    def sync_profile_resources(self, profile_id: str) -> None:
        """
        Garantiza que todos los archivos necesarios existan en la carpeta del perfil.
        Ideal para troubleshooting manual y autonomía total.
        """
        profile = self._find_profile(profile_id)
        if not profile:
            raise ValueError(f"Profile {profile_id} not found")

        profile_path = self.paths.profiles_dir / profile['id']
        profile_path.mkdir(parents=True, exist_ok=True)

        # 1. Sincronizar Extensión (Copia local por perfil)
        # Esto permite que cada perfil tenga su propio synapse.config.js
        target_ext_dir = profile_path / "extension"
        if target_ext_dir.exists():
            shutil.rmtree(target_ext_dir) # Siempre refrescamos para tener la última versión
        
        # Copiamos la extensión base desde el PathResolver
        shutil.copytree(self.paths.extension_path, target_ext_dir)
        
        # 2. Configurar Synapse Bridge (Registry + JSON + synapse.config.js)
        bridge_name = self._prepare_synapse_bridge(profile['id'])
        self._inject_extension_env(profile['id'], bridge_name)

        # 3. Generar Página de Discovery
        # Pasamos profile_path y el dict de profile
        generate_discovery_page(profile_path, profile)

        # 4. Generar Landing Page
        # (Asumiendo que tenés una lógica similar en landing_generator)
        generate_profile_landing(profile_path, profile)
        
        print(f"📦 [Provisioning] Recursos sincronizados para el perfil: {profile['alias']}")

    def _inject_extension_env(self, profile_id: str, bridge_name: str):
        """Escribe el synapse.config.js en la extensión local del perfil"""
        config_path = self.paths.profiles_dir / profile_id / "extension" / "synapse.config.js"
        content = f"self.SYNAPSE_CONFIG = {{ bridge_name: '{bridge_name}' }};"
        config_path.write_text(content, encoding='utf-8')    
    
    def launch_profile(self, profile_id: str, mode: str = "normal") -> Dict[str, Any]:
        """
        Lanza Chrome con un puente Synapse específico para el perfil.
        Modos: 'normal' (abre landing) o 'discovery' (abre validación).
        """
        profile = self._find_profile(profile_id)
        if not profile:
            raise ValueError(f"Profile not found: {profile_id}")

        full_profile_id = profile['id']
        profile_path = self.paths.profiles_dir / full_profile_id
        
        # 1. PROVISIONING: Garantizar que el perfil tiene sus propios archivos
        # Esto copia la extensión maestra a la carpeta del perfil y genera:
        # - synapse.config.js (con el nombre del bridge único)
        # - discovery/config.js (con los datos del perfil)
        # - El registro en Windows Registry para este bridge
        self.sync_profile_resources(full_profile_id)

        # 2. RUTAS CRÍTICAS
        chrome_path = self._find_chrome_executable()
        
        # IMPORTANTE: Cargamos la extensión que acabamos de copiar AL PERFIL
        # Esto permite que cada ventana tenga su propia configuración de bridge.
        profile_extension_path = str((profile_path / "extension").resolve())
        
        # 3. DETERMINAR URL DE ARRANQUE
        if mode == "discovery":
            # Usamos la URL interna de la extensión para evitar bloqueos de file://
            url = f"chrome-extension://{self.paths.extension_id}/discovery/index.html"
        else:
            try:
                url = self.get_landing_url(full_profile_id)
            except:
                url = "about:blank"

        # 4. ARGUMENTOS DE CHROME (Synapse Optimized)
        chrome_args = [
            chrome_path,
            f"--user-data-dir={str(profile_path.resolve())}",
            f"--load-extension={profile_extension_path}",
            f"--app={url}",
            "--enable-logging",
            "--v=1",
            "--no-first-run",
            "--no-default-browser-check",
            "--no-service-autorun",
            "--password-store=basic",
            # Esto evita que Chrome intente restaurar pestañas viejas y rompa el --app
            "--restore-last-session" 
        ]

        # 5. LANZAMIENTO DEL PROCESO
        try:
            creation_flags = 0
            if platform.system() == 'Windows':
                # Independizar el proceso de Chrome del proceso de Python (Brain)
                creation_flags = subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP
            
            process = subprocess.Popen(
                chrome_args,
                creationflags=creation_flags,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                stdin=subprocess.DEVNULL,
                shell=False
            )
            
            # Esperar un momento para verificar si murió al nacer (puerto ocupado, etc)
            time.sleep(2.0)
            
            if process.poll() is not None:
                _, stderr_out = process.communicate()
                err_msg = stderr_out.decode('utf-8', errors='ignore') if stderr_out else f"Exit Code {process.returncode}"
                raise RuntimeError(f"Chrome falló al iniciar: {err_msg}")
            
            return {
                "status": "success",
                "operation": "launch",
                "data": {
                    "status": "launched",
                    "profile_id": full_profile_id,
                    "alias": profile.get('alias'),
                    "pid": process.pid,
                    "url": url,
                    "extension_loaded": True,
                    "mode": mode
                }
            }
        except Exception as e:
            raise RuntimeError(f"Error crítico lanzando perfil {full_profile_id}: {e}")
    
    def destroy_profile(self, profile_id: str) -> Dict[str, Any]:
        profiles = self._load_profiles()
        profile_found = None
        updated = []
        
        for p in profiles:
            if p['id'] == profile_id or p['id'].startswith(profile_id):
                profile_found = p
            else:
                updated.append(p)
        
        if not profile_found:
            raise ValueError("Profile not found")
        
        path = self.paths.profiles_dir / profile_found['id']
        count = 0
        if path.exists():
            count = sum(1 for _ in path.rglob('*') if _.is_file())
            shutil.rmtree(path, ignore_errors=True)
        
        self._save_profiles(updated)
        return {
            "profile_id": profile_found['id'],
            "alias": profile_found.get('alias'),
            "deleted_files": count
        }
    
    def register_account(self, profile_id: str, provider: str, identifier: str) -> Dict[str, Any]:
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
                break
        
        if not found:
            raise ValueError("Profile not found")
        
        self._save_profiles(profiles)
        return {
            "profile_id": found['id'],
            "profile_alias": found.get('alias'),
            "provider": provider,
            "identifier": identifier
        }
    
    def remove_account(self, profile_id: str, provider: str) -> Dict[str, Any]:
        profiles = self._load_profiles()
        found = None
        
        for p in profiles:
            if p['id'].startswith(profile_id):
                if 'accounts' in p and provider in p['accounts']:
                    del p['accounts'][provider]
                    found = p
                break
        
        if not found:
            raise ValueError("Account or profile not found")
        
        self._save_profiles(profiles)
        return {
            "profile_id": found['id'],
            "provider": provider,
            "remaining_accounts": list(found.get('accounts', {}).keys())
        }
    
    def link_account(self, profile_id: str, email: str) -> Dict[str, Any]:
        """Legacy: link email to profile."""
        profiles = self._load_profiles()
        found = None
        
        for p in profiles:
            if p['id'].startswith(profile_id):
                p['linked_account'] = email
                found = p
                break
        
        if not found:
            raise ValueError("Profile not found")
        
        self._save_profiles(profiles)
        return {
            "profile_id": found['id'],
            "email": email
        }
    
    def unlink_account(self, profile_id: str) -> Dict[str, Any]:
        """Legacy: unlink email from profile."""
        profiles = self._load_profiles()
        found = None
        
        for p in profiles:
            if p['id'].startswith(profile_id):
                p['linked_account'] = None
                found = p
                break
        
        if not found:
            raise ValueError("Profile not found")
        
        self._save_profiles(profiles)
        return {"profile_id": found['id']}
    
    def _find_chrome_executable(self) -> str:
        system = platform.system()
        paths = []
        
        if system == "Windows":
            paths = [
                os.path.join(os.environ.get("ProgramFiles", ""), "Google/Chrome/Application/chrome.exe"),
                os.path.join(os.environ.get("ProgramFiles(x86)", ""), "Google/Chrome/Application/chrome.exe"),
                os.path.join(os.environ.get("LOCALAPPDATA", ""), "Google/Chrome/Application/chrome.exe"),
            ]
        elif system == "Darwin":
            paths = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
        else:
            paths = ["/usr/bin/google-chrome", "/usr/bin/chromium"]
        
        for p in paths:
            if os.path.exists(p):
                return p
        
        raise FileNotFoundError("Chrome not found")