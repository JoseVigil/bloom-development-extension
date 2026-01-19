#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Brain CLI - Generador de Archivos de Ayuda
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

def generate_help_files(brain_exe):
    """Genera archivos de ayuda usando el ejecutable brain."""
    # Determinar la ruta raíz del proyecto (2 niveles arriba desde scripts/python/)
    project_root = Path(__file__).parent.parent.parent
    help_dir = project_root / "brain" / "help"
    help_dir.mkdir(parents=True, exist_ok=True)
    
    log("\nGenerando archivos de ayuda...", level="INFO")
    
    help_commands = [
        {"args": ["--help"], "file": "help.txt", "desc": "Terminal UI"},
        {"args": ["--help", "--full"], "file": "help-full.txt", "desc": "Terminal UI Full"},
        {"args": ["--json", "--help"], "file": "brain-legacy.json", "desc": "JSON Legacy"},
        {"args": ["--ai", "--help"], "file": "brain-ai-schema.json", "desc": "AI Schema"},
        {"args": ["--ai", "--help", "--full"], "file": "brain-ai-full.json", "desc": "AI Full", "optional": True}
    ]
    
    success_count = 0
    
    for cmd_info in help_commands:
        file_path = help_dir / cmd_info["file"]
        cmd = [str(brain_exe)] + cmd_info["args"]
        
        # Mostrar comando en consola
        cmd_str = " ".join(cmd)
        log(f"   Ejecutando: {cmd_str}", level="INFO")
        
        code, out, err = safe_subprocess_run(cmd, timeout=15, desc=f"Help: {cmd_info['file']}")
        
        output = out or err
        
        if output and code == 0:
            file_path.write_text(output, encoding='utf-8', errors='replace')
            log(f"   {cmd_info['file']:<25} ({cmd_info['desc']})", level="SUCCESS")
            success_count += 1
        elif cmd_info.get("optional"):
            log(f"   {cmd_info['file']:<25} (Opcional - Skip)", level="WARN")
        else:
            log(f"   {cmd_info['file']:<25} (Fallo)", level="ERROR")
            
    return success_count > 0

def main():
    if len(sys.argv) < 2:
        log("Uso: generate_help_files.py <ruta_al_ejecutable_brain>", level="ERROR")
        sys.exit(1)
    
    brain_exe = Path(sys.argv[1])
    
    if not brain_exe.exists():
        log(f"No se encontró el ejecutable: {brain_exe}", level="ERROR")
        sys.exit(1)
    
    success = generate_help_files(brain_exe)
    
    if not success:
        log("No se generó ningún archivo de ayuda", level="ERROR")
        sys.exit(1)
    
    log("Archivos de ayuda generados exitosamente", level="SUCCESS")
    sys.exit(0)

if __name__ == "__main__":
    main()