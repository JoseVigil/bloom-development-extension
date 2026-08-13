import typer

from aitap import __version__
from aitap.cli.base import BaseCommand, CommandMetadata
from aitap.cli.categories import CommandCategory


class VersionCommand(BaseCommand):
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="version",
            category=CommandCategory.SYSTEM,
            description="Muestra la version instalada de AITap",
            examples=["aitap system version"],
        )

    def register(self, app: typer.Typer):
        @app.command("version")
        def version():
            """Muestra la version instalada de AITap."""
            typer.echo(f"aitap v{__version__}")
