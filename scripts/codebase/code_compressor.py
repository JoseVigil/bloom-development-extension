"""
Universal Code Compressor for AI Payloads
Reduces payload size while maintaining AI readability
"""

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
    Compresses code for AI consumption using multiple strategies:
    1. Whitespace normalization (AI-friendly)
    2. Comment removal (optional, configurable)
    3. Gzip compression (for transport)
    4. Base64 encoding
    """
    
    def __init__(self, preserve_comments: bool = False):
        """
        Args:
            preserve_comments: If True, keeps comments (recommended for AI)
        """
        self.preserve_comments = preserve_comments
    
    def compress_file(self, content: str, language: str) -> Dict[str, Any]:
        """
        Compress a single file's content
        
        Returns:
            {
                'c': compressed content (gz: prefix for gzip),
                'stats': compression statistics,
                'l': language
            }
        """
        original_size = len(content.encode('utf-8'))
        
        if original_size == 0:
            stats = CompressionStats(
                original_size=0,
                compressed_size=0,
                ratio=0.0,
                method='none'
            )
            return {
                'c': '',
                'stats': asdict(stats),
                'l': language
            }
        
        # Step 1: Normalize whitespace (AI can still read it)
        normalized = self._normalize_whitespace(content, language)
        
        # Step 2: Optionally remove comments
        if not self.preserve_comments:
            normalized = self._remove_comments(normalized, language)
        
        # Step 3: Gzip + Base64
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
        Decompress a file back to original content
        """
        content = compressed_data['c']
        
        if content == '':
            return ''
        
        if content.startswith('gz:'):
            # Remove prefix and decompress
            encoded = content[3:]
            return self._gunzip_content(encoded)
        else:
            # Already plain text
            return content
    
    def compress_codebase(self, files: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Compress an entire codebase
        
        Args:
            files: List of {p: path, c: content, l: language}
        
        Returns:
            Compressed codebase with metadata
        """
        compressed_files = []
        total_original = 0
        total_compressed = 0
        
        for file_data in files:
            if not file_data.get('c'):  # Skip empty files
                compressed_files.append(file_data)
                continue
            
            result = self.compress_file(
                file_data['c'],
                file_data.get('l', 'txt')
            )
            
            compressed_files.append({
                'p': file_data['p'],
                'l': file_data['l'],
                'h': file_data.get('h'),
                'c': result['c']
            })
            
            total_original += result['stats']['original_size']
            total_compressed += result['stats']['compressed_size']
        
        overall_ratio = round((1 - total_compressed / total_original) * 100, 2) if total_original > 0 else 0
        
        return {
            'files': compressed_files,
            'meta': {
                'compressed': True,
                'format': 'gzip+base64',
                'original_size': total_original,
                'compressed_size': total_compressed,
                'compression_ratio': overall_ratio,
                'preserve_comments': self.preserve_comments
            },
            'usage': {
                'instruction': 'Para descomprimir: gzip.decompress(base64.b64decode(content[3:]))',
                'example': 'import gzip, base64; content = gzip.decompress(base64.b64decode(file["c"][3:])).decode("utf-8")'
            }
        }
    
    def decompress_codebase(self, compressed_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Decompress entire codebase
        """
        files = compressed_data.get('files', [])
        decompressed = []
        
        for file_data in files:
            decompressed_file = {
                'p': file_data['p'],
                'l': file_data.get('l'),
                'h': file_data.get('h'),
                'c': self.decompress_file(file_data) if file_data.get('c') else ''
            }
            decompressed.append(decompressed_file)
        
        return decompressed
    
    # ==================== PRIVATE METHODS ====================
    
    def _normalize_whitespace(self, content: str, language: str) -> str:
        """
        Normalize whitespace while preserving code structure for AI
        - Removes trailing whitespace
        - Normalizes line breaks to \n
        - Removes excessive blank lines (max 1)
        """
        # Normalize line breaks
        content = content.replace('\r\n', '\n').replace('\r', '\n')
        
        # Remove trailing whitespace from each line
        lines = content.split('\n')
        lines = [line.rstrip() for line in lines]
        
        # Remove excessive blank lines (keep max 1 between code blocks)
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
        Remove comments based on language
        WARNING: This is aggressive and may break some edge cases
        Only use if you're SURE you don't need comments
        """
        if language in ['typescript', 'javascript', 'java', 'cpp', 'c']:
            # Remove // comments
            content = re.sub(r'//.*?$', '', content, flags=re.MULTILINE)
            # Remove /* */ comments
            content = re.sub(r'/\*.*?\*/', '', content, flags=re.DOTALL)
        
        elif language == 'python':
            # Remove # comments (but preserve shebang)
            lines = content.split('\n')
            cleaned = []
            for i, line in enumerate(lines):
                if i == 0 and line.startswith('#!'):
                    cleaned.append(line)
                else:
                    cleaned.append(re.sub(r'#.*$', '', line))
            content = '\n'.join(cleaned)
            
            # Remove docstrings (triple quotes)
            content = re.sub(r'""".*?"""', '', content, flags=re.DOTALL)
            content = re.sub(r"'''.*?'''", '', content, flags=re.DOTALL)
        
        elif language in ['html', 'xml']:
            # Remove <!-- --> comments
            content = re.sub(r'<!--.*?-->', '', content, flags=re.DOTALL)
        
        elif language == 'css':
            # Remove /* */ comments
            content = re.sub(r'/\*.*?\*/', '', content, flags=re.DOTALL)
        
        return content
    
    def _gzip_content(self, content: str) -> str:
        """Compress string using gzip and encode to base64"""
        compressed = gzip.compress(content.encode('utf-8'))
        return base64.b64encode(compressed).decode('ascii')
    
    def _gunzip_content(self, encoded: str) -> str:
        """Decode base64 and decompress gzip"""
        compressed = base64.b64decode(encoded.encode('ascii'))
        return gzip.decompress(compressed).decode('utf-8')


# ==================== USAGE EXAMPLES ====================

def example_compress_single_file():
    """Example: Compress a single file"""
    code = """
    // This is a comment
    function example() {
        console.log('Hello World');
        
        
        return true;    
    }
    """
    
    compressor = CodeCompressor(preserve_comments=True)
    result = compressor.compress_file(code, 'javascript')
    
    print(f"Original size: {result['stats']['original_size']} bytes")
    print(f"Compressed size: {result['stats']['compressed_size']} bytes")
    print(f"Compression ratio: {result['stats']['ratio']}%")
    print(f"Compressed content: {result['c'][:50]}...")
    
    # Decompress
    decompressed = compressor.decompress_file(result)
    print(f"\nDecompressed:\n{decompressed}")


def example_compress_codebase():
    """Example: Compress entire codebase like your JSON"""
    files = [
        {
            'p': 'src/example.ts',
            'l': 'typescript',
            'h': 'abc123',
            'c': '''
export class Example {
    // Constructor
    constructor(private name: string) {}
    
    greet(): string {
        return `Hello ${this.name}`;
    }
}
'''
        },
        {
            'p': 'README.md',
            'l': 'markdown',
            'h': 'def456',
            'c': '# My Project\n\nThis is a description.\n\n## Features\n- Feature 1\n- Feature 2'
        }
    ]
    
    compressor = CodeCompressor(preserve_comments=True)
    compressed = compressor.compress_codebase(files)
    
    print(json.dumps(compressed, indent=2))
    print(f"\nTotal compression: {compressed['meta']['compression_ratio']}%")
    
    # Decompress
    decompressed = compressor.decompress_codebase(compressed)
    print(f"\nDecompressed first file:\n{decompressed[0]['c']}")


def example_aggressive_compression():
    """Example: Maximum compression (removes comments)"""
    code = """
    // This comment will be removed
    function calculate(x, y) {
        /* This block comment too */
        return x + y;  // And this one
    }
    """
    
    compressor = CodeCompressor(preserve_comments=False)
    result = compressor.compress_file(code, 'javascript')
    
    print(f"Compression ratio: {result['stats']['ratio']}%")
    print(f"Decompressed:\n{compressor.decompress_file(result)}")


if __name__ == '__main__':
    print("=== Example 1: Single File ===")
    example_compress_single_file()
    
    print("\n\n=== Example 2: Full Codebase ===")
    example_compress_codebase()
    
    print("\n\n=== Example 3: Aggressive Compression ===")
    example_aggressive_compression()