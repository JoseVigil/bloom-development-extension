#!/usr/bin/env python3
"""
capture_versions.py — Bloom Version Snapshot
=============================================
Lee todos los archivos de versionado listados en la sección "Versioning"
del .gitignore correspondiente a la plataforma actual, y genera un archivo:

    linux_versions.txt
    darwin_versions.txt
    windows_versions.txt

con el contenido de cada archivo en formato YAML separado por "---".

Uso:
    python3 scripts/capture_versions.py

Se integra como paso final de build-all.py automáticamente.
"""

from __future__ import annotations

import sys
import datetime
from pathlib import Path

# ─────────────────────────────────────────────────────────────────────────────
# Plataforma
# ─────────────────────────────────────────────────────────────────────────────

IS_WINDOWS = sys.platform == "win32"
IS_MACOS   = sys.platform == "darwin"

PLATFORM = (
    "windows" if IS_WINDOWS else
    "darwin"  if IS_MACOS   else
    "linux"
)

ROOT       = Path(__file__).resolve().parent.parent
GITIGNORE  = ROOT / ".gitignore"
OUTPUT     = ROOT / f"{PLATFORM}_versions.txt"


# ─────────────────────────────────────────────────────────────────────────────
# Leer paths de versioning desde .gitignore
# ─────────────────────────────────────────────────────────────────────────────

def _parse_versioning_paths(platform: str) -> list[Path]:
    """
    Extrae los paths de la sección "# <Platform>:" dentro de "# Versioning"
    en .gitignore. Solo lee la sección que corresponde a la plataforma actual.

    Ejemplo en .gitignore:
        # Versioning
        # Linux:
        brain/build_number.txt
        ...
        # Darwin:
        ...
    """
    if not GITIGNORE.exists():
        print(f"  ⚠  No se encontró .gitignore en {ROOT}")
        return []

    lines      = GITIGNORE.read_text(encoding="utf-8").splitlines()
    in_versioning  = False
    in_platform    = False
    paths: list[Path] = []

    platform_header = f"# {platform.capitalize()}:"

    for line in lines:
        stripped = line.strip()

        # Detectar sección Versioning
        if stripped == "# ============================================================================":
            continue
        if stripped == "# Versioning":
            in_versioning = True
            continue

        # Salir de versioning si empieza otra sección ===
        if in_versioning and stripped.startswith("# ==="):
            break

        if not in_versioning:
            continue

        # Detectar encabezado de plataforma: "# Linux:", "# Darwin:", "# Windows:"
        if stripped.startswith("# ") and stripped.endswith(":"):
            in_platform = (stripped == platform_header)
            continue

        # Dentro de la plataforma correcta, leer paths no vacíos y no comentarios
        if in_platform and stripped and not stripped.startswith("#"):
            paths.append(ROOT / stripped)

    return paths


# ─────────────────────────────────────────────────────────────────────────────
# Generar snapshot
# ─────────────────────────────────────────────────────────────────────────────

def capture_versions() -> None:
    paths = _parse_versioning_paths(PLATFORM)

    if not paths:
        print(f"  ⚠  No se encontraron entradas de versioning para '{PLATFORM}' en .gitignore")
        return

    now    = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    blocks: list[str] = []

    blocks.append(f"# Bloom Version Snapshot — {PLATFORM}")
    blocks.append(f"# Generated: {now}")
    blocks.append("")

    found   = 0
    missing = 0

    for path in paths:
        try:
            rel = path.relative_to(ROOT)
        except ValueError:
            rel = path

        if not path.exists():
            missing += 1
            continue

        content = path.read_text(encoding="utf-8", errors="replace").rstrip()
        blocks.append("---")
        blocks.append(str(rel))
        blocks.append(content)
        blocks.append("")
        found += 1

    blocks.append("---")

    output_text = "\n".join(blocks)
    OUTPUT.write_text(output_text, encoding="utf-8")

    print(f"  ✅ {OUTPUT.name} generado — {found} archivos capturados"
          + (f", {missing} no encontrados (aún no compilados)" if missing else ""))


# ─────────────────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    capture_versions()
