import os
import argparse
import hashlib
import difflib
import glob

# Mapeo simple de extensiones a lenguajes para code blocks Markdown
LANGUAGE_MAP = {
    '.ts': 'typescript',
    '.js': 'javascript',
    '.css': 'css',
    '.html': 'html',
    '.json': 'json',
    '.py': 'python',
    '.tsx': 'typescript',
    '.jsx': 'javascript',
    '.md': 'markdown',
    '.yml': 'yaml',
    '.yaml': 'yaml',
}

def get_language(ext):
    return LANGUAGE_MAP.get(ext.lower(), 'text')

def normalize_path(path):
    """Normaliza rutas para comparación consistente."""
    return os.path.normpath(path).replace('\\', '/')

def collect_files_from_paths(file_paths, base_dir=None):
    """Recolecta archivos desde una lista de rutas específicas."""
    files_dict = {}
    
    for file_path in file_paths:
        if not os.path.isfile(file_path):
            print(f"Advertencia: {file_path} no es un archivo válido, se omite.")
            continue
        
        # Si hay base_dir, calculamos ruta relativa, sino usamos el nombre del archivo
        if base_dir:
            try:
                rel_path = os.path.relpath(file_path, base_dir)
            except ValueError:
                # En Windows, si están en diferentes drives
                rel_path = os.path.basename(file_path)
        else:
            rel_path = file_path
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
        except UnicodeDecodeError:
            try:
                with open(file_path, 'r', encoding='latin-1') as f:
                    content = f.read()
            except:
                content = "*(Archivo no legible como texto; posiblemente binario)*"
        
        files_dict[rel_path] = content
    
    return files_dict

def generate_index_from_dict(files_dict, title="Índice de Archivos"):
    """Genera índice desde un diccionario de archivos."""
    index = [f"## {title}\n"]
    index.append("Lista de archivos incluidos en este snapshot:\n")
    
    # Agrupar por directorios
    dirs = {}
    for path in sorted(files_dict.keys()):
        dir_name = os.path.dirname(path)
        if dir_name == '':
            dir_name = '(raíz)'
        if dir_name not in dirs:
            dirs[dir_name] = []
        dirs[dir_name].append(os.path.basename(path))
    
    for dir_name in sorted(dirs.keys()):
        if dir_name != '(raíz)':
            index.append(f"- **{dir_name}/**")
        for file in sorted(dirs[dir_name]):
            full_path = os.path.join(dir_name, file) if dir_name != '(raíz)' else file
            index.append(f"  - {full_path}")
    
    index.append("\n## Contenidos de Archivos\n")
    return '\n'.join(index)

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
            if file.startswith('.'): continue
            full_path = os.path.join(root, file)
            if os.path.abspath(full_path) == abs_output: continue
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
            if os.path.abspath(full_path) == abs_output: continue
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

