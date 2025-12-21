"""Nucleus delete command - Delete a complete nucleus."""
import typer
from pathlib import Path
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class NucleusDeleteCommand(BaseCommand):
    """
    Command to delete a complete nucleus and all its data.
    Requires confirmation unless --force is used.
    """
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="delete",
            category=CommandCategory.NUCLEUS,
            version="1.0.0",
            description="Delete a complete nucleus",
            examples=[
                "brain nucleus delete --nucleus-path ~/projects/old-nucleus",
                "brain nucleus delete --nucleus-path ./my-nucleus --force"
            ]
        )
    
    def register(self, app: typer.Typer) -> None:
        """Register the nucleus delete command."""
        @app.command(name=self.metadata().name)
        def execute(
            ctx: typer.Context,
            nucleus_path: Path = typer.Option(
                ...,
                "--nucleus-path",
                "-p",
                help="Path to the Nucleus root directory to delete"
            ),
            force: bool = typer.Option(
                False,
                "--force",
                "-f",
                help="Skip confirmation prompt"
            )
        ):
            """
            Delete a complete nucleus including all its data.
            
            This removes the entire .bloom/.nucleus-* directory
            and all its contents (intents, cache, findings, etc.).
            
            WARNING: This action is irreversible!
            """
            # 1. Recuperar GlobalContext
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                nucleus_path = nucleus_path.resolve()
                
                # 2. Verbose logging
                if gc.verbose:
                    typer.echo(f"🔍 Locating nucleus at {nucleus_path}...", err=True)
                
                # 3. Localizar el nucleus
                nucleus_dir = self._locate_nucleus_dir(nucleus_path)
                
                # 4. Obtener información antes de borrar
                nucleus_name = nucleus_dir.name
                
                # 5. Confirmar si no hay --force
                if not force and not gc.json_mode:
                    typer.echo(f"\n⚠️  WARNING: You are about to delete nucleus: {nucleus_name}")
                    typer.echo(f"📂 Path: {nucleus_dir}")
                    typer.echo(f"\n❌ This action is IRREVERSIBLE and will delete:")
                    typer.echo(f"   • All intents and their data")
                    typer.echo(f"   • All cache and indices")
                    typer.echo(f"   • All findings and reports")
                    typer.echo(f"   • All governance documents")
                    
                    confirm = typer.confirm("\nAre you sure you want to continue?")
                    if not confirm:
                        typer.echo("❌ Deletion cancelled")
                        raise typer.Exit(code=0)
                
                # 6. Verbose logging
                if gc.verbose:
                    typer.echo(f"🗑️  Deleting nucleus directory...", err=True)
                
                # 7. Eliminar el directorio
                import shutil
                shutil.rmtree(nucleus_dir)
                
                # 8. Empaquetar resultado
                result = {
                    "status": "success",
                    "operation": "nucleus_delete",
                    "deleted_path": str(nucleus_dir),
                    "nucleus_name": nucleus_name,
                    "message": f"Nucleus '{nucleus_name}' deleted successfully"
                }
                
                # 9. Output dual
                gc.output(result, self._render_success)
                
            except FileNotFoundError as e:
                self._handle_error(gc, f"Nucleus not found: {e}")
            except PermissionError as e:
                self._handle_error(gc, f"Permission denied: {e}")
            except Exception as e:
                self._handle_error(gc, f"Error deleting nucleus: {e}")
    
    def _locate_nucleus_dir(self, nucleus_path: Path) -> Path:
        """
        Locate the actual .nucleus-* directory.
        
        Args:
            nucleus_path: Path to nucleus root
            
        Returns:
            Path to .bloom/.nucleus-* directory
            
        Raises:
            FileNotFoundError: If nucleus not found
        """
        if not nucleus_path.exists():
            raise FileNotFoundError(f"Path does not exist: {nucleus_path}")
        
        # Buscar .bloom/.nucleus-*
        bloom_dir = nucleus_path / ".bloom"
        if not bloom_dir.exists():
            raise FileNotFoundError(f"No .bloom directory found at {nucleus_path}")
        
        for item in bloom_dir.iterdir():
            if item.is_dir() and item.name.startswith(".nucleus-"):
                # Verificar que tenga .core
                if (item / ".core").exists():
                    return item
        
        raise FileNotFoundError(f"No valid nucleus directory found in {bloom_dir}")
    
    def _render_success(self, data: dict):
        """Render human-readable output."""
        typer.echo(f"\n✅ Nucleus deleted successfully!")
        typer.echo(f"🗑️  Removed: {data.get('nucleus_name', 'Unknown')}")
        typer.echo(f"📂 Path: {data.get('deleted_path', 'N/A')}")
        typer.echo(f"\n💡 The nucleus has been permanently removed")
    
    def _handle_error(self, gc, message: str):
        """Unified error handling."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)