"""
Auto-discovery de comandos.
Escanea todos los subdirectorios buscando clases que heredan de BaseCommand.
"""
from pathlib import Path
from importlib import import_module
import inspect
from brain.cli.registry import get_registry
from brain.cli.base import BaseCommand


def discover_commands():
    """
    Escanea brain/commands/* buscando clases que heredan de BaseCommand.
    Indexa automáticamente por dominio/categoría.
    """
    registry = get_registry()
    commands_dir = Path(__file__).parent
    
    # Escanear solo subdirectorios (dominios)
    for domain_dir in commands_dir.iterdir():
        if not domain_dir.is_dir() or domain_dir.name.startswith('__'):
            continue
        
        # Escanear archivos .py en cada dominio
        for py_file in domain_dir.glob("*.py"):
            if py_file.stem.startswith('_'):
                continue
            
            # Importar módulo
            module_path = f"brain.commands.{domain_dir.name}.{py_file.stem}"
            try:
                module = import_module(module_path)
                
                # Buscar clases que heredan de BaseCommand
                for name, obj in inspect.getmembers(module, inspect.isclass):
                    if issubclass(obj, BaseCommand) and obj is not BaseCommand:
                        instance = obj()
                        registry.register(instance)
            except Exception as e:
                import traceback
                print(f"[ERROR] Error loading {module_path}:")
                traceback.print_exc()
    
    return registry