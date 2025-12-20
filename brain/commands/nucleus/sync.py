"""Nucleus sync command - Synchronize projects and rebuild cache"""
import typer
from pathlib import Path
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory

class NucleusSyncCommand(BaseCommand):
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="sync",
            category=CommandCategory.NUCLEUS,
            version="1.0.0",
            description="Synchronize projects (git pull) and rebuild nucleus cache",
            examples=[
                "brain nucleus sync",
                "brain nucleus sync -p ./my-nucleus",
                "brain nucleus sync --skip-git",
                "brain nucleus sync --verbose"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        @app.command(name=self.metadata().name)
        def execute(
            ctx: typer.Context,
            path: Optional[Path] = typer.Option(None, "--path", "-p", help="Nucleus path (default: current dir)"),
            skip_git: bool = typer.Option(False, "--skip-git", help="Skip git pull operations"),
            verbose: bool = typer.Option(False, "--verbose", "-v", help="Show detailed progress")
        ):
            """
            Synchronize projects and rebuild nucleus cache.
            
            Process:
            1. Git pull all linked projects (unless --skip-git)
            2. Read .project.meta.json from each project
            3. Update .cache/ with snapshots and indices
            4. Rebuild semantic index and dependency graph
            5. Generate health dashboard and statistics
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
                if gc.verbose or verbose:
                    typer.echo(f"🔄 Starting nucleus sync at {target_path}...", err=True)
                
                # 4. Execute Sync
                manager = NucleusManager(target_path)
                result = manager.sync(
                    skip_git=skip_git,
                    on_progress=lambda msg: typer.echo(f"  {msg}", err=True) if (gc.verbose or verbose) else None
                )
                
                # Add operation metadata
                result["operation"] = "sync"
                
                # 5. Smart output
                gc.output(result, self._render_success)
                
            except FileNotFoundError as e:
                self._handle_error(gc, f"Nucleus not found: {e}")
            except Exception as e:
                self._handle_error(gc, str(e))

    def _render_success(self, data: dict):
        """Render success output for humans."""
        typer.echo(f"\n✅ Nucleus Synchronized Successfully!")
        typer.echo(f"📊 Projects synced: {data.get('projects_synced', 0)}")
        typer.echo(f"🔄 Git pulls executed: {data.get('git_pulls_executed', 0)}")
        typer.echo(f"📁 Cache files updated: {data.get('cache_files_updated', 0)}")
        
        errors = data.get("errors", [])
        if errors:
            typer.echo(f"\n⚠️  Warnings ({len(errors)}):")
            for error in errors[:5]:  # Show first 5
                typer.echo(f"  • {error}")
            if len(errors) > 5:
                typer.echo(f"  ... and {len(errors) - 5} more")
        
        typer.echo(f"\n🕐 Completed at: {data.get('timestamp', 'unknown')}")
    
    def _handle_error(self, gc, message: str):
        """Handle errors with dual output mode."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ Sync failed: {message}", err=True)
        raise typer.Exit(code=1)