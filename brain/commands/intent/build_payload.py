"""
summary: CLI command for building optimized AI payloads from context plans
keywords: cli, command, payload, builder, context, optimization, files

Build Payload Command.
Constructs optimized payloads for AI consumption from generated context plans.
"""

import typer
import json
from pathlib import Path
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class BuildPayloadCommand(BaseCommand):
    """
    Build optimized payload from context plan.
    """
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="build-payload",
            category=CommandCategory.INTENT,
            version="1.0.0",
            description="Build optimized AI payload from context plan",
            examples=[
                "brain intent build-payload --plan .bloom/.intents/.dev/.uuid/.briefing/.context_plan.json",
                "brain intent build-payload --plan .context_plan.json --output .payload.json",
                "brain intent build-payload --plan .context_plan.json --json"
            ]
        )
    
    def register(self, app: typer.Typer) -> None:
        """Register the build-payload command."""
        
        @app.command(name=self.metadata().name)
        def execute(
            ctx: typer.Context,
            plan: str = typer.Option(
                ...,
                "--plan",
                help="Path to context_plan.json"
            ),
            output: Optional[str] = typer.Option(
                None,
                "--output",
                help="Output path for payload (default: same dir as plan)"
            )
        ):
            """Build optimized AI payload from context plan."""
            
            # 1. Recuperar GlobalContext
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            # Validate plan file
            plan_path = Path(plan)
            if not plan_path.exists():
                self._handle_error(gc, f"Context plan not found: {plan}")
            
            try:
                # 2. Lazy imports
                from brain.core.context_planning.payload_builder import PayloadBuilder
                
                # 3. Verbose logging
                if gc.verbose:
                    typer.echo("📦 Building payload from context plan...", err=True)
                    typer.echo(f"   Plan: {plan}", err=True)
                
                # 4. Load context plan
                with open(plan_path, 'r', encoding='utf-8') as f:
                    context_plan = json.load(f)
                
                # 5. Find codebase and docbase
                intent_dir = plan_path.parent.parent  # Go up from .briefing/
                codebase_json, docbase_json = self._find_compressed_files(intent_dir)
                
                if not codebase_json:
                    self._handle_error(gc, "No .codebase.json found in intent directory")
                
                if gc.verbose:
                    typer.echo(f"   📊 Codebase: {codebase_json}", err=True)
                    if docbase_json:
                        typer.echo(f"   📚 Docbase: {docbase_json}", err=True)
                
                # 6. Build payload
                if gc.verbose:
                    typer.echo("   🔧 Extracting and assembling files...", err=True)
                
                builder = PayloadBuilder(codebase_json, docbase_json)
                payload = builder.build_from_plan(context_plan)
                
                if gc.verbose:
                    typer.echo("   ✅ Payload built", err=True)
                
                # 7. Determine output path
                if output:
                    output_path = Path(output)
                else:
                    output_path = plan_path.parent / ".payload.json"
                
                # 8. Save payload
                builder.save_payload(payload, output_path)
                
                if gc.verbose:
                    typer.echo(f"   💾 Saved to: {output_path}", err=True)
                
                # 9. Prepare result
                result = {
                    "status": "success",
                    "operation": "build_payload",
                    "data": {
                        "plan_path": plan,
                        "payload_path": str(output_path),
                        "stats": {
                            "total_files": payload["metadata"]["total_files"],
                            "total_tokens": payload["metadata"]["total_tokens"],
                            "breakdown": payload["metadata"]["breakdown_by_tier"]
                        }
                    }
                }
                
                # 10. Output dual
                gc.output(result, self._render_success)
                
            except FileNotFoundError as e:
                self._handle_error(gc, f"File not found: {e}")
            except json.JSONDecodeError as e:
                self._handle_error(gc, f"Invalid JSON in context plan: {e}")
            except Exception as e:
                self._handle_error(gc, f"Payload building failed: {e}")
    
    def _find_compressed_files(self, intent_dir: Path) -> tuple[Optional[Path], Optional[Path]]:
        """
        Find .codebase.json and .docbase.json in intent directory.
        
        Returns:
            Tuple of (codebase_path, docbase_path)
        """
        codebase_json = None
        docbase_json = None
        
        # Try briefing phase first
        briefing_files = intent_dir / ".briefing" / ".files"
        if briefing_files.exists():
            codebase = briefing_files / ".codebase.json"
            docbase = briefing_files / ".docbase.json"
            
            if codebase.exists():
                codebase_json = codebase
            if docbase.exists():
                docbase_json = docbase
        
        # If not found, try execution phase
        if not codebase_json:
            execution_files = intent_dir / ".execution" / ".files"
            if execution_files.exists():
                codebase = execution_files / ".codebase.json"
                docbase = execution_files / ".docbase.json"
                
                if codebase.exists():
                    codebase_json = codebase
                if docbase.exists():
                    docbase_json = docbase
        
        # If still not found, try latest refinement
        if not codebase_json:
            refinement_dir = intent_dir / ".refinement"
            if refinement_dir.exists():
                turns = sorted(refinement_dir.glob(".turn_*"))
                if turns:
                    latest_files = turns[-1] / ".files"
                    codebase = latest_files / ".codebase.json"
                    docbase = latest_files / ".docbase.json"
                    
                    if codebase.exists():
                        codebase_json = codebase
                    if docbase.exists():
                        docbase_json = docbase
        
        return codebase_json, docbase_json
    
    def _render_success(self, data: dict):
        """Output humano para éxito."""
        operation_data = data['data']
        stats = operation_data['stats']
        breakdown = stats['breakdown']
        
        typer.echo(f"✅ Payload built successfully")
        typer.echo(f"📦 Output: {operation_data['payload_path']}")
        typer.echo(f"\n📊 Payload Statistics:")
        typer.echo(f"   • Total files:  {stats['total_files']}")
        typer.echo(f"   • Total tokens: {stats['total_tokens']:,}")
        typer.echo(f"\n🎯 Breakdown by Priority:")
        typer.echo(f"   • CRITICAL: {breakdown['critical']['count']} files ({breakdown['critical']['tokens']:,} tokens)")
        typer.echo(f"   • HIGH:     {breakdown['high']['count']} files ({breakdown['high']['tokens']:,} tokens)")
        typer.echo(f"   • MEDIUM:   {breakdown['medium']['count']} files ({breakdown['medium']['tokens']:,} tokens)")
        typer.echo(f"\n💡 Payload ready for AI consumption")
    
    def _handle_error(self, gc, message: str):
        """Manejo unificado de errores."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)
