import os
import shutil
import sys
from pathlib import Path

def get_target_path():
    """
    Obtiene la ruta de destino según el sistema operativo.
    """
    system = sys.platform
    
    if system == "win32":
        # Windows
        user = os.environ.get('USERNAME')
        if not user:
            raise EnvironmentError("No se pudo obtener el nombre de usuario en Windows")
        
        target = Path(f"C:/Users/{user}/AppData/Local/BloomNucleus/engine/runtime/Lib/site-packages")
        
    elif system == "darwin":
        # macOS
        user = os.environ.get('USER')
        if not user:
            raise EnvironmentError("No se pudo obtener el nombre de usuario en macOS")
        
        # Ruta típica en macOS (ajusta según sea necesario)
        target = Path(f"/Users/{user}/Library/Application Support/BloomNucleus/engine/runtime/Lib/site-packages")
        
    else:
        raise OSError(f"Sistema operativo no soportado: {system}")
    
    return target

def copy_brain_directory():
    """
    Copia el directorio brain/ al directorio de destino.
    """
    # Obtener el directorio donde está el script
    script_dir = Path(__file__).parent
    source_dir = script_dir / "brain"
    
    # Verificar que el directorio brain/ existe
    if not source_dir.exists():
        print(f"❌ Error: El directorio '{source_dir}' no existe")
        return False
    
    if not source_dir.is_dir():
        print(f"❌ Error: '{source_dir}' no es un directorio")
        return False
    
    try:
        # Obtener la ruta de destino
        target_path = get_target_path()
        target_dir = target_path / "brain"
        
        # Crear el directorio de destino si no existe
        target_path.mkdir(parents=True, exist_ok=True)
        
        # Si el directorio brain/ ya existe en el destino, eliminarlo
        if target_dir.exists():
            print(f"⚠️  El directorio '{target_dir}' ya existe. Eliminando...")
            shutil.rmtree(target_dir)
        
        # Copiar el directorio brain/
        print(f"📁 Copiando desde: {source_dir}")
        print(f"📁 Copiando hacia: {target_dir}")
        
        shutil.copytree(source_dir, target_dir)
        
        print(f"✅ Directorio copiado exitosamente")
        return True
        
    except EnvironmentError as e:
        print(f"❌ Error de entorno: {e}")
        return False
    except PermissionError as e:
        print(f"❌ Error de permisos: {e}")
        print("💡 Intenta ejecutar el script con permisos de administrador")
        return False
    except Exception as e:
        print(f"❌ Error inesperado: {e}")
        return False

if __name__ == "__main__":
    print("=" * 60)
    print("Script de copia del directorio brain/")
    print("=" * 60)
    print(f"Sistema operativo detectado: {sys.platform}")
    print()
    
    success = copy_brain_directory()
    
    print()
    print("=" * 60)
    if success:
        print("✅ Operación completada exitosamente")
    else:
        print("❌ La operación falló")
    print("=" * 60)
    
    sys.exit(0 if success else 1)