import typer
from pathlib import Path
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory

class ContextCommand(BaseCommand):
    """
    Comando para la generación y gestión del contexto del proyecto.
    """
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="context",  # ✅ NOMBRE DEFINITIVO: Sustantivo
            category=CommandCategory.CONTEXT,
            version="2.0.0",
            description="Generate the Bloom Context (technical knowledge base) for the project",
            examples=[
                "brain context",
                "brain context --path ./my-app",
                "brain context --strategy android --output .bloom-test"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        @app.command(name=self.metadata().name)
        def execute(
            ctx: typer.Context,
            path: Path = typer.Option(
                Path("."), "--path", "-p",
                help="Root path of the project to analyze"
            ),
            output: str = typer.Option(
                ".bloom", "--output", "-o",
                help="Output folder name for the generated context"
            ),
            strategy: Optional[str] = typer.Option(
                None, "--strategy", "-s",
                help="Force a specific strategy (android, php, python, generic...)"
            )
        ):
            """
            Analyzes the project structure to generate the Bloom Context.
            
            Detects technologies automatically (Multi-stack support) and creates
            the necessary .bl files for the AI to understand the project.
            """
            
            # 1. SAFETY CHECK (Global Context)
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                # 2. LAZY IMPORT
                from brain.core.context.manager import ContextManager
                
                # 3. VERBOSE LOGGING
                if gc.verbose:
                    typer.echo(f"🔍 Starting Context Generation...", err=True)
                    typer.echo(f"   Target Path: {path}", err=True)
                    typer.echo(f"   Output Dir: {output}", err=True)
                    if strategy:
                        typer.echo(f"   Forced Strategy: {strategy}", err=True)
                
                # 4. LÓGICA PURA (Manager)
                manager = ContextManager(path, output)
                result = manager.generate(manual_strategy=strategy)
                
                # 5. DATA PACKAGING
                data = {
                    "status": "success" if result.get('success') else "error",
                    "operation": "generate_context",
                    "result": result
                }
                
                # 6. SALIDA INTELIGENTE
                gc.output(data, self._render_human)
                
                if not result.get('success'):
                    raise typer.Exit(code=1)
                
            except Exception as e:
                # Manejo de errores JSON-Friendly
                if gc.json_mode:
                    import json
                    typer.echo(json.dumps({
                        "status": "error",
                        "message": str(e),
                        "type": type(e).__name__
                    }))
                else:
                    typer.echo(f"❌ Error generating context: {e}", err=True)
                raise typer.Exit(code=1)

    def _render_human(self, data: dict):
        """Renderizado bonito para terminal humana"""
        result = data.get("result", {})
        
        if not result.get('success'):
            typer.echo(f"❌ Generation failed: {result.get('error')}")
            return

        typer.echo()
        typer.echo("🧠 Bloom Context Generated")
        typer.echo("=" * 60)
        
        # Stack Detectado
        strategies = result.get('strategies_detected', [])
        primary = result.get('primary_stack', 'generic')
        
        if strategies:
            stack_list = ", ".join([s.upper() for s in strategies])
            typer.echo(f"✅ Stack Detected: {stack_list}")
        else:
            typer.echo(f"⚠️  Using Generic Strategy ({primary})")
            
        typer.echo(f"📊 Modules Analyzed: {result.get('modules_analyzed', 0)}")
        
        # Archivos Generados
        files = result.get('files_created', [])
        if files:
            typer.echo("\n📝 Files Created:")
            for f in files:
                typer.echo(f"   ✓ {f}")
        
        typer.echo("\n✨ Knowledge base updated successfully!")