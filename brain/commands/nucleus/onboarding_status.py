"""Nucleus onboarding status command."""
import typer
from pathlib import Path
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class NucleusOnboardingStatusCommand(BaseCommand):
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="onboarding-status",
            category=CommandCategory.NUCLEUS,
            version="1.0.0",
            description="Get the current onboarding status from nucleus configuration",
            examples=[
                "brain nucleus onboarding-status",
                "brain nucleus onboarding-status --json",
                "brain nucleus onboarding-status --path ./my-nucleus"
            ]
        )
    
    def register(self, app: typer.Typer):
        @app.command("onboarding-status")
        def onboarding_status(
            ctx: typer.Context,
            path: Optional[Path] = typer.Option(None, "--path", "-p", help="Nucleus root path (default: current dir)")
        ):
            """
            Get the current onboarding status from nucleus configuration.
            
            Returns the complete onboarding state including completion status
            and individual step progress.
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
                    typer.echo(f"🔍 Reading onboarding status from {target_path}...", err=True)
                
                # 4. Execute business logic
                manager = NucleusManager(target_path)
                status_data = manager.get_onboarding_status()
                
                # 5. Package result
                result = {
                    "status": "success",
                    "operation": "onboarding_status",
                    "data": status_data
                }
                
                # 6. Smart output
                gc.output(result, self._render_success)
                
            except Exception as e:
                self._handle_error(gc, str(e))
    
    def _render_success(self, data: dict):
        """Render success output for humans."""
        onboarding = data.get("data", {})
        
        typer.echo(f"\n📋 Onboarding Status")
        typer.echo(f"   Completed: {'✅' if onboarding.get('completed') else '❌'}")
        
        if onboarding.get("completed_at"):
            typer.echo(f"   Completed at: {onboarding.get('completed_at')}")
        
        steps = onboarding.get("steps", {})
        if steps:
            typer.echo(f"\n   Steps:")
            for step_name, step_status in steps.items():
                status_icon = "✅" if step_status else "⬜"
                typer.echo(f"     {status_icon} {step_name}")
    
    def _handle_error(self, gc, message: str):
        """Handle errors with dual output mode."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ Error: {message}", err=True)
        raise typer.Exit(code=1)