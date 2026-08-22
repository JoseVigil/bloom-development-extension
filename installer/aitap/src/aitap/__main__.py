"""
AITap CLI - Entry point.

Sigue el mismo patron de brain/__main__.py: typer + CommandRegistry + BaseCommand
+ help dual-mode (texto humano / JSON AI-native), para cumplir con la norma del
ecosistema Bloom de que todo servicio expone su propio --help y una variante
JSON capturable por scripts de build hacia installer/help/.

AITap NO es dueno del vault — Nucleus lo es. El primer corte implementa
routing determinístico abstracto; no invoca providers, CLIs ni Vault.
"""
import sys

import typer

from aitap import __version__
from aitap.core.context import GlobalContext

json_mode = "--json" in sys.argv

app = typer.Typer(
    no_args_is_help=True,
    help="AITap - Grifo de Intelligence y Execution Routing para el ecosistema Bloom",
    add_completion=False,
)


@app.callback()
def main_config(
    ctx: typer.Context,
    json_output: bool = typer.Option(False, "--json", help="Output en formato JSON"),
    verbose: bool = typer.Option(False, "--verbose", help="Logging detallado"),
):
    """AITap CLI - routing abstracto de Intelligence y Execution Providers."""
    ctx.obj = GlobalContext(json_mode=json_output, verbose=verbose)


def load_commands():
    from aitap.commands import discover_commands
    return discover_commands()


def _handle_help_intercept() -> bool:
    """
    Intercepta --help / --json-help ANTES de que Typer los procese, para poder
    renderizar el help dual-mode igual que brain/__main__.py. Devuelve True si
    ya manejo la salida (y llamo sys.exit).

    --json-help es alias de --help --ai --full, matching la convencion que ya
    usan nucleus/sentinel/metamorph (cobra --json-help) para que el mismo
    comando de build pueda volcar a installer/help/aitap_help.json.
    """
    is_help = "--help" in sys.argv or "-h" in sys.argv
    is_json_help = "--json-help" in sys.argv
    if not (is_help or is_json_help):
        return False

    ai_native = is_json_help or "--ai" in sys.argv or "--ai-native" in sys.argv
    full_help = is_json_help or "--full" in sys.argv

    # Solo interceptar help GLOBAL (no el de un subcomando, ej. "aitap keys --help")
    positional = [a for a in sys.argv[1:] if not a.startswith("-")]
    if positional:
        return False

    from aitap.cli.help_renderer import render_help
    registry = load_commands()
    render_help(registry, json_mode=json_mode or is_json_help, ai_native=ai_native, full_help=full_help)
    sys.exit(0)


def main():
    if _handle_help_intercept():
        return

    if "--version" in sys.argv:
        typer.echo(f"aitap v{__version__}")
        sys.exit(0)

    registry = load_commands()
    sub_apps = {}

    for command in registry.get_all_commands():
        meta = command.metadata()
        if meta.is_root:
            command.register(app)
            continue
        if meta.category not in sub_apps:
            sub_apps[meta.category] = typer.Typer(
                help=meta.category.description,
                no_args_is_help=True,
            )
            app.add_typer(sub_apps[meta.category], name=meta.category.name)
        command.register(sub_apps[meta.category])

    app()


if __name__ == "__main__":
    main()
