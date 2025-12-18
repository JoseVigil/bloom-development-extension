"""
Brain CLI - Entry point principal
"""
import typer
import sys
from brain.commands import discover_commands
from brain.shared.context import GlobalContext

# Inicializamos la app Typer
app = typer.Typer(
    no_args_is_help=True,
    help="Brain - Sistema CLI modular para Bloom"
)

@app.callback()
def main_config(
    ctx: typer.Context,
    json_mode: bool = typer.Option(
        False, 
        "--json", 
        help="Activa output JSON para VS Code"
    ),
    verbose: bool = typer.Option(
        False, 
        "--verbose", 
        help="Muestra logs detallados de depuración"
    )
):
    """
    Configuración global que se ejecuta antes de cualquier comando.
    Inicializa el contexto compartido.
    """
    # Inicializamos el contexto global y lo guardamos en Typer
    ctx.obj = GlobalContext(
        json_mode=json_mode,
        verbose=verbose,
        root_path="."
    )
    
    # Debug temprano si verbose está activo
    if verbose:
        print(f"🔧 [DEBUG] Contexto inicializado: JSON={json_mode}, Verbose={verbose}", file=sys.stderr)


def main():
    """Bootstrap del sistema"""
    try:
        # Descubrimiento automático de comandos
        registry = discover_commands()
        for command in registry.get_all_commands():
            command.register(app)
        
        # Ejecución
        app()
    except Exception as e:
        # Catch-all final para evitar crashes feos
        print(f"❌ Error fatal en Brain: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()