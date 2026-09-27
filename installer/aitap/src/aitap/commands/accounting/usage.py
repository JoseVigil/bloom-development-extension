import os
from pathlib import Path
from typing import Optional

import typer

from aitap.accounting.usage import UsageError, parse_since, summarize
from aitap.cli import output
from aitap.cli.base import BaseCommand, CommandMetadata
from aitap.cli.categories import CommandCategory


class AccountingUsageCommand(BaseCommand):
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="usage",
            category=CommandCategory.ACCOUNTING,
            description="Agrega el consumo registrado por backend/modelo y consumidor: intentos, tokens, latencia y costo; solo lectura",
            examples=["aitap accounting usage --state-dir <dir>",
                      "aitap --json accounting usage --since 2026-09-01T00:00:00Z --consumer brain"],
        )

    def register(self, app: typer.Typer):
        @app.command("usage")
        def usage(ctx: typer.Context,
                  state_dir: Optional[Path] = typer.Option(None, "--state-dir", help="Directorio de Contabilidad (por defecto AITAP_STATE_DIR)"),
                  since: Optional[str] = typer.Option(None, "--since", help="Solo intentos iniciados desde esta fecha ISO-8601"),
                  consumer: Optional[str] = typer.Option(None, "--consumer", help="Filtra por consumer_id"),
                  backend: Optional[str] = typer.Option(None, "--backend", help="Filtra por backend_id")):
            """Nunca devuelve respuestas crudas ni payloads: solo metricas agregadas."""
            root = state_dir or (Path(os.environ["AITAP_STATE_DIR"]) if os.environ.get("AITAP_STATE_DIR") else None)
            if root is None:
                output.fail(ctx, "STATE_DIR_REQUIRED", "definir --state-dir o AITAP_STATE_DIR", stage="accounting")
            try:
                data = summarize(root, since=parse_since(since), consumer_id=consumer, backend_id=backend)
            except UsageError as exc:
                output.fail(ctx, exc.code, str(exc), stage="accounting")

            def human(result):
                typer.echo(f"journals: {result['journals_scanned']} (invalidos: {result['journals_invalid']})")
                if not result["rows"]:
                    typer.echo("sin consumo registrado para los filtros dados")
                for row in result["rows"]:
                    typer.echo(f"  {row['backend_id']:<34} {row['consumer_id']:<10} ok {row['completed']:>5} "
                               f"err {row['errors']:>4} · in {row['input_tokens']:>9} · out {row['output_tokens']:>8} · "
                               f"p50 {row['latency_ms_p50'] if row['latency_ms_p50'] is not None else '-'} ms · "
                               f"USD {row['cost_usd']}")
                totals = result["totals"]
                typer.echo(f"total: {totals['completed']} completados · {totals['input_tokens']} tok entrada · "
                           f"{totals['output_tokens']} tok salida · USD {totals['cost_usd']}")

            output.emit(ctx, "accounting.usage", data, human)
