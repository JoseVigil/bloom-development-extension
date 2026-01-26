#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Brain CLI - Build Script con Logging
Genera 'build.log' con todo el detalle de la ejecución.
"""
import os
import sys
import subprocess
from pathlib import Path
import io
import time
from datetime import datetime

# Archivo de Log
LOG_FILE = Path("build.log")

# ========================================
# SISTEMA DE LOGGING
# ========================================
def setup_log():
    """Inicia un nuevo archivo de log."""
    with open(LOG_FILE, "w", encoding="utf-8") as f:
        f.write(f"=== BRAIN BUILD LOG ===\n")
        f.write(f"Fecha: {datetime.now()}\n")
        f.write(f"Sistema: {sys.platform}\n")
        f.write("="*40 + "\n\n")

def log(msg, level="INFO", to_console=True):
    """
    Escribe en el log y opcionalmente en consola.
    Maneja errores de encoding en consola de Windows.
    """
    timestamp = datetime.now().strftime("%H:%M:%S")
    file_msg = f"[{timestamp}] [{level}] {msg}"
    
    # 1. Escribir en archivo (UTF-8 seguro)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(file_msg + "\n")
    except Exception as e:
        print(f"!!! Error escribiendo log: {e}")

    # 2. Escribir en consola (Saneado)
    if to_console:
        console_msg = msg
        if level == "ERROR":
            console_msg = f"X {msg}"
        elif level == "WARN":
            console_msg = f"! {msg}"
        elif level == "SUCCESS":
            console_msg = f"OK {msg}"
            
        try:
            print(console_msg)
        except UnicodeEncodeError:
            print(console_msg.encode('ascii', 'replace').decode('ascii'))

# ========================================
# CONFIGURACIÓN DE ENTORNO
# ========================================
ENV_VARS = os.environ.copy()
ENV_VARS['PYTHONIOENCODING'] = 'utf-8'
ENV_VARS['PYTHONUTF8'] = '1'
ENV_VARS['TERM'] = 'xterm-256color' 

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

def safe_subprocess_run(cmd, timeout=None, cwd=None, desc=""):
    """Ejecuta comando y loguea todo."""
    log(f"Ejecutando: {' '.join(cmd)}", level="DEBUG", to_console=False)
    
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
        
        if stdout:
            log(f"STDOUT:\n{stdout}", level="DEBUG", to_console=False)
        
        if result.returncode != 0:
            log(f"Fallo en '{desc}' (Código {result.returncode})", level="ERROR", to_console=False)
            if stderr:
                log(f"STDERR:\n{stderr}", level="ERROR", to_console=False)
            return result.returncode, stdout, stderr
            
        return 0, stdout, stderr
        
    except subprocess.TimeoutExpired:
        log(f"Timeout en '{desc}'", level="ERROR")
        return -1, "", "Timeout"
    except Exception as e:
        log(f"Excepción en '{desc}': {e}", level="ERROR")
        return -1, "", str(e)

def generate_tree_files(brain_exe):
    tree_dir = Path("tree")
    tree_dir.mkdir(parents=True, exist_ok=True)
    
    log("\nGenerando árboles de directorios...", level="INFO")
    
    tree_commands = [
        {"args": ["filesystem", "tree", "src", "installer", "brain", "-o", "tree/plugin_tree.txt"], "file": "plugin_tree.txt"},
        {"args": ["filesystem", "tree", "installer", "-o", "tree/installer_tree.txt"], "file": "installer_tree.txt"},
        {"args": ["filesystem", "tree", "brain", "-o", "tree/brain_tree.txt"], "file": "brain_tree.txt"},
        {"args": ["filesystem", "tree", "installer/electron-app", "-o", "tree/electron_tree.txt"], "file": "electron_tree.txt"},
        {"args": ["filesystem", "tree", "installer/sentinel", "-o", "tree/sentinel_tree.txt"], "file": "sentinel_tree.txt"},
        {"args": ["filesystem", "tree", "webview", "-o", "tree/webview_tree.txt"], "file": "webview_tree.txt"},
        {"args": ["filesystem", "tree", "installer/chrome-extension", "-o", "tree/chrome_extension_tree.txt"], "file": "chrome_extension_tree.txt"}
    ]
    
    success_count = 0
    
    for cmd_info in tree_commands:
        target_file = Path(cmd_info["args"][-1])
        cmd = [str(brain_exe)] + cmd_info["args"]
        
        code, out, err = safe_subprocess_run(cmd, timeout=45, desc=f"Tree: {cmd_info['file']}")
        
        if code == 0:
            if target_file.exists() and target_file.stat().st_size > 0:
                log(f"   {cmd_info['file']:<30}", level="SUCCESS")
                success_count += 1
            else:
                log(f"   {cmd_info['file']:<30} (Archivo vacío)", level="ERROR")
        else:
            log(f"   {cmd_info['file']:<30} (Falló - Ver Log)", level="ERROR")

    return success_count == len(tree_commands)

def run_build_process(build_script):
    cmd = [sys.executable, str(build_script)] + sys.argv[1:]
    
    log("Iniciando PyInstaller...", level="INFO")
    
    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        env=ENV_VARS,
        encoding='utf-8',
        errors='replace'
    )
    
    while True:
        line = process.stdout.readline()
        if not line and process.poll() is not None:
            break
        if line:
            line = line.rstrip()
            log(line, level="BUILD", to_console=True)
            
    return process.poll()

def main():
    setup_log()
    log("Iniciando proceso de Build", level="INFO")
    
    if not Path("brain").exists():
        log("Ejecutar desde la raíz del proyecto.", level="ERROR")
        sys.exit(1)
    
    build_script = Path("brain/build_deploy/build_main.py")
    if not build_script.exists():
        log(f"No existe: {build_script}", level="ERROR")
        sys.exit(1)
    
    # 1. EJECUTAR EL BUILD
    exit_code = run_build_process(build_script)
    
    if exit_code != 0:
        log(f"Build falló con código: {exit_code}", level="ERROR")
        log(f"Revisa 'build.log' para detalles.", level="INFO")
        sys.exit(exit_code)
    
    # 2. LOCALIZAR BINARIO
    brain_exe = None
    possible_paths = [
        Path("installer/native/bin/win32/brain/brain.exe"),
        Path("dist/brain/brain.exe")
    ]
    
    for p in possible_paths:
        if p.exists():
            brain_exe = p
            break
            
    if not brain_exe:
        log("No se encontró el ejecutable compilado.", level="ERROR")
        sys.exit(1)
        
    log(f"Usando binario: {brain_exe}", level="INFO")
    
    # 3. GENERAR DOCS
    help_script = Path("scripts/python/generate_help_files.py")
    if help_script.exists():
        code, _, _ = safe_subprocess_run(
            [sys.executable, str(help_script), str(brain_exe)],
            timeout=60,
            desc="Generación de archivos de ayuda"
        )
        if code != 0:
            log("Falló la generación de archivos de ayuda", level="WARN")
    else:
        log(f"No se encontró el script: {help_script}", level="WARN")
    
    tree_script = Path("scripts/python/generate_tree_files.py")
    if tree_script.exists():
        code, _, _ = safe_subprocess_run(
            [sys.executable, str(tree_script), str(brain_exe)],
            timeout=120,
            desc="Generación de árboles de directorios"
        )
        if code != 0:
            log("Falló la generación de árboles de directorios", level="WARN")
    else:
        log(f"No se encontró el script: {tree_script}", level="WARN")
    
    log("Proceso finalizado.", level="SUCCESS")
    log(f"Detalles guardados en: {LOG_FILE.absolute()}", level="INFO")

if __name__ == "__main__":
    main()