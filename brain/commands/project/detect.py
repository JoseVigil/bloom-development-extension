"""
Command to detect projects within a parent directory.
"""

import typer
from pathlib import Path
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class ProjectDetectCommand(BaseCommand):
    """
    Scans a parent directory and automatically detects all projects within it,
    identifying their type using the MultiStackDetector system.
    """
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="detect",
            category=CommandCategory.PROJECT,
            version="1.0.0",
            description="Scan directory and detect project types automatically",
            examples=[
                "brain project detect .",
                "brain project detect /path/to/projects",
                "brain project detect . --max-depth 2",
                "brain project detect . --strategy android",
                "brain project detect . --json",
                "brain project detect . --strategy typescript --min-confidence high"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        """
        Registers the detect command in the Typer application.
        """
        @app.command(name=self.metadata().name)
        def execute(
            ctx: typer.Context,
            parent_path: str = typer.Argument(
                ".",
                help="Parent directory to scan for projects"
            ),
            max_depth: int = typer.Option(
                3,
                "--max-depth",
                "-d",
                help="Maximum depth for recursive scanning"
            ),
            strategy: Optional[str] = typer.Option(
                None,
                "--strategy",
                "-s",
                help="Filter projects by strategy type"
            ),
            min_confidence: Optional[str] = typer.Option(
                None,
                "--min-confidence",
                "-c",
                help="Filter by minimum confidence level (high, medium, low)"
            )
        ):
            """Scan directory and detect project types automatically."""
            
            # 1. Recover GlobalContext
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                # 2. Lazy Import of Core
                from brain.core.project.scanner import ProjectScanner
                
                # 3. Validate parent_path
                path = Path(parent_path).resolve()
                
                if not path.exists():
                    self._handle_error(gc, f"Path does not exist: {parent_path}")
                
                if not path.is_dir():
                    self._handle_error(gc, f"Path is not a directory: {parent_path}")
                
                # 4. Verbose logging
                if gc.verbose:
                    typer.echo(f"🔍 Scanning {path} (max depth: {max_depth})...", err=True)
                    if strategy:
                        typer.echo(f"📋 Filtering by strategy: {strategy}", err=True)
                    if min_confidence:
                        typer.echo(f"📊 Minimum confidence: {min_confidence}", err=True)
                
                # 5. Execute Core logic
                scanner = ProjectScanner()
                projects = scanner.scan(
                    parent_path=path,
                    max_depth=max_depth,
                    strategy_filter=strategy
                )
                
                # 6. Apply confidence filter if specified
                if min_confidence:
                    confidence_levels = {"high": 0, "medium": 1, "low": 2}
                    if min_confidence not in confidence_levels:
                        self._handle_error(
                            gc,
                            f"Invalid confidence level: {min_confidence}. Use: high, medium, low"
                        )
                    
                    min_rank = confidence_levels[min_confidence]
                    projects = [
                        p for p in projects
                        if confidence_levels.get(p.confidence, 999) <= min_rank
                    ]
                
                if gc.verbose:
                    typer.echo(f"✅ Found {len(projects)} project(s)", err=True)
                
                # 7. Package result
                result = {
                    "status": "success",
                    "operation": "detect",
                    "data": {
                        "parent_path": str(path),
                        "max_depth": max_depth,
                        "strategy_filter": strategy,
                        "min_confidence": min_confidence,
                        "projects_found": len(projects),
                        "projects": [
                            {
                                "path": str(p.path),
                                "name": p.name,
                                "strategy": p.strategy,
                                "confidence": p.confidence,
                                "indicators_found": p.indicators_found
                            }
                            for p in projects
                        ]
                    }
                }
                
                # 8. Dual output
                gc.output(result, self._render_success)
                
            except FileNotFoundError as e:
                self._handle_error(gc, str(e))
            except NotADirectoryError as e:
                self._handle_error(gc, str(e))
            except Exception as e:
                self._handle_error(gc, f"Unexpected error: {e}")
    
    def _render_success(self, data: dict):
        """Human-readable output for success."""
        operation_data = data.get("data", {})
        parent_path = operation_data.get("parent_path", "")
        max_depth = operation_data.get("max_depth", 0)
        projects = operation_data.get("projects", [])
        projects_found = operation_data.get("projects_found", 0)
        
        typer.echo(f"🔍 Scanning {parent_path} (max depth: {max_depth})...")
        typer.echo()
        
        if projects_found == 0:
            typer.echo("⚠️  No projects detected in this directory.")
            typer.echo()
            typer.echo("Tip: Try increasing --max-depth or check if projects have recognizable indicators.")
            return
        
        typer.echo(f"✅ Found {projects_found} project{'s' if projects_found != 1 else ''}:")
        typer.echo()
        
        # Group projects by strategy
        by_strategy = {}
        for project in projects:
            strategy = project["strategy"]
            if strategy not in by_strategy:
                by_strategy[strategy] = []
            by_strategy[strategy].append(project)
        
        # Strategy emojis
        strategy_emojis = {
            "android": "📱",
            "typescript": "📦",
            "rust": "🦀",
            "python": "🐍",
            "flutter": "🎨",
            "react": "⚛️",
            "vue": "💚",
            "go": "🔵",
            "java": "☕",
            "kotlin": "🟣"
        }
        
        # Display grouped projects
        for strategy, strategy_projects in sorted(by_strategy.items()):
            emoji = strategy_emojis.get(strategy, "📂")
            strategy_title = strategy.capitalize()
            count = len(strategy_projects)
            
            typer.echo(f"{emoji} {strategy_title} Projects ({count}):")
            
            for project in strategy_projects:
                name = project["name"]
                path = project["path"]
                confidence = project["confidence"]
                
                # Confidence indicator
                confidence_indicator = {
                    "high": "●●●",
                    "medium": "●●○",
                    "low": "●○○"
                }.get(confidence, "○○○")
                
                typer.echo(f"  • {name:<25} {path}")
                typer.echo(f"    Confidence: {confidence_indicator} {confidence}")
            
            typer.echo()
        
        typer.echo("Use 'brain project add <path> --nucleus <nucleus>' to link a project.")
    
    def _handle_error(self, gc, message: str):
        """Unified error handling."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)