#!/usr/bin/env python3
"""
BLOOM NUCLEUS - BRIDGE ID FIXER
Actualiza com.bloom.nucleus.bridge.json con el Extension ID real que Chrome asigno
"""

import json
import os
import sys
from pathlib import Path

# CONFIGURACION
BRIDGE_NAME = "com.bloom.nucleus.bridge.json"
NATIVE_DIR = Path(os.environ.get('LOCALAPPDATA', '')) / "BloomNucleus" / "native"
BRIDGE_PATH = NATIVE_DIR / BRIDGE_NAME

# Extension ID que Chrome esta usando (el dinamico)
CHROME_ASSIGNED_ID = "dklfagadamjeocfpcnojogdjakbhfpio"

def fix_bridge_id():
    """Actualiza el bridge.json con el ID correcto"""
    
    print("=" * 60)
    print("  BLOOM BRIDGE ID FIXER")
    print("=" * 60)
    print()
    
    # Verificar que existe el archivo
    if not BRIDGE_PATH.exists():
        print(f"ERROR: Bridge config no encontrado")
        print(f"Ruta esperada: {BRIDGE_PATH}")
        return False
    
    print(f"Bridge config encontrado: {BRIDGE_PATH}")
    print()
    
    # Leer configuracion actual
    try:
        with open(BRIDGE_PATH, 'r', encoding='utf-8') as f:
            bridge_config = json.load(f)
    except json.JSONDecodeError as e:
        print(f"ERROR: JSON corrupto - {e}")
        return False
    
    # Mostrar ID actual
    current_origins = bridge_config.get('allowed_origins', [])
    if current_origins:
        current_id = current_origins[0].replace('chrome-extension://', '').replace('/', '')
        print(f"ID actual en bridge: {current_id}")
    else:
        print("ADVERTENCIA: No hay allowed_origins en el bridge")
    
    # Actualizar con el ID correcto
    bridge_config['allowed_origins'] = [
        f"chrome-extension://{CHROME_ASSIGNED_ID}/"
    ]
    
    # Guardar cambios
    try:
        with open(BRIDGE_PATH, 'w', encoding='utf-8') as f:
            json.dump(bridge_config, f, indent=2)
        print(f"OK: Bridge actualizado con ID: {CHROME_ASSIGNED_ID}")
        print()
    except Exception as e:
        print(f"ERROR: No se pudo escribir el archivo - {e}")
        return False
    
    # Verificar que el cambio se guardo
    with open(BRIDGE_PATH, 'r', encoding='utf-8') as f:
        verify = json.load(f)
    
    if verify['allowed_origins'][0] == f"chrome-extension://{CHROME_ASSIGNED_ID}/":
        print("VERIFICACION OK: Cambio guardado correctamente")
        print()
        print("=" * 60)
        print("  SIGUIENTE PASO")
        print("=" * 60)
        print()
        print("1. Cierra Chrome completamente (Task Manager)")
        print("2. Ejecuta: cleanup_zombies.ps1")
        print("3. Inicia el servicio: brain service service")
        print("4. Lanza Chrome: brain profile launch <id>")
        print()
        return True
    else:
        print("ERROR: Verificacion fallo - el archivo no se actualizo")
        return False

if __name__ == "__main__":
    success = fix_bridge_id()
    sys.exit(0 if success else 1)