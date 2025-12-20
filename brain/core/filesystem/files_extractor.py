
"""
Files extraction logic for Brain filesystem operations.
Extracts files from compressed JSON format back to disk.
"""

import gzip
import base64
import hashlib
from typing import Dict, Optional
from pathlib import Path


class FilesExtractor:
    """
    Extracts files from compressed JSON format.
    
    Reads JSON files created by FilesCompressor and reconstructs the
    original files on disk with optional hash verification.
    
    This class contains pure business logic with no CLI dependencies.
    """
    
    def __init__(self, verify_hashes: bool = True):
        """
        Initialize the files extractor.
        
        Args:
            verify_hashes: Whether to verify MD5 hashes during extraction
        """
        self.verify_hashes = verify_hashes
        self.stats = {
            'extracted': 0, 
            'errors': 0, 
            'hash_mismatches': 0
        }

    def extract(self, json_path: str, output_dir: str = None) -> None:
        """
        Extract all files from a compressed JSON file.
        
        Args:
            json_path: Path to the compressed JSON file
            output_dir: Output directory (default: extracted_<mode>)
            
        Raises:
            FileNotFoundError: If JSON file doesn't exist
            ValueError: If JSON format is invalid
        """
        import json
        
        json_path = Path(json_path)
        if not json_path.exists():
            raise FileNotFoundError(f"File not found: {json_path}")
        
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        self._validate_format(data)
        mode = data['meta'].get('mode', 'codebase')
        
        if output_dir is None:
            output_dir = json_path.parent / f"extracted_{mode}"
        else:
            output_dir = Path(output_dir)
        
        output_dir.mkdir(parents=True, exist_ok=True)
        
        for file_data in data['files']:
            try:
                self._extract_file(file_data, output_dir)
                self.stats['extracted'] += 1
            except Exception as e:
                self.stats['errors'] += 1

    def get_file(self, json_path: str, target_path: str) -> str:
        """
        Extract and return content of a single file without writing to disk.
        
        Args:
            json_path: Path to the compressed JSON file
            target_path: Relative path of the file to extract
            
        Returns:
            Decompressed file content as string
            
        Raises:
            FileNotFoundError: If JSON file or target file doesn't exist
        """
        import json
        
        json_path = Path(json_path)
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        for file_data in data.get('files', []):
            if file_data['p'] == target_path:
                return self._decompress_content(file_data['c'])
        
        raise FileNotFoundError(f"File not found in archive: {target_path}")

    # --- MÉTODOS INTERNOS ---

    def _validate_format(self, data: Dict) -> None:
        """
        Validate the JSON format.
        
        Args:
            data: Parsed JSON data
            
        Raises:
            ValueError: If format is invalid
        """
        if '_protocol' not in data or 'files' not in data:
            raise ValueError("Invalid format: missing '_protocol' or 'files'")

    def _extract_file(self, file_data: Dict, output_dir: Path) -> None:
        """
        Extract a single file to disk.
        
        Args:
            file_data: File metadata and compressed content
            output_dir: Output directory
            
        Raises:
            ValueError: If compression format is invalid
        """
        rel_path = file_data['p']
        content = self._decompress_content(file_data['c'])
        
        # Verificar hash si está habilitado
        if self.verify_hashes and file_data.get('h'):
            actual_hash = hashlib.md5(content.encode('utf-8')).hexdigest()
            if actual_hash != file_data.get('h'):
                self.stats['hash_mismatches'] += 1
                
        full_path = output_dir / rel_path
        full_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(full_path, 'w', encoding='utf-8') as f:
            f.write(content)

    def _decompress_content(self, compressed: str) -> str:
        """
        Decompress a gzip+base64 encoded string.
        
        Args:
            compressed: Compressed content string (format: 'gz:<base64>')
            
        Returns:
            Decompressed content as string
            
        Raises:
            ValueError: If compression format is invalid
        """
        if not compressed:
            return ''
        
        if not compressed.startswith('gz:'):
            raise ValueError("Invalid compression format: expected 'gz:' prefix")
        
        return gzip.decompress(
            base64.b64decode(compressed[3:].encode('ascii'))
        ).decode('utf-8')