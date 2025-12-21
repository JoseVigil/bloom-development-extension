"""
Brain CLI - Auto-discovery entry point.
NO MAINTENANCE REQUIRED when adding new commands.
"""
import typer
import sys
from brain.commands import discover_commands
from brain.shared.context import GlobalContext

# Forzar UTF-8 en stdout/stderr para Windows
if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

app = typer.Typer(
    no_args_is_help=True,
    help="Brain - Modular CLI system for Bloom",
    add_completion=False
)


@app.callback()
def main_config(
    ctx: typer.Context,
    json_mode: bool = typer.Option(False, "--json", help="Enable JSON output"),
    verbose: bool = typer.Option(False, "--verbose", help="Enable detailed logging")
):
    """Brain CLI - The brain of the Bloom extension."""
    ctx.obj = GlobalContext(json_mode=json_mode, verbose=verbose, root_path=".")


def main():
    """Main entry point with auto-discovery."""
    
    # Intercept --help BEFORE Typer processes anything
    if "--help" in sys.argv and len(sys.argv) == 2:
        from brain.cli.help_renderer import render_help
        registry = discover_commands()
        render_help(registry)
        sys.exit(0)
    
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
        print(f"Error: Brain System Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()