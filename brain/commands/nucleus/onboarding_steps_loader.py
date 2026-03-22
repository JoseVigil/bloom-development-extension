"""
onboarding_steps_loader.py — Bloom Conductor
v1.0.2 — Paso 1 github_auth

Carga config/onboarding_steps.json usando Paths() como única fuente de verdad
para la resolución de rutas. No resuelve paths propios.

Uso:
    from brain.commands.nucleus.onboarding_steps_loader import get_loader

    loader = get_loader()
    steps  = loader.load()
    step   = loader.get("github_auth")
    ids    = loader.step_ids()
    loader.validate_step("github_auth")  # raises ValueError si no existe
"""

import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

from brain.shared.paths import Paths

logger = logging.getLogger("brain.onboarding_steps_loader")


class OnboardingStepsLoader:
    """
    Loader para config/onboarding_steps.json.

    Delega la resolución de rutas a Paths().config_dir.
    El archivo se cachea en memoria tras la primera lectura.
    Llamar reload() para forzar nueva lectura desde disco.
    """

    FILENAME = "onboarding_steps.json"

    def __init__(self, override_path: Optional[Path] = None):
        self._override_path = override_path
        self._steps: Optional[List[Dict[str, Any]]] = None
        self._source_path: Optional[Path] = None

    # ── Public API ────────────────────────────────────────────────────────

    def load(self) -> List[Dict[str, Any]]:
        """Carga y cachea los steps. Segunda llamada retorna la cache."""
        if self._steps is None:
            self._steps = self._read()
        return self._steps

    def reload(self) -> List[Dict[str, Any]]:
        """Fuerza re-lectura desde disco."""
        self._steps = None
        return self.load()

    def get(self, step_id: str) -> Optional[Dict[str, Any]]:
        """Retorna el dict del step o None si no existe."""
        for step in self.load():
            if step.get("id") == step_id:
                return step
        return None

    def step_ids(self) -> List[str]:
        """Lista ordenada de IDs de steps."""
        return [s["id"] for s in self.load()]

    def validate_step(self, step_id: str) -> Dict[str, Any]:
        """
        Retorna el dict del step si existe.
        Raises ValueError con la lista de steps válidos si no existe.
        """
        step = self.get(step_id)
        if step is None:
            raise ValueError(
                f"Step '{step_id}' no existe en {self.FILENAME}. "
                f"Steps válidos: {self.step_ids()}"
            )
        return step

    @property
    def source_path(self) -> Optional[Path]:
        """Ruta desde donde se leyó el archivo (disponible tras load())."""
        return self._source_path

    # ── Path resolution ───────────────────────────────────────────────────

    def _resolve_path(self) -> Path:
        if self._override_path:
            return Path(self._override_path)
        return Paths().config_dir / self.FILENAME

    # ── File reading ──────────────────────────────────────────────────────

    def _read(self) -> List[Dict[str, Any]]:
        path = self._resolve_path()
        self._source_path = path

        if not path.exists():
            raise FileNotFoundError(
                f"onboarding_steps.json no encontrado en: {path}\n"
                f"Verificá que el instalador lo haya copiado."
            )

        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            raise ValueError(f"onboarding_steps.json malformado: {e}") from e

        if "steps" not in data or not isinstance(data["steps"], list) or not data["steps"]:
            raise ValueError(
                f"onboarding_steps.json: se esperaba clave 'steps' con lista no vacía. "
                f"Claves encontradas: {list(data.keys())}"
            )

        required_keys = {"id", "label", "screen", "vault_required", "produces", "storage"}
        for i, step in enumerate(data["steps"]):
            missing = required_keys - set(step.keys())
            if missing:
                raise ValueError(
                    f"step[{i}] (id={step.get('id', '?')}) le faltan claves: {missing}"
                )

        logger.info(
            f"[StepsLoader] {len(data['steps'])} steps cargados desde {path}. "
            f"IDs: {[s['id'] for s in data['steps']]}"
        )
        return data["steps"]


# ── Singleton de proceso ──────────────────────────────────────────────────────

_loader_instance: Optional[OnboardingStepsLoader] = None


def get_loader() -> OnboardingStepsLoader:
    """Singleton del loader — una sola lectura de disco por proceso."""
    global _loader_instance
    if _loader_instance is None:
        _loader_instance = OnboardingStepsLoader()
    return _loader_instance