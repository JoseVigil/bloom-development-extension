"""Nucleus list command - List all available nuclei in a parent directory."""
import typer
from pathlib import Path
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class NucleusListCommand(BaseCommand):
    """
    Command to list all available Nucleus projects in a parent directory.
    Useful for onboarding step 3 to show existing nuclei before creating a new one.
    """
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="list",
            category=CommandCategory.NUCLEUS,
            version="1.0.0",
            description="List all available nuclei in a parent directory",
            examples=[
                "brain nucleus list --parent-dir ~/projects",
                "brain nucleus list --parent-dir ~/work --json"
            ]
        )
    
    def register(self, app: typer.Typer) -> None:
        """Register the nucleus list command."""
        @app.command(name=self.metadata().name)
        def execute(
            ctx: typer.Context,
            parent_dir: Optional[Path] = typer.Option(
                None,
                "--parent-dir",
                "-d",
                help="Parent directory to scan for nuclei (default: current directory)"
            )
        ):
            """
            List all Nucleus projects found in a parent directory.
            
            Scans the specified directory for subdirectories containing
            valid Nucleus structures (.bloom/.nucleus-* directories).
            """
            # 1. Recuperar GlobalContext
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                # 2. Lazy Import del Core
                from brain.core.nucleus_manager import NucleusManager
                
                # 3. Determinar directorio a escanear
                scan_dir = parent_dir if parent_dir else Path.cwd()
                
                # 4. Verbose logging
                if gc.verbose:
                    typer.echo(f"🔍 Scanning for nuclei in {scan_dir}...", err=True)
                
                # 5. Escanear nuclei
                nuclei_list = self._scan_nuclei(scan_dir, gc.verbose)
                
                # 6. Empaquetar resultado
                result = {
                    "status": "success",
                    "operation": "nucleus_list",
                    "parent_dir": str(scan_dir.absolute()),
                    "count": len(nuclei_list),
                    "nuclei": nuclei_list
                }
                
                # 7. Output dual
                gc.output(result, self._render_success)
                
            except Exception as e:
                self._handle_error(gc, f"Error scanning nuclei: {e}")
    
    def _scan_nuclei(self, parent_dir: Path, verbose: bool) -> list:
        """
        Scan directory for valid Nucleus projects.
        
        Args:
            parent_dir: Directory to scan
            verbose: Whether to show progress
            
        Returns:
            List of nucleus metadata dictionaries
        """
        import json
        
        nuclei = []
        
        if not parent_dir.exists():
            raise FileNotFoundError(f"Directory not found: {parent_dir}")
        
        # Escanear subdirectorios
        for item in parent_dir.iterdir():
            if not item.is_dir():
                continue
            
            # Buscar .bloom/.nucleus-* dentro de cada subdirectorio
            bloom_dir = item / ".bloom"
            if not bloom_dir.exists():
                continue
            
            # Buscar carpetas nucleus
            for nucleus_candidate in bloom_dir.iterdir():
                if not nucleus_candidate.is_dir():
                    continue
                if not nucleus_candidate.name.startswith(".nucleus-"):
                    continue
                
                # Verificar que tenga .core/.nucleus-config.json
                config_file = nucleus_candidate / ".core" / ".nucleus-config.json"
                if not config_file.exists():
                    continue
                
                if verbose:
                    typer.echo(f"  → Found nucleus: {item.name}", err=True)
                
                # Leer configuración
                try:
                    with open(config_file, "r", encoding="utf-8") as f:
                        config = json.load(f)
                    
                    nuclei.append({
                        "id": nucleus_candidate.name,
                        "organization": config.get("organization", {}).get("name", "Unknown"),
                        "path": str(item.absolute()),
                        "nucleus_path": str(nucleus_candidate.absolute()),
                        "created_at": config.get("nucleus", {}).get("createdAt", ""),
                        "total_projects": config.get("nucleus", {}).get("statistics", {}).get("totalProjects", 0)
                    })
                except (json.JSONDecodeError, KeyError):
                    continue
        
        return nuclei
    
    def _render_success(self, data: dict):
        """Render human-readable output."""
        nuclei = data.get("nuclei", [])
        
        if not nuclei:
            typer.echo(f"\n📭 No nuclei found in {data['parent_dir']}")
            typer.echo("💡 Use 'brain nucleus create' to create a new nucleus")
            return
        
        typer.echo(f"\n✅ Found {data['count']} nucleus(i) in {data['parent_dir']}")
        typer.echo()
        
        for nucleus in nuclei:
            typer.echo(f"🧬 {nucleus['organization']}")
            typer.echo(f"   📂 Path: {nucleus['path']}")
            typer.echo(f"   🆔 ID: {nucleus['id']}")
            typer.echo(f"   📊 Projects: {nucleus['total_projects']}")
            typer.echo(f"   📅 Created: {nucleus['created_at']}")
            typer.echo()
    
    def _handle_error(self, gc, message: str):
        """Unified error handling."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)