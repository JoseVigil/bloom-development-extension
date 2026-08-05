"""
Módulo de comando CLI para la cristalización de intents (Freeze-to-Mandate).

Consume IntentManager.freeze_to_mandate() (brain/core/intent_manager.py,
ya implementado y probado). Ver ahí el docstring completo de la Capa de
Cristalización: qué SÍ y qué NO hace (p. ej. `actions: []` +
`scaffold_pending: true` es intencional, no un bug — el scaffold real de
Actions sigue siendo trabajo pendiente, Roadmap Maestro v3 §2 Fase 4).
"""

import shutil
import typer
from pathlib import Path
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class IntentFreezeCommand(BaseCommand):
    """
    Comando para cristalizar un unbound intent (ing/dis) en un mandate.json.

    Nota de arquitectura: freeze_to_mandate() NO acepta una ruta de salida
    custom — el mandate.json siempre se sintetiza en su ubicación canónica
    `{project_root}/.bloom/.mandates/{mandate_id}/mandate.json` (es el path
    que queda registrado en el propio estado del intent como
    `mandate_artifact_path`, para trazabilidad). Por eso `--output` en este
    comando no se pasa al core: se resuelve como una copia posterior del
    artefacto ya generado, para no fabricar una capacidad que el core no
    tiene.
    """

    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="freeze",
            category=CommandCategory.INTENT,
            version="1.0.0",
            description=(
                "Cristaliza un intent 'ing'/'dis' consolidado/ratificado "
                "(fase terminal ya cerrada) en un mandate.json inmutable"
            ),
            examples=[
                "brain intent freeze my-intent-uuid",
                "brain intent freeze --folder-name .my-intent-a1b2c3d4",
                "brain intent freeze my-intent-uuid --output ./custom_mandate.json",
                "brain intent freeze my-intent-uuid --force",
                "brain intent freeze my-intent-uuid --json",
            ],
        )

    def register(self, app: typer.Typer) -> None:
        @app.command(name=self.metadata().name)
        def execute(
            ctx: typer.Context,
            intent_id: Optional[str] = typer.Argument(
                None,
                help="UUID del intent a cristalizar (o usar --folder-name).",
            ),
            folder_name: Optional[str] = typer.Option(
                None,
                "--folder-name",
                "-f",
                help="Nombre de carpeta del intent, como alternativa a intent_id.",
            ),
            output: Optional[Path] = typer.Option(
                None,
                "--output",
                "-o",
                help=(
                    "Copia el mandate.json generado a esta ruta adicional. "
                    "No reemplaza la ruta canónica dentro de .bloom/.mandates/."
                ),
            ),
            nucleus_path: Optional[Path] = typer.Option(
                None,
                "--nucleus-path",
                help="Ruta explícita al proyecto Bloom (si no se infiere del cwd).",
            ),
            force: bool = typer.Option(
                False,
                "--force",
                help="Re-cristaliza un intent que ya fue frozen, sobrescribiendo el mandate.json anterior.",
            ),
        ):
            """Cristaliza el estado convergido de un intent y sintetiza el mandate.json."""
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()

            if not intent_id and not folder_name:
                self._handle_error(
                    gc, "Debe indicar intent_id (argumento) o --folder-name."
                )

            try:
                # Lazy import del Core Manager
                from brain.core.intent_manager import IntentManager

                if gc.verbose:
                    target = intent_id or folder_name
                    typer.echo(
                        f"🔍 Iniciando cristalización para intent '{target}'...",
                        err=True,
                    )

                manager = IntentManager()
                data = manager.freeze_to_mandate(
                    intent_id=intent_id,
                    folder_name=folder_name,
                    nucleus_path=nucleus_path,
                    force=force,
                )

                # --output es una copia post-freeze: el core siempre escribe
                # primero en su ruta canónica (.bloom/.mandates/<mandate_id>/
                # mandate.json); acá solo espejamos ese archivo ya firmado.
                if output is not None:
                    canonical_path = Path(data["mandate_path"])
                    output.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(canonical_path, output)
                    data["copied_to"] = str(output)
                    if gc.verbose:
                        typer.echo(
                            f"📎 Copia adicional en: {output}", err=True
                        )

                result = {
                    "status": "success",
                    "operation": "intent_freeze",
                    "data": data,
                }

                gc.output(result, self._render_success)

            except FileNotFoundError as e:
                self._handle_error(gc, f"Proyecto Bloom no encontrado: {e}")
            except ValueError as e:
                self._handle_error(gc, f"No se pudo cristalizar el intent: {e}")
            except Exception as e:
                self._handle_error(gc, f"Error durante la cristalización: {e}")

    def _render_success(self, data: dict):
        """Output humano estructurado para el comando freeze."""
        d = data.get("data", {})
        typer.echo(f"✨ Intent cristalizado con éxito ('{data['operation']}')")
        if "intent_id" in d:
            typer.echo(f"🆔 Intent: {d['intent_id']}")
        if "mandate_id" in d:
            typer.echo(f"🔑 Mandate ID: {d['mandate_id']}")
        if "mandate_path" in d:
            typer.echo(f"📄 Mandate generado en: {d['mandate_path']}")
        if "content_hash" in d:
            typer.echo(f"🔒 Content hash (sha256): {d['content_hash']}")
        if "copied_to" in d:
            typer.echo(f"📎 Copia adicional en: {d['copied_to']}")
        if d.get("scaffold_pending"):
            typer.echo(
                "⏳ scaffold_pending=true: la síntesis de Actions reales "
                "sigue siendo trabajo pendiente."
            )

    def _handle_error(self, gc, message: str):
        """Manejo unificado de errores."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)
