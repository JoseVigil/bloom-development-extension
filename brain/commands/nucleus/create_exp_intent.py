"""
Nucleus exploration intent creation command.
Creates a new exploration intent following the Inquiry → Discovery → Findings flow.
"""
import typer
from pathlib import Path
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class NucleusCreateExpIntentCommand(BaseCommand):
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="create-exp-intent",
            category=CommandCategory.NUCLEUS,
            version="1.0.0",
            description="Create a new exploration intent in the nucleus",
            examples=[
                "brain nucleus create-exp-intent --name 'auth-optimization'",
                "brain nucleus create-exp-intent -n 'cross-project-analysis' -p ./my-nucleus",
                "brain nucleus create-exp-intent -n 'architecture-review' --inquiry 'How can we improve...'"
            ]
        )
    
    def register(self, app: typer.Typer):
        @app.command("create-exp-intent")
        def create_exp_intent(
            ctx: typer.Context,
            name: str = typer.Option(..., "--name", "-n", help="Intent name (will be slugified)"),
            path: Optional[Path] = typer.Option(None, "--path", "-p", help="Nucleus path (default: current dir)"),
            inquiry: Optional[str] = typer.Option(None, "--inquiry", help="Initial inquiry question"),
            description: Optional[str] = typer.Option(None, "--description", "-d", help="Intent description"),
            projects: Optional[str] = typer.Option(None, "--projects", help="Comma-separated project names to include")
        ):
            """
            Create a new exploration intent in the nucleus.
            
            Exploration intents follow the flow:
            - Inquiry: Define strategic question
            - Discovery: Iterative exploration (turns)
            - Findings: Exportable results
            
            The intent structure includes:
            - .inquiry/ with context and files
            - .discovery/ for iterative turns
            - .findings/ for results
            - .pipeline/ for AI processing
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
                    typer.echo(f"🔬 Creating exploration intent '{name}'...", err=True)
                
                # Parse projects list
                project_list = None
                if projects:
                    project_list = [p.strip() for p in projects.split(",")]
                    if gc.verbose:
                        typer.echo(f"  → Including projects: {', '.join(project_list)}", err=True)
                
                # 4. Execute business logic
                manager = NucleusManager(target_path)
                result = manager.create_exp_intent(
                    name=name,
                    inquiry=inquiry,
                    description=description,
                    projects=project_list,
                    on_progress=lambda msg: typer.echo(f"  → {msg}", err=True) if gc.verbose else None
                )
                
                # Add operation metadata
                result["status"] = "success"
                result["operation"] = "create-exp-intent"
                
                # 5. Smart output
                gc.output(result, self._render_success)
                
            except FileNotFoundError as e:
                self._handle_error(gc, f"Nucleus not found: {e}")
            except ValueError as e:
                self._handle_error(gc, f"Invalid input: {e}")
            except Exception as e:
                self._handle_error(gc, str(e))
    
    def _render_success(self, data: dict):
        """Render success output for humans."""
        typer.echo(f"\n✅ Exploration Intent Created!")
        typer.echo(f"🔬 Name: {data.get('intent_name')}")
        typer.echo(f"🆔 ID: {data.get('intent_id')}")
        typer.echo(f"📁 Path: {data.get('intent_path')}")
        
        if data.get('inquiry'):
            typer.echo(f"\n❓ Inquiry: {data.get('inquiry')}")
        
        if data.get('projects_included'):
            projects = data.get('projects_included', [])
            typer.echo(f"\n📦 Projects included ({len(projects)}):")
            for proj in projects[:5]:
                typer.echo(f"  • {proj}")
            if len(projects) > 5:
                typer.echo(f"  ... and {len(projects) - 5} more")
        
        typer.echo(f"\n📝 Files created: {len(data.get('files_created', []))}")
        typer.echo(f"\n💡 Next steps:")
        typer.echo(f"  1. Edit inquiry: {data.get('inquiry_file')}")
        typer.echo(f"  2. Start discovery turns")
        typer.echo(f"  3. Export findings when complete")
    
    def _handle_error(self, gc, message: str):
        """Handle errors with dual output mode."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ Error: {message}", err=True)
        raise typer.Exit(code=1)