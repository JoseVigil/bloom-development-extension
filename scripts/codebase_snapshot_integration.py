#!/usr/bin/env python3
"""
PROCESADOR DE CODEBASE SNAPSHOT v3.0 - VALIDACIÓN ROBUSTA
Compatible con formato Claude + validación contra tree
"""

import os
import re
import sys
import shutil
import argparse
from datetime import datetime
from typing import List, Dict, Optional, Tuple, Set
from pathlib import Path
import tempfile
import json

class TreeValidator:
    """Valida snapshots contra árbol de directorios real"""
    
    def __init__(self, tree_file: Optional[str], project_root: str):
        self.tree_file = tree_file
        self.project_root = project_root
        self.valid_paths: Set[str] = set()
        self.tree_structure: Dict[str, List[str]] = {}
        
        if tree_file and os.path.exists(tree_file):
            self._parse_tree()
    
    def _parse_tree(self) -> None:
        """Parsea archivo tree.txt para extraer rutas válidas"""
        with open(self.tree_file, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        
        # Stack de directorios por nivel de indentación
        dir_stack = {}
        root_dir = None
        
        for line in lines:
            if not line.strip():
                continue
            
            # Detectar directorio raíz (primera línea sin símbolos tree)
            if not root_dir and line.strip().endswith('/') and not any(c in line for c in ['├', '│', '└', '─']):
                root_dir = line.strip().rstrip('/')
                continue
            
            # Calcular nivel de indentación
            # Contar caracteres antes del nombre real
            original_line = line
            indent = 0
            i = 0
            while i < len(line):
                if line[i] in '│├└':
                    indent += 1
                    i += 1
                elif line[i] == '─':
                    i += 1
                    while i < len(line) and line[i] == '─':
                        i += 1
                    break
                elif line[i] == ' ':
                    indent += 1
                    i += 1
                else:
                    break
            
            # Extraer nombre limpio
            name = line[i:].strip()
            if not name:
                continue
            
            # Calcular nivel real (cada nivel tree son ~4 chars)
            level = indent // 4
            
            # Actualizar stack de directorios
            # Limpiar niveles superiores
            keys_to_remove = [k for k in dir_stack if k >= level]
            for k in keys_to_remove:
                del dir_stack[k]
            
            # Es directorio
            if name.endswith('/'):
                dir_name = name.rstrip('/')
                dir_stack[level] = dir_name
            else:
                # Es archivo - construir ruta completa
                path_parts = []
                for l in sorted(dir_stack.keys()):
                    path_parts.append(dir_stack[l])
                path_parts.append(name)
                
                file_path = '/'.join(path_parts)
                self.valid_paths.add(file_path)
                
                # Si el primer componente es el root_dir, también agregar sin él
                if path_parts and path_parts[0] == root_dir:
                    file_path_clean = '/'.join(path_parts[1:])
                    self.valid_paths.add(file_path_clean)
                
                # Guardar en estructura
                dir_path = '/'.join(path_parts[:-1])
                if dir_path not in self.tree_structure:
                    self.tree_structure[dir_path] = []
                self.tree_structure[dir_path].append(name)
    
    def validate_path(self, path: str) -> Tuple[bool, str]:
        """Valida si un path existe en el tree"""
        if not self.tree_file:
            # Si no hay tree, validar contra filesystem
            full_path = os.path.join(self.project_root, path)
            exists = os.path.exists(full_path)
            return (True, "⚠️  No tree file - validating against filesystem")
        
        if path in self.valid_paths:
            return (True, "✅ Path exists in tree")
        
        # Verificar si es un directorio en el tree
        for valid_path in self.valid_paths:
            if valid_path.startswith(path + '/'):
                return (True, "✅ Path is a directory in tree")
        
        return (False, f"❌ Path '{path}' NOT found in tree")
    
    def get_stats(self) -> Dict:
        """Estadísticas del tree"""
        return {
            'total_files': len(self.valid_paths),
            'directories': len(self.tree_structure),
            'has_tree': bool(self.tree_file)
        }


class SnapshotParser:
    """Parser robusto para codebase snapshots de Claude"""
    
    # Acepta ambos formatos: "MODIFICAR" y "CREAR NUEVO"
    SECTION_PATTERN = r'^## Archivo \d+: (.+?) \((MODIFICAR|CREAR NUEVO)\)$'
    
    def __init__(self, content: str):
        self.content = content
        self.lines = content.split('\n')
        
    def parse(self) -> List[Dict]:
        """Parse usando el formato estandarizado de Claude"""
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
                            'content': content,
                            'line_number': current_file['line_number']
                        })
                
                # Iniciar nuevo archivo
                current_file = {
                    'path': match.group(1),
                    'action': match.group(2),
                    'line_number': i + 1
                }
                current_content_lines = []
                in_code_block = True
                continue
            
            # Detectar fin de sección (nueva sección ## o #)
            if line.startswith('## ') or line.startswith('# '):
                if current_file and in_code_block:
                    content = self._extract_indented_code(current_content_lines)
                    if content:
                        files.append({
                            'path': current_file['path'],
                            'action': current_file['action'],
                            'content': content,
                            'line_number': current_file['line_number']
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
                    'content': content,
                    'line_number': current_file['line_number']
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
            # Si no tiene indentación y no está vacía, ignorar (es texto descriptivo)
        
        # Remover líneas vacías al inicio y final
        while code_lines and not code_lines[0].strip():
            code_lines.pop(0)
        while code_lines and not code_lines[-1].strip():
            code_lines.pop()
        
        return '\n'.join(code_lines)


class BackupManager:
    """Gestión inteligente de backups con timestamps"""
    
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


class TransactionalProcessor:
    """Procesador de archivos con rollback transaccional"""
    
    def __init__(self, project_root: str, backup_manager: BackupManager, tree_validator: TreeValidator):
        self.project_root = project_root
        self.backup_manager = backup_manager
        self.tree_validator = tree_validator
        self.temp_dir = None
        self.results = []
        self.warnings = []
        
    def process(self, files: List[Dict], dry_run: bool = False) -> Tuple[List[str], int, List[str]]:
        """Procesa lista de archivos de forma transaccional"""
        if not dry_run:
            self.temp_dir = tempfile.mkdtemp(prefix='bloom_snapshot_')
        
        processed_count = 0
        validation_errors = []
        
        try:
            # FASE 1: Validación completa
            print("\n🔍 FASE 1: VALIDACIÓN")
            print("=" * 70)
            
            for file_info in files:
                path_valid, msg = self._validate_file(file_info)
                
                if not path_valid:
                    validation_errors.append(f"Line {file_info['line_number']}: {msg}")
                
                print(f"  {msg} - {file_info['path']}")
            
            if validation_errors:
                print("\n❌ VALIDACIÓN FALLIDA:")
                for error in validation_errors:
                    print(f"  {error}")
                return ([], 0, validation_errors)
            
            print("\n✅ Validación exitosa")
            
            # FASE 2: Escritura temporal (si no es dry-run)
            if not dry_run:
                print("\n📝 FASE 2: ESCRITURA TEMPORAL")
                print("=" * 70)
                
                for file_info in files:
                    temp_path = self._write_to_temp(file_info)
                    if temp_path:
                        print(f"  ✅ Temp: {os.path.basename(temp_path)}")
                
                # FASE 3: Commit (mover de temp a destino final)
                print("\n💾 FASE 3: COMMIT")
                print("=" * 70)
                
                for file_info in files:
                    result = self._commit_file(file_info)
                    if result:
                        self.results.append(result)
                        processed_count += 1
            else:
                # Dry-run: solo mostrar qué se haría
                print("\n🔍 DRY-RUN: Acciones que se ejecutarían")
                print("=" * 70)
                for file_info in files:
                    full_path = os.path.join(self.project_root, file_info['path'])
                    action = "MODIFICAR" if os.path.exists(full_path) else "CREAR"
                    size = len(file_info['content'])
                    print(f"  [{action}] {file_info['path']} ({size} bytes)")
                    self.results.append(f"[DRY-RUN] {action}: {file_info['path']}")
                processed_count = len(files)
            
            return (self.results, processed_count, self.warnings)
            
        except Exception as e:
            # Rollback automático (no hay nada que limpiar si falló en validación)
            print(f"\n❌ ERROR: {str(e)}")
            return ([], 0, [f"Error crítico: {str(e)}"])
        
        finally:
            # Limpiar directorio temporal
            if self.temp_dir and os.path.exists(self.temp_dir):
                shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def _validate_file(self, file_info: Dict) -> Tuple[bool, str]:
        """Valida un archivo antes de procesarlo"""
        path = file_info['path']
        action = file_info['action']
        content = file_info['content']
        
        # Validar path contra tree
        path_valid, tree_msg = self.tree_validator.validate_path(path)
        
        if not path_valid:
            return (False, tree_msg)
        
        # Validar contenido mínimo
        if not content or len(content.strip()) < 10:
            return (False, f"❌ Contenido insuficiente ({len(content)} chars)")
        
        # Validar coherencia de acción
        full_path = os.path.join(self.project_root, path)
        file_exists = os.path.exists(full_path)
        
        if action == "MODIFICAR" and not file_exists:
            self.warnings.append(f"⚠️  '{path}' marcado como MODIFICAR pero no existe (se creará)")
            return (True, "⚠️  MODIFICAR->CREAR")
        
        if action == "CREAR NUEVO" and file_exists:
            self.warnings.append(f"⚠️  '{path}' marcado como CREAR NUEVO pero ya existe (se sobrescribirá)")
            return (True, "⚠️  CREAR->MODIFICAR")
        
        # Validar seguridad del path
        if not self._is_safe_path(path):
            return (False, f"❌ Path inseguro (contiene ..)")
        
        return (True, tree_msg)
    
    def _is_safe_path(self, path: str) -> bool:
        """Valida que el path sea seguro"""
        # No debe contener navegación hacia arriba
        if '..' in path:
            return False
        
        # No debe contener caracteres peligrosos
        if any(c in path for c in ['${', '`', '<', '>', '|', ';']):
            return False
        
        return True
    
    def _write_to_temp(self, file_info: Dict) -> Optional[str]:
        """Escribe archivo en directorio temporal"""
        temp_path = os.path.join(self.temp_dir, file_info['path'])
        
        os.makedirs(os.path.dirname(temp_path), exist_ok=True)
        
        with open(temp_path, 'w', encoding='utf-8') as f:
            f.write(file_info['content'])
        
        return temp_path
    
    def _commit_file(self, file_info: Dict) -> Optional[str]:
        """Mueve archivo de temp a destino final (con backup)"""
        temp_path = os.path.join(self.temp_dir, file_info['path'])
        final_path = os.path.join(self.project_root, file_info['path'])
        
        print(f"\n📄 Procesando: {file_info['path']}")
        print(f"   📍 Destino: {final_path}")
        
        # Backup si existe
        file_exists = os.path.exists(final_path)
        backup_path = None
        
        if file_exists:
            backup_path = self.backup_manager.create_backup(final_path)
            if backup_path:
                print(f"   💾 Backup: {os.path.basename(backup_path)}")
        
        # Crear directorio destino
        os.makedirs(os.path.dirname(final_path), exist_ok=True)
        
        # Mover de temp a final
        shutil.move(temp_path, final_path)
        
        action_display = "MODIFICADO" if file_exists else "CREADO"
        result = f"✅ {action_display}: {file_info['path']}"
        
        if backup_path:
            result += f" (backup: {os.path.basename(backup_path)})"
        
        print(f"   ✅ {action_display}")
        
        return result


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


def show_summary(tree_stats: Dict, backup_stats: Dict, processed_count: int, warnings: List[str]):
    """Muestra resumen final"""
    print("\n" + "=" * 70)
    print("📊 RESUMEN DE OPERACIÓN")
    print("=" * 70)
    print(f"✅ Archivos procesados: {processed_count}")
    
    if tree_stats['has_tree']:
        print(f"🌳 Tree validado: {tree_stats['total_files']} archivos, {tree_stats['directories']} dirs")
    else:
        print(f"⚠️  Sin tree.txt - validación contra filesystem")
    
    if backup_stats['count'] > 0:
        size_mb = backup_stats['total_size'] / (1024 * 1024)
        print(f"💾 Backups creados: {backup_stats['count']}")
        print(f"💾 Tamaño total: {size_mb:.2f} MB")
    else:
        print(f"⚠️  No se crearon backups")
    
    if warnings:
        print(f"\n⚠️  ADVERTENCIAS ({len(warnings)}):")
        for warning in warnings[:5]:  # Mostrar máximo 5
            print(f"  {warning}")
        if len(warnings) > 5:
            print(f"  ... y {len(warnings) - 5} más")
    
    print("=" * 70)


def main():
    parser = argparse.ArgumentParser(
        description='''
PROCESADOR DE CODEBASE SNAPSHOT v3.0 - VALIDACIÓN ROBUSTA
Regenera una codebase completa a partir de un snapshot de Claude en formato Markdown.
Valida contra árbol de directorios (tree.txt) y aplica cambios de forma transaccional.
        ''',
        epilog='''
Ejemplos de uso:
  %(prog)s snapshot.md ./mi_proyecto
  %(prog)s snapshot.md ./proyecto --tree plugin_tree.txt
  %(prog)s cambios.md ./src --backup-dir --tree tree.txt
  %(prog)s snapshot.md . --dry-run
  %(prog)s updates.md ./app --backup-dir ./backups --tree structure.txt
        ''',
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    
    parser.add_argument(
        'snapshot_file', 
        help='Archivo .md con el snapshot de la codebase (formato Claude estándar)'
    )
    parser.add_argument(
        'project_root', 
        help='Directorio raíz donde se regenerarán los archivos'
    )
    parser.add_argument(
        '--tree',
        type=str,
        help='Archivo tree.txt para validar estructura (ej: plugin_tree.txt)'
    )
    parser.add_argument(
        '--backup-dir', 
        nargs='?', 
        const="",
        help='Directorio para backups. Sin valor: backups automáticos. Con ruta: usa directorio específico. Omítelo para no hacer backups.'
    )
    parser.add_argument(
        '--dry-run', 
        action='store_true',
        help='Simula operación sin modificar archivos (solo muestra qué haría)'
    )
    parser.add_argument(
        '--debug-tree',
        action='store_true',
        help='Muestra todos los archivos detectados en el tree y sale'
    )
    
    args = parser.parse_args()
    
    # Validaciones
    if not os.path.exists(args.snapshot_file):
        print(f"❌ Snapshot no existe: {args.snapshot_file}")
        sys.exit(1)
    
    if not os.path.exists(args.project_root):
        print(f"❌ Directorio no existe: {args.project_root}")
        sys.exit(1)
    
    if args.tree and not os.path.exists(args.tree):
        print(f"❌ Tree file no existe: {args.tree}")
        sys.exit(1)
    
    # Setup
    backup_dir = setup_backup_directory(args.backup_dir, args.project_root)
    
    print("🌸 PROCESADOR DE SNAPSHOT v3.0")
    print("=" * 70)
    print(f"📂 Proyecto: {args.project_root}")
    print(f"📋 Snapshot: {args.snapshot_file}")
    if args.tree:
        print(f"🌳 Tree: {args.tree}")
    if backup_dir:
        print(f"💾 Backups: {backup_dir}")
    if args.dry_run:
        print(f"🔍 MODO DRY-RUN (no se escribirá)")
    print("=" * 70)
    
    # Parse
    with open(args.snapshot_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    snapshot_parser = SnapshotParser(content)
    files = snapshot_parser.parse()
    
    if not files:
        print("❌ No se encontraron archivos válidos en el snapshot")
        sys.exit(1)
    
    print(f"\n📁 ARCHIVOS DETECTADOS ({len(files)}):")
    for i, f in enumerate(files, 1):
        print(f"  {i}. [{f['action']}] {f['path']}")
    
    # Inicializar validadores
    tree_validator = TreeValidator(args.tree, args.project_root)
    tree_stats = tree_validator.get_stats()
    
    if args.tree:
        print(f"\n🌳 Tree cargado: {tree_stats['total_files']} archivos")
        
        if args.debug_tree:
            print("\n🔍 DEBUG: Archivos detectados en tree:")
            print("=" * 70)
            for path in sorted(tree_validator.valid_paths):
                print(f"  {path}")
            print("=" * 70)
            print(f"\nTotal: {len(tree_validator.valid_paths)} archivos")
            
            print("\n🔍 DEBUG: Comparación snapshot vs tree:")
            print("=" * 70)
            for f in files:
                exists = f['path'] in tree_validator.valid_paths
                status = "✅" if exists else "❌"
                print(f"  {status} {f['path']}")
            print("=" * 70)
            sys.exit(0)
    
    # Confirmación
    if not args.dry_run:
        print(f"\n⚠️  ⚠️  ATENCIÓN:")
        print(f"   Se procesarán {len(files)} archivos")
        print(f"   Directorio: {args.project_root}")
        
        confirm = input("\n   Escribe 'SI' para confirmar: ").strip()
        if confirm != 'SI':
            print("❌ Operación cancelada")
            sys.exit(0)
    
    # Procesar
    backup_manager = BackupManager(backup_dir, args.project_root)
    processor = TransactionalProcessor(args.project_root, backup_manager, tree_validator)
    
    results, processed_count, warnings = processor.process(files, args.dry_run)
    
    if not results and not args.dry_run:
        print("\n❌ Procesamiento fallido - no se modificaron archivos")
        sys.exit(1)
    
    print("\n📋 RESULTADOS:")
    for result in results:
        print(result)
    
    backup_stats = backup_manager.get_stats()
    show_summary(tree_stats, backup_stats, processed_count, warnings)
    
    print("\n✨ Operación completada exitosamente")


if __name__ == "__main__":
    main()