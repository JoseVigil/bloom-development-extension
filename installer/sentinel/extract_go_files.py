import os
from datetime import datetime

def extract_go_files():
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
    
    # Recorrer el proyecto y encontrar archivos .go
    print(f"\nBuscando archivos .go...")
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
    print(f"Total de archivos .go encontrados: {files_found}")
    print(f"Archivo generado: {output_file}")
    print(f"{'='*60}")

if __name__ == '__main__':
    try:
        extract_go_files()
    except Exception as e:
        print(f"ERROR FATAL: {e}")
        import traceback
        traceback.print_exc()