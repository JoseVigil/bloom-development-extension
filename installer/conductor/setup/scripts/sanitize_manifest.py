#!/usr/bin/env python3
"""
BLOOM NUCLEUS - MANIFEST SANITIZER
Sanitiza manifest.json eliminando bytes corruptos que Chrome rechaza
"""

import json
import os
import sys
from pathlib import Path

# CONFIGURACION
EXTENSION_DIR = Path(os.environ.get('LOCALAPPDATA', '')) / "BloomNucleus" / "extension"
MANIFEST_PATH = EXTENSION_DIR / "manifest.json"

# Key LIMPIA (sin saltos de linea, sin espacios, ASCII puro)
GOLDEN_KEY = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvpLkwKzeLGXF3Me4LckWSMQO6ktiL7gbLC3E8d3jpKfZLTL+lhCOXULTygRUi4vSvWQyy0KrI1eVTUYPrvA6s3pYGhn7GFfmCDXA6JvZjANc+4pq3hcxdVZdMa02E4f1UsIJm17qKBlk5Z6Jv1wD1LtXi2yk+lI/NcAq0XsQSTBDVElDp4/t8QpxRRHGm1WuaoN7DCu7Tmmzq1ztMC434+nmnjqkfMrxG6uC/iC+z+qDLUvolC1eWNPnMFbi2NG+KiZo/ZXEnTpc17OOo3VewOt2/ogTdHp8kpcK1OwXM9d+RUdls9DEUB5QdyWX7uUDsGKISsSawb+j5NiQbgACcQIDAQAB"

def sanitize_manifest():
    """Limpia el manifest.json de caracteres corruptos"""
    
    print("=" * 60)
    print("  BLOOM MANIFEST SANITIZER")
    print("=" * 60)
    print()
    
    # Verificar que existe el archivo
    if not MANIFEST_PATH.exists():
        print(f"ERROR: Manifest no encontrado")
        print(f"Ruta esperada: {MANIFEST_PATH}")
        print()
        print("SOLUCION:")
        print("1. Ejecuta el instalador de Electron primero")
        print("2. O crea la extension manualmente en esa ruta")
        return False
    
    print(f"Manifest encontrado: {MANIFEST_PATH}")
    print()
    
    # Leer manifest actual
    try:
        with open(MANIFEST_PATH, 'r', encoding='utf-8') as f:
            manifest = json.load(f)
    except json.JSONDecodeError as e:
        print(f"ERROR: JSON corrupto - {e}")
        return False
    except Exception as e:
        print(f"ERROR: No se pudo leer el archivo - {e}")
        return False
    
    # Verificar corrupcion de la key
    current_key = manifest.get('key', '')
    
    if not current_key:
        print("ADVERTENCIA: El manifest no tiene key")
        print("Agregando key limpia...")
        manifest['key'] = GOLDEN_KEY
    else:
        # Detectar corrupcion
        has_newlines = '\n' in current_key or '\r' in current_key
        has_spaces = '  ' in current_key  # Doble espacio
        
        if has_newlines:
            print("CORRUPCION DETECTADA: Key contiene saltos de linea")
        if has_spaces:
            print("CORRUPCION DETECTADA: Key contiene espacios multiples")
        
        if has_newlines or has_spaces:
            print("Limpiando key...")
            manifest['key'] = GOLDEN_KEY
        else:
            print("Key parece limpia, verificando longitud...")
            if len(current_key) != len(GOLDEN_KEY):
                print(f"  Longitud actual: {len(current_key)}")
                print(f"  Longitud esperada: {len(GOLDEN_KEY)}")
                print("  Reemplazando con key limpia...")
                manifest['key'] = GOLDEN_KEY
            else:
                print("  OK: Key tiene longitud correcta")
    
    # Asegurar campos requeridos
    required_fields = {
        'manifest_version': 3,
        'name': 'Bloom Nucleus Bridge',
        'version': '1.0.0',
        'description': 'Native messaging bridge for browser automation'
    }
    
    for field, default_value in required_fields.items():
        if field not in manifest:
            print(f"AGREGANDO campo faltante: {field}")
            manifest[field] = default_value
    
    # Guardar con escritura binaria estricta (UTF-8 sin BOM)
    print()
    print("Escribiendo manifest sanitizado...")
    
    try:
        # Convertir a JSON string con formato estricto
        manifest_str = json.dumps(manifest, indent=2, ensure_ascii=False)
        
        # Escribir como bytes UTF-8 SIN BOM
        with open(MANIFEST_PATH, 'wb') as f:
            f.write(manifest_str.encode('utf-8'))
        
        print("OK: Manifest sanitizado y guardado")
        print()
    except Exception as e:
        print(f"ERROR: No se pudo escribir el archivo - {e}")
        return False
    
    # Verificacion post-escritura
    with open(MANIFEST_PATH, 'rb') as f:
        raw_bytes = f.read()
    
    # Verificar que NO tiene BOM
    if raw_bytes.startswith(b'\xef\xbb\xbf'):
        print("ADVERTENCIA: Archivo tiene BOM UTF-8 - Chrome podria rechazarlo")
    else:
        print("VERIFICACION OK: Archivo sin BOM")
    
    # Verificar que la key es ASCII puro
    try:
        with open(MANIFEST_PATH, 'r', encoding='utf-8') as f:
            verify_manifest = json.load(f)
        
        verify_key = verify_manifest.get('key', '')
        
        # Intentar encodear como ASCII (fallara si hay caracteres raros)
        verify_key.encode('ascii')
        
        print("VERIFICACION OK: Key es ASCII puro")
        print()
        
    except UnicodeEncodeError:
        print("ERROR: Key contiene caracteres no-ASCII")
        return False
    
    print("=" * 60)
    print("  SANITIZACION COMPLETA")
    print("=" * 60)
    print()
    print("SIGUIENTE PASO:")
    print("1. BORRA la carpeta completa del perfil Chrome:")
    print(f"   {os.environ.get('LOCALAPPDATA')}\\BloomNucleus\\profiles\\<profile-id>")
    print()
    print("2. Ejecuta fix_bridge_id.py para actualizar el bridge")
    print()
    print("3. Ejecuta cleanup_zombies.ps1 para limpiar procesos")
    print()
    print("4. Inicia servicio: brain service service")
    print()
    print("5. Crea perfil nuevo: brain profile create TestProfile")
    print()
    print("6. Lanza: brain profile launch <new-id>")
    print()
    
    return True

if __name__ == "__main__":
    success = sanitize_manifest()
    sys.exit(0 if success else 1)