#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Update brain.spec to include VERSION and __build__.py in datas.
VERSIÓN CORREGIDA: Solo modifica la sección datas, NO toca Analysis()
"""

import sys
from pathlib import Path


def get_spec_path() -> Path:
    """Get path to brain.spec file."""
    script_dir = Path(__file__).parent.resolve()
    return script_dir / "brain.spec"


def get_project_root() -> Path:
    """Get project root directory."""
    script_dir = Path(__file__).parent.resolve()
    return script_dir.parent.parent


def update_spec_datas(spec_path: Path) -> bool:
    """
    Update brain.spec to include VERSION and __build__.py in datas.
    
    IMPORTANTE: Solo modifica la sección 'datas = [...]'
    NO toca la llamada a Analysis()
    """
    if not spec_path.exists():
        print(f"❌ brain.spec not found at: {spec_path}")
        return False
    
    # Leer todas las líneas
    with open(spec_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    project_root = get_project_root()
    
    # Build absolute paths (forward slashes)
    version_file = str(project_root / "brain" / "VERSION").replace('\\', '/')
    build_file = str(project_root / "brain" / "__build__.py").replace('\\', '/')
    
    # Verificar que los archivos existan
    if not Path(version_file).exists():
        print(f"⚠️  VERSION file not found at: {version_file}")
    if not Path(build_file).exists():
        print(f"⚠️  __build__.py not found at: {build_file}")
    
    # Check if already added
    content = ''.join(lines)
    if version_file in content and build_file in content:
        print("✅ brain.spec already includes VERSION and __build__.py")
        return True
    
    # Buscar la sección datas = [...]
    # CRÍTICO: Buscar SOLO "datas = [" al inicio de línea (no dentro de Analysis)
    datas_start_idx = None
    datas_end_idx = None
    bracket_count = 0
    in_datas = False
    
    for i, line in enumerate(lines):
        # Detectar inicio de datas (debe ser al inicio de línea, no indentado dentro de Analysis)
        if line.strip().startswith('datas') and '=' in line and '[' in line and not in_datas:
            datas_start_idx = i
            in_datas = True
            bracket_count += line.count('[') - line.count(']')
            
            if bracket_count == 0:
                datas_end_idx = i
                break
            continue
        
        # Si estamos dentro de datas, contar brackets
        if in_datas:
            bracket_count += line.count('[') - line.count(']')
            
            if bracket_count == 0:
                datas_end_idx = i
                break
    
    if datas_start_idx is None or datas_end_idx is None:
        print("❌ Could not find 'datas = [...]' section in brain.spec")
        print(f"   Searched {len(lines)} lines")
        return False
    
    print(f"✅ Found 'datas' section: lines {datas_start_idx+1} to {datas_end_idx+1}")
    
    # Construir las nuevas entradas con indentación correcta
    new_entries = [
        f"    (r'{version_file}', '.'),\n",
        f"    (r'{build_file}', '.'),\n",
    ]
    
    # Insertar ANTES de la línea de cierre ']'
    # La línea datas_end_idx contiene el ']' de cierre
    new_lines = lines[:datas_end_idx] + new_entries + lines[datas_end_idx:]
    
    # Escribir de vuelta
    try:
        with open(spec_path, 'w', encoding='utf-8') as f:
            f.writelines(new_lines)
    except Exception as e:
        print(f"❌ Error writing to brain.spec: {e}")
        return False
    
    print("✅ Updated brain.spec with:")
    print(f"   - (r'{version_file}', '.'),")
    print(f"   - (r'{build_file}', '.'),")
    
    return True


def main():
    """Main execution flow."""
    spec_path = get_spec_path()
    
    if not update_spec_datas(spec_path):
        print("\n❌ Failed to update brain.spec")
        return 1
    
    print("\n✅ brain.spec updated successfully")
    return 0


if __name__ == "__main__":
    sys.exit(main())