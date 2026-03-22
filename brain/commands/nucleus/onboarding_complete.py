"""Nucleus onboarding complete command.

v1.1.0 — Paso 1 github_auth
Cambios: valida --step contra onboarding_steps.json en AppData/BloomNucleus/config/
en lugar de aceptar cualquier string arbitrario.
"""
import typer
from pathlib import Path
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory
from brain.commands.nucleus.onboarding_steps_loader import get_loader as _get_steps_loader


class NucleusOnboardingCompleteCommand(BaseCommand):
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="onboarding-complete",
            category=CommandCategory.NUCLEUS,
            version="1.1.0",
            description="Mark an onboarding step or entire onboarding as completed",
            examples=[
                "brain nucleus onboarding-complete --step github_auth",
                "brain nucleus onboarding-complete --step gemini_setup",
                "brain nucleus onboarding-complete --all",
                "brain nucleus onboarding-complete --step nucleus_created --path ./my-nucleus"
            ]
        )
    
    def register(self, app: typer.Typer):
        @app.command("onboarding-complete")
        def onboarding_complete(
            ctx: typer.Context,
            step: Optional[str] = typer.Option(None, "--step", "-s", help="Step name to mark as completed"),
            all_steps: bool = typer.Option(False, "--all", "-a", help="Mark entire onboarding as completed"),
            path: Optional[Path] = typer.Option(None, "--path", "-p", help="Nucleus root path (default: current dir)")
        ):
            """
            Mark an onboarding step or entire onboarding as completed.
            
            Updates the nucleus configuration with the completion status
            and persists changes to disk.
            """
            # 1. Get Global Context
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            # Validate input
            if not step and not all_steps:
                self._handle_error(gc, "Must specify either --step or --all")
            
            if step and all_steps:
                self._handle_error(gc, "Cannot use --step and --all together")
            
            try:
                # 2. Lazy Imports
                from brain.core.nucleus_manager import NucleusManager
                
                target_path = path if path else Path.cwd()
                
                # 3. Verbose logging
                if gc.verbose:
                    if all_steps:
                        typer.echo(f"🎯 Marking entire onboarding as completed at {target_path}...", err=True)
                    else:
                        typer.echo(f"🎯 Marking step '{step}' as completed at {target_path}...", err=True)
                
                # 3b. Validate step against onboarding_steps.json
                #     Fails fast with a clear error before touching disk.
                if step:
                    try:
                        steps_loader = _get_steps_loader()
                        step_def = steps_loader.validate_step(step)
                        if gc.verbose:
                            typer.echo(
                                f"✓ Step '{step}' valid: {step_def['label']} "
                                f"(produces: {step_def['produces']})",
                                err=True
                            )
                    except FileNotFoundError as e:
                        # onboarding_steps.json no existe — advertir pero no bloquear
                        # para no romper entornos sin el instalador completo
                        typer.echo(f"⚠️  Warning: {e}", err=True)
                    except ValueError as e:
                        self._handle_error(gc, str(e))

                # 4. Execute business logic
                manager = NucleusManager(target_path)
                
                if all_steps:
                    result_data = manager.complete_onboarding_all()
                else:
                    result_data = manager.complete_onboarding_step(step)
                
                # 5. Package result
                result = {
                    "status": "success",
                    "operation": "onboarding_complete",
                    "data": result_data
                }
                
                # 6. Smart output
                gc.output(result, self._render_success)
                
            except Exception as e:
                self._handle_error(gc, str(e))
    
    def _render_success(self, data: dict):
        """Render success output for humans."""
        result_data = data.get("data", {})
        
        typer.echo(f"\n✅ Onboarding Updated")
        
        if result_data.get("completed_all"):
            typer.echo(f"   All steps marked as completed")
        else:
            completed_step = result_data.get("step")
            typer.echo(f"   Step '{completed_step}' marked as completed")
            # Show step metadata from onboarding_steps.json if available
            try:
                step_def = _get_steps_loader().get(completed_step)
                if step_def:
                    typer.echo(f"   Produces artifact: {step_def['produces']}")
                    typer.echo(f"   Storage: {step_def['storage']}")
            except Exception:
                pass  # non-fatal
        
        typer.echo(f"   Overall completion: {'✅ Complete' if result_data.get('onboarding', {}).get('completed') else '⏳ In Progress'}")
        
        steps = result_data.get("onboarding", {}).get("steps", {})
        completed_count = sum(1 for v in steps.values() if v)
        total_count = len(steps)
        
        typer.echo(f"   Steps completed: {completed_count}/{total_count}")
    
    def _handle_error(self, gc, message: str):
        """Handle errors with dual output mode."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ Error: {message}", err=True)
        raise typer.Exit(code=1)