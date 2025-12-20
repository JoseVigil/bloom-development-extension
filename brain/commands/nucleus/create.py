"""Nucleus project creation command."""
import typer
from pathlib import Path
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory

class NucleusCreateCommand(BaseCommand):
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="create",
            category=CommandCategory.NUCLEUS,
            version="2.0.0",
            description="Initialize a new Bloom Nucleus project structure",
            examples=[
                "brain nucleus create -o MyOrg",
                "brain nucleus create -o MyOrg -p ./my-nucleus",
                "brain nucleus create -o MyOrg --url https://github.com/myorg"
            ]
        )
    
    def register(self, app: typer.Typer):
        @app.command("create")
        def create(
            ctx: typer.Context,
            org: str = typer.Option(..., "--org", "-o", help="Organization name"),
            path: Optional[Path] = typer.Option(None, "--path", "-p", help="Target path (default: current dir)"),
            output: str = typer.Option(".bloom", "--output", help="Output directory name (legacy, kept for compatibility)"),
            url: str = typer.Option("", "--url", help="Organization URL"),
            force: bool = typer.Option(False, "--force", "-f", help="Force overwrite existing directory")
        ):
            """
            Initialize a new Bloom Nucleus V2.0 project structure.
            
            Creates a Meta-Sistema de Gobernanza with:
            - Governance policies and standards
            - Exploration intents structure (.exp)
            - Cache system for project synchronization
            - Relations mapping between projects
            """
            # 1. Get Global Context
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                # 2. Lazy Imports
                from brain.core.nucleus_manager import NucleusManager
                
                target_path = path if path else Path.cwd()
                
                # 3. Verbose logging
                if gc.verbose:
                    typer.echo(f"🔨 Creating Nucleus V2.0 for {org} at {target_path}...", err=True)
                
                # 4. Execute business logic
                manager = NucleusManager(target_path)
                result = manager.create(
                    organization_name=org,
                    organization_url=url,
                    output_dir=output,
                    force=force,
                    on_progress=lambda msg: typer.echo(f"  → {msg}", err=True) if gc.verbose else None
                )
                
                # Add operation metadata
                result["status"] = "success"
                result["operation"] = "create"
                
                # 5. Smart output
                gc.output(result, self._render_success)
                
            except Exception as e:
                self._handle_error(gc, str(e))
    
    def _render_success(self, data: dict):
        """Render success output for humans."""
        typer.echo(f"\n✅ Nucleus Created Successfully!")
        typer.echo(f"📁 Path: {data.get('path')}")
        typer.echo(f"🏢 Organization: {data.get('organization', {}).get('name')}")
        typer.echo(f"📊 Projects detected: {data.get('projects_detected', 0)}")
        typer.echo(f"📝 Files created: {len(data.get('files_created', []))}")
        
        if data.get('is_git_repo'):
            typer.echo(f"🔗 GitHub: {data.get('organization', {}).get('url')}")
    
    def _handle_error(self, gc, message: str):
        """Handle errors with dual output mode."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ Error: {message}", err=True)
        raise typer.Exit(code=1)