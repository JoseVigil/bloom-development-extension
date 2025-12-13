import os
import json
import hashlib
import fnmatch
from typing import Dict, List, Tuple
from pathlib import Path
from datetime import datetime
from core.filesystem.code_compressor import CodeCompressor

class FilesCompressor:
    """
    Port directo de tu script 'files_compressor.py'.
    Comprime archivos de código o documentación en formato JSON optimizado para AI.
    """
    
    LANGUAGE_MAP = {
        '.py': 'python', '.ts': 'typescript', '.tsx': 'typescript', 
        '.js': 'javascript', '.jsx': 'javascript', '.java': 'java', 
        '.cpp': 'cpp', '.c': 'c', '.cs': 'csharp', '.go': 'go', 
        '.rs': 'rust', '.php': 'php', '.rb': 'ruby', '.swift': 'swift', 
        '.kt': 'kotlin', '.scala': 'scala', '.html': 'html', 
        '.css': 'css', '.scss': 'scss', '.json': 'json', 
        '.yaml': 'yaml', '.yml': 'yaml', '.xml': 'xml', 
        '.sql': 'sql', '.sh': 'bash', '.bat': 'batch', 
        '.ps1': 'powershell',
        '.md': 'markdown', '.bl': 'markdown', '.txt': 'text', 
        '.rst': 'restructuredtext',
    }
    
    DEFAULT_IGNORE = {
        '__pycache__', '.git', '.svn', '.hg', 'node_modules', 
        '.venv', 'venv', 'env', '.env', 'dist', 'build',
        '.idea', '.vscode', '.DS_Store', '*.pyc', '*.pyo',
        '*.so', '*.dylib', '*.dll', '*.exe', '*.bin'
    }
    
    def __init__(self, mode: str = 'codebase', preserve_comments: bool = True):
        self.mode = mode
        self.compressor = CodeCompressor(preserve_comments=preserve_comments)
        self.stats = {
            'total_files': 0, 'total_size_original': 0, 
            'total_size_compressed': 0, 'languages': {}, 'errors': []
        }
    
    def compress_paths(self, input_paths: List[str], output_dir: str = None, 
                       exclude_patterns: List[str] = None) -> Tuple[str, str]:
        # Tu lógica exacta de compress_paths
        all_files_data = []
        source_paths = []
        
        for input_str in input_paths:
            input_path = Path(input_str).resolve()
            if not input_path.exists():
                raise FileNotFoundError(f"Path no encontrado: {input_str}")
            source_paths.append(str(input_path))
            
            if input_path.is_dir():
                files_data = self._collect_files(input_path, exclude_patterns)
                root_name = input_str.lstrip('../').lstrip('./').rstrip('/\\')
                for file_data in files_data:
                    file_data['relative_path'] = Path(root_name) / file_data['relative_path']
                all_files_data.extend(files_data)
            elif input_path.is_file():
                ext = input_path.suffix.lower()
                # Lógica de filtrado por extensión
                if self.mode == 'codebase' and ext in self.LANGUAGE_MAP and self.LANGUAGE_MAP[ext] not in ['markdown', 'text', 'restructuredtext']:
                    all_files_data.append({'path': input_path, 'relative_path': Path(input_path.name), 'extension': ext})
                elif self.mode == 'docbase' and ext in {'.md', '.bl', '.txt', '.rst'}:
                    all_files_data.append({'path': input_path, 'relative_path': Path(input_path.name), 'extension': ext})
        
        if not all_files_data:
            raise ValueError(f"No se encontraron archivos válidos para {self.mode}")
            
        compressed_files = []
        index_entries = []
        
        for file_data in all_files_data:
            try:
                compressed = self._compress_file(file_data)
                compressed_files.append(compressed['file'])
                index_entries.append(compressed['index'])
                
                self.stats['total_files'] += 1
                lang = compressed['index']['l']
                self.stats['languages'][lang] = self.stats['languages'].get(lang, 0) + 1
            except Exception as e:
                self.stats['errors'].append(f"Error en {file_data['path']}: {str(e)}")

        if output_dir is None:
            output_path = Path.cwd()
        else:
            output_path = Path(output_dir).resolve()
            output_path.mkdir(parents=True, exist_ok=True)
            
        json_path = self._generate_main_json(compressed_files, output_path, source_paths)
        index_path = self._generate_index_json(index_entries, output_path)
        
        return str(json_path), str(index_path)

    # --- MÉTODOS INTERNOS (Copia exacta de tu lógica) ---
    
    def _collect_files(self, root_path: Path, exclude_patterns: List[str] = None) -> List[Dict]:
        files = []
        exclude = list(self.DEFAULT_IGNORE)
        if exclude_patterns: exclude.extend(exclude_patterns)
        
        if self.mode == 'codebase':
            valid_extensions = {ext for ext, lang in self.LANGUAGE_MAP.items() 
                                if lang not in ['markdown', 'text', 'restructuredtext']}
        else:
            valid_extensions = {'.md', '.bl', '.txt', '.rst'}
            
        for file_path in root_path.rglob('*'):
            if not file_path.is_file(): continue
            
            str_path = str(file_path)
            skipped = False
            for pattern in exclude:
                if '*' in pattern or '?' in pattern:
                    if fnmatch.fnmatch(str_path, pattern) or fnmatch.fnmatch(file_path.name, pattern):
                        skipped = True; break
                elif pattern in str_path:
                    skipped = True; break
            if skipped: continue
            
            if file_path.suffix.lower() not in valid_extensions: continue
            
            files.append({
                'path': file_path,
                'relative_path': file_path.relative_to(root_path),
                'extension': file_path.suffix.lower()
            })
        return files

    def _compress_file(self, file_data: Dict) -> Dict:
        file_path = file_data['path']
        rel_path = str(file_data['relative_path']).replace('\\', '/')
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f: content = f.read()
        except UnicodeDecodeError:
            with open(file_path, 'r', encoding='latin-1') as f: content = f.read()
            
        language = self.LANGUAGE_MAP.get(file_data['extension'], 'text')
        content_hash = hashlib.md5(content.encode('utf-8')).hexdigest()
        original_size = len(content.encode('utf-8'))
        loc = len([line for line in content.split('\n') if line.strip()])
        
        compressed_result = self.compressor.compress_file(content, language)
        compressed_size = compressed_result['stats']['compressed_size']
        
        self.stats['total_size_original'] += original_size
        self.stats['total_size_compressed'] += compressed_size
        
        return {
            'file': {'p': rel_path, 'l': language, 'h': content_hash, 'c': compressed_result['c']},
            'index': {'p': rel_path, 'l': language, 'h': content_hash, 's': original_size, 
                      'cs': compressed_size, 'loc': loc, 'ratio': compressed_result['stats']['ratio']}
        }

    def _generate_main_json(self, files: List[Dict], output_path: Path, source_paths: List[str]) -> Path:
        filename = f".{self.mode}.json"
        json_path = output_path / filename
        
        compression_ratio = 0
        if self.stats['total_size_original'] > 0:
            compression_ratio = round((1 - self.stats['total_size_compressed'] / self.stats['total_size_original']) * 100, 2)
            
        data = {
            '_protocol': {'version': '2.1', 'format': f'{self.mode}_compressed', 'compression': 'gzip+base64', 'encoding': 'utf-8'},
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
            'usage': {'decompression': 'Use files_extractor.py', 'command': f'python files_extractor.py --input {filename}'}
        }
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return json_path

    def _generate_index_json(self, entries: List[Dict], output_path: Path) -> Path:
        filename = f".{self.mode}_index.json"
        index_path = output_path / filename
        
        total_size = sum(e['s'] for e in entries)
        total_compressed = sum(e['cs'] for e in entries)
        avg_ratio = round(sum(e['ratio'] for e in entries) / len(entries), 2) if entries else 0
        
        by_directory = {}
        for entry in entries:
            dir_name = str(Path(entry['p']).parent) or '.'
            if dir_name not in by_directory: by_directory[dir_name] = []
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
            'by_directory': {d: {'file_count': len(f), 'files': sorted(f, key=lambda x: x['p'])} for d, f in sorted(by_directory.items())},
            'all_files': sorted(entries, key=lambda x: x['p'])
        }
        with open(index_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return index_path