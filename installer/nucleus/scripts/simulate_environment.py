#!/usr/bin/env python3
"""
extract_go_files.py

Utilidad para extraer archivos .go (o archivos específicos) del proyecto y guardarlos
en un único archivo de texto dentro de la carpeta codebase/, con formato markdown.

Ubicación esperada: nucleus/scripts/extract_go_files.py
Genera archivos en:   nucleus/codebase/go_files_YYYY-MM-DD_HH-MM-SS.txt
"""

import os
import sys
from datetime import datetime
from pathlib import Path


def find_project_root() -> Path:
    """
    Determina la raíz del proyecto de forma robusta.
    Asume que el script está en: proyecto/nucleus/scripts/
    → subimos dos niveles para llegar a la carpeta que contiene go.mod
    """
    script_path = Path(__file__).resolve()
    # Subimos dos niveles: scripts/ → nucleus/ → raíz del proyecto
    project_root = script_path.parent.parent

    # Validación básica: buscamos go.mod como ancla confiable
    if not (project_root / "go.mod").is_file():
        print("Advertencia: No se encontró go.mod en el directorio inferido como raíz.")
        print("             Verifica que el script esté en <raíz>/nucleus/scripts/")
        # Continuamos de todos modos, pero con advertencia

    return project_root


def extract_go_files(specific_files: list[str] | None = None) -> None:
    project_root = find_project_root()
    codebase_dir = project_root / "codebase"
    codebase_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    output_filename = f"go_files_{timestamp}.txt"
    output_path = codebase_dir / output_filename

    print(f"Proyecto raíz detectado: {project_root}")
    print(f"Guardando resultado en:  {output_path}")
    print("-" * 70)

    files_processed = 0

    with output_path.open("w", encoding="utf-8") as f:
        if specific_files:
            # Modo: archivos específicos pasados como argumentos
            print(f"Modo: {len(specific_files)} archivo(s) específico(s)")
            for file_arg in specific_files:
                # Intentamos resolver de varias formas
                possible_paths = [
                    Path(file_arg),                           # ruta tal cual
                    project_root / file_arg,                  # relativa a raíz
                    project_root / "nucleus" / file_arg,      # relativa a nucleus/
                ]

                file_path = None
                for p in possible_paths:
                    if p.is_file():
                        file_path = p
                        break

                # Último intento: búsqueda recursiva (más lenta)
                if not file_path:
                    for found in project_root.rglob(file_arg):
                        if found.is_file():
                            file_path = found
                            break

                if not file_path or not file_path.is_file():
                    print(f"  ✗ No encontrado: {file_arg}")
                    continue

                relative = file_path.relative_to(project_root).as_posix()
                print(f"  ✓ {relative}")

                ext = file_path.suffix.lstrip(".")
                lang = ext if ext else "text"

                f.write(f"{relative}\n\n")
                f.write(f"```{lang}\n")
                try:
                    content = file_path.read_text(encoding="utf-8")
                    f.write(content)
                except Exception as e:
                    f.write(f"// ERROR al leer archivo: {e}\n")
                    print(f"     → error: {e}")
                f.write("\n```\n\n")
                f.write("-" * 80 + "\n\n")

                files_processed += 1

        else:
            # Modo: todos los archivos .go (excepto dentro de codebase/)
            print("Modo: todos los archivos .go del proyecto")
            for file_path in project_root.rglob("*.go"):
                if "codebase" in file_path.parts:
                    continue

                relative = file_path.relative_to(project_root).as_posix()
                print(f"  ✓ {relative}")

                f.write(f"{relative}\n\n")
                f.write("```go\n")
                try:
                    content = file_path.read_text(encoding="utf-8")
                    f.write(content)
                except Exception as e:
                    f.write(f"// ERROR al leer archivo: {e}\n")
                    print(f"     → error: {e}")
                f.write("\n```\n\n")
                f.write("-" * 80 + "\n\n")

                files_processed += 1

    print("-" * 70)
    print(f"Archivos procesados: {files_processed}")
    print(f"Archivo generado:   {output_path.name}")
    print("Listo.\n")


if __name__ == "__main__":
    args = sys.argv[1:]

    if "--help" in args or "-h" in args:
        print(__doc__)
        print("Uso:")
        print("  python extract_go_files.py                     → todos los .go")
        print("  python extract_go_files.py --all               → todos los .go (explícito)")
        print("  python extract_go_files.py path/to/file.go     → solo archivos indicados")
        print("  python extract_go_files.py file1.go file2.go   → varios archivos")
        sys.exit(0)

    if "--all" in args or "-a" in args:
        extract_go_files()
    elif args:
        extract_go_files(specific_files=args)
    else:
        extract_go_files()