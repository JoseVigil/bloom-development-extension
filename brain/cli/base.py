"""
Base classes for Brain CLI commands with auto-discovery support.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional, List
import typer
from brain.cli.categories import CommandCategory


@dataclass
class CommandMetadata:
    """Metadata for command auto-discovery and help generation."""
    name: str
    category: CommandCategory
    description: str
    is_root: bool = False
    aliases: List[str] = None
    
    def __post_init__(self):
        if self.aliases is None:
            self.aliases = []


class BaseCommand(ABC):
    """Base class for all Brain commands."""
    
    @abstractmethod
    def metadata(self) -> CommandMetadata:
        """Return command metadata for auto-discovery."""
        pass
    
    @abstractmethod
    def register(self, app: typer.Typer):
        """Register command with Typer app."""
        pass