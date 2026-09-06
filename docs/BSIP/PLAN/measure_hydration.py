"""
INV-00X — Paso 1: measure_hydration (ajustado, sin genome.json)

Mide, sobre el codebase real, cuántos archivos están en L0 (sin metadata)
vs L1 (con [BLOOM-META] summary/keywords legible), reusando exactamente
la misma lógica de extracción que EnrichedTreeGenerator._extract_file_metadata
para que el número sea comparable 1:1 con lo que el pipeline de Context Plan
ya ve hoy.

L2 (declarado en genome.json), L3 (vectorizado) y L4 (cluster validado)
quedan en 0 por definición mientras no exista manifiesto ni vectorización —
se reportan igual, en cero, para que el output tenga la forma final del
modelo de hidratación completo (H4) desde el día uno.

Uso:
    python measure_hydration.py /path/al/root/del/proyecto
    python measure_hydration.py /path/al/root/del/proyecto --ext .py .ts .tsx
    python measure_hydration.py /path/al/root/del/proyecto --json out.json
"""

from __future__ import annotations

import argparse
import ast
import json
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Optional

SKIP_DIRS = {
    "node_modules", ".git", "__pycache__", ".venv", "venv",
    "dist", "build", ".next", ".idea", ".vscode",
}

DEFAULT_EXTENSIONS = {".py", ".ts", ".tsx", ".js", ".jsx"}


def should_skip(path: Path) -> bool:
    return any(part in SKIP_DIRS for part in path.parts)


def extract_docstring(content: str, suffix: str) -> Optional[str]:
    """Misma lógica que EnrichedTreeGenerator._extract_docstring."""
    if suffix == ".py":
        try:
            tree = ast.parse(content)
            return ast.get_docstring(tree)
        except SyntaxError:
            return None
    elif suffix in (".ts", ".tsx", ".js", ".jsx"):
        match = re.search(r"/\*\*(.*?)\*/", content, re.DOTALL)
        if match:
            return match.group(1)
    return None


def has_bloom_meta(content: str, suffix: str) -> tuple[bool, bool]:
    """
    Returns: (has_summary, has_keywords) — ambos booleanos por separado,
    porque un archivo puede tener uno sin el otro y eso también es
    información sobre qué tan completa está la hidratación L1.
    """
    docstring = extract_docstring(content, suffix)
    if not docstring:
        return False, False
    has_summary = bool(re.search(r"^summary:\s*\S+", docstring, re.MULTILINE))
    has_keywords = bool(re.search(r"^keywords:\s*\S+", docstring, re.MULTILINE))
    return has_summary, has_keywords


def collect_files(root: Path, extensions: set[str]) -> list[Path]:
    files = []
    for item in root.rglob("*"):
        if item.is_file() and item.suffix in extensions and not should_skip(item):
            files.append(item)
    return files


def measure(root: Path, extensions: set[str]) -> dict:
    files = collect_files(root, extensions)

    l0_files: list[str] = []
    l1_full: list[str] = []       # summary Y keywords
    l1_partial: list[str] = []    # summary O keywords, no ambos
    unreadable: list[str] = []

    by_dir_l0 = defaultdict(int)
    by_dir_total = defaultdict(int)

    for f in files:
        rel = str(f.relative_to(root))
        dir_name = str(f.parent.relative_to(root))
        by_dir_total[dir_name] += 1

        try:
            content = f.read_text(encoding="utf-8")
        except (UnicodeDecodeError, PermissionError, OSError):
            unreadable.append(rel)
            by_dir_l0[dir_name] += 1
            continue

        has_summary, has_keywords = has_bloom_meta(content, f.suffix)

        if has_summary and has_keywords:
            l1_full.append(rel)
        elif has_summary or has_keywords:
            l1_partial.append(rel)
        else:
            l0_files.append(rel)
            by_dir_l0[dir_name] += 1

    total = len(files)
    l1_total = len(l1_full) + len(l1_partial)

    # Directorios con peor cobertura (candidatos a priorizar hidratación)
    worst_dirs = sorted(
        (
            (d, by_dir_l0[d], by_dir_total[d], by_dir_l0[d] / by_dir_total[d])
            for d in by_dir_total
        ),
        key=lambda x: (-x[3], -x[2]),
    )[:10]

    return {
        "root": str(root),
        "extensions_scanned": sorted(extensions),
        "total_files": total,
        "levels": {
            "L0_sin_metadata": len(l0_files),
            "L1_parcial_summary_o_keywords": len(l1_partial),
            "L1_completo_summary_y_keywords": len(l1_full),
            "L2_declarado_genome": 0,   # no existe manifiesto todavía
            "L3_vectorizado": 0,        # pendiente de Paso 3 (H1)
            "L4_cluster_validado": 0,   # pendiente de H1 aceptada
        },
        "coverage_pct": {
            "L0": round(100 * len(l0_files) / total, 1) if total else 0.0,
            "L1_any": round(100 * l1_total / total, 1) if total else 0.0,
            "L1_full": round(100 * len(l1_full) / total, 1) if total else 0.0,
        },
        "unreadable_files": unreadable,
        "worst_covered_directories": [
            {"dir": d, "l0_count": l0, "total": tot, "l0_ratio": round(r, 2)}
            for d, l0, tot, r in worst_dirs
        ],
        "sample_l0_files": l0_files[:20],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Mide hidratación L0/L1 real del codebase (INV-00X, H4/Paso 1)")
    parser.add_argument("root", type=Path, help="Directorio raíz del codebase a escanear")
    parser.add_argument("--ext", nargs="+", default=None, help="Extensiones a escanear (default: .py .ts .tsx .js .jsx)")
    parser.add_argument("--json", type=Path, default=None, help="Path opcional para guardar el reporte en JSON")
    args = parser.parse_args()

    if not args.root.exists():
        print(f"Error: {args.root} no existe", file=sys.stderr)
        sys.exit(1)

    extensions = set(args.ext) if args.ext else DEFAULT_EXTENSIONS
    report = measure(args.root, extensions)

    print("=" * 70)
    print("MEASURE HYDRATION — INV-00X Paso 1 (L0/L1)")
    print("=" * 70)
    print(f"Root: {report['root']}")
    print(f"Extensiones: {report['extensions_scanned']}")
    print(f"Total archivos: {report['total_files']}")
    print()
    print("Niveles:")
    for k, v in report["levels"].items():
        print(f"  {k:35s} {v}")
    print()
    print("Cobertura:")
    for k, v in report["coverage_pct"].items():
        print(f"  {k:12s} {v}%")
    if report["unreadable_files"]:
        print(f"\nArchivos no legibles (binarios/encoding): {len(report['unreadable_files'])}")
    print("\nPeores directorios cubiertos (top 10):")
    for d in report["worst_covered_directories"]:
        print(f"  {d['dir']:40s} {d['l0_count']}/{d['total']} sin metadata ({d['l0_ratio']*100:.0f}%)")

    if args.json:
        args.json.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"\nReporte JSON guardado en: {args.json}")


if __name__ == "__main__":
    main()
