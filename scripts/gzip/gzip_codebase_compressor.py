#!/usr/bin/env python3
"""
Codebase Compressor - Optimiza archivos .bl para subir a AI
Reduce ~60-70% el tamaño usando compresión gzip + base64.

Uso:
    python codebase_compressor.py input.bl output.json
    python codebase_compressor.py codebase_key_files.bl codebase_ai.json
    python codebase_compressor.py --no-gzip input.bl output.json  # Sin gzip
"""

import sys
import json
import re
import gzip
import base64
from pathlib import Path


def extract_base_path(content):
    """Extrae el path base común del codebase"""
    match = re.search(r'C:/repos/[^/]+/[^/\n]+', content)
    if match:
        return match.group(0)
    return None


def extract_metadata(content):
    """Extrae metadata del header del archivo"""
    metadata = {
        'origin': None,
        'total_files': 0
    }
    
    # Buscar origen
    origin_match = re.search(r'\*\*Origen:\*\* (.+)', content)
    if origin_match:
        metadata['origin'] = origin_match.group(1).strip()
    
    # Buscar total de archivos
    total_match = re.search(r'\*\*Total de archivos:\*\* (\d+)', content)
    if total_match:
        metadata['total_files'] = int(total_match.group(1))
    
    return metadata


def parse_file_block(block, base_path):
    """
    Parsea un bloque de archivo del .bl
    Extrae: path, lenguaje, hash, contenido
    """
    lines = block.strip().split('\n')
    
    # Primera línea: path (formato ### C:/repos/.../file.ext)
    path_line = lines[0]
    full_path = path_line.replace('###', '').strip()
    
    # Calcular path relativo
    if base_path and full_path.startswith(base_path):
        rel_path = full_path[len(base_path):].lstrip('\\/')
    else:
        rel_path = full_path
    
    # Segunda línea: Metadatos (Lenguaje: X, Hash MD5: Y)
    meta_line = lines[1] if len(lines) > 1 else ''
    lang_match = re.search(r'Lenguaje:\s*(\w+)', meta_line)
    hash_match = re.search(r'Hash MD5:\s*([a-f0-9]{32})', meta_line)
    
    language = lang_match.group(1) if lang_match else 'txt'
    file_hash = hash_match.group(1)[:8] if hash_match else None  # Solo 8 chars
    
    # Contenido: desde ```lenguaje hasta ```
    content_start = None
    content_end = None
    
    for i, line in enumerate(lines):
        if line.startswith('```') and content_start is None:
            content_start = i + 1
        elif line.startswith('```') and content_start is not None:
            content_end = i
            break
    
    if content_start and content_end:
        code_lines = lines[content_start:content_end]
        code = '\n'.join(code_lines)
        
        # Minificar código
        code = minify_code(code, language)
    else:
        code = ''
    
    return {
        'p': rel_path,        # path
        'l': language,        # language
        'h': file_hash,       # hash (8 chars) - SIEMPRE incluido
        'c': code             # content (minified)
    }


def minify_code(code, language):
    """
    Minifica código eliminando:
    - Comentarios largos
    - Líneas vacías múltiples
    - Whitespace innecesario (conservador)
    """
    lines = code.split('\n')
    minified = []
    in_multiline_comment = False
    prev_empty = False
    
    for line in lines:
        stripped = line.strip()
        
        # Detectar inicio/fin de comentarios multilinea
        if language in ['typescript', 'javascript', 'java', 'c', 'cpp']:
            if '/*' in stripped:
                in_multiline_comment = True
            if '*/' in stripped:
                in_multiline_comment = False
                continue
            if in_multiline_comment:
                continue
        
        # Skip comentarios de una línea largos (más de 80 chars)
        if language in ['typescript', 'javascript']:
            if stripped.startswith('//') and len(stripped) > 80:
                continue
        elif language == 'python':
            if stripped.startswith('#') and len(stripped) > 80:
                continue
        
        # Skip líneas vacías consecutivas
        if not stripped:
            if prev_empty:
                continue
            prev_empty = True
        else:
            prev_empty = False
        
        # Mantener línea (con indentación original para legibilidad)
        minified.append(line.rstrip())
    
    return '\n'.join(minified)


