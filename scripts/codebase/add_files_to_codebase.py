import os
import argparse
import hashlib

# Mapeo de extensiones a lenguajes
LANGUAGE_MAP = {
    '.ts': 'typescript',
    '.js': 'javascript',
    '.css': 'css',
    '.html': 'html',
    '.json': 'json',
    '.py': 'python',
}

def get_language(ext):
    return LANGUAGE_MAP.get(ext.lower(), 'text')

def normalize_paths(files, root_dir='.'):
    """Normaliza paths a relativos desde root_dir."""
    return [os.path.relpath(os.path.abspath(f), root_dir) for f in files if os.path.isfile(f)]

def generate_index(files):
    """Genera índice jerárquico basado en files listados."""
    index = ["## Índice de Archivos Seleccionados\n"]
    index.append("Índice de archivos proporcionados, agrupados por directorios.\n")
    
    dir_tree = {}
    for f in sorted(files):
        dir_path, file_name = os.path.split(f)
        if dir_path not in dir_tree:
            dir_tree[dir_path] = []
        dir_tree[dir_path].append(file_name)
    
    for dir_path in sorted(dir_tree.keys()):
        if dir_path:
            index.append(f"- {dir_path}/")
        for file_name in sorted(dir_tree[dir_path]):
            index.append(f"  - {file_name}")
    
    index.append("\n## Contenidos de Archivos\n")
    return '\n'.join(index)

def collect_contents(files):
    """Recolecta contenidos de files listados."""
    contents = {}
    for f in files:
        try:
            with open(f, 'r', encoding='utf-8') as file:
                contents[f] = file.read()
        except UnicodeDecodeError:
            try:
                with open(f, 'r', encoding='latin-1') as file:
                    contents[f] = file.read()
            except:
                contents[f] = "(Archivo no legible como texto)"
    return contents

def write_codebase(output_file, index, contents, append=False):
    mode = 'a' if append else 'w'
    with open(output_file, mode, encoding='utf-8') as out:
        if not append:
            out.write("# Snapshot Selectivo de Codebase\n")
            out.write("Codebase con archivos específicos para indexación IA.\n\n")
        out.write(index)
        
        for rel_path in sorted(contents.keys()):
            content = contents[rel_path]
            lang = get_language(os.path.splitext(rel_path)[1])
            file_hash = hashlib.md5(content.encode('utf-8')).hexdigest()
            
            out.write(f"### {rel_path}\n")
            out.write(f"Metadatos: Lenguaje: {lang}, Hash MD5: {file_hash}\n\n")
            out.write(content + "\n\n")  # Contenido plano, indentado en MD si necesario

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Genera codebase MD con archivos selectivos.")
    parser.add_argument('--files', nargs='+', required=True, help="Lista de paths a archivos (space-separated)")
    parser.add_argument('--output', required=True, help="Archivo MD de salida")
    parser.add_argument('--root', default='.', help="Root dir para paths relativos")
    parser.add_argument('--append', action='store_true', help="Append a MD existente en lugar de overwrite")
    
    args = parser.parse_args()
    
    files = normalize_paths(args.files, args.root)
    if not files:
        raise ValueError("No archivos válidos encontrados.")
    
    index = generate_index(files)
    contents = collect_contents(args.files)  # Usa paths originales para lectura
    write_codebase(args.output, index, contents, args.append)
    
    print(f"Codebase selectivo generado en: {args.output}")