def generate_codebase(root_dir=None, output_file=None, diff_dir=None, file_list=None):
    """
    Genera codebase desde:
    - root_dir: directorio completo (recursivo)
    - file_list: lista específica de archivos
    - Ambos: combina ambos conjuntos
    """
    
    # Determinar output file si no se especificó
    if output_file is None:
        if root_dir:
            output_file = f"codebase_{os.path.basename(os.path.normpath(root_dir)).replace('/', '_')}.md"
        elif file_list:
            output_file = "codebase_custom.md"
        else:
            output_file = "codebase.md"
    
    print(f"Generando output en: {output_file}")
    
    # Recolectar archivos
    all_files = {}
    base_dir = root_dir if root_dir else None
    
    # Desde directorio
    if root_dir:
        if not os.path.isdir(root_dir):
            raise ValueError(f"El directorio {root_dir} no existe o no es un directorio válido.")
        print(f"Procesando directorio: {root_dir}")
        all_files.update(collect_files(root_dir, output_file))
    
    # Desde lista de archivos
    if file_list:
        print(f"Procesando {len(file_list)} archivo(s) específico(s)")
        file_files = collect_files_from_paths(file_list, base_dir)
        # Merge evitando duplicados
        for path, content in file_files.items():
            if path not in all_files:
                all_files[path] = content
    
    if not all_files:
        raise ValueError("No se encontraron archivos para procesar.")
    
    with open(output_file, 'w', encoding='utf-8') as out:
        # Preámbulo
        out.write("# Snapshot de Codebase\n")
        out.write("Este archivo consolida todo el código del proyecto para indexación rápida por IA. ")
        out.write("Primero el índice jerárquico, luego cada archivo con su path como título y código en bloque Markdown.\n\n")
        
        # Información de origen
        sources = []
        if root_dir:
            sources.append(f"Directorio: {root_dir}")
        if file_list:
            sources.append(f"Archivos específicos: {len(file_list)}")
        out.write(f"**Origen:** {', '.join(sources)}\n")
        out.write(f"**Total de archivos:** {len(all_files)}\n\n")
        
        # Si hay diff, procesar
        if diff_dir:
            if not os.path.isdir(diff_dir):
                raise ValueError(f"El directorio diff {diff_dir} no existe.")
            out.write("Modo Diff: Comparando original con updated (" + diff_dir + ")\n\n")
            old_files = all_files
            new_files = collect_files(diff_dir, output_file)
            out.write(generate_index_from_dict(old_files, "Índice Original"))
            out.write("\n## Índice Updated\n")
            out.write(generate_index_from_dict(new_files, "Índice Updated"))
            out.write(generate_diff_section(old_files, new_files))
            out.write("## Contenidos Original\n")
            write_contents(out, old_files, "Original")
            out.write("## Contenidos Updated\n")
            write_contents(out, new_files, "Updated")
        else:
            out.write(generate_index_from_dict(all_files))
            write_contents(out, all_files)
    
    print(f"✓ Codebase generado exitosamente: {output_file}")
    print(f"✓ Total de archivos procesados: {len(all_files)}")

def write_contents(out, files_dict, prefix=""):
    for rel_path in sorted(files_dict.keys()):
        content = files_dict[rel_path]
        lang = get_language(os.path.splitext(rel_path)[1])
        file_hash = hashlib.md5(content.encode('utf-8')).hexdigest()
        title = f"{prefix} {rel_path}" if prefix else rel_path
        out.write(f"### {title}\n")
        out.write(f"Metadatos: Lenguaje: {lang}, Hash MD5: {file_hash}\n\n")
        out.write(f"```{lang}\n{content}\n```\n\n")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Genera un snapshot de codebase en Markdown desde directorios y/o archivos específicos.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Ejemplos de uso:
  # Directorio completo
  python codebase_generation.py --dir ./mi-proyecto
  
  # Archivos específicos
  python codebase_generation.py --files src/app.ts src/utils.ts config.json
  
  # Combinar directorio + archivos adicionales
  python codebase_generation.py --dir ./src --files README.md package.json
  
  # Con output personalizado
  python codebase_generation.py --dir ./src --output mi_proyecto.md
  
  # Modo diff
  python codebase_generation.py --dir ./version1 --diff ./version2
        """
    )
    
    parser.add_argument('--dir', dest='root_dir', help="Directorio raíz a procesar (recursivo)")
    parser.add_argument('--output', dest='output_file', help="Archivo de salida .md")
    parser.add_argument('--diff', dest='diff_dir', help="Directorio para comparar (genera diff section)")
    parser.add_argument('--files', nargs='+', help="Lista de archivos específicos a incluir")
    
    args = parser.parse_args()
    
    # Validar que al menos uno de los inputs esté presente
    if not args.root_dir and not args.files:
        parser.error("Debes especificar al menos --dir o --files")
    
    try:
        generate_codebase(
            root_dir=args.root_dir,
            output_file=args.output_file,
            diff_dir=args.diff_dir,
            file_list=args.files
        )
    except Exception as e:
        print(f"❌ Error: {e}")
        exit(1)