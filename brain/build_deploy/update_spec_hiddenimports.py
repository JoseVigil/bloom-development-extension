#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Actualiza los hiddenimports en brain.spec automáticamente.
Ejecutar después de generate_command_loader.py

Uso:
    python brain/build_deploy/update_spec_hiddenimports.py
    (o desde build.py)
"""
import sys
import re
import ast
import os
from pathlib import Path

# Forzar UTF-8 en Windows
if sys.platform == "win32":
    import io
    if hasattr(sys.stdout, 'buffer'):
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# Cambiar al directorio raíz del proyecto
script_path = Path(__file__).resolve()
script_dir = script_path.parent  # brain/build_deploy/
project_root = script_dir.parent.parent  # raíz del proyecto

# CRÍTICO: Cambiar al directorio del proyecto
os.chdir(project_root)
print(f"Working directory: {os.getcwd()}")


def get_hiddenimports_from_loader_file():
    """
    Lee command_loader.py directamente y extrae los imports.
    No intenta importar el módulo (evita problemas de PATH).
    """
    # Ya estamos en el directorio raíz gracias al os.chdir()
    loader_path = Path("brain/cli/command_loader.py")
    
    if not loader_path.exists():
        print(f"Error: {loader_path} no existe", file=sys.stderr)
        print(f"Current directory: {Path.cwd()}", file=sys.stderr)
        print("\nAsegúrate de ejecutar primero: python build.py", file=sys.stderr)
        sys.exit(1)
    
    # Leer el archivo
    with open(loader_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Extraer todos los imports de brain.commands usando regex
    # Busca patrones como: from brain.commands.categoria.comando import Clase
    pattern = r"from\s+(brain\.commands\.[^\s]+)\s+import"
    matches = re.findall(pattern, content)
    
    if not matches:
        print("Warning: No se encontraron imports en command_loader.py", file=sys.stderr)
        return []
    
    # Eliminar duplicados y ordenar
    imports = sorted(set(matches))
    return imports


def update_spec_file(spec_path: Path, command_imports: list):
    """Actualiza el archivo .spec con los nuevos hiddenimports."""
    
    if not spec_path.exists():
        print(f"Error: {spec_path} no existe", file=sys.stderr)
        print("\nCrea el archivo brain.spec primero usando el artifact proporcionado", file=sys.stderr)
        sys.exit(1)
    
    # Leer el archivo actual
    with open(spec_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Construir la nueva lista de hiddenimports
    base_imports = [
        "# Core Brain",
        "'brain',",
        "'brain.cli',",
        "'brain.cli.base',",
        "'brain.cli.registry',",
        "'brain.cli.command_loader',",
        "'brain.cli.categories',",
        "'brain.cli.help_renderer',",
        "'brain.shared',",
        "'brain.shared.context',",
        "'brain.commands',",
        "",
        "# Typer y dependencias",
        "'typer',",
        "'click',",
        "'rich',",
        "'rich.console',",
        "'rich.table',",
        "'rich.markdown',",
        "",
        "# Comandos (Auto-generado por update_spec_hiddenimports.py)",
    ]
    
    # Agregar comandos
    for module in sorted(command_imports):
        base_imports.append(f"'{module}',")
    
    # Formatear como string con indentación correcta
    hiddenimports_lines = []
    for line in base_imports:
        if line and not line.startswith("#"):
            hiddenimports_lines.append(f"    {line}")
        elif line.startswith("#"):
            hiddenimports_lines.append(f"    {line}")
        else:
            hiddenimports_lines.append("")
    
    hiddenimports_str = "\n".join(hiddenimports_lines)
    
    # Reemplazar en el contenido
    pattern = r"hiddenimports\s*=\s*\[(.*?)\]"
    replacement = f"hiddenimports = [\n{hiddenimports_str}\n]"
    
    new_content = re.sub(
        pattern,
        replacement,
        content,
        flags=re.DOTALL
    )
    
    # Escribir de vuelta
    with open(spec_path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    
    return len(command_imports)


def main():
    """Actualiza brain.spec con hiddenimports desde command_loader.py"""
    
    # Ya estamos en el directorio raíz, el spec está en brain/build_deploy/
    spec_path = Path("brain/build_deploy/brain.spec")
    
    print("Leyendo command_loader.py...")
    command_imports = get_hiddenimports_from_loader_file()
    
    if not command_imports:
        print("Error: No se encontraron imports de comandos", file=sys.stderr)
        sys.exit(1)
    
    print(f"Encontrados {len(command_imports)} módulos de comandos:")
    for imp in command_imports[:5]:  # Mostrar solo los primeros 5
        print(f"  - {imp}")
    if len(command_imports) > 5:
        print(f"  ... y {len(command_imports) - 5} más")
    
    print(f"\nActualizando {spec_path}...")
    total = update_spec_file(spec_path, command_imports)
    
    print(f"\n[OK] brain.spec actualizado con {total} comandos")
    print("\nProximos pasos:")
    print("  1. Revisa brain.spec")
    print("  2. Compila: pyinstaller brain.spec --clean")
    print("  3. Prueba: dist/brain/brain.exe --help")


if __name__ == "__main__":
    main()