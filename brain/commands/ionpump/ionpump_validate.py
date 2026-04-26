# brain/commands/ionpump/ionpump_validate.py
"""
IonPump validate command — validate a single .ion file or all ionsites/.
"""

import typer
from pathlib import Path
from typing import Optional

from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class IonPumpValidateCommand(BaseCommand):
    """
    Validate .ion recipe files.

    Can validate a single file by path or all recipes discovered under ionsites/.
    Returns structured output compatible with --json and human-readable modes.
    """

    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="validate",
            category=CommandCategory.INTENT,
            version="1.0.0",
            description="Validate .ion recipe files for syntax and semantic correctness.",
            examples=[
                "brain ionpump validate github.com/auth.ion",
                "brain ionpump validate --all",
                "brain ionpump validate --all --json",
            ],
        )

    def register(self, app: typer.Typer) -> None:
        @app.command(name="validate")
        def execute(
            ctx: typer.Context,
            ion_path: Optional[str] = typer.Argument(
                None,
                help="Path to a .ion file relative to ionsites/ (e.g. github.com/auth.ion).",
            ),
            all_sites: bool = typer.Option(
                False, "--all", "-a", help="Validate all .ion files in ionsites/."
            ),
            ionsites_dir: str = typer.Option(
                "ionsites", "--ionsites", help="Root directory for ionsites."
            ),
        ):
            """Validate one or all .ion recipe files."""

            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()

            if not ion_path and not all_sites:
                self._handle_error(
                    gc,
                    "Debes especificar un path (e.g. github.com/auth.ion) o usar --all.",
                )

            try:
                from brain.core.ionpump.ionpump_validator import IonValidator

                validator = IonValidator()
                ionsites_root = Path(ionsites_dir)

                if all_sites:
                    if gc.verbose:
                        typer.echo(f"🔍 Escaneando {ionsites_root}...", err=True)
                    ion_files = list(ionsites_root.rglob("*.ion"))
                    if not ion_files:
                        self._handle_error(
                            gc, f"No se encontraron archivos .ion en '{ionsites_root}'."
                        )
                    results = []
                    for f in ion_files:
                        rel = str(f.relative_to(ionsites_root))
                        if gc.verbose:
                            typer.echo(f"🔍 Validando {rel}...", err=True)
                        vr = validator.validate_file(f)
                        results.append(
                            {
                                "file": rel,
                                "valid": vr.valid,
                                "errors": vr.errors,
                                "warnings": vr.warnings,
                            }
                        )

                    all_valid = all(r["valid"] for r in results)
                    result = {
                        "status": "success" if all_valid else "error",
                        "operation": "validate_all",
                        "data": {
                            "results": results,
                            "total": len(results),
                            "passed": sum(1 for r in results if r["valid"]),
                            "failed": sum(1 for r in results if not r["valid"]),
                        },
                    }
                    gc.output(result, self._render_all)

                else:
                    target = ionsites_root / ion_path
                    if gc.verbose:
                        typer.echo(f"🔍 Validando {target}...", err=True)

                    vr = validator.validate_file(target)
                    result = {
                        "status": "success" if vr.valid else "error",
                        "operation": "validate_file",
                        "data": {
                            "file": ion_path,
                            "valid": vr.valid,
                            "errors": vr.errors,
                            "warnings": vr.warnings,
                        },
                    }
                    gc.output(result, self._render_single)

                    if not vr.valid:
                        raise typer.Exit(code=1)

            except typer.Exit:
                raise
            except Exception as exc:
                self._handle_error(gc, f"Error durante la validación: {exc}")

    # ------------------------------------------------------------------
    # Renderers
    # ------------------------------------------------------------------

    def _render_single(self, data: dict):
        d = data["data"]
        if d["valid"]:
            typer.echo(f"✅ {d['file']} — válido")
        else:
            typer.echo(f"❌ {d['file']} — {len(d['errors'])} error(es):")
            for err in d["errors"]:
                typer.echo(f"   · {err}")
        if d["warnings"]:
            for w in d["warnings"]:
                typer.echo(f"   ⚠ {w}")

    def _render_all(self, data: dict):
        results = data["data"]["results"]
        total = data["data"]["total"]
        passed = data["data"]["passed"]
        failed = data["data"]["failed"]

        for r in results:
            if r["valid"]:
                typer.echo(f"✅ {r['file']} — válido")
            else:
                typer.echo(f"❌ {r['file']} — {len(r['errors'])} error(es):")
                for err in r["errors"]:
                    typer.echo(f"   · {err}")
            for w in r.get("warnings", []):
                typer.echo(f"   ⚠ {w}")

        typer.echo("─" * 50)
        typer.echo(f"Total: {total}  ✅ {passed} OK  ❌ {failed} con errores")

    def _handle_error(self, gc, message: str):
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)
