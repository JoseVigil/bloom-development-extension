# brain/core/profile/__init__.py
"""
Core profile management package.
Imports are done explicitly in consuming modules to avoid circular dependencies.
"""

__all__ = ['ProfileManager']

# NO importar aquí - dejar que los módulos consumidores lo hagan explícitamente
# Esto evita problemas de inicialización en PyInstaller
