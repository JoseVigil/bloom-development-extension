"""
Brain Global Logger - Sistema de logging centralizado y robusto.
Configuración: Disco (DEBUG/Todo) | Consola (ERROR/Silencioso).
Soporta namespaces especializados con archivos dedicados.
REFACTORED: Soporte para json_mode (fuerza stderr en console handler).
TELEMETRY: Reporta automáticamente todos los archivos de log a telemetry.json.
"""
import logging
import os
import sys
import json
import traceback
import time
from pathlib import Path
from logging.handlers import RotatingFileHandler
from datetime import datetime
from typing import Optional, Dict

class BrainLogger:
    """Singleton para gestionar el logging global de Brain."""
    
    _instance: Optional['BrainLogger'] = None
    _initialized: bool = False
    _specialized_handlers: Dict[str, RotatingFileHandler] = {}
    _telemetry_registered: Dict[str, bool] = {}  # Track registered streams
    
    # Configuración de namespaces especializados
    SPECIALIZED_NAMESPACES = {
        'brain.profile': {
            'file_prefix': 'brain_profile',
            'level': logging.DEBUG,
            'propagate': True,  # También va a brain_core.log
            'label': '🚀 BRAIN PROFILE',
        }
        # Puedes agregar más aquí en el futuro:
        # 'brain.worker': {'file_prefix': 'brain_worker', 'label': '⚙️ WORKER', ...},
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
        self.telemetry_path: Optional[Path] = None
        self.is_frozen = getattr(sys, 'frozen', False)
        
    def setup(self, verbose: bool = False, log_name: str = "brain_core", json_mode: bool = False):
        """
        Inicializa el sistema de logging global.
        
        Configuración de Niveles:
        - Archivo: DEBUG (Captura cada detalle técnico)
        - Consola: ERROR (Silencio total para el usuario, salvo fallos o --verbose)
        
        Args:
            verbose: Habilitar logging detallado en consola
            log_name: Nombre base del archivo de log
            json_mode: Si True, desactiva completamente el console handler
        """
        if BrainLogger._initialized:
            return
        
        try:
            # 1. Determinar directorio de logs
            self.log_dir = self._get_log_directory()
            self.log_dir.mkdir(parents=True, exist_ok=True)
            
            # Determinar ruta de telemetría
            self.telemetry_path = self.log_dir / "telemetry.json"
            
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
            
            # 4. Configurar Logger Raíz
            root = logging.getLogger()
            root.setLevel(logging.DEBUG)
            root.handlers.clear()
            root.addHandler(file_handler)
            
            # 5. Handler para CONSOLA (INTERFAZ LIMPIA)
            # CRÍTICO: En modo JSON, NO agregar console handler para evitar contaminación
            if not json_mode:
                # CRÍTICO: Console handler SIEMPRE escribe a stderr (nunca stdout)
                console_handler = logging.StreamHandler(sys.stderr)
                
                if verbose:
                    console_handler.setLevel(logging.DEBUG)
                    console_format = logging.Formatter('%(levelname)-8s | %(name)-20s | %(message)s')
                else:
                    console_handler.setLevel(logging.ERROR)
                    console_format = logging.Formatter('%(levelname)-8s | %(message)s')
                
                console_handler.setFormatter(console_format)
                root.addHandler(console_handler)
            
            # 6. Registrar archivo principal en telemetría
            self._register_telemetry_stream(
                stream_id="brain_core",
                label="🧠 BRAIN CORE",
                log_path=self.log_file,
                priority=2
            )
            
            # 7. Configurar namespaces especializados
            self._setup_specialized_namespaces(timestamp, log_format)
            
            # 8. Capturar excepciones no manejadas
            sys.excepthook = self._exception_handler
            
            # 9. Registrar inicio
            BrainLogger._initialized = True
            self._log_system_info(json_mode)
            
            if not json_mode:
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
        - Registro automático en telemetría
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
                
                # Registrar en telemetría
                stream_id = file_prefix
                label = config.get('label', namespace.upper())
                self._register_telemetry_stream(
                    stream_id=stream_id,
                    label=label,
                    log_path=specialized_file,
                    priority=2
                )
                
                # Log de confirmación (solo va al archivo, no contamina consola)
                namespace_logger.info("=" * 80)
                namespace_logger.info(f"SPECIALIZED LOGGER INITIALIZED: {namespace}")
                namespace_logger.info(f"Log File: {specialized_file}")
                namespace_logger.info(f"Propagate to root: {config['propagate']}")
                namespace_logger.info(f"Telemetry registered: {stream_id}")
                namespace_logger.info("=" * 80)
                
            except Exception as e:
                sys.stderr.write(f"WARNING: No se pudo inicializar logger especializado '{namespace}': {e}\n")
    
    def _register_telemetry_stream(self, stream_id: str, label: str, log_path: Path, priority: int = 2):
        """
        Registra un stream de log en el archivo de telemetría.
        
        Args:
            stream_id: ID único del stream (ej: "brain_core", "brain_profile")
            label: Etiqueta visible (ej: "🧠 BRAIN CORE")
            log_path: Ruta absoluta al archivo de log
            priority: Prioridad de visualización (1=alta, 2=media, 3=baja)
        """
        max_retries = 5
        retry_delay = 0.05  # 50ms
        
        for attempt in range(max_retries):
            try:
                # 1. Leer telemetría actual (o inicializar)
                if self.telemetry_path.exists():
                    with open(self.telemetry_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                else:
                    data = {"active_streams": {}}
                
                # Asegurar estructura
                if "active_streams" not in data:
                    data["active_streams"] = {}
                
                # 2. Actualizar/agregar entrada
                data["active_streams"][stream_id] = {
                    "label": label,
                    "path": str(log_path).replace("\\", "/"),
                    "priority": priority,
                    "last_update": datetime.now().isoformat()
                }
                
                # 3. Escribir atómicamente
                with open(self.telemetry_path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
                
                # Marcar como registrado
                self._telemetry_registered[stream_id] = True
                return
                
            except (IOError, PermissionError) as e:
                # Archivo bloqueado, reintentar
                if attempt < max_retries - 1:
                    time.sleep(retry_delay * (attempt + 1))  # Backoff exponencial
                else:
                    sys.stderr.write(f"WARNING: No se pudo registrar telemetría para '{stream_id}' después de {max_retries} intentos: {e}\n")
            except Exception as e:
                sys.stderr.write(f"ERROR: Fallo inesperado al registrar telemetría para '{stream_id}': {e}\n")
                break
    
    def cleanup_telemetry(self, stream_id: str = None):
        """
        Elimina una entrada de telemetría (cleanup al cerrar).
        
        Args:
            stream_id: ID del stream a eliminar. Si es None, elimina todas las entradas de Brain.
        """
        if not self.telemetry_path or not self.telemetry_path.exists():
            return
        
        max_retries = 3
        retry_delay = 0.05
        
        for attempt in range(max_retries):
            try:
                with open(self.telemetry_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                
                if "active_streams" not in data:
                    return
                
                # Eliminar stream específico o todos los de Brain
                if stream_id:
                    data["active_streams"].pop(stream_id, None)
                else:
                    # Eliminar todos los streams registrados por esta instancia
                    for sid in list(self._telemetry_registered.keys()):
                        data["active_streams"].pop(sid, None)
                
                with open(self.telemetry_path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
                
                return
                
            except (IOError, PermissionError):
                if attempt < max_retries - 1:
                    time.sleep(retry_delay * (attempt + 1))
            except Exception as e:
                sys.stderr.write(f"ERROR al limpiar telemetría: {e}\n")
                break
    
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
    
    def _log_system_info(self, json_mode: bool = False):
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
        logger.info(f"Telemetry Path: {self.telemetry_path}")
        logger.info(f"JSON Mode: {json_mode}")
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

def setup_global_logging(verbose: bool = False, log_name: str = "brain_core", json_mode: bool = False):
    """Inicializa el sistema de logging global."""
    brain_logger = BrainLogger()
    brain_logger.setup(verbose=verbose, log_name=log_name, json_mode=json_mode)

def get_logger(name: str) -> logging.Logger:
    """Obtiene un logger para el módulo especificado."""
    return BrainLogger.get_logger(name)

def cleanup_logging():
    """Limpia las entradas de telemetría al cerrar la aplicación."""
    if BrainLogger._instance:
        BrainLogger._instance.cleanup_telemetry()