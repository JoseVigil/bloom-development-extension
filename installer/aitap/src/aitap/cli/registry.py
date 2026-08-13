"""
Registry central para gestion de comandos de AITap.
Identico en forma a brain/cli/registry.py.
"""
from typing import Dict, List

from aitap.cli.base import BaseCommand
from aitap.cli.categories import CommandCategory


class CommandRegistry:
    """Registry central con capacidades de introspeccion."""

    def __init__(self):
        self._commands: Dict[str, BaseCommand] = {}
        self._by_category: Dict[CommandCategory, List[BaseCommand]] = {}

    def register(self, command: BaseCommand) -> None:
        """Registra un comando y lo indexa por categoria."""
        meta = command.metadata()
        unique_key = f"{meta.category.value}.{meta.name}"
        self._commands[unique_key] = command

        if meta.category not in self._by_category:
            self._by_category[meta.category] = []
        self._by_category[meta.category].append(command)

    def get_by_category(self, category: CommandCategory) -> List[BaseCommand]:
        return self._by_category.get(category, [])

    def list_all(self) -> Dict[CommandCategory, List[str]]:
        return {
            cat: [cmd.metadata().name for cmd in cmds]
            for cat, cmds in self._by_category.items()
        }

    def get_all_commands(self) -> List[BaseCommand]:
        return list(self._commands.values())


_registry = CommandRegistry()


def get_registry() -> CommandRegistry:
    return _registry
