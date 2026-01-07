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


def get_core_modules():
    """
    Escanea brain/core/ y retorna todos los módulos Python.
    """
    core_path = Path("brain/core")
    
    if not core_path.exists():
        print("Warning: brain/core/ no existe", file=sys.stderr)
        return []
    
    modules = []
    
    # Escanear recursivamente todos los .py en brain/core
    for py_file in core_path.rglob("*.py"):
        if py_file.name == "__init__.py":
            # Para __init__.py, usar el path del directorio
            rel_path = py_file.parent.relative_to(Path("."))
        else:
            # Para otros archivos, incluir el nombre sin .py
            rel_path = py_file.relative_to(Path(".")).with_suffix("")
        
        # Convertir path a módulo (brain/core/service/manager.py -> brain.core.service.manager)
        module = str(rel_path).replace(os.sep, ".")
        modules.append(module)
    
    return sorted(set(modules))


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
    
    print("Escaneando brain/core/...")
    core_imports = get_core_modules()
    
    # Combinar ambos
    all_imports = command_imports + core_imports
    
    if not all_imports:
        print("Error: No se encontraron imports", file=sys.stderr)
        sys.exit(1)
    
    print(f"Encontrados {len(command_imports)} módulos de comandos")
    print(f"Encontrados {len(core_imports)} módulos core")
    print(f"Total: {len(all_imports)} módulos")
    
    print(f"\nActualizando {spec_path}...")
    total = update_spec_file(spec_path, all_imports)
    
    print(f"\n[OK] brain.spec actualizado con {total} módulos")
    print("\nProximos pasos:")
    print("  1. Revisa brain.spec")
    print("  2. Compila: python build.py --clean")
    print("  3. Prueba: brain.exe service start")


if __name__ == "__main__":
    main()