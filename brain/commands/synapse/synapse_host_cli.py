"""
Synapse Host CLI.
Comandos para interactuar con el puente de Chrome.
"""

import sys
import typer
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory

class SynapseHostCommand(BaseCommand):
    """
    Gestiona el enlace de Native Messaging (Host).
    """
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="bridge", # Nombre interno, no afecta la jerarquía si el loader usa categorías
            category=CommandCategory.SYNAPSE,
            version="2.0.0",
            description="Bridge de comunicación nativa con Chrome Extension",
            examples=[
                "brain synapse host  (Uso interno de Chrome)",
                "brain synapse close (Cierre forzado)"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        """
        Registra los comandos directamente en la app de la categoría Synapse.
        """

        # COMANDO 1: HOST (El Loop)
        @app.command(name="host")
        def run_host(ctx: typer.Context):
            """
            Inicia el modo Host (Listener Loop).
            ¡CUIDADO! Usa stdin/stdout para protocolo binario.
            No ejecutar en terminal humana.
            """
            gc = ctx.obj
            # Silenciar Typer en stdout para proteger el protocolo JSON
            gc.json_mode = True 
            
            try:
                # Lazy Import del Core
                from brain.core.synapse.synapse_manager import SynapseManager
                
                manager = SynapseManager()
                manager.run_host_loop()
                
            except Exception as e:
                # Errores a stderr (Chrome los ignora o loguea aparte)
                print(f"❌ FATAL ERROR en Synapse Host: {e}", file=sys.stderr)
                raise typer.Exit(code=1)

        # COMANDO 2: CLOSE (Utilidad)
        @app.command(name="close")
        def close_session(ctx: typer.Context):
            """
            Envía señal de terminación al navegador.
            """
            gc = ctx.obj
            try:
                from brain.core.synapse.synapse_manager import SynapseManager
                
                manager = SynapseManager()
                result = manager.close_active_session()
                
                gc.output(result, lambda d: typer.echo("✅ Señal de cierre enviada"))
                
            except Exception as e:
                self._handle_error(gc, str(e))

    def _handle_error(self, gc, message: str):
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)