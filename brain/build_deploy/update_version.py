#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
update_version.py

Actualiza la versión en pyproject.toml y changelog si existe
una solicitud en version_request.json generada por brain.exe

Soporta acumulación de múltiples solicitudes para la misma versión.
"""

import json
import os
import sys
import subprocess
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


def merge_changelogs(existing: dict, new: dict) -> dict:
    """
    Merge existing changelog with new changelog from pyproject.toml.
    
    Args:
        existing: Existing changelog from version_request.json
        new: New changelog from pyproject.toml [tool.brain.changelog]
        
    Returns:
        Merged changelog dictionary
    """
    merged = {
        "added": existing.get("added", []) + new.get("added", []),
        "changed": existing.get("changed", []) + new.get("changed", []),
        "details": existing.get("details", []) + new.get("details", [])
    }
    return merged


def extract_existing_changelog(pyproject_path: Path) -> dict:
    """
    Extract existing changelog from pyproject.toml if it exists.
    
    Args:
        pyproject_path: Path to pyproject.toml
        
    Returns:
        Dictionary with 'added', 'changed', 'details' lists
    """
    try:
        with pyproject_path.open("rb") as f:
            data = tomllib.load(f)
        
        if "tool" in data and "brain" in data["tool"] and "changelog" in data["tool"]["brain"]:
            changelog = data["tool"]["brain"]["changelog"]
            return {
                "added": changelog.get("added", []),
                "changed": changelog.get("changed", []),
                "details": changelog.get("details", [])
            }
    except Exception as e:
        print(f"⚠️ No se pudo extraer changelog existente: {e}")
    
    return {"added": [], "changed": [], "details": []}


def update_pyproject_version(pyproject_path: Path, new_version: str, changelog: dict, version_number: int) -> None:
    """
    Actualiza el campo [project].version y [tool.brain.changelog] en pyproject.toml
    
    Args:
        pyproject_path: Ruta al archivo pyproject.toml
        new_version: Nueva versión (e.g., "0.1.2")
        changelog: Diccionario con claves 'added', 'changed', 'details'
        version_number: Número de versión incremental
    """
    with pyproject_path.open("rb") as f:
        data = tomllib.load(f)

    if "project" not in data:
        raise RuntimeError("pyproject.toml no contiene [project]")

    old_version = data["project"].get("version")
    
    # Extract existing changelog from pyproject.toml
    existing_changelog = extract_existing_changelog(pyproject_path)
    
    # Merge changelogs if there's existing content
    if any(existing_changelog.values()):
        print("📄 Detectado changelog existente, fusionando...")
        changelog = merge_changelogs(existing_changelog, changelog)
    
    # Actualizar versión
    data["project"]["version"] = new_version

    # Actualizar o crear sección de changelog
    if "tool" not in data:
        data["tool"] = {}
    if "brain" not in data["tool"]:
        data["tool"]["brain"] = {}
    
    data["tool"]["brain"]["changelog"] = {
        "version_number": version_number,
        "added": changelog.get("added", []),
        "changed": changelog.get("changed", []),
        "details": changelog.get("details", [])
    }

    # Escribir TOML actualizado
    with pyproject_path.open("wb") as f:
        tomli_w.dump(data, f)

    print(f"📦 Versión actualizada: {old_version} → {new_version}")
    print(f"🔢 Version number: {version_number}")
    
    # Show merge info if applicable
    update_count = len(changelog.get("added", [])) + len(changelog.get("changed", [])) + len(changelog.get("details", []))
    if update_count > 0:
        print(f"📝 Total de entradas en changelog: {update_count}")


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

    print(f"🗂️ Versión #{entry.get('version_number', '?')} registrada en {history_path.name}")


def print_changelog_summary(changelog: dict, update_count: int = 1):
    """
    Imprime un resumen del changelog
    
    Args:
        changelog: Diccionario con 'added', 'changed', 'details'
        update_count: Número de actualizaciones acumuladas
    """
    print("\n" + "=" * 70)
    print("📋 CHANGELOG")
    if update_count > 1:
        print(f"   ({update_count} actualizaciones acumuladas)")
    print("=" * 70)
    
    added = changelog.get("added", [])
    changed = changelog.get("changed", [])
    details = changelog.get("details", [])
    
    if added:
        print(f"\n✨ ADDED ({len(added)}):")
        for item in added:
            print(f"   • {item}")
    
    if changed:
        print(f"\n🔄 CHANGED ({len(changed)}):")
        for item in changed:
            print(f"   • {item}")
    
    if details:
        print(f"\n📋 DETAILS ({len(details)}):")
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
    update_count = request.get("update_count", 1)
    version_number = request.get("version_number", 1)

    if not new_version:
        print("[ERROR] version_request.json no contiene 'new_version'")
        sys.exit(1)

    if update_count > 1:
        print(f"📦 Procesando {update_count} actualizaciones acumuladas")

    # Actualizar pyproject.toml
    update_pyproject_version(pyproject_path, new_version, changelog, version_number)

    # Registrar en historial
    append_version_history({
        "from": request.get("current_version"),
        "to": new_version,
        "version_number": version_number,
        "changelog": changelog,
        "timestamp": request.get("timestamp"),
        "last_updated": request.get("last_updated"),
        "requested_by": request.get("requested_by"),
        "update_count": update_count
    })

    # Mostrar resumen del changelog
    print_changelog_summary(changelog, update_count)

    # Ejecutar generate_commit.py ANTES de borrar version_request.json
    print("\n🔧 Generando commit de Git...")
    try:
        # Importar el módulo directamente (mismo directorio)
        import generate_commit
        
        # Ejecutar la función main del módulo pasando la ruta del request
        generate_commit.main(str(request_path))
        
        print("✅ Commit generado exitosamente")
        
    except ImportError as e:
        print(f"⚠️ No se pudo importar generate_commit: {e}")
    except Exception as e:
        print(f"⚠️ Error al generar commit: {e}")

    # Consumir la solicitud DESPUÉS de generar el commit
    request_path.unlink(missing_ok=True)

    print("\n✅ Solicitud de versión aplicada y eliminada")
    if update_count > 1:
        print(f"   Se fusionaron {update_count} actualizaciones en una sola versión\n")
    else:
        print()


if __name__ == "__main__":
    main()