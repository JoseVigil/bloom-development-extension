"""
Profile Logger - Extensión simple del logger global.
Agrega un FileHandler dedicado para brain.profile.* loggers.
"""
import logging
from pathlib import Path
from logging.handlers import RotatingFileHandler
from datetime import datetime


def setup_profile_logger():
    """
    Agrega un FileHandler dedicado al namespace 'brain.profile'.
    Se ejecuta UNA VEZ al importar el módulo.
    """
    # Obtener el logger de profiles
    profile_logger = logging.getLogger('brain.profile')
    
    # Si ya tiene handlers dedicados, no duplicar
    if any(isinstance(h, RotatingFileHandler) for h in profile_logger.handlers):
        return
    
    # Importar la función de directorio del logger global
    from brain.shared.logger import BrainLogger
    brain_instance = BrainLogger()
    
    # Si no está inicializado, usar directorio por defecto
    if brain_instance.log_dir:
        log_dir = brain_instance.log_dir
    else:
        log_dir = brain_instance._get_log_directory()
        log_dir.mkdir(parents=True, exist_ok=True)
    
    # Crear archivo específico para profiles
    timestamp = datetime.now().strftime("%Y%m%d")
    profile_log_file = log_dir / f"brain_profile_{timestamp}.log"
    
    # Formato igual que el logger global
    log_format = logging.Formatter(
        '%(asctime)s | %(levelname)-8s | %(name)-30s | %(funcName)-20s | %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    
    # Handler dedicado para profiles
    profile_handler = RotatingFileHandler(
        profile_log_file,
        maxBytes=20*1024*1024,  # 20MB
        backupCount=10,
        encoding='utf-8'
    )
    profile_handler.setLevel(logging.DEBUG)
    profile_handler.setFormatter(log_format)
    
    # Agregar handler SIN desactivar propagación
    # Así los logs van TANTO a brain_profile.log COMO a brain_core.log
    profile_logger.addHandler(profile_handler)
    profile_logger.setLevel(logging.DEBUG)


# Inicializar automáticamente al importar
setup_profile_logger()


def get_profile_logger(name: str) -> logging.Logger:
    """
    Obtiene un logger para el namespace brain.profile.
    
    Args:
        name: Nombre del logger (ej: 'brain.profile.manager')
    
    Returns:
        Logger configurado
    """
    return logging.getLogger(name)