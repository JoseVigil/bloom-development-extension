import os
import shutil
from pathlib import Path

# Paths relativos (ajustá si es necesario)
brain_root = Path(__file__).parent  # Raíz de brain/
libs_source = brain_root / 'libs'   # Fuente: brain/libs/
runtime_libs_dest = brain_root / 'runtime_libs'  # Destino: brain/runtime_libs/
config_file = runtime_libs_dest / 'libs_to_copy.txt'  # Archivo de config

def main():
    if not libs_source.exists():
        print("❌ Carpeta /libs no existe. Creala y populate con las libs.")
        return

    runtime_libs_dest.mkdir(exist_ok=True)  # Crea destino si no existe

    if not config_file.exists():
        print("⚠️ libs_to_copy.txt no existe. Crealo con las libs a copiar (una por línea).")
        return

    # Lee las libs a copiar
    with open(config_file, 'r') as f:
        libs = [line.strip() for line in f if line.strip()]

    if not libs:
        print("⚠️ No hay libs listadas en libs_to_copy.txt.")
        return

    # Limpia destino previo (opcional, para evitar acumular basura)
    for item in runtime_libs_dest.iterdir():
        if item.name != 'libs_to_copy.txt':  # No borra el config
            if item.is_dir():
                shutil.rmtree(item)
            else:
                os.remove(item)
    print("🧹 Destino runtime_libs/ limpiado.")

    # Copia solo las libs especificadas
    copied = 0
    for lib in libs:
        src_dir = libs_source / lib
        if src_dir.exists() and src_dir.is_dir():
            dest_dir = runtime_libs_dest / lib
            shutil.copytree(src_dir, dest_dir, dirs_exist_ok=True)
            print(f"✅ Copiado: {lib}")
            copied += 1
        else:
            print(f"⚠️ No encontrado: {lib} en /libs")

    if copied == len(libs):
        print("🎉 Todas las libs copiadas exitosamente a runtime_libs/.")
    else:
        print("❗ Algunas libs no se copiaron. Chequeá /libs.")

if __name__ == "__main__":
    main()