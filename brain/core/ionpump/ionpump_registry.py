# brain/core/ionpump/ionpump_registry.py

from pathlib import Path
from typing import Dict, Optional, List
from brain.core.ionpump.ionpump_models import IonManifest, IonRecipe


class _RegistryEntry:
    __slots__ = ("manifest", "path", "recipe")

    def __init__(self, manifest: IonManifest, path: Path) -> None:
        self.manifest: IonManifest = manifest
        self.path: Path = path
        self.recipe: Optional[IonRecipe] = None


class IonRegistry:
    """
    In-memory registry for IonPump ions.

    Invariants:
    - Every entry always has a manifest (loaded at Brain startup).
    - An entry may not have a recipe (lazy-loaded on demand).
    - The registry never writes to the filesystem.
    """

    def __init__(self) -> None:
        self._entries: Dict[str, _RegistryEntry] = {}

    # ------------------------------------------------------------------
    # Registration
    # ------------------------------------------------------------------

    def register(self, site: str, manifest: IonManifest, path: Path) -> None:
        """Register an ion by its manifest. Recipe is loaded later."""
        self._entries[site] = _RegistryEntry(manifest=manifest, path=path)

    # ------------------------------------------------------------------
    # Manifest access
    # ------------------------------------------------------------------

    def get_manifest(self, site: str) -> Optional[IonManifest]:
        """Return the manifest if registered, else None."""
        entry = self._entries.get(site)
        return entry.manifest if entry is not None else None

    # ------------------------------------------------------------------
    # Recipe access
    # ------------------------------------------------------------------

    def get_recipe(self, site: str) -> Optional[IonRecipe]:
        """Return the recipe if already loaded, else None."""
        entry = self._entries.get(site)
        if entry is None:
            return None
        return entry.recipe

    def set_recipe(self, site: str, recipe: IonRecipe) -> None:
        """Store a loaded recipe. No-op if the site is not registered."""
        entry = self._entries.get(site)
        if entry is not None:
            entry.recipe = recipe

    def invalidate(self, site: str) -> None:
        """
        Mark the recipe as not loaded (used by watchdog on hot-reload).
        The manifest is preserved; only the recipe is evicted.
        """
        entry = self._entries.get(site)
        if entry is not None:
            entry.recipe = None

    # ------------------------------------------------------------------
    # Enumeration
    # ------------------------------------------------------------------

    def list_sites(self) -> List[str]:
        """Return all registered site names."""
        return list(self._entries.keys())

    def get_path(self, site: str) -> Optional[Path]:
        """Return the filesystem path of the ion directory, if registered."""
        entry = self._entries.get(site)
        return entry.path if entry is not None else None
