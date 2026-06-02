# brain/core/ionpump/ionpump_validator.py
#
# Validación de paquetes Ion v2.0.
#
# CHANGELOG respecto a v4:
#   - validate_directory(): valida un directorio completo (manifest + subdirectorios).
#   - validate_file() preservado para compatibilidad con el watchdog.
#   - Output alineado con `brain ionpump validate` del v5:
#       una línea por archivo con ✓ o error descriptivo.
#   - validate_manifest_file(): validación específica del domain.manifest.json.
#   - validate_page_file(): validación de *.page.ion.
#   - validate_action_file(): validación de actions/*.ion.
#   - validate_fragment_file(): validación de shared/*.ion.

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import List

import yaml

logger = logging.getLogger(__name__)

_SUPPORTED_SCHEMA = "2.0"
_MANIFEST_MAX_BYTES = 64 * 1024


@dataclass
class FileValidationResult:
    """Resultado de validación de un archivo individual."""
    path: str
    valid: bool
    summary: str           # descripción corta para el output de una línea
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)


@dataclass
class ValidationResult:
    """Resultado de validación de un archivo (compatibilidad con watchdog)."""
    valid: bool
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)


@dataclass
class PackageValidationResult:
    """Resultado de validación de un paquete completo."""
    valid: bool
    files: List[FileValidationResult] = field(default_factory=list)

    def print_report(self) -> None:
        """Imprime el reporte en el formato de `brain ionpump validate`."""
        for fr in self.files:
            mark  = "✓" if fr.valid else "✗"
            extra = f"  ← {fr.errors[0]}" if not fr.valid and fr.errors else ""
            print(f"{mark} {fr.path:<45} {fr.summary}{extra}")

    @property
    def error_count(self) -> int:
        return sum(1 for f in self.files if not f.valid)


