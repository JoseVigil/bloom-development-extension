"""Nucleus project creation command."""
import typer
from pathlib import Path
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory

class NucleusCreateCommand(BaseCommand):
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="create",
            category=CommandCategory.NUCLEUS,
            version="2.0.0",
            description="Initialize a new Bloom Nucleus project structure",
            examples=["brain nucleus create --org myorg --path ./my-nucleus"]
        )
    
    def register(self, app: typer.Typer):
        @app.command("create")
        def create(
            ctx: typer.Context,
            org: str = typer.Option(..., "--org", "-o", help="Organization name"),
            path: Optional[Path] = typer.Option(None, "--path", "-p", help="Target path"),
            output: str = typer.Option(".bloom", "--output", help="Output directory name"),
            url: str = typer.Option("", "--url", help="Organization URL"),
            force: bool = typer.Option(False, "--force", "-f", help="Force overwrite")
        ):
            """Initialize a new Bloom Nucleus project structure."""
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                from brain.core.nucleus_manager import NucleusManager
                target_path = path if path else Path.cwd()
                
                if gc.verbose:
                    typer.echo(f"🔨 Creating Nucleus project for {org} at {target_path}...", err=True)
                
                manager = NucleusManager(target_path)
                result = manager.create(organization_name=org, organization_url=url, output_dir=output)
                result["status"] = "success"
                result["operation"] = "create"
                
                gc.output(result, lambda d: typer.echo(f"✅ Nucleus Created: {d.get('nucleus_name')}"))
                
            except Exception as e:
                if gc.json_mode:
                    import json
                    typer.echo(json.dumps({"status": "error", "message": str(e)}))
                else:
                    typer.echo(f"❌ {e}", err=True)
                raise typer.Exit(code=1)