def compress_content_gzip(content):
    """
    Comprime contenido con gzip y lo codifica en base64
    Retorna: "gz:base64_string"
    """
    try:
        # Comprimir con gzip
        compressed = gzip.compress(content.encode('utf-8'))
        
        # Codificar en base64
        encoded = base64.b64encode(compressed).decode('ascii')
        
        return f"gz:{encoded}"
    except Exception as e:
        print(f"    ⚠️  Error comprimiendo contenido: {e}")
        return content  # Fallback a contenido sin comprimir


def compress_codebase(input_file, output_file, use_gzip=True):
    """
    Comprime archivo .bl a formato JSON optimizado
    
    Args:
        input_file: Path al archivo .bl original
        output_file: Path al archivo .json de salida
        use_gzip: Si True, comprime contenido con gzip
    """
    print(f"🗜️  Comprimiendo: {input_file}")
    print(f"📦 Salida: {output_file}")
    print(f"⚙️  Modo: {'GZIP + Base64' if use_gzip else 'JSON estándar'}")
    print()
    
    # Leer archivo original
    try:
        with open(input_file, 'r', encoding='utf-8') as f:
            content = f.read()
    except FileNotFoundError:
        print(f"❌ Error: Archivo no encontrado: {input_file}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error leyendo archivo: {e}")
        sys.exit(1)
    
    original_size = len(content)
    print(f"📊 Tamaño original: {format_size(original_size)}")
    
    # Extraer base path
    base_path = extract_base_path(content)
    print(f"📂 Base path: {base_path or 'No detectado'}")
    
    # Extraer metadata general
    metadata = extract_metadata(content)
    
    # Dividir en bloques de archivos (cada ### marca inicio)
    file_blocks = re.split(r'\n### ', content)
    file_blocks = [b for b in file_blocks if b.strip()]
    
    # Si el primer bloque no tiene ###, agregarlo
    if not file_blocks[0].startswith('###'):
        file_blocks[0] = '### ' + file_blocks[0]
    
    print(f"📁 Archivos detectados: {len(file_blocks)}")
    print()
    
    # Parsear cada archivo
    files = []
    total_original_content = 0
    total_compressed_content = 0
    
    for i, block in enumerate(file_blocks):
        try:
            file_data = parse_file_block(block, base_path)
            
            # Comprimir contenido si gzip está activado
            if use_gzip and file_data['c']:
                original_len = len(file_data['c'])
                file_data['c'] = compress_content_gzip(file_data['c'])
                compressed_len = len(file_data['c'])
                
                total_original_content += original_len
                total_compressed_content += compressed_len
                
                reduction = ((original_len - compressed_len) / original_len * 100) if original_len > 0 else 0
                print(f"  ✓ [{i+1}/{len(file_blocks)}] {file_data['p'][:50]} ({reduction:.0f}% ↓)")
            else:
                print(f"  ✓ [{i+1}/{len(file_blocks)}] {file_data['p'][:60]}")
            
            files.append(file_data)
        except Exception as e:
            print(f"  ⚠️  Error parseando bloque {i+1}: {e}")
            continue
    
    # Crear estructura JSON compacta con metadata de compresión
    compressed = {
        'base': base_path or '',
        'meta': {
            'origin': metadata['origin'],
            'total': len(files),
            'compressed': use_gzip,
            'format': 'gzip+base64' if use_gzip else 'plain'
        },
        'usage': {
            'instruction': 'Para archivos con "c" que inicia con "gz:", descomprimir con: gzip.decompress(base64.b64decode(content[3:]))',
            'example': 'import gzip, base64; content = gzip.decompress(base64.b64decode(file["c"][3:])).decode("utf-8")'
        },
        'files': files
    }
    
    # Serializar sin espacios ni indentación
    json_str = json.dumps(compressed, ensure_ascii=False, separators=(',', ':'))
    
    # Guardar archivo
    try:
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(json_str)
    except Exception as e:
        print(f"\n❌ Error escribiendo archivo: {e}")
        sys.exit(1)
    
    compressed_size = len(json_str)
    reduction = ((original_size - compressed_size) / original_size) * 100
    
    print()
    print("=" * 70)
    print("✅ COMPRESIÓN EXITOSA")
    print("=" * 70)
    print(f"📊 Tamaño original:    {format_size(original_size)}")
    print(f"📦 Tamaño comprimido:  {format_size(compressed_size)}")
    print(f"🎯 Reducción total:    {reduction:.1f}%")
    
    if use_gzip and total_original_content > 0:
        content_reduction = ((total_original_content - total_compressed_content) / total_original_content) * 100
        print(f"📝 Reducción código:   {content_reduction:.1f}%")
    
    print(f"💾 Tokens estimados:   ~{compressed_size // 4:,}")
    print()
    print(f"📄 Archivo generado: {output_file}")
    print()
    
    if use_gzip:
        print("🔧 IMPORTANTE - Instrucciones para la AI:")
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print("Al subir este archivo a la AI, incluir este mensaje:")
        print()
        print('"""')
        print("Este archivo contiene código comprimido con gzip+base64.")
        print("Los archivos con contenido que inicia con 'gz:' deben")
        print("descomprimirse usando:")
        print()
        print("import gzip, base64")
        print('data = file["c"][3:]  # Quitar prefijo "gz:"')
        print("decoded = base64.b64decode(data)")
        print('content = gzip.decompress(decoded).decode("utf-8")')
        print('"""')
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    else:
        print("💡 Tip: Este archivo JSON está en formato estándar.")
        print("   La AI puede leer directamente sin descompresión.")


