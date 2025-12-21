"""
Clone a Git repository and automatically link it to the current Nucleus.

This command provides a one-step operation for bringing external repositories
into the Bloom ecosystem by cloning and linking them atomically.
"""

import typer
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class CloneAndAddCommand(BaseCommand):
    """
    Command to clone a Git repository and automatically link it to the nearest Nucleus.
    
    This provides a streamlined workflow for onboarding new repositories into
    the Bloom project ecosystem without manual linking steps.
    """
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="clone-and-add",
            category=CommandCategory.PROJECT,
            version="1.0.0",
            description="Clone a Git repository and automatically link it to the current Nucleus",
            examples=[
                "brain project clone-and-add https://github.com/vercel/next.js",
                "brain project clone-and-add git@github.com:owner/private-repo.git --dest-path /custom/path/myapp",
                "brain project clone-and-add https://github.com/user/repo --verbose --json"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        """
        Registers the clone-and-add command in the Typer application.
        """
        @app.command(name=self.metadata().name)
        def execute(
            ctx: typer.Context,
            repo_url: str = typer.Argument(..., help="Git repository URL (HTTPS or SSH)"),
            dest_path: Optional[str] = typer.Option(
                None,
                "--dest-path",
                "-d",
                help="Absolute path where to clone the repository. If not provided, clones to Nucleus root using repo name."
            )
        ):
            """
            Clone a Git repository and automatically link it to the current Nucleus.
            
            This command performs an atomic operation:
            1. Detects the nearest Nucleus by searching upward from current directory
            2. Clones the repository to the specified or default location
            3. Detects the project's technology stack
            4. Links the project to the Nucleus automatically
            
            The operation will fail if no Nucleus is found or if the destination already exists.
            """
            
            # 1. Recuperar GlobalContext
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                # 2. Lazy Import del Core
                from brain.core.project.clone_manager import CloneAndLinkManager
                
                # 3. Verbose logging
                if gc.verbose:
                    typer.echo("🔍 Detecting nearest Nucleus...", err=True)
                    typer.echo(f"📦 Repository URL: {repo_url}", err=True)
                    if dest_path:
                        typer.echo(f"📂 Destination: {dest_path}", err=True)
                
                # 4. Ejecutar lógica del Core
                manager = CloneAndLinkManager()
                data = manager.execute(repo_url=repo_url, dest_path=dest_path)
                
                # 5. Verbose logging durante el proceso
                if gc.verbose:
                    typer.echo(f"✅ Repository cloned to: {data['project_path']}", err=True)
                    typer.echo(f"🔗 Linked to Nucleus: {data['nucleus_path']}", err=True)
                    typer.echo(f"🎯 Detected {len(data['detected_strategies'])} strategies", err=True)
                
                # 6. Empaquetar resultado
                result = {
                    "status": "success",
                    "operation": "clone_and_add",
                    "data": data
                }
                
                # 7. Output dual
                gc.output(result, self._render_success)
                
            except FileNotFoundError as e:
                self._handle_error(gc, f"Not found: {e}")
            except ValueError as e:
                self._handle_error(gc, f"Invalid input: {e}")
            except FileExistsError as e:
                self._handle_error(gc, f"Destination already exists: {e}")
            except Exception as e:
                self._handle_error(gc, f"Failed to clone and link repository: {e}")
    
    def _render_success(self, data: dict):
        """
        Renders human-friendly success output.
        
        Args:
            data: Result dictionary from the operation
        """
        operation_data = data.get("data", {})
        
        typer.echo(f"\n✅ Repository cloned and linked successfully!")
        typer.echo(f"\n📦 Project Details:")
        typer.echo(f"   Name:     {operation_data.get('project_name', 'N/A')}")
        typer.echo(f"   Path:     {operation_data.get('project_path', 'N/A')}")
        typer.echo(f"   Nucleus:  {operation_data.get('nucleus_path', 'N/A')}")
        
        strategies = operation_data.get('detected_strategies', [])
        if strategies:
            typer.echo(f"\n🎯 Detected Technologies ({len(strategies)}):")
            for strategy in strategies[:5]:  # Show first 5
                typer.echo(f"   • {strategy}")
            if len(strategies) > 5:
                typer.echo(f"   ... and {len(strategies) - 5} more")
        
        typer.echo(f"\n🔗 Status: Linked to Nucleus")
        typer.echo(f"\n💡 Next steps:")
        typer.echo(f"   • cd {operation_data.get('project_path', '')}")
        typer.echo(f"   • brain context generate")
    
    def _handle_error(self, gc, message: str):
        """
        Unified error handling for both JSON and human output modes.
        
        Args:
            gc: GlobalContext instance
            message: Error message to display
        """
        if gc.json_mode:
            import json
            typer.echo(json.dumps({
                "status": "error",
                "operation": "clone_and_add",
                "message": message
            }))
        else:
            typer.echo(f"\n❌ {message}", err=True)
            typer.echo("\n💡 Troubleshooting tips:", err=True)
            typer.echo("   • Ensure you're in a Nucleus or its subdirectories", err=True)
            typer.echo("   • Check that the repository URL is valid and accessible", err=True)
            typer.echo("   • Verify the destination path doesn't already exist", err=True)
            typer.echo("   • Use --verbose for detailed operation logs", err=True)
        raise typer.Exit(code=1)