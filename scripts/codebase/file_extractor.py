"""
Universal Files Extractor - Descomprime codebase/docbase comprimidos
Compatible con formato v2.0 (gzip+base64)
"""

import os
import json
import gzip
import base64
import hashlib
import argparse
from typing import Dict, Any, List, Optional
from pathlib import Path


class FilesExtractor:
    """
    Extrae y descomprime archivos desde .codebase.json o .docbase.json
    """
    
    def __init__(self, verify_hashes: bool = True):
        self.verify_hashes = verify_hashes
        self.stats = {
            'extracted': 0,
            'errors': 0,
            'hash_mismatches': 0
        }
    
    def extract(self, json_path: str, output_dir: str = None) -> None:
        """
        Extrae codebase o docbase completo
        
        Args:
            json_path: Path al .codebase.json o .docbase.json
            output_dir: Directorio de salida (default: ./extracted_{mode})
        """
        json_path = Path(json_path)
        
        if not json_path.exists():
            raise FileNotFoundError(f"Archivo no encontrado: {json_path}")
        
        print(f"📂 Cargando desde: {json_path}")
        
        # Cargar JSON
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Validar formato
        self._validate_format(data)
        
        # Determinar modo y output
        mode = data['meta'].get('mode', 'codebase')
        protocol_version = data['_protocol'].get('version', 'unknown')
        
        print(f"✅ Protocolo: v{protocol_version}")
        print(f"🎯 Modo: {mode}")
        
        if output_dir is None:
            output_dir = json_path.parent / f"extracted_{mode}"
        else:
            output_dir = Path(output_dir)
        
        output_dir.mkdir(parents=True, exist_ok=True)
        print(f"📁 Extrayendo a: {output_dir}")
        
        # Procesar archivos
        files = data['files']
        total = len(files)
        
        print(f"📄 Procesando {total} archivos...")
        
        for file_data in files:
            try:
                self._extract_file(file_data, output_dir)
                self.stats['extracted'] += 1
            except Exception as e:
                path = file_data.get('p', 'unknown')
                print(f"❌ Error en {path}: {e}")
                self.stats['errors'] += 1
        
        # Resumen
        self._print_summary(data, total)
    
    def show_index(self, json_path: str, detailed: bool = False) -> None:
        """
        Muestra el índice de archivos sin extraer
        
        Args:
            json_path: Path al archivo JSON
            detailed: Si True, muestra información detallada
        """
        json_path = Path(json_path)
        
        if not json_path.exists():
            raise FileNotFoundError(f"Archivo no encontrado: {json_path}")
        
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Verificar si es el index o el main
        if '_index_version' in data:
            self._show_index_file(data, detailed)
        else:
            self._show_main_file_index(data, detailed)
    
    def get_file(self, json_path: str, target_path: str) -> str:
        """
        Extrae y devuelve el contenido de un archivo específico
        
        Args:
            json_path: Path al JSON
            target_path: Path relativo del archivo
        
        Returns:
            Contenido descomprimido
        """
        json_path = Path(json_path)
        
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        files = data.get('files', [])
        
        for file_data in files:
            if file_data['p'] == target_path:
                return self._decompress_content(file_data['c'])
        
        raise FileNotFoundError(f"Archivo no encontrado: {target_path}")
    
    def _validate_format(self, data: Dict) -> None:
        """Valida que el formato sea correcto"""
        if '_protocol' not in data:
            raise ValueError("Formato inválido: falta '_protocol'")
        
        if 'files' not in data:
            raise ValueError("Formato inválido: falta 'files'")
        
        protocol_version = data['_protocol'].get('version')
        if protocol_version not in ['2.0', '1.0', '2.1']:
            print(f"⚠️  Versión de protocolo desconocida: {protocol_version}")
    
    def _extract_file(self, file_data: Dict, output_dir: Path) -> None:
        """Extrae un archivo individual"""
        rel_path = file_data['p']
        compressed = file_data['c']
        expected_hash = file_data.get('h')
        
        # Descomprimir
        content = self._decompress_content(compressed)
        
        # Verificar hash
        if self.verify_hashes and expected_hash:
            actual_hash = hashlib.md5(content.encode('utf-8')).hexdigest()
            if actual_hash != expected_hash:
                print(f"⚠️  Hash mismatch: {rel_path}")
                self.stats['hash_mismatches'] += 1
        
        # Escribir archivo
        full_path = output_dir / rel_path
        full_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(full_path, 'w', encoding='utf-8') as f:
            f.write(content)
    
    def _decompress_content(self, compressed: str) -> str:
        """
        Descomprime contenido en formato gz:base64
        """
        if not compressed:
            return ''  # Handle empty content for empty files
        
        if not compressed.startswith('gz:'):
            raise ValueError(f"Formato de compresión no reconocido. Esperado 'gz:...' o vacío")
        
        # Remover prefijo 'gz:'
        encoded = compressed[3:]
        
        # Decodificar y descomprimir
        compressed_bytes = base64.b64decode(encoded.encode('ascii'))
        decompressed_bytes = gzip.decompress(compressed_bytes)
        
        return decompressed_bytes.decode('utf-8')
    
    def _show_index_file(self, data: Dict, detailed: bool) -> None:
        """Muestra contenido del archivo _index.json"""
        mode = data.get('mode', 'unknown')
        summary = data.get('summary', {})
        
        print(f"📋 Índice de {mode.upper()}")
        print("=" * 70)
        print(f"\n📊 Resumen:")
        print(f"   • Total archivos: {summary.get('total_files', 0)}")
        print(f"   • Tamaño original: {self._format_bytes(summary.get('total_size_bytes', 0))}")
        print(f"   • Tamaño comprimido: {self._format_bytes(summary.get('total_compressed_bytes', 0))}")
        print(f"   • Ratio promedio: {summary.get('average_compression_ratio', 0):.1f}%")
        
        languages = summary.get('languages', {})
        if languages:
            print(f"\n🔤 Lenguajes:")
            for lang, count in sorted(languages.items(), key=lambda x: -x[1]):
                print(f"   • {lang}: {count}")
        
        # Mostrar por directorio
        by_dir = data.get('by_directory', {})
        print(f"\n📁 Por directorio:")
        
        for dir_name in sorted(by_dir.keys()):
            dir_info = by_dir[dir_name]
            file_count = dir_info.get('file_count', 0)
            print(f"\n   {dir_name}/ ({file_count} archivos)")
            
            if detailed:
                files = dir_info.get('files', [])
                for file_info in files[:10]:  # Mostrar máximo 10
                    size = self._format_bytes(file_info.get('s', 0))
                    lang = file_info.get('l', 'unknown')
                    ratio = file_info.get('ratio', 0)
                    print(f"      • {file_info['p']:<40} [{lang:<12}] {size:>8} (-{ratio:.0f}%)")
                
                if len(files) > 10:
                    print(f"      ... y {len(files) - 10} más")
    
    def _show_main_file_index(self, data: Dict, detailed: bool) -> None:
        """Muestra índice desde el archivo principal"""
        meta = data.get('meta', {})
        files = data.get('files', [])
        
        mode = meta.get('mode', 'unknown')
        
        print(f"📋 Índice de {mode.upper()} ({len(files)} archivos)")
        print("=" * 70)
        
        # Agrupar por directorio
        dirs = {}
        for file_data in files:
            path = file_data['p']
            dir_name = str(Path(path).parent) or '.'
            
            if dir_name not in dirs:
                dirs[dir_name] = []
            
            dirs[dir_name].append(file_data)
        
        for dir_name in sorted(dirs.keys()):
            print(f"\n📁 {dir_name}/")
            files_in_dir = sorted(dirs[dir_name], key=lambda x: x['p'])
            
            for file_data in files_in_dir:
                name = Path(file_data['p']).name
                lang = file_data.get('l', 'unknown')
                hash_short = file_data.get('h', 'N/A')[:8]
                
                if detailed:
                    print(f"   • {name:<35} [{lang:<12}] hash:{hash_short}")
                else:
                    print(f"   • {name}")
    
    def _print_summary(self, data: Dict, total: int) -> None:
        """Imprime resumen de extracción"""
        print(f"\n✨ Extracción completada!")
        print(f"📊 Resultados:")
        print(f"   • Archivos extraídos: {self.stats['extracted']}/{total}")
        
        if self.stats['errors'] > 0:
            print(f"   • Errores: {self.stats['errors']}")
        
        if self.stats['hash_mismatches'] > 0:
            print(f"   • Hash mismatches: {self.stats['hash_mismatches']}")
        
        # Mostrar metadata
        meta = data.get('meta', {})
        if meta:
            print(f"\n📋 Metadata:")
            if 'source_paths' in meta:
                print(f"   • Paths originales: {', '.join(meta['source_paths'])}")
            elif 'source_directory' in meta:
                print(f"   • Directorio original: {meta['source_directory']}")
            if 'generated_at' in meta:
                print(f"   • Generado: {meta['generated_at']}")
            if 'compression_stats' in meta:
                stats = meta['compression_stats']
                ratio = stats.get('compression_ratio_percent', 0)
                print(f"   • Ratio compresión: {ratio}%")
    
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
        description="Extrae y descomprime archivos desde codebase/docbase JSON",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Ejemplos de uso:

  # Extraer codebase completo
  python files_extractor.py --input .codebase.json
  
  # Extraer a directorio específico
  python files_extractor.py --input .codebase.json --output ./my_project
  
  # Mostrar índice sin extraer
  python files_extractor.py --input .codebase.json --show-index
  
  # Mostrar índice detallado
  python files_extractor.py --input .codebase_index.json --show-index --detailed
  
  # Extraer archivo específico (muestra en stdout)
  python files_extractor.py --input .codebase.json --file src/app.ts
  
  # Desactivar verificación de hashes
  python files_extractor.py --input .codebase.json --no-verify
        """
    )
    
    parser.add_argument('--input', '-i', required=True,
                        help="Path al archivo .codebase.json, .docbase.json o sus índices")
    parser.add_argument('--output', '-o',
                        help="Directorio de salida (default: ./extracted_{mode})")
    parser.add_argument('--show-index', action='store_true',
                        help="Mostrar índice sin extraer archivos")
    parser.add_argument('--detailed', action='store_true',
                        help="Mostrar información detallada en índice")
    parser.add_argument('--file', dest='target_file',
                        help="Extraer solo un archivo específico (muestra en stdout)")
    parser.add_argument('--no-verify', action='store_true',
                        help="Desactivar verificación de hashes MD5")
    
    args = parser.parse_args()
    
    try:
        extractor = FilesExtractor(verify_hashes=not args.no_verify)
        
        if args.show_index:
            extractor.show_index(args.input, detailed=args.detailed)
        elif args.target_file:
            content = extractor.get_file(args.input, args.target_file)
            print(content)
        else:
            extractor.extract(
                json_path=args.input,
                output_dir=args.output
            )
    
    except Exception as e:
        print(f"❌ Error: {e}")
        exit(1)


if __name__ == "__main__":
    main()