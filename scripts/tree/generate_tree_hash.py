import os
import sys
import json
import hashlib
from datetime import datetime

def compute_md5(filepath, block_size=8192):
    """
    Calcula el hash MD5 de un archivo.
    Importado desde fileToMD5.py para mantener independencia.
    
    Args:
        filepath (str): Ruta del archivo
        block_size (int): Tamaño del bloque de lectura en bytes
        
    Returns:
        str: Hash MD5 en formato hexadecimal o None si falla
    """
    try:
        md5_hash = hashlib.md5()
        
        with open(filepath, 'rb') as f:
            while True:
                data = f.read(block_size)
                if not data:
                    break
                md5_hash.update(data)
        
        return md5_hash.hexdigest()
        
    except (FileNotFoundError, PermissionError, Exception):
        return None


def compute_directory_hash(files_dict):
    """
    Calcula el hash MD5 de un directorio basado en los hashes de sus archivos.
    
    Args:
        files_dict (dict): Diccionario con rutas de archivos y sus hashes
        
    Returns:
        str: Hash MD5 del directorio
    """
    combined = "".join(sorted(files_dict.values()))
    return hashlib.md5(combined.encode()).hexdigest()


def build_tree(path, prefix="", is_last=True, use_hash=False, file_hashes=None, base_path=""):
    """
    Construye el árbol de directorios con hashes opcionales.
    
    Args:
        path: Ruta del archivo o directorio
        prefix: Prefijo para la indentación
        is_last: Si es el último elemento del nivel
        use_hash: Si debe calcular y mostrar hashes
        file_hashes: Diccionario para almacenar los hashes
        base_path: Ruta base para calcular rutas relativas
    """
    name = os.path.basename(path.rstrip(os.sep))
    connector = "└── " if is_last else "├── "
    
    # Calcular ruta relativa
    if base_path:
        try:
            rel_path = os.path.relpath(path, base_path)
        except ValueError:
            rel_path = path
    else:
        rel_path = path

    tree_str = prefix + connector + name
    
    if os.path.isdir(path):
        tree_str += "/"
        if use_hash and file_hashes is not None:
            # Placeholder para hash de directorio (se calculará después)
            tree_str += " [DIR]"
    else:
        # Es un archivo
        if use_hash and file_hashes is not None:
            file_hash = compute_md5(path)
            if file_hash:
                file_hashes[rel_path] = file_hash
                # Formato alineado con puntos
                padding = max(0, 50 - len(prefix) - len(connector) - len(name))
                tree_str += " " + "." * padding + " " + file_hash[:16]
    
    tree_str += "\n"

    if not os.path.isdir(path):
        return tree_str

    try:
        entries = sorted(os.listdir(path))
    except Exception:
        return tree_str

    new_prefix = prefix + ("    " if is_last else "│   ")

    for i, entry in enumerate(entries):
        full = os.path.join(path, entry)
        is_last_entry = (i == len(entries) - 1)
        tree_str += build_tree(full, new_prefix, is_last_entry, use_hash, file_hashes, base_path)

    return tree_str


def calculate_directory_hashes(paths, file_hashes):
    """
    Calcula los hashes de todos los directorios basándose en sus archivos.
    
    Args:
        paths: Lista de rutas procesadas
        file_hashes: Diccionario con hashes de archivos
        
    Returns:
        dict: Diccionario con hashes de directorios
    """
    dir_hashes = {}
    
    # Agrupar archivos por directorio
    dir_files = {}
    for file_path, file_hash in file_hashes.items():
        dir_name = os.path.dirname(file_path)
        if dir_name:
            if dir_name not in dir_files:
                dir_files[dir_name] = {}
            dir_files[dir_name][file_path] = file_hash
    
    # Calcular hash de cada directorio
    for dir_path, files in dir_files.items():
        dir_hashes[dir_path] = compute_directory_hash(files)
    
    return dir_hashes


