"""
Categorias de comandos para AITap CLI.
Cada categoria agrupa comandos relacionados. Mismo patron que brain/cli/categories.py.
"""

from enum import Enum


class CommandCategory(Enum):
    """Categorias disponibles en AITap CLI."""

    SYSTEM = ("system", "Version, status e introspeccion del servicio AITap")
    KEYS = ("keys", "Referencias a credenciales por proveedor (Gemini, Claude, OpenAI, xAI) - nunca el secreto real")
    ROUTE = ("route", "Politica de ruteo entre proveedores y estado del circuit breaker")
    HEALTH = ("health", "Chequeos de salud de AITap y de su conexion con Nucleus Vault")

    def __init__(self, name: str, description: str):
        self.category_name = name
        self.category_description = description

    @property
    def name(self) -> str:
        return self.category_name

    @property
    def description(self) -> str:
        return self.category_description

    @classmethod
    def get_all_categories(cls) -> list:
        return [cat for cat in cls]

    @classmethod
    def get_category_by_name(cls, name: str):
        for cat in cls:
            if cat.category_name == name:
                return cat
        return None

    @classmethod
    def get_category_count(cls) -> int:
        return len(cls.get_all_categories())
