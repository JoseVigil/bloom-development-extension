"""
Intent staging command - Prepare files in .staging/ directory for merge.

This command reads files from .files/, decompresses if necessary, and prepares
the final structure in .staging/ mirroring the real directory structure.
"""

import typer
from pathlib import Path
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class StageCommand(BaseCommand):
    """
    Prepare files in .staging/ directory for merge.
    
    This command is part of the Intent Pipeline (Step 3):
    1. download - Get AI response with files
    2. parse - Validate protocol compliance
    3. stage - Prepare files in .staging/ (THIS COMMAND)
    4. validate - Check files before merge
    5. finalize - Apply changes to project
    """
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="stage",
            category=CommandCategory.INTENT,
            version="1.0.0",
            description="Prepare files in .staging/ directory for merge",
            examples=[
                "brain intent stage --intent-id abc-123",
                "brain intent stage --intent-id abc-123 --stage briefing",
                "brain intent stage -i abc-123 --dry-run",
                "brain intent stage --folder .fix-login-a1b2 --overwrite"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        """
        Register the stage command in the Intent category.
        """
        @app.command(name=self.metadata().name)
        def execute(
            ctx: typer.Context,
            intent_id: Optional[str] = typer.Option(
                None,
                "--intent-id", "-i",
                help="Intent UUID to stage files for"
            ),
            folder_name: Optional[str] = typer.Option(
                None,
                "--folder", "-f",
                help="Intent folder name (e.g., .fix-login-a1b2c3d4)"
            ),
            stage: Optional[str] = typer.Option(
                None,
                "--stage", "-s",
                help="Pipeline stage (briefing, execution, refinement_X). Auto-detect if not provided."
            ),
            dry_run: bool = typer.Option(
                False,
                "--dry-run",
                help="Show what would be staged without writing files"
            ),
            overwrite: bool = typer.Option(
                True,
                "--overwrite",
                help="Overwrite existing .staging/ directory"
            ),
            nucleus_path: Optional[Path] = typer.Option(
                None,
                "-p",
                help="Path to Bloom project (auto-detected if not provided)"
            )
        ):
            """
            Prepare files in .staging/ directory for merge.
            
            Reads files from .files/, creates directory structure in .staging/,
            and generates a manifest file for validation.
            
            Examples:
                brain intent stage -i abc-123
                brain intent stage --folder .fix-login-a1b2
                brain intent stage -i abc-123 --dry-run --stage briefing
            """
            
            # 1. Recuperar GlobalContext
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            # 2. Validate inputs
            if not intent_id and not folder_name:
                self._handle_error(
                    gc,
                    "Either --intent-id or --folder must be provided"
                )
            
            try:
                # 3. Lazy Import del Core
                from brain.core.intent.staging_manager import StagingManager
                
                # 4. Verbose logging
                if gc.verbose:
                    typer.echo(f"🔍 Locating intent...", err=True)
                    if dry_run:
                        typer.echo(f"🔍 Running in DRY RUN mode", err=True)
                
                # 5. Ejecutar lógica del Core
                manager = StagingManager(
                    intent_id=intent_id,
                    folder_name=folder_name,
                    nucleus_path=nucleus_path
                )
                
                result = manager.stage(
                    stage_name=stage,
                    dry_run=dry_run,
                    overwrite=overwrite,
                    verbose=gc.verbose
                )
                
                # 6. Empaquetar resultado
                output = {
                    "status": "success",
                    "operation": "stage",
                    "data": result
                }
                
                # 7. Output dual
                gc.output(output, self._render_success)
                
            except FileNotFoundError as e:
                self._handle_error(gc, f"File not found: {e}")
            except ValueError as e:
                self._handle_error(gc, f"Validation error: {e}")
            except Exception as e:
                self._handle_error(gc, f"Staging failed: {e}")
    
    def _render_success(self, data: dict):
        """Output humano para éxito."""
        result = data.get("data", {})
        
        intent_id = result.get("intent_id", "unknown")
        stage_name = result.get("stage", "unknown")
        files_staged = result.get("files_staged", 0)
        staging_dir = result.get("staging_dir", "")
        manifest_path = result.get("manifest_path", "")
        dry_run = result.get("dry_run", False)
        
        if dry_run:
            typer.echo("\n🔍 DRY RUN - No files were written\n")
        
        typer.echo(f"✅ Staged {files_staged} file(s) for intent '{intent_id[:8]}...'")
        typer.echo(f"📁 Stage: {stage_name}")
        
        if staging_dir and not dry_run:
            typer.echo(f"📂 Staging directory: {staging_dir}")
        
        if manifest_path and not dry_run:
            typer.echo(f"📋 Manifest: {manifest_path}")
        
        # Show file details if verbose or few files
        if files_staged <= 10:
            files_info = result.get("files_info", [])
            if files_info:
                typer.echo("\n📦 Staged files:")
                for file_info in files_info:
                    target = file_info.get("target_path", "unknown")
                    action = file_info.get("action", "unknown")
                    icon = "✏️" if action == "edit" else "➕" if action == "create" else "📄"
                    typer.echo(f"   {icon} {target}")
        
        if not dry_run:
            typer.echo(f"\n💡 Next: brain intent validate --intent-id {intent_id[:8]}")
    
    def _handle_error(self, gc, message: str):
        """Manejo unificado de errores."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)