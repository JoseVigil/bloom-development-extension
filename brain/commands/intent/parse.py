"""
Intent parse command - Parse and validate .raw_output.json from AI responses.

This module provides CLI functionality to parse AI response files, validate
the Bloom protocol structure, and generate comprehensive parse reports.
"""

import typer
from pathlib import Path
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class IntentParseCommand(BaseCommand):
    """
    Parse and validate .raw_output.json from AI responses.
    
    This command reads the raw JSON output from an AI provider, validates
    the Bloom protocol structure, checks file references, analyzes completion
    status, and generates a detailed parse report.
    """
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="parse",
            category=CommandCategory.INTENT,
            version="1.0.0",
            description="Parse and validate .raw_output.json against Bloom protocol",
            examples=[
                "brain intent parse --intent-id abc-123",
                "brain intent parse --intent-id abc-123 --stage briefing",
                "brain intent parse --intent-id abc-123 --strict --json"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        """
        Registers the parse command in the Typer application.
        """
        @app.command(name=self.metadata().name)
        def execute(
            ctx: typer.Context,
            intent_id: str = typer.Option(
                ...,
                "--intent-id", "-i",
                help="Intent UUID to parse"
            ),
            stage: Optional[str] = typer.Option(
                None,
                "--stage", "-s",
                help="Pipeline stage (briefing, execution, refinement_X). Auto-detect if not provided."
            ),
            strict: bool = typer.Option(
                False,
                "--strict",
                help="Fail on any protocol violation (no fallback parser)"
            ),
            output_report: bool = typer.Option(
                True,
                "--output-report",
                help="Generate .parse_report.json"
            ),
            nucleus_path: Optional[Path] = typer.Option(
                None,
                "--nucleus-path", "-n",
                help="Path to nucleus root (default: current directory)"
            )
        ):
            """
            Parse and validate .raw_output.json from an AI response.
            
            This command:
            1. Locates the .raw_output.json file for the specified intent
            2. Validates the Bloom protocol structure
            3. Checks that all referenced files exist
            4. Analyzes completion status and questions
            5. Generates a comprehensive parse report
            """
            
            # 1. Recover GlobalContext
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                # 2. Lazy import of core logic
                from brain.core.intent.response_parser import ResponseParser
                
                # 3. Verbose logging
                if gc.verbose:
                    typer.echo(f"📄 Parsing intent: {intent_id}", err=True)
                    if stage:
                        typer.echo(f"🎯 Target stage: {stage}", err=True)
                    if strict:
                        typer.echo("⚠️  Strict mode enabled", err=True)
                
                # 4. Execute core logic
                parser = ResponseParser(
                    intent_id=intent_id,
                    nucleus_path=nucleus_path or Path.cwd()
                )
                
                report = parser.parse(
                    stage=stage,
                    strict=strict,
                    generate_report=output_report
                )
                
                # 5. Package result
                result = {
                    "status": "success",
                    "operation": "intent_parse",
                    "data": {
                        "intent_id": intent_id,
                        "stage": report["stage"],
                        "protocol_valid": report["protocol_validation"]["valid"],
                        "files_found": report["files_validation"]["found"],
                        "files_missing": report["files_validation"]["missing"],
                        "completion_status": report["completion_analysis"]["status"],
                        "requires_action": report["completion_analysis"]["requires_action"],
                        "has_questions": report["questions_analysis"]["has_questions"],
                        "requires_user_input": report["questions_analysis"]["requires_user_input"],
                        "parse_report_path": str(report.get("report_path", "")) if output_report else None,
                        "errors": report["errors"],
                        "warnings": report["warnings"]
                    }
                }
                
                # 6. Dual output
                gc.output(result, self._render_success)
                
            except FileNotFoundError as e:
                self._handle_error(gc, f"File not found: {e}")
            except ValueError as e:
                self._handle_error(gc, f"Validation error: {e}")
            except Exception as e:
                self._handle_error(gc, f"Parse failed: {e}")
    
    def _render_success(self, data: dict):
        """Human-friendly output for successful parse."""
        parsed_data = data["data"]
        
        typer.echo(f"\n📄 Intent Parse Report")
        typer.echo(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        typer.echo(f"Intent ID: {parsed_data['intent_id']}")
        typer.echo(f"Stage: {parsed_data['stage']}")
        typer.echo()
        
        # Protocol validation
        if parsed_data['protocol_valid']:
            typer.echo("✅ Protocol Validation")
        else:
            typer.echo("❌ Protocol Validation")
        
        if parsed_data['errors']:
            typer.echo(f"   Errors: {len(parsed_data['errors'])}")
            for error in parsed_data['errors']:
                typer.echo(f"   • {error}")
        else:
            typer.echo("   Errors: 0")
        
        if parsed_data['warnings']:
            typer.echo(f"   Warnings: {len(parsed_data['warnings'])}")
            for warning in parsed_data['warnings']:
                typer.echo(f"   • {warning}")
        else:
            typer.echo("   Warnings: 0")
        
        typer.echo()
        
        # Files validation
        total_files = parsed_data['files_found'] + parsed_data['files_missing']
        if parsed_data['files_missing'] == 0:
            typer.echo("✅ Files Validation")
        else:
            typer.echo("⚠️  Files Validation")
        
        typer.echo(f"   Total: {total_files}")
        typer.echo(f"   Found: {parsed_data['files_found']}")
        typer.echo(f"   Missing: {parsed_data['files_missing']}")
        typer.echo()
        
        # Completion analysis
        typer.echo("📊 Completion Analysis")
        typer.echo(f"   Status: {parsed_data['completion_status']}")
        typer.echo(f"   Requires Action: {'Yes' if parsed_data['requires_action'] else 'No'}")
        typer.echo()
        
        # Questions analysis
        if parsed_data['has_questions']:
            typer.echo("❓ Questions Analysis")
            typer.echo(f"   Has Questions: Yes")
            typer.echo(f"   Requires User Input: {'Yes' if parsed_data['requires_user_input'] else 'No'}")
            typer.echo()
        
        # Parse report path
        if parsed_data['parse_report_path']:
            typer.echo(f"✅ Parse report saved: {parsed_data['parse_report_path']}")
            typer.echo()
        
        # Next steps
        if parsed_data['requires_action']:
            typer.echo("💡 Next: Review completion status and take appropriate action")
        elif parsed_data['requires_user_input']:
            typer.echo("💡 Next: Review questions and provide answers")
        else:
            typer.echo(f"💡 Next: brain intent stage --intent-id {parsed_data['intent_id']}")
    
    def _handle_error(self, gc, message: str):
        """Unified error handling."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({
                "status": "error",
                "operation": "intent_parse",
                "message": message
            }))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)