#!/usr/bin/env python3
"""
Tree Generator - Generador unificado de árboles de directorios
Soporta modo simple y modo con hash MD5
"""

import os
import sys
import json
import hashlib
import argparse
from datetime import datetime


# Directorios a excluir del árbol (se mostrarán colapsados)
EXCLUDED_DIRS = {
    'node_modules': '[... dependencies]',
    '.git': '[... git data]',
    '__pycache__': '[... cache]',
    '.next': '[... build cache]',
    'dist': '[... build output]',
    'build': '[... build output]',
    'out': '[... output files]',
    '.venv': '[... virtual env]',
    'venv': '[... virtual env]',
}


def compute_md5(filepath, block_size=8192):
    """
    Calcula el hash MD5 de un archivo.
    
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
    
    # Calcular ruta relativa si se usa hash
    if use_hash and base_path:
        try:
            rel_path = os.path.relpath(path, base_path)
        except ValueError:
            rel_path = path
    else:
        rel_path = path

    tree_str = prefix + connector + name
    
    if os.path.isdir(path):
        tree_str += "/"
        
        # Verificar si es un directorio excluido
        if name in EXCLUDED_DIRS:
            tree_str += f" {EXCLUDED_DIRS[name]}\n"
            return tree_str
        
        if use_hash and file_hashes is not None:
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


def generate_tree(output_file, paths, use_hash=False, json_output=False):
    """
    Genera el árbol de directorios y opcionalmente los hashes.
    
    Args:
        output_file: Archivo de salida para el árbol visual
        paths: Lista de rutas a procesar
        use_hash: Si debe generar hashes
        json_output: Si debe generar archivo JSON adicional
    """
    final_output = ""
    file_hashes = {} if use_hash else None
    dir_hashes = {} if use_hash else None
    
    # Determinar la ruta base (directorio actual)
    base_path = os.getcwd() if use_hash else ""
    
    # Solo el nombre del directorio actual
    root = os.path.basename(os.getcwd())
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

    # Si usamos hash y se solicita JSON, generar archivo JSON
    if use_hash and json_output and file_hashes:
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


def normalize_path(path):
    """
    Normaliza una ruta usando el separador correcto del sistema operativo.
    
    Args:
        path: Ruta a normalizar
        
    Returns:
        Ruta normalizada
    """
    # Reemplazar barras por el separador del sistema
    path = path.replace('/', os.sep).replace('\\', os.sep)
    # Normalizar y eliminar barras finales
    return os.path.normpath(path).rstrip(os.sep)


def resolve_paths(paths, script_dir):
    """
    Resuelve rutas relativas al directorio raíz del proyecto.
    Soporta subcarpetas específicas como 'src/webview'.
    
    Args:
        paths: Lista de rutas a resolver
        script_dir: Directorio donde está el script
        
    Returns:
        Lista de rutas absolutas resueltas
    """
    # Determinar la raíz del proyecto
    script_basename = os.path.basename(script_dir)
    parent_basename = os.path.basename(os.path.dirname(script_dir))
    
    # Si está en /scripts/tree, subir dos niveles
    if script_basename == 'tree' and parent_basename == 'scripts':
        project_root = os.path.dirname(os.path.dirname(script_dir))
    # Si está en /scripts, subir un nivel
    elif script_basename == 'scripts':
        project_root = os.path.dirname(script_dir)
    else:
        project_root = script_dir
    
    resolved = []
    for path in paths:
        # Normalizar la ruta
        path = normalize_path(path)
        
        # Si es ruta absoluta, usarla tal cual
        if os.path.isabs(path):
            resolved.append(path)
        else:
            # Resolver relativo a la raíz del proyecto
            abs_path = os.path.join(project_root, path)
            resolved.append(abs_path)
    
    return resolved


def resolve_output_path(output_file, script_dir):
    """
    Resuelve la ruta del archivo de salida.
    Si no tiene directorio, lo coloca en /tree (raíz del proyecto) si existe.
    
    Args:
        output_file: Ruta del archivo de salida
        script_dir: Directorio donde está el script
        
    Returns:
        Ruta absoluta del archivo de salida
    """
    # Si ya es ruta absoluta, usarla
    if os.path.isabs(output_file):
        return output_file
    
    # Si tiene directorio en la ruta, resolver normalmente
    if os.path.dirname(output_file):
        return os.path.abspath(output_file)
    
    # Determinar la raíz del proyecto
    script_basename = os.path.basename(script_dir)
    parent_basename = os.path.basename(os.path.dirname(script_dir))
    
    # Si está en /scripts/tree, subir dos niveles
    if script_basename == 'tree' and parent_basename == 'scripts':
        project_root = os.path.dirname(os.path.dirname(script_dir))
    # Si está en /scripts, subir un nivel
    elif script_basename == 'scripts':
        project_root = os.path.dirname(script_dir)
    else:
        project_root = script_dir
    
    # Buscar carpeta /tree en la raíz
    tree_dir = os.path.join(project_root, 'tree')
    
    if os.path.isdir(tree_dir):
        return os.path.join(tree_dir, output_file)
    else:
        # Si no existe /tree, crearlo
        os.makedirs(tree_dir, exist_ok=True)
        return os.path.join(tree_dir, output_file)


def main():
    parser = argparse.ArgumentParser(
        description="""
