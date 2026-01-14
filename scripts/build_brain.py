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

    # =========================================================================
    # ARGUMENTOS PARA PYINSTALLER - CON FIXES CRÍTICOS
    # =========================================================================
    args = [
        str(FULL_ENTRY_POINT),
        f'--name={APP_NAME}',
        
        # Rutas de salida dirigidas a installer/native/bin/...
        f'--distpath={str(DIST_BASE)}',
        f'--workpath={str(REPO_ROOT / "build" / "temp")}',
        f'--specpath={str(REPO_ROOT / "build" / "specs")}',
        
        # =====================================================================
        # FIX CRÍTICO 1: ONEDIR EN LUGAR DE ONEFILE
        # onedir es más estable para servicios Windows
        # =====================================================================
        '--onedir',
        '--noconfirm',
        '--clean',
        
        # =====================================================================
        # FIX CRÍTICO 2: CONSOLE MODE EXPLÍCITO
        # Para servicios, --console es preferible (NSSM maneja la redirección)
        # =====================================================================
        '--console',  # Explícitamente consola (no windowed)
        
        # Inclusiones explícitas del paquete brain
        f'--paths={str(REPO_ROOT)}',
        '--collect-all=brain',
        
        # =====================================================================
        # FIX CRÍTICO 3: HIDDEN IMPORTS EXTENDIDOS
        # Agregar TODOS los módulos que podrían faltar en Session 0
        # =====================================================================
        # Core Python
        '--hidden-import=asyncio',
        '--hidden-import=asyncio.events',
        '--hidden-import=asyncio.streams',
        '--hidden-import=asyncio.protocols',
        '--hidden-import=socket',
        '--hidden-import=socketserver',
        '--hidden-import=selectors',
        '--hidden-import=ssl',
        
        # Typer y dependencias
        '--hidden-import=typer',
        '--hidden-import=typer.core',
        '--hidden-import=typer.main',
        '--hidden-import=click',
        '--hidden-import=click.core',
        
        # Rich (para outputs bonitos)
        '--hidden-import=rich',
        '--hidden-import=rich.console',
        '--hidden-import=rich.table',
        '--hidden-import=rich.progress',
        '--hidden-import=rich.traceback',
        
        # Utilidades
        '--hidden-import=colorama',
        '--hidden-import=shellingham',
        '--hidden-import=dotenv',
        
        # Logging
        '--hidden-import=logging',
        '--hidden-import=logging.handlers',
        
        # JSON y serialización
        '--hidden-import=json',
        '--hidden-import=pickle',
        
        # =====================================================================
        # FIX CRÍTICO 4: COLLECT-ALL PARA MÓDULOS PROBLEMÁTICOS
        # =====================================================================
        '--collect-all=typer',
        '--collect-all=rich',
        '--collect-all=click',
        
        # =====================================================================
        # FIX CRÍTICO 5: COPY METADATA (para pkg_resources)
        # =====================================================================
        '--copy-metadata=typer',
        '--copy-metadata=rich',
        '--copy-metadata=click',
    ]
    
    # =========================================================================
    # OPCIONES ESPECÍFICAS POR PLATAFORMA
    # =========================================================================
    if SYSTEM == "Windows":
        # En Windows, asegurar que no haya ventana emergente en servicios
        args.extend([
            '--add-data', f'{REPO_ROOT};.',  # Incluir archivos config si los hay
        ])
    
    print("\n🔧 Argumentos de PyInstaller:")
    for arg in args:
        print(f"   {arg}")
    print()
    
    # Ejecutar PyInstaller
    try:
        print("⚙️  Ejecutando PyInstaller...")
        PyInstaller.__main__.run(args)
        
        print("\n" + "="*60)
        print(f"✅ COMPILACIÓN EXITOSA")
        
        final_binary = target_dir / (f"{APP_NAME}.exe" if SYSTEM == "Windows" else APP_NAME)
        if final_binary.exists():
            print(f"📦 Binario listo en: {final_binary}")
            print(f"💉 Esto es lo que debes empaquetar en el instalador.")
            
            # ================================================================
            # FIX CRÍTICO 6: VERIFICAR _internal
            # ================================================================
            internal_dir = target_dir / "_internal"
            if internal_dir.exists():
                file_count = len(list(internal_dir.rglob('*')))
                print(f"✅ Carpeta _internal verificada ({file_count} archivos)")
            else:
                print(f"⚠️  ADVERTENCIA: No se encontró carpeta _internal")
                print(f"   Esto puede causar crashes al arrancar el servicio")
            
        else:
            print(f"⚠️ El proceso terminó pero no veo el binario en: {final_binary}")
        
        print("="*60)
        
        # ====================================================================
        # FIX CRÍTICO 7: TEST RÁPIDO DEL BINARIO
        # ====================================================================
        print("\n🧪 Probando binario compilado...")
        try:
            import subprocess
            result = subprocess.run(
                [str(final_binary), '--version'],
                capture_output=True,
                text=True,
                timeout=5
            )
            
            if result.returncode == 0:
                print(f"✅ Binario funciona correctamente")
                print(f"   Output: {result.stdout.strip()}")
            else:
                print(f"⚠️  Binario devolvió código {result.returncode}")
                print(f"   Error: {result.stderr}")
        except Exception as e:
            print(f"⚠️  No se pudo probar el binario: {e}")
        
    except Exception as e:
        print(f"\n❌ ERROR FATAL DURANTE PYINSTALLER: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    build()