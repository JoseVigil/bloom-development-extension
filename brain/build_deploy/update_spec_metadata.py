#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Update brain.spec to include VERSION and __build__.py in datas.

ESTRATEGIA:
  1. Purgar TODAS las entradas previas de VERSION y __build__.py
     (sin importar de qué máquina o SO vienen).
  2. Insertar las dos entradas correctas para el entorno actual.

Esto evita la acumulación de paths de distintas máquinas que rompía
el build en macOS/Linux cuando el spec contenía paths de Windows (y viceversa).
"""

import re
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


# Patrón que matchea cualquier entrada de datas que apunte a VERSION o __build__.py,
# independientemente del SO, usuario o path absoluto.
# Ejemplos que captura:
#   (r'C:/repos/.../brain/VERSION', '.'),
#   (r'/Users/josevigil/.../brain/VERSION', '.'),
#   (str(PROJECT_ROOT / 'brain' / 'VERSION'), '.'),
#   (r'C:/repos/.../brain/__build__.py', '.'),
_STALE_ENTRY_RE = re.compile(
    r"^\s*\(.*?(?:VERSION|__build__\.py).*?,\s*'\.'\s*\),?\s*\n?",
    re.MULTILINE,
)


def purge_stale_entries(lines: list[str]) -> tuple[list[str], int]:
    """
    Elimina todas las líneas dentro de datas = [...] que referencien
    VERSION o __build__.py, sin importar el path.

    Retorna (líneas_limpias, cantidad_eliminada).
    """
    content = "".join(lines)
    new_content, count = _STALE_ENTRY_RE.subn("", content)
    if count:
        return new_content.splitlines(keepends=True), count
    return lines, 0


def find_datas_block(lines: list[str]) -> tuple[int | None, int | None]:
    """
    Encuentra el bloque 'datas = [...]' en el spec.

    Retorna (start_idx, end_idx) donde end_idx es la línea que contiene
    el ']' de cierre. Ambos son None si no se encuentra el bloque.

    CRÍTICO: Solo detecta 'datas' al inicio de línea (no indentado dentro
    de Analysis()) para no confundir las dos apariciones de 'datas'.
    """
    datas_start_idx = None
    datas_end_idx = None
    bracket_count = 0
    in_datas = False

    for i, line in enumerate(lines):
        if not in_datas:
            # Debe comenzar al inicio de la línea (o solo espacios mínimos)
            stripped = line.lstrip()
            if (
                stripped.startswith("datas")
                and "=" in line
                and "[" in line
                and not line.startswith(" " * 4)  # no está indentado dentro de Analysis
            ):
                datas_start_idx = i
                in_datas = True
                bracket_count += line.count("[") - line.count("]")
                if bracket_count == 0:
                    datas_end_idx = i
                    break
        else:
            bracket_count += line.count("[") - line.count("]")
            if bracket_count == 0:
                datas_end_idx = i
                break

    return datas_start_idx, datas_end_idx


def update_spec_datas(spec_path: Path) -> bool:
    """
    Actualiza brain.spec:
      1. Purga entradas viejas de VERSION / __build__.py (cualquier plataforma).
      2. Inserta las entradas correctas para el entorno actual.
    """
    if not spec_path.exists():
        print(f"❌ brain.spec not found at: {spec_path}")
        return False

    # ── Leer spec ──────────────────────────────────────────────────────────
    with open(spec_path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    project_root = get_project_root()

    # Paths del entorno actual (forward slashes en todas las plataformas)
    version_file = str(project_root / "brain" / "VERSION").replace("\\", "/")
    build_file   = str(project_root / "brain" / "__build__.py").replace("\\", "/")

    # Advertir si los archivos aún no existen (se crean más adelante en el build)
    if not Path(version_file).exists():
        print(f"⚠️  VERSION file not found at: {version_file} (se creará en el build)")
    if not Path(build_file).exists():
        print(f"⚠️  __build__.py not found at: {build_file} (se creará en el build)")

    # ── 1. Purgar entradas obsoletas ────────────────────────────────────────
    lines, purged = purge_stale_entries(lines)
    if purged:
        print(f"🧹 Purgadas {purged} entrada(s) obsoleta(s) de VERSION/__build__.py")
    else:
        print("✅ No había entradas obsoletas")

    # ── 2. Verificar si las entradas correctas ya están presentes ───────────
    content = "".join(lines)
    already_has_version = version_file in content
    already_has_build   = build_file in content

    if already_has_version and already_has_build:
        # Nada que hacer — escribir igual para limpiar las purgas si las hubo
        if purged:
            with open(spec_path, "w", encoding="utf-8") as f:
                f.writelines(lines)
            print("✅ brain.spec limpiado (entradas actuales ya presentes)")
        else:
            print("✅ brain.spec ya está actualizado — sin cambios")
        return True

    # ── 3. Localizar el bloque datas = [...] ────────────────────────────────
    datas_start_idx, datas_end_idx = find_datas_block(lines)

    if datas_start_idx is None or datas_end_idx is None:
        print("❌ Could not find 'datas = [...]' section in brain.spec")
        print(f"   Searched {len(lines)} lines")
        return False

    print(f"✅ Found 'datas' section: lines {datas_start_idx + 1} to {datas_end_idx + 1}")

    # ── 4. Insertar entradas del entorno actual ──────────────────────────────
    new_entries: list[str] = []
    if not already_has_version:
        new_entries.append(f"    (r'{version_file}', '.'),\n")
    if not already_has_build:
        new_entries.append(f"    (r'{build_file}', '.'),\n")

    # Insertar ANTES del ']' de cierre
    new_lines = lines[:datas_end_idx] + new_entries + lines[datas_end_idx:]

    # ── 5. Escribir spec actualizado ─────────────────────────────────────────
    try:
        with open(spec_path, "w", encoding="utf-8") as f:
            f.writelines(new_lines)
    except Exception as e:
        print(f"❌ Error writing to brain.spec: {e}")
        return False

    print("✅ Updated brain.spec with:")
    for entry in new_entries:
        print(f"   {entry.strip()}")

    return True


def main() -> int:
    """Main execution flow."""
    spec_path = get_spec_path()

    if not update_spec_datas(spec_path):
        print("\n❌ Failed to update brain.spec")
        return 1

    print("\n✅ brain.spec updated successfully")
    return 0


if __name__ == "__main__":
    sys.exit(main())
