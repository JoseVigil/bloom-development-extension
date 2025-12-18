"""
Clase base abstracta para todos los comandos (Arquitectura Headless).
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import List, Any, Optional
import typer
from brain.cli.categories import CommandCategory

# -----------------------------------------------------------------------------
# 1. DEFINICIÓN DE METADATA (Debe ir ANTES que BaseCommand)
# -----------------------------------------------------------------------------
@dataclass
class CommandMetadata:
    """Metadata de un comando"""
    name: str
    category: CommandCategory
    version: str
    description: str
    examples: List[str]


# -----------------------------------------------------------------------------
# 2. CLASE BASE CONTRATO
# -----------------------------------------------------------------------------
class BaseCommand(ABC):
    """Contrato que todos los comandos deben cumplir"""
    
    @abstractmethod
    def metadata(self) -> CommandMetadata:
        """Retorna metadata del comando"""
        pass
    
    # --- MÉTODOS DE ARQUITECTURA HEADLESS ---

    def run(self, ctx: Any, **kwargs) -> Any:
        """
        [OPCIONAL] Método para lógica pura si se desea usar el wrapper automático.
        Por compatibilidad con el template actual, los comandos implementan su
        lógica dentro de register -> execute, así que este método base
        puede quedar pass o raise NotImplemented si forzamos el patrón.
        
        Por ahora, dejamos que los comandos definan su propia función 'execute'
        dentro de 'register' como hemos venido haciendo.
        """
        pass

    def _render_human(self, data: Any):
        """Método base para renderizado (puede ser sobrescrito)"""
        typer.echo(str(data))

    @abstractmethod
    def register(self, app: typer.Typer) -> None:
        """
        Registra el comando en la aplicación Typer.
        Debe definir la función 'execute', inyectar el contexto y manejar errores.
        """
        pass