class IonValidator:
    """
    Valida paquetes Ion v2.0.
    Nunca lanza excepciones — siempre retorna un resultado.
    """

    # ------------------------------------------------------------------
    # Validación de directorio completo
    # ------------------------------------------------------------------

    def validate_directory(self, site_dir: Path) -> PackageValidationResult:
        """
        Valida un directorio de paquete Ion completo.
        Output alineado con `brain ionpump validate ./ionsites/github.com/`.
        """
        results: List[FileValidationResult] = []

        if not site_dir.is_dir():
            return PackageValidationResult(
                valid=False,
                files=[FileValidationResult(
                    path=str(site_dir), valid=False,
                    summary="directorio no encontrado",
                    errors=[f"Not a directory: {site_dir}"],
                )],
            )

        manifest_path = site_dir / "domain.manifest.json"

        # 1. Validar manifest
        manifest_result = self.validate_manifest_file(manifest_path)
        results.append(manifest_result)

        if not manifest_result.valid:
            return PackageValidationResult(valid=False, files=results)

        # Leer manifest para saber qué archivos validar
        try:
            with manifest_path.open("r", encoding="utf-8") as fh:
                manifest_data = json.load(fh)
        except Exception as exc:
            return PackageValidationResult(valid=False, files=results)

        actions = manifest_data.get("actions", {})
        pages   = manifest_data.get("pages", {})
        shared  = manifest_data.get("shared", {})

        # 2. Validar actions
        for action_name, action_meta in actions.items():
            action_path = site_dir / action_meta.get("file", "")
            result = self.validate_action_file(action_path, action_name)
            results.append(result)

        # 3. Validar pages
        for page_name, page_rel in pages.items():
            page_path = site_dir / page_rel
            result = self.validate_page_file(page_path, page_name)
            results.append(result)

        # 4. Validar shared
        for fragment_name, fragment_rel in shared.items():
            fragment_path = site_dir / fragment_rel
            result = self.validate_fragment_file(fragment_path, fragment_name)
            results.append(result)

        overall_valid = all(r.valid for r in results)
        return PackageValidationResult(valid=overall_valid, files=results)

    # ------------------------------------------------------------------
    # Validación de manifest
    # ------------------------------------------------------------------

    def validate_manifest_file(self, path: Path) -> FileValidationResult:
        """Valida domain.manifest.json."""
        rel_path = "domain.manifest.json"
        errors: List[str] = []

        if not path.exists():
            return FileValidationResult(
                path=rel_path, valid=False,
                summary="no encontrado",
                errors=["domain.manifest.json not found"],
            )

        if path.stat().st_size > _MANIFEST_MAX_BYTES:
            return FileValidationResult(
                path=rel_path, valid=False,
                summary="demasiado grande",
                errors=[f"Exceeds {_MANIFEST_MAX_BYTES} bytes limit"],
            )

        try:
            with path.open("r", encoding="utf-8") as fh:
                data = json.load(fh)
        except json.JSONDecodeError as exc:
            return FileValidationResult(
                path=rel_path, valid=False,
                summary="JSON inválido",
                errors=[str(exc)],
            )

        # Validar campos obligatorios
        if data.get("schema_version") != _SUPPORTED_SCHEMA:
            errors.append(
                f"schema_version '{data.get('schema_version')}' not supported (need '{_SUPPORTED_SCHEMA}')"
            )

        if not data.get("domain"):
            errors.append("'domain' field is required")

        if not data.get("version"):
            errors.append("'version' field is required and must not be empty")

        if not data.get("entry_actions"):
            errors.append("'entry_actions' must not be empty")

        # Verificar consistencia entry_actions → actions
        actions      = data.get("actions", {})
        entry_actions = data.get("entry_actions", [])
        for ea in entry_actions:
            if ea not in actions:
                errors.append(f"entry_action '{ea}' not in actions")

        if errors:
            return FileValidationResult(
                path=rel_path, valid=False,
                summary="errores de schema",
                errors=errors,
            )

        schema_ver  = data.get("schema_version", "")
        action_count = len(actions)
        page_count   = len(data.get("pages", {}))
        shared_count = len(data.get("shared", {}))

        return FileValidationResult(
            path=rel_path, valid=True,
            summary=(
                f"schema válido, schema_version {schema_ver}, "
                f"{action_count} action(s), {page_count} page(s), {shared_count} shared"
            ),
        )

    # ------------------------------------------------------------------
    # Validación de action files
    # ------------------------------------------------------------------

    def validate_action_file(self, path: Path, action_name: str = "") -> FileValidationResult:
        """Valida un archivo actions/*.ion."""
        rel_path = f"actions/{path.name}"
        errors: List[str] = []

        if not path.exists():
            return FileValidationResult(
                path=rel_path, valid=False,
                summary="archivo no encontrado",
                errors=[f"File not found: {path}"],
            )

        try:
            with path.open("r", encoding="utf-8") as fh:
                data = yaml.safe_load(fh)
        except yaml.YAMLError as exc:
            return FileValidationResult(
                path=rel_path, valid=False,
                summary="YAML inválido",
                errors=[str(exc)],
            )

        if not isinstance(data, dict):
            return FileValidationResult(
                path=rel_path, valid=False,
                summary="estructura inválida",
                errors=["Root must be a YAML mapping"],
            )

        if "action" not in data:
            errors.append("Missing 'action:' key — action files must start with 'action:'")

        steps = data.get("steps", [])
        if not steps:
            errors.append("'steps' must not be empty")

        # Verificar que no hay selectores CSS directos (los steps deben usar element + on_page)
        css_warnings: List[str] = []
        for i, step in enumerate(steps):
            if isinstance(step, dict):
                for _st, params in step.items():
                    if isinstance(params, dict) and "selector" in params:
                        css_warnings.append(
                            f"step {i}: 'selector' found directly — use 'element:' + 'on_page:' instead"
                        )

        step_count = len(steps)

        if errors:
            return FileValidationResult(
                path=rel_path, valid=False,
                summary="errores de estructura",
                errors=errors,
                warnings=css_warnings,
            )

        return FileValidationResult(
            path=rel_path, valid=True,
            summary=f"{step_count} steps, sin errores",
            warnings=css_warnings,
        )

    # ------------------------------------------------------------------
    # Validación de page descriptors
    # ------------------------------------------------------------------

    def validate_page_file(self, path: Path, page_name: str = "") -> FileValidationResult:
        """Valida un archivo pages/*.page.ion."""
        rel_path = f"pages/{path.name}"
        errors: List[str] = []

        if not path.exists():
            return FileValidationResult(
                path=rel_path, valid=False,
                summary="archivo no encontrado",
                errors=[f"File not found: {path}"],
            )

        try:
            with path.open("r", encoding="utf-8") as fh:
                data = yaml.safe_load(fh)
        except yaml.YAMLError as exc:
            return FileValidationResult(
                path=rel_path, valid=False,
                summary="YAML inválido",
                errors=[str(exc)],
            )

        if not isinstance(data, dict):
            return FileValidationResult(
                path=rel_path, valid=False,
                summary="estructura inválida",
                errors=["Root must be a YAML mapping"],
            )

        if "page" not in data:
            errors.append("Missing 'page:' key")
        if "url_pattern" not in data:
            errors.append("Missing 'url_pattern:' key")

        elements = data.get("elements", {})
        signals  = data.get("signals", {})

        elem_count   = len(elements)
        signal_count = len(signals)

        if errors:
            return FileValidationResult(
                path=rel_path, valid=False,
                summary="errores de estructura",
                errors=errors,
            )

        return FileValidationResult(
            path=rel_path, valid=True,
            summary=f"{elem_count} elemento(s), {signal_count} signal(s)",
        )

    # ------------------------------------------------------------------
    # Validación de shared fragments
    # ------------------------------------------------------------------

    def validate_fragment_file(self, path: Path, fragment_name: str = "") -> FileValidationResult:
        """Valida un archivo shared/*.ion."""
        rel_path = f"shared/{path.name}"
        errors: List[str] = []

        if not path.exists():
            return FileValidationResult(
                path=rel_path, valid=False,
                summary="archivo no encontrado",
                errors=[f"File not found: {path}"],
            )

        try:
            with path.open("r", encoding="utf-8") as fh:
                data = yaml.safe_load(fh)
        except yaml.YAMLError as exc:
            return FileValidationResult(
                path=rel_path, valid=False,
                summary="YAML inválido",
                errors=[str(exc)],
            )

        if not isinstance(data, dict):
            return FileValidationResult(
                path=rel_path, valid=False,
                summary="estructura inválida",
                errors=["Root must be a YAML mapping"],
            )

        if "fragment" not in data:
            errors.append("Missing 'fragment:' key — shared files must start with 'fragment:'")

        steps = data.get("steps", [])
        if not steps:
            errors.append("'steps' must not be empty")

        if errors:
            return FileValidationResult(
                path=rel_path, valid=False,
                summary="errores de estructura",
                errors=errors,
            )

        return FileValidationResult(
            path=rel_path, valid=True,
            summary="fragment válido",
        )

    # ------------------------------------------------------------------
    # validate_file() — compatibilidad con watchdog del loader
    # ------------------------------------------------------------------

    def validate_file(self, path: Path) -> ValidationResult:
        """
        Valida un archivo individual (cualquier tipo .ion o .json).
        Retorna ValidationResult — interface compatible con el watchdog del loader v4.
        """
        if not path.exists():
            return ValidationResult(valid=False, errors=[f"File not found: {path}"])

        name = path.name
        if name == "domain.manifest.json":
            r = self.validate_manifest_file(path)
        elif name.endswith(".page.ion"):
            r = self.validate_page_file(path)
        elif name.endswith(".ion"):
            # Intentar detectar si es fragment o action
            try:
                with path.open("r", encoding="utf-8") as fh:
                    data = yaml.safe_load(fh)
                if isinstance(data, dict) and "fragment" in data:
                    r = self.validate_fragment_file(path)
                else:
                    r = self.validate_action_file(path)
            except Exception:
                r = self.validate_action_file(path)
        else:
            return ValidationResult(valid=True, warnings=["Unknown file type — skipped"])

        return ValidationResult(valid=r.valid, errors=r.errors, warnings=r.warnings)
