"""
Intent recovery command - Recover interrupted intents from lock state.
"""

import typer
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class RecoverCommand(BaseCommand):
    """
    Recover interrupted intents using lock state recovery data.
    
    This command handles recovery of intents that were interrupted due to:
    - Browser crashes
    - Network timeouts
    - Process termination
    - System failures
    
    Recovery is possible when lock state contains recovery_data.
    """
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="recover",
            category=CommandCategory.INTENT,
            version="1.0.0",
            description="Recover interrupted intents from lock state",
            examples=[
                "brain intent recover --intent-id abc-123",
                "brain intent recover --folder .fix-login-abc123",
                "brain intent recover --auto-detect",
                "brain intent recover --intent-id abc-123 --force-unlock"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        """
        Register the recover command.
        """
        @app.command(name=self.metadata().name)
        def execute(
            ctx: typer.Context,
            intent_id: Optional[str] = typer.Option(
                None,
                "--intent-id", "-i",
                help="Intent UUID to recover"
            ),
            folder_name: Optional[str] = typer.Option(
                None,
                "--folder", "-f",
                help="Intent folder name (e.g., .fix-login-abc123)"
            ),
            auto_detect: bool = typer.Option(
                False,
                "--auto-detect",
                help="Find and recover all interrupted intents"
            ),
            force_unlock: bool = typer.Option(
                False,
                "--force-unlock",
                help="Force unlock without attempting recovery"
            ),
            nucleus_path: Optional[str] = typer.Option(
                None,
                "-p", "--nucleus-path",
                help="Path to Bloom project (auto-detected if not provided)"
            )
        ):
            """
            Recover interrupted intents using lock state recovery data.
            
            Recovery modes:
            
            1. Single intent recovery (--intent-id or --folder):
               Attempts to recover a specific intent by reopening browser
               at the saved state and resuming the download operation.
            
            2. Auto-detect mode (--auto-detect):
               Scans all intents for active locks and attempts recovery
               for each interrupted intent found.
            
            3. Force unlock (--force-unlock):
               Only releases the lock without attempting recovery.
               Use this when recovery is not needed or not possible.
            """
            
            # 1. Recuperar GlobalContext
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                # 2. Lazy import del Core
                from brain.core.intent.recovery_manager import RecoveryManager
                from pathlib import Path
                
                # 3. Validar inputs
                if not auto_detect and not intent_id and not folder_name:
                    self._handle_error(
                        gc,
                        "Must provide --intent-id, --folder, or use --auto-detect"
                    )
                
                if auto_detect and (intent_id or folder_name):
                    self._handle_error(
                        gc,
                        "Cannot use --auto-detect with --intent-id or --folder"
                    )
                
                # 4. Verbose logging
                if gc.verbose:
                    typer.echo("🔍 Initializing recovery manager...", err=True)
                
                # 5. Ejecutar recovery
                manager = RecoveryManager()
                nucleus = Path(nucleus_path) if nucleus_path else None
                
                if auto_detect:
                    # Auto-detect mode
                    if gc.verbose:
                        typer.echo("🔍 Scanning for interrupted intents...", err=True)
                    
                    data = manager.recover_all(
                        nucleus_path=nucleus,
                        force_unlock=force_unlock
                    )
                else:
                    # Single intent mode
                    if gc.verbose:
                        target = intent_id or folder_name
                        typer.echo(f"🔍 Recovering intent: {target}...", err=True)
                    
                    data = manager.recover_single(
                        intent_id=intent_id,
                        folder_name=folder_name,
                        force_unlock=force_unlock,
                        nucleus_path=nucleus
                    )
                
                # 6. Empaquetar resultado
                result = {
                    "status": "success",
                    "operation": "recover",
                    "data": data
                }
                
                # 7. Output dual
                gc.output(result, self._render_success)
                
            except Exception as e:
                self._handle_error(gc, f"Recovery failed: {e}")
    
    def _render_success(self, data: dict):
        """Output humano para éxito."""
        operation_data = data.get("data", {})
        mode = operation_data.get("mode", "unknown")
        
        if mode == "auto_detect":
            # Auto-detect mode output
            found = operation_data.get("found_count", 0)
            recovered = operation_data.get("recovered_count", 0)
            failed = operation_data.get("failed_count", 0)
            
            typer.echo(f"\n✅ Recovery scan completed")
            typer.echo(f"   📊 Interrupted intents found: {found}")
            typer.echo(f"   ✅ Successfully recovered: {recovered}")
            
            if failed > 0:
                typer.echo(f"   ❌ Failed to recover: {failed}")
            
            # Show details for each recovered intent
            recovered_intents = operation_data.get("recovered_intents", [])
            if recovered_intents:
                typer.echo("\n📋 Recovered intents:")
                for intent in recovered_intents:
                    typer.echo(f"   • {intent['name']} ({intent['id'][:8]}...)")
                    typer.echo(f"     Operation: {intent['operation']}")
            
            # Show failed intents if any
            failed_intents = operation_data.get("failed_intents", [])
            if failed_intents:
                typer.echo("\n⚠️  Failed recoveries:")
                for intent in failed_intents:
                    typer.echo(f"   • {intent['name']} ({intent['id'][:8]}...)")
                    typer.echo(f"     Error: {intent['error']}")
        
        else:
            # Single intent mode output
            intent_id = operation_data.get("intent_id", "unknown")
            intent_name = operation_data.get("intent_name", "unknown")
            recovery_action = operation_data.get("recovery_action", "unknown")
            
            typer.echo(f"\n✅ Intent recovery completed")
            typer.echo(f"   ID: {intent_id}")
            typer.echo(f"   Name: {intent_name}")
            typer.echo(f"   Action: {recovery_action}")
            
            # Show operation-specific details
            if recovery_action == "force_unlocked":
                typer.echo("\n   ℹ️  Lock released without recovery attempt")
            
            elif recovery_action == "download_resumed":
                typer.echo("\n   🌐 Browser reopened for download resume")
                typer.echo(f"   URL: {operation_data.get('chat_url', 'N/A')}")
                typer.echo(f"   Profile: {operation_data.get('profile', 'N/A')}")
                typer.echo("\n   ⏳ Extension will detect recovery and continue download")
            
            elif recovery_action == "merge_resumed":
                typer.echo("\n   🔄 Merge operation recovery initiated")
                typer.echo(f"   Stage: {operation_data.get('stage', 'N/A')}")
            
            elif recovery_action == "no_lock":
                typer.echo("\n   ℹ️  Intent was not locked - nothing to recover")
    
    def _handle_error(self, gc, message: str):
        """Manejo unificado de errores."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)