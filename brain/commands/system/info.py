"""
System introspection commands for Brain CLI.
Provides runtime metadata, version info, and executable location.
"""

import typer
import sys
from pathlib import Path
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class SystemInfoCommand(BaseCommand):
    """
    Comprehensive system information command.
    Shows version, executable path, Python runtime, and environment details.
    """
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="info",
            category=CommandCategory.SYSTEM,
            version="1.0.0",
            description="Display system information, version, and executable location",
            examples=[
                "brain system info",
                "brain system info --json",
                "brain system info --verbose"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        @app.command(name=self.metadata().name)
        def execute(ctx: typer.Context):
            """
            Display comprehensive system information.
            
            Shows:
            - Brain CLI version
            - Executable location
            - Python runtime details
            - Execution mode (frozen/development)
            - Platform information
            """
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                # Lazy import core logic
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
    
    def _render_human(self, data: dict):
        """Rich terminal output for system information."""
        info = data.get("data", {})
        
        typer.echo("\n" + "=" * 70)
        typer.echo("🧠 BRAIN CLI - System Information")
        typer.echo("=" * 70)
        
        # Version section
        typer.echo("\n📦 VERSION")
        typer.echo(f"   Brain CLI:        {info['version']}")
        
        # Executable section
        typer.echo("\n📍 EXECUTABLE")
        typer.echo(f"   Location:         {info['executable_path']}")
        typer.echo(f"   Mode:             {info['execution_mode']}")
        if info.get('frozen_bundle_path'):
            typer.echo(f"   Bundle Path:      {info['frozen_bundle_path']}")
        
        # Python runtime
        typer.echo("\n🐍 PYTHON RUNTIME")
        typer.echo(f"   Version:          {info['python_version']}")
        typer.echo(f"   Executable:       {info['python_executable']}")
        
        # Platform
        typer.echo("\n💻 PLATFORM")
        typer.echo(f"   System:           {info['platform']}")
        typer.echo(f"   Architecture:     {info['architecture']}")
        
        # Working directory
        typer.echo("\n📂 ENVIRONMENT")
        typer.echo(f"   Working Dir:      {info['working_directory']}")
        
        typer.echo("\n" + "=" * 70 + "\n")
    
    def _handle_error(self, gc, message: str):
        """Unified error handling."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)


class SystemVersionCommand(BaseCommand):
    """
    Quick version display command.
    Provides just the version number for scripting/automation.
    Supports version increment with description.
    """
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="version",
            category=CommandCategory.SYSTEM,
            version="1.0.0",
            description="Display or increment Brain CLI version",
            examples=[
                "brain system version",
                "brain system version --json",
                "brain system version --increase --desc 'Added new feature X'"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        @app.command(name=self.metadata().name)
        def execute(
            ctx: typer.Context,
            increase: bool = typer.Option(False, "--increase", help="Increment the patch version (e.g., 1.0.0 → 1.0.1)"),
            desc: Optional[str] = typer.Option(None, "--desc", help="Description for the version change")
        ):
            """Display or increment the version number."""
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                from brain.core.system.info_manager import SystemInfoManager
                
                manager = SystemInfoManager()
                
                if increase:
                    # Increment logic
                    if gc.verbose:
                        typer.echo("🔄 Incrementing version...", err=True)
                    
                    new_version = manager.increment_version(desc)
                    
                    result = {
                        "status": "success",
                        "operation": "version_increment",
                        "data": {
                            "version": new_version,
                            "description": desc,
                            "mode": "frozen" if manager._is_frozen else "development"
                        }
                    }
                    
                    gc.output(result, self._render_increment)
                else:
                    # Normal display
                    version = manager.get_version()
                    result = {
                        "status": "success",
                        "operation": "version",
                        "data": {"version": version}
                    }
                    
                    gc.output(result, self._render_version)
                
            except Exception as e:
                self._handle_error(gc, f"Failed to process version: {e}")
    
    def _render_version(self, data: dict):
        """Simple version output."""
        version = data["data"]["version"]
        typer.echo(f"Brain CLI v{version}")
    
    def _render_increment(self, data: dict):
        """Output for version increment."""
        info = data["data"]
        version = info["version"]
        desc = info.get("description", "No description")
        mode = info.get("mode", "unknown")
        
        if mode == "frozen":
            typer.echo(f"\n✅ Solicitud de incremento guardada")
            typer.echo(f"📝 Nueva versión solicitada: {version}")
            typer.echo(f"📄 Descripción: {desc}")
            typer.echo(f"\n💡 Archivo creado: version_request.json")
            typer.echo(f"   El launcher puede procesar esta solicitud y recompilar Brain.\n")
        else:
            typer.echo(f"\n✅ Versión actualizada: {version}")
            typer.echo(f"📝 Descripción: {desc}\n")
    
    def _handle_error(self, gc, message: str):
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)


class SystemPathCommand(BaseCommand):
    """
    Executable path display command.
    Returns absolute path to the brain executable.
    """
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="path",
            category=CommandCategory.SYSTEM,
            version="1.0.0",
            description="Display absolute path to Brain CLI executable",
            examples=[
                "brain system path",
                "brain system path --json"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        @app.command(name=self.metadata().name)
        def execute(ctx: typer.Context):
            """Display the absolute path to the brain executable."""
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                from brain.core.system.info_manager import SystemInfoManager
                
                manager = SystemInfoManager()
                path = manager.get_executable_path()
                
                result = {
                    "status": "success",
                    "operation": "executable_path",
                    "data": {"path": str(path)}
                }
                
                gc.output(result, self._render_path)
                
            except Exception as e:
                self._handle_error(gc, f"Failed to retrieve executable path: {e}")
    
    def _render_path(self, data: dict):
        """Simple path output."""
        path = data["data"]["path"]
        typer.echo(path)
    
    def _handle_error(self, gc, message: str):
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)