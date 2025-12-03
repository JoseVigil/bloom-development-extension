#!/usr/bin/env python3
"""
JSON Compressor con gzip - Para archivos JSON puros
"""
import sys
import json
import gzip
import base64

def compress_json(input_file, output_file):
    # Leer JSON
    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # Convertir a string compacto
    json_str = json.dumps(data, separators=(',', ':'), ensure_ascii=False)
    
    # Comprimir con gzip
    compressed = gzip.compress(json_str.encode('utf-8'))
    
    # Codificar en base64
    encoded = base64.b64encode(compressed).decode('ascii')
    
    # Crear wrapper con metadata
    result = {
        "compressed": True,
        "format": "gzip+base64",
        "original_size": len(json_str),
        "compressed_size": len(encoded),
        "data": encoded
    }
    
    # Guardar
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(result, f, separators=(',', ':'))
    
    print(f"✅ Original: {len(json_str)} bytes")
    print(f"✅ Comprimido: {len(encoded)} bytes")
    print(f"✅ Reducción: {(1 - len(encoded)/len(json_str)) * 100:.1f}%")

if __name__ == "__main__":
    compress_json(sys.argv[1], sys.argv[2])
