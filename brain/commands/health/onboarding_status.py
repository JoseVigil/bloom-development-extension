"""
Onboarding status health check command.
Aggregates status from multiple Brain commands to determine onboarding completion.
"""

import typer
import json
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class HealthOnboardingStatusCommand(BaseCommand):
    """
    Check onboarding completion status by aggregating multiple component checks.
    Integrates with existing Brain commands without duplicating logic.
    """
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="onboarding-status",
            category=CommandCategory.HEALTH,
            version="1.0.0",
            description="Verify onboarding completion status (GitHub, Gemini, Nucleus, Projects)",
            examples=[
                "brain health onboarding-status",
                "brain health onboarding-status --json",
                "brain health onboarding-status --verbose --refresh"
            ]
        )

    def register(self, app: typer.Typer):
        @app.command(
            name=self.metadata().name,
            help=self.metadata().description
        )
        def execute(
            ctx: typer.Context,
            refresh: bool = typer.Option(
                False,
                "--refresh",
                "-r",
                help="Force re-check, ignore cache"
            ),
            json_output: bool = typer.Option(
                False,
                "--json",
                help="Output raw JSON"
            ),
            verbose: bool = typer.Option(
                False,
                "--verbose",
                "-v",
                help="Detailed logging of each check"
            )
        ):
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            if verbose:
                gc.verbose = True
            
            if gc.verbose:
                typer.echo("🔍 Verificando estado de onboarding...", err=True)
            
            try:
                from brain.core.health.onboarding_status_manager import OnboardingStatusManager
                
                manager = OnboardingStatusManager(gc)
                status_data = manager.check_onboarding_status(refresh=refresh)
                
                result = {
                    "status": "success",
                    "operation": self.metadata().name,
                    "data": status_data
                }
                
                if json_output:
                    typer.echo(json.dumps(result, indent=2))
                else:
                    gc.output(result, self._render_success)
                
            except Exception as e:
                self._handle_error(gc, f"Error checking onboarding status: {str(e)}")

    def _render_success(self, result: dict):
        """Render human-friendly onboarding status"""
        data = result['data']
        ready = data.get('ready', False)
        current_step = data.get('current_step', 'unknown')
        completion = data.get('completion_percentage', 0)
        
        # Header
        status_emoji = '✅' if ready else '⏳'
        typer.echo(f"\n{status_emoji} Onboarding Status: {current_step.upper()}")
        typer.echo(f"Completion: {completion}%")
        typer.echo(f"Ready: {'Yes' if ready else 'No'}\n")
        
        # Component details
        details = data.get('details', {})
        
        self._render_component("GitHub Authentication", details.get('github', {}))
        self._render_component("Gemini API Keys", details.get('gemini', {}))
        self._render_component("Nucleus Creation", details.get('nucleus', {}))
        self._render_component("Projects Added", details.get('projects', {}))
        
        # Next step hint
        if not ready:
            next_steps = {
                'welcome': '→ Complete GitHub authentication',
                'gemini': '→ Configure Gemini API keys',
                'nucleus': '→ Create your first Nucleus',
                'projects': '→ Add projects to your Nucleus'
            }
            hint = next_steps.get(current_step, '→ Complete remaining steps')
            typer.echo(f"\n💡 Next Step: {hint}")
    
    def _render_component(self, name: str, data: dict):
        """Render individual component status"""
        # Determine status from various possible keys
        status = data.get('authenticated') or data.get('configured') or \
                 data.get('exists') or data.get('added', False)
        
        emoji = '🟢' if status else '🔴'
        status_text = 'OK' if status else 'PENDING'
        
        typer.echo(f"{emoji} {name}: {status_text}")
        
        # Additional details (skip internal keys)
        skip_keys = {'authenticated', 'configured', 'exists', 'added', 'checked_at', 'error'}
        for key, value in data.items():
            if key not in skip_keys:
                typer.echo(f"   └─ {key}: {value}")
        
        if 'error' in data:
            typer.echo(f"   └─ ⚠️  Error: {data['error']}")
        
        typer.echo()

    def _handle_error(self, gc, message: str):
        if gc.json_mode:
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)