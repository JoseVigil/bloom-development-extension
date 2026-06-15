# brain/commands/ionpump/ionpump_validate.py
"""
IonPump validate command — validate a site directory or all ionsites/.

v2.0: CLI accepts a site directory (e.g. ./ionsites/github.com/) instead of
a single .ion file. Validates domain.manifest.json + all declared files,
reporting stats per file type (manifest, action, page, shared).
"""

import json
import typer
from pathlib import Path
from typing import Optional

from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class IonPumpValidateCommand(BaseCommand):
    """
    Validate an Ion site package against schema v2.0.

    Validates domain.manifest.json and every declared file (actions, pages, shared),
    reporting per-file stats and overall pass/fail.
    """

    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="validate",
            category=CommandCategory.IONPUMP,
            version="2.0.0",
            description="Validate an Ion site package directory against schema v2.0.",
            examples=[
                "brain ionpump validate ./ionsites/github.com/",
                "brain ionpump validate --all",
                "brain ionpump validate --all --json",
            ],
        )

    def register(self, app: typer.Typer) -> None:
        @app.command(name="validate")
        def execute(
            ctx: typer.Context,
            site_dir: Optional[str] = typer.Argument(
                None,
                help="Path to a site directory (e.g. ./ionsites/github.com/).",
            ),
            all_sites: bool = typer.Option(
                False, "--all", "-a", help="Validate all site directories in ionsites/."
            ),
            ionsites_dir: str = typer.Option(
                "ionsites", "--ionsites", help="Root directory for ionsites."
            ),
        ):
            """Validate one or all Ion site packages."""

            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()

            if not site_dir and not all_sites:
                self._handle_error(
                    gc,
                    "Debes especificar un directorio de site (e.g. ./ionsites/github.com/) o usar --all.",
                )

            try:
                from brain.core.ionpump.ionpump_validator import IonValidator

                validator = IonValidator()
                ionsites_root = Path(ionsites_dir)

                if all_sites:
                    if gc.verbose:
                        typer.echo(f"🔍 Escaneando {ionsites_root}...", err=True)
                    site_dirs = [
                        d for d in sorted(ionsites_root.iterdir())
                        if d.is_dir() and not d.name.startswith("_")
                    ]
                    if not site_dirs:
                        self._handle_error(
                            gc, f"No se encontraron directorios de site en '{ionsites_root}'."
                        )

                    all_results = []
                    for sd in site_dirs:
                        if gc.verbose:
                            typer.echo(f"🔍 Validando {sd.name}...", err=True)
                        site_results = self._validate_site(validator, sd, gc)
                        all_results.extend(site_results)

                    all_valid = all(r["valid"] for r in all_results)
                    result = {
                        "status": "success" if all_valid else "error",
                        "operation": "validate_all",
                        "data": {
                            "results": all_results,
                            "total": len(all_results),
                            "passed": sum(1 for r in all_results if r["valid"]),
                            "failed": sum(1 for r in all_results if not r["valid"]),
                        },
                    }
                    gc.output(result, self._render_all)
                    if not all_valid:
                        raise typer.Exit(code=1)

                else:
                    target = Path(site_dir)
                    if not target.is_absolute():
                        target = ionsites_root / site_dir
                    if gc.verbose:
                        typer.echo(f"🔍 Validando {target}...", err=True)

                    results = self._validate_site(validator, target, gc)
                    all_valid = all(r["valid"] for r in results)
                    result = {
                        "status": "success" if all_valid else "error",
                        "operation": "validate_site",
                        "data": {
                            "results": results,
                            "total": len(results),
                            "passed": sum(1 for r in results if r["valid"]),
                            "failed": sum(1 for r in results if not r["valid"]),
                        },
                    }
                    gc.output(result, self._render_all)
                    if not all_valid:
                        raise typer.Exit(code=1)

            except typer.Exit:
                raise
            except Exception as exc:
                self._handle_error(gc, f"Error durante la validación: {exc}")

    # ------------------------------------------------------------------
    # Validation logic
    # ------------------------------------------------------------------

    def _validate_site(self, validator, site_dir: Path, gc) -> list:
        """
        Validates the full site package:
          1. domain.manifest.json (schema v2.0)
          2. Each declared action file
          3. Each declared page file
          4. Each declared shared file

        Returns a list of result dicts, one per file, each with keys:
          file, file_type, valid, stats, errors, warnings
        """
        results = []

        manifest_path = site_dir / "domain.manifest.json"

        # --- Validate manifest ---
        manifest_result = self._validate_manifest(validator, manifest_path, site_dir)
        results.append(manifest_result)

        # If manifest is invalid we can still attempt to check declared files,
        # but we need a parsed manifest. If parsing failed, stop here.
        if not manifest_result.get("_manifest"):
            return results

        manifest = manifest_result.pop("_manifest")

        # --- Validate declared actions ---
        for action_name, action_obj in manifest.actions.items():
            action_path = site_dir / action_obj.file
            vr = validator.validate_file(action_path) if action_path.exists() else None
            if vr is None:
                results.append({
                    "file": action_obj.file,
                    "file_type": "action",
                    "valid": False,
                    "stats": {},
                    "errors": [f"File not found: {action_obj.file}"],
                    "warnings": [],
                })
            else:
                step_count = getattr(vr, "step_count", 0)
                results.append({
                    "file": action_obj.file,
                    "file_type": "action",
                    "valid": vr.valid,
                    "stats": {"steps": step_count},
                    "errors": vr.errors,
                    "warnings": vr.warnings,
                })

        # --- Validate declared pages ---
        for page_name, page_rel in manifest.pages.items():
            page_path = site_dir / page_rel
            vr = validator.validate_file(page_path) if page_path.exists() else None
            if vr is None:
                results.append({
                    "file": page_rel,
                    "file_type": "page",
                    "valid": False,
                    "stats": {},
                    "errors": [f"File not found: {page_rel}"],
                    "warnings": [],
                })
            else:
                elem_count   = getattr(vr, "element_count", 0)
                signal_count = getattr(vr, "signal_count", 0)
                results.append({
                    "file": page_rel,
                    "file_type": "page",
                    "valid": vr.valid,
                    "stats": {"elements": elem_count, "signals": signal_count},
                    "errors": vr.errors,
                    "warnings": vr.warnings,
                })

        # --- Validate declared shared fragments ---
        for frag_name, frag_rel in manifest.shared.items():
            frag_path = site_dir / frag_rel
            vr = validator.validate_file(frag_path) if frag_path.exists() else None
            if vr is None:
                results.append({
                    "file": frag_rel,
                    "file_type": "shared",
                    "valid": False,
                    "stats": {},
                    "errors": [f"File not found: {frag_rel}"],
                    "warnings": [],
                })
            else:
                results.append({
                    "file": frag_rel,
                    "file_type": "shared",
                    "valid": vr.valid,
                    "stats": {},
                    "errors": vr.errors,
                    "warnings": vr.warnings,
                })

        return results

    def _validate_manifest(self, validator, manifest_path: Path, site_dir: Path) -> dict:
        """
        Validates domain.manifest.json and does schema v2.0 checks.
        Returns a result dict; also injects _manifest for upstream use if valid.
        """
        if not manifest_path.exists():
            return {
                "file": "domain.manifest.json",
                "file_type": "manifest",
                "valid": False,
                "stats": {},
                "errors": ["domain.manifest.json not found"],
                "warnings": [],
            }

        vr = validator.validate_file(manifest_path)
        errors = list(vr.errors)
        warnings = list(vr.warnings)

        # Additional schema v2.0 checks
        manifest = None
        try:
            import json as _json
            with manifest_path.open("r", encoding="utf-8") as fh:
                data = _json.load(fh)

            schema_version = data.get("schema_version", "")
            if schema_version != "2.0":
                errors.append(
                    f"schema_version must be '2.0', got '{schema_version}'"
                )

            version = data.get("version", "")
            if not version:
                errors.append("'version' field is empty")

            if "site" in data:
                errors.append("'site' field is not valid in schema v2.0 — use 'domain'")

            for obsolete in ("entrypoint", "flows", "triggers"):
                if obsolete in data:
                    errors.append(
                        f"'{obsolete}' is not valid in schema v2.0 — see migration guide"
                    )

            # Validate entry_actions exist in actions and files exist on disk
            actions = data.get("actions", {})
            for ea in data.get("entry_actions", []):
                if ea not in actions:
                    errors.append(
                        f"entry_action '{ea}' not declared in actions{{}}"
                    )
                else:
                    action_file = site_dir / actions[ea]["file"]
                    if not action_file.exists():
                        errors.append(
                            f"entry_action '{ea}' file not found: {actions[ea]['file']}"
                        )

            # Validate pages and shared files exist on disk
            for page_name, page_rel in data.get("pages", {}).items():
                if not (site_dir / page_rel).exists():
                    warnings.append(f"pages['{page_name}'] file not found: {page_rel}")

            for frag_name, frag_rel in data.get("shared", {}).items():
                if not (site_dir / frag_rel).exists():
                    warnings.append(f"shared['{frag_name}'] file not found: {frag_rel}")

            # Build manifest object for upstream if no hard errors so far
            if not errors:
                from brain.core.ionpump.ionpump_models import IonAction, IonManifest
                built_actions = {
                    k: IonAction(name=k, file=v["file"], public=v.get("public", False))
                    for k, v in actions.items()
                }
                author = data.get("author", {})
                manifest = IonManifest(
                    schema_version=schema_version,
                    domain=data.get("domain", ""),
                    version=version,
                    description=data.get("description", ""),
                    author_name=author.get("name", ""),
                    author_contact=author.get("contact", ""),
                    actions=built_actions,
                    pages=data.get("pages", {}),
                    shared=data.get("shared", {}),
                    entry_actions=data.get("entry_actions", []),
                    capabilities=data.get("capabilities", []),
                    requires_cortex_version=data.get("requires_cortex_version", ">=1.0.0"),
                )

        except Exception as exc:
            errors.append(f"Failed to parse manifest JSON: {exc}")

        valid = len(errors) == 0
        result = {
            "file": "domain.manifest.json",
            "file_type": "manifest",
            "valid": valid,
            "stats": {"schema_version": "2.0"},
            "errors": errors,
            "warnings": warnings,
        }
        if manifest:
            result["_manifest"] = manifest
        return result

    # ------------------------------------------------------------------
    # Renderers
    # ------------------------------------------------------------------

    def _render_all(self, data: dict):
        results = data["data"]["results"]
        total   = data["data"]["total"]
        passed  = data["data"]["passed"]
        failed  = data["data"]["failed"]

        for r in results:
            icon  = "✓" if r["valid"] else "✗"
            ftype = r["file_type"]
            stats = r.get("stats", {})

            # Build stats suffix per file type
            if ftype == "manifest":
                suffix = f"schema válido, schema_version {stats.get('schema_version', '?')}"
            elif ftype == "action":
                suffix = f"{stats.get('steps', '?')} steps, sin errores" if r["valid"] else f"{len(r['errors'])} error(es)"
            elif ftype == "page":
                suffix = (
                    f"{stats.get('elements', '?')} elementos, {stats.get('signals', '?')} signal(s)"
                    if r["valid"]
                    else f"{len(r['errors'])} error(es)"
                )
            elif ftype == "shared":
                suffix = "fragment válido" if r["valid"] else f"{len(r['errors'])} error(es)"
            else:
                suffix = "válido" if r["valid"] else f"{len(r['errors'])} error(es)"

            typer.echo(f"{icon} {r['file']:<45} {suffix}")

            if not r["valid"]:
                for err in r["errors"]:
                    typer.echo(f"     · {err}")
            for w in r.get("warnings", []):
                typer.echo(f"   ⚠ {w}")

        typer.echo("─" * 60)
        typer.echo(f"Total: {total}  ✓ {passed} OK  ✗ {failed} con errores")

    def _handle_error(self, gc, message: str):
        if gc.json_mode:
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)
