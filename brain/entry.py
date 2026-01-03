"""
NUEVO: Wrapper opcional para ejecución directa de Brain CLI.

Este módulo provee un entry point alternativo que puede ser usado
en scripts o llamadas directas sin necesidad de usar -m.

Uso:
    from brain.entry import run_cli
    run_cli(['health', 'onboarding-check', '--json'])
"""

import sys
from typing import List, Optional
from brain.__main__ import main


def run_cli(args: Optional[List[str]] = None):
    """
    Ejecuta Brain CLI con argumentos personalizados.
    
    Args:
        args: Lista de argumentos (ej: ['health', 'check', '--json']).
              Si es None, usa sys.argv[1:]
    
    Example:
        >>> from brain.entry import run_cli
        >>> run_cli(['health', 'onboarding-check', '--json'])
    """
    if args is not None:
        # Guardar argv original
        original_argv = sys.argv
        try:
            # Inyectar args
            sys.argv = ['brain'] + args
            main()
        finally:
            # Restaurar argv
            sys.argv = original_argv
    else:
        main()


if __name__ == "__main__":
    run_cli()