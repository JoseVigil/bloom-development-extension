from dataclasses import dataclass
from typing import Any, Callable, Optional
import typer
import json
import sys

@dataclass
class GlobalContext:
    """Contexto global que viaja a través de los comandos"""
    verbose: bool = False
    json_mode: bool = False
    root_path: str = "."

    def output(self, data: Any, render_func: Optional[Callable[[Any], None]] = None):
        """
        Maneja la salida inteligente: JSON puro para VS Code o Renderizado para humanos.
        """
        if self.json_mode:
            # Salida estricta para máquinas (VS Code parsea esto)
            # Usamos sys.stdout directamente para asegurar limpieza
            print(json.dumps(data, default=str))
        else:
            # Salida para humanos
            if render_func:
                render_func(data)
            else:
                # Fallback si no hay renderizador específico
                typer.echo(str(data))