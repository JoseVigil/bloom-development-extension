#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Brain CLI - Build Script (Simplificado)
Wrapper que ejecuta los scripts de brain/build_deploy/

Uso:
    python build.py              # Compilación completa
    python build.py --clean      # Limpieza + compilación
    python build.py --skip-gen   # Solo compilar (sin regenerar loader)
"""
import os
import sys
import subprocess
from pathlib import Path
import io

# ========================================
# FORZAR UTF-8 EN TODO WINDOWS
# ========================================
if sys.platform == "win32":
    # 1. Forzar consola a UTF-8
    if hasattr(sys.stdout, 'buffer'):
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
    
    # 2. Variables de entorno para subprocesos
    os.environ['PYTHONIOENCODING'] = 'utf-8'
    os.environ['PYTHONUTF8'] = '1'
    
    # 3. Forzar codepage de consola (solo si es posible)
    try:
        import ctypes
        kernel32 = ctypes.windll.kernel32
        kernel32.SetConsoleCP(65001)
        kernel32.SetConsoleOutputCP(65001)
    except:
        pass  # Si falla, continuamos con las otras configuraciones


def generate_help_files(brain_exe):
    """
    Genera todos los archivos de ayuda en brain/help/
    
    Archivos generados:
    - help.txt: Ayuda estándar (rich terminal UI)
    - brain-legacy.json: Formato JSON legacy para documentación
    - brain-ai-schema.json: OpenAI Function Calling Schema
    - brain-ai-full.json: Schema AI completo
    """
    help_dir = Path("brain/help")
    help_dir.mkdir(parents=True, exist_ok=True)
    
    print("\n[INFO] Generando archivos de ayuda...")
    
    help_commands = [
        {
            "args": ["--help"],
            "file": "help.txt",
            "desc": "Terminal UI (rich)"
        },
        {
            "args": ["--json", "--help"],
            "file": "brain-legacy.json",
            "desc": "JSON Legacy"
        },
        {
            "args": ["--ai", "--help"],
            "file": "brain-ai-schema.json",
            "desc": "AI Schema (OpenAI)"
        },
        {
            "args": ["--ai", "--help", "--full"],
            "file": "brain-ai-full.json",
            "desc": "AI Full Schema",
            "optional": True
        }
    ]
    
    generated = []
    failed = []
    
    for cmd_info in help_commands:
        file_path = help_dir / cmd_info["file"]
        cmd = [str(brain_exe)] + cmd_info["args"]
        
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                encoding='utf-8',
                errors='replace',
                timeout=10
            )
            
            # Usar stdout si está disponible, sino stderr
            output = result.stdout if result.stdout.strip() else result.stderr
            
            if output.strip():
                file_path.write_text(output, encoding='utf-8')
                generated.append(cmd_info["file"])
                print(f"   ✓ {cmd_info['file']:<25} ({cmd_info['desc']})")
            elif cmd_info.get("optional"):
                print(f"   ⊘ {cmd_info['file']:<25} (no disponible)")
            else:
                failed.append(cmd_info["file"])
                print(f"   ✗ {cmd_info['file']:<25} (sin output)")
                
        except subprocess.TimeoutExpired:
            if not cmd_info.get("optional"):
                failed.append(cmd_info["file"])
            print(f"   ✗ {cmd_info['file']:<25} (timeout)")
        except Exception as e:
            if not cmd_info.get("optional"):
                failed.append(cmd_info["file"])
            print(f"   ✗ {cmd_info['file']:<25} ({str(e)[:30]})")
    
    if generated:
        print(f"\n[OK] Generados {len(generated)} archivo(s) en: {help_dir}/")
    
    if failed:
        print(f"[WARN] No se pudieron generar: {', '.join(failed)}")
    
    return len(failed) == 0


def generate_tree_files(brain_exe):
    """
    Genera árboles de directorios usando brain filesystem tree
    
    Archivos generados en tree/:
    - plugin_tree.txt: Árbol completo del plugin
    - installer_tree.txt: Árbol del instalador
    - brain_tree.txt: Árbol del CLI Brain
    - electron_tree.txt: Árbol de la app Electron
    - webview_tree.txt: Árbol del webview
    - chrome_extension_tree.txt: Árbol de la extensión Chrome
    """
    tree_dir = Path("tree")
    tree_dir.mkdir(parents=True, exist_ok=True)
    
    print("\n[INFO] Generando árboles de directorios...")
    
    tree_commands = [
        {
            "args": ["filesystem", "tree", "src", "installer", "webview", "brain", 
                     "contracts", "package.json", "tsconfig.json", "-o", "tree/plugin_tree.txt"],
            "file": "plugin_tree.txt",
            "desc": "Plugin completo"
        },
        {
            "args": ["filesystem", "tree", "installer", "-o", "tree/installer_tree.txt"],
            "file": "installer_tree.txt",
            "desc": "Instalador"
        },
        {
            "args": ["filesystem", "tree", "brain", "-o", "tree/brain_tree.txt"],
            "file": "brain_tree.txt",
            "desc": "Brain CLI"
        },
        {
            "args": ["filesystem", "tree", "installer/electron-app", "-o", "tree/electron_tree.txt"],
            "file": "electron_tree.txt",
            "desc": "Electron App"
        },
        {
            "args": ["filesystem", "tree", "webview", "-o", "tree/webview_tree.txt"],
            "file": "webview_tree.txt",
            "desc": "Webview"
        },
        {
            "args": ["filesystem", "tree", "installer/chrome-extension", "-o", "tree/chrome_extension_tree.txt"],
            "file": "chrome_extension_tree.txt",
            "desc": "Chrome Extension"
        }
    ]
    
    generated = []
    failed = []
    
    for cmd_info in tree_commands:
        file_path = tree_dir / cmd_info["file"]
        cmd = [str(brain_exe)] + cmd_info["args"]
        
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                encoding='utf-8',
                errors='replace',
                timeout=30  # Trees pueden tardar más
            )
            
            if result.returncode == 0:
                # Verificar que el archivo se haya creado
                if file_path.exists() and file_path.stat().st_size > 0:
                    generated.append(cmd_info["file"])
                    print(f"   ✓ {cmd_info['file']:<30} ({cmd_info['desc']})")
                else:
                    failed.append(cmd_info["file"])
                    print(f"   ✗ {cmd_info['file']:<30} (archivo vacío o no creado)")
            else:
                failed.append(cmd_info["file"])
                error_msg = result.stderr[:50] if result.stderr else "error desconocido"
                print(f"   ✗ {cmd_info['file']:<30} ({error_msg})")
                
        except subprocess.TimeoutExpired:
            failed.append(cmd_info["file"])
            print(f"   ✗ {cmd_info['file']:<30} (timeout)")
        except Exception as e:
            failed.append(cmd_info["file"])
            print(f"   ✗ {cmd_info['file']:<30} ({str(e)[:30]})")
    
    if generated:
        print(f"\n[OK] Generados {len(generated)} árbol(es) en: {tree_dir}/")
    
    if failed:
        print(f"[WARN] No se pudieron generar: {', '.join(failed)}")
    
    return len(failed) == 0


def run_build_silent(cmd):
    """
    Ejecuta el build mostrando solo mensajes importantes.
    Filtra el ruido visual del output.
    """
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        encoding='utf-8',
        errors='replace'
    )
    
    # Combinar stdout y stderr
    full_output = result.stdout + result.stderr
    
    # Palabras clave que indican mensajes importantes
    important_keywords = [
        "[ERROR]",
        "[CRITICAL]",
        "[WARN]",
        "ERROR:",
        "WARNING:",
        "Failed",
        "Success",
        "✓",
        "✗",
        "Compilando",
        "Generando",
        "Copiando"
    ]
    
    # Palabras clave que indican ruido (help, usage, etc)
    noise_keywords = [
        "usage:",
        "positional arguments:",
        "optional arguments:",
        "options:",
        "show this help",
        "  -h, --help",
        "  --version"
    ]
    
    lines = full_output.split('\n')
    
    for line in lines:
        line_lower = line.lower()
        
        # Saltar líneas de ruido
        if any(keyword.lower() in line_lower for keyword in noise_keywords):
            continue
        
        # Mostrar líneas importantes o no vacías
        if line.strip() and (
            any(keyword.lower() in line_lower for keyword in important_keywords)
            or len(line.strip()) < 100  # Líneas cortas probablemente son importantes
        ):
            print(line)
    
    return result.returncode


def main():
    """Ejecuta el script de build desde brain/build_deploy/"""
    
    # Verificar que estamos en el directorio correcto
    if not Path("brain").exists():
        print("[ERROR] Debe ejecutar este script desde la raíz del proyecto")
        print("        (debe existir la carpeta 'brain/')")
        sys.exit(1)
    
    # Ruta al script real
    build_script = Path("brain/build_deploy/build_main.py")
    
    if not build_script.exists():
        print(f"[ERROR] No existe: {build_script}")
        print("\nAsegúrate de tener la siguiente estructura:")
        print("  brain/")
        print("  └── build_deploy/")
        print("      └── build_main.py")
        sys.exit(1)
    
    # Pasar todos los argumentos al script real
    cmd = [sys.executable, str(build_script)] + sys.argv[1:]
    
    print("[BUILD] Compilando Brain CLI...")
    exit_code = run_build_silent(cmd)
    
    if exit_code != 0:
        print(f"\n[ERROR] Build falló con código: {exit_code}")
        sys.exit(exit_code)
    
    print("[BUILD] Compilación exitosa\n")
    
    # Buscar el ejecutable compilado
    possible_paths = [
        Path("dist/brain/brain.exe"),
        Path("dist/brain"),
        Path("build/brain/brain.exe"),
        Path("build/brain")
    ]
    
    brain_exe = None
    for path in possible_paths:
        if path.exists():
            brain_exe = path
            break
    
    if not brain_exe:
        print("\n[WARN] No se encontró el ejecutable compilado")
        print("       Búsqueda en: dist/brain/, build/brain/")
        sys.exit(1)
    
    # Generar archivos de ayuda
    help_success = generate_help_files(brain_exe)
    if not help_success:
        print("\n[WARN] Algunos archivos de ayuda no se generaron correctamente")
    
    # Generar árboles de directorios
    tree_success = generate_tree_files(brain_exe)
    if not tree_success:
        print("\n[WARN] Algunos árboles no se generaron correctamente")
    
    sys.exit(exit_code)


if __name__ == "__main__":
    main()