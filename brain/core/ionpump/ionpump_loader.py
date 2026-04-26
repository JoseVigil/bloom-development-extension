# brain/core/ionpump/ionpump_loader.py

import json
import logging
from pathlib import Path
from typing import Optional

import yaml

from brain.core.ionpump.ionpump_models import (
    IonErrorHandler,
    IonFlow,
    IonManifest,
    IonRecipe,
    IonStep,
)
from brain.core.ionpump.ionpump_registry import IonRegistry

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Custom exceptions
# ---------------------------------------------------------------------------

class IonNotFoundError(Exception):
    """Raised when a requested site is not registered."""


class IonSyntaxError(Exception):
    """Raised when a .ion YAML file cannot be parsed."""


# ---------------------------------------------------------------------------
# Loader
# ---------------------------------------------------------------------------

class IonLoader:
    """
    Responsible for:
    1. Scanning ``ionsites/*/ion.manifest.json`` at startup → populates registry.
    2. Parsing ``*.ion`` files (YAML) on demand → returns IonRecipe.
    3. Watching the filesystem for changes → invalidates registry → reloads
       with validation (rollback on failure).
    """

    MANIFEST_FILENAME = "ion.manifest.json"

    def __init__(self, ionsites_path: str, registry: IonRegistry) -> None:
        self._ionsites: Path = Path(ionsites_path)
        self._registry: IonRegistry = registry
        self._observer = None  # watchdog Observer, set by start_watchdog()

    # ------------------------------------------------------------------
    # Startup scan
    # ------------------------------------------------------------------

    def discover_all(self) -> int:
        """
        Create ``ionsites/`` if it does not exist (not an error).
        Scan the directory and register all manifests found.
        Returns the number of ions registered.
        Does NOT load .ion recipe files — only manifests.
        """
        if not self._ionsites.exists():
            self._ionsites.mkdir(parents=True, exist_ok=True)
            logger.info("IonLoader: created %s (was absent)", self._ionsites)

        count = 0
        for manifest_path in self._ionsites.rglob(self.MANIFEST_FILENAME):
            try:
                manifest = self._parse_manifest(manifest_path)
                self._registry.register(
                    site=manifest.site,
                    manifest=manifest,
                    path=manifest_path.parent,
                )
                count += 1
                logger.debug("IonLoader: registered site '%s'", manifest.site)
            except Exception as exc:
                logger.warning(
                    "IonLoader: failed to parse manifest %s — %s", manifest_path, exc
                )

        return count

    # ------------------------------------------------------------------
    # On-demand recipe loading
    # ------------------------------------------------------------------

    def load_recipe(self, site: str) -> IonRecipe:
        """
        Load the .ion file for a site.
        Uses the registry cache if the recipe is already loaded.
        Raises IonNotFoundError if the site is not registered.
        Raises IonSyntaxError if the YAML is invalid.
        """
        manifest = self._registry.get_manifest(site)
        if manifest is None:
            raise IonNotFoundError(f"Site '{site}' is not registered in IonRegistry.")

        cached = self._registry.get_recipe(site)
        if cached is not None:
            return cached

        ion_dir = self._registry.get_path(site)
        if ion_dir is None:
            raise IonNotFoundError(f"No path found for site '{site}'.")

        # Find the .ion file in the site directory
        ion_files = list(ion_dir.glob("*.ion"))
        if not ion_files:
            raise IonNotFoundError(f"No .ion file found in {ion_dir}.")

        ion_path = ion_files[0]
        recipe = self._parse_ion_file(ion_path)
        self._registry.set_recipe(site, recipe)
        return recipe

    # ------------------------------------------------------------------
    # Watchdog
    # ------------------------------------------------------------------

    def start_watchdog(self) -> None:
        """
        Start a filesystem watcher on ``ionsites/``.
        On detecting changes in ``*.ion`` or ``ion.manifest.json``:
          1. Validate the new file.
          2. If valid: invalidate registry and reload.
          3. If invalid: keep previous version, log error.

        Logs a warning if the ``watchdog`` package is unavailable.
        """
        try:
            from watchdog.observers import Observer  # type: ignore
            from watchdog.events import FileSystemEventHandler  # type: ignore
        except ImportError:
            logger.warning(
                "IonLoader: 'watchdog' package not installed — "
                "hot-reload disabled. Add 'watchdog' to requirements.txt."
            )
            return

        loader = self

        class _IonEventHandler(FileSystemEventHandler):
            def on_modified(self, event):
                if event.is_directory:
                    return
                loader._on_file_changed(Path(event.src_path))

            def on_created(self, event):
                if event.is_directory:
                    return
                loader._on_file_changed(Path(event.src_path))

        self._observer = Observer()
        self._observer.schedule(
            _IonEventHandler(), str(self._ionsites), recursive=True
        )
        self._observer.daemon = True
        self._observer.start()
        logger.info("IonLoader: watchdog started on %s", self._ionsites)

    def stop_watchdog(self) -> None:
        """Stop the filesystem watcher."""
        if self._observer is not None:
            self._observer.stop()
            self._observer.join(timeout=5)
            self._observer = None
            logger.info("IonLoader: watchdog stopped")

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _on_file_changed(self, path: Path) -> None:
        """Called by the watchdog event handler on any relevant file change."""
        name = path.name
        if name != self.MANIFEST_FILENAME and not name.endswith(".ion"):
            return

        logger.debug("IonLoader: detected change in %s", path)

        # Determine the site from the parent directory's manifest
        ion_dir = path.parent
        manifest_path = ion_dir / self.MANIFEST_FILENAME

        if name == self.MANIFEST_FILENAME:
            # Manifest changed — re-register if valid
            if not manifest_path.exists():
                return
            try:
                manifest = self._parse_manifest(manifest_path)
                self._registry.register(manifest.site, manifest, ion_dir)
                self._registry.invalidate(manifest.site)
                logger.info(
                    "IonLoader: hot-reloaded manifest for site '%s'", manifest.site
                )
            except Exception as exc:
                logger.error(
                    "IonLoader: invalid manifest %s — keeping previous version. Error: %s",
                    manifest_path,
                    exc,
                )
        else:
            # .ion recipe changed — validate then reload
            if not manifest_path.exists():
                logger.warning(
                    "IonLoader: .ion change detected in %s but no manifest found — skipping",
                    ion_dir,
                )
                return

            # Import here to avoid circular at module level
            from brain.core.ionpump.ionpump_validator import IonValidator

            validator = IonValidator()
            result = validator.validate_file(path)
            if not result.valid:
                logger.error(
                    "IonLoader: validation failed for %s — keeping previous version. Errors: %s",
                    path,
                    result.errors,
                )
                return

            try:
                manifest = self._parse_manifest(manifest_path)
                site = manifest.site
                self._registry.invalidate(site)
                # Eagerly reload so next request gets fresh data
                self.load_recipe(site)
                logger.info("IonLoader: hot-reloaded recipe for site '%s'", site)
            except Exception as exc:
                logger.error(
                    "IonLoader: failed to reload recipe from %s — keeping previous version. Error: %s",
                    path,
                    exc,
                )

    def _parse_manifest(self, path: Path) -> IonManifest:
        with path.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
        return IonManifest(
            site=data["site"],
            version=data["version"],
            description=data.get("description", ""),
            entrypoint=data["entrypoint"],
            flows=data.get("flows", []),
            triggers=data.get("triggers", {}),
            capabilities=data.get("capabilities", []),
            requires_cortex_version=data.get("requires_cortex_version", ">=1.0.0"),
        )

    def _parse_ion_file(self, path: Path) -> IonRecipe:
        try:
            with path.open("r", encoding="utf-8") as fh:
                data = yaml.safe_load(fh)
        except yaml.YAMLError as exc:
            raise IonSyntaxError(f"YAML parse error in {path}: {exc}") from exc

        if not isinstance(data, dict):
            raise IonSyntaxError(f"Invalid .ion structure in {path}: root must be a mapping.")

        flows: dict[str, IonFlow] = {}
        for flow_name, flow_data in data.get("flows", {}).items():
            steps = [
                IonStep(action=s["action"], params={k: v for k, v in s.items() if k != "action"})
                for s in flow_data.get("steps", [])
            ]
            flows[flow_name] = IonFlow(
                name=flow_name,
                description=flow_data.get("description", ""),
                steps=steps,
                requires=flow_data.get("requires", []),
            )

        error_handlers: dict[str, IonErrorHandler] = {}
        for trigger, handler_data in data.get("error_handlers", {}).items():
            error_handlers[trigger] = IonErrorHandler(
                trigger=trigger,
                retry=handler_data.get("retry", 0),
                fallback=handler_data.get("fallback", "emit_error"),
            )

        return IonRecipe(
            version=data.get("version", ""),
            site=data.get("site", ""),
            description=data.get("description", ""),
            entrypoints=data.get("entrypoints", {}),
            variables=data.get("variables", {}),
            flows=flows,
            error_handlers=error_handlers,
        )
