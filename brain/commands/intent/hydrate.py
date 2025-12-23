"""
Intent hydration command.
Populates the intent with initial context (codebase & briefing).
"""

import typer
from pathlib import Path
from typing import List, Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory

class HydrateCommand(BaseCommand):
    """
    Command to hydrate an intent with files and instructions.
    
    This is Step 2 of the Intent Lifecycle:
    Create -> [Hydrate] -> Plan -> Build -> Submit -> Merge
    """
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="hydrate",
            category=CommandCategory.INTENT,
            version="1.0.0",
            description="Populate intent with code context and briefing",
            examples=[
                "brain intent hydrate --id <UUID> --briefing 'Fix the login bug'",
                "brain intent hydrate --id <UUID> --files src/auth.py,src/login.js",
                "brain intent hydrate --folder .fix-login-x1y2 --briefing-file ./prompt.md"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        @app.command(name=self.metadata().name)
        def execute(
            ctx: typer.Context,
            intent_id: Optional[str] = typer.Option(None, "--id", "-i", help="Intent UUID"),
            folder_name: Optional[str] = typer.Option(None, "--folder", "-f", help="Intent folder name"),
            briefing: Optional[str] = typer.Option(None, "--briefing", "-b", help="Briefing text (instruction)"),
            briefing_file: Optional[Path] = typer.Option(None, "--briefing-file", "-B", help="Path to text file containing briefing"),
            files: Optional[List[str]] = typer.Option(None, "--files", "-F", help="Files to include in context (comma-separated)"),
            nucleus_path: Optional[Path] = typer.Option(None, "--nucleus-path", "-p", help="Path to Bloom project root"),
        ):
            """
            Hydrate an intent by processing source files and briefing.
            
            This command:
            1. Locates the intent (by ID or Folder).
            2. Reads and compresses specified source files.
            3. Generates .codebase.json (content) and .codebase_index.json (structure).
            4. Updates the .briefing.json with the user's request.
            """
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                # 1. Validation
                if not intent_id and not folder_name:
                    self._handle_error(gc, "Must provide either --id or --folder")

                # 2. Prepare Briefing
                final_briefing = ""
                if briefing:
                    final_briefing = briefing
                elif briefing_file:
                    if not briefing_file.exists():
                        self._handle_error(gc, f"Briefing file not found: {briefing_file}")
                    final_briefing = briefing_file.read_text(encoding='utf-8')
                
                # 3. Prepare Files list
                file_list = []
                if files:
                    for f in files:
                        if "," in f:
                            file_list.extend([x.strip() for x in f.split(",") if x.strip()])
                        else:
                            file_list.append(f.strip())

                # 4. Lazy Import Core
                from brain.core.intent_manager import IntentManager
                
                if gc.verbose:
                    typer.echo(f"💧 Hydrating intent...", err=True)
                    if file_list:
                        typer.echo(f"   Processing {len(file_list)} files", err=True)

                # 5. Execute Core Logic
                manager = IntentManager()
                data = manager.hydrate_intent(
                    intent_id=intent_id,
                    folder_name=folder_name,
                    briefing=final_briefing,
                    files=file_list,
                    nucleus_path=nucleus_path,
                    verbose=gc.verbose
                )
                
                # 6. Output
                result = {
                    "status": "success",
                    "operation": "intent_hydrate",
                    "data": data
                }
                gc.output(result, self._render_success)

            except Exception as e:
                self._handle_error(gc, str(e))

    def _render_success(self, data: dict):
        d = data.get("data", {})
        typer.echo(f"\n✅ Intent Hydrated Successfully")
        typer.echo(f"   ID: {d.get('intent_id')}")
        typer.echo(f"   Status: {d.get('status')}")
        typer.echo(f"   Files Processed: {d.get('stats', {}).get('total_files', 0)}")
        typer.echo(f"   Context Size: {d.get('stats', {}).get('total_size_kb', 0)} KB")
        if d.get("briefing_updated"):
            typer.echo(f"   Briefing: Updated")
    
    def _handle_error(self, gc, message: str):
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)