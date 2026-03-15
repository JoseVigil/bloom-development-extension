"""
version-bootstrap.py — incrementa el build_number de bootstrap.

El build number vive en installer/bootstrap/VERSION (un numero entero por linea).
El meta vive en installer/bootstrap/bootstrap.meta.json.

Uso:
  python version-bootstrap.py
  python version-bootstrap.py --set-version 1.2.0
  python version-bootstrap.py --dry-run
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

META_PATH    = Path(__file__).parent / "bootstrap.meta.json"
VERSION_PATH = Path(__file__).parent / "VERSION"


def read_build_number() -> int:
    if not VERSION_PATH.exists():
        return 0
    try:
        return int(VERSION_PATH.read_text(encoding="utf-8").strip())
    except ValueError:
        return 0


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--set-version", metavar="X.Y.Z", default=None)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not META_PATH.exists():
        print(json.dumps({"success": False, "error": f"bootstrap.meta.json no encontrado en {META_PATH}"}))
        sys.exit(1)

    with META_PATH.open("r", encoding="utf-8") as f:
        meta = json.load(f)

    prev_build   = read_build_number()
    new_build    = prev_build + 1
    new_date     = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    meta["build_number"] = new_build
    meta["build_date"]   = new_date

    if args.set_version:
        meta["version"] = args.set_version

    if not args.dry_run:
        # Incrementar VERSION
        VERSION_PATH.write_text(str(new_build) + "\n", encoding="utf-8")
        # Actualizar meta
        with META_PATH.open("w", encoding="utf-8") as f:
            json.dump(meta, f, indent=2, ensure_ascii=False)
            f.write("\n")

    print(json.dumps({
        "success":      True,
        "version":      meta["version"],
        "build_number": new_build,
        "build_date":   new_date,
        "info":         meta.get("info", ""),
        "dry_run":      args.dry_run,
    }, indent=2))


if __name__ == "__main__":
    main()