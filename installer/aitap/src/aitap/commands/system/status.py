import typer

from aitap.cli.base import BaseCommand, CommandMetadata
from aitap.cli.categories import CommandCategory


class StatusCommand(BaseCommand):
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="status",
            category=CommandCategory.SYSTEM,
            description="Estado del servicio AITap (placeholder — todavia no conectado a nucleus health)",
            examples=["aitap system status"],
        )

    def register(self, app: typer.Typer):
        @app.command("status")
        def status():
            """Placeholder: confirma que el scaffold corre, sin logica de ruteo/vault todavia."""
            typer.echo(
                "aitap: scaffold OK. Sin motor de ruteo ni conexion a Nucleus Vault todavia — "
                "pendiente cuando encaremos el primer intent real."
            )
