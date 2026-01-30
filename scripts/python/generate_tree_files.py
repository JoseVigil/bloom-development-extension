#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Brain CLI - Generador de Árboles de Directorios
"""
import sys
import subprocess
from pathlib import Path
from datetime import datetime

# ========================================
# SISTEMA DE LOGGING
# ========================================
LOG_FILE = Path("build.log")

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
import os
import io

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
    """Genera árboles de directorios usando el ejecutable brain."""
    # Determinar la ruta raíz del proyecto (2 niveles arriba desde scripts/python/)
    project_root = Path(__file__).parent.parent.parent
    tree_dir = project_root / "tree"
    tree_dir.mkdir(parents=True, exist_ok=True)
    
    log("\nGenerando árboles de directorios...", level="INFO")
    
    tree_commands = [
        {"args": ["filesystem", "tree", "src", "installer", "brain", "-o", "tree/plugin_tree.txt"], "file": "plugin_tree.txt"},
        {"args": ["filesystem", "tree", "installer", "-o", "tree/installer_tree.txt"], "file": "installer_tree.txt"},
        {"args": ["filesystem", "tree", "brain", "-o", "tree/brain_tree.txt"], "file": "brain_tree.txt"},
        {"args": ["filesystem", "tree", "installer/electron-app", "-o", "tree/electron_tree.txt"], "file": "electron_tree.txt"},
        {"args": ["filesystem", "tree", "installer/sentinel", "-o", "tree/sentinel_tree.txt"], "file": "sentinel_tree.txt"},
        {"args": ["filesystem", "tree", "installer/nucleus", "-o", "tree/nucleus_tree.txt"], "file": "nucleus_tree.txt"},
        {"args": ["filesystem", "tree", "webview", "-o", "tree/webview_tree.txt"], "file": "webview_tree.txt"},
        {"args": ["filesystem", "tree", "installer/chrome-extension", "-o", "tree/chrome_extension_tree.txt"], "file": "chrome_extension_tree.txt"},
        {"args": ["filesystem", "tree", "C:/Users/josev/AppData/Local/BloomNucleus", "-o", "tree/appdata_tree.txt"], "file": "appdata_tree.txt"}
    ]
    
    success_count = 0
    
    for cmd_info in tree_commands:
        target_file = project_root / cmd_info["args"][-1]
        cmd = [str(brain_exe)] + cmd_info["args"]
        
        # Mostrar comando en consola
        cmd_str = " ".join(cmd)
        log(f"   Ejecutando: {cmd_str}", level="INFO")
        
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

def main():
    if len(sys.argv) < 2:
        log("Uso: generate_tree_files.py <ruta_al_ejecutable_brain>", level="ERROR")
        sys.exit(1)
    
    brain_exe = Path(sys.argv[1])
    
    if not brain_exe.exists():
        log(f"No se encontró el ejecutable: {brain_exe}", level="ERROR")
        sys.exit(1)
    
    success = generate_tree_files(brain_exe)
    
    if not success:
        log("Fallaron algunos árboles de directorios", level="ERROR")
        sys.exit(1)
    
    log("Árboles de directorios generados exitosamente", level="SUCCESS")
    sys.exit(0)

if __name__ == "__main__":
    main()