def generate_tree(output_file, paths, use_hash=False):
    """
    Genera el árbol de directorios y opcionalmente los hashes.
    
    Args:
        output_file: Archivo de salida para el árbol visual
        paths: Lista de rutas a procesar
        use_hash: Si debe generar hashes
    """
    final_output = ""
    file_hashes = {} if use_hash else None
    dir_hashes = {} if use_hash else None
    
    # Determinar la ruta base (directorio actual)
    base_path = os.getcwd()
    
    # Solo el nombre del directorio actual
    root = os.path.basename(base_path)
    
    if use_hash:
        final_output += f"{root}/\n"
    else:
        final_output += f"{root}/\n"

    # Construir árbol
    for i, p in enumerate(paths):
        is_last = (i == len(paths) - 1)
        final_output += build_tree(p, prefix="", is_last=is_last, use_hash=use_hash, 
                                   file_hashes=file_hashes, base_path=base_path)

    # Si usamos hash, calcular hashes adicionales
    if use_hash and file_hashes:
        # Calcular hashes de directorios
        dir_hashes = calculate_directory_hashes(paths, file_hashes)
        
        # Calcular hash global del proyecto
        project_hash = compute_directory_hash(file_hashes)
        
        # Agregar información al árbol visual
        header = f"\nPROJECT_HASH: {project_hash}\n"
        header += f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
        header += f"Total files: {len(file_hashes)}\n"
        header += f"Total directories: {len(dir_hashes)}\n"
        header += "=" * 70 + "\n\n"
        
        final_output = header + final_output
        
        # Agregar información de directorios al final
        if dir_hashes:
            final_output += "\n" + "=" * 70 + "\n"
            final_output += "DIRECTORY HASHES:\n"
            for dir_path, dir_hash in sorted(dir_hashes.items()):
                final_output += f"  {dir_path}/ → {dir_hash}\n"
    
    # Limpiar saltos de línea múltiples
    final_output = "\n".join([line for line in final_output.split("\n")])

    # Guardar árbol visual
    with open(output_file, "w", encoding="utf-8") as f:
        f.write(final_output)

    print(f"✓ Árbol generado: {output_file}")

    # Si usamos hash, generar archivo JSON
    if use_hash and file_hashes:
        json_file = output_file.rsplit('.', 1)[0] + '.json'
        
        json_data = {
            "snapshot": {
                "project_hash": project_hash,
                "timestamp": datetime.now().isoformat(),
                "root": root,
                "base_path": base_path
            },
            "files": file_hashes,
            "directories": dir_hashes,
            "statistics": {
                "total_files": len(file_hashes),
                "total_directories": len(dir_hashes)
            }
        }
        
        with open(json_file, "w", encoding="utf-8") as f:
            json.dump(json_data, f, indent=2, ensure_ascii=False)
        
        print(f"✓ Metadata JSON generado: {json_file}")
        print(f"\n📊 Project Hash: {project_hash}")


if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] in ['-h', '--help']:
        print("Tree Generator - Genera diagramas de árbol de directorios")
        print("\nUso: python tree_custom.py [--hash] <archivo_salida.txt> <ruta1> <ruta2> ...")
        print("\nParámetros:")
        print("  --hash               - [OPCIONAL] Calcula y muestra hashes MD5")
        print("  archivo_salida.txt   - Archivo donde se guardará el árbol")
        print("  ruta1, ruta2, ...    - Directorios/archivos a incluir en el árbol")
        print("\nEjemplos:")
        print("  python tree_custom.py arbol.txt .")
        print("  python tree_custom.py --hash arbol.txt src package.json")
        print("  python tree_custom.py --hash salida.txt src tests docs")
        print("\nCon --hash se generan dos archivos:")
        print("  - archivo_salida.txt: Árbol visual con hashes")
        print("  - archivo_salida.json: Metadata estructurada para AI/máquinas")
        sys.exit(1)

    # Detectar flag --hash
    use_hash = False
    args = sys.argv[1:]
    
    if args[0] == '--hash':
        use_hash = True
        args = args[1:]
    
    if len(args) < 2:
        print("Error: Se requieren al menos 2 argumentos (archivo de salida y una ruta)")
        print("Use --help para ver ejemplos de uso")
        sys.exit(1)

    output_file = args[0]
    paths = args[1:]

    generate_tree(output_file, paths, use_hash)