"""
Brain CLI - Entry point
"""
import typer
from brain.commands import discover_commands


app = typer.Typer(
    no_args_is_help=True,
    help="Brain - Sistema CLI modular para Bloom"
)


def main():
    """Bootstrap del sistema"""
    registry = discover_commands()
    for command in registry.get_all_commands():
        command.register(app)
    app()


if __name__ == "__main__":
    main()