#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Update brain.spec to include VERSION and __build__.py in datas.

ESTRATEGIA:
  1. Purgar TODAS las entradas previas de VERSION y __build__.py
     (sin importar de qué máquina o SO vienen).
  2. Insertar las dos entradas correctas usando PROJECT_ROOT relativo
     (multiplataforma, nunca hardcodea paths absolutos).

Esto evita la acumulación de paths de distintas máquinas que rompía
el build en macOS/Linux cuando el spec contenía paths de Windows (y viceversa).
"""

import re
import sys
from pathlib import Path
from typing import List, Optional, Tuple


def get_spec_path() -> Path:
    script_dir = Path(__file__).parent.resolve()
    return script_dir / "brain.spec"


def get_project_root() -> Path:
    script_dir = Path(__file__).parent.resolve()
    return script_dir.parent.parent


_STALE_ENTRY_RE = re.compile(
    r"^\s*\(.*?(?:VERSION|__build__\.py).*?,\s*'\.'\s*\),?\s*\n?",
    re.MULTILINE,
)


def purge_stale_entries(lines: List[str]) -> Tuple[List[str], int]:
    content = "".join(lines)
    new_content, count = _STALE_ENTRY_RE.subn("", content)
    if count:
        return new_content.splitlines(keepends=True), count
    return lines, 0


def find_datas_block(lines: List[str]) -> Tuple[Optional[int], Optional[int]]:
    datas_start_idx = None
    datas_end_idx = None
    bracket_count = 0
    in_datas = False

    for i, line in enumerate(lines):
        if not in_datas:
            stripped = line.lstrip()
            if (
                stripped.startswith("datas")
                and "=" in line
                and "[" in line
                and not line.startswith(" " * 4)
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
    if not spec_path.exists():
        print(f"❌ brain.spec not found at: {spec_path}")
        return False

    with open(spec_path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    # ── 1. Purgar entradas obsoletas ────────────────────────────────────────
    lines, purged = purge_stale_entries(lines)
    if purged:
        print(f"🧹 Purgadas {purged} entrada(s) obsoleta(s) de VERSION/__build__.py")
    else:
        print("✅ No había entradas obsoletas")

    # ── 2. Verificar si las entradas correctas ya están presentes ───────────
    CANONICAL_VERSION = "    (str(PROJECT_ROOT / 'brain' / 'VERSION'), '.'),\n"
    CANONICAL_BUILD   = "    (str(PROJECT_ROOT / 'brain' / '__build__.py'), '.'),\n"

    content = "".join(lines)
    already_has_version = "PROJECT_ROOT / 'brain' / 'VERSION'" in content
    already_has_build   = "PROJECT_ROOT / 'brain' / '__build__.py'" in content

    if already_has_version and already_has_build:
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

    # ── 4. Insertar entradas canónicas con PROJECT_ROOT ──────────────────────
    new_entries = []
    if not already_has_version:
        new_entries.append(CANONICAL_VERSION)
    if not already_has_build:
        new_entries.append(CANONICAL_BUILD)

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
    spec_path = get_spec_path()

    if not update_spec_datas(spec_path):
        print("\n❌ Failed to update brain.spec")
        return 1

    print("\n✅ brain.spec updated su
    .ccessfully")
    return 0


if __name__ == "__main__":
    sys.exit(main())