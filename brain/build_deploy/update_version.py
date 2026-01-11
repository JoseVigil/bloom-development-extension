#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
update_version.py

Actualiza la versión en pyproject.toml y changelog si existe
una solicitud en version_request.json generada por brain.exe
"""

import json
import os
import sys
from pathlib import Path
import re

try:
    import tomllib  # Python 3.11+
except ImportError:
    import tomli as tomllib  # Python <3.11

try:
    import tomli_w
except ImportError:
    print("[ERROR] Falta dependencia: tomli-w")
    print("Instalar con: pip install tomli-w")
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

    # macOS / Linux
    return Path.home() / ".bloomnucleus" / "bin" / "version_request.json"


def update_pyproject_version(pyproject_path: Path, new_version: str, changelog: dict) -> None:
    """
    Actualiza el campo [project].version y [tool.brain.changelog] en pyproject.toml
    
    Args:
        pyproject_path: Ruta al archivo pyproject.toml
        new_version: Nueva versión (e.g., "0.1.2")
        changelog: Diccionario con claves 'added', 'changed', 'details'
    """
    with pyproject_path.open("rb") as f:
        data = tomllib.load(f)

    if "project" not in data:
        raise RuntimeError("pyproject.toml no contiene [project]")

    old_version = data["project"].get("version")
    
    # Actualizar versión
    data["project"]["version"] = new_version

    # Actualizar o crear sección de changelog
    if "tool" not in data:
        data["tool"] = {}
    if "brain" not in data["tool"]:
        data["tool"]["brain"] = {}
    
    data["tool"]["brain"]["changelog"] = {
        "added": changelog.get("added", []),
        "changed": changelog.get("changed", []),
        "details": changelog.get("details", [])
    }

    # Escribir TOML actualizado
    with pyproject_path.open("wb") as f:
        tomli_w.dump(data, f)

    print(f"📦 Versión actualizada: {old_version} → {new_version}")


def append_version_history(entry: dict) -> None:
    """
    Agrega una entrada al historial de versiones en versions.json
    
    Args:
        entry: Diccionario con información de la versión
    """
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

    print(f"🗂️ Versión registrada en {history_path.name}")


def print_changelog_summary(changelog: dict):
    """
    Imprime un resumen del changelog
    
    Args:
        changelog: Diccionario con 'added', 'changed', 'details'
    """
    print("\n" + "=" * 70)
    print("📝 CHANGELOG")
    print("=" * 70)
    
    added = changelog.get("added", [])
    changed = changelog.get("changed", [])
    details = changelog.get("details", [])
    
    if added:
        print("\n✨ ADDED:")
        for item in added:
            print(f"   • {item}")
    
    if changed:
        print("\n🔄 CHANGED:")
        for item in changed:
            print(f"   • {item}")
    
    if details:
        print("\n📋 DETAILS:")
        for item in details:
            print(f"   • {item}")
    
    print("\n" + "=" * 70)


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
    changelog = request.get("changelog", {})

    if not new_version:
        print("[ERROR] version_request.json no contiene 'new_version'")
        sys.exit(1)

    # Actualizar pyproject.toml
    update_pyproject_version(pyproject_path, new_version, changelog)

    # Registrar en historial
    append_version_history({
        "from": request.get("current_version"),
        "to": new_version,
        "changelog": changelog,
        "timestamp": request.get("timestamp"),
        "requested_by": request.get("requested_by")
    })

    # Mostrar resumen del changelog
    print_changelog_summary(changelog)

    # Consumir la solicitud
    request_path.unlink(missing_ok=True)

    print("\n✅ Solicitud de versión aplicada y eliminada\n")


if __name__ == "__main__":
    main()