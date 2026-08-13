"""
Clases base para comandos de AITap CLI, con soporte de auto-discovery.
Mismo contrato que brain/cli/base.py (CommandMetadata + BaseCommand) para que
el help_renderer y el registry se comporten igual que en el resto del ecosistema.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import List

import typer

from aitap.cli.categories import CommandCategory


@dataclass
class CommandMetadata:
    """Metadata para auto-discovery y generacion de help."""
    name: str
    category: CommandCategory
    description: str
    version: str = "0.1.0"
    is_root: bool = False
    requires_vault: bool = False  # True si el comando toca Nucleus Vault (aunque sea solo referencias, nunca secretos)
    aliases: List[str] = field(default_factory=list)
    examples: List[str] = field(default_factory=list)


class BaseCommand(ABC):
    """Clase base para todos los comandos de AITap."""

    @abstractmethod
    def metadata(self) -> CommandMetadata:
        """Retorna la metadata del comando para auto-discovery y help."""
        ...

    @abstractmethod
    def register(self, app: typer.Typer):
        """Registra el comando en la sub-app de Typer de su categoria."""
        ...
