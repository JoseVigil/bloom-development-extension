"""
AI providers commands - Multi-provider API key management.

This package provides unified command-line interfaces for managing API keys
across multiple AI providers: Gemini, Claude, OpenAI, and xAI.

Auto-discovery:
    This module automatically discovers and loads all command modules from
    subdirectories (gemini/, claude/, openai/, xai/).

Structure:
    brain/commands/ai/
    ├── __init__.py (this file)
    ├── gemini/
    │   ├── __init__.py
    │   ├── gemini_keys_add.py
    │   ├── gemini_keys_list.py
    │   ├── gemini_keys_delete.py
    │   ├── gemini_keys_validate.py
    │   └── gemini_keys_stats.py
    ├── claude/
    │   ├── __init__.py
    │   ├── claude_keys_add.py
    │   ├── claude_keys_list.py
    │   ├── claude_keys_delete.py
    │   ├── claude_keys_validate.py
    │   └── claude_keys_stats.py
    ├── openai/
    │   ├── __init__.py
    │   ├── openai_keys_add.py
    │   ├── openai_keys_list.py
    │   ├── openai_keys_delete.py
    │   ├── openai_keys_validate.py
    │   └── openai_keys_stats.py
    └── xai/
        ├── __init__.py
        ├── xai_keys_add.py
        ├── xai_keys_list.py
        ├── xai_keys_delete.py
        ├── xai_keys_validate.py
        └── xai_keys_stats.py

Usage:
    brain gemini keys-add --profile "Personal" --key AIzaSy...
    brain claude keys-list
    brain openai keys-validate --profile "GPT4"
    brain xai keys-stats
"""

import os
import importlib
import inspect
from pathlib import Path
from typing import List, Type

# Lazy import to avoid circular dependencies
BaseCommand = None


def _get_base_command():
    """Lazy import of BaseCommand to avoid circular dependencies."""
    global BaseCommand
    if BaseCommand is None:
        from brain.cli.base import BaseCommand as BC
        BaseCommand = BC
    return BaseCommand


def discover_commands_in_directory(directory: Path) -> List[Type]:
    """
    Discover all command classes in a directory.
    
    Args:
        directory: Path to directory containing command modules
        
    Returns:
        List of command classes found in the directory
    """
    commands = []
    
    if not directory.exists() or not directory.is_dir():
        return commands
    
    # Get BaseCommand class
    base_cmd = _get_base_command()
    
    # Iterate through all .py files in directory
    for file_path in directory.glob("*.py"):
        # Skip __init__.py and private modules
        if file_path.name.startswith("_"):
            continue
        
        # Build module name: brain.commands.ai.{provider}.{module}
        provider_name = directory.name
        module_name = file_path.stem
        full_module_name = f"brain.commands.ai.{provider_name}.{module_name}"
        
        try:
            # Import the module
            module = importlib.import_module(full_module_name)
            
            # Find all classes in the module that inherit from BaseCommand
            for name, obj in inspect.getmembers(module, inspect.isclass):
                if (obj is not base_cmd and 
                    issubclass(obj, base_cmd) and 
                    obj.__module__ == full_module_name):
                    commands.append(obj)
                    
        except Exception as e:
            # Silently skip modules that fail to import
            # In production, you might want to log this
            pass
    
    return commands


def discover_all_commands() -> List[Type]:
    """
    Auto-discover all command classes from all AI provider subdirectories.
    
    Returns:
        List of all command classes found across all providers
    """
    all_commands = []
    
    # Get the directory where this __init__.py is located
    ai_package_dir = Path(__file__).parent
    
    # List of expected provider directories
    providers = ["gemini", "claude", "openai", "xai"]
    
    for provider in providers:
        provider_dir = ai_package_dir / provider
        if provider_dir.exists() and provider_dir.is_dir():
            commands = discover_commands_in_directory(provider_dir)
            all_commands.extend(commands)
    
    return all_commands


# Public API
__all__ = [
    "discover_commands_in_directory",
    "discover_all_commands",
]


# Optional: You can expose discovered commands as module attributes
# This allows: from brain.commands.ai import ALL_COMMANDS
def _lazy_load_commands():
    """Lazy load all commands when accessed."""
    return discover_all_commands()


# Module-level lazy loader
class _CommandLoader:
    """Lazy loader for AI commands."""
    
    _commands = None
    
    @property
    def ALL_COMMANDS(self):
        """Get all discovered commands (lazy loaded)."""
        if self._commands is None:
            self._commands = discover_all_commands()
        return self._commands
    
    def reload(self):
        """Force reload of all commands."""
        self._commands = None
        return self.ALL_COMMANDS


# Create singleton instance
_loader = _CommandLoader()

# Expose as module attribute
def __getattr__(name):
    """
    Dynamic attribute access for lazy loading.
    
    Usage:
        from brain.commands.ai import ALL_COMMANDS
    """
    if name == "ALL_COMMANDS":
        return _loader.ALL_COMMANDS
    raise AttributeError(f"module '{__name__}' has no attribute '{name}'")