"""
Categorías de comandos del sistema Brain.
"""
from enum import Enum


class CommandCategory(Enum):
    """Categorías para organizar comandos"""
    FILESYSTEM = "filesystem"
    PROJECT = "project"
    CONTEXT = "context"
    INTENT = "intent"
    AI = "ai"