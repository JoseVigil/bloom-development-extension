"""
System introspection commands for Brain CLI.
Provides runtime metadata, version info, and executable location.
"""

import typer
import sys
from pathlib import Path
from typing import Optional, List
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class SystemInfoCommand(BaseCommand):
    """Display comprehensive system information."""
    
    @property
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="info",
            description="Display comprehensive system information",
            category=CommandCategory.SYSTEM,
            requires_git=False,
            requires_network=False
        )
    
    def register(self, app: typer.Typer) -> None:
        @app.command(name="info")
        def execute(ctx: typer.Context):
            """Display comprehensive system information."""
            
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                from brain.core.system.info_manager import SystemInfoManager
                
                if gc.verbose:
                    typer.echo("🔍 Gathering system information...", err=True)
                
                manager = SystemInfoManager()
                info = manager.get_system_info()
                
                result = {
                    "status": "success",
                    "operation": "system_info",
                    "data": info
                }
                
                gc.output(result, self._render_human)
                
            except Exception as e:
                self._handle_error(gc, f"Failed to gather system info: {e}")
    
    def _render_human(self, result: dict) -> str:
        """Render system info in human-readable format."""
        info = result.get("data", {})
        
        lines = []
        for key, value in info.items():
            lines.append(f"{key}: {value}")
        
        return "\n".join(lines)


class SystemVersionCommand(BaseCommand):
    """Display or set version information."""
    
    @property
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="version",
            description="Display or set version information",
            category=CommandCategory.SYSTEM,
            requires_git=False,
            requires_network=False
        )
    
    def register(self, app: typer.Typer) -> None:
        @app.command(name="version")
        def execute(
            ctx: typer.Context,
            set_version: Optional[str] = typer.Option(
                None,
                "--set",
                help="Set new MAJOR.MINOR version (e.g., --set 2.2)"
            )
        ):
            """
            Display or set version information.
            
            Examples:
                brain system version              # Show current version
                brain system version --set 2.2    # Set new MAJOR.MINOR version
            """
            
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                from brain.core.system.info_manager import SystemInfoManager
                
                manager = SystemInfoManager()
                
                if set_version:
                    if gc.verbose:
                        typer.echo(f"📝 Setting version to {set_version}...", err=True)
                    
                    if manager.set_version_base(set_version):
                        result = {
                            "status": "success",
                            "operation": "version_set",
                            "data": {
                                "new_version": set_version,
                                "message": f"Version set to {set_version}. BUILD number will increment on next compilation."
                            }
                        }
                        gc.output(result, self._render_set_human)
                    else:
                        self._handle_error(gc, "Invalid version format. Use MAJOR.MINOR (e.g., 2.2)")
                else:
                    if gc.verbose:
                        typer.echo("🔍 Reading version information...", err=True)
                    
                    version_info = manager.get_version_info()
                    
                    result = {
                        "status": "success",
                        "operation": "version_info",
                        "data": version_info
                    }
                    
                    gc.output(result, self._render_info_human)
                
            except Exception as e:
                self._handle_error(gc, f"Failed to process version command: {e}")
    
    def _render_info_human(self, result: dict) -> str:
        """Render version info in human-readable format."""
        data = result.get("data", {})
        
        lines = [
            f"release: {data.get('release', 'unknown')}",
            f"base: {data.get('base', 'unknown')}",
            f"build: {data.get('build', 0)}",
            f"timestamp: {data.get('timestamp', 'unknown')}",
            f"mode: {data.get('mode', 'unknown')}"
        ]
        
        return "\n".join(lines)
    
    def _render_set_human(self, result: dict) -> str:
        """Render version set confirmation in human-readable format."""
        data = result.get("data", {})
        return data.get("message", "Version updated")


class SystemPathCommand(BaseCommand):
    """Display Brain executable path."""
    
    @property
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="path",
            description="Display Brain executable path",
            category=CommandCategory.SYSTEM,
            requires_git=False,
            requires_network=False
        )
    
    def register(self, app: typer.Typer) -> None:
        @app.command(name="path")
        def execute(ctx: typer.Context):
            """Display the path to the Brain executable."""
            
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                from brain.core.system.info_manager import SystemInfoManager
                
                manager = SystemInfoManager()
                executable_path = manager.get_executable_path()
                
                result = {
                    "status": "success",
                    "operation": "executable_path",
                    "data": {
                        "executable_path": str(executable_path)
                    }
                }
                
                gc.output(result, self._render_human)
                
            except Exception as e:
                self._handle_error(gc, f"Failed to get executable path: {e}")
    
    def _render_human(self, result: dict) -> str:
        """Render executable path in human-readable format."""
        data = result.get("data", {})
        return data.get("executable_path", "unknown")