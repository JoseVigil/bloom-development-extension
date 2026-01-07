"""
Brain CLI - Auto-discovery entry point.
Compatible with PyInstaller frozen executables.
"""
import sys
import os
import multiprocessing  # <--- CORRECCIÓN: Importación añadida
from pathlib import Path

# CRÍTICO: Inyectar site-packages ANTES de importar brain
current_file = Path(__file__).resolve()
brain_package = current_file.parent
site_packages = brain_package.parent
site_packages_str = str(site_packages)
if site_packages_str not in sys.path:
    sys.path.insert(0, site_packages_str)

# AHORA sí importar brain y dependencias
import typer
from brain.shared.context import GlobalContext

# Forzar UTF-8 en stdout/stderr para Windows
if sys.platform == "win32":
    import io
    if hasattr(sys.stdout, 'buffer'):
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


def is_frozen():
    """Detecta si estamos corriendo como ejecutable empaquetado."""
    return getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS')


def load_commands():
    """Carga comandos - Compatible con modo frozen y desarrollo."""
    if is_frozen():
        # Modo FROZEN (PyInstaller) - Usar cargador explícito
        from brain.cli.command_loader import load_all_commands_explicit
        return load_all_commands_explicit()
    else:
        # Modo DESARROLLO - Usar auto-discovery
        from brain.commands import discover_commands
        return discover_commands()


def main():
    """Main entry point with auto-discovery."""
    # ✅ CRÍTICO para Windows + PyInstaller + Asyncio/Multiprocessing
    multiprocessing.freeze_support() 
    
    # Intercept --help BEFORE Typer processes anything
    if "--help" in sys.argv and len(sys.argv) == 2:
        from brain.cli.help_renderer import render_help
        registry = load_commands()
        render_help(registry)
        sys.exit(0)
    
    try:
        registry = load_commands()
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
                app.add_typer(sub_apps[meta.category], name=meta.category.name)
            
            command.register(sub_apps[meta.category])
        
        app()
        
    except Exception as e:
        # Usar sys.stderr para errores críticos
        sys.stderr.write(f"❌ Error: Brain System Error: {e}\n")
        if not is_frozen():  # Solo mostrar traceback en desarrollo
            import traceback
            traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()