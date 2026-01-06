import PyInstaller.__main__
import platform
import shutil
import os
from pathlib import Path

# ================= CONFIGURACIÓN DE RUTAS =================

# 1. Ubicación de este script (.../bloom-development-extension/scripts)
SCRIPT_DIR = Path(__file__).resolve().parent

# 2. Raíz del Proyecto (.../bloom-development-extension)
REPO_ROOT = SCRIPT_DIR.parent

# 3. Entry Point en la raíz
ENTRY_POINT = "brain_cli.py"
FULL_ENTRY_POINT = REPO_ROOT / ENTRY_POINT

APP_NAME = "brain"

# ================= DETECCIÓN DE SISTEMA Y DESTINO =================
SYSTEM = platform.system()

# El destino es: .../bloom-development-extension/installer/native/bin/win32
INSTALLER_NATIVE_BIN = REPO_ROOT / "installer" / "native" / "bin"

if SYSTEM == "Windows":
    DIST_BASE = INSTALLER_NATIVE_BIN / "win32"
elif SYSTEM == "Darwin": 
    DIST_BASE = INSTALLER_NATIVE_BIN / "darwin" / "x64"
else:
    DIST_BASE = INSTALLER_NATIVE_BIN / "linux"

def build():
    print(f"🚀 Iniciando compilación de {APP_NAME} para {SYSTEM}...")
    print("-" * 60)
    print(f"📂 Repo Root:      {REPO_ROOT}")
    print(f"📂 Entry Point:    {FULL_ENTRY_POINT}")
    print(f"📂 Output Target:  {DIST_BASE}")
    print("-" * 60)

    # Verificaciones de seguridad
    if not FULL_ENTRY_POINT.exists():
        print(f"❌ ERROR: No encuentro {ENTRY_POINT}.")
        print(f"   Buscado en: {FULL_ENTRY_POINT}")
        return

    if not DIST_BASE.exists():
        print(f"⚠️  El directorio destino no existe, se creará: {DIST_BASE}")

    # Limpiar compilación previa específica de brain
    target_dir = DIST_BASE / APP_NAME
    if target_dir.exists():
        print(f"🧹 Limpiando versión anterior en {target_dir}...")
        try:
            shutil.rmtree(target_dir)
        except Exception as e:
            print(f"⚠️ No se pudo limpiar (¿archivo en uso?): {e}")

    # Argumentos para PyInstaller
    args = [
        str(FULL_ENTRY_POINT),
        f'--name={APP_NAME}',
        
        # Rutas de salida dirigidas a installer/native/bin/...
        f'--distpath={str(DIST_BASE)}',
        f'--workpath={str(REPO_ROOT / "build" / "temp")}',
        f'--specpath={str(REPO_ROOT / "build" / "specs")}',
        
        # Opciones
        '--onedir',      # Genera una carpeta (mejor performance que onefile)
        '--noconfirm',
        '--clean',
        
        # Inclusiones explícitas del paquete brain
        f'--paths={str(REPO_ROOT)}', # Asegura que encuentre el módulo brain
        '--collect-all=brain',       # Recolecta todo el contenido del paquete
        
        # Librerías ocultas comunes
        '--hidden-import=typer',
        '--hidden-import=rich',
        '--hidden-import=colorama',
        '--hidden-import=shellingham',
    ]
    
    # Ejecutar PyInstaller
    try:
        PyInstaller.__main__.run(args)
        
        print("\n" + "="*50)
        print(f"✅ COMPILACIÓN EXITOSA")
        
        final_binary = target_dir / (f"{APP_NAME}.exe" if SYSTEM == "Windows" else APP_NAME)
        if final_binary.exists():
            print(f"📦 Binario listo en: {final_binary}")
            print(f"👉 Esto es lo que debes empaquetar en el instalador.")
        else:
            print(f"⚠️ El proceso terminó pero no veo el binario en: {final_binary}")
        print("="*50)
        
    except Exception as e:
        print(f"\n❌ ERROR FATAL DURANTE PYINSTALLER: {e}")

if __name__ == "__main__":
    build()