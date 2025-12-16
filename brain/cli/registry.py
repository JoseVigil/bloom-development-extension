"""
Registry central para gestión de comandos.
"""
from typing import Dict, List
from brain.cli.base import BaseCommand
from brain.cli.categories import CommandCategory


class CommandRegistry:
    """Registry central con capacidades de introspección"""
    
    def __init__(self):
        self._commands: Dict[str, BaseCommand] = {}
        self._by_category: Dict[CommandCategory, List[BaseCommand]] = {}
    
    def register(self, command: BaseCommand) -> None:
        """Registra un comando y lo indexa por categoría"""
        meta = command.metadata()
        self._commands[meta.name] = command
        
        if meta.category not in self._by_category:
            self._by_category[meta.category] = []
        self._by_category[meta.category].append(command)
    
    def get_by_category(self, category: CommandCategory) -> List[BaseCommand]:
        """Obtiene todos los comandos de una categoría"""
        return self._by_category.get(category, [])
    
    def list_all(self) -> Dict[CommandCategory, List[str]]:
        """Lista todos los comandos agrupados por categoría"""
        return {
            cat: [cmd.metadata().name for cmd in cmds]
            for cat, cmds in self._by_category.items()
        }
    
    def get_all_commands(self) -> List[BaseCommand]:
        """Retorna todos los comandos registrados"""
        return list(self._commands.values())


# Singleton global
_registry = CommandRegistry()


def get_registry() -> CommandRegistry:
    """Retorna la instancia del registry"""
    return _registry