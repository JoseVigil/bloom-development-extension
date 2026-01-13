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
                "brain tree -o report.txt --hash src package.json",
                'brain tree --targets "C:\\Users\\AppData\\Local\\bloom-development-extension"'
            ]
        )

    def register(self, app: typer.Typer) -> None:
        @app.command(name=self.metadata().name)
        def execute(
            ctx: typer.Context,
            output: Path = typer.Option(
                Path("tree.txt"),
                "--output", "-o",
                help="Output file path"
            ),
            hash: bool = typer.Option(False, "--hash", help="Include MD5 hashes"),
            export_json: bool = typer.Option(False, "--export-json", help="Export JSON to disk"),
            targets: Optional[List[str]] = typer.Argument(
                None,
                help="Specific directories or files to include (supports absolute paths)."
            ),
        ):
            """
            Generate a visual directory tree structure with intelligent exclusions.
            
            Automatically excludes common dependency folders (node_modules, .git, __pycache__, etc.)
            and detects Python vendored libraries.
            
            Supports both relative and absolute paths in targets.
            """
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                from brain.core.filesystem.tree_manager import TreeManager
                
                # DETERMINAR EL DIRECTORIO BASE
                # Si hay targets y el primero es una ruta absoluta, usarla como base
                base_dir = Path.cwd()
                
                if targets:
                    # Convertir el primer target a Path para verificar si es absoluto
                    first_target = Path(targets[0])
                    
                    if first_target.is_absolute():
                        # Si es absoluto, usar su directorio (o él mismo si es directorio)
                        if first_target.is_dir():
                            base_dir = first_target
                            # Si solo hay un target absoluto, limpiarlo para procesar todo su contenido
                            if len(targets) == 1:
                                targets = None
                            else:
                                # Remover el primer target ya que se convirtió en base
                                targets = targets[1:]
                        else:
                            # Si es un archivo, usar su directorio padre
                            base_dir = first_target.parent
                    
                    # Convertir targets restantes a rutas absolutas si son relativos
                    if targets:
                        resolved_targets = []
                        for t in targets:
                            t_path = Path(t)
                            if t_path.is_absolute():
                                # Verificar que la ruta absoluta esté dentro o sea el base_dir
                                try:
                                    t_path.relative_to(base_dir)
                                    # Es relativo a base_dir, usar como string relativo
                                    resolved_targets.append(str(t_path.relative_to(base_dir)))
                                except ValueError:
                                    # No es relativo a base_dir, esto es un problema
                                    typer.echo(
                                        f"⚠️  Warning: Target '{t}' is not within base directory '{base_dir}'",
                                        err=True
                                    )
                            else:
                                # Es relativo, mantenerlo
                                resolved_targets.append(t)
                        targets = resolved_targets if resolved_targets else None
                
                # DEBUG LOGGING
                if gc.verbose:
                    typer.echo(f"🌲 Generating tree from: {base_dir}", err=True)
                    if targets:
                        typer.echo(f"🎯 Targets: {targets}", err=True)
                    typer.echo(f"📁 Output: {output}", err=True)
                    typer.echo(f"🔒 Hash mode: {hash}", err=True)
                    typer.echo(f"📦 Export JSON: {export_json}", err=True)
                
                # LÓGICA PURA con base_dir dinámico
                manager = TreeManager(base_dir)
                result = manager.generate(
                    targets=targets,
                    output_file=output,
                    use_hash=hash,
                    use_json=export_json
                )
                
                # ESTRUCTURA DE DATOS PURA
                data = {
                    "status": "success",
                    "operation": "tree_generation",
                    "result": {
                        "base_directory": str(base_dir.resolve()),
                        "output_file": str(output.resolve()),
                        "json_file": str(output.with_suffix('.json')) if hash and export_json else None,
                        "statistics": result.get("statistics", {}),
                        "project_hash": result.get("project_hash"),
                        "timestamp": result.get("timestamp"),
                        "targets_processed": targets or ["root"],
                        "hash_enabled": hash,
                        "json_exported": hash and export_json,
                        "warnings": result.get("warnings", [])
                    }
                }
                
                gc.output(data, self._render_human)
                
            except Exception as e:
                if gc.json_mode:
                    import json
                    typer.echo(json.dumps({
                        "status": "error",
                        "message": str(e),
                        "type": type(e).__name__,
                        "operation": "tree_generation"
                    }))
                else:
                    typer.echo(f"❌ Error generating tree: {e}", err=True)
                
                raise typer.Exit(code=1)

    def _render_human(self, data: dict):
        """
        Renderizado visual para terminal humana.
        """
        result = data.get("result", {})
        
        typer.echo("🌳 Tree Generation Complete")
        typer.echo("=" * 70)
        
        # Mostrar directorio base
        typer.echo(f"\n📍 Base directory: {result.get('base_directory', 'N/A')}")
        
        # Warnings
        warnings = result.get('warnings', [])
        if warnings:
            typer.echo("\n⚠️  WARNINGS:")
            for warning in warnings:
                typer.echo(f"   {warning}")
            typer.echo()
        
        typer.echo(f"\n📄 Output file: {result['output_file']}")
        
        if result.get('hash_enabled'):
            typer.echo(f"🔒 Hashing: Enabled")
            if result.get('project_hash'):
                typer.echo(f"   Project Hash: {result['project_hash']}")
        
        if result.get('json_exported') and result.get('json_file'):
            typer.echo(f"📦 JSON export: {result['json_file']}")
        
        stats = result.get('statistics', {})
        if stats:
            typer.echo(f"\n📊 Statistics:")
            if 'total_files' in stats:
                typer.echo(f"   Files: {stats['total_files']}")
            if 'total_directories' in stats:
                typer.echo(f"   Directories: {stats['total_directories']}")
        
        targets = result.get('targets_processed', [])
        if targets != ['root']:
            typer.echo(f"\n🎯 Targets: {', '.join(targets)}")
        
        if warnings:
            typer.echo("\n⚠️  Some paths were not found. Check the output file for details.")
        else:
            typer.echo("\n✅ Tree structure saved successfully!")