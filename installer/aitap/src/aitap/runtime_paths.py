"""Paths de recursos que funcionan desde fuentes y desde PyInstaller."""

from __future__ import annotations

import sys
from pathlib import Path


def resource_root() -> Path:
    """Retorna la raíz que contiene contracts/, policies/ y registry/."""
    frozen_root = getattr(sys, "_MEIPASS", None)
    if frozen_root:
        return Path(frozen_root).resolve()
    return Path(__file__).resolve().parents[2]
