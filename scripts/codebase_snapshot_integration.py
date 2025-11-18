#!/usr/bin/env python3
"""
PROCESADOR DE CODEBASE SNAPSHOT v2.0 - PARSER ROBUSTO
Compatible con formato estandarizado de Claude
"""

import os
import re
import sys
import shutil
import argparse
from datetime import datetime
from typing import List, Dict, Optional, Tuple

class SnapshotParser:
    """Parser robusto para codebase snapshots"""
    
    SECTION_PATTERN = r'^## Archivo \d+: (.+?) \((CREAR NUEVO|MODIFICAR)\)$'
    
    def __init__(self, content: str):
        self.content = content
        self.lines = content.split('\n')
        
    def parse(self) -> List[Dict]:
        """Parse usando el formato estandarizado"""
        files = []
        current_file = None
        current_content_lines = []
        in_code_block = False
        
        for i, line in enumerate(self.lines):
            # Detectar inicio de sección de archivo
            match = re.match(self.SECTION_PATTERN, line)
            if match:
                # Guardar archivo anterior
                if current_file:
                    content = self._extract_indented_code(current_content_lines)
                    if content:
                        files.append({
                            'path': current_file['path'],
                            'action': current_file['action'],
                            'content': content
                        })
                
                # Iniciar nuevo archivo
                current_file = {
                    'path': match.group(1),
                    'action': match.group(2)
                }
                current_content_lines = []
                in_code_block = True
                continue
            
            # Detectar fin de sección (nueva sección ##)
            if line.startswith('## ') and current_file and in_code_block:
                content = self._extract_indented_code(current_content_lines)
                if content:
                    files.append({
                        'path': current_file['path'],
                        'action': current_file['action'],
                        'content': content
                    })
                current_file = None
                current_content_lines = []
                in_code_block = False
                continue
            
            # Acumular líneas de código
            if in_code_block and current_file:
                current_content_lines.append(line)
        
        # Guardar último archivo
        if current_file and current_content_lines:
            content = self._extract_indented_code(current_content_lines)
            if content:
                files.append({
                    'path': current_file['path'],
                    'action': current_file['action'],
                    'content': content
                })
        
        return files
    
    def _extract_indented_code(self, lines: List[str]) -> str:
        """Extrae código removiendo indentación de 4 espacios"""
        code_lines = []
        
        for line in lines:
            # Remover exactamente 4 espacios de indentación
            if line.startswith('    '):
                code_lines.append(line[4:])
            elif line.strip() == '':
                code_lines.append('')
            # Si no tiene indentación y no está vacía, es texto descriptivo
        
        # Remover líneas vacías al inicio y final
        while code_lines and not code_lines[0].strip():
            code_lines.pop(0)
        while code_lines and not code_lines[-1].strip():
            code_lines.pop()
        
        return '\n'.join(code_lines)

class BackupManager:
    """Gestión inteligente de backups"""
    
    def __init__(self, backup_root: Optional[str], project_root: str):
        self.backup_root = backup_root
        self.project_root = project_root
        self.backed_up_files = []
        
    def create_backup(self, source_file: str) -> Optional[str]:
        """Crea backup preservando estructura"""
        if not self.backup_root or not os.path.exists(source_file):
            return None
        
        relative_path = os.path.relpath(source_file, self.project_root)
        backup_file = os.path.join(self.backup_root, relative_path)
        
        backup_dir = os.path.dirname(backup_file)
        os.makedirs(backup_dir, exist_ok=True)
        
        shutil.copy2(source_file, backup_file)
        self.backed_up_files.append(backup_file)
        
        return backup_file
    
    def get_stats(self) -> Dict:
        """Estadísticas de backup"""
        if not self.backed_up_files:
            return {'count': 0}
        
        total_size = sum(
            os.path.getsize(f) for f in self.backed_up_files if os.path.exists(f)
        )
        
        return {
            'count': len(self.backed_up_files),
            'total_size': total_size,
            'files': self.backed_up_files
        }

class FileProcessor:
    """Procesador de archivos con validaciones"""
    
    def __init__(self, project_root: str, backup_manager: BackupManager):
        self.project_root = project_root
        self.backup_manager = backup_manager
        self.results = []
        
    def process(self, files: List[Dict]) -> Tuple[List[str], int]:
        """Procesa lista de archivos"""
        processed_count = 0
        
        for file_info in files:
            try:
                result = self._process_single_file(file_info)
                if result:
                    self.results.append(result)
                    processed_count += 1
            except Exception as e:
                error_msg = f"❌ ERROR en {file_info['path']}: {str(e)}"
                print(error_msg)
                self.results.append(error_msg)
        
        return self.results, processed_count
    
    def _process_single_file(self, file_info: Dict) -> Optional[str]:
        """Procesa un archivo individual"""
        file_path = file_info['path']
        action = file_info['action']
        content = file_info['content']
        
        # Validaciones
        if not self._validate_path(file_path):
            raise ValueError(f"Ruta inválida: {file_path}")
        
        if not content or len(content.strip()) < 10:
            raise ValueError(f"Contenido insuficiente: {len(content)} chars")
        
        # Construir ruta completa
        full_path = os.path.join(self.project_root, file_path)
        
        print(f"\n📄 Procesando: {file_path}")
        print(f"   📍 Ruta: {full_path}")
        print(f"   🔧 Acción: {action}")
        
        # Backup si existe
        file_exists = os.path.exists(full_path)
        backup_path = None
        
        if file_exists:
            backup_path = self.backup_manager.create_backup(full_path)
            if backup_path:
                print(f"   💾 Backup: {os.path.basename(backup_path)}")
        
        # Crear directorio si no existe
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        
        # Escribir archivo
        with open(full_path, 'w', encoding='utf-8') as f:
            f.write(content)
        
        action_display = "MODIFICADO" if file_exists else "CREADO"
        result = f"✅ {action_display}: {file_path}"
        
        if backup_path:
            result += f" (backup: {os.path.basename(backup_path)})"
        
        print(f"   ✅ {action_display}")
        
        return result
    
    def _validate_path(self, path: str) -> bool:
        """Valida que la ruta sea segura"""
        # No debe contener ..
        if '..' in path:
            return False
        
        # Debe empezar con src/ o ser ruta relativa válida
        if not (path.startswith('src/') or path.startswith('tests/')):
            return False
        
        # No debe contener caracteres especiales raros
        if any(c in path for c in ['${', '`', '<', '>']):
            return False
        
        return True

