"""
BISP — Bloom Intent Semantic Package
commands/bisp/vectorize.py

CLI Layer para operaciones de vectorización BISP.

Subcomandos:
  brain bisp vectorize payload   → PUNTO 2: indexa un payload en ChromaDB
  brain bisp vectorize health    → verifica estado de Ollama + ChromaDB
  brain bisp vectorize model     → verifica/informa sobre el modelo

Arquitectura: CLI Layer solo. Toda la lógica en core/bisp/.
"""

from __future__ import annotations

import typer
from pathlib import Path
from typing import Optional

from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class BISPVectorizeCommand(BaseCommand):
    """
    Comandos de vectorización BISP.

    Gestiona el PUNTO 2 del pipeline BISP: después de ejecutar una fase,
    Brain genera el embedding del payload y lo registra en ChromaDB + index.json.
    """

    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="vectorize",
            category=CommandCategory.BISP,
            version="1.0.0",
            description="Operaciones de vectorización BISP (Bloom Intent Semantic Package)",
            examples=[
                "brain bisp vectorize payload --intent-uuid dev-refactor-auth-a3f9 --phase briefing",
                "brain bisp vectorize health",
                "brain bisp vectorize model --check",
            ],
        )

    def register(self, app: typer.Typer) -> None:
        """Registra subgrupo 'vectorize' con sus subcomandos."""
        vec_app = typer.Typer(help="Vectorización BISP — Ollama + ChromaDB")

        # ----------------------------------------------------------------
        # Subcomando: payload
        # ----------------------------------------------------------------
        @vec_app.command(name="payload")
        def vectorize_payload(
            ctx: typer.Context,
            intent_uuid: str = typer.Option(
                ..., "--intent-uuid", "-u", help="UUID del intent a vectorizar"
            ),
            phase: str = typer.Option(
                ..., "--phase", "-p", help="Fase del pipeline (briefing, execution, refinement_1...)"
            ),
            project_uuid: str = typer.Option(
                ..., "--project-uuid", help="UUID del proyecto"
            ),
            nucleus_path: Optional[Path] = typer.Option(
                None, "--nucleus-path", "-n",
                help="Path al directorio del Nucleus. Default: desde GlobalContext.",
            ),
            payload_path: Optional[Path] = typer.Option(
                None, "--payload-path",
                help="Path explícito al .payload.json. Default: se resuelve desde intent.",
            ),
            dry_run: bool = typer.Option(
                False, "--dry-run", help="Muestra qué haría sin ejecutar."
            ),
        ):
            """
            Vectoriza un payload ejecutado (PUNTO 2 del pipeline BISP).

            Lee el payload.json de la fase indicada, genera el embedding con Ollama,
            almacena en ChromaDB y actualiza el index.json con el embedding_ref.
            """
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()

            try:
                from brain.core.bisp.payload_indexer import PayloadIndexer

                resolved_nucleus = nucleus_path or getattr(gc, "nucleus_path", None)
                if not resolved_nucleus:
                    self._handle_error(gc, "nucleus-path requerido. Pasalo con --nucleus-path o configuralo en GlobalContext.")

                if gc.verbose:
                    typer.echo(f"🔍 Vectorizando payload: {intent_uuid}/{phase}", err=True)
                    typer.echo(f"   Nucleus: {resolved_nucleus}", err=True)
                    typer.echo(f"   Proyecto: {project_uuid}", err=True)

                indexer = PayloadIndexer(
                    nucleus_path=resolved_nucleus,
                    project_uuid=project_uuid,
                )

                if dry_run:
                    result = indexer.dry_run(
                        intent_uuid=intent_uuid,
                        phase=phase,
                        payload_path=payload_path,
                    )
                    result["operation"] = "vectorize_payload_dry_run"
                else:
                    result = indexer.index_payload(
                        intent_uuid=intent_uuid,
                        phase=phase,
                        payload_path=payload_path,
                    )
                    result["operation"] = "vectorize_payload"

                gc.output(result, self._render_payload_success)

            except Exception as exc:
                self._handle_error(gc, str(exc))

        # ----------------------------------------------------------------
        # Subcomando: health
        # ----------------------------------------------------------------
        @vec_app.command(name="health")
        def vectorize_health(
            ctx: typer.Context,
            nucleus_path: Optional[Path] = typer.Option(
                None, "--nucleus-path", "-n",
                help="Path al Nucleus. Default: desde GlobalContext.",
            ),
        ):
            """
            Verifica el estado de Ollama y ChromaDB para BISP.

            Reporta:
            - Si Ollama está corriendo
            - Si el modelo nomic-embed-text está disponible
            - Si ChromaDB está inicializado
            - Colecciones existentes
            """
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()

            try:
                from brain.core.bisp.ollama_manager import OllamaManager
                from brain.core.bisp.chroma_client import BISPChromaClient

                resolved_nucleus = nucleus_path or getattr(gc, "nucleus_path", None)

                # Resolver exe de Ollama desde nucleus.json si es posible
                nucleus_json = None
                if resolved_nucleus:
                    candidate = Path(resolved_nucleus) / "nucleus.json"
                    if candidate.exists():
                        nucleus_json = candidate

                if nucleus_json:
                    ollama = OllamaManager.from_nucleus_json(nucleus_json)
                else:
                    ollama = OllamaManager()

                ollama_health = ollama.health()
                chroma_health = {}

                if resolved_nucleus:
                    chroma = BISPChromaClient(resolved_nucleus)
                    chroma_health = chroma.health()

                result = {
                    "status": "success",
                    "operation": "bisp_health",
                    "data": {
                        "ollama": ollama_health,
                        "chroma": chroma_health,
                        "nucleus_path": str(resolved_nucleus) if resolved_nucleus else None,
                    },
                }

                gc.output(result, self._render_health)

            except Exception as exc:
                self._handle_error(gc, str(exc))

        # ----------------------------------------------------------------
        # Subcomando: model
        # ----------------------------------------------------------------
        @vec_app.command(name="model")
        def vectorize_model(
            ctx: typer.Context,
            check: bool = typer.Option(
                False, "--check", help="Solo verifica si el modelo está disponible."
            ),
            nucleus_json: Optional[Path] = typer.Option(
                None, "--nucleus-json",
                help="Path al nucleus.json para ubicar el exe de Ollama.",
            ),
        ):
            """
            Informa sobre el modelo de embeddings (nomic-embed-text).

            Con --check verifica que está disponible y retorna exit code 1 si no.
            """
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()

            try:
                from brain.core.bisp.ollama_manager import OllamaManager, EMBEDDING_MODEL, EMBEDDING_DIM

                if nucleus_json and nucleus_json.exists():
                    ollama = OllamaManager.from_nucleus_json(nucleus_json)
                else:
                    ollama = OllamaManager()

                health = ollama.health()

                result = {
                    "status": "success",
                    "operation": "bisp_model_check",
                    "data": {
                        "model": EMBEDDING_MODEL,
                        "dimensions": EMBEDDING_DIM,
                        "available": health.get("model_available", False),
                        "ollama_status": health.get("status"),
                        "installed_models": health.get("installed_models", []),
                        "ollama_exe": health.get("ollama_exe"),
                    },
                }

                if check and not health.get("model_available"):
                    if gc.json_mode:
                        import json
                        typer.echo(json.dumps(result))
                    else:
                        typer.echo(
                            f"❌ Modelo '{EMBEDDING_MODEL}' no disponible.\n"
                            f"   Ejecutá: ollama pull {EMBEDDING_MODEL}",
                            err=True,
                        )
                    raise typer.Exit(code=1)

                gc.output(result, self._render_model_info)

            except typer.Exit:
                raise
            except Exception as exc:
                self._handle_error(gc, str(exc))

        app.add_typer(vec_app, name="vectorize")

    # ------------------------------------------------------------------
    # Renderers (output humano)
    # ------------------------------------------------------------------

    def _render_payload_success(self, data: dict) -> None:
        op = data.get("operation", "")
        if "dry_run" in op:
            typer.echo("🔍 DRY RUN — no se realizaron cambios")
        else:
            typer.echo("✅ Payload vectorizado y registrado en ChromaDB")

        payload_data = data.get("data", {})
        ref = payload_data.get("embedding_ref", "")
        tokens = payload_data.get("tokens_estimated", "?")
        phase = payload_data.get("phase", "?")
        intent = payload_data.get("intent_uuid", "?")

        typer.echo(f"   Intent: {intent}")
        typer.echo(f"   Phase:  {phase}")
        typer.echo(f"   Tokens: ~{tokens}")
        if ref:
            typer.echo(f"   Ref:    {ref}")

    def _render_health(self, data: dict) -> None:
        health_data = data.get("data", {})
        ollama = health_data.get("ollama", {})
        chroma = health_data.get("chroma", {})

        # Ollama
        status = ollama.get("status", "unknown")
        icon = "✅" if status == "ok" else ("⚠️" if status == "model_missing" else "❌")
        typer.echo(f"\n{icon} Ollama: {status}")
        typer.echo(f"   URL:   {ollama.get('ollama_url', '?')}")
        if ollama.get("ollama_exe"):
            typer.echo(f"   Exe:   {ollama.get('ollama_exe')}")
        typer.echo(f"   Model: {ollama.get('model', '?')} — {'disponible' if ollama.get('model_available') else 'NO instalado'}")
        if status == "model_missing":
            from brain.core.bisp.ollama_manager import EMBEDDING_MODEL
            typer.echo(f"   → Ejecutá: ollama pull {EMBEDDING_MODEL}")

        # ChromaDB
        if chroma:
            c_status = chroma.get("status", "unknown")
            c_icon = "✅" if c_status == "ok" else "❌"
            typer.echo(f"\n{c_icon} ChromaDB: {c_status}")
            if c_status == "ok":
                typer.echo(f"   Path:        {chroma.get('chroma_path', '?')}")
                typer.echo(f"   Colecciones: {chroma.get('collections', 0)}")
            else:
                typer.echo(f"   Error: {chroma.get('error', '?')}")
        else:
            typer.echo("\n⚠️  ChromaDB: no verificado (nucleus-path no configurado)")

    def _render_model_info(self, data: dict) -> None:
        d = data.get("data", {})
        available = d.get("available", False)
        icon = "✅" if available else "❌"
        typer.echo(f"\n{icon} Modelo: {d.get('model', '?')}")
        typer.echo(f"   Dimensiones: {d.get('dimensions', '?')}")
        typer.echo(f"   Disponible:  {'sí' if available else 'no'}")
        if d.get("ollama_exe"):
            typer.echo(f"   Ollama exe:  {d.get('ollama_exe')}")
        models = d.get("installed_models", [])
        if models:
            typer.echo(f"   Instalados:  {', '.join(models)}")

    # ------------------------------------------------------------------
    # Error handling
    # ------------------------------------------------------------------

    def _handle_error(self, gc, message: str) -> None:
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)
