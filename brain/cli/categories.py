"""
Command categories for Brain CLI.
Each category groups related commands together.
"""

from enum import Enum
from typing import Tuple


class CommandCategory(Enum):
    """
    Available command categories in Brain CLI.
    Each category has a name and description.
    """
    
    # Core system categories
    CONTEXT = ("context", "AI context generation and management")
    FILESYSTEM = ("filesystem", "File operations and directory analysis")
    GEMINI = ("gemini", "Gemini AI key management and operations")
    GITHUB = ("github", "GitHub integration and repository management")
    INTENT = ("intent", "Intent execution system and context planning")
    NUCLEUS = ("nucleus", "Nucleus project management and lifecycle")
    PROFILE = ("profile", "Chrome profile and AI account management")
    PROJECT = ("project", "Project lifecycle and scaffolding")
    HEALTH = ("health", "System health checks and diagnostics")
    EXTENSION = ("extension", "Chrome extension lifecycle management")
    
    # ✅ NEW: Service daemon category
    SERVICE = ("service", "Background connection multiplexer and task runner")

    def __init__(self, name: str, description: str):
        self.category_name = name
        self.category_description = description
    
    @property
    def name(self) -> str:
        """Get category name"""
        return self.category_name
    
    @property
    def description(self) -> str:
        """Get category description"""
        return self.category_description
    
    @classmethod
    def get_all_categories(cls) -> list:
        """Get all available categories"""
        return [cat for cat in cls]
    
    @classmethod
    def get_category_by_name(cls, name: str):
        """Get category by name"""
        for cat in cls:
            if cat.category_name == name:
                return cat
        return None
    
    @classmethod
    def get_category_count(cls) -> int:
        """Get total number of categories"""
        return len(cls.get_all_categories())


# Category aliases for backward compatibility
CONTEXT = CommandCategory.CONTEXT
FILESYSTEM = CommandCategory.FILESYSTEM
GEMINI = CommandCategory.GEMINI
GITHUB = CommandCategory.GITHUB
INTENT = CommandCategory.INTENT
NUCLEUS = CommandCategory.NUCLEUS
PROFILE = CommandCategory.PROFILE
PROJECT = CommandCategory.PROJECT
HEALTH = CommandCategory.HEALTH  
EXTENSION = CommandCategory.EXTENSION
SERVICE = CommandCategory.SERVICE  