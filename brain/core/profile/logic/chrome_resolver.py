import os
import platform
from pathlib import Path
from typing import Optional
from brain.shared.logger import get_logger

logger = get_logger(__name__)

class ChromeResolver:
    """Busca el motor Chromium: .env > Interno (Portable) > Sistema."""
    
    def __init__(self, bin_dir: Optional[Path] = None):
        self.bin_dir = bin_dir
        self.chrome_path = self._resolve_path()
        
        if not self.chrome_path:
            raise FileNotFoundError("❌ Motor de navegación no encontrado.")
            
        logger.info(f"✅ Motor seleccionado: {self.chrome_path}")

    def _resolve_path(self) -> Optional[str]:
        # 1. Prioridad: .env (Para desarrollo o overrides)
        env_path = os.environ.get("BLOOM_CHROME_PATH")
        if env_path and os.path.exists(env_path):
            return env_path

        # 2. Prioridad: Motor Interno (Portable)
        system = platform.system()
        if self.bin_dir:
            if system == "Windows":
                internal = self.bin_dir / "chrome-win" / "chrome.exe"
                if internal.exists(): return str(internal)
            
            elif system == "Darwin": # macOS
                # Ruta al ejecutable dentro del Bundle .app
                internal = self.bin_dir / "chrome-mac" / "Chromium.app" / "Contents" / "MacOS" / "Chromium"
                if internal.exists(): return str(internal)

        # 3. Fallback: Sistema
        return self._find_system_chrome(system)

    def _find_system_chrome(self, system: str) -> Optional[str]:
        if system == "Windows":
            paths = [
                r"C:\Program Files\Google\Chrome\Application\chrome.exe",
                os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe")
            ]
        elif system == "Darwin":
            paths = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
        else:
            paths = []

        for p in paths:
            if os.path.exists(p): return p
        return None

    def cleanup_profile_locks(self, profiles_dir: Path):
        """Limpia locks huérfanos al inicio del sistema."""
        logger.info("🧹 Limpiando locks de perfiles...")
        
        cleaned = 0
        for profile_dir in Path(profiles_dir).iterdir():
            if profile_dir.is_dir():
                lock = profile_dir / "SingletonLock"
                if lock.exists():
                    try:
                        lock.unlink()
                        cleaned += 1
                        logger.debug(f"  ✓ {profile_dir.name}")
                    except:
                        pass
        
        if cleaned > 0:
            logger.info(f"✅ {cleaned} locks eliminados")