"""
Brain CLI - Build Multiplatform Shared Utilities
=================================================
Módulo compartido con utilidades para builds multiplataforma.
"""

from .platform_detector import PlatformInfo, get_platform_info, PLATFORM
from .telemetry_helper import register_telemetry

__all__ = [
    'PlatformInfo',
    'get_platform_info',
    'PLATFORM',
    'register_telemetry',
]