#!/usr/bin/env python3
"""
extract_go_files.py

Extrae archivos .go (o archivos específicos) del proyecto Go y los guarda formateados
en codebase/go_files_YYYY-MM-DD_HH-MM-SS.txt

Debe estar ubicado en: <raíz-del-módulo>/.../scripts/
Busca hacia arriba hasta encontrar go.mod como ancla de la raíz del proyecto.
"""

import os
import sys
from datetime import datetime
from pathlib import Path


def find_project_root() -> Path:
    """Sube directorios hasta encontrar go.mod (raíz del módulo Go)"""
    current = Path(__file__).resolve().parent   # carpeta donde está este script

    while current != current.parent:  # mientras no lleguemos a la raíz del disco
        if (current / "go.mod").is_file():
            return current
        current = current.parent

    # Si no encontramos go.mod → usamos el directorio dos niveles arriba (fallback razonable)
    fallback = Path(__file__).resolve().parent.parent
    print("Advertencia: No se encontró go.mod → usando fallback (dos niveles arriba)")
    return fallback


def extract_go_files(specific_files=None):
    root_dir = find_project_root()
    print(f"Directorio raíz del proyecto (detectado vía go.mod): {root_dir}")

    codebase_dir = root_dir / "codebase"
    codebase_dir.mkdir(parents=True, exist_ok=True)

    fecha = datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
    output_file = codebase_dir / f'go_files_{fecha}.txt'
    print(f"Archivo de salida: {output_file}")

    files_found = 0

    with output_file.open("w", encoding="utf-8") as f:
        if specific_files:
            print(f"\nModo: Archivos específicos ({len(specific_files)})")
            for file_name in specific_files:
                file_name = file_name.replace("\\", "/")  # normalizamos slashes
                file_path = None

                # Intentos de resolución (en orden de probabilidad)
                candidates = [
                    root_dir / file_name,
                    root_dir / "nucleus" / file_name,      # si alguien pasa internal/...
                    root_dir / file_name.lstrip("./"),     # quita ./ inicial si existe
                ]

                for cand in candidates:
                    if cand.is_file():
                        file_path = cand
                        break

                # Último recurso: búsqueda recursiva (lenta pero segura)
                if not file_path:
                    matches = list(root_dir.rglob(file_name))
                    if matches:
                        file_path = matches[0]  # tomamos el primero
                        if len(matches) > 1:
                            print(f"  Advertencia: múltiples '{file_name}' encontrados, usando el primero")

                if file_path and file_path.is_file():
                    files_found += 1
                    relative_path = file_path.relative_to(root_dir).as_posix()
                    print(f"  Procesando: {relative_path}")

                    f.write(f"{relative_path}\n\n")

                    ext = file_path.suffix.lstrip(".")
                    lang = ext if ext else "text"
                    f.write(f"```{lang}\n")

                    try:
                        content = file_path.read_text(encoding="utf-8")
                        f.write(content.rstrip() + "\n")
                    except Exception as e:
                        f.write(f"// ERROR al leer: {e}\n")
                        print(f"    ERROR: {e}")

                    f.write("```\n\n")
                    f.write("-" * 80 + "\n\n")
                else:
                    print(f"  No encontrado: {file_name}")

        else:
            # Modo todos los .go
            print("\nModo: todos los archivos .go")
            for file_path in root_dir.rglob("*.go"):
                if "codebase" in file_path.parts or "vendor" in file_path.parts:
                    continue
                files_found += 1
                relative_path = file_path.relative_to(root_dir).as_posix()
                print(f"  Procesando: {relative_path}")

                f.write(f"{relative_path}\n\n")
                f.write("```go\n")
                try:
                    content = file_path.read_text(encoding="utf-8")
                    f.write(content.rstrip() + "\n")
                except Exception as e:
                    f.write(f"// ERROR al leer: {e}\n")
                    print(f"    ERROR: {e}")
                f.write("```\n\n")
                f.write("-" * 80 + "\n\n")

    print(f"\n{'='*60}")
    print(f"Total de archivos procesados: {files_found}")
    print(f"Archivo generado: {output_file}")
    print(f"{'='*60}")


if __name__ == "__main__":
    args = sys.argv[1:]

    if any(h in args for h in ["--help", "-h"]):
        print(__doc__)
        sys.exit(0)

    if "--all" in args or "-a" in args:
        extract_go_files()
    elif args:
        extract_go_files(specific_files=args)
    else:
        extract_go_files()