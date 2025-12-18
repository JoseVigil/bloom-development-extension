import typer
from pathlib import Path
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory

class GenerateCommand(BaseCommand):
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="generate",
            category=CommandCategory.CONTEXT,
            version="2.0.0",
            description="Auto-detect technologies and generate Bloom context files",
            examples=[
                "brain context generate",
                "brain context generate --path ./my-app"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        # Creamos (o recuperamos) el sub-comando de grupo para 'context'
        # NOTA: En la arquitectura actual de discovery plano, esto registrará 'brain generate'
        # Para tener 'brain context generate', deberías tener un __init__.py en commands/context
        # que defina un typer group.
        # Por ahora, registramos como 'context-generate' para evitar colisiones o lo dejamos como 'generate'
        # si asumimos que el usuario lo busca por categoría.
        
        # Vamos a registrarlo como 'generate' dentro de un sub-app si quieres esa estructura,
        # pero para mantenerlo simple y funcionando YA:
        
        @app.command(name="generate", help="Generate Bloom context")
        def execute(
            ctx: typer.Context,
            path: Path = typer.Option(Path("."), "--path", help="Project root"),
            output: str = typer.Option(".bloom", "--output", help="Output folder"),
            strategy: Optional[str] = typer.Option(None, "--strategy", help="Force strategy")
        ):
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                from brain.core.context.manager import ContextManager
                
                if gc.verbose:
                    typer.echo(f"🔍 Starting Context Generation in {path}...", err=True)
                
                manager = ContextManager(path, output)
                result = manager.generate(manual_strategy=strategy)
                
                data = {
                    "status": "success" if result.get('success') else "error",
                    "result": result
                }
                
                gc.output(data, self._render_human)
                
                if not result.get('success'):
                    raise typer.Exit(code=1)
                    
            except Exception as e:
                if gc.json_mode:
                    import json
                    typer.echo(json.dumps({"status": "error", "message": str(e)}))
                else:
                    typer.echo(f"❌ Error: {e}", err=True)
                raise typer.Exit(code=1)

    def _render_human(self, data: dict):
        result = data.get("result", {})
        if not result.get('success'):
            typer.echo(f"❌ Failed: {result.get('error')}")
            return

        typer.echo(f"✅ Context generated at {result.get('primary_stack')}")
        for f in result.get('files_created', []):
            typer.echo(f"   ✓ {f}")