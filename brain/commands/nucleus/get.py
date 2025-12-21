"""Nucleus get command - Get complete nucleus information."""
import typer
from pathlib import Path
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class NucleusGetCommand(BaseCommand):
    """
    Command to retrieve complete information about a specific nucleus.
    Displays projects, configuration, and metadata.
    """
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="get",
            category=CommandCategory.NUCLEUS,
            version="1.0.0",
            description="Get complete information about a specific nucleus",
            examples=[
                "brain nucleus get --nucleus-path ~/projects/nucleus-myorg",
                "brain nucleus get --nucleus-path ./my-nucleus --json"
            ]
        )
    
    def register(self, app: typer.Typer) -> None:
        """Register the nucleus get command."""
        @app.command(name=self.metadata().name)
        def execute(
            ctx: typer.Context,
            nucleus_path: Path = typer.Option(
                ...,
                "--nucleus-path",
                "-p",
                help="Path to the Nucleus root directory"
            )
        ):
            """
            Retrieve complete details of a nucleus.
            
            Shows organization info, linked projects, configuration,
            and current statistics.
            """
            # 1. Recuperar GlobalContext
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                # 2. Verbose logging
                if gc.verbose:
                    typer.echo(f"🔍 Loading nucleus from {nucleus_path}...", err=True)
                
                # 3. Cargar información del nucleus
                nucleus_info = self._load_nucleus_info(nucleus_path)
                
                # 4. Empaquetar resultado
                result = {
                    "status": "success",
                    "operation": "nucleus_get",
                    "data": nucleus_info
                }
                
                # 5. Output dual
                gc.output(result, self._render_success)
                
            except FileNotFoundError as e:
                self._handle_error(gc, f"Nucleus not found: {e}")
            except Exception as e:
                self._handle_error(gc, f"Error loading nucleus: {e}")
    
    def _load_nucleus_info(self, nucleus_path: Path) -> dict:
        """
        Load complete nucleus information from config file.
        
        Args:
            nucleus_path: Path to nucleus root
            
        Returns:
            Dictionary with complete nucleus info
            
        Raises:
            FileNotFoundError: If nucleus not found
        """
        import json
        
        nucleus_path = nucleus_path.resolve()
        
        if not nucleus_path.exists():
            raise FileNotFoundError(f"Path does not exist: {nucleus_path}")
        
        # Buscar .bloom/.nucleus-*
        bloom_dir = nucleus_path / ".bloom"
        if not bloom_dir.exists():
            raise FileNotFoundError(f"No .bloom directory found at {nucleus_path}")
        
        nucleus_dir = None
        for item in bloom_dir.iterdir():
            if item.is_dir() and item.name.startswith(".nucleus-"):
                nucleus_dir = item
                break
        
        if not nucleus_dir:
            raise FileNotFoundError(f"No nucleus directory found in {bloom_dir}")
        
        # Leer configuración
        config_file = nucleus_dir / ".core" / ".nucleus-config.json"
        if not config_file.exists():
            raise FileNotFoundError(f"No config file found at {config_file}")
        
        with open(config_file, "r", encoding="utf-8") as f:
            config = json.load(f)
        
        # Extraer información relevante
        return {
            "id": config.get("id", ""),
            "nucleus_name": config.get("nucleus", {}).get("name", ""),
            "organization": config.get("organization", {}),
            "path": str(nucleus_path.absolute()),
            "nucleus_dir": str(nucleus_dir.absolute()),
            "created_at": config.get("nucleus", {}).get("createdAt", ""),
            "last_updated": config.get("nucleus", {}).get("lastUpdatedAt", ""),
            "status": config.get("nucleus", {}).get("status", {}),
            "statistics": config.get("nucleus", {}).get("statistics", {}),
            "projects": config.get("projects", []),
            "features": config.get("features", {}),
            "directory_schema": config.get("nucleus", {}).get("directorySchema", {}),
            "version": config.get("version", "")
        }
    
    def _render_success(self, data: dict):
        """Render human-readable output."""
        nucleus = data.get("data", {})
        
        typer.echo(f"\n✅ Nucleus: {nucleus.get('nucleus_name', 'Unknown')}")
        typer.echo(f"🏢 Organization: {nucleus.get('organization', {}).get('name', 'Unknown')}")
        typer.echo(f"🆔 ID: {nucleus.get('id', 'N/A')}")
        typer.echo(f"📂 Path: {nucleus.get('path', 'N/A')}")
        typer.echo(f"📅 Created: {nucleus.get('created_at', 'N/A')}")
        typer.echo(f"🔄 Last Updated: {nucleus.get('last_updated', 'N/A')}")
        typer.echo(f"📦 Version: {nucleus.get('version', 'N/A')}")
        
        # Statistics
        stats = nucleus.get('statistics', {})
        typer.echo(f"\n📊 Statistics:")
        typer.echo(f"   • Total Projects: {stats.get('totalProjects', 0)}")
        typer.echo(f"   • Active Projects: {stats.get('activeProjects', 0)}")
        typer.echo(f"   • Total Intents: {stats.get('totalIntents', 0)}")
        
        strategies = stats.get('strategiesDistribution', {})
        if strategies:
            typer.echo(f"   • Strategies: {', '.join([f'{k}({v})' for k, v in strategies.items()])}")
        
        # Status
        status = nucleus.get('status', {})
        typer.echo(f"\n🔐 Status:")
        typer.echo(f"   • Initialized: {'✅' if status.get('initialized') else '❌'}")
        typer.echo(f"   • Sync Status: {status.get('syncStatus', 'unknown')}")
        typer.echo(f"   • Health: {status.get('healthStatus', 'unknown')}")
        
        # Projects
        projects = nucleus.get('projects', [])
        if projects:
            typer.echo(f"\n📦 Projects ({len(projects)}):")
            for proj in projects[:5]:  # Show first 5
                typer.echo(f"   • {proj.get('name', 'unknown')} ({proj.get('strategy', 'generic')})")
            if len(projects) > 5:
                typer.echo(f"   ... and {len(projects) - 5} more")
        
        # Features
        features = nucleus.get('features', {})
        enabled_features = [k for k, v in features.items() if v]
        if enabled_features:
            typer.echo(f"\n✨ Features: {', '.join(enabled_features)}")
    
    def _handle_error(self, gc, message: str):
        """Unified error handling."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)