def setup_backup_directory(backup_arg: Optional[str], project_root: str) -> Optional[str]:
    """Configura directorio de backup con timestamp"""
    if backup_arg is None:
        return None
    
    if backup_arg == "":
        backup_base = os.path.join(os.path.dirname(project_root), "backups")
    else:
        backup_base = backup_arg
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_dir = os.path.join(backup_base, f"backup_{timestamp}")
    
    os.makedirs(backup_dir, exist_ok=True)
    return backup_dir

def show_summary(stats: Dict, backup_stats: Dict, processed_count: int):
    """Muestra resumen final"""
    print("\n" + "=" * 70)
    print("📊 RESUMEN DE OPERACIÓN")
    print("=" * 70)
    print(f"✅ Archivos procesados: {processed_count}")
    
    if backup_stats['count'] > 0:
        size_mb = backup_stats['total_size'] / (1024 * 1024)
        print(f"💾 Backups creados: {backup_stats['count']}")
        print(f"💾 Tamaño total: {size_mb:.2f} MB")
    else:
        print(f"⚠️  No se crearon backups")
    
    print("=" * 70)

def main():
    parser = argparse.ArgumentParser(
        description='''
PROCESADOR DE CODEBASE SNAPSHOT v2.0 - PARSER ROBUSTO
Regenera una codebase completa a partir de un snapshot en formato Markdown
        ''',
        epilog='''
Ejemplos de uso:
  python codebase_regeneration.py snapshot.md ./mi_proyecto
  python codebase_regeneration.py cambios.md ./src --backup-dir
  python codebase_regeneration.py snapshot.md . --dry-run
  python codebase_regeneration.py updates.md ./app --backup-dir ./backups
        ''',
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    
    parser.add_argument(
        'snapshot_file', 
        help='Archivo .md con el snapshot de la codebase (formato Claude estandar)'
    )
    parser.add_argument(
        'tree_root_directory', 
        help='Directorio raíz donde se regenerarán los archivos'
    )
    parser.add_argument(
        '--backup-dir', 
        nargs='?', 
        const="",
        help='''Directorio para backups. Sin valor: backups automáticos.
        Con ruta: usa directorio específico. Omítelo para no hacer backups.'''
    )
    parser.add_argument(
        '--dry-run', 
        action='store_true',
        help='Simula operación sin modificar archivos (solo muestra qué haría)'
    )
    
    args = parser.parse_args()
    
    if args.help or not args.snapshot_file or not args.tree_root_directory:
        print("USO: python script.py <snapshot.md> <project_dir> [--backup-dir DIR] [--dry-run]")
        sys.exit(0)
    
    # Validaciones
    if not os.path.exists(args.snapshot_file):
        print(f"❌ Snapshot no existe: {args.snapshot_file}")
        sys.exit(1)
    
    if not os.path.exists(args.tree_root_directory):
        print(f"❌ Directorio no existe: {args.tree_root_directory}")
        sys.exit(1)
    
    # Setup
    backup_dir = setup_backup_directory(args.backup_dir, args.tree_root_directory)
    
    print("🌸 PROCESADOR DE SNAPSHOT v2.0")
    print("=" * 70)
    print(f"📂 Proyecto: {args.tree_root_directory}")
    print(f"📋 Snapshot: {args.snapshot_file}")
    if backup_dir:
        print(f"💾 Backups: {backup_dir}")
    if args.dry_run:
        print(f"🔍 MODO DRY-RUN (no se escribirá)")
    print("=" * 70)
    
    # Parse
    with open(args.snapshot_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    parser = SnapshotParser(content)
    files = parser.parse()
    
    if not files:
        print("❌ No se encontraron archivos válidos")
        sys.exit(1)
    
    print(f"\n📁 ARCHIVOS DETECTADOS ({len(files)}):")
    for i, f in enumerate(files, 1):
        print(f"  {i}. [{f['action']}] {f['path']}")
    
    # Confirmación
    if not args.dry_run:
        print(f"\n⚠️  ⚠️  ATENCIÓN:")
        print(f"   Se procesarán {len(files)} archivos")
        print(f"   Directorio: {args.tree_root_directory}")
        
        confirm = input("\n   Escribe 'SI' para confirmar: ").strip()
        if confirm != 'SI':
            print("❌ Operación cancelada")
            sys.exit(0)
    
    # Procesar
    if args.dry_run:
        print("\n🔍 MODO DRY-RUN - No se escribirán archivos")
        for f in files:
            print(f"  [DRY-RUN] {f['action']}: {f['path']}")
    else:
        backup_manager = BackupManager(backup_dir, args.tree_root_directory)
        processor = FileProcessor(args.tree_root_directory, backup_manager)
        
        results, processed_count = processor.process(files)
        
        print("\n📋 RESULTADOS:")
        for result in results:
            print(result)
        
        backup_stats = backup_manager.get_stats()
        show_summary({}, backup_stats, processed_count)

if __name__ == "__main__":
    main()