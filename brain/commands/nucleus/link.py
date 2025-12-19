"""Nucleus project link command."""
import typer
from pathlib import Path
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory

class NucleusLinkCommand(BaseCommand):
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="link",
            category=CommandCategory.NUCLEUS,
            version="2.0.0",
            description="Link an existing folder as a Nucleus project",
            examples=["brain nucleus link ./existing-nucleus"]
        )
    
    def register(self, app: typer.Typer):
        @app.command("link")
        def link(ctx: typer.Context, path: Path = typer.Argument(..., help="Path to existing project")):
            """Link an existing folder as a Nucleus project."""
            typer.echo("🚧 Link command coming soon")
