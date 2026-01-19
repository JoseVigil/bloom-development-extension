"""
GlobalContext - Contexto global que viaja a través de los comandos.
REFACTORED: Output estricto para integridad de datos en modo JSON.
"""
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
        
        Args:
            data: Datos a outputear (dict en modo JSON, cualquier tipo en modo normal)
            render_func: Función de renderizado para output humano (opcional)
        """
        if self.json_mode:
            # MODO JSON: Salida estricta para máquinas
            # CRÍTICO: Solo JSON puro a stdout, sin prefijos ni sufijos
            try:
                json_str = json.dumps(data, default=str, ensure_ascii=False)
                sys.stdout.write(json_str)
                sys.stdout.write('\n')
                sys.stdout.flush()  # Forzar flush inmediato para evitar buffering
            except Exception as e:
                # Si falla la serialización, devolver error estructurado
                error_data = {
                    "status": "error",
                    "message": f"JSON serialization failed: {str(e)}",
                    "original_data_type": type(data).__name__
                }
                sys.stdout.write(json.dumps(error_data))
                sys.stdout.write('\n')
                sys.stdout.flush()
        else:
            # MODO NORMAL: Salida para humanos
            if render_func:
                render_func(data)
            else:
                # Fallback si no hay renderizador específico
                typer.echo(str(data))
    
    def log(self, message: str, level: str = "info"):
        """
        Emite mensajes de log respetando el modo de salida.
        
        CRÍTICO: En modo JSON, NUNCA usar stdout para logs.
        FIX: En modo JSON, solo emitir a stderr si verbose=True (incluso para errors/warnings)
        
        Args:
            message: Mensaje a loggear
            level: Nivel de log (info, warning, error, debug)
        """
        if self.json_mode:
            # ========================================================================
            # FIX CRÍTICO: En modo JSON, SOLO emitir si verbose=True
            # Esto garantiza que stderr esté limpio para parsing en Sentinel
            # ========================================================================
            if self.verbose:
                sys.stderr.write(f"[{level.upper()}] {message}\n")
                sys.stderr.flush()
        else:
            # En modo normal, usar typer.echo con err=True para logs
            if self.verbose or level in ["error", "warning"]:
                prefix = {
                    "info": "ℹ️",
                    "warning": "⚠️",
                    "error": "❌",
                    "debug": "🔍"
                }.get(level, "•")
                typer.echo(f"{prefix} {message}", err=True)
    
    def error(self, message: str, exit_code: int = 1):
        """
        Maneja errores de forma unificada según el modo de salida.
        
        CRÍTICO: En modo JSON, devuelve error estructurado a stdout.
        
        Args:
            message: Mensaje de error
            exit_code: Código de salida (default: 1)
        """
        if self.json_mode:
            # Error estructurado para máquinas
            error_data = {
                "status": "error",
                "message": message,
                "exit_code": exit_code
            }
            sys.stdout.write(json.dumps(error_data))
            sys.stdout.write('\n')
            sys.stdout.flush()
        else:
            # Error para humanos
            typer.echo(f"❌ {message}", err=True)
        
        raise typer.Exit(code=exit_code)