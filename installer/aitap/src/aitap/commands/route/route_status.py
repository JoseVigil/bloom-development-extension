import typer

from aitap.cli.base import BaseCommand, CommandMetadata
from aitap.cli.categories import CommandCategory


class RouteStatusCommand(BaseCommand):
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="status",
            category=CommandCategory.ROUTE,
            description="Estado del ruteo entre proveedores y del circuit breaker (placeholder)",
            examples=["aitap route status"],
        )

    def register(self, app: typer.Typer):
        @app.command("status")
        def route_status():
            """
            Placeholder: aca vivira el estado del circuit breaker inter-proveedor
            (que proveedor esta activo, cuales estan en cooldown por cuota agotada
            o errores, y la politica de fallback configurada). No implementado.
            """
            typer.echo("aitap route status: no implementado todavia. Motor de ruteo inter-proveedor pendiente.")
