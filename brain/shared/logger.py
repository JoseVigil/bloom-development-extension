"""
Brain Global Logger - Sistema de logging centralizado y robusto.
Configuración: Disco (DEBUG/Todo) | Consola (ERROR/Silencioso).
Soporta namespaces especializados con archivos dedicados.
"""
import logging
import os
import sys
import traceback
from pathlib import Path
from logging.handlers import RotatingFileHandler
from datetime import datetime
from typing import Optional, Dict

class BrainLogger:
    """Singleton para gestionar el logging global de Brain."""
    
    _instance: Optional['BrainLogger'] = None
    _initialized: bool = False
    _specialized_handlers: Dict[str, RotatingFileHandler] = {}
    
    # Configuración de namespaces especializados
    SPECIALIZED_NAMESPACES = {
        'brain.profile': {
            'file_prefix': 'brain_profile',
            'level': logging.DEBUG,
            'propagate': True,  # También va a brain_core.log
        }
        # Puedes agregar más aquí en el futuro:
        # 'brain.worker': {'file_prefix': 'brain_worker', ...},
    }
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        if BrainLogger._initialized:
            return
        
        self.log_dir: Optional[Path] = None
        self.log_file: Optional[Path] = None
        self.is_frozen = getattr(sys, 'frozen', False)
        
    def setup(self, verbose: bool = False, log_name: str = "brain_core"):
        """
        Inicializa el sistema de logging global.
        
        Configuración de Niveles:
        - Archivo: DEBUG (Captura cada detalle técnico)
        - Consola: ERROR (Silencio total para el usuario, salvo fallos o --verbose)
        """
        if BrainLogger._initialized:
            return
        
        try:
            # 1. Determinar directorio de logs
            self.log_dir = self._get_log_directory()
            self.log_dir.mkdir(parents=True, exist_ok=True)
            
            # Archivo por día
            timestamp = datetime.now().strftime("%Y%m%d")
            self.log_file = self.log_dir / f"{log_name}_{timestamp}.log"
            
            # 2. Formato detallado para el archivo
            log_format = logging.Formatter(
                '%(asctime)s | %(levelname)-8s | %(name)-30s | %(funcName)-20s | %(message)s',
                datefmt='%Y-%m-%d %H:%M:%S'
            )
            
            # 3. Handler para ARCHIVO (CAJA NEGRA - TODO)
            file_handler = RotatingFileHandler(
                self.log_file,
                maxBytes=10*1024*1024,  # 10MB
                backupCount=5,
                encoding='utf-8'
            )
            file_handler.setLevel(logging.DEBUG)
            file_handler.setFormatter(log_format)
            
            # 4. Handler para CONSOLA (INTERFAZ LIMPIA)
            console_handler = logging.StreamHandler(sys.stdout)
            
            if verbose:
                console_handler.setLevel(logging.DEBUG)
                console_format = logging.Formatter('%(levelname)-8s | %(name)-20s | %(message)s')
            else:
                console_handler.setLevel(logging.ERROR)
                console_format = logging.Formatter('%(levelname)-8s | %(message)s')
            
            console_handler.setFormatter(console_format)
            
            # 5. Configurar Logger Raíz
            root = logging.getLogger()
            root.setLevel(logging.DEBUG)
            
            root.handlers.clear()
            root.addHandler(file_handler)
            root.addHandler(console_handler)
            
            # 6. Configurar namespaces especializados
            self._setup_specialized_namespaces(timestamp, log_format)
            
            # 7. Capturar excepciones no manejadas
            sys.excepthook = self._exception_handler
            
            # 8. Registrar inicio
            BrainLogger._initialized = True
            self._log_system_info()
            
            logging.debug(f"Logger inicializado. Terminal Level: {'DEBUG' if verbose else 'ERROR'}")
            
        except Exception as e:
            sys.stderr.write(f"❌ ERROR CRÍTICO: No se pudo inicializar el logger: {e}\n")
            traceback.print_exc()
    
    def _setup_specialized_namespaces(self, timestamp: str, log_format: logging.Formatter):
        """
        Configura handlers dedicados para namespaces especializados.
        
        Cada namespace en SPECIALIZED_NAMESPACES obtiene:
        - Su propio archivo de log
        - Configuración de nivel personalizada
        - Propagación opcional al logger raíz
        """
        for namespace, config in self.SPECIALIZED_NAMESPACES.items():
            try:
                # Crear archivo dedicado
                file_prefix = config['file_prefix']
                specialized_file = self.log_dir / f"{file_prefix}_{timestamp}.log"
                
                # Handler dedicado
                specialized_handler = RotatingFileHandler(
                    str(specialized_file),
                    maxBytes=20*1024*1024,  # 20MB
                    backupCount=10,
                    encoding='utf-8'
                )
                specialized_handler.setLevel(config['level'])
                specialized_handler.setFormatter(log_format)
                
                # Configurar el logger del namespace
                namespace_logger = logging.getLogger(namespace)
                namespace_logger.addHandler(specialized_handler)
                namespace_logger.setLevel(config['level'])
                namespace_logger.propagate = config['propagate']
                
                # Guardar referencia
                self._specialized_handlers[namespace] = specialized_handler
                
                # Log de confirmación
                namespace_logger.info("=" * 80)
                namespace_logger.info(f"SPECIALIZED LOGGER INITIALIZED: {namespace}")
                namespace_logger.info(f"Log File: {specialized_file}")
                namespace_logger.info(f"Propagate to root: {config['propagate']}")
                namespace_logger.info("=" * 80)
                
            except Exception as e:
                sys.stderr.write(f"WARNING: No se pudo inicializar logger especializado '{namespace}': {e}\n")
    
    def _get_log_directory(self) -> Path:
        """Determina el directorio de logs según el sistema operativo."""
        if sys.platform == "win32":
            app_data = os.environ.get('LOCALAPPDATA') or os.environ.get('APPDATA')
            if not app_data:
                return Path.cwd() / "logs"
            return Path(app_data) / "BloomNucleus" / "logs"
        elif sys.platform == "darwin":
            return Path.home() / "Library" / "Logs" / "BloomNucleus"
        else:
            xdg_data = os.environ.get('XDG_DATA_HOME')
            if xdg_data:
                return Path(xdg_data) / "BloomNucleus" / "logs"
            return Path.home() / ".local" / "share" / "BloomNucleus" / "logs"
    
    def _log_system_info(self):
        """Registra información del sistema (Solo va al archivo de log)."""
        logger = logging.getLogger("brain.system")
        logger.info("=" * 80)
        logger.info("BRAIN SYSTEM STARTUP")
        logger.info("=" * 80)
        logger.info(f"Python: {sys.version}")
        logger.info(f"Platform: {sys.platform}")
        logger.info(f"Executable: {sys.executable}")
        logger.info(f"Frozen: {self.is_frozen}")
        logger.info(f"CWD: {os.getcwd()}")
        logger.info(f"Log Directory: {self.log_dir}")
        logger.info(f"Specialized Namespaces: {list(self.SPECIALIZED_NAMESPACES.keys())}")
        logger.info("=" * 80)
    
    def _exception_handler(self, exc_type, exc_value, exc_traceback):
        """Captura excepciones no manejadas y las guarda en el log."""
        if issubclass(exc_type, KeyboardInterrupt):
            sys.__excepthook__(exc_type, exc_value, exc_traceback)
            return
        
        logger = logging.getLogger("brain.uncaught")
        logger.critical("EXCEPCIÓN NO MANEJADA", exc_info=(exc_type, exc_value, exc_traceback))
        sys.__excepthook__(exc_type, exc_value, exc_traceback)
    
    @classmethod
    def get_logger(cls, name: str) -> logging.Logger:
        """
        Obtiene un logger para el módulo especificado.
        
        Si el nombre pertenece a un namespace especializado,
        el logger ya tendrá configurado su handler dedicado.
        """
        return logging.getLogger(name)

def setup_global_logging(verbose: bool = False, log_name: str = "brain_core"):
    """Inicializa el sistema de logging global."""
    brain_logger = BrainLogger()
    brain_logger.setup(verbose=verbose, log_name=log_name)

def get_logger(name: str) -> logging.Logger:
    """Obtiene un logger para el módulo especificado."""
    return BrainLogger.get_logger(name)