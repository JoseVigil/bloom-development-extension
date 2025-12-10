#!/usr/bin/env python3
"""
Módulo de métricas de compresión reutilizable
Calcula ratios y tamaños para archivos gzip
"""

import gzip
import base64
from pathlib import Path
from typing import Dict, List, Tuple
from dataclasses import dataclass, asdict


@dataclass
class CompressionMetrics:
    """Métricas de compresión para un conjunto de archivos"""
    total_original_bytes: int
    total_compressed_bytes: int
    compression_ratio: float
    space_saved_bytes: int
    space_saved_percent: float
    file_count: int
    
    def to_dict(self) -> dict:
        return asdict(self)


class CompressionCalculator:
    """Calcula métricas de compresión para archivos"""
    
    def __init__(self):
        self.files_processed: List[Tuple[str, int, int]] = []
    
    def compress_text(self, content: str) -> Tuple[str, int, int]:
        """
        Comprime texto y retorna (compressed_string, original_size, compressed_size)
        """
        original_bytes = len(content.encode('utf-8'))
        compressed = gzip.compress(content.encode('utf-8'))
        compressed_size = len(compressed)
        encoded = base64.b64encode(compressed).decode('utf-8')
        
        return f"gz:{encoded}", original_bytes, compressed_size
    
    def read_and_compress(self, filepath: Path, label: str = None) -> Tuple[str, int, int]:
        """
        Lee archivo, comprime y trackea métricas
        Retorna: (compressed_string, original_size, compressed_size)
        """
        if not filepath.exists():
            raise FileNotFoundError(f"No existe: {filepath}")
        
        content = filepath.read_text(encoding='utf-8')
        compressed_str, orig_size, comp_size = self.compress_text(content)
        
        # Trackear para métricas
        file_label = label or filepath.name
        self.files_processed.append((file_label, orig_size, comp_size))
        
        return compressed_str, orig_size, comp_size
    
    def get_metrics(self) -> CompressionMetrics:
        """
        Calcula métricas agregadas de todos los archivos procesados
        """
        if not self.files_processed:
            return CompressionMetrics(
                total_original_bytes=0,
                total_compressed_bytes=0,
                compression_ratio=0.0,
                space_saved_bytes=0,
                space_saved_percent=0.0,
                file_count=0
            )
        
        total_original = sum(f[1] for f in self.files_processed)
        total_compressed = sum(f[2] for f in self.files_processed)
        space_saved = total_original - total_compressed
        
        # Ratio: cuánto mide el comprimido vs original (ej: 0.3 = 30% del tamaño original)
        compression_ratio = total_compressed / total_original if total_original > 0 else 0
        space_saved_percent = (space_saved / total_original * 100) if total_original > 0 else 0
        
        return CompressionMetrics(
            total_original_bytes=total_original,
            total_compressed_bytes=total_compressed,
            compression_ratio=round(compression_ratio, 4),
            space_saved_bytes=space_saved,
            space_saved_percent=round(space_saved_percent, 2),
            file_count=len(self.files_processed)
        )
    
    def get_file_details(self) -> List[Dict]:
        """
        Retorna detalle de cada archivo procesado
        """
        return [
            {
                "file": label,
                "original_bytes": orig,
                "compressed_bytes": comp,
                "ratio": round(comp / orig, 4) if orig > 0 else 0
            }
            for label, orig, comp in self.files_processed
        ]
    
    def format_bytes(self, bytes_size: int) -> str:
        """
        Formatea bytes a formato legible (KB, MB)
        """
        if bytes_size < 1024:
            return f"{bytes_size} B"
        elif bytes_size < 1024 * 1024:
            return f"{bytes_size / 1024:.2f} KB"
        else:
            return f"{bytes_size / (1024 * 1024):.2f} MB"
    
    def print_summary(self):
        """
        Imprime resumen de compresión
        """
        metrics = self.get_metrics()
        
        print("\n📊 Resumen de Compresión:")
        print(f"   Archivos procesados: {metrics.file_count}")
        print(f"   Tamaño original:     {self.format_bytes(metrics.total_original_bytes)}")
        print(f"   Tamaño comprimido:   {self.format_bytes(metrics.total_compressed_bytes)}")
        print(f"   Ratio de compresión: {metrics.compression_ratio:.2%}")
        print(f"   Espacio ahorrado:    {self.format_bytes(metrics.space_saved_bytes)} ({metrics.space_saved_percent:.1f}%)")


# Funciones standalone para backward compatibility
def compress_text(content: str) -> str:
    """Comprime texto a formato gz:... (función legacy)"""
    compressed = gzip.compress(content.encode('utf-8'))
    encoded = base64.b64encode(compressed).decode('utf-8')
    return f"gz:{encoded}"


def read_and_compress(filepath: Path) -> str:
    """Lee archivo y comprime (función legacy sin métricas)"""
    if not filepath.exists():
        raise FileNotFoundError(f"No existe: {filepath}")
    content = filepath.read_text(encoding='utf-8')
    return compress_text(content)