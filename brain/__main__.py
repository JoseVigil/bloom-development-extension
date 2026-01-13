"""
Brain CLI - Auto-discovery entry point.
Compatible con PyInstaller frozen executables.
"""
import sys
import io
import os
import multiprocessing
from pathlib import Path
from dotenv import load_dotenv
load_dotenv()

# 🔧 FIX CRÍTICO: Windows Service stdout/stderr cerrados
if sys.platform == 'win32':
    # Primero verificar si están cerrados
    if sys.stdout is None or (hasattr(sys.stdout, 'closed') and sys.stdout.closed):
        sys.stdout = open(os.devnull, 'w', encoding='utf-8')
    elif hasattr(sys.stdout, 'buffer'):
        # Solo aplicar UTF-8 wrapper si tiene buffer (terminal normal)
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    
    if sys.stderr is None or (hasattr(sys.stderr, 'closed') and sys.stderr.closed):
        sys.stderr = open(os.devnull, 'w', encoding='utf-8')
    elif hasattr(sys.stderr, 'buffer'):
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
        
# ============================================================================
# PASO 1: CONFIGURAR PATHS (ANTES DE CUALQUIER IMPORT)
# ============================================================================
current_file = Path(__file__).resolve()
brain_package = current_file.parent
site_packages = brain_package.parent
site_packages_str = str(site_packages)
if site_packages_str not in sys.path:
    sys.path.insert(0, site_packages_str)

# ============================================================================
# PASO 2: INICIALIZAR LOGGER GLOBAL (LO MÁS TEMPRANO POSIBLE)
# ============================================================================
from brain.shared.logger import setup_global_logging, get_logger

# Inicializar logging ANTES de cualquier otra cosa
setup_global_logging(verbose="--verbose" in sys.argv)
logger = get_logger("brain.main")
logger.info("🧠 Brain CLI iniciando...")

# ============================================================================
# PASO 3: IMPORTS PRINCIPALES
# ============================================================================
try:
    import typer
    from brain.shared.context import GlobalContext
    logger.debug("✓ Imports principales completados")
except Exception as e:
    logger.critical(f"❌ Error en imports principales: {e}", exc_info=True)
    sys.exit(1)

# Forzar UTF-8 en stdout/stderr para Windows
if sys.platform == "win32":
    import io
    if hasattr(sys.stdout, 'buffer'):
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')
    logger.debug("✓ UTF-8 configurado en Windows")

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
    logger.debug(f"GlobalContext configurado: json={json_mode}, verbose={verbose}")


def is_frozen():
    """Detecta si estamos corriendo como ejecutable empaquetado."""
    frozen = getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS')
    logger.debug(f"Modo frozen: {frozen}")
    return frozen


def load_commands():
    """Carga comandos - Compatible con modo frozen y desarrollo."""
    logger.info("📦 Cargando comandos...")
    
    try:
        if is_frozen():
            logger.info("Usando cargador explícito (modo frozen)")
            from brain.cli.command_loader import load_all_commands_explicit
            registry = load_all_commands_explicit()
        else:
            logger.info("Usando auto-discovery (modo desarrollo)")
            from brain.commands import discover_commands
            registry = discover_commands()
        
        command_count = len(registry.get_all_commands())
        logger.info(f"✓ {command_count} comandos cargados exitosamente")
        return registry
        
    except Exception as e:
        logger.error(f"❌ Error al cargar comandos: {e}", exc_info=True)
        raise


def main():
    """Main entry point with auto-discovery."""
    import time
    start_time = time.time()
    
    # ✅ CRÍTICO para Windows + PyInstaller + Asyncio/Multiprocessing
    multiprocessing.freeze_support()
    logger.debug("Multiprocessing freeze_support activado")
    
    # Intercept --help with AI-native support
    if "--help" in sys.argv:
        logger.debug("Interceptando comando --help")
        json_mode = "--json" in sys.argv
        ai_native = "--ai" in sys.argv or "--ai-native" in sys.argv
        
        # Si es solo --help o tiene flags de output
        if len([arg for arg in sys.argv if not arg.startswith('-')]) == 1:
            try:
                from brain.cli.help_renderer import render_help
                registry = load_commands()
                render_help(registry, json_mode=json_mode, ai_native=ai_native)
                logger.info("✓ Help renderizado exitosamente")
                sys.exit(0)
            except Exception as e:
                logger.error(f"❌ Error al renderizar help: {e}", exc_info=True)
                sys.exit(1)
    
    try:
        # Log de argumentos recibidos
        logger.info(f"Argumentos: {' '.join(sys.argv[1:])}")
        
        registry = load_commands()
        sub_apps = {}
        
        # Auto-register all commands
        logger.info("🔧 Registrando comandos en Typer...")
        for command in registry.get_all_commands():
            meta = command.metadata()
            
            try:
                # Root commands register directly
                if meta.is_root:
                    command.register(app)
                    logger.debug(f"  ✓ Comando root: {meta.name}")
                    continue
                
                # Grouped commands
                if meta.category not in sub_apps:
                    sub_apps[meta.category] = typer.Typer(
                        help=meta.category.description,
                        no_args_is_help=True
                    )
                    app.add_typer(sub_apps[meta.category], name=meta.category.name)
                    logger.debug(f"  ✓ Categoría creada: {meta.category.name}")
                
                command.register(sub_apps[meta.category])
                logger.debug(f"  ✓ Comando: {meta.category.name}.{meta.name}")
                
            except Exception as e:
                logger.error(f"❌ Error al registrar comando {meta.name}: {e}", exc_info=True)
        
        logger.info("✓ Todos los comandos registrados")
        
        # Ejecutar aplicación Typer
        logger.info("▶️  Ejecutando comando...")
        app()
        
        # Log de tiempo total
        duration = time.time() - start_time
        logger.info(f"✅ Ejecución completada en {duration:.2f}s")
        
    except SystemExit as e:
        # SystemExit es normal (Typer lo usa para --help, etc.)
        duration = time.time() - start_time
        if e.code == 0:
            logger.info(f"✓ Salida normal en {duration:.2f}s")
        else:
            logger.warning(f"⚠️  Salida con código {e.code} en {duration:.2f}s")
        raise
        
    except Exception as e:
        # Log de error crítico
        duration = time.time() - start_time
        logger.critical(f"❌ ERROR CRÍTICO después de {duration:.2f}s: {e}", exc_info=True)
        
        # Usar sys.stderr para errores críticos
        sys.stderr.write(f"❌ Error: Brain System Error: {e}\n")
        
        if not is_frozen():
            # Solo mostrar traceback en desarrollo
            import traceback
            traceback.print_exc()
        else:
            sys.stderr.write(f"Ver logs en: {logger.handlers[0].baseFilename if logger.handlers else 'N/A'}\n")
        
        sys.exit(1)


if __name__ == "__main__":
    main()