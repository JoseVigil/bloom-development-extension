#!/usr/bin/env python3
"""
PROCESADOR DE CODEBASE SNAPSHOT v4.0 - CON NORMALIZADOR INTEGRADO
Compatible con formato Claude + validación contra tree + normalización automática
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
import subprocess

# ============================================
# NORMALIZADOR EMBEBIDO
# ============================================

HEADER_RE = re.compile(r'^##\s*Archivo\s+(\d+)\s*:\s*(.+?)\s*\((MODIFICAR|CREAR NUEVO)\)\s*$', re.IGNORECASE)
HEADER_LOOSE_RE = re.compile(r'^##\s*(Archivo\s*\d*\s*:\s*.+)$', re.IGNORECASE)
BACKTICK_FENCE_RE = re.compile(r'^```.*$')
TAB_RE = re.compile(r'\t')
SEPARATOR_RE = re.compile(r'^---+\s*$')

class NormalizerSection:
    def __init__(self, raw_header: str = "", index: Optional[int] = None, path: str = "", action: str = ""):
        self.raw_header = raw_header
        self.index = index
        self.path = path
        self.action = action
        self.raw_lines: List[str] = []
        self.normalized_lines: List[str] = []
        self.problems: List[str] = []

    def add_line(self, line: str):
        self.raw_lines.append(line.rstrip("\n"))

    def detect_problems_and_normalize(self):
        lines = [TAB_RE.sub(" " * 4, l) for l in self.raw_lines]

        inside_fence = False
        stripped_lines: List[str] = []
        fences_found = 0

        for l in lines:
            # Detectar y remover backticks
            if BACKTICK_FENCE_RE.match(l.strip()):
                fences_found += 1
                inside_fence = not inside_fence
                continue
            
            # Detectar y remover separadores ---
            if SEPARATOR_RE.match(l.strip()):
                continue
            
            stripped_lines.append(l)

        if fences_found:
            self.problems.append(f"Se eliminaron {fences_found} fences de triple backticks")

        # Detectar indentación mínima
        min_indent = None
        for l in stripped_lines:
            if l.strip() == "":
                continue
            lead = len(l) - len(l.lstrip(" "))
            if min_indent is None or lead < min_indent:
                min_indent = lead

        if min_indent is None:
            self.problems.append("Sección vacía detectada")
            min_indent = 0
        elif min_indent > 4:
            self.problems.append(f"Indentación excesiva detectada (min={min_indent}, se corregirá a 4)")

        # Normalizar indentación a 4 espacios
        normalized = []
        for l in stripped_lines:
            if l.strip() == "":
                normalized.append("")
                continue

            lead = len(l) - len(l.lstrip(" "))
            to_remove = min(lead, min_indent) if min_indent else 0
            new_line = l[to_remove:]
            new_line = TAB_RE.sub(" " * 4, new_line)
            
            # Solo agregar 4 espacios si la línea no está vacía
            if new_line.strip():
                normalized.append(" " * 4 + new_line.rstrip())
            else:
                normalized.append("")

        self.normalized_lines = normalized

    def assemble_section_text(self) -> List[str]:
        out = []
        header = self.raw_header.strip()

        if not HEADER_RE.match(header):
            loose = HEADER_LOOSE_RE.match(header)
            if loose:
                repaired = f"## Archivo: {loose.group(1).strip()} (MODIFICAR)"
                self.problems.append("Header reparado")
                header = repaired
            else:
                self.problems.append("Header inválido")

        out.append(header)
        out.append("")

        if self.normalized_lines:
            out.extend(self.normalized_lines)
        else:
            out.append("    # SECCION VACIA - revisar")
            self.problems.append("Sección vacía insertada")

        out.append("")
        return out


def parse_sections_for_normalization(lines: List[str]) -> List[NormalizerSection]:
    sections: List[NormalizerSection] = []
    current: Optional[NormalizerSection] = None
    
    for raw in lines:
        l = raw.rstrip("\n")
        stripped = l.strip()

        if stripped.startswith("##"):
            if current is not None:
                sections.append(current)

            m = HEADER_RE.match(stripped)
            if m:
                idx = int(m.group(1))
                path = m.group(2).strip()
                action = m.group(3).upper()
                header_text = f"## Archivo {idx}: {path} ({action})"
                current = NormalizerSection(raw_header=header_text, index=idx, path=path, action=action)
            else:
                current = NormalizerSection(raw_header=stripped)
                current.problems.append("Header mal formado detectado")

            continue

        if current is None:
            current = NormalizerSection(raw_header="## Archivo 0: prefacio (MODIFICAR)", index=0, path="prefacio", action="MODIFICAR")
            current.problems.append("Contenido antes del primer header")

        current.add_line(l)

    if current is not None:
        sections.append(current)

    return sections


def normalize_snapshot_content(content: str) -> Tuple[str, Dict]:
    """Normaliza el contenido del snapshot"""
    lines = content.split('\n')
    sections = parse_sections_for_normalization(lines)
    
    stats = {
        "total_sections": len(sections),
        "sections_with_problems": 0,
        "total_problems": 0
    }
    
    output: List[str] = []
    
    for sec in sections:
        sec.detect_problems_and_normalize()
        
        if sec.problems:
            stats["sections_with_problems"] += 1
            stats["total_problems"] += len(sec.problems)
        
        output.extend(sec.assemble_section_text())
    
    return '\n'.join(output), stats


# ============================================
# CÓDIGO ORIGINAL DE INTEGRACIÓN
# ============================================

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
        
        dir_stack = {}
        root_dir = None
        
        for line in lines:
            if not line.strip():
                continue
            
            if not root_dir and line.strip().endswith('/') and not any(c in line for c in ['├', '│', '└', '─']):
                root_dir = line.strip().rstrip('/')
                continue
            
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
            
            name = line[i:].strip()
            if not name:
                continue
            
            level = indent // 4
            
            keys_to_remove = [k for k in dir_stack if k >= level]
            for k in keys_to_remove:
                del dir_stack[k]
            
            if name.endswith('/'):
                dir_name = name.rstrip('/')
                dir_stack[level] = dir_name
            else:
                path_parts = []
                for l in sorted(dir_stack.keys()):
                    path_parts.append(dir_stack[l])
                path_parts.append(name)
                
                file_path = '/'.join(path_parts)
                self.valid_paths.add(file_path)
                
                if path_parts and path_parts[0] == root_dir:
                    file_path_clean = '/'.join(path_parts[1:])
                    self.valid_paths.add(file_path_clean)
                
                dir_path = '/'.join(path_parts[:-1])
                if dir_path not in self.tree_structure:
                    self.tree_structure[dir_path] = []
                self.tree_structure[dir_path].append(name)
    
    def validate_path(self, path: str) -> Tuple[bool, str]:
        """Valida si un path existe en el tree"""
        if not self.tree_file:
            full_path = os.path.join(self.project_root, path)
            exists = os.path.exists(full_path)
            return (True, "⚠️  No tree file - validating against filesystem")
        
        if path in self.valid_paths:
            return (True, "✅ Path exists in tree")
        
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
    """Parser robusto para codebase snapshots de Claude - VERSIÓN MEJORADA"""
    
    SECTION_PATTERN = r'^## Archivo \d+: (.+?) \((MODIFICAR|CREAR NUEVO)\)$'
    
    def __init__(self, content: str):
        self.content = content
        self.lines = content.split('\n')
        
    def parse(self) -> List[Dict]:
        """
        Parse usando el formato estandarizado de Claude
        MEJORADO: Maneja correctamente template strings de JS/TS
        """
        files = []
        current_file = None
        current_content_lines = []
        in_code_block = False
        
        # Estados para rastreo de template strings
        in_template_string = False
        template_string_char = None
        escape_next = False
        
        for i, line in enumerate(self.lines):
            # Detectar inicio de nueva sección (solo si NO estamos en template string)
            match = re.match(self.SECTION_PATTERN, line)
            if match and not in_template_string:
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
                in_template_string = False
                template_string_char = None
                escape_next = False
                continue
            
            # Detectar otros headers (solo si NO estamos en template string)
            if (line.startswith('## ') or line.startswith('# ')) and not in_template_string:
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
            
            # Si estamos en un bloque de código, procesar y rastrear template strings
            if in_code_block and current_file:
                in_template_string, template_string_char, escape_next = \
                    self._track_template_string_state(
                        line, 
                        in_template_string, 
                        template_string_char,
                        escape_next
                    )
                
                current_content_lines.append(line)
        
        # Procesar último archivo
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
    
    def _track_template_string_state(
        self, 
        line: str, 
        in_template: bool, 
        template_char: Optional[str],
        escape_next: bool
    ) -> Tuple[bool, Optional[str], bool]:
        """
        Rastrea si estamos dentro de un template string de JS/TS
        
        Retorna: (in_template, template_char, escape_next)
        
        Maneja:
        - Template strings con backticks (`)
        - Caracteres de escape (\\)
        - Comentarios de línea (//)
        - Strings anidados
        """
        stripped = line.strip()
        
        i = 0
        while i < len(stripped):
            char = stripped[i]
            
            # Si el carácter anterior era escape, ignorar este
            if escape_next:
                escape_next = False
                i += 1
                continue
            
            # Detectar escape character
            if char == '\\':
                escape_next = True
                i += 1
                continue
            
            # Si NO estamos en template, buscar inicio
            if not in_template:
                if char == '`':
                    # Verificar que no sea dentro de un comentario
                    if not self._is_in_comment(stripped[:i]):
                        in_template = True
                        template_char = '`'
            
            # Si YA estamos en template, buscar cierre
            else:
                if char == template_char:
                    in_template = False
                    template_char = None
            
            i += 1
        
        return in_template, template_char, escape_next
    
    def _is_in_comment(self, text: str) -> bool:
        """
        Verifica si el texto está dentro de un comentario de línea (//)
        Ignora // dentro de strings
        """
        in_string = False
        string_char = None
        
        for i, char in enumerate(text):
            # Detectar inicio/fin de string
            if char in ['"', "'"] and (i == 0 or text[i-1] != '\\'):
                if not in_string:
                    in_string = True
                    string_char = char
                elif char == string_char:
                    in_string = False
                    string_char = None
            
            # Detectar comentario (solo si no estamos en string)
            if not in_string and i < len(text) - 1:
                if text[i:i+2] == '//':
                    return True
        
        return False
    
    def _extract_indented_code(self, lines: List[str]) -> str:
        """Extrae código removiendo indentación base"""
        if not lines:
            return ''
        
        # Remover líneas vacías al inicio
        while lines and not lines[0].strip():
            lines.pop(0)
        
        if not lines:
            return ''
        
        # Detectar indentación mínima (ignorando líneas vacías)
        indent_levels = []
        for line in lines:
            if line.strip():
                spaces = len(line) - len(line.lstrip(' '))
                indent_levels.append(spaces)
        
        if not indent_levels:
            return ''
        
        min_indent = min(indent_levels)
        
        # Remover indentación base
        code_lines = []
        for line in lines:
            if line.strip():
                if len(line) >= min_indent:
                    code_lines.append(line[min_indent:])
                else:
                    code_lines.append(line)
            else:
                code_lines.append('')
        
        # Remover líneas vacías al final
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
            
            if not dry_run:
                print("\n🔍 FASE 2: ESCRITURA TEMPORAL")
                print("=" * 70)
                
                for file_info in files:
                    temp_path = self._write_to_temp(file_info)
                    if temp_path:
                        print(f"  ✅ Temp: {os.path.basename(temp_path)}")
                
                print("\n💾 FASE 3: COMMIT")
                print("=" * 70)
                
                for file_info in files:
                    result = self._commit_file(file_info)
                    if result:
                        self.results.append(result)
                        processed_count += 1
            else:
                print("\n🔍 DRY-RUN: Acciones que se ejecutarían")
                print("=" * 70)
                for file_info in files:
                    normalized_path = os.path.normpath(file_info['path'])
                    full_path = os.path.join(self.project_root, normalized_path)
                    action = "MODIFICAR" if os.path.exists(full_path) else "CREAR"
                    size = len(file_info['content'])
                    print(f"  [{action}] {file_info['path']} ({size} bytes)")
                    self.results.append(f"[DRY-RUN] {action}: {file_info['path']}")
                processed_count = len(files)
            
            return (self.results, processed_count, self.warnings)
            
        except Exception as e:
            print(f"\n❌ ERROR: {str(e)}")
            import traceback
            traceback.print_exc()
            return ([], 0, [f"Error crítico: {str(e)}"])
        
        finally:
            if self.temp_dir and os.path.exists(self.temp_dir):
                shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def _validate_file(self, file_info: Dict) -> Tuple[bool, str]:
        """Valida un archivo antes de procesarlo"""
        path = file_info['path']
        content = file_info['content']
        
        if not content or len(content.strip()) < 10:
            return (False, f"❌ Contenido insuficiente ({len(content)} chars)")
        
        if not self._is_safe_path(path):
            return (False, f"❌ Path inseguro (contiene ..)")
        
        normalized_path = os.path.normpath(path)
        full_path = os.path.join(self.project_root, normalized_path)
        file_exists = os.path.exists(full_path)
        
        if self.tree_validator.tree_file and file_exists:
            path_valid, tree_msg = self.tree_validator.validate_path(path)
            if not path_valid:
                return (False, tree_msg)
            actual_action = "MODIFICAR"
            return (True, f"✅ {actual_action}")
        
        actual_action = "CREAR" if not file_exists else "MODIFICAR"
        return (True, f"✅ {actual_action}")
    
    def _is_safe_path(self, path: str) -> bool:
        """Valida que el path sea seguro"""
        if '..' in path:
            return False
        
        if any(c in path for c in ['${', '`', '<', '>', '|', ';']):
            return False
        
        return True
    
    def _write_to_temp(self, file_info: Dict) -> Optional[str]:
        """Escribe archivo en directorio temporal"""
        normalized_path = os.path.normpath(file_info['path'])
        temp_path = os.path.join(self.temp_dir, normalized_path)
        
        temp_dir = os.path.dirname(temp_path)
        if temp_dir:
            os.makedirs(temp_dir, exist_ok=True)
        
        with open(temp_path, 'w', encoding='utf-8') as f:
            f.write(file_info['content'])
        
        return temp_path
    
    def _commit_file(self, file_info: Dict) -> Optional[str]:
        """Mueve archivo de temp a destino final (con backup)"""
        normalized_path = os.path.normpath(file_info['path'])
        
        temp_path = os.path.join(self.temp_dir, normalized_path)
        final_path = os.path.join(self.project_root, normalized_path)
        
        print(f"\n📄 Procesando: {file_info['path']}")
        print(f"   📍 Destino: {final_path}")
        
        file_exists = os.path.exists(final_path)
        backup_path = None
        
        if file_exists:
            backup_path = self.backup_manager.create_backup(final_path)
            if backup_path:
                print(f"   💾 Backup: {os.path.basename(backup_path)}")
        
        final_dir = os.path.dirname(final_path)
        if final_dir:
            os.makedirs(final_dir, exist_ok=True)
        
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


def show_summary(tree_stats: Dict, backup_stats: Dict, processed_count: int, warnings: List[str], norm_stats: Optional[Dict]):
    """Muestra resumen final"""
    print("\n" + "=" * 70)
    print("📊 RESUMEN DE OPERACIÓN")
    print("=" * 70)
    
    if norm_stats:
        print(f"🔧 Normalización aplicada:")
        print(f"   - Secciones procesadas: {norm_stats['total_sections']}")
        print(f"   - Secciones con problemas: {norm_stats['sections_with_problems']}")
        print(f"   - Problemas corregidos: {norm_stats['total_problems']}")
        print("")
    
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
        for warning in warnings[:5]:
            print(f"  {warning}")
        if len(warnings) > 5:
            print(f"  ... y {len(warnings) - 5} más")
    
    print("=" * 70)


def main():
    parser = argparse.ArgumentParser(
        description='PROCESADOR DE CODEBASE SNAPSHOT v4.0 - CON NORMALIZADOR INTEGRADO',
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    
    parser.add_argument('snapshot_file', help='Archivo .md con el snapshot de la codebase')
    parser.add_argument('project_root', help='Directorio raíz donde se regenerarán los archivos')
    parser.add_argument('--tree', type=str, help='Archivo tree.txt para validar estructura')
    parser.add_argument('--backup-dir', nargs='?', const="", help='Directorio para backups')
    parser.add_argument('--dry-run', action='store_true', help='Simula operación sin modificar archivos')
    parser.add_argument('--skip-normalization', action='store_true', help='Omitir normalización automática')
    
    args = parser.parse_args()
    
    # Normalizar paths
    args.snapshot_file = os.path.abspath(args.snapshot_file)
    args.project_root = os.path.abspath(args.project_root)
    if args.tree:
        args.tree = os.path.abspath(args.tree)
    if args.backup_dir and args.backup_dir != "":
        args.backup_dir = os.path.abspath(args.backup_dir)
    
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
    
    print("🌸 PROCESADOR DE SNAPSHOT v4.0 - CON NORMALIZADOR")
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
    
    # Leer contenido
    with open(args.snapshot_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # NORMALIZACIÓN AUTOMÁTICA
    norm_stats = None
    if not args.skip_normalization:
        print("\n🔧 NORMALIZANDO SNAPSHOT...")
        print("=" * 70)
        content, norm_stats = normalize_snapshot_content(content)
        print(f"✅ Normalización completada:")
        print(f"   - Secciones: {norm_stats['total_sections']}")
        print(f"   - Problemas corregidos: {norm_stats['total_problems']}")
        print("=" * 70)
    
    # Parse
    snapshot_parser = SnapshotParser(content)
    files = snapshot_parser.parse()
    
    if not files:
        print("❌ No se encontraron archivos válidos en el snapshot")
        sys.exit(1)
    
    print(f"\n📋 ARCHIVOS DETECTADOS ({len(files)}):")
    for i, f in enumerate(files, 1):
        print(f"  {i}. [{f['action']}] {f['path']} ({len(f['content'])} chars)")
    
    # Inicializar validadores
    tree_validator = TreeValidator(args.tree, args.project_root)
    tree_stats = tree_validator.get_stats()
    
    if args.tree:
        print(f"\n🌳 Tree cargado: {tree_stats['total_files']} archivos")
    
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
    show_summary(tree_stats, backup_stats, processed_count, warnings, norm_stats)
    
    print("\n✨ Operación completada exitosamente")


if __name__ == "__main__":
    main()