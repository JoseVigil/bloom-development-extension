"""
Context Module - Sistema de detección de tecnologías y generación de documentación.

NOTA: "Context" se refiere a "contexto tecnológico" del proyecto,
no a "contexto de sesión" (ese está en brain/shared/context.py).

Componentes principales:
- detector.py: Detecta tecnologías en el proyecto
- manager.py: Orquesta generación de documentación
- strategy_base.py: Interface para estrategias
- strategy_loader.py: Carga dinámica de estrategias
- strategies/: Implementaciones específicas por tecnología
"""

from .strategy_base import ProjectStrategy

__all__ = ['ProjectStrategy']
