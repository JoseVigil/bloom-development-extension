import gzip
import base64
import json
import re
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, asdict

@dataclass
class CompressionStats:
    original_size: int
    compressed_size: int
    ratio: float
    method: str

class CodeCompressor:
    """
    Port directo de tu script 'code_compressor.py'.
    Compresses code for AI consumption using multiple strategies.
    """
    
    def __init__(self, preserve_comments: bool = False):
        self.preserve_comments = preserve_comments
    
    def compress_file(self, content: str, language: str) -> Dict[str, Any]:
        original_size = len(content.encode('utf-8'))
        
        if original_size == 0:
            stats = CompressionStats(0, 0, 0.0, 'none')
            return {'c': '', 'stats': asdict(stats), 'l': language}
        
        normalized = self._normalize_whitespace(content, language)
        if not self.preserve_comments:
            normalized = self._remove_comments(normalized, language)
        
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
        content = compressed_data['c']
        if content == '': return ''
        
        if content.startswith('gz:'):
            encoded = content[3:]
            return self._gunzip_content(encoded)
        else:
            return content
            
    # --- MÉTODOS PRIVADOS (Tu lógica original) ---
    
    def _normalize_whitespace(self, content: str, language: str) -> str:
        content = content.replace('\r\n', '\n').replace('\r', '\n')
        lines = [line.rstrip() for line in content.split('\n')]
        
        normalized_lines = []
        prev_blank = False
        for line in lines:
            is_blank = not line.strip()
            if is_blank:
                if not prev_blank: normalized_lines.append('')
                prev_blank = True
            else:
                normalized_lines.append(line)
                prev_blank = False
        return '\n'.join(normalized_lines)
    
    def _remove_comments(self, content: str, language: str) -> str:
        # Tu implementación exacta de regex para remover comentarios
        if language in ['typescript', 'javascript', 'java', 'cpp', 'c']:
            content = re.sub(r'//.*?$', '', content, flags=re.MULTILINE)
            content = re.sub(r'/\*.*?\*/', '', content, flags=re.DOTALL)
        elif language == 'python':
            lines = content.split('\n')
            cleaned = []
            for i, line in enumerate(lines):
                if i == 0 and line.startswith('#!'):
                    cleaned.append(line)
                else:
                    cleaned.append(re.sub(r'#.*$', '', line))
            content = '\n'.join(cleaned)
            content = re.sub(r'""".*?"""', '', content, flags=re.DOTALL)
            content = re.sub(r"'''.*?'''", '', content, flags=re.DOTALL)
        elif language in ['html', 'xml']:
            content = re.sub(r'<!--.*?-->', '', content, flags=re.DOTALL)
        elif language == 'css':
            content = re.sub(r'/\*.*?\*/', '', content, flags=re.DOTALL)
        return content
    
    def _gzip_content(self, content: str) -> str:
        compressed = gzip.compress(content.encode('utf-8'))
        return base64.b64encode(compressed).decode('ascii')
    
    def _gunzip_content(self, encoded: str) -> str:
        compressed = base64.b64decode(encoded.encode('ascii'))
        return gzip.decompress(compressed).decode('utf-8')