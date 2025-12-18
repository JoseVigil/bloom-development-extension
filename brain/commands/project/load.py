import typer
from pathlib import Path
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory

class ProjectLoadCommand(BaseCommand):
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="load", # Se usará como "brain project load" o alias
            category=CommandCategory.PROJECT,
            version="1.0.0",
            description="Inspect and load project metadata from a path",
            examples=[
                "brain load", # Si registramos alias
                "brain load --path ./my-app"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        # Registramos el comando "load"
        # Idealmente esto debería estar bajo un grupo "project", pero 
        # siguiendo tu arquitectura plana actual, lo expondremos como "load"
        # o "identify". "load" es común para "seleccionar proyecto".
        
        @app.command(name="load", help="Select and inspect a project from path")
        def execute(
            ctx: typer.Context,
            path: Path = typer.Option(
                Path("."), "--path", "-p",
                help="Path to the project root"
            )
        ):
            """
            Validates and loads project information. 
            Returns identity, configuration, and git status.
            """
            
            # 1. Global Context
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                # 2. Lazy Import
                from brain.core.project_manager import ProjectManager
                
                if gc.verbose:
                    typer.echo(f"🔍 Inspecting project at: {path}", err=True)
                
                # 3. Logic
                manager = ProjectManager(path)
                data = manager.load()
                
                # 4. Result Packaging
                response = {
                    "status": "success",
                    "operation": "project_load",
                    "result": data
                }
                
                # 5. Output
                gc.output(response, self._render_human)
                
            except Exception as e:
                if gc.json_mode:
                    import json
                    typer.echo(json.dumps({
                        "status": "error",
                        "message": str(e),
                        "type": type(e).__name__
                    }))
                else:
                    typer.echo(f"❌ Error loading project: {e}", err=True)
                raise typer.Exit(code=1)

    def _render_human(self, data: dict):
        result = data.get("result", {})
        
        typer.echo()
        typer.echo(f"📦 Project: {result.get('name')}")
        typer.echo("=" * 60)
        
        typer.echo(f"📍 Path: {result.get('path')}")
        typer.echo(f"🏷️  Type: {result.get('type').upper()}")
        
        git = result.get('git', {})
        git_icon = "✅" if git.get('is_repo') else "❌"
        typer.echo(f"🐙 Git Repository: {git_icon}")
        
        if result.get('is_bloom_nucleus'):
            typer.echo("🌸 Bloom Nucleus: Detected")
            conf = result.get('config', {})
            if conf.get('organization'):
                 typer.echo(f"   Org: {conf['organization'].get('name')}")
        else:
            typer.echo("⚪ Bloom Nucleus: Not initialized (Use 'brain nucleus' to create)")
            
        if result.get('technologies'):
            techs = ", ".join(result['technologies'])
            typer.echo(f"🛠️  Detected: {techs}")
            
        typer.echo()