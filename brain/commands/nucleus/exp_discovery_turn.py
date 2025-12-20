"""
Nucleus exploration discovery turn command.
Add a new discovery turn to an existing exploration intent.
"""
import typer
from pathlib import Path
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class NucleusExpDiscoveryTurnCommand(BaseCommand):
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="exp-discovery-turn",
            category=CommandCategory.NUCLEUS,
            version="1.0.0",
            description="Add a discovery turn to an exploration intent",
            examples=[
                "brain nucleus exp-discovery-turn --intent auth-optimization-a7b2",
                "brain nucleus exp-discovery-turn -i security-audit-b8c3 --notes 'Found issue in API'",
                "brain nucleus exp-discovery-turn -i arch-review-c9d4 -p ./my-nucleus"
            ]
        )
    
    def register(self, app: typer.Typer):
        @app.command("exp-discovery-turn")
        def exp_discovery_turn(
            ctx: typer.Context,
            intent: str = typer.Option(..., "--intent", "-i", help="Intent ID or slug"),
            path: Optional[Path] = typer.Option(None, "--path", "-p", help="Nucleus path (default: current dir)"),
            notes: Optional[str] = typer.Option(None, "--notes", help="Turn notes/observations"),
            analysis: Optional[str] = typer.Option(None, "--analysis", help="Analysis summary for this turn")
        ):
            """
            Add a discovery turn to an exploration intent.
            
            Discovery turns are iterative exploration sessions where you:
            - Analyze findings from previous turn
            - Ask new questions
            - Dive deeper into specific areas
            - Build towards final findings
            
            Each turn creates:
            - .discovery/.turn_X/ directory
            - .turn.json with notes and analysis
            - .context_exp_plan.json for this turn
            - .files/ directory for turn-specific files
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
                    typer.echo(f"🔄 Adding discovery turn to intent '{intent}'...", err=True)
                
                # 4. Execute business logic
                manager = NucleusManager(target_path)
                result = manager.add_discovery_turn(
                    intent_id=intent,
                    notes=notes,
                    analysis=analysis,
                    on_progress=lambda msg: typer.echo(f"  → {msg}", err=True) if gc.verbose else None
                )
                
                # Add operation metadata
                result["status"] = "success"
                result["operation"] = "exp-discovery-turn"
                
                # 5. Smart output
                gc.output(result, self._render_success)
                
            except FileNotFoundError as e:
                self._handle_error(gc, f"Intent not found: {e}")
            except ValueError as e:
                self._handle_error(gc, f"Invalid state: {e}")
            except Exception as e:
                self._handle_error(gc, str(e))
    
    def _render_success(self, data: dict):
        """Render success output for humans."""
        typer.echo(f"\n✅ Discovery Turn Created!")
        typer.echo(f"🔬 Intent: {data.get('intent_name')}")
        typer.echo(f"🔄 Turn: {data.get('turn_number')}")
        typer.echo(f"📁 Path: {data.get('turn_path')}")
        
        if data.get('notes'):
            typer.echo(f"\n📝 Notes: {data.get('notes')}")
        
        if data.get('previous_turns'):
            typer.echo(f"\n📊 Progress: {data.get('turn_number')} of ? turns")
            typer.echo(f"   Previous turns: {data.get('previous_turns')}")
        
        typer.echo(f"\n📝 Files created: {len(data.get('files_created', []))}")
        typer.echo(f"\n💡 Next steps:")
        typer.echo(f"  1. Edit turn analysis: {data.get('turn_file')}")
        typer.echo(f"  2. Continue discovery or move to findings")
        typer.echo(f"  3. Use: brain nucleus exp-export-findings -i {data.get('intent_id')}")
    
    def _handle_error(self, gc, message: str):
        """Handle errors with dual output mode."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ Error: {message}", err=True)
        raise typer.Exit(code=1)