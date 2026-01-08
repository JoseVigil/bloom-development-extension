import typer
import sys
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory

class RuntimeRunCommand(BaseCommand):
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="run",
            category=CommandCategory.RUNTIME,
            description="Start Brain core runtime"
        )
    
    def register(self, app: typer.Typer) -> None:
        @app.command(name="run")
        def run(ctx: typer.Context):
            # Forzar salida sin buffer para NSSM
            sys.stdout.reconfigure(line_buffering=True)
            sys.stderr.reconfigure(line_buffering=True)
            
            try:
                from brain.core.service.server_manager import ServerManager
                manager = ServerManager(host="127.0.0.1", port=5678)
                
                # Esto BLOQUEA el proceso hasta que Windows/NSSM lo mate
                manager.start_blocking()
            except Exception as e:
                import traceback
                sys.stderr.write(f"CRITICAL RUNTIME ERROR: {e}\n")
                sys.stderr.write(traceback.format_exc())
                sys.exit(1)