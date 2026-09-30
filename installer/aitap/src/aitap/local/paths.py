"""Guard de rutas de escritura del Suministro Local (Enmienda 1, §4).

AITAP solo escribe dentro de su raiz de estado (``AITAP_STATE_DIR``): journals
del aprovisionamiento, locks y registros contables de la prueba de humo. Los
pesos los escribe el servidor de Ollama, nunca AITAP.

Toda ruta se resuelve con ``realpath`` y se rechaza si:

- la raiz no es absoluta, no existe como directorio o es la raiz del sistema;
- la raiz o alguno de sus ancestros es un workspace de proyecto (``.git`` o
  ``.bloom``): AITAP nunca toca codebases;
- el destino, una vez resueltos ``..`` y enlaces simbolicos, queda fuera de la raiz.
"""
from __future__ import annotations

import os
from pathlib import Path

PROJECT_MARKERS = (".git", ".bloom")


class PathGuardError(ValueError):
    def __init__(self, code: str, message: str):
        self.code = code
        super().__init__(message)


def _inside_project(path: Path) -> bool:
    return any((candidate / marker).exists() for candidate in (path, *path.parents) for marker in PROJECT_MARKERS)


def allowed_root(root: str | os.PathLike) -> Path:
    """Valida la raiz de estado y la devuelve resuelta."""
    raw = Path(root)
    if not raw.is_absolute():
        raise PathGuardError("STATE_DIR_INVALID", "la raiz de estado debe ser una ruta absoluta")
    resolved = Path(os.path.realpath(raw))
    if not resolved.is_dir():
        raise PathGuardError("STATE_DIR_NOT_FOUND", "la raiz de estado no existe")
    if resolved == Path(resolved.anchor):
        raise PathGuardError("STATE_DIR_INVALID", "la raiz de estado no puede ser la raiz del sistema")
    if _inside_project(resolved):
        raise PathGuardError("STATE_DIR_INVALID", "la raiz de estado no puede estar dentro de un proyecto")
    return resolved


def resolve_under(root: Path, *parts: str) -> Path:
    """Ruta de escritura dentro de ``root``; rechaza componentes y enlaces que escapan."""
    for part in parts:
        if not part or Path(part).is_absolute() or part in (".", "..") or "/" in part or "\\" in part:
            raise PathGuardError("PATH_OUTSIDE_ROOT", "componente de ruta no permitido")
    candidate = Path(os.path.realpath(Path(root).joinpath(*parts)))
    base = Path(os.path.realpath(root))
    if candidate != base and base not in candidate.parents:
        raise PathGuardError("PATH_OUTSIDE_ROOT", "la ruta resuelta queda fuera de la raiz de estado")
    return candidate
