"""
Intent validation command - Validates staging files using Gemini analysis.

This command analyzes files in .staging/ using Gemini AI to detect inconsistencies,
conflicts, or improvements needed before the final merge.
"""

import typer
from pathlib import Path
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class ValidateCommand(BaseCommand):
    """
    Validate staging files using Gemini analysis.
    
    This command (Step 4 in the Intent lifecycle) analyzes staged files
    for consistency, quality, completeness, and potential risks before merge.
    """
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="validate",
            category=CommandCategory.INTENT,
            version="1.0.0",
            description="Validate staging files using Gemini analysis",
            examples=[
                "brain intent validate --intent-id abc-123",
                "brain intent validate --intent-id abc-123 --auto-approve",
                "brain intent validate --folder .fix-login-abc123 --skip-gemini",
                "brain intent validate -i abc-123 --gemini-model gemini-2.0-flash"
            ]
        )
    
    def register(self, app: typer.Typer) -> None:
        """
        Register the validate command in the Typer application.
        """
        @app.command(name=self.metadata().name)
        def execute(
            ctx: typer.Context,
            intent_id: Optional[str] = typer.Option(
                None,
                "--intent-id", "-i",
                help="Intent UUID"
            ),
            folder_name: Optional[str] = typer.Option(
                None,
                "--folder", "-f",
                help="Intent folder name (e.g., .fix-login-abc123)"
            ),
            stage: Optional[str] = typer.Option(
                None,
                "--stage", "-s",
                help="Pipeline stage (briefing, execution, refinement_X)"
            ),
            auto_approve: bool = typer.Option(
                False,
                "--auto-approve",
                help="Skip manual review and approve automatically"
            ),
            gemini_model: str = typer.Option(
                "gemini-2.0-flash-exp",
                "--gemini-model",
                help="Gemini model to use for analysis"
            ),
            skip_gemini: bool = typer.Option(
                False,
                "--skip-gemini",
                help="Skip Gemini analysis (only basic validation)"
            ),
            nucleus_path: Optional[Path] = typer.Option(
                None,
                "--nucleus-path", "-p",
                help="Path to Bloom project (auto-detected if omitted)"
            )
        ):
            """
            Validate staging files using Gemini analysis.
            
            Analyzes files in .staging/ directory for consistency, quality,
            and potential issues before merge. Can use Gemini AI for deep
            analysis or perform basic validation only.
            """
            # 1. Recuperar GlobalContext
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            # 2. Validar inputs
            if not intent_id and not folder_name:
                self._handle_error(
                    gc,
                    "Either --intent-id or --folder must be provided"
                )
            
            try:
                # 3. Lazy import del Core
                from brain.core.intent.validation_manager import ValidationManager
                
                # 4. Verbose logging
                if gc.verbose:
                    typer.echo("🔍 Starting validation process...", err=True)
                    if skip_gemini:
                        typer.echo("⚠️  Gemini analysis disabled", err=True)
                
                # 5. Ejecutar validación
                manager = ValidationManager(
                    intent_id=intent_id,
                    folder_name=folder_name,
                    nucleus_path=nucleus_path
                )
                
                result = manager.validate(
                    stage_name=stage,
                    auto_approve=auto_approve,
                    skip_gemini=skip_gemini,
                    gemini_model=gemini_model,
                    verbose=gc.verbose
                )
                
                # 6. Empaquetar resultado
                output_data = {
                    "status": "success",
                    "operation": "intent_validate",
                    "data": result
                }
                
                # 7. Output dual
                gc.output(output_data, self._render_success)
                
            except FileNotFoundError as e:
                self._handle_error(gc, f"File not found: {e}")
            except ValueError as e:
                self._handle_error(gc, f"Validation error: {e}")
            except Exception as e:
                self._handle_error(gc, f"Unexpected error: {e}")
    
    def _render_success(self, data: dict):
        """
        Render human-readable output for successful validation.
        """
        result = data.get("data", {})
        
        typer.echo("\n" + "="*70)
        typer.echo("📋 VALIDATION REPORT")
        typer.echo("="*70)
        
        # Basic validation info
        basic = result.get("basic_validation", {})
        typer.echo(f"\n✓ Basic Validation: {'PASSED' if basic.get('passed') else 'FAILED'}")
        typer.echo(f"  Files checked: {basic.get('files_checked', 0)}")
        
        if basic.get("issues"):
            typer.echo("\n  Issues found:")
            for issue in basic["issues"]:
                typer.echo(f"    ⚠️  {issue}")
        
        # Gemini analysis
        gemini = result.get("gemini_analysis")
        if gemini and not gemini.get("skipped"):
            typer.echo("\n🤖 Gemini Analysis:")
            
            if "consistency" in gemini:
                score = gemini["consistency"].get("score", 0)
                typer.echo(f"\n  ✓ Consistency: {score}/100")
                for issue in gemini["consistency"].get("issues", []):
                    typer.echo(f"    ⚠️  {issue}")
            
            if "quality" in gemini:
                score = gemini["quality"].get("score", 0)
                typer.echo(f"\n  ✓ Quality: {score}/100")
                for issue in gemini["quality"].get("issues", []):
                    typer.echo(f"    ⚠️  {issue}")
            
            if "completeness" in gemini:
                score = gemini["completeness"].get("score", 0)
                typer.echo(f"\n  ✓ Completeness: {score}/100")
                for missing in gemini["completeness"].get("missing", []):
                    typer.echo(f"    ⚠️  Missing: {missing}")
            
            if "risks" in gemini and gemini["risks"]:
                typer.echo("\n  🎯 Risk Assessment:")
                for risk in gemini["risks"]:
                    typer.echo(f"    ⚠️  {risk}")
            
            if "recommendation" in gemini:
                rec = gemini["recommendation"]
                emoji = "✅" if rec == "approve" else "⚠️" if rec == "review_needed" else "❌"
                typer.echo(f"\n  {emoji} Recommendation: {rec.upper()}")
            
            if "summary" in gemini:
                typer.echo(f"\n  📝 Summary: {gemini['summary']}")
        
        # Approval status
        typer.echo("\n" + "="*70)
        approved = result.get("approved", False)
        ready = result.get("ready_for_merge", False)
        
        if approved:
            typer.echo("✅ Status: APPROVED")
        else:
            typer.echo("⚠️  Status: PENDING REVIEW")
        
        if ready:
            typer.echo("✅ Ready for merge: YES")
        else:
            typer.echo("⚠️  Ready for merge: NO")
        
        # Report location
        report_path = result.get("report_path")
        if report_path:
            typer.echo(f"\n📄 Report saved: {report_path}")
        
        typer.echo("="*70 + "\n")
    
    def _handle_error(self, gc, message: str):
        """
        Unified error handling with dual output support.
        """
        if gc.json_mode:
            import json
            typer.echo(json.dumps({
                "status": "error",
                "operation": "intent_validate",
                "message": message
            }))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)