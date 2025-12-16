"""
Clase base abstracta para todos los comandos.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import List
import typer
from brain.cli.categories import CommandCategory


@dataclass
class CommandMetadata:
    """Metadata de un comando"""
    name: str
    category: CommandCategory
    version: str
    description: str
    examples: List[str]


class BaseCommand(ABC):
    """Contrato que todos los comandos deben cumplir"""
    
    @abstractmethod
    def metadata(self) -> CommandMetadata:
        """Retorna metadata del comando"""
        pass
    
    @abstractmethod
    def register(self, app: typer.Typer) -> None:
        """Registra el comando en la aplicación Typer"""
        pass