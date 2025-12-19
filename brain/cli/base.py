"""
Base classes for Brain CLI commands with auto-discovery support.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional, List
import typer
from brain.cli.categories import CommandCategory


@dataclass
class CommandMetadata:
    """Metadata for command auto-discovery and help generation."""
    name: str
    category: CommandCategory
    description: str
    version: str = "1.0.0"
    is_root: bool = False
    aliases: List[str] = field(default_factory=list)
    examples: List[str] = field(default_factory=list)


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