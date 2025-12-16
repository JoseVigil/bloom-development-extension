"""
Comando Tree - Genera árbol de directorios
"""
import typer
from pathlib import Path
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class TreeCommand(BaseCommand):
    """Comando para generar árbol de directorios"""
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="tree",
            category=CommandCategory.FILESYSTEM,
            version="1.0.0",
            description="Genera árbol de directorios del proyecto",
            examples=[
                "python -m brain tree --out tree.txt",
                "python -m brain tree --enriched --out enriched.txt"
            ]
        )
    
    def register(self, app: typer.Typer) -> None:
        @app.command(name="tree")
        def tree_command(
            out: str = typer.Option("tree.txt", "--out", "-o", help="Archivo de salida"),
            enriched: bool = typer.Option(False, "--enriched", help="Generar árbol enriquecido")
        ):
            """Genera árbol de directorios del proyecto"""
            try:
                # Importar desde core (legacy)
                from core.filesystem.tree_manager import TreeManager
                
                manager = TreeManager(Path.cwd())
                
                if enriched:
                    typer.echo("🔍 Generando árbol enriquecido...")
                    tree = manager.generate_enriched()
                else:
                    typer.echo("🌲 Generando árbol estándar...")
                    tree = manager.generate_standard()
                
                # Guardar resultado
                Path(out).write_text(tree, encoding='utf-8')
                typer.echo(f"✅ Árbol generado: {out}")
                
            except ImportError as e:
                typer.echo(f"❌ Error: No se pudo importar TreeManager desde core/", err=True)
                typer.echo(f"   Detalle: {e}", err=True)
                raise typer.Exit(1)
            except Exception as e:
                typer.echo(f"❌ Error generando árbol: {e}", err=True)
                raise typer.Exit(1)