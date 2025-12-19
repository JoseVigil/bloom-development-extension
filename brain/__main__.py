"""
Brain CLI - Auto-discovery entry point.
NO MAINTENANCE REQUIRED when adding new commands.
"""
import typer
import sys
from brain.commands import discover_commands
from brain.shared.context import GlobalContext
from brain.cli.help_renderer import render_help

app = typer.Typer(
    no_args_is_help=True,
    help="Brain - Modular CLI system for Bloom",
    add_completion=False  # Disable default help to use custom
)


@app.callback(invoke_without_command=True)
def main_config(
    ctx: typer.Context,
    json_mode: bool = typer.Option(False, "--json", help="Enable JSON output"),
    verbose: bool = typer.Option(False, "--verbose", help="Enable detailed logging")
):
    """Brain CLI - The brain of the Bloom extension."""
    
    # Intercept --help before Typer processes it
    if ctx.invoked_subcommand is None and "--help" in sys.argv:
        registry = discover_commands()
        render_help(registry)
        raise typer.Exit()
    
    ctx.obj = GlobalContext(json_mode=json_mode, verbose=verbose, root_path=".")


def main():
    """Main entry point with auto-discovery."""
    try:
        registry = discover_commands()
        sub_apps = {}
        
        # Auto-register all commands
        for command in registry.get_all_commands():
            meta = command.metadata()
            
            # Root commands register directly
            if meta.is_root:
                command.register(app)
                continue
            
            # Grouped commands
            if meta.category not in sub_apps:
                sub_apps[meta.category] = typer.Typer(
                    help=meta.category.description,
                    no_args_is_help=True
                )
                app.add_typer(sub_apps[meta.category], name=meta.category.value)
            
            command.register(sub_apps[meta.category])
        
        app()
        
    except Exception as e:
        print(f"❌ Brain System Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()