╔═══════════════════════════════════════════════════════════════════════════╗
║                          TREE GENERATOR v2.0                                 ║
║              Generador Profesional de Árboles de Directorios                ║
╚═══════════════════════════════════════════════════════════════════════════╝

Genera representaciones visuales de la estructura de directorios con soporte
opcional para hashes MD5 y exportación a JSON para procesamiento automático.

EXCLUSIONES AUTOMÁTICAS:
  node_modules/  → [... dependencies]
  .git/          → [... git data]
  __pycache__/   → [... cache]
  .next/         → [... build cache]
  dist/          → [... build output]
  build/         → [... build output]
  out/           → [... output files]
  .venv/         → [... virtual env]
  venv/          → [... virtual env]
        """,
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
═══════════════════════════════════════════════════════════════════════════
                              EJEMPLOS DE USO
═══════════════════════════════════════════════════════════════════════════

📂 RUTAS RELATIVAS (Recomendado - Script en /scripts/tree):
───────────────────────────────────────────────────────────────────────────
  Si tu estructura es:
    proyecto/
    ├── scripts/
    │   └── tree/
    │       └── generate_tree.py  ← Script aquí
    ├── src/
    │   ├── components/
    │   └── webview/
    ├── tree/          (salida automática aquí)
    └── package.json

  Desde /scripts/tree:
    # Árbol completo de src/
    python generate_tree.py tree.txt src
    
    # Solo subcarpeta específica src/webview/
    python generate_tree.py tree.txt src/webview
    
    # Múltiples subcarpetas específicas
    python generate_tree.py tree.txt src/components src/webview
    
    # Con hashes
    python generate_tree.py --hash tree.txt src/webview
    python generate_tree.py --hash --json snapshot.txt src/components tests/unit

  Desde raíz del proyecto:
    python scripts/tree/generate_tree.py tree.txt src/webview
    python scripts/tree/generate_tree.py --hash tree.txt src/components

  ✓ Las rutas como src/webview se resuelven desde la raíz del proyecto
  ✓ Soporta cualquier nivel de subcarpetas: src/a/b/c/d
  ✓ El archivo de salida se guarda automáticamente en /tree/
  ✓ Si /tree/ no existe, se crea automáticamente


📂 MODO SIMPLE (Árbol visual básico):
───────────────────────────────────────────────────────────────────────────
  python generate_tree.py arbol.txt .
  python generate_tree.py salida.txt src tests docs
  python generate_tree.py estructura.txt src/webview src/components
  python generate_tree.py output.txt config/prod config/dev


📂 MODO HASH (Con checksums MD5):
───────────────────────────────────────────────────────────────────────────
  python generate_tree.py --hash arbol.txt .
  python generate_tree.py --hash salida.txt src/webview
  python generate_tree.py --hash proyecto.txt src/components tests/unit docs


📊 MODO HASH + JSON (Para procesamiento automático):
───────────────────────────────────────────────────────────────────────────
  python generate_tree.py --hash --json salida.txt .
  python generate_tree.py --hash --json snapshot.txt src/webview tests
  

🌐 RUTAS ABSOLUTAS (Compatible):
───────────────────────────────────────────────────────────────────────────
  # Git Bash / Unix / macOS
  python /c/repos/proyecto/scripts/tree/generate_tree.py --hash \\
    /c/repos/proyecto/tree/hash_tree.txt \\
    /c/repos/proyecto/src/webview \\
    /c/repos/proyecto/package.json

  # Windows CMD
  python C:\\repos\\proyecto\\scripts\\tree\\generate_tree.py --hash ^
    C:\\repos\\proyecto\\tree\\hash_tree.txt ^
    C:\\repos\\proyecto\\src\\webview ^
    C:\\repos\\proyecto\\package.json


═══════════════════════════════════════════════════════════════════════════
                           ESTRUCTURA DE SALIDA
═══════════════════════════════════════════════════════════════════════════

MODO SIMPLE:
  proyecto/
  ├── src/
  │   ├── main.py
  │   └── utils.py
  ├── node_modules/ [... dependencies]
  └── README.md

MODO HASH:
  
  PROJECT_HASH: a1b2c3d4e5f6...
  Generated: 2024-12-04 15:30:45
  Total files: 15
  Total directories: 5
  ======================================================================
  
  proyecto/
  ├── src/ [DIR]
  │   ├── main.py ................................. a1b2c3d4e5f6g7h8
  │   └── utils.py ................................ i9j0k1l2m3n4o5p6
  ├── node_modules/ [... dependencies]
  └── README.md ...................................... q7r8s9t0u1v2w3x4
  
  ======================================================================
  DIRECTORY HASHES:
    src/ → 1a2b3c4d5e6f7g8h...
    tests/ → 9i0j1k2l3m4n5o6p...

═══════════════════════════════════════════════════════════════════════════
                              INFORMACIÓN
═══════════════════════════════════════════════════════════════════════════

Versión: 2.0
Autor: Tree Generator Team
Licencia: MIT
Python: 3.6+

Para reportar bugs o sugerencias, usa el sistema de issues del repositorio.
        """
    )
    
    parser.add_argument(
        '--hash',
        action='store_true',
        help='Calcula y muestra hashes MD5 de archivos'
    )
    
    parser.add_argument(
        '--json',
        action='store_true',
        help='Genera archivo JSON con metadata (requiere --hash)'
    )
    
    parser.add_argument(
        'output',
        help='Archivo de salida donde se guardará el árbol'
    )
    
    parser.add_argument(
        'paths',
        nargs='+',
        help='Directorios, subcarpetas o archivos a incluir (ej: src, src/webview, config/prod)'
    )
    
    args = parser.parse_args()
    
    # Validar que --json solo se use con --hash
    if args.json and not args.hash:
        parser.error("--json requiere --hash")
    
    # Obtener el directorio del script
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Resolver rutas de entrada (ahora soporta subcarpetas)
    resolved_paths = resolve_paths(args.paths, script_dir)
    
    # Verificar que las rutas existen
    for path in resolved_paths:
        if not os.path.exists(path):
            print(f"⚠️  Advertencia: La ruta no existe: {path}")
    
    # Resolver ruta de salida
    output_path = resolve_output_path(args.output, script_dir)
    
    # Crear directorio de salida si no existe
    output_dir = os.path.dirname(output_path)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir, exist_ok=True)
        print(f"📁 Directorio creado: {output_dir}")
    
    # Cambiar al directorio del proyecto para rutas relativas correctas
    script_basename = os.path.basename(script_dir)
    parent_basename = os.path.basename(os.path.dirname(script_dir))
    
    if script_basename == 'tree' and parent_basename == 'scripts':
        project_root = os.path.dirname(os.path.dirname(script_dir))
    elif script_basename == 'scripts':
        project_root = os.path.dirname(script_dir)
    else:
        project_root = script_dir
    
    os.chdir(project_root)
    print(f"📂 Trabajando desde: {project_root}\n")
    
    # Generar el árbol
    generate_tree(output_path, resolved_paths, use_hash=args.hash, json_output=args.json)


if __name__ == "__main__":
    main()