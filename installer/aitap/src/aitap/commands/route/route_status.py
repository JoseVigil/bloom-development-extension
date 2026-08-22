import typer

from aitap.cli.base import BaseCommand, CommandMetadata
from aitap.cli.categories import CommandCategory


class RouteStatusCommand(BaseCommand):
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="status",
            category=CommandCategory.ROUTE,
            description="Estado del primer vertical de routing determinístico",
            examples=["aitap route status"],
        )

    def register(self, app: typer.Typer):
        @app.command("status")
        def route_status():
            """
            Informa el alcance materializado. Health dinámico y circuit breaker
            continúan pendientes; la decisión determinística ya está disponible.
            """
            typer.echo("aitap route: deterministic policy genesis-runtime-intelligence/v2 available; dynamic health/circuit-breaker pending")
