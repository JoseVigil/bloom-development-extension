"""
Intent merge command - Apply staged files to codebase with safety.

This command merges files from .staging/ directory into the actual codebase
with automatic backup and atomic write operations. It's the final step in
the intent execution pipeline.
"""

import typer
from pathlib import Path
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class MergeCommand(BaseCommand):
    """
    Apply staged files from .staging/ to the real codebase with safety.
    
    This is Step 6 (MERGE) in the Intent lifecycle. It reads validated
    files from the .staging/ directory and applies them to the actual
    project codebase with automatic backup creation.
    """
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="merge",
            category=CommandCategory.INTENT,
            version="1.0.0",
            description="Merge staged files into codebase with backup",
            examples=[
                "brain intent merge --intent-id abc-123",
                "brain intent merge --folder .fix-login-abc123",
                "brain intent merge -i abc-123 --stage briefing",
                "brain intent merge -i abc-123 --force",
                "brain intent merge -i abc-123 --dry-run",
                "brain intent merge -i abc-123 --no-backup"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        """Register the merge command in the Typer application."""
        
        @app.command(name=self.metadata().name)
        def execute(
            ctx: typer.Context,
            intent_id: Optional[str] = typer.Option(
                None,
                "--intent-id", "-i",
                help="Intent UUID to merge files for"
            ),
            folder: Optional[str] = typer.Option(
                None,
                "--folder", "-f",
                help="Intent folder name (e.g., .fix-login-a1b2c3d4)"
            ),
            stage: Optional[str] = typer.Option(
                None,
                "--stage", "-s",
                help="Pipeline stage (briefing, execution, refinement_X). Auto-detect if not provided."
            ),
            force: bool = typer.Option(
                False,
                "--force",
                help="Skip approval check and merge anyway"
            ),
            dry_run: bool = typer.Option(
                False,
                "--dry-run",
                help="Show what would be merged without applying"
            ),
            no_backup: bool = typer.Option(
                False,
                "--no-backup",
                help="Skip backup creation (DANGEROUS)"
            ),
            nucleus_path: Optional[Path] = typer.Option(
                None,
                "--nucleus-path", "-p",
                help="Path to Bloom project (auto-detected if not provided)"
            )
        ):
            """
            Merge staged files from .staging/ into the real codebase.
            
            This command applies validated changes from the .staging/ directory
            to your actual project files. It creates a backup before applying
            changes and supports dry-run mode for preview.
            
            Safety features:
            - Automatic backup creation before any changes
            - Validation check (requires approved .report.json)
            - Dry-run mode to preview changes
            - Atomic write operations
            - Rollback support via backup
            
            Examples:
                # Merge approved changes
                brain intent merge --intent-id abc-123
                
                # Preview what would be merged
                brain intent merge -i abc-123 --dry-run
                
                # Merge specific stage
                brain intent merge -i abc-123 --stage briefing
                
                # Force merge without approval check
                brain intent merge -i abc-123 --force
            """
            
            # 1. Recuperar GlobalContext
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            # 2. Validar argumentos
            if not intent_id and not folder:
                self._handle_error(
                    gc,
                    "Either --intent-id or --folder must be provided"
                )
            
            try:
                # 3. Lazy Import del Core
                from brain.core.intent.merge_manager import MergeManager
                
                # 4. Verbose logging
                if gc.verbose:
                    typer.echo("🔄 Starting merge process...", err=True)
                    if dry_run:
                        typer.echo("   [DRY RUN MODE - No changes will be applied]", err=True)
                    if no_backup:
                        typer.echo("   ⚠️  WARNING: Backup disabled", err=True)
                
                # 5. Ejecutar lógica del Core
                manager = MergeManager()
                result = manager.merge(
                    intent_id=intent_id,
                    folder_name=folder,
                    stage_name=stage,
                    force=force,
                    dry_run=dry_run,
                    no_backup=no_backup,
                    nucleus_path=nucleus_path
                )
                
                # 6. Empaquetar resultado
                output = {
                    "status": "success",
                    "operation": "merge",
                    "data": result
                }
                
                # 7. Output dual
                gc.output(output, self._render_success)
                
            except FileNotFoundError as e:
                self._handle_error(gc, f"File not found: {e}")
            except ValueError as e:
                self._handle_error(gc, f"Validation error: {e}")
            except RuntimeError as e:
                self._handle_error(gc, f"Runtime error: {e}")
            except Exception as e:
                self._handle_error(gc, f"Unexpected error during merge: {e}")
    
    def _render_success(self, data: dict):
        """Render human-friendly success output."""
        result = data.get("data", {})
        
        intent_id = result.get("intent_id", "unknown")
        stage = result.get("stage", "unknown")
        files_merged = result.get("files_merged", 0)
        errors = result.get("errors", 0)
        backup_dir = result.get("backup_dir")
        dry_run = result.get("dry_run", False)
        
        if dry_run:
            typer.echo("\n📋 DRY RUN SUMMARY")
            typer.echo(f"   Intent ID: {intent_id}")
            typer.echo(f"   Stage: {stage}")
            typer.echo(f"   Files that would be merged: {files_merged}")
            if errors > 0:
                typer.echo(f"   ⚠️  Potential errors: {errors}")
            typer.echo("\n💡 Run without --dry-run to apply changes")
        else:
            typer.echo(f"\n✅ Merge completed successfully")
            typer.echo(f"   Intent ID: {intent_id}")
            typer.echo(f"   Stage: {stage}")
            typer.echo(f"   Files merged: {files_merged}")
            
            if errors > 0:
                typer.echo(f"   ⚠️  Errors encountered: {errors}")
            
            if backup_dir:
                typer.echo(f"\n💾 Backup created: {backup_dir}")
                typer.echo(f"   To rollback: brain intent rollback --intent-id {intent_id}")
            
            typer.echo("\n🎉 Changes applied to codebase")
    
    def _handle_error(self, gc, message: str):
        """Unified error handling."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)