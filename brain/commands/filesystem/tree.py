import typer
from pathlib import Path
from typing import List, Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class TreeCommand(BaseCommand):
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="tree",
            category=CommandCategory.FILESYSTEM,
            version="1.0.0",
            description="Generate visual tree structure with optional MD5 hashing and JSON export",
            examples=[
                "brain tree",
                "brain tree --targets src tests",
                "brain tree --hash --export-json",
                "brain tree --output custom-tree.txt",
                "brain tree -o report.txt --hash src package.json"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        @app.command(name=self.metadata().name)
        def execute(
            ctx: typer.Context,
            # Mover las opciones ANTES del argumento de lista suele ser más seguro en CLI complejos
            output: Path = typer.Option(
                Path("tree.txt"),
                "--output", "-o",
                help="Output file path"
            ),
            hash: bool = typer.Option(False, "--hash", help="Include MD5 hashes"),
            # Renombrado para evitar conflictos con el flag global --json
            export_json: bool = typer.Option(False, "--export-json", help="Export JSON to disk"),
            # El argumento lista al final
            targets: Optional[List[str]] = typer.Argument(
                None,
                help="Specific directories or files to include."
            ),
        ):
            """
            Generate a visual directory tree structure with intelligent exclusions.
            
            Automatically excludes common dependency folders (node_modules, .git, __pycache__, etc.)
            and detects Python vendored libraries.
            """
            # Recuperar contexto de forma segura
            gc = ctx.obj
            if gc is None:
                # Fallback de emergencia por si el callback falló o se corre directo
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                # LAZY IMPORT para inicio rápido
                from brain.core.tree_manager import TreeManager
                
                # DEBUG LOGGING
                if gc.verbose:
                    typer.echo(f"🔍 Generating tree from: {Path.cwd()}", err=True)
                    if targets:
                        typer.echo(f"🎯 Targets: {targets}", err=True)
                    typer.echo(f"📝 Output: {output}", err=True)
                    typer.echo(f"🔐 Hash mode: {hash}", err=True)
                    typer.echo(f"📦 Export JSON: {export_json}", err=True)
                
                # LÓGICA PURA
                manager = TreeManager(Path.cwd())
                result = manager.generate(
                    targets=targets,
                    output_file=output,
                    use_hash=hash,
                    use_json=export_json  # Variable corregida aquí
                )
                
                # ESTRUCTURA DE DATOS PURA (Para VS Code / Integraciones)
                data = {
                    "status": "success",
                    "operation": "tree_generation",
                    "result": {
                        "output_file": str(output.resolve()),
                        "json_file": str(output.with_suffix('.json')) if hash and export_json else None,
                        "statistics": result.get("statistics", {}),
                        "project_hash": result.get("project_hash"),
                        "timestamp": result.get("timestamp"),
                        "targets_processed": targets or ["root"],
                        "hash_enabled": hash,
                        "json_exported": hash and export_json,
                        "warnings": result.get("warnings", [])  # NEW: Include warnings
                    }
                }
                
                # SALIDA INTELIGENTE (Decide si renderizar texto o imprimir JSON crudo)
                gc.output(data, self._render_human)
                
            except Exception as e:
                # MANEJO DE ERRORES CENTRALIZADO
                if gc.json_mode:
                    import json
                    # Error formateado para máquina
                    typer.echo(json.dumps({
                        "status": "error",
                        "message": str(e),
                        "type": type(e).__name__,
                        "operation": "tree_generation"
                    }))
                else:
                    # Error para humano
                    typer.echo(f"❌ Error generating tree: {e}", err=True)
                
                raise typer.Exit(code=1)

    def _render_human(self, data: dict):
        """
        Renderizado visual para terminal humana.
        Mantiene el estilo del script original con mejoras visuales.
        """
        result = data.get("result", {})
        
        # Header con emoji
        typer.echo("🌳 Tree Generation Complete")
        typer.echo("=" * 70)
        
        # NEW: Show warnings first if any
        warnings = result.get('warnings', [])
        if warnings:
            typer.echo("\n⚠️  WARNINGS:")
            for warning in warnings:
                typer.echo(f"   {warning}")
            typer.echo()
        
        # Información principal
        typer.echo(f"\n📄 Output file: {result['output_file']}")
        
        if result.get('hash_enabled'):
            typer.echo(f"🔐 Hashing: Enabled")
            if result.get('project_hash'):
                typer.echo(f"   Project Hash: {result['project_hash']}")
        
        if result.get('json_exported') and result.get('json_file'):
            typer.echo(f"📦 JSON export: {result['json_file']}")
        
        # Estadísticas
        stats = result.get('statistics', {})
        if stats:
            typer.echo(f"\n📊 Statistics:")
            if 'total_files' in stats:
                typer.echo(f"   Files: {stats['total_files']}")
            if 'total_directories' in stats:
                typer.echo(f"   Directories: {stats['total_directories']}")
        
        # Targets procesados
        targets = result.get('targets_processed', [])
        if targets != ['root']:
            typer.echo(f"\n🎯 Targets: {', '.join(targets)}")
        
        if warnings:
            typer.echo("\n⚠️  Some paths were not found. Check the output file for details.")
        else:
            typer.echo("\n✅ Tree structure saved successfully!")
