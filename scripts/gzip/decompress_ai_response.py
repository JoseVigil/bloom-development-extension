#!/usr/bin/env python3
"""
AI Response Decompressor
"""
import sys
import gzip
import base64

def decompress_response(text):
    """Descomprime respuesta de AI si tiene prefijo gz:"""
    if not text.startswith('gz:'):
        return text  # Ya está descomprimido
    
    # Quitar prefijo
    compressed = text[3:]
    
    # Decodificar base64
    decoded = base64.b64decode(compressed)
    
    # Descomprimir gzip
    decompressed = gzip.decompress(decoded).decode('utf-8')
    
    return decompressed

if __name__ == "__main__":
    # Leer de stdin o archivo
    if len(sys.argv) > 1:
        with open(sys.argv[1], 'r') as f:
            text = f.read()
    else:
        text = sys.stdin.read()
    
    result = decompress_response(text)
    print(result)