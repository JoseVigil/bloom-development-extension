# brain/core/ionpump/ionpump_loader.py
#
# Carga de paquetes Ion v2.0 (actions/ + pages/ + shared/ + domain.manifest.json).
#
# CHANGELOG respecto a v4:
#   - MANIFEST_FILENAME corregido: "ion.manifest.json" → "domain.manifest.json"
#   - load_recipe() reemplazado por load_site() que carga subdirectorios completos.
#   - _parse_manifest() actualizado para el nuevo IonManifest.
#   - _parse_page_descriptor() nuevo — parsea *.page.ion.
#   - _load_action() y _load_shared() nuevos — lazy loading.
#   - _parse_ion_file() reescrito para el nuevo formato por-archivo (action/fragment).
#   - discover_all(): ignora directorios con prefijo "_", crea ionsites/ si no existe.
#   - Validaciones alineadas con Metamorph Go: schema_version, version, entry_actions.

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Dict, Optional

import yaml

from brain.core.ionpump.ionpump_models import (
    IonAction,
    IonElement,
    IonErrorHandler,
    IonManifest,
    IonPageDescriptor,
    IonRecipe,
    IonRecipeStatus,
    IonSignal,
    IonSitePackage,
    IonStep,
)
from brain.core.ionpump.ionpump_registry import IonRegistry

logger = logging.getLogger(__name__)

# Límite de seguridad del manifest — alineado con ionManifestMaxSize de Metamorph Go
_MANIFEST_MAX_BYTES = 64 * 1024  # 64 KB
_SUPPORTED_SCHEMA   = "2.0"


# ---------------------------------------------------------------------------
# Custom exceptions
# ---------------------------------------------------------------------------

class IonLoadError(Exception):
    """
    Raised when a site cannot be loaded.
    Carries the IonRecipeStatus for upstream reporting.
    """
    def __init__(self, domain: str, status: str, detail: str = "") -> None:
        self.domain = domain
        self.status = status
        self.detail = detail
        super().__init__(f"[{domain}] {status}: {detail}" if detail else f"[{domain}] {status}")


class IonNotFoundError(Exception):
    """Raised when a requested site is not registered."""


class IonActionNotFound(Exception):
    def __init__(self, domain: str, action_name: str) -> None:
        super().__init__(f"Action '{action_name}' not declared in manifest for '{domain}'.")


class IonFragmentNotFound(Exception):
    def __init__(self, domain: str, fragment_name: str) -> None:
        super().__init__(f"Fragment '{fragment_name}' not declared in manifest for '{domain}'.")


class IonSyntaxError(Exception):
    """Raised when a .ion YAML file cannot be parsed."""


# ---------------------------------------------------------------------------
# Loader
# ---------------------------------------------------------------------------

