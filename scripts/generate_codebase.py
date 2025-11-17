import os
import argparse
import hashlib
import difflib

# Mapeo simple de extensiones a lenguajes para code blocks Markdown
LANGUAGE_MAP = {
    '.ts': 'typescript',
    '.js': 'javascript',
    '.css': 'css',
    '.html': 'html',
    '.json': 'json',
    '.py': 'python',  # Por si acaso, extensible
    # Agrega más si necesitas
}

def get_language(ext):
    return LANGUAGE_MAP.get(ext.lower(), 'text')  # Default a 'text' si desconocido

def generate_index(root_dir, output_file):
    """Genera un índice jerárquico similar a 'tree' pero como lista Markdown."""
    index = ["## Índice de Archivos\n"]
    index.append("Este es un índice jerárquico de todos los archivos en el directorio. Usa esto para navegar rápidamente. Debajo siguen los contenidos completos en bloques de código.\n")
    abs_output = os.path.abspath(output_file)
    for root, dirs, files in os.walk(root_dir):
        rel_root = os.path.relpath(root, root_dir)
        if rel_root != '.':
            index.append(f"- **{rel_root}/**")
        for file in sorted(files):
            if file.startswith('.'): continue  # Ignora hidden files
            full_path = os.path.join(root, file)
            if os.path.abspath(full_path) == abs_output: continue  # Skip el output file itself
            rel_path = os.path.join(rel_root, file) if rel_root != '.' else file
            index.append(f"  - {rel_path}")
    index.append("\n## Contenidos de Archivos\n")
    return '\n'.join(index)

def collect_files(root_dir, output_file):
    """Recolecta dict de rel_path: content para fácil comparación."""
    files_dict = {}
    abs_output = os.path.abspath(output_file)
    for root, dirs, files in os.walk(root_dir):
        for file in sorted(files):
            if file.startswith('.'): continue
            full_path = os.path.join(root, file)
            if os.path.abspath(full_path) == abs_output: continue  # Skip output
            rel_path = os.path.relpath(full_path, root_dir)
            try:
                with open(full_path, 'r', encoding='utf-8') as f:
                    content = f.read()
            except UnicodeDecodeError:
                try:
                    with open(full_path, 'r', encoding='latin-1') as f:
                        content = f.read()
                except:
                    content = "*(Archivo no legible como texto; posiblemente binario)*"
            files_dict[rel_path] = content
    return files_dict

def generate_diff_section(old_files, new_files):
    """Genera sección de diffs usando difflib."""
    diff_section = ["## Sección de Cambios Detectados (Diff)\n"]
    diff_section.append("Comparación entre versiones: Archivos añadidos, eliminados o modificados.\n")
    
    all_paths = sorted(set(old_files.keys()) | set(new_files.keys()))
    for path in all_paths:
        if path not in new_files:
            diff_section.append(f"### {path} (Eliminado)\nContenido original:\n```{get_language(os.path.splitext(path)[1])}\n{old_files[path]}\n```\n")
        elif path not in old_files:
            diff_section.append(f"### {path} (Añadido)\n```{get_language(os.path.splitext(path)[1])}\n{new_files[path]}\n```\n")
        elif old_files[path] != new_files[path]:
            diff_section.append(f"### {path} (Modificado)\nDiff:\n```diff\n" + '\n'.join(difflib.ndiff(old_files[path].splitlines(), new_files[path].splitlines())) + "\n```\n")
    return '\n'.join(diff_section) + '\n'

def generate_codebase(root_dir, output_file, diff_dir=None):
    if not os.path.isdir(root_dir):
        raise ValueError(f"El directorio {root_dir} no existe o no es un directorio válido.")
    print(f"Procesando root_dir: {root_dir}")
    print(f"Generando output en: {output_file}")
    with open(output_file, 'w', encoding='utf-8') as out:
        # Preámbulo
        out.write("# Snapshot de Codebase\n")
        out.write("Este archivo consolida todo el código del proyecto para indexación rápida por IA. ")
        out.write("Primero el índice jerárquico, luego cada archivo con su path como título y código en bloque Markdown.\n\n")
        
        # Si hay diff, procesar ambos
        if diff_dir:
            if not os.path.isdir(diff_dir):
                raise ValueError(f"El directorio diff {diff_dir} no existe.")
            out.write("Modo Diff: Comparando original (" + root_dir + ") con updated (" + diff_dir + ")\n\n")
            old_files = collect_files(root_dir, output_file)
            new_files = collect_files(diff_dir, output_file)
            out.write(generate_index(root_dir, output_file) + "\n## Índice Updated\n" + generate_index(diff_dir, output_file) + "\n")
            out.write(generate_diff_section(old_files, new_files))
            out.write("## Contenidos Original\n")
            write_contents(out, old_files, "Original")
            out.write("## Contenidos Updated\n")
            write_contents(out, new_files, "Updated")
        else:
            files_dict = collect_files(root_dir, output_file)
            out.write(generate_index(root_dir, output_file))
            write_contents(out, files_dict)

def write_contents(out, files_dict, prefix=""):
    for rel_path in sorted(files_dict.keys()):
        content = files_dict[rel_path]
        lang = get_language(os.path.splitext(rel_path)[1])
        file_hash = hashlib.md5(content.encode('utf-8')).hexdigest()
        out.write(f"### {prefix} {rel_path}\n")
        out.write(f"Metadatos: Lenguaje: {lang}, Hash MD5: {file_hash}\n\n")
        out.write(f"```{lang}\n{content}\n```\n\n")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Genera un snapshot de codebase en Markdown. Soporta args posicionales y flags sin conflictos.")
    parser.add_argument('dir', nargs='?', default=None, help="Directorio raíz a procesar (posicional)")
    parser.add_argument('output', nargs='?', default=None, help="Archivo de salida (posicional opcional)")
    parser.add_argument('--dir', dest='opt_dir', help="Directorio raíz (flag)")
    parser.add_argument('--output', dest='opt_output', help="Archivo de salida (flag)")
    parser.add_argument('--diff', help="Directorio para comparar (genera diff section)")
    args = parser.parse_args()
    
    # Prioridad: flag > posicional > default
    root_dir = args.opt_dir if args.opt_dir is not None else args.dir if args.dir is not None else '.'
    output_file = args.opt_output if args.opt_output is not None else args.output if args.output is not None else f"codebase_{os.path.basename(os.path.normpath(root_dir)).replace('/', '_')}.md"
    
    generate_codebase(root_dir, output_file, args.diff)
    print(f"Codebase generado en: {output_file}")