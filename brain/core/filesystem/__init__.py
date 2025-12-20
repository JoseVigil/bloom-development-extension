"""
Brain filesystem core module.

This module provides file compression and extraction utilities
optimized for AI context generation.
"""

from brain.core.filesystem.code_compressor import CodeCompressor, CompressionStats
from brain.core.filesystem.files_compressor import FilesCompressor
from brain.core.filesystem.files_extractor import FilesExtractor

__all__ = [
    'CodeCompressor',
    'CompressionStats',
    'FilesCompressor',
    'FilesExtractor',
]