"""
Chrome Resolver - Binary discovery and validation.
Locates Chrome executable across different platforms.
"""

import os
import platform
from typing import Optional
from brain.shared.logger import get_logger

logger = get_logger(__name__)


class ChromeResolver:
    """Handles Chrome binary discovery and validation."""
    
    def __init__(self):
        logger.info("🔍 Initializing ChromeResolver...")
        self.chrome_path = self._find_chrome_executable()
        logger.info(f"✅ Chrome binary found: {self.chrome_path}")
    
    def _find_chrome_executable(self) -> Optional[str]:
        """Busca el ejecutable de Chrome de manera robusta en Windows."""
        system = platform.system()
        
        if system == "Windows":
            # Rutas EXPLICITAS (Hardcoded son las más seguras en instaladores)
            candidates = [
                r"C:\Program Files\Google\Chrome\Application\chrome.exe",
                r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
                os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
                os.path.expandvars(r"%PROGRAMFILES%\Google\Chrome\Application\chrome.exe"),
                os.path.expandvars(r"%PROGRAMFILES(X86)%\Google\Chrome\Application\chrome.exe")
            ]
            
            logger.debug(f"Searching Chrome in {len(candidates)} Windows locations...")
            for path in candidates:
                logger.debug(f"  Checking: {path}")
                if os.path.exists(path):
                    logger.info(f"  ✅ Found: {path}")
                    return path
            
            logger.error("❌ Chrome not found in any Windows location")
            raise FileNotFoundError("Chrome executable not found on Windows")
                    
        elif system == "Darwin":  # macOS
            possible_paths = [
                "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
                os.path.expanduser("~/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
            ]
            
            logger.debug(f"Searching Chrome in {len(possible_paths)} macOS locations...")
            for path in possible_paths:
                logger.debug(f"  Checking: {path}")
                if os.path.exists(path):
                    logger.info(f"  ✅ Found: {path}")
                    return path
            
            logger.error("❌ Chrome not found in any macOS location")
            raise FileNotFoundError("Chrome executable not found on macOS")
        
        else:
            logger.error(f"❌ Unsupported platform: {system}")
            raise NotImplementedError(f"Chrome discovery not implemented for {system}")