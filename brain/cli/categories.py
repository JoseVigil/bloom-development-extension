"""
Command categories with descriptions for auto-generated help.
"""
from enum import Enum


class CommandCategory(Enum):
    """
    Command categories for organizing CLI.
    Each category includes its description for help generation.
    """
    FILESYSTEM = ("filesystem", "File operations and directory analysis")
    PROJECT = ("project", "Project lifecycle and scaffolding")
    CONTEXT = ("context", "AI context generation and management")
    GITHUB = ("github", "GitHub integration and repository management")
    INTENT = ("intent", "Intent execution system")
    AI = ("ai", "AI-powered features")
    
    def __init__(self, value: str, description: str):
        self._value_ = value
        self.description = description