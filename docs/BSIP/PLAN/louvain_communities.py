"""
INV-00X — Paso 2: Louvain sobre el grafo de imports

Construye el mismo grafo de dependencias que EnrichedTreeGenerator
(imports relativos, Python/TS/JS) y le corre detección de comunidades
(Louvain, via networkx.algorithms.community.louvain_communities) para
producir el primer particionado candidato de "Gene por cohesión de
código" — sin tocar ningún embedding, costo cero de vectorización.

Este particionado es el que después se compara (Paso 4, ARI/NMI) contra
el particionado semántico de HDBSCAN (Paso 3, pendiente de definir el
bucket de ChromaDB) para responder empíricamente la pregunta 4 del
documento consolidado: ¿cohesión de código y cohesión temática coinciden?

También calcula el proxy de "pertenencia multi-Gene" (pregunta 6):
archivos cuyo fan-in viene de más de una comunidad distinta.

Uso:
    python louvain_communities.py /path/al/root --json communities.json
    python louvain_communities.py /path/al/root --min-community-size 2
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Optional

import networkx as nx
from networkx.algorithms.community import louvain_communities, modularity

SKIP_DIRS = {
    "node_modules", ".git", "__pycache__", ".venv", "venv",
    "dist", "build", ".next", ".idea", ".vscode",
}
DEFAULT_EXTENSIONS = {".py", ".ts", ".tsx", ".js", ".jsx"}


def should_skip(path: Path) -> bool:
    return any(part in SKIP_DIRS for part in path.parts)


def collect_files(root: Path, extensions: set[str]) -> list[Path]:
    return [
        p for p in root.rglob("*")
        if p.is_file() and p.suffix in extensions and not should_skip(p)
    ]


def extract_imports(content: str, suffix: str) -> list[str]:
    """Misma lógica que EnrichedTreeGenerator._extract_imports."""
    imports = []
    if suffix == ".py":
        pattern = r"(?:from\s+([.\w]+)\s+import|import\s+([.\w]+))"
        for m in re.finditer(pattern, content):
            imp = m.group(1) or m.group(2)
            if imp and imp.startswith("."):
                imports.append(imp)
    elif suffix in (".ts", ".tsx", ".js", ".jsx"):
        pattern = r"import\s+.*?\s+from\s+['\"]([^'\"]+)['\"]"
        for m in re.finditer(pattern, content):
            imp = m.group(1)
            if imp.startswith("."):
                imports.append(imp)
    return imports


def resolve_import(from_file: str, import_path: str, known_files: set[str]) -> Optional[str]:
    """
    Extiende _resolve_import de EnrichedTreeGenerator: el original solo
    resuelve imports relativos de un segmento ("from .foo import X").
    Esta versión también resuelve imports multi-segmento
    ("from ...core.bisp.vectorize import X"), convirtiendo los puntos
    intermedios en subdirectorios — necesario porque en la práctica
    Python permite ambas formas y descartar la segunda subestima
    fuertemente el grafo real de dependencias.
    """
    from_dir = Path(from_file).parent
    if not import_path.startswith("."):
        return None

    levels_up = len(import_path) - len(import_path.lstrip("."))
    clean = import_path.lstrip(".")
    target_dir = from_dir
    for _ in range(levels_up - 1):
        target_dir = target_dir.parent

    if not clean:
        return None

    parts = clean.split(".")
    module_name = parts[-1]
    subdirs = parts[:-1]
    candidate_dir = target_dir
    for sub in subdirs:
        candidate_dir = candidate_dir / sub

    for ext in (".py", ".ts", ".tsx", ".js", ".jsx"):
        candidate = str(candidate_dir / f"{module_name}{ext}")
        if candidate in known_files:
            return candidate
    return None


def build_graph(root: Path, extensions: set[str]) -> nx.Graph:
    """
    Construye grafo NO dirigido y ponderado para Louvain.
    Dirección se colapsa (A importa B ~ B es importado por A, para
    fines de comunidad ambos indican "trabajan juntos"); el peso
    acumula si hay múltiples relaciones entre el mismo par.
    """
    files = collect_files(root, extensions)
    rel_paths = {str(f.relative_to(root)) for f in files}

    file_imports: dict[str, list[str]] = {}
    for f in files:
        rel = str(f.relative_to(root))
        try:
            content = f.read_text(encoding="utf-8")
        except (UnicodeDecodeError, PermissionError, OSError):
            continue
        file_imports[rel] = extract_imports(content, f.suffix)

    graph = nx.Graph()
    graph.add_nodes_from(rel_paths)

    for src, imps in file_imports.items():
        for imp in imps:
            dst = resolve_import(src, imp, rel_paths)
            if dst and dst != src:
                if graph.has_edge(src, dst):
                    graph[src][dst]["weight"] += 1
                else:
                    graph.add_edge(src, dst, weight=1)

    return graph


def analyze_multi_community_fanin(graph: nx.Graph, communities: list[set[str]]) -> list[dict]:
    """
    Proxy gratuito para la pregunta 6 (¿multi-Gene es excepción o norma?):
    un archivo cuyos vecinos en el grafo caen en >1 comunidad distinta
    es candidato a pertenencia dual, o a estar mal ubicado en su propia
    comunidad.
    """
    node_to_community = {}
    for idx, comm in enumerate(communities):
        for node in comm:
            node_to_community[node] = idx

    multi = []
    for node in graph.nodes():
        neighbor_communities = {node_to_community[n] for n in graph.neighbors(node)}
        own = node_to_community[node]
        external = neighbor_communities - {own}
        if len(external) >= 1 and graph.degree(node) > 0:
            multi.append({
                "file": node,
                "own_community": own,
                "connects_to_communities": sorted(external),
                "degree": graph.degree(node),
            })
    return multi


def main() -> None:
    parser = argparse.ArgumentParser(description="Louvain sobre grafo de imports (INV-00X, H1/Paso 2)")
    parser.add_argument("root", type=Path)
    parser.add_argument("--ext", nargs="+", default=None)
    parser.add_argument("--min-community-size", type=int, default=1,
                         help="Comunidades más chicas que esto se reportan aparte como 'singletons/ruido'")
    parser.add_argument("--resolution", type=float, default=1.0,
                         help="Resolución de Louvain (>1 = comunidades más chicas, <1 = más grandes)")
    parser.add_argument("--json", type=Path, default=None)
    args = parser.parse_args()

    if not args.root.exists():
        print(f"Error: {args.root} no existe", file=sys.stderr)
        sys.exit(1)

    extensions = set(args.ext) if args.ext else DEFAULT_EXTENSIONS
    graph = build_graph(args.root, extensions)

    isolated = [n for n in graph.nodes() if graph.degree(n) == 0]
    connected_subgraph = graph.subgraph([n for n in graph.nodes() if graph.degree(n) > 0])

    if connected_subgraph.number_of_nodes() == 0:
        print("No hay edges de import relativo detectables — no se puede correr Louvain.", file=sys.stderr)
        print(f"Total archivos: {graph.number_of_nodes()}, todos sin imports relativos resueltos.", file=sys.stderr)
        sys.exit(1)

    communities = louvain_communities(
        connected_subgraph, weight="weight", resolution=args.resolution, seed=42
    )
    communities = [set(c) for c in communities]
    mod_score = modularity(connected_subgraph, communities, weight="weight")

    real_communities = [c for c in communities if len(c) >= args.min_community_size]
    noise_communities = [c for c in communities if len(c) < args.min_community_size]

    multi = analyze_multi_community_fanin(connected_subgraph, communities)

    report = {
        "root": str(args.root),
        "total_files_scanned": graph.number_of_nodes(),
        "files_with_no_relative_imports": len(isolated),
        "files_in_dependency_graph": connected_subgraph.number_of_nodes(),
        "resolution": args.resolution,
        "modularity_score": round(mod_score, 4),
        "num_communities": len(real_communities),
        "num_noise_communities_below_min_size": len(noise_communities),
        "communities": [
            {
                "community_id": i,
                "size": len(c),
                "files": sorted(c),
            }
            for i, c in enumerate(real_communities)
        ],
        "multi_community_fanin_candidates": {
            "count": len(multi),
            "pct_of_graph": round(100 * len(multi) / connected_subgraph.number_of_nodes(), 1),
            "sample": multi[:15],
        },
    }

    print("=" * 70)
    print("LOUVAIN COMMUNITY DETECTION — INV-00X Paso 2 (H1, cohesión de código)")
    print("=" * 70)
    print(f"Root: {report['root']}")
    print(f"Total archivos escaneados: {report['total_files_scanned']}")
    print(f"Archivos sin ningún import relativo (aislados del grafo): {report['files_with_no_relative_imports']}")
    print(f"Archivos en el grafo de dependencias: {report['files_in_dependency_graph']}")
    print(f"Modularidad: {report['modularity_score']}  "
          f"(>0.3 = estructura de comunidades razonable; ~0 = casi sin estructura; <0 no debería darse)")
    print(f"Comunidades encontradas (size >= {args.min_community_size}): {report['num_communities']}")
    if noise_communities:
        print(f"Comunidades descartadas por chicas (< {args.min_community_size}): {report['num_noise_communities_below_min_size']}")
    print()
    for c in report["communities"]:
        preview = ", ".join(c["files"][:4]) + (" ..." if c["size"] > 4 else "")
        print(f"  [Comunidad {c['community_id']:3d}] {c['size']:3d} archivos — {preview}")
    print()
    print(f"Candidatos a pertenencia multi-comunidad (proxy de pregunta 6): "
          f"{report['multi_community_fanin_candidates']['count']} "
          f"({report['multi_community_fanin_candidates']['pct_of_graph']}% del grafo)")

    if args.json:
        args.json.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"\nReporte JSON guardado en: {args.json}")


if __name__ == "__main__":
    main()
