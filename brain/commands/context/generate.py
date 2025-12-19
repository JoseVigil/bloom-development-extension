"""Context generation command."""
import typer
from pathlib import Path
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory

class ContextGenerateCommand(BaseCommand):
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="generate",
            category=CommandCategory.CONTEXT,
            version="2.0.0",
            description="Generate the Bloom Context for the project",
            examples=["brain context generate --path ./my-app"]
        )
    
    def register(self, app: typer.Typer):
        @app.command("generate")
        def execute(
            ctx: typer.Context,
            path: Path = typer.Option(Path("."), "--path", "-p", help="Root path of the project"),
            output: str = typer.Option(".bloom", "--output", "-o", help="Output folder name"),
            strategy: Optional[str] = typer.Option(None, "--strategy", "-s", help="Force specific strategy")
        ):
            """Generate the Bloom Context for the project."""
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                from brain.core.context.manager import ContextManager
                
                if gc.verbose:
                    typer.echo(f"🔍 Starting Context Generation at {path}...", err=True)
                
                manager = ContextManager(path, output)
                result = manager.generate(manual_strategy=strategy)
                
                data = {"status": "success" if result.get('success') else "error", "result": result}
                
                if gc.json_mode:
                    import json
                    typer.echo(json.dumps(data))
                else:
                    if result.get('success'):
                        typer.echo(f"✅ Context Generated: {result.get('modules_analyzed', 0)} modules")
                    else:
                        typer.echo(f"❌ Generation failed: {result.get('error')}")
                
                if not result.get('success'):
                    raise typer.Exit(code=1)
                    
            except Exception as e:
                if gc.json_mode:
                    import json
                    typer.echo(json.dumps({"status": "error", "message": str(e)}))
                else:
                    typer.echo(f"❌ {e}", err=True)
                raise typer.Exit(code=1)
