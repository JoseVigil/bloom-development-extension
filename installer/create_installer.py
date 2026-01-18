import os
import sys
from datetime import datetime

def extract_go_files(specific_files=None):
    # Obtener la ruta raíz del proyecto (donde está este script)
    root_dir = os.path.dirname(os.path.abspath(__file__))
    print(f"Directorio raíz: {root_dir}")
    
    # Crear carpeta codebase si no existe
    codebase_dir = os.path.join(root_dir, 'codebase')
    print(f"Creando carpeta: {codebase_dir}")
    os.makedirs(codebase_dir, exist_ok=True)
    print(f"Carpeta codebase creada/verificada")
    
    # Obtener fecha actual para el nombre del archivo
    fecha = datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
    output_file = os.path.join(codebase_dir, f'go_files_{fecha}.txt')
    print(f"Archivo de salida: {output_file}")
    
    # Contador de archivos encontrados
    files_found = 0
    
    # Si hay archivos específicos, procesarlos
    if specific_files:
        print(f"\nModo: Archivos específicos ({len(specific_files)} archivos)")
        with open(output_file, 'w', encoding='utf-8') as f:
            for file_name in specific_files:
                # Buscar el archivo en el proyecto
                file_path = None
                
                # Primero intentar como ruta absoluta o relativa directa
                if os.path.isfile(file_name):
                    file_path = file_name
                elif os.path.isfile(os.path.join(root_dir, file_name)):
                    file_path = os.path.join(root_dir, file_name)
                else:
                    # Buscar el archivo en todo el proyecto
                    for dirpath, dirnames, filenames in os.walk(root_dir):
                        if 'codebase' in dirpath:
                            continue
                        if file_name in filenames:
                            file_path = os.path.join(dirpath, file_name)
                            break
                
                if file_path:
                    files_found += 1
                    relative_path = os.path.relpath(file_path, root_dir)
                    print(f"  Procesando: {relative_path}")
                    
                    # Escribir el path y nombre del archivo
                    f.write(f'{relative_path}\n\n')
                    
                    # Detectar extensión para el bloque de código
                    ext = os.path.splitext(file_name)[1]
                    lang = ext[1:] if ext else 'txt'  # Quitar el punto
                    
                    f.write(f'```{lang}\n')
                    
                    # Leer y escribir el contenido del archivo
                    try:
                        with open(file_path, 'r', encoding='utf-8') as target_file:
                            content = target_file.read()
                            f.write(content)
                    except Exception as e:
                        f.write(f'// Error al leer el archivo: {e}\n')
                        print(f"    ERROR: {e}")
                    
                    f.write('\n```\n\n')
                    f.write('-' * 80 + '\n\n')
                else:
                    print(f"  ADVERTENCIA: No se encontró el archivo '{file_name}'")
    else:
        # Modo original: buscar todos los .go
        print(f"\nModo: Buscar todos los archivos .go")
        with open(output_file, 'w', encoding='utf-8') as f:
            for dirpath, dirnames, filenames in os.walk(root_dir):
                # Ignorar la carpeta codebase
                if 'codebase' in dirpath:
                    continue
                
                for filename in filenames:
                    if filename.endswith('.go'):
                        files_found += 1
                        file_path = os.path.join(dirpath, filename)
                        relative_path = os.path.relpath(file_path, root_dir)
                        
                        print(f"  Procesando: {relative_path}")
                        
                        # Escribir el path y nombre del archivo
                        f.write(f'{relative_path}\n\n')
                        f.write('```go\n')
                        
                        # Leer y escribir el contenido del archivo
                        try:
                            with open(file_path, 'r', encoding='utf-8') as go_file:
                                content = go_file.read()
                                f.write(content)
                        except Exception as e:
                            f.write(f'// Error al leer el archivo: {e}\n')
                            print(f"    ERROR: {e}")
                        
                        f.write('\n```\n\n')
                        f.write('-' * 80 + '\n\n')
    
    print(f"\n{'='*60}")
    print(f"Total de archivos procesados: {files_found}")
    print(f"Archivo generado: {output_file}")
    print(f"{'='*60}")

if __name__ == '__main__':
    try:
        # Obtener argumentos de línea de comandos (omitir el primer argumento que es el nombre del script)
        args = sys.argv[1:]
        
        if args:
            extract_go_files(specific_files=args)
        else:
            extract_go_files()
    except Exception as e:
        print(f"ERROR FATAL: {e}")
        import traceback
        traceback.print_exc()