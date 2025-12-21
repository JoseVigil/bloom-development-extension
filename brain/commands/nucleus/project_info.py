"""
Nucleus project-info command - Inspect a specific project from nucleus perspective.

Path: brain/commands/nucleus/project_info.py
Action: CREATE NEW FILE
"""

import typer
from pathlib import Path
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class NucleusProjectInfoCommand(BaseCommand):
    """
    Display detailed information about a specific project linked to the nucleus.
    """
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="project-info",
            category=CommandCategory.NUCLEUS,
            version="2.0.0",
            description="Display detailed info about a specific project in the nucleus",
            examples=[
                "brain nucleus project-info my-backend",
                "brain nucleus project-info my-frontend --path ./nucleus",
                "brain nucleus project-info my-app --json"
            ]
        )
    
    def register(self, app: typer.Typer) -> None:
        @app.command(name="project-info")
        def project_info(
            ctx: typer.Context,
            project_name: str = typer.Argument(
                ...,
                help="Name of the project to inspect"
            ),
            path: Optional[Path] = typer.Option(
                None,
                "--path",
                "-p",
                help="Nucleus root path (default: current directory)"
            )
        ):
            """
            Display detailed information about a specific project in the nucleus.
            
            Shows project configuration from nucleus perspective, including:
            - Project metadata (ID, strategy, paths)
            - Status and timestamps
            - Filesystem validation
            - Bloom configuration if available
            """
            
            # 1. Get Global Context
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                # 2. Lazy Import
                from brain.core.nucleus_inspector import NucleusInspector
                
                target_path = path or Path.cwd()
                
                # 3. Verbose logging
                if gc.verbose:
                    typer.echo(f"🔍 Loading project '{project_name}' from nucleus...", err=True)
                
                # 4. Execute business logic
                inspector = NucleusInspector(target_path)
                project_data = inspector.get_project_info(project_name)
                
                # Add operation metadata
                result = {
                    "status": "success",
                    "operation": "project_info",
                    "project_name": project_name,
                    "data": project_data
                }
                
                # 5. Smart output
                gc.output(result, self._render_success)
                
            except FileNotFoundError as e:
                self._handle_error(gc, f"Nucleus not found: {e}")
            except ValueError as e:
                self._handle_error(gc, str(e))
            except Exception as e:
                self._handle_error(gc, f"Error reading project info: {e}")
    
    def _render_success(self, data: dict):
        """Render success output for humans."""
        project = data.get("data", {})
        project_name = data.get("project_name", "Unknown")
        
        # Header
        typer.echo("\n" + "="*70)
        typer.echo(f"📦 PROJECT INFO: {project_name}")
        typer.echo("="*70 + "\n")
        
        # Basic Info
        typer.echo("🏷️  BASIC INFO")
        typer.echo(f"  Name:      {project.get('name', 'N/A')}")
        typer.echo(f"  ID:        {project.get('id', 'N/A')}")
        typer.echo(f"  Strategy:  {project.get('strategy', 'N/A')}")
        typer.echo(f"  Status:    {self._get_status_icon(project.get('status'))} {project.get('status', 'N/A')}\n")
        
        # Paths
        typer.echo("📂 PATHS")
        typer.echo(f"  Local:     {project.get('localPath', 'N/A')}")
        typer.echo(f"  Absolute:  {project.get('absolutePath', 'N/A')}\n")
        
        # Timestamps
        typer.echo("🕐 TIMESTAMPS")
        typer.echo(f"  Discovered:    {project.get('discoveredAt', 'N/A')}")
        typer.echo(f"  Last Scanned:  {project.get('lastScannedAt', 'N/A')}\n")
        
        # Filesystem Info
        fs_info = project.get("filesystem", {})
        if fs_info:
            exists = fs_info.get("exists", False)
            icon = "✅" if exists else "❌"
            
            typer.echo(f"💾 FILESYSTEM")
            typer.echo(f"  {icon} Exists:       {exists}")
            
            if exists:
                typer.echo(f"  {'✅' if fs_info.get('is_directory') else '❌'} Is Directory: {fs_info.get('is_directory', False)}")
                typer.echo(f"  {'✅' if fs_info.get('has_bloom') else '❌'} Has .bloom:   {fs_info.get('has_bloom', False)}")
                typer.echo(f"  {'✅' if fs_info.get('has_git') else '❌'} Has .git:     {fs_info.get('has_git', False)}")
            else:
                note = fs_info.get("note", "")
                if note:
                    typer.echo(f"  Note: {note}")
            
            typer.echo()
        
        # Metadata
        metadata = project.get("metadata", {})
        if metadata:
            typer.echo("📊 NUCLEUS METADATA")
            typer.echo(f"  Bloom Config:  {'✅ Yes' if metadata.get('hasBloomConfig') else '❌ No'}")
            typer.echo(f"  Git Repo:      {'✅ Yes' if metadata.get('isGitRepo') else '❌ No'}")
            
            size = metadata.get("estimatedSize", 0)
            if size > 0:
                typer.echo(f"  Est. Size:     {self._format_size(size)}")
            
            typer.echo()
        
        # Bloom Metadata (if available)
        bloom_meta = project.get("bloom_metadata")
        if bloom_meta:
            typer.echo("🌸 BLOOM PROJECT METADATA")
            typer.echo(f"  Type:      {bloom_meta.get('type', 'N/A')}")
            typer.echo(f"  Strategy:  {bloom_meta.get('strategy', 'N/A')}")
            typer.echo(f"  Version:   {bloom_meta.get('version', 'N/A')}")
            
            if bloom_meta.get('created_at'):
                typer.echo(f"  Created:   {bloom_meta.get('created_at')}")
            
            typer.echo()
        
        # Footer
        typer.echo("="*70)
        typer.echo(f"💡 Tip: Use 'brain project info --path {project.get('absolutePath', '.')}' ")
        typer.echo(f"   to inspect the project's internal .bloom structure.")
        typer.echo("="*70 + "\n")
    
    def _get_status_icon(self, status: Optional[str]) -> str:
        """Get icon for project status."""
        status_icons = {
            "active": "✅",
            "inactive": "⏸️",
            "archived": "📦",
            "error": "❌"
        }
        return status_icons.get(status, "❓")
    
    def _format_size(self, size_bytes: int) -> str:
        """Format size in bytes to human-readable format."""
        for unit in ['B', 'KB', 'MB', 'GB']:
            if size_bytes < 1024.0:
                return f"{size_bytes:.1f} {unit}"
            size_bytes /= 1024.0
        return f"{size_bytes:.1f} TB"
    
    def _handle_error(self, gc, message: str):
        """Handle errors with dual output mode."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)