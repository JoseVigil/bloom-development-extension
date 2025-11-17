import os
import shutil
import argparse
import logging

# Configura logging básico
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def sync_directories(origin, dest, sync=False, dry_run=False):
    if not os.path.isdir(origin):
        raise ValueError(f"Origen no es un directorio válido: {origin}")
    if not os.path.isdir(dest):
        raise ValueError(f"Destino no es un directorio válido: {dest}")
    
    logging.info(f"Procesando sync de {origin} a {dest}. Modo sync: {sync}, Dry-run: {dry_run}")
    
    # Copiar y sobrescribir archivos del origen al destino
    for root, dirs, files in os.walk(origin):
        rel_root = os.path.relpath(root, origin)
        dest_root = os.path.join(dest, rel_root)
        
        # Crear dirs en destino si no existen
        if not os.path.exists(dest_root):
            if dry_run:
                logging.info(f"[Dry-run] Crear dir: {dest_root}")
            else:
                os.makedirs(dest_root)
                logging.info(f"Creado dir: {dest_root}")
        
        for file in files:
            src_file = os.path.join(root, file)
            dest_file = os.path.join(dest_root, file)
            if dry_run:
                if os.path.exists(dest_file):
                    logging.info(f"[Dry-run] Sobrescribir: {dest_file}")
                else:
                    logging.info(f"[Dry-run] Copiar nuevo: {dest_file}")
            else:
                shutil.copy2(src_file, dest_file)  # copy2 preserva metadata
                logging.info(f"Copiado/Sobrescrito: {dest_file}")
    
    # Si modo sync, eliminar archivos/dirs en destino no presentes en origen
    if sync:
        origin_paths = set()
        for root, dirs, files in os.walk(origin):
            rel_root = os.path.relpath(root, origin)
            for file in files:
                origin_paths.add(os.path.normpath(os.path.join(rel_root, file)))
            for dir in dirs:
                origin_paths.add(os.path.normpath(os.path.join(rel_root, dir)))
        
        for root, dirs, files in os.walk(dest, topdown=False):  # bottom-up para eliminar dirs
            rel_root = os.path.relpath(root, dest)
            for file in files:
                rel_path = os.path.normpath(os.path.join(rel_root, file))
                if rel_path not in origin_paths:
                    dest_file = os.path.join(root, file)
                    if dry_run:
                        logging.info(f"[Dry-run] Eliminar archivo extra: {dest_file}")
                    else:
                        os.remove(dest_file)
                        logging.info(f"Eliminado archivo extra: {dest_file}")
            for dir in dirs:
                rel_path = os.path.normpath(os.path.join(rel_root, dir))
                if rel_path not in origin_paths:
                    dest_dir = os.path.join(root, dir)
                    if dry_run:
                        logging.info(f"[Dry-run] Eliminar dir extra: {dest_dir}")
                    else:
                        shutil.rmtree(dest_dir)
                        logging.info(f"Eliminado dir extra: {dest_dir}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Sincroniza directorios: copia de origen a destino con overwrite, opcional sync (elimina extras).")
    parser.add_argument('--origin', required=True, help="Path al directorio de origen (e.g., /path/to/src_origin)")
    parser.add_argument('--dest', required=True, help="Path al directorio de destino (e.g., /path/to/src_dest)")
    parser.add_argument('--sync', action='store_true', help="Modo sync: elimina archivos/dirs en dest no presentes en origin")
    parser.add_argument('--dry-run', action='store_true', help="Simula acciones sin modificar archivos")
    args = parser.parse_args()
    
    try:
        sync_directories(args.origin, args.dest, args.sync, args.dry_run)
        logging.info("Operación completada.")
    except Exception as e:
        logging.error(f"Error: {e}")
