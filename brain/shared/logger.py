"""
Brain Global Logger - Sistema de logging centralizado y robusto.
Captura TODO: importaciones, errores, warnings, ejecuciones de comandos.
"""
import logging
import os
import sys
import traceback
from pathlib import Path
from logging.handlers import RotatingFileHandler
from datetime import datetime
from typing import Optional

class BrainLogger:
    """Singleton para gestionar el logging global de Brain."""
    
    _instance: Optional['BrainLogger'] = None
    _initialized: bool = False
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        """No reinicializar si ya está configurado."""
        if BrainLogger._initialized:
            return
        
        self.log_dir: Optional[Path] = None
        self.log_file: Optional[Path] = None
        self.is_frozen = getattr(sys, 'frozen', False)
        
    def setup(self, verbose: bool = False, log_name: str = "brain_core"):
        """
        Inicializa el sistema de logging global.
        
        Args:
            verbose: Si True, muestra logs DEBUG en consola
            log_name: Nombre base del archivo de log
        """
        if BrainLogger._initialized:
            return
        
        try:
            # 1. Determinar directorio de logs (AppData en Windows, ~/.local/share en Linux/Mac)
            self.log_dir = self._get_log_directory()
            self.log_dir.mkdir(parents=True, exist_ok=True)
            
            # Archivo principal con timestamp
            timestamp = datetime.now().strftime("%Y%m%d")
            self.log_file = self.log_dir / f"{log_name}_{timestamp}.log"
            
            # 2. Configurar formato detallado
            log_format = logging.Formatter(
                '%(asctime)s | %(levelname)-8s | %(name)-30s | %(funcName)-20s | %(message)s',
                datefmt='%Y-%m-%d %H:%M:%S'
            )
            
            # 3. Handler para archivo (mantiene 5 archivos de 10MB cada uno)
            file_handler = RotatingFileHandler(
                self.log_file,
                maxBytes=10*1024*1024,  # 10MB
                backupCount=5,
                encoding='utf-8'
            )
            file_handler.setLevel(logging.DEBUG)  # El archivo captura TODO
            file_handler.setFormatter(log_format)
            
            # 4. Handler para consola (menos verboso por defecto)
            console_handler = logging.StreamHandler(sys.stdout)
            console_handler.setLevel(logging.DEBUG if verbose else logging.INFO)
            console_format = logging.Formatter('%(levelname)-8s | %(message)s')
            console_handler.setFormatter(console_format)
            
            # 5. Configurar el Logger Raíz (captura de TODA la aplicación)
            root = logging.getLogger()
            root.setLevel(logging.DEBUG)
            
            # Limpiar handlers anteriores si existen
            root.handlers.clear()
            
            root.addHandler(file_handler)
            root.addHandler(console_handler)
            
            # 6. Capturar excepciones no manejadas
            sys.excepthook = self._exception_handler
            
            # 7. Log inicial del sistema
            BrainLogger._initialized = True
            self._log_system_info()
            
            logging.info(f"🚀 [SYSTEM] Logger Global inicializado en: {self.log_file}")
            
        except Exception as e:
            # Fallback a stderr si falla el logging
            sys.stderr.write(f"❌ ERROR CRÍTICO: No se pudo inicializar el logger: {e}\n")
            traceback.print_exc()
    
    def _get_log_directory(self) -> Path:
        """Determina el directorio de logs según el sistema operativo."""
        if sys.platform == "win32":
            # Windows: %LOCALAPPDATA%\BloomNucleus\logs
            app_data = os.environ.get('LOCALAPPDATA') or os.environ.get('APPDATA')
            if not app_data:
                # Fallback a carpeta local si no hay AppData
                return Path.cwd() / "logs"
            return Path(app_data) / "BloomNucleus" / "logs"
        
        elif sys.platform == "darwin":
            # macOS: ~/Library/Logs/BloomNucleus
            return Path.home() / "Library" / "Logs" / "BloomNucleus"
        
        else:
            # Linux: ~/.local/share/BloomNucleus/logs
            xdg_data = os.environ.get('XDG_DATA_HOME')
            if xdg_data:
                return Path(xdg_data) / "BloomNucleus" / "logs"
            return Path.home() / ".local" / "share" / "BloomNucleus" / "logs"
    
    def _log_system_info(self):
        """Registra información del sistema para troubleshooting."""
        logger = logging.getLogger("brain.system")
        
        logger.info("=" * 80)
        logger.info("BRAIN SYSTEM STARTUP")
        logger.info("=" * 80)
        logger.info(f"Python: {sys.version}")
        logger.info(f"Platform: {sys.platform}")
        logger.info(f"Executable: {sys.executable}")
        logger.info(f"Frozen: {self.is_frozen}")
        logger.info(f"CWD: {os.getcwd()}")
        logger.info(f"Sys.path: {sys.path[:3]}...")  # Primeros 3 elementos
        logger.info(f"Log Directory: {self.log_dir}")
        logger.info("=" * 80)
    
    def _exception_handler(self, exc_type, exc_value, exc_traceback):
        """Captura excepciones no manejadas y las registra."""
        if issubclass(exc_type, KeyboardInterrupt):
            # No registrar Ctrl+C
            sys.__excepthook__(exc_type, exc_value, exc_traceback)
            return
        
        logger = logging.getLogger("brain.uncaught")
        logger.critical("EXCEPCIÓN NO MANEJADA", exc_info=(exc_type, exc_value, exc_traceback))
        
        # Mostrar en stderr también
        sys.__excepthook__(exc_type, exc_value, exc_traceback)
    
    @classmethod
    def get_logger(cls, name: str) -> logging.Logger:
        """
        Obtiene un logger específico para un módulo.
        
        Args:
            name: Nombre del módulo (ej: "brain.commands.edit")
        
        Returns:
            Logger configurado
        """
        return logging.getLogger(name)
    
    @classmethod
    def log_command_execution(cls, command_name: str, args: dict):
        """Registra la ejecución de un comando con sus argumentos."""
        logger = cls.get_logger("brain.commands")
        logger.info(f"▶️  Ejecutando comando: {command_name}")
        logger.debug(f"Argumentos: {args}")
    
    @classmethod
    def log_command_result(cls, command_name: str, success: bool, duration: float):
        """Registra el resultado de un comando."""
        logger = cls.get_logger("brain.commands")
        status = "✅ ÉXITO" if success else "❌ ERROR"
        logger.info(f"{status} | {command_name} | Duración: {duration:.2f}s")
    
    @classmethod
    def log_import_error(cls, module_name: str, error: Exception):
        """Registra errores de importación de módulos."""
        logger = cls.get_logger("brain.imports")
        logger.error(f"❌ Error al importar {module_name}: {error}")
        logger.debug("Traceback:", exc_info=True)


# Función de conveniencia para inicializar
def setup_global_logging(verbose: bool = False, log_name: str = "brain_core"):
    """
    Inicializa el sistema de logging global.
    Debe llamarse al inicio de main().
    
    Args:
        verbose: Muestra logs DEBUG en consola
        log_name: Nombre del archivo de log
    """
    brain_logger = BrainLogger()
    brain_logger.setup(verbose=verbose, log_name=log_name)


# Funciones helper para uso en cualquier módulo
def get_logger(name: str) -> logging.Logger:
    """Obtiene un logger para el módulo especificado."""
    return BrainLogger.get_logger(name)


def log_function_call(func):
    """Decorador para loggear llamadas a funciones."""
    import functools
    
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        logger = get_logger(func.__module__)
        logger.debug(f"→ Llamando {func.__name__}()")
        try:
            result = func(*args, **kwargs)
            logger.debug(f"← {func.__name__}() completado")
            return result
        except Exception as e:
            logger.error(f"❌ {func.__name__}() falló: {e}", exc_info=True)
            raise
    
    return wrapper