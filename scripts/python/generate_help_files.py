#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Brain CLI - Generador de Archivos de Ayuda
Genera archivos de ayuda ejecutando diferentes combinaciones de argumentos
en el ejecutable brain.exe y los guarda en la carpeta indicada.
"""
import sys
import argparse
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
    file_msg = f"[{timestamp}] [{level:8}] {msg}"
    
    # Escribir en archivo (siempre)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(file_msg + "\n")
    except Exception as e:
        print(f"!!! Error escribiendo log: {e}", file=sys.stderr)

    # Escribir en consola (saneado)
    if to_console:
        prefix = {
            "ERROR":   "❌ ",
            "WARN":    "⚠️  ",
            "SUCCESS": "✅ ",
            "INFO":    "ℹ️  ",
        }.get(level, "")
        
        console_msg = f"{prefix}{msg}"
        try:
            print(console_msg, flush=True)
        except UnicodeEncodeError:
            safe_msg = console_msg.encode('ascii', 'replace').decode('ascii')
            print(safe_msg, flush=True)


# ========================================
# CONFIGURACIÓN DE ENTORNO
# ========================================
import os
import io

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


def safe_subprocess_run(cmd, timeout=None, cwd=None, desc=""):
    """Ejecuta comando y loguea todo."""
    log(f"Ejecutando: {' '.join(str(x) for x in cmd)}", level="DEBUG", to_console=False)
    
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            env=ENV_VARS,
            timeout=timeout,
            cwd=cwd,
            encoding='utf-8',
            errors='replace',
            text=True
        )
        
        stdout = result.stdout.strip() if result.stdout else ""
        stderr = result.stderr.strip() if result.stderr else ""
        
        if stdout:
            log(f"STDOUT:\n{stdout}", level="DEBUG", to_console=False)
        if stderr:
            log(f"STDERR:\n{stderr}", level="DEBUG" if result.returncode == 0 else "ERROR", to_console=False)
        
        if result.returncode != 0:
            log(f"Fallo en '{desc}' → código {result.returncode}", level="ERROR", to_console=False)
        
        return result.returncode, stdout, stderr
        
    except subprocess.TimeoutExpired:
        log(f"Timeout en '{desc}' después de {timeout}s", level="ERROR")
        return -1, "", "Timeout"
    except Exception as e:
        log(f"Excepción en '{desc}': {e}", level="ERROR")
        return -1, "", str(e)


def generate_help_files(brain_exe: Path, help_dir: Path):
    """Genera archivos de ayuda ejecutando el binario con diferentes argumentos."""
    help_dir.mkdir(parents=True, exist_ok=True)
    log(f"Generando archivos de ayuda en → {help_dir}", level="INFO")
    
    help_commands = [
        {"args": ["--help"],                  "file": "help.txt",            "desc": "Ayuda básica (Terminal UI)"},
        {"args": ["--help", "--full"],        "file": "help-full.txt",       "desc": "Ayuda completa"},
        {"args": ["--json", "--help"],        "file": "brain-legacy.json",   "desc": "Formato JSON legacy"},
        {"args": ["--ai", "--help"],          "file": "brain-ai-schema.json","desc": "Esquema AI"},
        {"args": ["--ai", "--help", "--full"],"file": "brain-ai-full.json",  "desc": "Esquema AI completo", "optional": True},
    ]
    
    success_count = 0
    
    for cmd_info in help_commands:
        file_path = help_dir / cmd_info["file"]
        cmd = [str(brain_exe)] + cmd_info["args"]
        
        log(f"   {cmd_info['desc']:<25} → {file_path.name}", level="INFO")
        
        code, out, err = safe_subprocess_run(
            cmd,
            timeout=20,
            desc=f"Generar {cmd_info['file']}"
        )
        
        output = out or err
        
        if code == 0 and output:
            try:
                file_path.write_text(output, encoding='utf-8', errors='replace')
                log(f"   {cmd_info['file']:<25} generado correctamente", level="SUCCESS")
                success_count += 1
            except Exception as e:
                log(f"   Error al escribir {cmd_info['file']}: {e}", level="ERROR")
        elif cmd_info.get("optional"):
            log(f"   {cmd_info['file']:<25} (opcional - no generado)", level="WARN")
        else:
            log(f"   {cmd_info['file']:<25} FALLÓ (código {code})", level="ERROR")
    
    return success_count > 0


def main():
    parser = argparse.ArgumentParser(
        description="Genera archivos de documentación de ayuda para Brain CLI"
    )
    parser.add_argument(
        "executable",
        type=Path,
        help="Ruta al ejecutable brain.exe"
    )
    parser.add_argument(
        "--output-dir", "-o",
        type=Path,
        default=None,
        help="Carpeta donde guardar los archivos de ayuda (por defecto: brain/help en raíz del proyecto)"
    )
    
    args = parser.parse_args()
    
    brain_exe = args.executable.resolve()
    if not brain_exe.is_file():
        log(f"No se encontró el ejecutable: {brain_exe}", level="ERROR")
        sys.exit(1)
    
    if args.output_dir:
        help_dir = args.output_dir.resolve()
    else:
        # Fallback - comportamiento original
        project_root = Path(__file__).resolve().parent.parent.parent
        help_dir = project_root / "brain" / "help"
    
    success = generate_help_files(brain_exe, help_dir)
    
    if not success:
        log("No se generó ningún archivo de ayuda correctamente", level="ERROR")
        sys.exit(2)
    
    log("Archivos de ayuda generados exitosamente", level="SUCCESS")
    sys.exit(0)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log("Ejecución interrumpida por el usuario", level="WARN")
        sys.exit(130)
    except Exception as e:
        log(f"Error inesperado: {e}", level="ERROR")
        import traceback
        log(traceback.format_exc(), level="ERROR")
        sys.exit(1)