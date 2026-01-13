"""
Chrome Launcher - Binary discovery and subprocess management.
Handles Chrome process creation with proper flags and URL routing.
"""

import os
import platform
import subprocess
import time
from pathlib import Path
from typing import Dict, Any, Optional
from brain.shared.logger import get_logger

logger = get_logger(__name__)


class ChromeLauncher:
    """Handles Chrome binary discovery and process launching."""
    
    def __init__(self):
        logger.info("🔍 Initializing ChromeLauncher...")
        self.chrome_path = self._find_chrome_executable()
        logger.info(f"✅ Chrome binary found: {self.chrome_path}")
    
    def launch(
        self,
        profile_path: Path,
        extension_path: Path,
        url: str,
        mode: str = "normal"
    ) -> Dict[str, Any]:
        """
        Launches Chrome with specified configuration.
        
        Args:
            profile_path: Path to Chrome user data directory
            extension_path: Path to extension directory to load
            url: URL to open (can be chrome-extension:// or file://)
            mode: Launch mode ('normal' or 'discovery')
            
        Returns:
            Dict with launch status and process info
        """
        logger.info(f"🚀 Launching Chrome in '{mode}' mode...")
        logger.debug(f"  Profile: {profile_path}")
        logger.debug(f"  Extension: {extension_path}")
        logger.debug(f"  URL: {url}")
        
        chrome_args = self._build_chrome_args(
            profile_path, 
            extension_path, 
            url
        )
        
        logger.debug(f"Chrome arguments: {' '.join(chrome_args)}")
        
        try:
            logger.info("⏳ Spawning Chrome process...")
            process = self._spawn_process(chrome_args)
            logger.debug(f"Process spawned with PID: {process.pid}")
            
            # Verify process didn't die immediately
            logger.debug("Waiting 2s to verify process stability...")
            time.sleep(2.0)
            
            if process.poll() is not None:
                logger.error(f"❌ Chrome process died immediately (exit code: {process.returncode})")
                _, stderr_out = process.communicate()
                err_msg = stderr_out.decode('utf-8', errors='ignore') if stderr_out else f"Exit Code {process.returncode}"
                
                logger.error(f"Chrome stderr: {err_msg}")
                raise RuntimeError(f"Chrome failed to start: {err_msg}")
            
            logger.info(f"✅ Chrome launched successfully (PID: {process.pid})")
            
            return {
                "status": "launched",
                "pid": process.pid,
                "url": url,
                "mode": mode,
                "extension_loaded": True
            }
            
        except Exception as e:
            logger.error(f"❌ Failed to launch Chrome: {e}", exc_info=True)
            raise RuntimeError(f"Failed to launch Chrome: {e}")
    
    def _build_chrome_args(
        self, 
        profile_path: Path, 
        extension_path: Path, 
        url: str
    ) -> list:
        """Constructs Chrome command-line arguments."""
        logger.debug("📝 Building Chrome arguments...")
        
        args = [
            self.chrome_path,
            f"--user-data-dir={str(profile_path.resolve())}",
            f"--load-extension={str(extension_path.resolve())}",
            f"--app={url}",
            "--enable-logging",
            "--v=1",
            "--no-first-run",
            "--no-default-browser-check",
            "--no-service-autorun",
            "--password-store=basic",
            "--restore-last-session"
        ]
        
        logger.debug(f"Built {len(args)} arguments")
        return args
    
    def _spawn_process(self, chrome_args: list) -> subprocess.Popen:
        """Spawns detached Chrome process."""
        creation_flags = 0
        system = platform.system()
        
        if system == 'Windows':
            creation_flags = subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP
            logger.debug(f"Windows creation flags: {creation_flags}")
        
        logger.debug(f"Spawning process on {system}...")
        
        try:
            process = subprocess.Popen(
                chrome_args,
                creationflags=creation_flags,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                stdin=subprocess.DEVNULL,
                shell=False
            )
            
            logger.debug(f"✅ Process created successfully")
            return process
            
        except Exception as e:
            logger.error(f"❌ Failed to spawn process: {e}", exc_info=True)
            raise
    
    def _find_chrome_executable(self) -> Optional[str]:
        """Busca el ejecutable de Chrome de manera robusta en Windows."""
        import platform
        import os
        
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
            
            for path in candidates:
                if os.path.exists(path):
                    return path
                    
        elif system == "Darwin":  # macOS
            possible_paths = [
                "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
                os.path.expanduser("~/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
            ]
            for path in possible_paths:
                if os.path.exists(path):
                    return path

        return None