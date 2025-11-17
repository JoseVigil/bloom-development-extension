#!/usr/bin/env python3
"""
Script para procesar e implementar los archivos del Bloom Intent Lifecycle
Lee el archivo de implementación y actualiza/crea los archivos según las especificaciones.
"""

import os
import re
import sys
import shutil

def parse_implementation_file(file_path):
    """
    Parsea el archivo de implementación y extrae los archivos a crear/modificar
    """
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Patrón para encontrar cada archivo en el documento
    pattern = r'## Archivo \d+: (.*?) \((CREAR NUEVO|MODIFICAR|ACTUALIZAR INTERFACES)\)\s*(.*?)(?=## Archivo \d+|$)'
    matches = re.findall(pattern, content, re.DOTALL)
    
    files = []
    for match in matches:
        file_info = {
            'path': match[0].strip(),
            'action': match[1].strip(),
            'content': match[2].strip()
        }
        files.append(file_info)
    
    return files

def get_existing_structure(tree_file_path):
    """
    Lee el tree.txt y devuelve la estructura existente
    """
    with open(tree_file_path, 'r', encoding='utf-8') as f:
        return f.read()

def ensure_directory_exists(file_path):
    """
    Asegura que el directorio para el archivo existe
    """
    directory = os.path.dirname(file_path)
    if directory and not os.path.exists(directory):
        os.makedirs(directory, exist_ok=True)
        print(f"📁 Directorio creado: {directory}")

def process_files(implementation_files, tree_root_directory, base_directory="."):
    """
    Procesa cada archivo según su acción (CREAR NUEVO o MODIFICAR)
    """
    results = []
    
    for file_info in implementation_files:
        # Construir la ruta completa usando el directorio raíz del tree
        file_path = os.path.join(tree_root_directory, file_info['path'])
        action = file_info['action']
        content = file_info['content']
        
        # Limpiar el contenido (remover indentación excesiva)
        lines = content.split('\n')
        cleaned_lines = []
        
        for line in lines:
            # Remover indentación común de 4 espacios (si existe)
            if line.startswith('    '):
                cleaned_lines.append(line[4:])
            else:
                cleaned_lines.append(line)
        
        cleaned_content = '\n'.join(cleaned_lines)
        
        ensure_directory_exists(file_path)
        
        if action == 'CREAR NUEVO':
            if os.path.exists(file_path):
                print(f"⚠️  ADVERTENCIA: {file_path} ya existe pero se marcó como CREAR NUEVO")
            
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(cleaned_content)
            
            results.append(f"✅ CREADO: {file_path}")
            print(f"✅ Archivo creado: {file_path}")
            
        elif action in ['MODIFICAR', 'ACTUALIZAR INTERFACES']:
            if not os.path.exists(file_path):
                print(f"⚠️  ADVERTENCIA: {file_path} no existe pero se marcó como MODIFICAR")
                # Crearlo de todas formas
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(cleaned_content)
                results.append(f"✅ CREADO (no existía): {file_path}")
                print(f"✅ Archivo creado (no existía): {file_path}")
            else:
                # Hacer backup del archivo original
                backup_path = file_path + '.backup'
                shutil.copy2(file_path, backup_path)
                
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(cleaned_content)
                
                results.append(f"✅ MODIFICADO: {file_path} (backup en {backup_path})")
                print(f"✅ Archivo modificado: {file_path} (backup creado)")
    
    return results

def main():
    if len(sys.argv) != 4:
        print("Uso: python implement_bloom.py <archivo_implementacion> <tree_file> <tree_root_directory>")
        print("Ejemplo: python implement_bloom.py bloom_lifecycle_implementation.md tree.txt /ruta/completa/al/proyecto")
        print("\nParámetros:")
        print("  <archivo_implementacion>: Archivo con el contenido de implementación")
        print("  <tree_file>: Archivo tree.txt con la estructura")
        print("  <tree_root_directory>: Directorio raíz donde está la estructura del tree")
        sys.exit(1)
    
    implementation_file = sys.argv[1]
    tree_file = sys.argv[2]
    tree_root_directory = sys.argv[3]
    
    if not os.path.exists(implementation_file):
        print(f"❌ Error: El archivo de implementación '{implementation_file}' no existe")
        sys.exit(1)
    
    if not os.path.exists(tree_file):
        print(f"❌ Error: El archivo tree '{tree_file}' no existe")
        sys.exit(1)
    
    if not os.path.exists(tree_root_directory):
        print(f"❌ Error: El directorio raíz '{tree_root_directory}' no existe")
        sys.exit(1)
    
    print("🌸 Bloom Intent Lifecycle - Implementación Automática")
    print("=" * 60)
    print(f"📂 Directorio raíz del tree: {tree_root_directory}")
    print(f"📋 Archivo de implementación: {implementation_file}")
    print(f"🌳 Archivo tree: {tree_file}")
    print("=" * 60)
    
    # Mostrar estructura existente
    print("\n📁 Estructura existente:")
    with open(tree_file, 'r', encoding='utf-8') as f:
        print(f.read())
    
    # Parsear archivos de implementación
    print(f"\n📋 Procesando archivo de implementación: {implementation_file}")
    implementation_files = parse_implementation_file(implementation_file)
    
    print(f"📁 Encontrados {len(implementation_files)} archivos para procesar:")
    for i, file_info in enumerate(implementation_files, 1):
        full_path = os.path.join(tree_root_directory, file_info['path'])
        print(f"  {i}. {file_info['path']} -> {full_path} ({file_info['action']})")
    
    # Confirmar con el usuario
    print(f"\n⚠️  ATENCIÓN: Esta acción modificará/creará archivos en:")
    print(f"   {tree_root_directory}")
    confirm = input("¿Continuar? (s/N): ").strip().lower()
    
    if confirm not in ['s', 'si', 'y', 'yes']:
        print("❌ Operación cancelada")
        sys.exit(0)
    
    # Procesar archivos
    print("\n🚀 Procesando archivos...")
    results = process_files(implementation_files, tree_root_directory)
    
    # Mostrar resultados
    print("\n📊 RESULTADOS:")
    print("=" * 60)
    for result in results:
        print(result)
    
    print(f"\n✅ Implementación completada! {len(results)} archivos procesados.")
    print(f"📂 Todos los archivos creados/modificados en: {tree_root_directory}")

if __name__ == "__main__":
    main()