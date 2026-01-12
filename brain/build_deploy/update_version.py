#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
update_version.py - Versión mejorada 2026

- Logging completo a consola y archivo
- Búsqueda robusta del directorio raíz del proyecto (pyproject.toml)
- Manejo de errores más claro y seguro
- No elimina version_request.json si falla la generación del commit
- Paths más flexibles y logs detallados para depuración
- Soporte para ejecución desde cualquier ubicación (instalación o fuente)
"""

import json
import os
import sys
import logging
from pathlib import Path
import re
from datetime import datetime

try:
    import tomllib  # Python 3.11+
except ImportError:
    import tomli as tomllib

try:
    import tomli_w
except ImportError:
    print("[ERROR] Falta dependencia: tomli-w")
    print("Instalar con: pip install tomli-w")
    sys.exit(1)

# ─── Configuración de Logging ───────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.FileHandler("update_version.log", encoding="utf-8"),
        logging.StreamHandler(sys.stdout)
    ]
)

logger = logging.getLogger(__name__)


def find_project_root(start_path: Path) -> Path:
    """
    Busca hacia arriba hasta encontrar pyproject.toml
    """
    current = start_path.resolve()
    max_levels = 12  # seguridad

    while current != current.root and max_levels > 0:
        if (current / "pyproject.toml").is_file():
            logger.info(f"Proyecto encontrado en: {current}")
            return current
        current = current.parent
        max_levels -= 1

    raise RuntimeError(
        "No se encontró pyproject.toml en la jerarquía de directorios.\n"
        "Ejecuta este script desde (o cerca de) la raíz del proyecto."
    )


def get_version_request_path() -> Path:
    """Ruta donde brain.exe deja la solicitud de versión"""
    if sys.platform == "win32":
        local_appdata = os.environ.get("LOCALAPPDATA")
        if not local_appdata:
            raise RuntimeError("LOCALAPPDATA no está definido")
        path = Path(local_appdata) / "BloomNucleus" / "bin" / "version_request.json"
    else:
        path = Path.home() / ".bloomnucleus" / "bin" / "version_request.json"

    logger.info(f"Buscando version_request.json en: {path}")
    return path


def merge_changelogs(existing: dict, new: dict) -> dict:
    """Combina changelogs preservando el orden"""
    return {
        "added": existing.get("added", []) + new.get("added", []),
        "changed": existing.get("changed", []) + new.get("changed", []),
        "details": existing.get("details", []) + new.get("details", [])
    }


def extract_existing_changelog(pyproject_path: Path) -> dict:
    try:
        with pyproject_path.open("rb") as f:
            data = tomllib.load(f)

        tool_brain = data.get("tool", {}).get("brain", {})
        changelog = tool_brain.get("changelog", {})

        return {
            "added": changelog.get("added", []),
            "changed": changelog.get("changed", []),
            "details": changelog.get("details", [])
        }
    except Exception as e:
        logger.warning(f"No se pudo leer changelog existente: {e}")
        return {"added": [], "changed": [], "details": []}


def update_pyproject_version(pyproject_path: Path, new_version: str, changelog: dict, version_number: int):
    with pyproject_path.open("rb") as f:
        data = tomllib.load(f)

    if "project" not in data:
        raise RuntimeError("pyproject.toml no contiene sección [project]")

    old_version = data["project"].get("version", "unknown")

    # Merge con changelog existente si lo hay
    existing = extract_existing_changelog(pyproject_path)
    if any(existing.values()):
        logger.info("Changelog existente detectado → fusionando...")
        changelog = merge_changelogs(existing, changelog)

    # Actualizar versión
    data["project"]["version"] = new_version

    # Preparar sección tool.brain.changelog
    if "tool" not in data:
        data["tool"] = {}
    if "brain" not in data["tool"]:
        data["tool"]["brain"] = {}

    data["tool"]["brain"]["changelog"] = {
        "version_number": version_number,
        "added": changelog.get("added", []),
        "changed": changelog.get("changed", []),
        "details": changelog.get("details", []),
        "updated_at": datetime.utcnow().isoformat()
    }

    # Guardar
    with pyproject_path.open("wb") as f:
        tomli_w.dump(data, f)

    logger.info(f"Versión actualizada: {old_version} → {new_version}")
    logger.info(f"Version number: #{version_number}")
    total_entries = sum(len(v) for v in changelog.values())
    if total_entries > 0:
        logger.info(f"Total entradas en changelog: {total_entries}")


def append_version_history(project_root: Path, entry: dict):
    history_path = project_root / "versions.json"

    if history_path.exists():
        with history_path.open(encoding="utf-8") as f:
            data = json.load(f)
    else:
        data = {
            "project": "brain-cli",
            "history": []
        }

    data.setdefault("history", []).append(entry)

    with history_path.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=4, ensure_ascii=False)

    logger.info(f"Versión #{entry.get('version_number', '?')} registrada en versions.json")


def print_changelog_summary(changelog: dict, update_count: int = 1):
    print("\n" + "═" * 70)
    print("CHANGELOG" + (f"  ({update_count} actualizaciones acumuladas)" if update_count > 1 else ""))
    print("═" * 70)

    for section, emoji in [("added", "✨"), ("changed", "🔄"), ("details", "📋")]:
        items = changelog.get(section, [])
        if items:
            print(f"\n{emoji} {section.upper()} ({len(items)}):")
            for item in items:
                print(f"   • {item}")

    print("\n" + "═" * 70)


def main():
    logger.info("=== Iniciando update_version.py ===")

    # 1. Encontrar raíz del proyecto
    try:
        project_root = find_project_root(Path(__file__).parent)
        pyproject_path = project_root / "pyproject.toml"
    except RuntimeError as e:
        logger.error(str(e))
        sys.exit(1)

    # 2. Buscar solicitud
    request_path = get_version_request_path()

    if not request_path.exists():
        logger.info("No hay solicitud de versión pendiente")
        return

    logger.info(f"Procesando solicitud: {request_path}")

    # 3. Leer JSON
    try:
        with request_path.open("r", encoding="utf-8") as f:
            request = json.load(f)
    except Exception as e:
        logger.error(f"Error al leer version_request.json: {e}")
        sys.exit(1)

    new_version = request.get("new_version")
    if not new_version:
        logger.error("version_request.json no contiene 'new_version'")
        sys.exit(1)

    changelog = request.get("changelog", {})
    update_count = request.get("update_count", 1)
    version_number = request.get("version_number", 1)

    if update_count > 1:
        logger.info(f"Procesando {update_count} actualizaciones acumuladas")

    # 4. Actualizar pyproject.toml
    try:
        update_pyproject_version(pyproject_path, new_version, changelog, version_number)
    except Exception as e:
        logger.error(f"Error al actualizar pyproject.toml: {e}")
        sys.exit(1)

    # 5. Registrar en historial
    append_version_history(project_root, {
        "from": request.get("current_version", "unknown"),
        "to": new_version,
        "version_number": version_number,
        "changelog": changelog,
        "timestamp": request.get("timestamp"),
        "last_updated": request.get("last_updated"),
        "requested_by": request.get("requested_by", "unknown"),
        "update_count": update_count,
        "processed_at": datetime.utcnow().isoformat()
    })

    # 6. Mostrar resumen
    print_changelog_summary(changelog, update_count)

    # 7. Generar commit message
    commit_success = False
    try:
        logger.info("Intentando generar archivo de commit...")
        # Intentamos importar relativo al directorio del script
        sys.path.insert(0, str(Path(__file__).parent))
        import generate_commit
        generate_commit.main(str(request_path))
        commit_success = True
        logger.info("Archivo de commit generado exitosamente")
    except ImportError as e:
        logger.error(f"No se pudo importar generate_commit.py: {e}")
        logger.warning("Asegúrate de que generate_commit.py esté en el mismo directorio o en PYTHONPATH")
    except Exception as e:
        logger.error(f"Error al generar commit: {e}")

    # 8. Solo eliminamos la solicitud si todo salió bien
    if commit_success:
        try:
            request_path.unlink()
            logger.info("Solicitud de versión eliminada correctamente")
        except Exception as e:
            logger.warning(f"No se pudo eliminar version_request.json: {e}")
    else:
        logger.warning("No se eliminó version_request.json porque falló la generación del commit")

    logger.info("=== Fin de update_version.py ===\n")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        logger.info("Ejecución interrumpida por el usuario")
        sys.exit(130)
    except Exception as e:
        logger.critical(f"Error crítico inesperado: {e}", exc_info=True)
        sys.exit(1)