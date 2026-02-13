#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Brain CLI - Build Script Multiplataforma
=========================================
Console output limpio y moderno con emojis
Log file completo con todos los detalles técnicos

SOPORTA: Windows, Linux, macOS con detección automática
UBICACIÓN: brain/build_multiplatform/build.py
"""
import os
import sys
import subprocess
from pathlib import Path
import io
import time
import threading
from datetime import datetime

# Importar utilidades compartidas
try:
    from shared.platform_detector import PLATFORM
    from shared.telemetry_helper import register_telemetry
except ImportError:
    # Si se ejecuta directamente desde raíz (compatibilidad legacy)
    sys.path.insert(0, str(Path(__file__).parent))
    from shared.platform_detector import PLATFORM
    from shared.telemetry_helper import register_telemetry

# ========================================
# CONFIGURACIÓN MULTIPLATAFORMA
# ========================================
# Detectar ubicación del proyecto
if Path(__file__).parent.name == "build_multiplatform":
    # Nuevo: brain/build_multiplatform/build.py
    PROJECT_ROOT = Path(__file__).parent.parent.parent
else:
    # Legacy: build.py en raíz
    PROJECT_ROOT = Path(__file__).parent

# Configurar rutas según plataforma
IS_WINDOWS = PLATFORM.is_windows
PLATFORM_DIR = PLATFORM.platform_dir
OS_NAME = PLATFORM.os_name

# Log file según BloomNucleus Spec
if IS_WINDOWS and 'BUILD_LOG_PATH' in os.environ:
    # PowerShell proporciona la ruta (compatibilidad legacy)
    LOG_FILE = Path(os.environ['BUILD_LOG_PATH'])
else:
    # Usar rutas según BloomNucleus Spec
    LOG_DIR = PLATFORM.get_log_directory()
    LOG_FILE = LOG_DIR / PLATFORM.get_log_filename()

# Destino del ejecutable
DEST_DIR = PROJECT_ROOT / "installer/native/bin" / PLATFORM_DIR / "brain"

# Nucleus CLI (para telemetría en Unix)
NUCLEUS_BIN = PLATFORM.get_nucleus_path(PROJECT_ROOT)

# ========================================
# EMOJIS Y SÍMBOLOS MODERNOS
# ========================================
class Icons:
    # Estados
    PROGRESS = "⏳"
    SUCCESS = "✅"
    ERROR = "❌"
    WARNING = "⚠️"
    INFO = "ℹ️"
    
    # Procesos
    BUILD = "🔨"
    CLEAN = "🧹"
    VERIFY = "🔍"
    COPY = "📦"
    DOC = "📄"
    TREE = "🌳"
    
    # Spinner
    SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

# ========================================
# CONFIGURACIÓN DE ENCODING
# ========================================
ENV_VARS = os.environ.copy()
ENV_VARS['PYTHONIOENCODING'] = 'utf-8'
ENV_VARS['PYTHONUTF8'] = '1'

if IS_WINDOWS:
    try:
        import ctypes
        kernel32 = ctypes.windll.kernel32
        kernel32.SetConsoleCP(65001)
        kernel32.SetConsoleOutputCP(65001)
    except:
        pass
    
    if hasattr(sys.stdout, 'buffer'):
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# ========================================
# SISTEMA DE LOGGING
# ========================================
def setup_log():
    """Inicia archivo de log con header."""
    # Crear directorio si no existe
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    
    with open(LOG_FILE, "w", encoding="utf-8") as f:
        f.write("=" * 70 + "\n")
        f.write(f"       BRAIN BUILD LOG ({OS_NAME.upper()})\n")
        f.write("=" * 70 + "\n")
        f.write(f"Fecha:       {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"Sistema:     {PLATFORM.system}\n")
        f.write(f"Arquitectura:{PLATFORM.machine}\n")
        f.write(f"Plataforma:  {PLATFORM_DIR}\n")
        f.write(f"Python:      {sys.version.split()[0]}\n")
        f.write("=" * 70 + "\n\n")

def log_to_file(msg, level="INFO"):
    """Escribe al archivo de log (todo el detalle técnico)."""
    timestamp = datetime.now().strftime("%H:%M:%S")
    file_msg = f"[{timestamp}] [{level:8s}] {msg}"
    
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(file_msg + "\n")
    except Exception as e:
        print(f"Error escribiendo log: {e}", file=sys.stderr)

def console_print(msg, indent=0):
    """Output limpio a consola."""
    prefix = " " * indent
    try:
        print(f"{prefix}{msg}", flush=True)
    except UnicodeEncodeError:
        safe_msg = msg.encode('ascii', 'replace').decode('ascii')
        print(f"{prefix}{safe_msg}", flush=True)

# ========================================
# EJECUCIÓN DE SUBPROCESOS
# ========================================
def safe_subprocess_run(cmd, timeout=None, cwd=None, desc=""):
    """
    Ejecuta comando y loguea al archivo.
    No muestra nada en consola (eso lo maneja el caller).
    """
    log_to_file(f"Ejecutando: {' '.join(str(c) for c in cmd)}", level="DEBUG")
    
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            env=ENV_VARS,
            timeout=timeout,
            cwd=cwd,
            encoding='utf-8',
            errors='replace'
        )
        
        stdout = result.stdout.strip() if result.stdout else ""
        stderr = result.stderr.strip() if result.stderr else ""
        
        # Log completo al archivo
        if stdout:
            log_to_file(f"STDOUT:\n{stdout}", level="DEBUG")
        if stderr:
            log_to_file(f"STDERR:\n{stderr}", level="WARN" if result.returncode == 0 else "ERROR")
        
        return result.returncode, stdout, stderr
        
    except subprocess.TimeoutExpired:
        log_to_file(f"Timeout en '{desc}' despues de {timeout}s", level="ERROR")
        return -1, "", "Timeout"
    except Exception as e:
        log_to_file(f"Excepcion en '{desc}': {e}", level="ERROR")
        return -1, "", str(e)

# ========================================
# PROCESO DE BUILD
# ========================================
def run_build_process(build_script):
    """
    Ejecuta build_main.py con streaming y progreso validado.
    """
    cmd = [sys.executable, "-u", str(build_script)] + sys.argv[1:]
    
    log_to_file("=" * 70)
    log_to_file("INICIANDO COMPILACIÓN")
    log_to_file("=" * 70)

    # Estado de control
    state = {
        "prog": 0,
        "active": True,
        "success": False
    }

    def heartbeat_logic():
        """Hilo de latido seguro: nunca llega al final por sí solo."""
        while state["active"]:
            time.sleep(2)
            # Solo incrementamos si estamos en fases intermedias y el proceso sigue vivo
            if state["prog"] < 40:
                state["prog"] += 1
            elif 40 <= state["prog"] < 85: # Techo de seguridad en 85%
                state["prog"] += 0.5
            
            # Solo mostrar progreso en Windows (PowerShell lo captura)
            if state["active"] and IS_WINDOWS:
                sys.stdout.write(f"[PROG:{int(state['prog'])}]\n")
                sys.stdout.flush()

    try:
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            env=ENV_VARS,
            encoding='utf-8',
            errors='replace',
            bufsize=1
        )

        # Iniciar latido (solo en Windows para PowerShell)
        if IS_WINDOWS:
            t = threading.Thread(target=heartbeat_logic, daemon=True)
            t.start()

        # Hitos estrictos
        milestones = {
            "GENERANDO COMMAND_LOADER": 15,
            "ACTUALIZANDO BRAIN.SPEC": 30,
            "COMPILANDO CON PYINSTALLER": 45,
            "COPIANDO A DIRECTORIO FINAL": 85,
            "VERIFICANDO COMPILACIÓN": 90
        }

        while True:
            line = process.stdout.readline()
            if not line and process.poll() is not None:
                break
            
            if line:
                line = line.rstrip()
                log_to_file(f"[BUILD] {line}", level="DEBUG")

                # Actualizar progreso por hitos reales detectados en el log
                clean_upper = line.upper()
                for msg, val in milestones.items():
                    if msg in clean_upper and val > state["prog"]:
                        state["prog"] = val
                        if IS_WINDOWS:
                            sys.stdout.write(f"[PROG:{int(state['prog'])}]\n")
                            sys.stdout.flush()

                # Si detectamos el éxito explícito en el log de build_main.py
                if "BUILD COMPLETADO EXITOSAMENTE" in clean_upper:
                    state["success"] = True

                # Filtrar mensajes importantes para mostrar en consola
                if any(p in line for p in ["VERSION file", "Completado:", "Archivos copiados", "Ejecutable creado"]):
                    clean = line.replace("[OK]", "").strip()
                    if clean: console_print(clean)

        # Fin del proceso
        state["active"] = False
        exit_code = process.poll()

        # SOLO si el exit_code es 0 y detectamos éxito, marcamos 100
        if exit_code == 0 and state["success"]:
            state["prog"] = 100
            if IS_WINDOWS:
                sys.stdout.write(f"[PROG:100]\n")
                sys.stdout.flush()
        
        return exit_code
        
    except Exception as e:
        state["active"] = False
        log_to_file(f"Error en run_build_process: {e}", level="ERROR")
        return -1

# ========================================
# VERIFICACIÓN DE EJECUTABLE
# ========================================
def verify_executable(brain_exe):
    """Verifica que el ejecutable funcione."""
    if not brain_exe.exists():
        log_to_file(f"Ejecutable no encontrado: {brain_exe}", level="ERROR")
        return False
    
    size_mb = brain_exe.stat().st_size / 1024 / 1024
    log_to_file(f"Ejecutable: {brain_exe} ({size_mb:.1f} MB)", level="INFO")
    
    code, stdout, stderr = safe_subprocess_run(
        [str(brain_exe), "--help"],
        timeout=30,
        desc="Verificacion de funcionalidad"
    )
    
    return code == 0

# ========================================
# GENERACIÓN DE DOCUMENTACIÓN
# ========================================
def generate_help_files(brain_exe):
    """Genera archivos de ayuda."""
    help_script = PROJECT_ROOT / "scripts/python/generate_help_files.py"
    if not help_script.exists():
        log_to_file(f"Script no encontrado: {help_script}", level="WARN")
        return False
    
    console_print("Generando archivos de ayuda...")
    log_to_file("Generando archivos de ayuda...", level="INFO")
    
    # Carpeta help/ junto al ejecutable final
    deploy_dir = brain_exe.parent.resolve()
    help_output_dir = deploy_dir / "help"
    help_output_dir.mkdir(parents=True, exist_ok=True)
    
    code, stdout, stderr = safe_subprocess_run(
        [
            sys.executable,
            str(help_script),
            str(brain_exe),
            "--output-dir", str(help_output_dir)
        ],
        timeout=90,
        desc="Generacion de ayuda"
    )
    
    return code == 0

def generate_tree_files(brain_exe):
    """Genera árboles de directorios."""
    tree_script = PROJECT_ROOT / "scripts/python/generate_tree_files.py"
    if not tree_script.exists():
        log_to_file(f"Script no encontrado: {tree_script}", level="WARN")
        return False
    
    console_print("Generando arboles de directorios...")
    log_to_file("Generando arboles de directorios...", level="INFO")
    
    deploy_dir = brain_exe.parent.resolve()
    tree_output_dir = deploy_dir / "help"
    tree_output_dir.mkdir(parents=True, exist_ok=True)
    
    code, stdout, stderr = safe_subprocess_run(
        [
            sys.executable,
            str(tree_script),
            str(brain_exe),
            "--output-dir", str(tree_output_dir)
        ],
        timeout=180,
        desc="Generacion de arboles"
    )
    
    return code == 0

# ========================================
# FUNCIÓN PRINCIPAL
# ========================================
def main():
    """Orquesta todo el proceso de build."""
    setup_log()
    
    # Header informativo
    console_print(f"\n{Icons.BUILD} Brain CLI Build - {PLATFORM_DIR}")
    console_print(f"   Log: {LOG_FILE}\n")
    log_to_file(f"Build iniciado para plataforma: {PLATFORM_DIR}")
    
    # Validar entorno
    brain_dir = PROJECT_ROOT / "brain"
    if not brain_dir.exists():
        console_print("Error: Ejecutar desde la raiz del proyecto")
        log_to_file("ERROR: Directorio 'brain' no encontrado", level="ERROR")
        sys.exit(1)
    
    build_script = brain_dir / "build_deploy/build_main.py"
    if not build_script.exists():
        console_print(f"Error: No existe {build_script}")
        log_to_file(f"ERROR: build_main.py no encontrado en {build_script}", level="ERROR")
        sys.exit(1)
    
    # ========================================
    # 1. EJECUTAR BUILD PRINCIPAL
    # ========================================
    exit_code = run_build_process(build_script)
    
    if exit_code != 0:
        console_print("\nError: Build fallo")
        log_to_file("Build fallo con exit code no-cero", level="ERROR")
        sys.exit(exit_code)
    
    # ========================================
    # 2. LOCALIZAR BINARIO
    # ========================================
    log_to_file("Localizando ejecutable...", level="INFO")
    
    exe_name = PLATFORM.get_executable_name()
    
    possible_paths = [
        DEST_DIR / exe_name,
        PROJECT_ROOT / "dist/brain" / exe_name
    ]
    
    brain_exe = None
    for p in possible_paths:
        if p.exists():
            brain_exe = p
            break
    
    if not brain_exe:
        console_print("\nError: No se encontro el ejecutable")
        log_to_file("ERROR: Ejecutable no encontrado en rutas esperadas", level="ERROR")
        sys.exit(1)
    
    log_to_file(f"Ejecutable encontrado: {brain_exe}", level="INFO")
    
    # ========================================
    # 3. VERIFICAR EJECUTABLE
    # ========================================
    console_print("\nVerificando ejecutable...")
    if not verify_executable(brain_exe):
        log_to_file("Warning: Ejecutable no verificado", level="WARN")
    else:
        console_print("  Ejecutable funcional", indent=2)
    
    # ========================================
    # 4. GENERAR DOCUMENTACIÓN (OBLIGATORIA)
    # ========================================
    console_print(f"\n{Icons.DOC} Generando documentación → {brain_exe.parent.name}/help/")
    
    help_success = generate_help_files(brain_exe)
    if help_success:
        console_print(f"  {Icons.SUCCESS} Archivos de ayuda generados", indent=2)
    else:
        console_print(f"  {Icons.WARNING} No se pudieron generar archivos de ayuda", indent=2)
        log_to_file("Warning: Generación de archivos de ayuda falló", level="WARN")
    
    # Generar árboles de directorios (opcional)
    # tree_success = generate_tree_files(brain_exe)
    # if tree_success:
    #     console_print(f"  {Icons.SUCCESS} Árboles de directorios generados", indent=2)
    
    # ========================================
    # 5. REGISTRAR TELEMETRÍA
    # ========================================
    success = register_telemetry(
        log_file=LOG_FILE,
        nucleus_bin=NUCLEUS_BIN if not IS_WINDOWS else None,
        platform_name=OS_NAME
    )
    
    # ========================================
    # ÉXITO
    # ========================================
    log_to_file("Build completado exitosamente", level="INFO")
    
    console_print(f"\n{Icons.SUCCESS} Build completado exitosamente")
    console_print(f"\nEjecutable: {brain_exe}")
    console_print(f"Log:        {LOG_FILE}\n")
    
    return 0

# ========================================
# ENTRY POINT
# ========================================
if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        log_to_file("\nBuild interrumpido por usuario", level="WARN")
        console_print(f"\n{Icons.WARNING} Build interrumpido")
        sys.exit(130)
    except Exception as e:
        log_to_file(f"Error inesperado: {e}", level="ERROR")
        console_print(f"\n{Icons.ERROR} Error inesperado: {e}")
        import traceback
        log_to_file(traceback.format_exc(), level="ERROR")
        sys.exit(1)