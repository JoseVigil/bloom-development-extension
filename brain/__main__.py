"""
Brain CLI - Auto-discovery entry point.
Compatible con PyInstaller frozen executables y Windows Services.
REFACTORED: Silent Entry para modo JSON (Stream Integrity).
"""
import sys
import io
import os
import logging
import multiprocessing
from pathlib import Path

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
# PASO 3: DETECTAR FLAGS GLOBALES (ANTES DE TYPER)
# ============================================================================
verbose_mode = "--verbose" in sys.argv
json_mode = "--json" in sys.argv

# ============================================================================
# PASO 4: CONFIGURACIÓN GLOBAL DE LOGGING (SILENT ENTRY PARA JSON)
# ============================================================================
from brain.shared.logger import setup_global_logging, get_logger

if json_mode:
    # MODO JSON: Logging completamente silenciado en stdout
    # Solo archivo de log activo, consola deshabilitada
    setup_global_logging(verbose=False, json_mode=True)
    logger = get_logger("brain.main")
    # No hacer logger.info() aquí para evitar contaminar stderr innecesariamente
else:
    # MODO NORMAL: Logging según verbose flag
    setup_global_logging(verbose=verbose_mode, json_mode=False)
    logger = get_logger("brain.main")
    logger.info("🧠 Brain CLI iniciando...")

# ============================================================================
# PASO 5: IMPORTS PRINCIPALES
# ============================================================================
try:
    import typer
    from brain.shared.context import GlobalContext
    if not json_mode:
        logger.debug("✓ Imports principales completados")
except Exception as e:
    logger.critical(f"❌ Error en imports principales: {e}", exc_info=True)
    if json_mode:
        import json
        sys.stdout.write(json.dumps({"status": "error", "message": f"Import error: {e}"}))
        sys.stdout.write('\n')
        sys.stdout.flush()
    sys.exit(1)

app = typer.Typer(
    no_args_is_help=True,
    help="Brain - Modular CLI system for Bloom",
    add_completion=False
)

@app.callback()
def main_config(
    ctx: typer.Context,
    json_output: bool = typer.Option(False, "--json", help="Enable JSON output"),
    verbose: bool = typer.Option(False, "--verbose", help="Enable detailed logging")
):
    """Brain CLI - The brain of the Bloom extension."""
    ctx.obj = GlobalContext(json_mode=json_output, verbose=verbose, root_path=".")
    if not json_output:
        logger.debug(f"GlobalContext configurado: json={json_output}, verbose={verbose}")

def is_frozen():
    """Detecta si estamos corriendo como ejecutable empaquetado."""
    frozen = getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS')
    return frozen

