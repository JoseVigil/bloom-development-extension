from typing import List, Optional

import typer

from aitap.cli import output
from aitap.cli.base import BaseCommand, CommandMetadata
from aitap.cli.categories import CommandCategory
from aitap.health.probes import COMPONENTS, HealthError, run_health


class HealthCheckCommand(BaseCommand):
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="check",
            category=CommandCategory.HEALTH,
            description="Sondea en vivo las dependencias de AITAP (directorio de estado y prerrequisitos de Nucleus); solo lectura",
            examples=["aitap health check", "aitap --json health check --component nucleus"],
        )

    def register(self, app: typer.Typer):
        @app.command("check")
        def check(ctx: typer.Context,
                  component: Optional[List[str]] = typer.Option(
                      None, "--component", help=f"Componente a sondear ({', '.join(COMPONENTS)}); repetible")):
            """Una sonda no saludable no es un error del comando: se informa en 'overall' con exit 0."""
            try:
                data = run_health(component)
            except HealthError as exc:
                output.fail(ctx, exc.code, str(exc), stage="health")

            def human(result):
                typer.echo(f"overall: {result['overall']}")
                for item in result["components"]:
                    typer.echo(f"  {item['component']:<8} {item['state']}")
                    for probe in item["checks"]:
                        detail = f" — {probe['detail']}" if probe["detail"] else ""
                        typer.echo(f"      [{'ok' if probe['ok'] else '--'}] {probe['name']}{detail}")

            output.emit(ctx, "health.check", data, human)
