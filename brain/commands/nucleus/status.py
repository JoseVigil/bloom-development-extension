"""Nucleus project status check command."""
import typer
from pathlib import Path
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory

class NucleusStatusCommand(BaseCommand):
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="status",
            category=CommandCategory.NUCLEUS,
            version="2.0.0",
            description="Check if a directory is a valid Nucleus project",
            examples=["brain nucleus status --path ./my-nucleus"]
        )
    
    def register(self, app: typer.Typer):
        @app.command("status")
        def status(
            ctx: typer.Context,
            path: Optional[Path] = typer.Option(None, "--path", "-p", help="Project path")
        ):
            """Check if a directory is a valid Nucleus project."""
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                from brain.core.project_manager import ProjectManager
                check_path = path or Path.cwd()
                
                if gc.verbose:
                    typer.echo(f"🔍 Checking status at {check_path}...", err=True)
                
                manager = ProjectManager(check_path)
                data = manager.load()
                is_nucleus = data.get("is_bloom_nucleus", False)
                
                result = {"status": "success", "is_nucleus": is_nucleus, "path": str(check_path)}
                
                if gc.json_mode:
                    import json
                    typer.echo(json.dumps(result))
                else:
                    icon = "✅" if is_nucleus else "❌"
                    typer.echo(f"{icon} Nucleus Status: {'Valid' if is_nucleus else 'Invalid'}")
                
            except Exception as e:
                if gc.json_mode:
                    import json
                    typer.echo(json.dumps({"status": "error", "message": str(e)}))
                else:
                    typer.echo(f"❌ {e}", err=True)
                raise typer.Exit(code=1)
