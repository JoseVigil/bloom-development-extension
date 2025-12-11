"""
Universal Files Compressor - Genera archivos comprimidos para AI
Soporta codebase (.py, .ts, .js, etc) y docbase (.bl, .md)
Versión 2.1 - Soporte para múltiples inputs
"""

import os
import json
import hashlib
import argparse
from datetime import datetime
from typing import Dict, List, Any, Optional, Tuple
from pathlib import Path
from code_compressor import CodeCompressor
import fnmatch  # Para matching de patrones con wildcards


class FilesCompressor:
    """
    Comprime archivos de código o documentación en formato JSON optimizado para AI
    """
    
    # Mapeo de extensiones a lenguajes
    LANGUAGE_MAP = {
        # Code
        '.py': 'python',
        '.ts': 'typescript',
        '.tsx': 'typescript',
        '.js': 'javascript',
        '.jsx': 'javascript',
        '.java': 'java',
        '.cpp': 'cpp',
        '.c': 'c',
        '.cs': 'csharp',
        '.go': 'go',
        '.rs': 'rust',
        '.php': 'php',
        '.rb': 'ruby',
        '.swift': 'swift',
        '.kt': 'kotlin',
        '.scala': 'scala',
        '.html': 'html',
        '.css': 'css',
        '.scss': 'scss',
        '.json': 'json',
        '.yaml': 'yaml',
        '.yml': 'yaml',
        '.xml': 'xml',
        '.sql': 'sql',
        '.sh': 'bash',
        '.bat': 'batch',
        '.ps1': 'powershell',
        # Docs
        '.md': 'markdown',
        '.bl': 'markdown',  # BloomLang (tratado como markdown)
        '.txt': 'text',
        '.rst': 'restructuredtext',
    }
    
    # Extensiones ignoradas por defecto
    DEFAULT_IGNORE = {
        '__pycache__', '.git', '.svn', '.hg', 'node_modules', 
        '.venv', 'venv', 'env', '.env', 'dist', 'build',
        '.idea', '.vscode', '.DS_Store', '*.pyc', '*.pyo',
        '*.so', '*.dylib', '*.dll', '*.exe', '*.bin'
    }
    
    def __init__(self, mode: str = 'codebase', preserve_comments: bool = True):
        """
        Args:
            mode: 'codebase' o 'docbase'
            preserve_comments: Si True, mantiene comentarios (recomendado para AI)
        """
        self.mode = mode
        self.compressor = CodeCompressor(preserve_comments=preserve_comments)
        self.stats = {
            'total_files': 0,
            'total_size_original': 0,
            'total_size_compressed': 0,
            'languages': {},
            'errors': []
        }
    
    def compress_paths(
        self,
        input_paths: List[str],
        output_dir: str = None,
        exclude_patterns: List[str] = None
    ) -> Tuple[str, str]:
        """
        Comprime múltiples paths (directorios o archivos individuales)
        
        Returns:
            Tuple[json_path, index_path]: Paths a los archivos generados
        """
        all_files_data = []
        source_paths = []
        
        for input_str in input_paths:
            input_path = Path(input_str).resolve()
            if not input_path.exists():
                raise FileNotFoundError(f"Path no encontrado: {input_str}")
            source_paths.append(str(input_path))
            
            print(f"📂 Escaneando: {input_path}")
            
            if input_path.is_dir():
                files_data = self._collect_files(input_path, exclude_patterns)
                # Prefijar relative_path con el nombre del directorio raíz para evitar conflictos
                root_name = input_path.name
                for file_data in files_data:
                    file_data['relative_path'] = Path(root_name) / file_data['relative_path']
                all_files_data.extend(files_data)
            elif input_path.is_file():
                ext = input_path.suffix.lower()
                # Verificar si la extensión es válida
                if self.mode == 'codebase' and ext in self.LANGUAGE_MAP and self.LANGUAGE_MAP[ext] not in ['markdown', 'text', 'restructuredtext']:
                    all_files_data.append({
                        'path': input_path,
                        'relative_path': input_path.name,
                        'extension': ext
                    })
                elif self.mode == 'docbase' and ext in {'.md', '.bl', '.txt', '.rst'}:
                    all_files_data.append({
                        'path': input_path,
                        'relative_path': input_path.name,
                        'extension': ext
                    })
                else:
                    print(f"⚠️ Archivo ignorado (extensión no válida para modo {self.mode}): {input_path}")
        
        if not all_files_data:
            raise ValueError(f"No se encontraron archivos válidos para {self.mode}")
        
        print(f"🎯 Modo: {self.mode}")
        print(f"📦 Procesando {len(all_files_data)} archivos de {len(input_paths)} paths...")
        
        # Comprimir archivos
        compressed_files = []
        index_entries = []
        
        for file_data in all_files_data:
            try:
                compressed = self._compress_file(file_data, file_data['path'].parent)
                compressed_files.append(compressed['file'])
                index_entries.append(compressed['index'])
                
                # Actualizar stats
                self.stats['total_files'] += 1
                lang = compressed['index']['l']
                self.stats['languages'][lang] = self.stats['languages'].get(lang, 0) + 1
                
            except Exception as e:
                error_msg = f"Error en {file_data['path']}: {str(e)}"
                self.stats['errors'].append(error_msg)
                print(f"⚠️  {error_msg}")
        
        # Determinar output directory
        if output_dir is None:
            output_path = Path.cwd()
        else:
            output_path = Path(output_dir).resolve()
            output_path.mkdir(parents=True, exist_ok=True)
        
        # Generar JSONs
        json_path = self._generate_main_json(compressed_files, output_path, source_paths)
        index_path = self._generate_index_json(index_entries, output_path)
        
        # Mostrar resumen
        self._print_summary(json_path, index_path)
        
        return str(json_path), str(index_path)
    
    def _collect_files(self, root_path: Path, exclude_patterns: List[str] = None) -> List[Dict]:
        """Recolecta archivos según el modo"""
        files = []
        exclude = list(self.DEFAULT_IGNORE)  # Convertir a lista para manejar wildcards
        
        if exclude_patterns:
            exclude.extend(exclude_patterns)
        
        # Determinar extensiones válidas según modo
        if self.mode == 'codebase':
            valid_extensions = {ext for ext, lang in self.LANGUAGE_MAP.items() 
                                if lang not in ['markdown', 'text', 'restructuredtext']}
        else:  # docbase
            valid_extensions = {'.md', '.bl', '.txt', '.rst'}
        
        for file_path in root_path.rglob('*'):
            if not file_path.is_file():
                continue
            
            # Verificar exclusiones
            str_path = str(file_path)
            skipped = False
            for pattern in exclude:
                if '*' in pattern or '?' in pattern:  # Patrones con wildcards
                    if fnmatch.fnmatch(str_path, pattern) or fnmatch.fnmatch(file_path.name, pattern):
                        skipped = True
                        break
                elif pattern in str_path:
                    skipped = True
                    break
            if skipped:
                continue
            
            # Verificar extensión
            if file_path.suffix.lower() not in valid_extensions:
                continue
            
            files.append({
                'path': file_path,
                'relative_path': file_path.relative_to(root_path),
                'extension': file_path.suffix.lower()
            })
        
        return files
    
    def _compress_file(self, file_data: Dict, root_path: Path) -> Dict:
        """Comprime un archivo individual"""
        file_path = file_data['path']
        rel_path = str(file_data['relative_path']).replace('\\', '/')
        
        # Leer contenido
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
        except UnicodeDecodeError:
            # Intentar con latin-1 como fallback
            with open(file_path, 'r', encoding='latin-1') as f:
                content = f.read()
        
        # Detectar lenguaje
        language = self.LANGUAGE_MAP.get(file_data['extension'], 'text')
        
        # Calcular hash y tamaño
        content_hash = hashlib.md5(content.encode('utf-8')).hexdigest()
        original_size = len(content.encode('utf-8'))
        loc = len([line for line in content.split('\n') if line.strip()])
        
        # Comprimir
        compressed_result = self.compressor.compress_file(content, language)
        compressed_size = compressed_result['stats']['compressed_size']
        
        # Actualizar stats globales
        self.stats['total_size_original'] += original_size
        self.stats['total_size_compressed'] += compressed_size
        
        return {
            'file': {
                'p': rel_path,
                'l': language,
                'h': content_hash,
                'c': compressed_result['c']
            },
            'index': {
                'p': rel_path,
                'l': language,
                'h': content_hash,
                's': original_size,
                'cs': compressed_size,
                'loc': loc,
                'ratio': compressed_result['stats']['ratio']
            }
        }
    
    def _generate_main_json(self, files: List[Dict], output_path: Path, source_paths: List[str]) -> Path:
        """Genera el archivo principal (.codebase.json o .docbase.json)"""
        filename = f".{self.mode}.json"
        json_path = output_path / filename
        
        compression_ratio = 0
        if self.stats['total_size_original'] > 0:
            compression_ratio = round(
                (1 - self.stats['total_size_compressed'] / self.stats['total_size_original']) * 100,
                2
            )
        
        data = {
            '_protocol': {
                'version': '2.1',
                'format': f'{self.mode}_compressed',
                'compression': 'gzip+base64',
                'encoding': 'utf-8'
            },
            'meta': {
                'source_paths': source_paths,
                'generated_at': datetime.utcnow().isoformat() + 'Z',
                'mode': self.mode,
                'total_files': self.stats['total_files'],
                'compression_stats': {
                    'original_size_bytes': self.stats['total_size_original'],
                    'compressed_size_bytes': self.stats['total_size_compressed'],
                    'compression_ratio_percent': compression_ratio
                },
                'languages': self.stats['languages']
            },
            'files': files,
            'usage': {
                'decompression': 'Use files_extractor.py to decompress',
                'command': f'python files_extractor.py --input {filename}',
                'protocol_doc': 'See PROTOCOL.md for format specification'
            }
        }
        
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        return json_path
    
    def _generate_index_json(self, entries: List[Dict], output_path: Path) -> Path:
        """Genera el archivo de índice"""
        filename = f".{self.mode}_index.json"
        index_path = output_path / filename
        
        # Calcular estadísticas agregadas
        total_size = sum(e['s'] for e in entries)
        total_compressed = sum(e['cs'] for e in entries)
        avg_ratio = round(sum(e['ratio'] for e in entries) / len(entries), 2) if entries else 0
        
        # Agrupar por directorio
        by_directory = {}
        for entry in entries:
            dir_name = str(Path(entry['p']).parent) or '.'
            if dir_name not in by_directory:
                by_directory[dir_name] = []
            by_directory[dir_name].append(entry)
        
        data = {
            '_index_version': '2.1',
            'mode': self.mode,
            'summary': {
                'total_files': len(entries),
                'total_size_bytes': total_size,
                'total_compressed_bytes': total_compressed,
                'average_compression_ratio': avg_ratio,
                'languages': self.stats['languages']
            },
            'by_directory': {
                dir_name: {
                    'file_count': len(files),
                    'files': sorted(files, key=lambda x: x['p'])
                }
                for dir_name, files in sorted(by_directory.items())
            },
            'all_files': sorted(entries, key=lambda x: x['p'])
        }
        
        with open(index_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        return index_path
    
    def _print_summary(self, json_path: Path, index_path: Path):
        """Imprime resumen de la operación"""
        print(f"\n✨ Compresión completada!")
        print(f"📊 Resumen:")
        print(f"   • Archivos procesados: {self.stats['total_files']}")
        print(f"   • Tamaño original: {self._format_bytes(self.stats['total_size_original'])}")
        print(f"   • Tamaño comprimido: {self._format_bytes(self.stats['total_size_compressed'])}")
        
        if self.stats['total_size_original'] > 0:
            ratio = (1 - self.stats['total_size_compressed'] / self.stats['total_size_original']) * 100
            print(f"   • Ratio de compresión: {ratio:.1f}%")
        
        print(f"\n📁 Archivos generados:")
        print(f"   • {json_path.name} ({self._format_bytes(json_path.stat().st_size)})")
        print(f"   • {index_path.name} ({self._format_bytes(index_path.stat().st_size)})")
        
        if self.stats['languages']:
            print(f"\n🔤 Lenguajes detectados:")
            for lang, count in sorted(self.stats['languages'].items(), key=lambda x: -x[1]):
                print(f"   • {lang}: {count} archivo(s)")
        
        if self.stats['errors']:
            print(f"\n⚠️  Errores: {len(self.stats['errors'])}")
            for error in self.stats['errors'][:5]:
                print(f"   • {error}")
    
    @staticmethod
    def _format_bytes(bytes_val: int) -> str:
        """Formatea bytes a formato legible"""
        for unit in ['B', 'KB', 'MB', 'GB']:
            if bytes_val < 1024.0:
                return f"{bytes_val:.1f} {unit}"
            bytes_val /= 1024.0
        return f"{bytes_val:.1f} TB"


def main():
    parser = argparse.ArgumentParser(
        description="Comprime archivos de código o documentación para AI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Ejemplos de uso:

  # Generar codebase desde directorio actual
  python files_compressor.py --mode codebase --input ./src
  
  # Generar docbase desde archivos .bl
  python files_compressor.py --mode docbase --input ./docs
  
  # Especificar directorio de salida
  python files_compressor.py --mode codebase --input ./src --output ./compressed
  
  # Excluir patrones específicos
  python files_compressor.py --mode codebase --input . --exclude tests,*.test.ts
  
  # Modo agresivo (sin comentarios)
  python files_compressor.py --mode codebase --input . --no-comments

  # Múltiples inputs (directorios y archivos)
  python files_compressor.py --mode codebase --input ./src1 ./src2 file.py --output ./compressed
        """
    )
    
    parser.add_argument('--mode', '-m', required=True, choices=['codebase', 'docbase'],
                        help="Tipo de compresión: 'codebase' para código, 'docbase' para docs")
    parser.add_argument('--input', '-i', required=True, nargs='+',
                        help="Paths de entrada (directorios o archivos individuales, separados por espacio)")
    parser.add_argument('--output', '-o',
                        help="Directorio de salida (default: directorio actual)")
    parser.add_argument('--exclude', '-e',
                        help="Patrones a excluir separados por coma (ej: tests,*.test.ts)")
    parser.add_argument('--no-comments', action='store_true',
                        help="Remover comentarios (NO recomendado para AI)")
    
    args = parser.parse_args()
    
    try:
        # Parsear exclusiones
        exclude_patterns = None
        if args.exclude:
            exclude_patterns = [p.strip() for p in args.exclude.split(',')]
        
        # Crear compresor
        compressor = FilesCompressor(
            mode=args.mode,
            preserve_comments=not args.no_comments
        )
        
        # Comprimir
        json_path, index_path = compressor.compress_paths(
            input_paths=args.input,
            output_dir=args.output,
            exclude_patterns=exclude_patterns
        )
        
        print(f"\n✅ Listo! Usa files_extractor.py para descomprimir.")
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        exit(1)


if __name__ == "__main__":
    main()