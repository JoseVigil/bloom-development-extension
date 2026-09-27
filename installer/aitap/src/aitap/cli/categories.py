"""
Categorias de comandos para AITap CLI.
Cada categoria agrupa comandos relacionados. Mismo patron que brain/cli/categories.py.

Set cerrado (Enmienda 1 y taxonomia "Alternativa B", aprobadas por José el
2026-09-26): SYSTEM, KEYS, ROUTE, HEALTH, ACCOUNTING, LOCAL. Ninguna categoria
de ejecucion (EXECUTE, BASH, APPLY, RUN o similares) pertenece a AITAP.
"""

from enum import Enum


class CommandCategory(Enum):
    """Categorias disponibles en AITap CLI."""

    SYSTEM = ("system", "Introspeccion estatica de AITAP: version, build y recursos cargados")
    KEYS = ("keys", "Referencias de credenciales (credential_ref -> key_id); nunca el secreto real")
    ROUTE = ("route", "Grifo: decision de routing, Intelligence Supply y politica de acceso y cuotas")
    HEALTH = ("health", "Sondeo vivo de las dependencias de AITAP")
    ACCOUNTING = ("accounting", "Lectura de la Contabilidad de inferencias por modelo, consumidor y ventana")
    LOCAL = ("local", "Suministro de inteligencia local: verificacion previa y estado de modelos locales")

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
