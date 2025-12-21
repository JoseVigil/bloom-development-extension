"""
Project info command - Inspect individual Bloom project metadata.

Path: brain/commands/project/info.py
Action: CREATE NEW FILE
"""

import typer
from pathlib import Path
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class ProjectInfoCommand(BaseCommand):
    """
    Inspect and display comprehensive information about a Bloom project.
    """
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="info",
            category=CommandCategory.PROJECT,
            version="2.0.0",
            description="Inspect and display Bloom project metadata",
            examples=[
                "brain project info",
                "brain project info --path ./my-project",
                "brain project info --show-intents"
            ]
        )
    
    def register(self, app: typer.Typer) -> None:
        @app.command(name="info")
        def info(
            ctx: typer.Context,
            path: Optional[Path] = typer.Option(
                None,
                "--path",
                "-p",
                help="Project root path (default: current directory)"
            ),
            show_intents: bool = typer.Option(
                False,
                "--show-intents",
                help="Show list of intents in the project"
            ),
            show_tree: bool = typer.Option(
                False,
                "--show-tree",
                help="Show project tree structure"
            )
        ):
            """
            Inspect and display comprehensive information about a Bloom project.
            
            Shows project metadata, strategy, intents, and directory structure
            from the .bloom/.project/ directory.
            """
            
            # 1. Get Global Context
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                # 2. Lazy Import
                from brain.core.bloom_project_inspector import BloomProjectInspector
                
                target_path = path or Path.cwd()
                
                # 3. Verbose logging
                if gc.verbose:
                    typer.echo(f"🔍 Inspecting project at {target_path}...", err=True)
                
                # 4. Execute business logic
                inspector = BloomProjectInspector(target_path)
                info_data = inspector.get_project_info()
                
                # Add intent list if requested
                if show_intents:
                    info_data["intents"] = inspector.get_intents_list()
                
                # Add tree if requested
                if show_tree:
                    info_data["tree"] = inspector.get_tree_structure()
                
                # Add operation metadata
                result = {
                    "status": "success",
                    "operation": "project_info",
                    "data": info_data
                }
                
                # 5. Smart output
                gc.output(result, self._render_success)
                
            except FileNotFoundError as e:
                self._handle_error(gc, f"Bloom project not found: {e}")
            except Exception as e:
                self._handle_error(gc, f"Error reading project info: {e}")
    
    def _render_success(self, data: dict):
        """Render success output for humans."""
        info = data.get("data", {})
        
        # Header
        typer.echo("\n" + "="*70)
        typer.echo(f"🌸 BLOOM PROJECT: {info.get('name', 'Unknown')}")
        typer.echo("="*70 + "\n")
        
        # Basic Info
        typer.echo("📋 PROJECT INFO")
        typer.echo(f"  Name:      {info.get('name', 'N/A')}")
        typer.echo(f"  Path:      {info.get('path', 'N/A')}")
        typer.echo(f"  Strategy:  {info.get('strategy', 'N/A')}")
        typer.echo(f"  Version:   {info.get('version', 'N/A')}\n")
        
        # Metadata
        metadata = info.get("metadata", {})
        if metadata:
            typer.echo("🏷️  METADATA")
            typer.echo(f"  Type:      {metadata.get('type', 'N/A')}")
            typer.echo(f"  Created:   {metadata.get('created_at', 'N/A')}")
            typer.echo(f"  Updated:   {metadata.get('updated_at', 'N/A')}\n")
        
        # Strategy Info
        strategy_info = info.get("strategy_info", {})
        if strategy_info:
            typer.echo("🎯 STRATEGY")
            typer.echo(f"  Type:      {strategy_info.get('type', 'N/A')}")
            typer.echo(f"  Context:   {strategy_info.get('context_file', 'N/A')}")
            typer.echo(f"  Standards: {strategy_info.get('standards_file', 'N/A')}\n")
        
        # Intents
        intents = info.get("intents", [])
        if intents is not None:
            typer.echo(f"🎯 INTENTS ({len(intents)} total)")
            if intents:
                typer.echo("-" * 70)
                for intent in intents[:5]:  # Show first 5
                    name = intent.get("intent_name", "Unknown")
                    type_ = intent.get("type", "unknown")
                    status = intent.get("status", "unknown")
                    
                    status_icon = {
                        "briefing": "📝",
                        "execution": "⚙️",
                        "refinement": "🔄",
                        "completed": "✅"
                    }.get(status, "❓")
                    
                    typer.echo(f"  {status_icon} [{type_:3s}] {name}")
                    typer.echo(f"     Status: {status}")
                
                if len(intents) > 5:
                    typer.echo(f"\n  ... and {len(intents) - 5} more intents")
            else:
                typer.echo("  No intents found.")
            typer.echo()
        
        # Tree structure
        tree = info.get("tree")
        if tree:
            typer.echo("📂 PROJECT TREE")
            typer.echo("-" * 70)
            typer.echo(tree)
            typer.echo()
        
        # Structure validation
        validation = info.get("structure_validation", {})
        if validation:
            is_valid = validation.get("valid", False)
            icon = "✅" if is_valid else "⚠️"
            typer.echo(f"{icon} STRUCTURE VALIDATION: {'Valid' if is_valid else 'Issues found'}")
            
            missing = validation.get("missing", [])
            if missing:
                typer.echo(f"  Missing: {', '.join(missing)}")
            typer.echo()
        
        typer.echo("="*70 + "\n")
    
    def _handle_error(self, gc, message: str):
        """Handle errors with dual output mode."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)