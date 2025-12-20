"""
Code compression logic for Brain filesystem operations.
Compresses code files using multiple strategies including whitespace normalization,
comment removal, and gzip+base64 encoding.
"""

import gzip
import base64
import re
from typing import Dict, Any
from dataclasses import dataclass, asdict


@dataclass
class CompressionStats:
    """Statistics for a compression operation."""
    original_size: int
    compressed_size: int
    ratio: float
    method: str


class CodeCompressor:
    """
    Compresses code files for AI consumption using multiple strategies.
    
    Applies the following transformations:
    1. Whitespace normalization
    2. Optional comment removal
    3. Gzip compression
    4. Base64 encoding
    
    This class contains pure business logic with no CLI dependencies.
    """
    
    def __init__(self, preserve_comments: bool = False):
        """
        Initialize the code compressor.
        
        Args:
            preserve_comments: If False, removes comments from code
        """
        self.preserve_comments = preserve_comments
    
    def compress_file(self, content: str, language: str) -> Dict[str, Any]:
        """
        Compress a single file's content.
        
        Args:
            content: File content to compress
            language: Programming language identifier
            
        Returns:
            Dictionary with compressed content and statistics
        """
        original_size = len(content.encode('utf-8'))
        
        if original_size == 0:
            stats = CompressionStats(0, 0, 0.0, 'none')
            return {'c': '', 'stats': asdict(stats), 'l': language}
        
        # Normalizar espacios en blanco
        normalized = self._normalize_whitespace(content, language)
        
        # Remover comentarios si es necesario
        if not self.preserve_comments:
            normalized = self._remove_comments(normalized, language)
        
        # Comprimir con gzip
        compressed = self._gzip_content(normalized)
        compressed_size = len(compressed)
        
        stats = CompressionStats(
            original_size=original_size,
            compressed_size=compressed_size,
            ratio=round((1 - compressed_size / original_size) * 100, 2),
            method='gzip+base64'
        )
        
        return {
            'c': f'gz:{compressed}',
            'stats': asdict(stats),
            'l': language
        }
    
    def decompress_file(self, compressed_data: Dict[str, Any]) -> str:
        """
        Decompress a file's content.
        
        Args:
            compressed_data: Dictionary with compressed content
            
        Returns:
            Decompressed content as string
        """
        content = compressed_data['c']
        if content == '':
            return ''
        
        if content.startswith('gz:'):
            encoded = content[3:]
            return self._gunzip_content(encoded)
        else:
            return content
            
    # --- MÉTODOS PRIVADOS ---
    
    def _normalize_whitespace(self, content: str, language: str) -> str:
        """
        Normalize whitespace in content.
        
        Args:
            content: Original content
            language: Programming language
            
        Returns:
            Normalized content
        """
        # Normalizar line endings
        content = content.replace('\r\n', '\n').replace('\r', '\n')
        
        # Remover trailing whitespace de cada línea
        lines = [line.rstrip() for line in content.split('\n')]
        
        # Eliminar líneas en blanco duplicadas
        normalized_lines = []
        prev_blank = False
        for line in lines:
            is_blank = not line.strip()
            if is_blank:
                if not prev_blank:
                    normalized_lines.append('')
                prev_blank = True
            else:
                normalized_lines.append(line)
                prev_blank = False
        
        return '\n'.join(normalized_lines)
    
    def _remove_comments(self, content: str, language: str) -> str:
        """
        Remove comments from code based on language.
        
        Args:
            content: Code content
            language: Programming language
            
        Returns:
            Content with comments removed
        """
        # C-style comments (C, C++, Java, JavaScript, TypeScript)
        if language in ['typescript', 'javascript', 'java', 'cpp', 'c']:
            # Remover comentarios de línea
            content = re.sub(r'//.*?$', '', content, flags=re.MULTILINE)
            # Remover comentarios de bloque
            content = re.sub(r'/\*.*?\*/', '', content, flags=re.DOTALL)
        
        # Python comments
        elif language == 'python':
            lines = content.split('\n')
            cleaned = []
            for i, line in enumerate(lines):
                # Preservar shebang
                if i == 0 and line.startswith('#!'):
                    cleaned.append(line)
                else:
                    # Remover comentarios de línea
                    cleaned.append(re.sub(r'#.*$', '', line))
            content = '\n'.join(cleaned)
            
            # Remover docstrings (triple-quoted strings)
            content = re.sub(r'""".*?"""', '', content, flags=re.DOTALL)
            content = re.sub(r"'''.*?'''", '', content, flags=re.DOTALL)
        
        # HTML/XML comments
        elif language in ['html', 'xml']:
            content = re.sub(r'<!--.*?-->', '', content, flags=re.DOTALL)
        
        # CSS comments
        elif language == 'css':
            content = re.sub(r'/\*.*?\*/', '', content, flags=re.DOTALL)
        
        return content
    
    def _gzip_content(self, content: str) -> str:
        """
        Compress content using gzip and encode as base64.
        
        Args:
            content: Content to compress
            
        Returns:
            Base64-encoded compressed content
        """
        compressed = gzip.compress(content.encode('utf-8'))
        return base64.b64encode(compressed).decode('ascii')
    
    def _gunzip_content(self, encoded: str) -> str:
        """
        Decompress gzip+base64 encoded content.
        
        Args:
            encoded: Base64-encoded compressed content
            
        Returns:
            Decompressed content
        """
        compressed = base64.b64decode(encoded.encode('ascii'))
        return gzip.decompress(compressed).decode('utf-8')