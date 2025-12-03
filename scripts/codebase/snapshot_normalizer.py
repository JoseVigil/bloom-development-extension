import argparse
import re
import sys
from typing import List, Tuple, Optional, Dict, Iterable

HEADER_RE = re.compile(r'^##\s*Archivo\s+(\d+)\s*:\s*(.+?)\s*\((MODIFICAR|CREAR NUEVO)\)\s*$', re.IGNORECASE)
HEADER_LOOSE_RE = re.compile(r'^##\s*(Archivo\s*\d*\s*:\s*.+)$', re.IGNORECASE)
BACKTICK_FENCE_RE = re.compile(r'^```.*$')
TAB_RE = re.compile(r'\t')


class Section:
    def __init__(self, raw_header: str = "", index: Optional[int] = None, path: str = "", action: str = ""):
        self.raw_header = raw_header
        self.index = index
        self.path = path
        self.action = action
        self.raw_lines: List[str] = []
        self.normalized_lines: List[str] = []
        self.problems: List[str] = []

    def add_line(self, line: str):
        self.raw_lines.append(line.rstrip("\n"))

    def detect_problems_and_normalize(self):
        lines = [TAB_RE.sub(" " * 4, l) for l in self.raw_lines]

        inside_fence = False
        stripped_lines: List[str] = []
        fences_found = 0

        for l in lines:
            if BACKTICK_FENCE_RE.match(l.strip()):
                fences_found += 1
                inside_fence = not inside_fence
                continue
            stripped_lines.append(l)

        if fences_found:
            self.problems.append(f"Se eliminaron {fences_found} fences de triple backticks")

        min_indent = None
        for l in stripped_lines:
            if l.strip() == "":
                continue
            lead = len(l) - len(l.lstrip(" "))
            if min_indent is None or lead < min_indent:
                min_indent = lead

        if min_indent is None:
            self.problems.append("Sección vacía detectada")
            min_indent = 0
        elif min_indent == 0:
            self.problems.append("Algunas líneas no tenían indentación")

        normalized = []
        for l in stripped_lines:
            if l.strip() == "":
                normalized.append("")
                continue

            lead = len(l) - len(l.lstrip(" "))
            to_remove = min(lead, min_indent)
            new_line = l[to_remove:]
            new_line = TAB_RE.sub(" " * 4, new_line)
            normalized.append(" " * 4 + new_line.rstrip())

        for i, nl in enumerate(normalized):
            if "\t" in nl:
                self.problems.append(f"Tab detectado en línea {i+1} tras normalizar")

        self.normalized_lines = normalized

    def assemble_section_text(self) -> List[str]:
        out = []
        header = self.raw_header.strip()

        if not HEADER_RE.match(header):
            loose = HEADER_LOOSE_RE.match(header)
            if loose:
                repaired = f"## Archivo: {loose.group(1).strip()} (MODIFICAR)"
                self.problems.append("Header reparado")
                header = repaired
            else:
                self.problems.append("Header inválido")

        out.append(header)
        out.append("")

        if self.normalized_lines:
            out.extend(self.normalized_lines)
        else:
            out.append("    # SECCION VACIA - revisar")
            self.problems.append("Sección vacía insertada")

        out.append("")
        return out


def parse_sections(lines: Iterable[str]) -> List[Section]:
    sections: List[Section] = []
    current: Optional[Section] = None
    for raw in lines:
        l = raw.rstrip("\n")
        stripped = l.strip()

        if stripped.startswith("##"):
            if current is not None:
                sections.append(current)

            m = HEADER_RE.match(stripped)
            if m:
                idx = int(m.group(1))
                path = m.group(2).strip()
                action = m.group(3).upper()
                header_text = f"## Archivo {idx}: {path} ({action})"
                current = Section(raw_header=header_text, index=idx, path=path, action=action)
            else:
                current = Section(raw_header=stripped)
                current.problems.append("Header mal formado detectado")

            continue

        if current is None:
            current = Section(raw_header="## Archivo 0: prefacio (MODIFICAR)", index=0, path="prefacio", action="MODIFICAR")
            current.problems.append("Contenido antes del primer header")

        current.add_line(l)

    if current is not None:
        sections.append(current)

    return sections


def normalize_snapshot(path: str) -> Tuple[List[str], Dict[str, int], List[Section]]:
    stats = {
        "total_sections": 0,
        "total_lines": 0,
        "sections_with_problems": 0,
        "total_problems": 0,
        "headers_repaired": 0,
    }

    with open(path, "r", encoding="utf-8") as f:
        raw_lines = f.readlines()

    stats["total_lines"] = len(raw_lines)

    sections = parse_sections(raw_lines)
    stats["total_sections"] = len(sections)

    output: List[str] = []

    for sec in sections:
        sec.detect_problems_and_normalize()

        if sec.problems:
            stats["sections_with_problems"] += 1
            stats["total_problems"] += len(sec.problems)

        if sec.index is None:
            stats["headers_repaired"] += 1

        output.extend(sec.assemble_section_text())

    return output, stats, sections


def write_output(lines: List[str], path: str):
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        for l in lines:
            f.write(l + "\n")


def print_summary(stats: Dict[str, int], sections: List[Section]):
    print("Snapshot Normalizer - Resumen")
    print("-----------------------------")
    print(f"Secciones detectadas: {stats['total_sections']}")
    print(f"Líneas totales: {stats['total_lines']}")
    print(f"Secciones con problemas: {stats['sections_with_problems']}")
    print(f"Problemas totales: {stats['total_problems']}")
    print(f"Headers reparados: {stats['headers_repaired']}")
    print("")

    for sec in sections:
        if sec.problems:
            print(f"[{sec.raw_header}]")
            for p in sec.problems:
                print("  -", p)
            print("")


def main():
    parser = argparse.ArgumentParser(
        description=(
            "Normaliza archivos snapshot Markdown que contienen múltiples archivos embebidos.\n\n"
            "Corrige indentación, elimina backticks, repara headers y genera una salida limpia "
            "lista para procesar por herramientas automáticas."
        ),
        formatter_class=argparse.RawTextHelpFormatter
    )

    parser.add_argument("input", help="Ruta del snapshot de entrada (.md)")
    parser.add_argument("output", help="Ruta de salida del archivo normalizado (.md)")
    parser.add_argument("--dry-run", action="store_true", help="No escribe archivo, solo muestra análisis")

    args = parser.parse_args()

    try:
        normalized, stats, sections = normalize_snapshot(args.input)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(2)

    print_summary(stats, sections)

    if args.dry_run:
        print("Dry-run activado: no se genera archivo de salida.")
        return

    write_output(normalized, args.output)
    print(f"Archivo normalizado escrito en: {args.output}")


if __name__ == "__main__":
    main()
