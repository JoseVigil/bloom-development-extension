"""
Nucleus list-projects command - List all projects in a nucleus.

Path: brain/commands/nucleus/list_projects.py
Action: CREATE NEW FILE
"""

import typer
from pathlib import Path
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class NucleusListProjectsCommand(BaseCommand):
    """
    List all projects linked to a Nucleus with detailed information.
    """
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="list-projects",
            category=CommandCategory.NUCLEUS,
            version="2.0.0",
            description="List all projects linked to the nucleus",
            examples=[
                "brain nucleus list-projects",
                "brain nucleus list-projects --strategy python",
                "brain nucleus list-projects --json"
            ]
        )
    
    def register(self, app: typer.Typer) -> None:
        @app.command(name="list-projects")
        def list_projects(
            ctx: typer.Context,
            path: Optional[Path] = typer.Option(
                None,
                "--path",
                "-p",
                help="Nucleus root path (default: current directory)"
            ),
            strategy: Optional[str] = typer.Option(
                None,
                "--strategy",
                "-s",
                help="Filter by project strategy (python, typescript, go, etc.)"
            ),
            active_only: bool = typer.Option(
                False,
                "--active-only",
                help="Show only active projects"
            )
        ):
            """
            List all projects linked to the nucleus with their details.
            
            Shows project name, strategy, path, and status for each project.
            Optionally filter by strategy or show only active projects.
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
                    typer.echo(f"🔍 Loading projects from nucleus at {target_path}...", err=True)
                
                # 4. Execute business logic
                inspector = NucleusInspector(target_path)
                projects = inspector.get_projects_list(filter_strategy=strategy)
                
                # Filter active only if requested
                if active_only:
                    projects = [p for p in projects if p.get("status") == "active"]
                
                # Add operation metadata
                result = {
                    "status": "success",
                    "operation": "list_projects",
                    "total": len(projects),
                    "filter_strategy": strategy,
                    "active_only": active_only,
                    "projects": projects
                }
                
                # 5. Smart output
                gc.output(result, self._render_success)
                
            except FileNotFoundError as e:
                self._handle_error(gc, f"Nucleus not found: {e}")
            except Exception as e:
                self._handle_error(gc, f"Error listing projects: {e}")
    
    def _render_success(self, data: dict):
        """Render success output for humans."""
        projects = data.get("projects", [])
        total = data.get("total", 0)
        filter_strategy = data.get("filter_strategy")
        active_only = data.get("active_only", False)
        
        # Header
        typer.echo("\n" + "="*80)
        title = f"📦 NUCLEUS PROJECTS ({total} project{'s' if total != 1 else ''})"
        if filter_strategy:
            title += f" - Filtered by: {filter_strategy}"
        if active_only:
            title += " - Active only"
        typer.echo(title)
        typer.echo("="*80 + "\n")
        
        if not projects:
            typer.echo("  No projects found.\n")
            return
        
        # Group by strategy for better visualization
        by_strategy = {}
        for project in projects:
            strat = project.get("strategy", "unknown")
            if strat not in by_strategy:
                by_strategy[strat] = []
            by_strategy[strat].append(project)
        
        # Display projects grouped by strategy
        for strategy, projs in sorted(by_strategy.items()):
            typer.echo(f"🎯 {strategy.upper()} ({len(projs)} project{'s' if len(projs) != 1 else ''})")
            typer.echo("-" * 80)
            
            for proj in projs:
                name = proj.get("name", "Unknown")
                status = proj.get("status", "unknown")
                local_path = proj.get("localPath", "N/A")
                
                # Status icon
                status_icon = "✅" if status == "active" else "⏸️"
                
                typer.echo(f"  {status_icon} {name}")
                typer.echo(f"     Path: {local_path}")
                typer.echo(f"     ID:   {proj.get('id', 'N/A')[:16]}...")
                
                # Show metadata if available
                metadata = proj.get("metadata", {})
                if metadata:
                    flags = []
                    if metadata.get("hasBloomConfig"):
                        flags.append("Bloom ✓")
                    if metadata.get("isGitRepo"):
                        flags.append("Git ✓")
                    if flags:
                        typer.echo(f"     {' | '.join(flags)}")
                
                typer.echo()
            
            typer.echo()
        
        # Footer with summary
        typer.echo("="*80)
        typer.echo(f"Total: {total} project{'s' if total != 1 else ''}")
        typer.echo("="*80 + "\n")
    
    def _handle_error(self, gc, message: str):
        """Handle errors with dual output mode."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)