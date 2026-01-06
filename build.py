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

# Forzar UTF-8 en Windows
if sys.platform == "win32":
    import io
    if hasattr(sys.stdout, 'buffer'):
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')


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
    
    # Ejecutar
    result = subprocess.run(cmd)
    sys.exit(result.returncode)


if __name__ == "__main__":
    main()