#!/usr/bin/env python3
"""
Script CORREGIDO para procesar codebase snapshots - VERSIÓN CON BACKUP ORGANIZADO
"""

import os
import re
import sys
import shutil
import argparse
from datetime import datetime

def show_help():
    """Muestra la ayuda del script"""
    help_text = """
🌸 PROCESADOR DE CODEBASE SNAPSHOT - AYUDA

USO:
  python implement_codebase_result.py <snapshot_file> <tree_root_directory> [--backup-dir BACKUP_DIR]

PARÁMETROS:
  snapshot_file        Archivo de snapshot (ej: lifecycle_codebase.md)
  tree_root_directory  Directorio raíz del proyecto (ej: /ruta/al/proyecto)
  
OPCIONES:
  --backup-dir DIR     Directorio donde guardar backups (opcional)
  --help, -h          Muestra esta ayuda

EJEMPLOS:
  # Procesar sin backup
  python implement_codebase_result.py lifecycle_codebase.md /ruta/al/proyecto
  
  # Procesar con backup en directorio específico
  python implement_codebase_result.py lifecycle_codebase.md /ruta/al/proyecto --backup-dir /ruta/backups
  
  # Procesar con backup en directorio por defecto (./backups)
  python implement_codebase_result.py lifecycle_codebase.md /ruta/al/proyecto --backup-dir

DESCRIPCIÓN:
  Este script procesa codebase snapshots y actualiza los archivos del proyecto.
  Crea backups organizados manteniendo la estructura de directorios original.
  Los backups se guardan con timestamp para evitar sobreescrituras.
"""
    print(help_text)

def create_backup(source_file, project_root, backup_root):
    """
    Crea un backup organizado manteniendo la estructura de directorios
    """
    if not backup_root:
        return None
    
    # Calcular la ruta relativa desde el proyecto
    relative_path = os.path.relpath(source_file, project_root)
    
    # Crear ruta de destino en backup
    backup_file = os.path.join(backup_root, relative_path)
    
    # Asegurar que el directorio de backup existe
    backup_dir = os.path.dirname(backup_file)
    os.makedirs(backup_dir, exist_ok=True)
    
    # Copiar archivo
    shutil.copy2(source_file, backup_file)
    
    return backup_file

def parse_codebase_snapshot_safe(file_path):
    """
    Parsea un codebase snapshot de forma segura
    """
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    print(f"🔍 Analizando codebase snapshot...")
    print(f"📏 Longitud del contenido: {len(content)} caracteres")
    
    files = []
    
    # Buscar todas las secciones que comienzan con ### y contienen una ruta de archivo
    pattern = r'## Archivo \d+: (src/[\w/.-]+\.\w+) \((CREAR NUEVO|MODIFICAR)\)\n\n(.*?)(?=## Archivo |\Z)'
    matches = re.findall(pattern, content, re.DOTALL)
    
    for file_path_match, file_content in matches:
        # Limpiar el contenido - remover líneas de metadatos
        lines = file_content.split('\n')
        clean_lines = []
        
        for line in lines:
            # Saltar líneas de metadatos y líneas vacías al principio
            if not line.strip() or 'Metadatos:' in line or 'Hash MD5:' in line:
                continue
            clean_lines.append(line)
        
        clean_content = '\n'.join(clean_lines).strip()
        
        if clean_content and len(clean_content) > 50:  # Contenido válido
            files.append({
                'path': file_path_match,
                'action': 'MODIFICAR', 
                'content': clean_content
            })
            print(f"   ✅ {file_path_match} - {len(clean_content)} caracteres")
        else:
            print(f"   ⚠️  {file_path_match} - contenido insuficiente")
    
    return files

def ensure_directory_exists(file_path):
    """Asegura que el directorio existe"""
    directory = os.path.dirname(file_path)
    if directory and not os.path.exists(directory):
        os.makedirs(directory, exist_ok=True)
        print(f"📁 Directorio creado: {directory}")

def setup_backup_directory(backup_dir_arg, project_root):
    """
    Configura el directorio de backup
    """
    if backup_dir_arg is None:
        return None  # No backup
    
    if backup_dir_arg == "":
        # Backup por defecto en ./backups
        backup_dir = os.path.join(os.path.dirname(project_root), "backups")
    else:
        backup_dir = backup_dir_arg
    
    # Crear directorio de backup con timestamp
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_dir = os.path.join(backup_dir, f"backup_{timestamp}")
    
    os.makedirs(backup_dir, exist_ok=True)
    print(f"📂 Directorio de backup: {backup_dir}")
    
    return backup_dir

