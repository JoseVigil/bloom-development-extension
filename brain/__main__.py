"""
Brain CLI - Auto-discovery entry point.
Compatible con PyInstaller frozen executables y Windows Services.
"""
import sys
import io
import os
import multiprocessing
from pathlib import Path
from brain.core.profile.profile_manager import ProfileManager

# ============================================================================
# FIX CRÍTICO 0: NULL WRITER ROBUSTO (Para Servicios)
# ============================================================================
class NullWriter:
    """Clase que simula un archivo abierto pero no hace nada."""
    def write(self, s): pass
    def flush(self): pass
    def isatty(self): return False
    def fileno(self): return -1
    @property
    def encoding(self): return 'utf-8'
    @property
    def buffer(self): return self

# ============================================================================
# FIX CRÍTICO 1: SANEAR STDOUT/STDERR ANTES DE NADA
# ============================================================================
if sys.platform == 'win32':
    # Función helper para verificar si un stream está roto o cerrado
    def is_stream_broken(stream):
        if stream is None: return True
        try:
            # Intentar acceder a atributos básicos
            _ = stream.closed
            return False
        except (ValueError, AttributeError):
            return True

    # Si estamos congelados o sin consola, redirigir a NullWriter o DevNull
    # Esto evita el error "I/O operation on closed file"
    if getattr(sys, 'frozen', False) or is_stream_broken(sys.stdout) or is_stream_broken(sys.stderr):
        
        # Redirigir stdout si está roto
        if is_stream_broken(sys.stdout):
            try:
                sys.stdout = open(os.devnull, 'w', encoding='utf-8')
            except OSError:
                sys.stdout = NullWriter()
        
        # Redirigir stderr si está roto
        if is_stream_broken(sys.stderr):
            try:
                sys.stderr = open(os.devnull, 'w', encoding='utf-8')
            except OSError:
                sys.stderr = NullWriter()

    # Si tenemos streams válidos, forzar UTF-8
    else:
        if hasattr(sys.stdout, 'buffer'):
            sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
        if hasattr(sys.stderr, 'buffer'):
            sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# ============================================================================
# CARGAR DOTENV
# ============================================================================
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass # No es crítico si falla en runtime limpio

# ============================================================================
# PASO 2: CONFIGURAR PATHS
# ============================================================================
current_file = Path(__file__).resolve()
brain_package = current_file.parent
site_packages = brain_package.parent
site_packages_str = str(site_packages)
if site_packages_str not in sys.path:
    sys.path.insert(0, site_packages_str)

# ============================================================================
# PASO 3: INICIALIZAR LOGGER
# ============================================================================
from brain.shared.logger import setup_global_logging, get_logger

# Detectar flags globales manualmente antes de Typer
verbose_mode = "--verbose" in sys.argv
json_mode = "--json" in sys.argv

setup_global_logging(verbose=verbose_mode)
logger = get_logger("brain.main")
logger.info("🧠 Brain CLI iniciando...")

# ============================================================================
# PASO 4: IMPORTS PRINCIPALES
# ============================================================================
try:
    import typer
    from brain.shared.context import GlobalContext
    logger.debug("✓ Imports principales completados")
except Exception as e:
    logger.critical(f"❌ Error en imports principales: {e}", exc_info=True)
    # No usar sys.exit(1) directo si no hay consola, pero aquí no hay opción
    sys.exit(1)

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
        return registry
    except Exception as e:
        logger.error(f"❌ Error al cargar comandos: {e}", exc_info=True)
        raise

def main():
    """Main entry point with auto-discovery."""
    import time
    start_time = time.time()

    # Limpiar locks
    pm = ProfileManager()
    pm.launcher.cleanup_profile_locks(pm.paths.profiles_dir)
    
    # CRÍTICO para Windows + PyInstaller
    multiprocessing.freeze_support()
    
    # Intercept --help
    if "--help" in sys.argv:
        # Solo intentar renderizar help si tenemos consola
        try:
            # (Tu lógica de help existente)
            ai_native = "--ai" in sys.argv or "--ai-native" in sys.argv
            if len([arg for arg in sys.argv if not arg.startswith('-')]) == 1:
                from brain.cli.help_renderer import render_help
                registry = load_commands()
                render_help(registry, json_mode=json_mode, ai_native=ai_native)
                sys.exit(0)
        except Exception:
            # Si falla renderizar help (ej: sin consola), dejar que Typer maneje el fallback
            pass
    
    try:
        registry = load_commands()
        sub_apps = {}
        
        # Registro dinámico
        for command in registry.get_all_commands():
            meta = command.metadata()
            try:
                if meta.is_root:
                    command.register(app)
                    continue
                
                if meta.category not in sub_apps:
                    sub_apps[meta.category] = typer.Typer(
                        help=meta.category.description,
                        no_args_is_help=True
                    )
                    app.add_typer(sub_apps[meta.category], name=meta.category.name)
                
                command.register(sub_apps[meta.category])
            except Exception as e:
                logger.error(f"❌ Error registro {meta.name}: {e}")
        
        # Ejecutar
        logger.info("▶️  Ejecutando comando...")
        app()
        
    except SystemExit:
        raise # Salida normal de Typer
        
    except Exception as e:
        logger.critical(f"❌ ERROR CRÍTICO: {e}", exc_info=True)
        # Intentar escribir error a stderr si existe
        try:
            sys.stderr.write(f"FATAL: {e}\n")
        except:
            pass
        sys.exit(1)

if __name__ == "__main__":
    main()