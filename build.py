#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Brain CLI - Build Script con Output Moderno
============================================
Console output limpio y moderno con emojis
Log file completo con todos los detalles técnicos
"""
import os
import sys
import subprocess
from pathlib import Path
import io
import time
from datetime import datetime

# ========================================
# CONFIGURACIÓN
# ========================================
# Si PowerShell proporciona una ruta de log, usarla; si no, usar la raíz del proyecto
LOG_FILE = Path(os.environ.get('BUILD_LOG_PATH', 'build.log'))

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

if sys.platform == "win32":
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
        f.write("               BRAIN BUILD LOG\n")
        f.write("=" * 70 + "\n")
        f.write(f"Fecha:   {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"Sistema: {sys.platform}\n")
        f.write(f"Python:  {sys.version.split()[0]}\n")
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
    Ejecuta build_main.py con streaming.
    Output formateado para PowerShell.
    """
    cmd = [sys.executable, str(build_script)] + sys.argv[1:]
    
    log_to_file("=" * 70)
    log_to_file("COMPILACIÓN CON PYINSTALLER")
    log_to_file("=" * 70)
    
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
        
        # Patrones importantes para mostrar en consola
        important_patterns = [
            ("VERSION file creado", "gray"),
            ("Completado: Generacion", "split"),  # Split significa: blanco + verde
            ("Completado: Actualizacion", "split"),
            ("Completado: Compilacion", "split"),
            ("Archivos copiados", "gray"),
            ("Ejecutable creado", "gray"),
            ("Ejecutable funciona", "gray"),
            ("BUILD COMPLETADO EXITOSAMENTE", "yellow"),
        ]
        
        while True:
            line = process.stdout.readline()
            if not line and process.poll() is not None:
                break
            
            if line:
                line = line.rstrip()
                
                # Todo al archivo de log
                log_to_file(f"[BUILD] {line}", level="DEBUG")
                
                # Solo mensajes importantes a consola
                for pattern, color_type in important_patterns:
                    if pattern in line:
                        # Limpiar formato viejo
                        clean = line.replace("[OK]", "").replace("CREANDO", "").replace("GENERANDO", "")
                        clean = clean.replace("ACTUALIZANDO", "").replace("COMPILANDO", "").replace("COPIANDO", "")
                        clean = clean.replace("VERIFICANDO", "").strip()
                        
                        if clean:
                            # PowerShell parseará esto
                            console_print(clean)
                        break
        
        exit_code = process.poll()
        
        return exit_code
        
    except Exception as e:
        log_to_file(f"Error ejecutando build: {e}", level="ERROR")
        console_print(f"Error en compilacion: {e}")
        return -1

# ========================================
# GENERACIÓN DE DOCUMENTACIÓN
# ========================================
def generate_help_files(brain_exe):
    """Genera archivos de ayuda."""
    help_script = Path("scripts/python/generate_help_files.py")
    if not help_script.exists():
        log_to_file(f"Script no encontrado: {help_script}", level="WARN")
        return False
    
    console_print("Generando archivos de ayuda...")
    log_to_file("Generando archivos de ayuda...", level="INFO")
    
    code, stdout, stderr = safe_subprocess_run(
        [sys.executable, str(help_script), str(brain_exe)],
        timeout=60,
        desc="Generacion de ayuda"
    )
    
    return code == 0

def generate_tree_files(brain_exe):
    """Genera árboles de directorios."""
    tree_script = Path("scripts/python/generate_tree_files.py")
    if not tree_script.exists():
        log_to_file(f"Script no encontrado: {tree_script}", level="WARN")
        return False
    
    console_print("Generando arboles de directorios...")
    log_to_file("Generando arboles de directorios...", level="INFO")
    
    code, stdout, stderr = safe_subprocess_run(
        [sys.executable, str(tree_script), str(brain_exe)],
        timeout=120,
        desc="Generacion de arboles"
    )
    
    return code == 0

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
# FUNCIÓN PRINCIPAL
# ========================================
def main():
    """Orquesta todo el proceso de build."""
    setup_log()
    
    # Validar entorno
    if not Path("brain").exists():
        console_print("Error: Ejecutar desde la raiz del proyecto")
        sys.exit(1)
    
    build_script = Path("brain/build_deploy/build_main.py")
    if not build_script.exists():
        console_print(f"Error: No existe {build_script}")
        sys.exit(1)
    
    # ========================================
    # 1. EJECUTAR BUILD PRINCIPAL
    # ========================================
    exit_code = run_build_process(build_script)
    
    if exit_code != 0:
        console_print("Error: Build fallo")
        sys.exit(exit_code)
    
    # ========================================
    # 2. LOCALIZAR BINARIO
    # ========================================
    log_to_file("Localizando ejecutable...", level="INFO")
    
    possible_paths = [
        Path("installer/native/bin/win32/brain/brain.exe"),
        Path("dist/brain/brain.exe")
    ]
    
    brain_exe = None
    for p in possible_paths:
        if p.exists():
            brain_exe = p
            break
    
    if not brain_exe:
        console_print("Error: No se encontro el ejecutable")
        sys.exit(1)
    
    log_to_file(f"Ejecutable encontrado: {brain_exe}", level="INFO")
    
    # ========================================
    # 3. VERIFICAR EJECUTABLE
    # ========================================
    if not verify_executable(brain_exe):
        log_to_file("Warning: Ejecutable no verificado", level="WARN")
    
    # ========================================
    # 4. GENERAR DOCUMENTACIÓN
    # ========================================
    generate_help_files(brain_exe)
    generate_tree_files(brain_exe)
    
    return 0

# ========================================
# ENTRY POINT
# ========================================
if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        log_to_file("\nBuild interrumpido por usuario", level="WARN")
        sys.exit(130)
    except Exception as e:
        log_to_file(f"Error inesperado: {e}", level="ERROR")
        import traceback
        log_to_file(traceback.format_exc(), level="ERROR")
        sys.exit(1)