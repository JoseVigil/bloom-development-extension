import json
import platform

import typer

from aitap import __version__
from aitap import _build_info
from aitap.cli.base import BaseCommand, CommandMetadata
from aitap.cli.categories import CommandCategory


class InfoCommand(BaseCommand):
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="info",
            category=CommandCategory.SYSTEM,
            description="Muestra informacion detallada del sistema para AITap",
            examples=["aitap system info", "aitap --json system info"],
        )

    def register(self, app: typer.Typer):
        @app.command("info")
        def info(ctx: typer.Context):
            """Muestra informacion detallada del sistema para AITap.

            Mismo contrato que Impact/Monitor (name, version, build_number,
            os, arch, ademas de python_version en vez de go_version), para que
            metamorph inspect tenga un segundo punto de interrogacion ademas
            de `version` si el primero fallara.
            """
            json_mode = bool(getattr(ctx.obj, "json_mode", False))
            data = {
                "name": "AITap",
                "version": __version__,
                "build_number": _build_info.BUILD_NUMBER,
                "os": platform.system().lower(),
                "arch": platform.machine().lower(),
                "python_version": platform.python_version(),
            }

            if json_mode:
                typer.echo(json.dumps(data))
                return

            typer.echo(f"Name        : {data['name']}")
            typer.echo(f"Version     : {data['version']} (build {data['build_number']})")
            typer.echo(f"OS / Arch   : {data['os']} / {data['arch']}")
            typer.echo(f"Python      : {data['python_version']}")
