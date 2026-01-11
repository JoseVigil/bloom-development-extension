#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
update_version.py

Actualiza la versión en brain/pyproject.toml si existe
una solicitud en version_request.json generada por brain.exe
"""

import json
import os
import sys
from pathlib import Path
import tomllib          # leer TOML (ok)
import tomli_w          # escribir TOML (NO está instalado)

try:
    import tomllib  # Python 3.11+
except ImportError:
    import tomli as tomllib  # Python <3.11

try:
    import tomli_w
except ImportError:
    print("[ERROR] Falta dependencia: tomli-w")
    sys.exit(1)


def get_version_request_path() -> Path:
    """
    Devuelve la ruta donde brain.exe deja version_request.json
    """
    if sys.platform == "win32":
        local_appdata = os.environ.get("LOCALAPPDATA")
        if not local_appdata:
            raise RuntimeError("LOCALAPPDATA no definido")
        return Path(local_appdata) / "BloomNucleus" / "bin" / "version_request.json"

    # macOS / Linux (preparado)
    return Path.home() / ".bloomnucleus" / "bin" / "version_request.json"


def update_pyproject_version(pyproject_path: Path, new_version: str) -> None:
    """
    Actualiza el campo [project].version en pyproject.toml
    """
    with pyproject_path.open("rb") as f:
        data = tomllib.load(f)

    if "project" not in data:
        raise RuntimeError("pyproject.toml no contiene [project]")

    old_version = data["project"].get("version")
    data["project"]["version"] = new_version

    with pyproject_path.open("wb") as f:
        tomli_w.dump(data, f)

    print(f"🔁 Versión actualizada: {old_version} → {new_version}")

def append_version_history(entry: dict) -> None:
    history_path = Path(__file__).parent / "versions.json"

    if history_path.exists():
        data = json.loads(history_path.read_text(encoding="utf-8"))
    else:
        data = {
            "project": "brain-cli",
            "history": []
        }

    data.setdefault("history", []).append(entry)

    history_path.write_text(
        json.dumps(data, indent=4, ensure_ascii=False),
        encoding="utf-8"
    )

    print(f"🗂 Versión registrada en {history_path.name}")

def main():
    project_root = Path(__file__).resolve().parents[1]
    pyproject_path = project_root / "pyproject.toml"

    if not pyproject_path.exists():
        print(f"[ERROR] No se encontró {pyproject_path}")
        sys.exit(1)

    request_path = get_version_request_path()

    if not request_path.exists():
        print("ℹ️ No hay solicitud de versión pendiente")
        return

    print(f"📄 Procesando solicitud: {request_path}")

    with request_path.open("r", encoding="utf-8") as f:
        request = json.load(f)

    new_version = request.get("new_version")
    description = request.get("description")

    if not new_version:
        print("[ERROR] version_request.json no contiene 'new_version'")
        sys.exit(1)

    update_pyproject_version(pyproject_path, new_version)

    append_version_history({
        "from": request.get("current_version"),
        "to": new_version,
        "description": request.get("description"),
        "timestamp": request.get("timestamp"),
        "requested_by": request.get("requested_by")
    })

    # Consumir la solicitud
    request_path.unlink(missing_ok=True)

    print("✅ Solicitud de versión aplicada y eliminada")
    if description:
        print(f"📝 Descripción: {description}")        

if __name__ == "__main__":
    main()
