import json

import typer

from aitap import __version__
from aitap import _build_info
from aitap.cli.base import BaseCommand, CommandMetadata
from aitap.cli.categories import CommandCategory


class VersionCommand(BaseCommand):
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="version",
            category=CommandCategory.SYSTEM,
            description="Muestra la version instalada de AITap",
            examples=["aitap system version", "aitap --json system version"],
        )

    def register(self, app: typer.Typer):
        @app.command("version")
        def version(ctx: typer.Context):
            """Muestra la version instalada de AITap.

            Con --json (global) devuelve el mismo contrato que Impact/Monitor/
            Metamorph: {name, version, build_number, build_date, build_time,
            full_version}, para que metamorph inspect pueda interrogar a AITap
            igual que al resto de los binarios administrados.
            """
            json_mode = bool(getattr(ctx.obj, "json_mode", False))
            build_number = _build_info.BUILD_NUMBER
            full_version = f"v{__version__}-build.{build_number}"

            if json_mode:
                data = {
                    "name": "AITap",
                    "version": __version__,
                    "build_number": build_number,
                    "build_date": _build_info.BUILD_DATE,
                    "build_time": _build_info.BUILD_TIME,
                    "full_version": full_version,
                }
                typer.echo(json.dumps(data))
                return

            typer.echo(f"AITap {full_version}")
            typer.echo(f"Build: {build_number}")
            if _build_info.BUILD_DATE:
                typer.echo(f"Date: {_build_info.BUILD_DATE}")
            if _build_info.BUILD_TIME:
                typer.echo(f"Time: {_build_info.BUILD_TIME}")
