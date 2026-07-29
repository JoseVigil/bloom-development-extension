#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script para generar automáticamente brain/cli/command_loader.py
Escanea brain/commands/ y crea el código de carga explícita.

Uso:
    python brain/build_deploy/generate_command_loader.py
    (o desde build.py)
"""
import ast
import sys
import os
from pathlib import Path
from typing import List, Tuple

# Forzar UTF-8 en Windows
if sys.platform == "win32":
    import io
    if hasattr(sys.stdout, 'buffer'):
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# Cambiar al directorio raíz del proyecto ANTES de hacer cualquier cosa
script_path = Path(__file__).resolve()
project_root = script_path.parent.parent.parent  # brain/build_deploy/generate_command_loader.py -> raíz

# CRÍTICO: Cambiar al directorio del proyecto
os.chdir(project_root)
print(f"Working directory: {os.getcwd()}")


def find_command_classes(file_path: Path) -> List[str]:
    """Encuentra clases que heredan de Command en un archivo Python."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            tree = ast.parse(f.read())
        
        commands = []
        for node in ast.walk(tree):
            if isinstance(node, ast.ClassDef):
                # Buscar clases que heredan de Command o tienen Command en el nombre
                for base in node.bases:
                    if isinstance(base, ast.Name):
                        if 'Command' in base.id:
                            commands.append(node.name)
                            break
                    elif isinstance(base, ast.Attribute):
                        if 'Command' in base.attr:
                            commands.append(node.name)
                            break
        
        return commands
    except Exception as e:
        print(f"Error parsing {file_path}: {e}", file=sys.stderr)
        return []


def scan_commands_directory() -> List[Tuple[str, str, str]]:
    """
    Escanea brain/commands y retorna lista de (categoría, módulo, clase).
    
    Returns:
        Lista de tuplas (category, module_path, class_name)
    """
    commands = []
    commands_dir = Path("brain/commands")
    
    print(f"Escaneando: {commands_dir.resolve()}")
    
    if not commands_dir.exists():
        print(f"Error: {commands_dir.resolve()} no existe", file=sys.stderr)
        return []
    
    if not commands_dir.is_dir():
        print(f"Error: {commands_dir.resolve()} no es un directorio", file=sys.stderr)
        return []
    
    # Escanear categorías
    for category_dir in sorted(commands_dir.iterdir()):
        if not category_dir.is_dir():
            continue
        if category_dir.name.startswith('_'):
            continue
        
        print(f"  Categoría: {category_dir.name}")
        
        # Escanear archivos Python en la categoría, RECURSIVO — algunas
        # categorías (ej. ai/) agrupan comandos en subcarpetas por proveedor:
        # commands/ai/claude/claude_keys_add.py, commands/ai/gemini/..., etc.
        # Un glob("*.py") de un solo nivel las deja completamente afuera sin
        # ningún error ni warning (lista vacía, el bucle sigue de largo).
        for py_file in sorted(category_dir.rglob("*.py")):
            if py_file.name.startswith('_'):
                continue
            
            # Saltear archivos dentro de subcarpetas "privadas" (ej. un
            # eventual commands/ai/_disabled/x.py) — mismo criterio que ya
            # se aplicaba a nombres de archivo, extendido a subcarpetas.
            rel_to_category = py_file.relative_to(category_dir)
            if any(part.startswith('_') for part in rel_to_category.parts[:-1]):
                continue
            
            # Encontrar clases Command en el archivo
            classes = find_command_classes(py_file)
            
            for class_name in classes:
                # Construir el module_path desde la ruta relativa completa
                # (no solo category_dir.name + stem), para que funcione tanto
                # con categorías planas (github/auth.py) como anidadas
                # (ai/claude/claude_keys_add.py).
                rel_module = py_file.relative_to(commands_dir).with_suffix("")
                module_path = "brain.commands." + ".".join(rel_module.parts)
                commands.append((category_dir.name, module_path, class_name))
                print(f"    ✓ {class_name} ({py_file.relative_to(category_dir)})")
    
    return commands


def generate_registry_code(commands: List[Tuple[str, str, str]]) -> str:
    """Genera el código Python para command_loader.py."""
    
    # Agrupar por categoría
    by_category = {}
    for category, module, class_name in commands:
        if category not in by_category:
            by_category[category] = []
        by_category[category].append((module, class_name))
    
    # Generar código
    lines = [
        '"""',
        'Explicit command loader for frozen executables.',
        'Este archivo carga todos los comandos cuando Brain corre como .exe',
        '',
        'AUTO-GENERATED by generate_command_loader.py',
        '"""',
        'from brain.cli.registry import CommandRegistry',
        '',
        '',
        'def load_all_commands_explicit() -> CommandRegistry:',
        '    """',
        '    Carga todos los comandos explícitamente para PyInstaller.',
        '    ',
        '    Este método se usa SOLO cuando Brain corre como ejecutable empaquetado.',
        '    En desarrollo, se usa el auto-discovery normal.',
        '    ',
        '    Returns:',
        '        CommandRegistry con todos los comandos cargados',
        '    """',
        '    registry = CommandRegistry()',
        '    ',
    ]
    
    # Agregar registros por categoría
    for category in sorted(by_category.keys()):
        lines.append(f'    # {"=" * 65}')
        lines.append(f'    # {category.upper()}')
        lines.append(f'    # {"=" * 65}')
        
        for module, class_name in sorted(by_category[category]):
            lines.extend([
                '    try:',
                f'        from {module} import {class_name}',
                f'        registry.register({class_name}())',
                # Antes solo se atrapaba ImportError. Un comando con un bug
                # de runtime (ej. atributo inexistente en su metadata()) no
                # es un ImportError -- se propagaba sin atrapar y tumbaba
                # load_all_commands_explicit() entero, dejando el registry
                # vacío para TODAS las categorías, no solo la rota.
                '    except (ImportError, AttributeError) as e:',
                f'        print(f"Warning: Could not load {class_name}: {{e}}")',
                '    ',
            ])
    
    lines.extend([
        '    return registry',
        '',
        '',
        'def get_hiddenimports_list():',
        '    """',
        '    Lista de módulos para agregar a hiddenimports en el .spec file.',
        '    ',
        '    Returns:',
        '        Lista de strings con los import paths',
        '    """',
        '    return [',
    ])
    
    # Lista de módulos para hiddenimports
    for category, module, _ in sorted(commands):
        lines.append(f"        '{module}',")
    
    lines.extend([
        '    ]',
        ''
    ])
    
    return '\n'.join(lines)


def main():
    """Genera command_loader.py automáticamente."""
    
    print("=" * 70)
    print("BRAIN - Generador de Command Loader")
    print("=" * 70)
    
    # Escanear comandos (ya estamos en project_root gracias al chdir al inicio)
    commands = scan_commands_directory()
    
    if not commands:
        print("\n[ERROR] No se encontraron comandos", file=sys.stderr)
        sys.exit(1)
    
    print(f"\n[OK] Encontrados {len(commands)} comandos")
    
    # Generar código
    code = generate_registry_code(commands)
    
    # Escribir archivo
    output_file = Path("brain/cli/command_loader.py")
    output_file.parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(code)
    
    print(f"\n[OK] Generado: {output_file}")
    print(f"  Total: {len(commands)} comandos cargados")
    print("\nPróximos pasos:")
    print("  1. Revisa brain/cli/command_loader.py")
    print("  2. Ejecuta: python brain/build_deploy/update_spec_hiddenimports.py")
    print("  3. Compila: pyinstaller brain/build_deploy/brain.spec --clean")


if __name__ == "__main__":
    main()