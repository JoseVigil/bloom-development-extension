"""
brain.core.project - Core logic for project linking and management.

Este package contiene la lógica pura de negocio para gestión de proyectos,
sin dependencias de CLI/Typer.
"""

from brain.core.project.models import LinkedProject
from brain.core.project.linker import ProjectLinker

__all__ = [
    'LinkedProject',
    'ProjectLinker',
]