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
        Maneja la salida inteligente: JSON puro para máquinas o Renderizado para humanos.
        
        CRÍTICO para integraciones (Electron, VS Code):
        - En modo JSON: escribe SOLO JSON puro a stdout, sin texto adicional
        - En modo normal: usa el renderizador custom para output humano
        """
        if self.json_mode:
            # Salida estricta para máquinas (Electron, VS Code, etc)
            # Escribir directamente a stdout para evitar contaminación
            sys.stdout.write(json.dumps(data, default=str))
            sys.stdout.write('\n')
            sys.stdout.flush()  # Forzar flush inmediato para evitar buffering
        else:
            # Salida para humanos
            if render_func:
                render_func(data)
            else:
                # Fallback si no hay renderizador específico
                typer.echo(str(data))