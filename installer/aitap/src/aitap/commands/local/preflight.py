from typing import List, Optional

import typer

from aitap.cli import output
from aitap.cli.base import BaseCommand, CommandMetadata
from aitap.cli.categories import CommandCategory
from aitap.local.catalog import CatalogError
from aitap.local.preflight import PreflightError, run_preflight


class LocalPreflightCommand(BaseCommand):
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="preflight",
            category=CommandCategory.LOCAL,
            description="Verificacion previa de solo lectura: perfil de la maquina y veredicto estable por modelo local del catalogo",
            examples=["aitap local preflight", "aitap --json local preflight --model functiongemma-270m"],
        )

    def register(self, app: typer.Typer):
        @app.command("preflight")
        def preflight(ctx: typer.Context,
                      model: Optional[List[str]] = typer.Option(
                          None, "--model", help="model_id del catalogo; repetible. Por defecto, los obligatorios")):
            """No descarga, no instala, no lanza procesos y no escribe archivos."""
            output.log(ctx, "verificacion previa: leyendo perfil de la maquina")
            try:
                data = run_preflight(selection=model)
            except (CatalogError, PreflightError) as exc:
                output.fail(ctx, exc.code, str(exc), stage="preflight")

            def human(result):
                profile = result["stable_profile"]
                typer.echo(f"maquina: {profile['os']} {profile['os_version']} {profile['arch']} · "
                           f"RAM {profile['ram_total_mb']} MB · CPU {' '.join(profile['cpu_features']) or '-'}")
                ollama = profile["ollama"]
                typer.echo(f"ollama: servicio {ollama['service_kind']} {'definido' if ollama['service_defined'] else 'AUSENTE'}"
                           f" · binario {'presente' if ollama['binary_present'] else 'ausente'}"
                           f" · minos {ollama['binary_minos'] or '-'}")
                for verdict in result["verdicts"]:
                    installed = result["readiness"]["models"][verdict["model_id"]]["installed"]
                    state = "instalado" if installed else "no instalado" if installed is False else "instalacion no verificable"
                    typer.echo(f"  {verdict['model_id']:<20} {verdict['verdict']:<20} {state}")
                    if verdict["reasons"]:
                        typer.echo(f"      motivos: {', '.join(verdict['reasons'])}")
                readiness = result["readiness"]
                typer.echo(f"preparacion ({readiness['observed_at']}, ttl {readiness['ttl_seconds']}s): "
                           f"{readiness['state']} {', '.join(readiness['advisories'])}")
                typer.echo(f"huella de elegibilidad: {result['eligibility_fingerprint']}")

            output.emit(ctx, "local.preflight", data, human)
