"""
BISP — Bloom Intent Semantic Package
commands/bisp/semantic_query.py

CLI Layer para operaciones de consulta semántica BISP.

Subcomandos:
  brain bisp semantic similar   → busca intents/payloads similares a un texto o intent
  brain bisp semantic index     → muestra el .semantic-index.json legible por humanos
  brain bisp semantic retrieve  → recupera el vector de un embedding_ref

Arquitectura: CLI Layer solo. Toda la lógica en core/bisp/.
Contrato: Brain → OllamaManager (vector) → BISPChromaClient (query similitud)
"""

from __future__ import annotations

import typer
from pathlib import Path
from typing import Optional

from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class BISPSemanticQueryCommand(BaseCommand):
    """
    Comandos de consulta semántica BISP.

    Permite a Brain consultar similitud vectorial contra ChromaDB,
    ver el índice semántico del Nucleus, y recuperar embeddings por URI.

    Contrato de orquestación (no violar):
        Brain → OllamaManager → genera vector de la query
        Brain → BISPChromaClient → consulta similitud coseno
        ChromaDB NUNCA llama a Ollama por su cuenta.
    """

    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="semantic",
            category=CommandCategory.BISP,
            version="1.0.0",
            description="Consultas semánticas BISP — similitud vectorial en ChromaDB",
            examples=[
                "brain bisp semantic similar --text 'refactorizar autenticación JWT' --project-uuid bloomaut-dev --bucket payloads",
                "brain bisp semantic similar --intent-uuid dev-refactor-auth-a3f9 --phase briefing --project-uuid bloomaut-dev",
                "brain bisp semantic index --nucleus-path /path/to/Nucleus",
                "brain bisp semantic retrieve --ref 'chroma://nucleus-org/dev-refactor-auth-a3f9/briefing' --project-uuid bloomaut-dev",
            ],
        )

    def register(self, app: typer.Typer) -> None:
        """Registra subgrupo 'semantic' con sus subcomandos."""
        sem_app = typer.Typer(help="Consultas semánticas BISP — similitud vectorial")

        # ----------------------------------------------------------------
        # Subcomando: similar
        # ----------------------------------------------------------------
        @sem_app.command(name="similar")
        def semantic_similar(
            ctx: typer.Context,
            text: Optional[str] = typer.Option(
                None, "--text", "-t",
                help="Texto libre a vectorizar y buscar similares.",
            ),
            intent_uuid: Optional[str] = typer.Option(
                None, "--intent-uuid", "-u",
                help="UUID del intent cuyo embedding se usa como query.",
            ),
            phase: Optional[str] = typer.Option(
                None, "--phase", "-p",
                help="Fase del intent a usar como query (requiere --intent-uuid).",
            ),
            project_uuid: str = typer.Option(
                ..., "--project-uuid",
                help="UUID del proyecto donde buscar.",
            ),
            bucket: str = typer.Option(
                "payloads", "--bucket", "-b",
                help="Bucket de búsqueda: objectives | payloads | findings. Default: payloads.",
            ),
            n_results: int = typer.Option(
                10, "--n-results", "-n",
                help="Número máximo de resultados.",
            ),
            threshold: float = typer.Option(
                0.40, "--threshold",
                help="Score mínimo de similitud (0.0-1.0). Default: 0.40.",
            ),
            nucleus_path: Optional[Path] = typer.Option(
                None, "--nucleus-path",
                help="Path al Nucleus. Default: desde GlobalContext.",
            ),
            nucleus_json: Optional[Path] = typer.Option(
                None, "--nucleus-json",
                help="Path explícito al nucleus.json (para localizar Ollama exe).",
            ),
        ):
            """
            Busca intents/payloads semánticamente similares a un texto o intent.

            Acepta como query:
              --text          → texto libre (se vectoriza con Ollama)
              --intent-uuid + --phase → usa el embedding ya almacenado en ChromaDB

            Contrato de orquestación:
              Brain → OllamaManager → vector
              Brain → BISPChromaClient → similitud coseno
            """
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()

            # Validar que hay exactamente una fuente de query
            if not text and not intent_uuid:
                self._handle_error(
                    gc,
                    "Requerido: --text O --intent-uuid (con --phase).",
                )
            if intent_uuid and not phase:
                self._handle_error(
                    gc,
                    "--phase es requerido cuando se usa --intent-uuid como query.",
                )
            if text and intent_uuid:
                self._handle_error(
                    gc,
                    "Usá --text O --intent-uuid, no ambos.",
                )

            try:
                from brain.core.bisp.ollama_manager import OllamaManager
                from brain.core.bisp.chroma_client import BISPChromaClient

                resolved_nucleus = nucleus_path or getattr(gc, "nucleus_path", None)
                if not resolved_nucleus:
                    self._handle_error(
                        gc,
                        "nucleus-path requerido. Pasalo con --nucleus-path o configuralo en GlobalContext.",
                    )

                # Resolver OllamaManager con el exe del Nucleus
                if nucleus_json and nucleus_json.exists():
                    ollama = OllamaManager.from_nucleus_json(nucleus_json)
                else:
                    candidate_json = Path(resolved_nucleus) / "nucleus.json"
                    if candidate_json.exists():
                        ollama = OllamaManager.from_nucleus_json(candidate_json)
                    else:
                        ollama = OllamaManager.from_nucleus_path(resolved_nucleus)

                chroma = BISPChromaClient(resolved_nucleus)

                # Obtener el vector de query
                if text:
                    if gc.verbose:
                        typer.echo(f"🔍 Vectorizando texto con Ollama...", err=True)
                    query_vector = ollama.generate_embedding(text)
                    query_source = f"text: {text[:60]}{'...' if len(text) > 60 else ''}"
                else:
                    # Recuperar embedding almacenado del intent/phase
                    if gc.verbose:
                        typer.echo(
                            f"🔍 Recuperando embedding de {intent_uuid}/{phase}...",
                            err=True,
                        )
                    embedding_ref = chroma.build_embedding_ref(f"{intent_uuid}/{phase}")
                    query_vector = chroma.retrieve_embedding(
                        embedding_ref=embedding_ref,
                        project_uuid=project_uuid,
                        bucket=bucket,
                    )
                    if query_vector is None:
                        self._handle_error(
                            gc,
                            f"No se encontró embedding para {intent_uuid}/{phase} en bucket '{bucket}'. "
                            f"¿Ya fue vectorizado? Ejecutá: brain bisp vectorize payload --intent-uuid {intent_uuid} --phase {phase}",
                        )
                    query_source = f"intent: {intent_uuid}/{phase}"

                if gc.verbose:
                    typer.echo(
                        f"   Buscando en project={project_uuid}, bucket={bucket}, "
                        f"n={n_results}, threshold={threshold}",
                        err=True,
                    )

                results = chroma.query_similar(
                    project_uuid=project_uuid,
                    bucket=bucket,
                    query_embedding=query_vector,
                    n_results=n_results,
                    threshold=threshold,
                )

                result = {
                    "status": "success",
                    "operation": "semantic_similar",
                    "data": {
                        "query_source": query_source,
                        "project_uuid": project_uuid,
                        "bucket": bucket,
                        "threshold": threshold,
                        "total_results": len(results),
                        "results": results,
                    },
                }

                gc.output(result, self._render_similar_results)

            except Exception as exc:
                self._handle_error(gc, str(exc))

        # ----------------------------------------------------------------
        # Subcomando: index
        # ----------------------------------------------------------------
        @sem_app.command(name="index")
        def semantic_index(
            ctx: typer.Context,
            nucleus_path: Optional[Path] = typer.Option(
                None, "--nucleus-path", "-n",
                help="Path al Nucleus. Default: desde GlobalContext.",
            ),
            intent_uuid: Optional[str] = typer.Option(
                None, "--intent-uuid", "-u",
                help="Filtra la vista al intent indicado.",
            ),
            project_uuid: Optional[str] = typer.Option(
                None, "--project-uuid",
                help="Filtra por proyecto.",
            ),
        ):
            """
            Muestra el .semantic-index.json — snapshot legible del estado de ChromaDB.

            Este archivo es el índice de auditoría de lo que Brain ha vectorizado.
            La fuente de verdad es ChromaDB; este índice es legible por humanos.
            """
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()

            try:
                from brain.core.bisp.chroma_client import BISPChromaClient

                resolved_nucleus = nucleus_path or getattr(gc, "nucleus_path", None)
                if not resolved_nucleus:
                    self._handle_error(
                        gc,
                        "nucleus-path requerido. Pasalo con --nucleus-path o configuralo en GlobalContext.",
                    )

                chroma = BISPChromaClient(resolved_nucleus)
                index = chroma.get_semantic_index()

                # Aplicar filtros opcionales
                if intent_uuid:
                    if intent_uuid in index:
                        index = {intent_uuid: index[intent_uuid]}
                    else:
                        index = {}

                if project_uuid and not intent_uuid:
                    index = {
                        k: v for k, v in index.items()
                        if v.get("project_uuid") == project_uuid
                    }

                result = {
                    "status": "success",
                    "operation": "semantic_index",
                    "data": {
                        "nucleus_path": str(resolved_nucleus),
                        "total_intents": len(index),
                        "index": index,
                        "filter_intent": intent_uuid,
                        "filter_project": project_uuid,
                    },
                }

                gc.output(result, self._render_index)

            except Exception as exc:
                self._handle_error(gc, str(exc))

        # ----------------------------------------------------------------
        # Subcomando: retrieve
        # ----------------------------------------------------------------
        @sem_app.command(name="retrieve")
        def semantic_retrieve(
            ctx: typer.Context,
            ref: str = typer.Option(
                ..., "--ref", "-r",
                help="embedding_ref URI. Formato: chroma://{nucleus}/{intent}/{phase}",
            ),
            project_uuid: str = typer.Option(
                ..., "--project-uuid",
                help="UUID del proyecto para resolver la colección ChromaDB.",
            ),
            bucket: str = typer.Option(
                "payloads", "--bucket", "-b",
                help="Bucket donde está almacenado: objectives | payloads | findings.",
            ),
            nucleus_path: Optional[Path] = typer.Option(
                None, "--nucleus-path", "-n",
                help="Path al Nucleus. Default: desde GlobalContext.",
            ),
            show_vector: bool = typer.Option(
                False, "--show-vector",
                help="Muestra los primeros 10 valores del vector (para debug).",
            ),
        ):
            """
            Recupera y verifica un embedding desde su URI chroma://.

            Parsea el embedding_ref, resuelve colección + doc_id,
            y confirma que el vector existe en ChromaDB.

            Formato de URI:
                chroma://nucleus-org/dev-refactor-auth-a3f9/briefing
            """
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()

            try:
                from brain.core.bisp.chroma_client import BISPChromaClient, EMBEDDING_DIM

                resolved_nucleus = nucleus_path or getattr(gc, "nucleus_path", None)
                if not resolved_nucleus:
                    self._handle_error(
                        gc,
                        "nucleus-path requerido. Pasalo con --nucleus-path o configuralo en GlobalContext.",
                    )

                chroma = BISPChromaClient(resolved_nucleus)

                # Validar y parsear la URI antes de intentar recuperar
                parsed = chroma.resolve_embedding_ref(ref)

                if gc.verbose:
                    typer.echo(f"🔍 Recuperando embedding...", err=True)
                    typer.echo(f"   Ref:      {ref}", err=True)
                    typer.echo(f"   doc_id:   {parsed['doc_id']}", err=True)
                    typer.echo(f"   Nucleus:  {parsed['nucleus_name']}", err=True)
                    typer.echo(f"   Bucket:   {bucket}", err=True)

                vector = chroma.retrieve_embedding(
                    embedding_ref=ref,
                    project_uuid=project_uuid,
                    bucket=bucket,
                )

                found = vector is not None
                preview = None
                if found and show_vector:
                    preview = vector[:10]

                result = {
                    "status": "success",
                    "operation": "semantic_retrieve",
                    "data": {
                        "embedding_ref": ref,
                        "doc_id": parsed["doc_id"],
                        "nucleus_name": parsed["nucleus_name"],
                        "project_uuid": project_uuid,
                        "bucket": bucket,
                        "found": found,
                        "dimensions": len(vector) if found else None,
                        "expected_dimensions": EMBEDDING_DIM,
                        "vector_preview": preview,
                    },
                }

                gc.output(result, self._render_retrieve)

            except ValueError as exc:
                # URI mal formada
                self._handle_error(gc, f"embedding_ref inválido: {exc}")
            except Exception as exc:
                self._handle_error(gc, str(exc))

        app.add_typer(sem_app, name="semantic")

    # ------------------------------------------------------------------
    # Renderers (output humano)
    # ------------------------------------------------------------------

    def _render_similar_results(self, data: dict) -> None:
        d = data.get("data", {})
        query_source = d.get("query_source", "?")
        total = d.get("total_results", 0)
        bucket = d.get("bucket", "?")
        threshold = d.get("threshold", 0.40)
        results = d.get("results", [])

        typer.echo(f"\n🔍 Query: {query_source}")
        typer.echo(f"   Bucket: {bucket} | Threshold: {threshold} | Resultados: {total}")

        if not results:
            typer.echo("\n   ⚠️  Sin resultados por encima del threshold.")
            typer.echo(f"   Intentá bajar --threshold (actual: {threshold}) o verificar que hay payloads vectorizados.")
            return

        typer.echo("")
        for i, r in enumerate(results, 1):
            score = r.get("similarity_score", 0)
            doc_id = r.get("id", "?")
            ref = r.get("embedding_ref", "")
            doc_preview = r.get("document", "")[:80]
            meta = r.get("metadata", {})

            # Barra visual de score
            bar_len = int(score * 20)
            bar = "█" * bar_len + "░" * (20 - bar_len)

            typer.echo(f"  {i:2}. [{bar}] {score:.4f}")
            typer.echo(f"      id:  {doc_id}")
            if ref:
                typer.echo(f"      ref: {ref}")
            if doc_preview:
                typer.echo(f"      doc: {doc_preview}{'...' if len(r.get('document','')) > 80 else ''}")
            if meta:
                # Mostrar metadata relevante si existe
                phase = meta.get("phase") or meta.get("intent_phase")
                if phase:
                    typer.echo(f"      phase: {phase}")
            typer.echo("")

    def _render_index(self, data: dict) -> None:
        d = data.get("data", {})
        nucleus = d.get("nucleus_path", "?")
        total = d.get("total_intents", 0)
        index = d.get("index", {})
        filter_intent = d.get("filter_intent")
        filter_project = d.get("filter_project")

        typer.echo(f"\n📚 Semantic Index — {nucleus}")
        if filter_intent:
            typer.echo(f"   Filtro intent: {filter_intent}")
        if filter_project:
            typer.echo(f"   Filtro proyecto: {filter_project}")
        typer.echo(f"   Intents indexados: {total}\n")

        if not index:
            typer.echo("   ⚠️  Índice vacío o filtro sin coincidencias.")
            typer.echo("   Ejecutá 'brain bisp vectorize payload' para indexar payloads.")
            return

        for intent_uuid, intent_data in index.items():
            project = intent_data.get("project_uuid", "?")
            phases = intent_data.get("phases", {})
            typer.echo(f"  📌 {intent_uuid}")
            typer.echo(f"     Proyecto: {project} | Fases indexadas: {len(phases)}")

            for phase_name, phase_data in phases.items():
                ref = phase_data.get("embedding_ref", "?")
                model = phase_data.get("model", "?")
                embedded_at = phase_data.get("embedded_at", "")
                typer.echo(f"     ├── {phase_name}")
                typer.echo(f"     │   ref:   {ref}")
                typer.echo(f"     │   model: {model}")
                if embedded_at:
                    typer.echo(f"     │   at:    {embedded_at}")

            typer.echo("")

    def _render_retrieve(self, data: dict) -> None:
        d = data.get("data", {})
        ref = d.get("embedding_ref", "?")
        found = d.get("found", False)
        doc_id = d.get("doc_id", "?")
        dims = d.get("dimensions")
        expected = d.get("expected_dimensions", 768)
        preview = d.get("vector_preview")

        icon = "✅" if found else "❌"
        typer.echo(f"\n{icon} Embedding: {ref}")
        typer.echo(f"   doc_id:  {doc_id}")
        typer.echo(f"   Nucleus: {d.get('nucleus_name', '?')}")
        typer.echo(f"   Bucket:  {d.get('bucket', '?')}")

        if found:
            dim_ok = dims == expected
            dim_icon = "✅" if dim_ok else "⚠️"
            typer.echo(f"   {dim_icon} Dimensiones: {dims} (esperado: {expected})")
            if preview:
                preview_str = ", ".join(f"{v:.4f}" for v in preview)
                typer.echo(f"   Vector[0:10]: [{preview_str}, ...]")
        else:
            typer.echo(f"   ❌ No encontrado en ChromaDB.")
            typer.echo(
                f"   → Verificá que fue vectorizado: "
                f"brain bisp vectorize payload --intent-uuid {doc_id.split('/')[0] if '/' in doc_id else doc_id}"
            )

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
