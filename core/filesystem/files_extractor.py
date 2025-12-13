import os
import json
import gzip
import base64
import hashlib
from typing import Dict, Any, List, Optional
from pathlib import Path

class FilesExtractor:
    """
    Port directo de tu script 'files_extractor.py'.
    """
    def __init__(self, verify_hashes: bool = True):
        self.verify_hashes = verify_hashes
        self.stats = {'extracted': 0, 'errors': 0, 'hash_mismatches': 0}

    def extract(self, json_path: str, output_dir: str = None) -> None:
        json_path = Path(json_path)
        if not json_path.exists(): raise FileNotFoundError(f"Archivo no encontrado: {json_path}")
        
        with open(json_path, 'r', encoding='utf-8') as f: data = json.load(f)
        self._validate_format(data)
        mode = data['meta'].get('mode', 'codebase')
        
        if output_dir is None: output_dir = json_path.parent / f"extracted_{mode}"
        else: output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        
        for file_data in data['files']:
            try:
                self._extract_file(file_data, output_dir)
                self.stats['extracted'] += 1
            except Exception as e:
                self.stats['errors'] += 1

    def get_file(self, json_path: str, target_path: str) -> str:
        json_path = Path(json_path)
        with open(json_path, 'r', encoding='utf-8') as f: data = json.load(f)
        for file_data in data.get('files', []):
            if file_data['p'] == target_path:
                return self._decompress_content(file_data['c'])
        raise FileNotFoundError(f"Archivo no encontrado: {target_path}")

    # --- MÉTODOS INTERNOS ---

    def _validate_format(self, data: Dict) -> None:
        if '_protocol' not in data or 'files' not in data:
            raise ValueError("Formato inválido: falta '_protocol' o 'files'")

    def _extract_file(self, file_data: Dict, output_dir: Path) -> None:
        rel_path = file_data['p']
        content = self._decompress_content(file_data['c'])
        
        if self.verify_hashes and file_data.get('h'):
            actual_hash = hashlib.md5(content.encode('utf-8')).hexdigest()
            if actual_hash != file_data.get('h'):
                self.stats['hash_mismatches'] += 1
                
        full_path = output_dir / rel_path
        full_path.parent.mkdir(parents=True, exist_ok=True)
        with open(full_path, 'w', encoding='utf-8') as f:
            f.write(content)

    def _decompress_content(self, compressed: str) -> str:
        if not compressed: return ''
        if not compressed.startswith('gz:'): raise ValueError("Formato inválido")
        return gzip.decompress(base64.b64decode(compressed[3:].encode('ascii'))).decode('utf-8')