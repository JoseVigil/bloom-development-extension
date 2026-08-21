import typer

from aitap.cli.base import BaseCommand, CommandMetadata
from aitap.cli.categories import CommandCategory


class StatusCommand(BaseCommand):
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="status",
            category=CommandCategory.SYSTEM,
            description="Estado de AITAP y sus integraciones pendientes",
            examples=["aitap system status"],
        )

    def register(self, app: typer.Typer):
        @app.command("status")
        def status():
            """Informa el corte implementado sin afirmar integraciones inexistentes."""
            typer.echo(
                "aitap: deterministic runtime + intelligence routing v2 available; providers, dynamic health, "
                "Nucleus Vault and CLIS adapters pending"
            )