class IonLoader:
    """
    Responsable de:
    1. Escanear ionsites/*/ al startup → popula el registry.
    2. Cargar paquetes Ion completos desde subdirectorios.
    3. Parsear *.page.ion (eager) y *.ion de actions/shared (lazy).
    4. Manejar hot-reload con validación y rollback.
    """

    MANIFEST_FILENAME = "domain.manifest.json"  # corregido de "ion.manifest.json"

    def __init__(self, ionsites_path: str, registry: IonRegistry) -> None:
        self._ionsites: Path = Path(ionsites_path)
        self._registry: IonRegistry = registry
        self._observer = None  # watchdog Observer, set by start_watchdog()

    # ------------------------------------------------------------------
    # Startup scan
    # ------------------------------------------------------------------

    def discover_all(self) -> int:
        """
        Crea ionsites/ si no existe (no es un error).
        Ignora directorios con prefijo "_" (igual que Metamorph Go).
        Registra todos los paquetes encontrados.
        Retorna el número de sites registrados exitosamente.
        """
        if not self._ionsites.exists():
            self._ionsites.mkdir(parents=True, exist_ok=True)
            logger.info("IonLoader: created %s (was absent)", self._ionsites)

        count = 0
        for site_dir in sorted(self._ionsites.iterdir()):
            # Ignorar directorios con prefijo "_" (_backup, _meta, _staging)
            if not site_dir.is_dir() or site_dir.name.startswith("_"):
                continue

            manifest_path = site_dir / self.MANIFEST_FILENAME
            if not manifest_path.exists():
                logger.warning(
                    "IonLoader: no %s in %s — skipping",
                    self.MANIFEST_FILENAME, site_dir,
                )
                continue

            try:
                package = self.load_site(site_dir)
                self._registry.register_package(site=package.manifest.domain, package=package)
                count += 1
                logger.debug(
                    "IonLoader: registered '%s' v%s (%d pages, %d actions)",
                    package.manifest.domain,
                    package.manifest.version,
                    len(package.pages),
                    len(package.manifest.actions),
                )
            except IonLoadError as exc:
                logger.warning(
                    "IonLoader: failed to load site '%s' — status=%s detail=%s",
                    site_dir.name, exc.status, exc.detail,
                )
            except Exception as exc:
                logger.warning(
                    "IonLoader: unexpected error loading '%s' — %s",
                    site_dir.name, exc,
                )

        logger.info("IonLoader: discover_all complete — %d sites registered", count)
        return count

    # ------------------------------------------------------------------
    # Site loading (replaces load_recipe)
    # ------------------------------------------------------------------

    def load_site(self, site_dir: Path) -> IonSitePackage:
        """
        Carga un paquete Ion completo desde su directorio.
        Reemplaza load_recipe() del v4.

        Validaciones (alineadas con Metamorph Go):
          - domain.manifest.json no existe → MISSING_MANIFEST
          - JSON inválido o version == "" → INVALID_MANIFEST
          - schema_version != "2.0" → INVALID_MANIFEST
          - entry_action no en actions o archivo no existe → MISSING_ENTRYPOINT

        Pages son eager-loaded.
        Actions y shared son lazy (paths guardados en manifest).
        """
        domain = site_dir.name

        # 1. Verificar y leer domain.manifest.json
        manifest_path = site_dir / self.MANIFEST_FILENAME
        if not manifest_path.exists():
            raise IonLoadError(domain, IonRecipeStatus.MISSING_MANIFEST)

        # Límite de 64 KB alineado con Metamorph Go
        if manifest_path.stat().st_size > _MANIFEST_MAX_BYTES:
            raise IonLoadError(
                domain, IonRecipeStatus.INVALID_MANIFEST,
                f"manifest exceeds {_MANIFEST_MAX_BYTES} bytes"
            )

        manifest = self._parse_manifest(manifest_path, domain)

        # 2. Validar schema_version
        if manifest.schema_version != _SUPPORTED_SCHEMA:
            raise IonLoadError(
                domain, IonRecipeStatus.INVALID_MANIFEST,
                f"schema_version '{manifest.schema_version}' not supported (need '{_SUPPORTED_SCHEMA}')"
            )

        # 3. Validar version no vacía
        if not manifest.version:
            raise IonLoadError(domain, IonRecipeStatus.INVALID_MANIFEST, "version is empty")

        # 4. Cargar pages (eager — base para resolver element names en ejecución)
        pages: Dict[str, IonPageDescriptor] = {}
        for page_name, page_rel_path in manifest.pages.items():
            full_path = site_dir / page_rel_path
            try:
                pages[page_name] = self._parse_page_descriptor(full_path)
            except Exception as exc:
                logger.warning(
                    "IonLoader: failed to parse page '%s' from %s — %s",
                    page_name, full_path, exc,
                )
                # Página con error no bloquea la carga del site

        # 5. Verificar entry_actions (igual que Metamorph Go)
        for entry_name in manifest.entry_actions:
            if entry_name not in manifest.actions:
                raise IonLoadError(
                    domain, IonRecipeStatus.MISSING_ENTRYPOINT,
                    f"entry_action '{entry_name}' not declared in actions"
                )
            action_path = site_dir / manifest.actions[entry_name].file
            if not action_path.exists():
                raise IonLoadError(
                    domain, IonRecipeStatus.MISSING_ENTRYPOINT,
                    f"action file missing: {action_path}"
                )

        return IonSitePackage(
            manifest=manifest,
            root_path=site_dir,
            actions={},     # lazy — poblado por _load_action()
            pages=pages,    # eager-loaded
            shared={},      # lazy — poblado por _load_shared()
        )

    # ------------------------------------------------------------------
    # Lazy loaders para actions y shared
    # ------------------------------------------------------------------

    def _load_action(self, package: IonSitePackage, action_name: str) -> IonRecipe:
        """Lazy-load de un action específico. Cachea en package.actions."""
        if action_name in package.actions:
            return package.actions[action_name]

        action_meta = package.manifest.actions.get(action_name)
        if not action_meta:
            raise IonActionNotFound(package.manifest.domain, action_name)

        recipe = self._parse_ion_file(package.root_path / action_meta.file)
        package.actions[action_name] = recipe
        return recipe

    def _load_shared(self, package: IonSitePackage, fragment_name: str) -> IonRecipe:
        """Lazy-load de un fragment shared. Cachea en package.shared."""
        if fragment_name in package.shared:
            return package.shared[fragment_name]

        fragment_rel = package.manifest.shared.get(fragment_name)
        if not fragment_rel:
            raise IonFragmentNotFound(package.manifest.domain, fragment_name)

        recipe = self._parse_ion_file(package.root_path / fragment_rel)
        package.shared[fragment_name] = recipe
        return recipe

    # ------------------------------------------------------------------
    # Watchdog (hot-reload)
    # ------------------------------------------------------------------

    def start_watchdog(self) -> None:
        """
        Inicia un watcher de filesystem sobre ionsites/.
        Al detectar cambios en *.ion o domain.manifest.json:
          1. Valida el nuevo estado del paquete.
          2. Si válido: actualiza el registry.
          3. Si inválido: mantiene la versión anterior, loguea el error.
        """
        try:
            from watchdog.observers import Observer          # type: ignore
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
                if not event.is_directory:
                    loader._on_file_changed(Path(event.src_path))

            def on_created(self, event):
                if not event.is_directory:
                    loader._on_file_changed(Path(event.src_path))

        self._observer = Observer()
        self._observer.schedule(
            _IonEventHandler(), str(self._ionsites), recursive=True
        )
        self._observer.daemon = True
        self._observer.start()
        logger.info("IonLoader: watchdog started on %s", self._ionsites)

    def stop_watchdog(self) -> None:
        """Detiene el watcher de filesystem."""
        if self._observer is not None:
            self._observer.stop()
            self._observer.join(timeout=5)
            self._observer = None
            logger.info("IonLoader: watchdog stopped")

    # ------------------------------------------------------------------
    # Filesystem change handler
    # ------------------------------------------------------------------

    def _on_file_changed(self, path: Path) -> None:
        """
        Llamado por el watchdog. Revalida y recarga el paquete afectado.
        Ignora archivos que no sean .ion o domain.manifest.json.
        Ignora cambios en directorios con prefijo "_".
        """
        name = path.name
        if name != self.MANIFEST_FILENAME and not name.endswith(".ion"):
            return

        # Calcular el directorio del site a partir del path cambiado
        # El site dir es el hijo directo de self._ionsites
        try:
            rel = path.relative_to(self._ionsites)
        except ValueError:
            return

        site_dir_name = rel.parts[0]
        if site_dir_name.startswith("_"):
            return

        site_dir = self._ionsites / site_dir_name
        logger.debug("IonLoader: detected change in %s, reloading site '%s'", path, site_dir_name)

        try:
            package = self.load_site(site_dir)
            self._registry.register_package(site=package.manifest.domain, package=package)
            logger.info("IonLoader: hot-reloaded site '%s'", package.manifest.domain)
        except IonLoadError as exc:
            logger.error(
                "IonLoader: invalid package '%s' — keeping previous. status=%s detail=%s",
                site_dir_name, exc.status, exc.detail,
            )
        except Exception as exc:
            logger.error(
                "IonLoader: unexpected error reloading '%s' — keeping previous. %s",
                site_dir_name, exc,
            )

    # ------------------------------------------------------------------
    # Parsers internos
    # ------------------------------------------------------------------

    def _parse_manifest(self, path: Path, domain: str) -> IonManifest:
        """Parsea domain.manifest.json. Lanza IonLoadError si el JSON es inválido."""
        try:
            with path.open("r", encoding="utf-8") as fh:
                data = json.load(fh)
        except (json.JSONDecodeError, OSError) as exc:
            raise IonLoadError(domain, IonRecipeStatus.INVALID_MANIFEST, str(exc)) from exc

        # Parsear actions
        actions: Dict[str, IonAction] = {}
        for action_name, action_data in data.get("actions", {}).items():
            actions[action_name] = IonAction(
                name=action_name,
                file=action_data["file"],
                public=action_data.get("public", False),
            )

        author = data.get("author", {})

        return IonManifest(
            schema_version=data.get("schema_version", ""),
            domain=data.get("domain", domain),
            version=data.get("version", ""),
            description=data.get("description", ""),
            author_name=author.get("name", ""),
            author_contact=author.get("contact", ""),
            actions=actions,
            pages=data.get("pages", {}),
            shared=data.get("shared", {}),
            entry_actions=data.get("entry_actions", []),
            capabilities=data.get("capabilities", []),
            requires_cortex_version=data.get("requires_cortex_version", ">=1.0.0"),
        )

    def _parse_page_descriptor(self, path: Path) -> IonPageDescriptor:
        """
        Parsea un archivo *.page.ion (YAML).
        Construye IonPageDescriptor con elements y signals indexados por nombre.
        """
        try:
            with path.open("r", encoding="utf-8") as fh:
                data = yaml.safe_load(fh)
        except yaml.YAMLError as exc:
            raise IonSyntaxError(f"YAML parse error in {path}: {exc}") from exc
        except OSError as exc:
            raise IonSyntaxError(f"Cannot read {path}: {exc}") from exc

        if not isinstance(data, dict):
            raise IonSyntaxError(f"Invalid page descriptor in {path}: root must be a mapping.")

        # Parsear elements
        elements: Dict[str, IonElement] = {}
        for elem_name, elem_data in data.get("elements", {}).items():
            elements[elem_name] = IonElement(
                name=elem_name,
                selector=elem_data.get("selector", ""),
                element_type=elem_data.get("type", "clickable"),
            )

        # Parsear signals
        signals: Dict[str, IonSignal] = {}
        for sig_name, sig_data in data.get("signals", {}).items():
            signals[sig_name] = IonSignal(
                name=sig_name,
                detect=sig_data.get("detect", ""),
                once=sig_data.get("once", True),
                priority=sig_data.get("priority", "normal"),
            )

        return IonPageDescriptor(
            page=data.get("page", path.stem),
            url_pattern=data.get("url_pattern", ""),
            ready_when=data.get("ready_when", []),
            elements=elements,
            signals=signals,
            transitions=data.get("transitions", {}),
        )

    def _parse_ion_file(self, path: Path) -> IonRecipe:
        """
        Parsea un archivo *.ion (YAML) — puede ser un action o un fragment.

        Formato esperado (v2.0):
          action: "nombre"   # o fragment: "nombre"
          description: ...
          requires: [...]    # solo en actions
          steps: [...]
          error_handlers: {...}

        CAMBIO RESPECTO A V4: ya no hay flows{} en la raíz.
        Cada archivo .ion es UN action o fragment.
        """
        try:
            with path.open("r", encoding="utf-8") as fh:
                data = yaml.safe_load(fh)
        except yaml.YAMLError as exc:
            raise IonSyntaxError(f"YAML parse error in {path}: {exc}") from exc
        except OSError as exc:
            raise IonSyntaxError(f"Cannot read {path}: {exc}") from exc

        if not isinstance(data, dict):
            raise IonSyntaxError(f"Invalid .ion structure in {path}: root must be a mapping.")

        # Determinar kind
        if "action" in data:
            kind = "action"
            name = data["action"]
        elif "fragment" in data:
            kind = "fragment"
            name = data["fragment"]
        else:
            # Fallback para compatibilidad parcial — usar el nombre del archivo
            kind = "action"
            name = path.stem
            logger.warning(
                "IonLoader: %s has no 'action:' or 'fragment:' key — assuming action '%s'",
                path, name,
            )

        # Parsear steps (lista plana de dicts, cada uno con exactamente una clave de tipo)
        steps = [self._parse_step(s) for s in data.get("steps", [])]

        # Parsear error_handlers
        error_handlers: Dict[str, IonErrorHandler] = {}
        for trigger, handler_data in data.get("error_handlers", {}).items():
            error_handlers[trigger] = IonErrorHandler(
                trigger=trigger,
                retry=handler_data.get("retry", 0),
                backoff=handler_data.get("backoff", 0),
                fallback=handler_data.get("fallback", "emit_error"),
            )

        return IonRecipe(
            kind=kind,
            name=name,
            description=data.get("description", ""),
            requires=data.get("requires", []),
            steps=steps,
            error_handlers=error_handlers,
        )

    def _parse_step(self, raw: object) -> IonStep:
        """
        Parsea un step del DSL Ion v2.0.

        El DSL usa un dict con una sola clave de tipo de step:
          - navigate: {url: ..., expect_page: ...}
          - click: {element: ..., on_page: ...}
          - type: {element: ..., on_page: ..., text: ...}
          - select: {element: ..., on_page: ..., value: ...}
          - wait: {element: ..., on_page: ..., timeout: ...}
          - wait_signal: {signal: ..., on_page: ..., timeout: ...}
          - check: {condition: ..., if_true: [...], if_false: [...]}
          - call: {target: ...}
          - emit: {event: ..., payload: {...}}
          - extract: {element: ..., on_page: ..., save_to: ...}
          - focus: {element: ..., on_page: ...}
          - scroll: {element: ..., on_page: ..., behavior: ...}
          - transition: {to: ..., state: ...}
        """
        if not isinstance(raw, dict):
            return IonStep(step_type="unknown", params={"_raw": raw})

        # El tipo de step es la primera clave del dict cuyo valor es un dict (o None)
        # Excepto claves de metadatos como "description"
        STEP_TYPES = {
            "navigate", "click", "type", "select", "wait", "wait_signal",
            "check", "call", "emit", "extract", "focus", "scroll", "transition",
        }

        for key in raw:
            if key in STEP_TYPES:
                params = raw[key]
                if params is None:
                    params = {}
                elif not isinstance(params, dict):
                    params = {"value": params}
                return IonStep(step_type=key, params=params)

        # Fallback: primer key como tipo, resto como params
        keys = list(raw.keys())
        step_type = keys[0] if keys else "unknown"
        params = raw.get(step_type, {}) or {}
        return IonStep(step_type=step_type, params=params if isinstance(params, dict) else {"value": params})
