"""
GlobalContext - contexto compartido entre comandos de AITap.
Mirror simplificado de brain.shared.context.GlobalContext.
"""
from dataclasses import dataclass


@dataclass
class GlobalContext:
    json_mode: bool = False
    verbose: bool = False