def process_files_safe(files, tree_root_directory, backup_dir):
    """Procesa archivos de forma segura con backup organizado"""
    results = []
    processed_count = 0
    backed_up_files = []
    
    for file_info in files:
        file_relative_path = file_info['path']
        
        # VERIFICACIÓN DE SEGURIDAD: Asegurar que la ruta es válida
        if not file_relative_path.startswith('src/'):
            print(f"❌ RUTA INVÁLIDA: {file_relative_path} - debe empezar con 'src/'")
            continue
            
        if '${category}' in file_relative_path or '`' in file_relative_path:
            print(f"❌ RUTA INVÁLIDA: {file_relative_path} - contiene caracteres inválidos")
            continue
        
        # Construir ruta CORRECTA (sin duplicar 'src/')
        file_full_path = os.path.join(tree_root_directory, file_relative_path)
        
        print(f"\n🔄 Procesando: {file_relative_path}")
        print(f"   📍 Ruta destino: {file_full_path}")
        
        # Verificar si el archivo existe para hacer backup
        file_exists = os.path.exists(file_full_path)
        action_display = "MODIFICADO" if file_exists else "CREADO"
        
        # CREAR BACKUP si el archivo existe y se especificó backup
        backup_path = None
        if file_exists and backup_dir:
            backup_path = create_backup(file_full_path, tree_root_directory, backup_dir)
            if backup_path:
                backed_up_files.append(backup_path)
                print(f"   💾 Backup creado: {backup_path}")
        
        ensure_directory_exists(file_full_path)
        
        # Escribir archivo
        with open(file_full_path, 'w', encoding='utf-8') as f:
            f.write(file_info['content'])
        
        results.append(f"✅ {action_display}: {file_relative_path}")
        if backup_path:
            results[-1] += f" (backup: {os.path.relpath(backup_path, backup_dir)})"
        
        print(f"   ✅ Archivo {action_display.lower()}")
        processed_count += 1
    
    return results, processed_count, backed_up_files

def main():
    parser = argparse.ArgumentParser(description='Procesa codebase snapshots', add_help=False)
    parser.add_argument('snapshot_file', nargs='?', help='Archivo de snapshot')
    parser.add_argument('tree_root_directory', nargs='?', help='Directorio raíz del proyecto')
    parser.add_argument('--backup-dir', nargs='?', const="", help='Directorio para backups (opcional)')
    parser.add_argument('--help', '-h', action='store_true', help='Mostrar ayuda')
    
    args = parser.parse_args()
    
    # Mostrar ayuda si se solicita
    if args.help or not args.snapshot_file or not args.tree_root_directory:
        show_help()
        sys.exit(0)
    
    snapshot_file = args.snapshot_file
    tree_root_directory = args.tree_root_directory
    backup_dir_arg = args.backup_dir
    
    # VERIFICACIONES DE SEGURIDAD
    if not os.path.exists(snapshot_file):
        print(f"❌ Error: Snapshot '{snapshot_file}' no existe")
        sys.exit(1)
    
    if not os.path.exists(tree_root_directory):
        print(f"❌ Error: Directorio '{tree_root_directory}' no existe")
        sys.exit(1)
    
    # Configurar backup
    backup_dir = setup_backup_directory(backup_dir_arg, tree_root_directory)
    
    print("🌸 PROCESADOR DE SNAPSHOT - VERSIÓN CON BACKUP ORGANIZADO")
    print("=" * 70)
    print(f"📂 Directorio raíz del proyecto: {tree_root_directory}")
    print(f"📋 Archivo snapshot: {snapshot_file}")
    if backup_dir:
        print(f"💾 Directorio de backup: {backup_dir}")
    else:
        print(f"⚠️  Modo SIN backup")
    print("=" * 70)
    
    # Parsear snapshot de forma SEGURA
    print(f"\n📋 Procesando snapshot...")
    files = parse_codebase_snapshot_safe(snapshot_file)
    
    if not files:
        print("❌ No se encontraron archivos válidos en el snapshot")
        sys.exit(1)
    
    print(f"\n📁 ARCHIVOS VÁLIDOS ENCONTRADOS ({len(files)}):")
    for i, file_info in enumerate(files, 1):
        print(f"  {i}. {file_info['path']}")
    
    # CONFIRMACIÓN FINAL
    print(f"\n⚠️  🔴 ATENCIÓN CRÍTICA:")
    print(f"   Se modificarán/crearán {len(files)} archivos en:")
    print(f"   {tree_root_directory}")
    if backup_dir:
        print(f"   Los backups se guardarán en: {backup_dir}")
    else:
        print(f"   ⚠️  NO SE CREARÁN BACKUPS")
    print(f"\n   ¿ESTÁS SEGURO DE QUE QUIERES CONTINUAR?")
    
    confirm = input("   Escribe 'SI' en mayúsculas para confirmar: ").strip()
    
    if confirm != 'SI':
        print("❌ Operación cancelada por seguridad")
        sys.exit(0)
    
    # PROCESAR
    print("\n🚀 Procesando archivos...")
    results, processed_count, backed_up_files = process_files_safe(files, tree_root_directory, backup_dir)
    
    # RESULTADOS
    print("\n📊 RESULTADOS FINALES:")
    print("=" * 70)
    for result in results:
        print(result)
    
    print(f"\n✅ COMPLETADO: {processed_count} archivos procesados correctamente")
    if backed_up_files:
        print(f"💾 {len(backed_up_files)} backups creados en: {backup_dir}")
    else:
        print(f"⚠️  No se crearon backups")

if __name__ == "__main__":
    main()