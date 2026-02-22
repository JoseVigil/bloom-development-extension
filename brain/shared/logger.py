"""
Brain Global Logger - Sistema de logging centralizado y robusto.
Configuración: Disco (DEBUG/Todo) | Consola (ERROR/Silencioso).
Soporta namespaces especializados con archivos dedicados.
REFACTORED: Soporte para json_mode (fuerza stderr en console handler).
TELEMETRY: Reporta automáticamente todos los archivos de log a telemetry.json
           via nucleus telemetry register (single-writer pattern).
"""
import logging
import os
import sys
import subprocess
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
            'propagate': True,
            'label': '🚀 BRAIN PROFILE',
            'category': 'brain',
            'description': 'Brain profile management log — tracks profile load, save and sync operations',
        },
        'brain.server': {
            'file_prefix': 'brain_server',
            'level': logging.DEBUG,
            'propagate': True,
            'label': '🖥️ BRAIN SERVER',
            'category': 'brain',
            'description': 'Brain HTTP server log — captures incoming requests, responses and connection lifecycle',
        },
        'brain.server.manager': {
            'file_prefix': 'brain_server_manager',
            'level': logging.DEBUG,
            'propagate': True,
            'label': '🎛️ SERVER MANAGER',
            'category': 'brain',
            'description': 'Brain server manager log — tracks server instance lifecycle and configuration changes',
        },
        'brain.server.event_bus': {
            'file_prefix': 'brain_server_event_bus',
            'level': logging.DEBUG,
            'propagate': True,
            'label': '📡 EVENT BUS',
            'category': 'brain',
            'description': 'Brain event bus log — captures event routing and subscription activity',
        },
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

    def setup(self, verbose: bool = False, log_name: str = "brain_core", json_mode: bool = False):
        """
        Inicializa el sistema de logging global.

        Configuración de Niveles:
        - Archivo: DEBUG (Captura cada detalle técnico)
        - Consola: ERROR (Silencio total para el usuario, salvo fallos o --verbose)

        Args:
            verbose:   Habilitar logging detallado en consola
            log_name:  Nombre base del archivo de log
            json_mode: Si True, desactiva completamente el console handler
        """
        if BrainLogger._initialized:
            return

        try:
            # 1. Determinar directorio de logs
            self.log_dir = self._get_log_directory()
            self.log_dir.mkdir(parents=True, exist_ok=True)

            # Archivo por día en subcarpeta según log_name
            timestamp = datetime.now().strftime("%Y%m%d")

            # Extraer categoría (ej: "brain_core" → "core")
            category = log_name.replace("brain_", "") if log_name.startswith("brain_") else "general"
            category_dir = self.log_dir / category
            category_dir.mkdir(parents=True, exist_ok=True)

            self.log_file = category_dir / f"{log_name}_{timestamp}.log"

            # 2. Formato detallado para archivo
            log_format = logging.Formatter(
                '%(asctime)s | %(levelname)-8s | %(name)-30s | %(funcName)-20s | %(message)s',
                datefmt='%Y-%m-%d %H:%M:%S'
            )

            # 3. Handler ARCHIVO (caja negra — todo)
            file_handler = RotatingFileHandler(
                self.log_file,
                maxBytes=10 * 1024 * 1024,  # 10 MB
                backupCount=5,
                encoding='utf-8'
            )
            file_handler.setLevel(logging.DEBUG)
            file_handler.setFormatter(log_format)

            # 4. Logger raíz
            root = logging.getLogger()
            root.setLevel(logging.DEBUG)
            root.handlers.clear()
            root.addHandler(file_handler)

            # 5. Handler CONSOLA (interfaz limpia)
            # En modo JSON nunca agregamos console handler
            if not json_mode:
                console_handler = logging.StreamHandler(sys.stderr)
                if verbose:
                    console_handler.setLevel(logging.DEBUG)
                    console_format = logging.Formatter('%(levelname)-8s | %(name)-20s | %(message)s')
                else:
                    console_handler.setLevel(logging.ERROR)
                    console_format = logging.Formatter('%(levelname)-8s | %(message)s')
                console_handler.setFormatter(console_format)
                root.addHandler(console_handler)

            # 6. Registrar stream principal en telemetría
            self._register_telemetry_stream(
                stream_id="brain_core",
                label="🧠 BRAIN CORE",
                log_path=self.log_file,
                priority=2,
                category="brain",
                description="Runtime log of the Brain core module — captures initialization, state transitions and errors",
            )

            # 7. Configurar namespaces especializados
            self._setup_specialized_namespaces(timestamp, log_format)

            # 8. Capturar excepciones no manejadas
            sys.excepthook = self._exception_handler

            # 9. Marcar como inicializado
            BrainLogger._initialized = True
            self._log_system_info(json_mode)

            if not json_mode:
                logging.debug(f"Logger inicializado. Terminal Level: {'DEBUG' if verbose else 'ERROR'}")

        except Exception as e:
            sys.stderr.write(f"❌ ERROR CRÍTICO: No se pudo inicializar el logger: {e}\n")
            traceback.print_exc()

    def _setup_specialized_namespaces(self, timestamp: str, log_format: logging.Formatter):
        """
        Configura handlers dedicados para cada namespace en SPECIALIZED_NAMESPACES.
        Cada uno obtiene su propio archivo, nivel, propagación y registro en telemetría.
        """
        for namespace, config in self.SPECIALIZED_NAMESPACES.items():
            try:
                file_prefix = config['file_prefix']
                parts = namespace.split('.')
                category = parts[1] if len(parts) > 1 else 'general'
                category_dir = self.log_dir / category
                category_dir.mkdir(parents=True, exist_ok=True)

                specialized_file = category_dir / f"{file_prefix}_{timestamp}.log"

                specialized_handler = RotatingFileHandler(
                    str(specialized_file),
                    maxBytes=20 * 1024 * 1024,  # 20 MB
                    backupCount=10,
                    encoding='utf-8'
                )
                specialized_handler.setLevel(config['level'])
                specialized_handler.setFormatter(log_format)

                namespace_logger = logging.getLogger(namespace)
                namespace_logger.addHandler(specialized_handler)
                namespace_logger.setLevel(config['level'])
                namespace_logger.propagate = config['propagate']

                self._specialized_handlers[namespace] = specialized_handler

                self._register_telemetry_stream(
                    stream_id=file_prefix,
                    label=config.get('label', namespace.upper()),
                    log_path=specialized_file,
                    priority=2,
                    category=config['category'],
                    description=config['description'],
                )

                namespace_logger.info("=" * 80)
                namespace_logger.info(f"SPECIALIZED LOGGER INITIALIZED: {namespace}")
                namespace_logger.info(f"Log File: {specialized_file}")
                namespace_logger.info(f"Propagate to root: {config['propagate']}")
                namespace_logger.info(f"Telemetry registered: {file_prefix}")
                namespace_logger.info("=" * 80)

            except Exception as e:
                sys.stderr.write(
                    f"WARNING: No se pudo inicializar logger especializado '{namespace}': {e}\n"
                )

    def _register_telemetry_stream(
        self,
        stream_id: str,
        label: str,
        log_path: Path,
        priority: int,
        category: str,
        description: str,
    ):
        """
        Registra un stream en telemetry.json via nucleus CLI.
        Nucleus es el único escritor de telemetry.json (single-writer pattern).

        Args:
            stream_id:   ID único del stream (ej: "brain_core")
            label:       Etiqueta visible (ej: "🧠 BRAIN CORE")
            log_path:    Ruta absoluta al archivo de log
            priority:    1=alta, 2=media, 3=baja
            category:    Subsistema (ej: "brain")
            description: Quién escribe el log y qué captura
        """
        try:
            from brain.shared.paths import Paths
            nucleus_exe = Paths().nucleus_exe

            cmd = [
                str(nucleus_exe),
                "telemetry", "register",
                "--stream",      stream_id,
                "--label",       label,
                "--path",        str(log_path).replace("\\", "/"),
                "--priority",    str(priority),
                "--category",    category,
                "--description", description,
            ]

            result = subprocess.run(cmd, capture_output=True, text=True, timeout=5)

            if result.returncode != 0:
                sys.stderr.write(
                    f"WARNING: nucleus telemetry register falló para '{stream_id}' "
                    f"(exit {result.returncode}): {result.stderr.strip()}\n"
                )

        except subprocess.TimeoutExpired:
            sys.stderr.write(
                f"WARNING: nucleus telemetry register timeout para '{stream_id}'\n"
            )
        except FileNotFoundError:
            sys.stderr.write(
                f"WARNING: nucleus.exe no encontrado, telemetría no registrada para '{stream_id}'\n"
            )
        except Exception as e:
            sys.stderr.write(
                f"WARNING: Error al registrar telemetría para '{stream_id}': {e}\n"
            )

    def cleanup_telemetry(self, stream_id: str = None):
        """
        No-op: nucleus CLI no expone comando de unregister.
        Se mantiene por compatibilidad con código existente.
        """
        pass

    def _get_log_directory(self) -> Path:
        """Determina el directorio de logs usando Paths singleton."""
        try:
            from brain.shared.paths import Paths
            return Paths().brain_logs_dir
        except Exception:
            # Fallback manual si Paths no está disponible aún durante el boot
            if sys.platform == "win32":
                app_data = os.environ.get('LOCALAPPDATA') or os.environ.get('APPDATA')
                if app_data:
                    return Path(app_data) / "BloomNucleus" / "logs" / "brain"
            elif sys.platform == "darwin":
                return Path.home() / "Library" / "Logs" / "BloomNucleus" / "brain"
            else:
                xdg = os.environ.get('XDG_DATA_HOME')
                if xdg:
                    return Path(xdg) / "BloomNucleus" / "logs" / "brain"
                return Path.home() / ".local" / "share" / "BloomNucleus" / "logs" / "brain"

    def _log_system_info(self, json_mode: bool = False):
        """Registra información del sistema (solo va al archivo)."""
        lg = logging.getLogger("brain.system")
        lg.info("=" * 80)
        lg.info("BRAIN SYSTEM STARTUP")
        lg.info("=" * 80)
        lg.info(f"Python: {sys.version}")
        lg.info(f"Platform: {sys.platform}")
        lg.info(f"Executable: {sys.executable}")
        lg.info(f"Frozen: {self.is_frozen}")
        lg.info(f"CWD: {os.getcwd()}")
        lg.info(f"Log Directory: {self.log_dir}")
        lg.info(f"JSON Mode: {json_mode}")
        lg.info(f"Specialized Namespaces: {list(self.SPECIALIZED_NAMESPACES.keys())}")
        lg.info("=" * 80)

    def _exception_handler(self, exc_type, exc_value, exc_traceback):
        """Captura excepciones no manejadas y las guarda en el log."""
        if issubclass(exc_type, KeyboardInterrupt):
            sys.__excepthook__(exc_type, exc_value, exc_traceback)
            return
        lg = logging.getLogger("brain.uncaught")
        lg.critical("EXCEPCIÓN NO MANEJADA", exc_info=(exc_type, exc_value, exc_traceback))
        sys.__excepthook__(exc_type, exc_value, exc_traceback)

    @classmethod
    def get_logger(cls, name: str) -> logging.Logger:
        """Obtiene un logger para el módulo especificado."""
        return logging.getLogger(name)


def setup_global_logging(verbose: bool = False, log_name: str = "brain_core", json_mode: bool = False):
    """Inicializa el sistema de logging global."""
    BrainLogger().setup(verbose=verbose, log_name=log_name, json_mode=json_mode)


def get_logger(name: str) -> logging.Logger:
    """Obtiene un logger para el módulo especificado."""
    return BrainLogger.get_logger(name)


def cleanup_logging():
    """Limpia las entradas de telemetría al cerrar la aplicación."""
    if BrainLogger._instance:
        BrainLogger._instance.cleanup_telemetry()