def load_commands():
    """Carga comandos - Compatible con modo frozen y desarrollo."""
    if not json_mode:
        logger.info("📦 Cargando comandos...")
    try:
        if is_frozen():
            if not json_mode:
                logger.info("Usando cargador explícito (modo frozen)")
            from brain.cli.command_loader import load_all_commands_explicit
            registry = load_all_commands_explicit()
        else:
            if not json_mode:
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
    try:
        from brain.core.profile.profile_manager import ProfileManager
        pm = ProfileManager()
        pm.launcher.cleanup_profile_locks()
    except Exception as e:
        if not json_mode:
            logger.warning(f"⚠️ No se pudieron limpiar locks de perfiles: {e}")
    
    # CRÍTICO para Windows + PyInstaller
    multiprocessing.freeze_support()
    
    # ========================================================================
    # INTERCEPT --help (ANTES DE TYPER)
    # ========================================================================
    if "--help" in sys.argv:
        try:
            ai_native = "--ai" in sys.argv or "--ai-native" in sys.argv
            full_help = "--full" in sys.argv
            
            # CRÍTICO: Remover flags custom ANTES de que Typer los vea
            # Esto evita "No such option: --full"
            sys.argv = [arg for arg in sys.argv if arg not in ["--full", "--ai", "--ai-native"]]
            
            # Solo renderizar help custom si es help global (no de subcomandos)
            if len([arg for arg in sys.argv if not arg.startswith('-')]) == 1:
                from brain.cli.help_renderer import render_help
                registry = load_commands()
                render_help(registry, json_mode=json_mode, ai_native=ai_native, full_help=full_help)
                sys.exit(0)
        except SystemExit:
            # Salida normal del interceptor - propagar para terminar
            raise
        except Exception as e:
            # Si falla renderizar help custom, dejar que Typer maneje el fallback
            if not json_mode:
                logger.warning(f"⚠️ Error en help renderer, usando fallback de Typer: {e}")
                import traceback
                traceback.print_exc()
            # NO hacer pass - dejar que continúe a Typer como fallback
    
    # ========================================================================
    # INTERCEPT --version, --info (ANTES DE TYPER)
    # ========================================================================
    if "--version" in sys.argv or "--info" in sys.argv:
        try:
            # Detectar cuál flag se usó
            is_version = "--version" in sys.argv
            is_info = "--info" in sys.argv
            
            flag_name = "--version" if is_version else "--info"
            
            # Detectar flags globales
            json_flag = "--json" in sys.argv
            verbose_flag = "--verbose" in sys.argv
            
            # Remover flags custom ANTES de que Typer los vea
            sys.argv = [arg for arg in sys.argv if arg not in [flag_name, "--json", "--verbose"]]
            
            # Solo procesar si es invocación global (no subcomando)
            # Ejemplo: "brain --version" ✓ vs "brain system --version" ✗
            if len([arg for arg in sys.argv if not arg.startswith('-')]) == 1:
                if is_version:
                    # Lazy import del comando
                    from brain.commands.system.version_flags import VersionFlagCommand
                    VersionFlagCommand.execute_intercepted(
                        json_mode=json_flag,
                        verbose=verbose_flag
                    )
                else:  # --info
                    # Lazy import del comando
                    from brain.commands.system.info_flags import InfoFlagCommand
                    InfoFlagCommand.execute_intercepted(
                        json_mode=json_flag,
                        verbose=verbose_flag
                    )
                # Si llegamos aquí sin sys.exit(), algo salió mal
                sys.exit(1)
                
        except SystemExit:
            # Salida normal del comando interceptado
            raise
        except Exception as e:
            # Si falla la intercepción, dejar que Typer maneje el error
            if not json_mode:
                logger.warning(f"⚠️ Error en flag interceptor, usando fallback de Typer: {e}")
                import traceback
                traceback.print_exc()
            pass
    
    try:
        registry = load_commands()
        sub_apps = {}
        
        # ====================================================================
        # REGISTRO DINÁMICO DE COMANDOS
        # ====================================================================
        for command in registry.get_all_commands():
            meta = command.metadata()
            try:
                if meta.is_root:
                    command.register(app)
                    continue
                
                # Crear sub-app por categoría si no existe
                if meta.category not in sub_apps:
                    sub_apps[meta.category] = typer.Typer(
                        help=meta.category.description,
                        no_args_is_help=True
                    )
                    app.add_typer(sub_apps[meta.category], name=meta.category.name)
                
                # Registrar comando en su categoría
                command.register(sub_apps[meta.category])
                
            except Exception as e:
                logger.error(f"❌ Error registro {meta.name}: {e}")
        
        # ====================================================================
        # EJECUTAR COMANDO
        # ====================================================================
        if not json_mode:
            logger.info("▶️ Ejecutando comando...")
        app()
        
    except SystemExit as e:
        # Salida normal de Typer
        raise
        
    except Exception as e:
        logger.critical(f"❌ ERROR CRÍTICO: {e}", exc_info=True)
        
        if json_mode:
            # En modo JSON, devolver error estructurado a stdout
            import json
            error_response = {
                "status": "error",
                "message": str(e),
                "type": type(e).__name__
            }
            sys.stdout.write(json.dumps(error_response))
            sys.stdout.write('\n')
            sys.stdout.flush()
        else:
            # En modo normal, escribir a stderr
            try:
                sys.stderr.write(f"FATAL: {e}\n")
            except:
                pass
        
        sys.exit(1)

if __name__ == "__main__":
    main()