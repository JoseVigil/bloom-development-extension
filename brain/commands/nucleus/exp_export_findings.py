"""
Nucleus exploration findings export command.
Export findings from an exploration intent to visible reports.
"""
import typer
from pathlib import Path
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class NucleusExpExportFindingsCommand(BaseCommand):
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="exp-export-findings",
            category=CommandCategory.NUCLEUS,
            version="1.0.0",
            description="Export findings from an exploration intent",
            examples=[
                "brain nucleus exp-export-findings --intent auth-optimization-a7b2",
                "brain nucleus exp-export-findings -i security-audit-b8c3 --format pdf",
                "brain nucleus exp-export-findings -i arch-review-c9d4 --include-raw"
            ]
        )
    
    def register(self, app: typer.Typer):
        @app.command("exp-export-findings")
        def exp_export_findings(
            ctx: typer.Context,
            intent: str = typer.Option(..., "--intent", "-i", help="Intent ID or slug"),
            path: Optional[Path] = typer.Option(None, "--path", "-p", help="Nucleus path (default: current dir)"),
            format: str = typer.Option("markdown", "--format", "-f", help="Export format (markdown, json)"),
            include_raw: bool = typer.Option(False, "--include-raw", help="Include raw turn data")
        ):
            """
            Export findings from an exploration intent.
            
            Generates visible reports in findings/ directory:
            - report.md - Markdown report with all findings
            - data.json - Structured data for programmatic access
            - report.pdf - PDF version (if format=pdf)
            
            The export includes:
            - Summary of inquiry
            - Key discoveries from all turns
            - Cross-project insights
            - Recommendations
            - Optional: Raw turn data
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
                    typer.echo(f"📤 Exporting findings from intent '{intent}'...", err=True)
                
                # Validate format
                valid_formats = ["markdown", "json", "pdf"]
                if format not in valid_formats:
                    raise ValueError(f"Invalid format '{format}'. Valid: {', '.join(valid_formats)}")
                
                # 4. Execute business logic
                manager = NucleusManager(target_path)
                result = manager.export_findings(
                    intent_id=intent,
                    export_format=format,
                    include_raw=include_raw,
                    on_progress=lambda msg: typer.echo(f"  → {msg}", err=True) if gc.verbose else None
                )
                
                # Add operation metadata
                result["status"] = "success"
                result["operation"] = "exp-export-findings"
                
                # 5. Smart output
                gc.output(result, self._render_success)
                
            except FileNotFoundError as e:
                self._handle_error(gc, f"Intent not found: {e}")
            except ValueError as e:
                self._handle_error(gc, f"Invalid input: {e}")
            except Exception as e:
                self._handle_error(gc, str(e))
    
    def _render_success(self, data: dict):
        """Render success output for humans."""
        typer.echo(f"\n✅ Findings Exported Successfully!")
        typer.echo(f"🔬 Intent: {data.get('intent_name')}")
        typer.echo(f"📊 Total turns: {data.get('total_turns')}")
        typer.echo(f"📁 Export directory: {data.get('export_dir')}")
        
        typer.echo(f"\n📄 Generated files:")
        for file_info in data.get('exported_files', []):
            typer.echo(f"  • {file_info['name']} ({file_info['size']})")
        
        if data.get('key_discoveries'):
            discoveries = data.get('key_discoveries', [])
            typer.echo(f"\n🔍 Key Discoveries ({len(discoveries)}):")
            for discovery in discoveries[:3]:
                typer.echo(f"  • {discovery}")
            if len(discoveries) > 3:
                typer.echo(f"  ... and {len(discoveries) - 3} more")
        
        typer.echo(f"\n💡 Files are ready to share:")
        typer.echo(f"   {data.get('export_dir')}/report.md")
        typer.echo(f"   {data.get('export_dir')}/data.json")
    
    def _handle_error(self, gc, message: str):
        """Handle errors with dual output mode."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ Error: {message}", err=True)
        raise typer.Exit(code=1)