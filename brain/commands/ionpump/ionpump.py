# brain/commands/ionpump/ionpump.py
"""
IonPump command group — agrupa inspect, reload, test y validate
bajo el prefijo `brain ionpump <subcomando>`.
"""

import typer

from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class IonPumpCommand(BaseCommand):
    """
    Comando contenedor para el módulo IonPump.

    Registra los subcomandos inspect, reload, test y validate
    bajo un Typer sub-app llamado 'ionpump', de modo que aparezcan
    en el help como:

        brain ionpump inspect
        brain ionpump reload --all
        brain ionpump test <site> <flow> --dry-run
        brain ionpump validate --all
    """

    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="ionpump",
            category=CommandCategory.IONPUMP,
            version="1.0.0",
            description="IonPump site recipe management — inspect, reload, test, validate.",
            examples=[
                "brain ionpump inspect",
                "brain ionpump inspect github.com",
                "brain ionpump reload --all",
                "brain ionpump reload github.com",
                "brain ionpump test github.com bootstrap --dry-run",
                "brain ionpump validate --all --json",
            ],
        )

    def register(self, app: typer.Typer) -> None:
        ionpump_app = typer.Typer(
            name="ionpump",
            help="IonPump site recipe management — inspect, reload, test, validate.",
            no_args_is_help=True,
        )

        # Lazy imports respetando la regla R2 del template
        from brain.commands.ionpump.ionpump_inspect import IonPumpInspectCommand
        from brain.commands.ionpump.ionpump_reload import IonPumpReloadCommand
        from brain.commands.ionpump.ionpump_test import IonPumpTestCommand
        from brain.commands.ionpump.ionpump_validate import IonPumpValidateCommand

        IonPumpInspectCommand().register(ionpump_app)
        IonPumpReloadCommand().register(ionpump_app)
        IonPumpTestCommand().register(ionpump_app)
        IonPumpValidateCommand().register(ionpump_app)

        app.add_typer(ionpump_app, name="ionpump")