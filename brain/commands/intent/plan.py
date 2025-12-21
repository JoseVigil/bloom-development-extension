"""
summary: CLI command for generating AI context plans with intelligent file prioritization
keywords: cli, command, context, planning, intent, gemini, prioritization

Context Plan Command.
Generates optimized context plans for AI intents using Gemini-powered prioritization.
"""

import typer
import asyncio
from pathlib import Path
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class PlanCommand(BaseCommand):
    """
    Generate context plan for an intent using Gemini Router.
    """
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="plan",
            category=CommandCategory.INTENT,
            version="1.0.0",
            description="Generate AI context plan with intelligent file prioritization",
            examples=[
                "brain intent plan --intent-dir .bloom/.intents/.dev/.uuid/ --description 'Fix compression bug'",
                "brain intent plan --intent-dir .bloom/.intents/.doc/.uuid/ --description 'Document API' --type doc",
                "brain intent plan --intent-dir .bloom/.intents/.dev/.uuid/ --description 'Add auth' --json"
            ]
        )
    
    def register(self, app: typer.Typer) -> None:
        """Register the plan command."""
        
        @app.command(name=self.metadata().name)
        def execute(
            ctx: typer.Context,
            intent_dir: str = typer.Option(
                ...,
                "--intent-dir",
                help="Intent directory path"
            ),
            description: str = typer.Option(
                ...,
                "--description",
                help="Intent description"
            ),
            intent_type: str = typer.Option(
                "dev",
                "--type",
                help="Intent type: dev, doc, or seed"
            )
        ):
            """Generate context plan for an intent using Gemini Router."""
            
            # 1. Recuperar GlobalContext
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            # Validate intent type
            if intent_type not in ["dev", "doc", "seed"]:
                self._handle_error(gc, f"Invalid intent type: {intent_type}. Use: dev, doc, or seed")
            
            # Validate intent directory
            intent_path = Path(intent_dir)
            if not intent_path.exists():
                self._handle_error(gc, f"Intent directory not found: {intent_dir}")
            
            try:
                # 2. Lazy imports
                from brain.core.context_planning.enriched_tree_generator import EnrichedTreeGenerator
                from brain.core.context_planning.gemini_router import GeminiRouter
                from brain.shared.credentials import NoAvailableKeysError, GeminiAPIError
                
                # 3. Verbose logging
                if gc.verbose:
                    typer.echo("🧠 Context Planning Pipeline Started", err=True)
                    typer.echo(f"   Intent: {description}", err=True)
                    typer.echo(f"   Type: {intent_type}", err=True)
                
                # 4. Find codebase index
                codebase_index = self._find_codebase_index(intent_path)
                if not codebase_index:
                    self._handle_error(gc, "No .codebase_index.json found in intent directory")
                
                if gc.verbose:
                    typer.echo(f"   📊 Codebase index: {codebase_index}", err=True)
                
                # 5. Generate enriched tree
                if gc.verbose:
                    typer.echo("   🌳 Generating enriched tree...", err=True)
                
                root_path = codebase_index.parent.parent.parent.parent.parent  # Go up to project root
                generator = EnrichedTreeGenerator(root_path)
                enriched_tree = generator.generate()
                
                if gc.verbose:
                    typer.echo(f"   ✅ Enriched tree generated ({len(enriched_tree)} chars)", err=True)
                
                # 6. Call Gemini Router (async)
                if gc.verbose:
                    typer.echo("   🤖 Calling Gemini Router...", err=True)
                
                router = GeminiRouter()
                context_plan = asyncio.run(
                    router.create_context_plan(enriched_tree, description, intent_type)
                )
                
                if gc.verbose:
                    typer.echo("   ✅ Context plan generated", err=True)
                
                # 7. Save context plan
                output_path = intent_path / ".briefing" / ".context_plan.json"
                output_path.parent.mkdir(parents=True, exist_ok=True)
                
                import json
                with open(output_path, 'w', encoding='utf-8') as f:
                    json.dump(context_plan, f, indent=2, ensure_ascii=False)
                
                if gc.verbose:
                    typer.echo(f"   💾 Saved to: {output_path}", err=True)
                
                # 8. Prepare result
                result = {
                    "status": "success",
                    "operation": "context_plan",
                    "data": {
                        "intent_dir": intent_dir,
                        "intent_type": intent_type,
                        "plan_path": str(output_path),
                        "stats": {
                            "critical_files": len(context_plan.get("priority_tiers", {}).get("critical", [])),
                            "high_files": len(context_plan.get("priority_tiers", {}).get("high", [])),
                            "medium_files": len(context_plan.get("priority_tiers", {}).get("medium", [])),
                            "estimated_tokens": context_plan.get("metadata", {}).get("estimated_tokens", {}).get("total", 0)
                        }
                    }
                }
                
                # 9. Output dual
                gc.output(result, self._render_success)
                
            except NoAvailableKeysError:
                self._handle_no_keys_error(gc)
            except GeminiAPIError as e:
                self._handle_api_error(gc, str(e))
            except FileNotFoundError as e:
                self._handle_error(gc, f"File not found: {e}")
            except Exception as e:
                self._handle_error(gc, f"Context planning failed: {e}")
    
    def _find_codebase_index(self, intent_path: Path) -> Optional[Path]:
        """Find .codebase_index.json in intent directory."""
        # Try briefing phase first
        briefing_index = intent_path / ".briefing" / ".files" / ".codebase_index.json"
        if briefing_index.exists():
            return briefing_index
        
        # Try execution phase
        execution_index = intent_path / ".execution" / ".files" / ".codebase_index.json"
        if execution_index.exists():
            return execution_index
        
        # Try refinement phases
        refinement_dir = intent_path / ".refinement"
        if refinement_dir.exists():
            turns = sorted(refinement_dir.glob(".turn_*"))
            if turns:
                latest_index = turns[-1] / ".files" / ".codebase_index.json"
                if latest_index.exists():
                    return latest_index
        
        return None
    
    def _render_success(self, data: dict):
        """Output humano para éxito."""
        operation_data = data['data']
        stats = operation_data['stats']
        
        typer.echo(f"✅ Context plan generated successfully")
        typer.echo(f"📄 Saved to: {operation_data['plan_path']}")
        typer.echo(f"\n📊 Priority Breakdown:")
        typer.echo(f"   • CRITICAL: {stats['critical_files']} files")
        typer.echo(f"   • HIGH:     {stats['high_files']} files")
        typer.echo(f"   • MEDIUM:   {stats['medium_files']} files")
        typer.echo(f"\n🎯 Estimated tokens: {stats['estimated_tokens']:,}")
        typer.echo(f"\n💡 Next step: brain intent build-payload --plan {operation_data['plan_path']}")
    
    def _handle_no_keys_error(self, gc):
        """Error específico: sin keys disponibles."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({
                "status": "error",
                "error_type": "no_keys",
                "message": "No Gemini keys available with sufficient quota",
                "suggestions": [
                    "brain gemini keys-add --profile 'Name' --key 'AIza...'",
                    "brain gemini keys-stats  # Check quotas"
                ]
            }))
        else:
            typer.echo("❌ No Gemini keys available with sufficient quota", err=True)
            typer.echo("", err=True)
            typer.echo("💡 Solutions:", err=True)
            typer.echo("   • Add keys: brain gemini keys-add --profile 'Name' --key 'AIza...'", err=True)
            typer.echo("   • Check status: brain gemini keys-stats", err=True)
            typer.echo("   • Wait for daily quota reset (midnight PST)", err=True)
        raise typer.Exit(code=1)
    
    def _handle_api_error(self, gc, message: str):
        """Error específico: API failure."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({
                "status": "error",
                "error_type": "api_error",
                "message": f"Gemini API error: {message}"
            }))
        else:
            typer.echo(f"❌ Gemini API error: {message}", err=True)
        raise typer.Exit(code=1)
    
    def _handle_error(self, gc, message: str):
        """Manejo unificado de errores."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)