def format_size(size_bytes):
    """Formatea bytes a formato legible"""
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size_bytes < 1024.0:
            return f"{size_bytes:.2f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.2f} TB"


def main():
    """Función principal"""
    # Detectar flag --no-gzip
    use_gzip = True
    args = sys.argv[1:]
    
    if '--no-gzip' in args:
        use_gzip = False
        args.remove('--no-gzip')
    
    if len(args) < 2 or (args and args[0] in ['-h', '--help']):
        print("Codebase Compressor - Optimiza archivos .bl para AI")
        print()
        print("Uso: python codebase_compressor.py [--no-gzip] <input.bl> <output.json>")
        print()
        print("Parámetros:")
        print("  input.bl    - Archivo .bl original (formato humano)")
        print("  output.json - Archivo JSON comprimido (para AI)")
        print("  --no-gzip   - Desactivar compresión gzip (solo minificación)")
        print()
        print("Ejemplos:")
        print("  python codebase_compressor.py codebase.bl codebase_ai.json")
        print("  python codebase_compressor.py --no-gzip codebase.bl output.json")
        print()
        print("Modos de compresión:")
        print("  📦 CON GZIP (default):")
        print("     ✓ Reduce ~60-70% el tamaño")
        print("     ✓ Requiere instrucción simple a la AI")
        print("     ✓ AI puede descomprimir con Python/JavaScript")
        print("     ✓ Formato: gz:base64_encoded_content")
        print()
        print("  📝 SIN GZIP (--no-gzip):")
        print("     ✓ Reduce ~25-30% el tamaño")
        print("     ✓ JSON estándar, lectura directa")
        print("     ✓ Sin descompresión necesaria")
        print()
        print("Características:")
        print("  ✓ Mantiene TODOS los hashes MD5 (8 chars)")
        print("  ✓ Paths relativos al base path")
        print("  ✓ Código minificado")
        print("  ✓ Soporta TypeScript, JavaScript, Python, Markdown")
        print()
        print("Instrucciones para AI (modo GZIP):")
        print('  """')
        print("  Este codebase usa compresión gzip+base64.")
        print("  Archivos con 'gz:' prefix requieren:")
        print("  import gzip, base64")
        print('  content = gzip.decompress(base64.b64decode(data[3:])).decode("utf-8")')
        print('  """')
        sys.exit(1)
    
    input_file = args[0]
    output_file = args[1]
    
    # Validar extensiones
    if not input_file.endswith('.bl'):
        print("⚠️  Advertencia: El archivo de entrada no tiene extensión .bl")
        print("   Continuando de todas formas...")
        print()
    
    if not output_file.endswith('.json'):
        print("⚠️  Advertencia: Se recomienda usar extensión .json para salida")
        print("   Continuando de todas formas...")
        print()
    
    compress_codebase(input_file, output_file, use_gzip)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n⚠️  Proceso interrumpido por el usuario")
        sys.exit(130)
    except Exception as e:
        print(f"\n❌ Error fatal: {str(e)}")
        sys.exit(1)