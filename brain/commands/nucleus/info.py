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
        typer.echo("\n🔧 EXECUTABLE")
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
    Version management command.
    Display current version or increment with semantic changelog.
    Supports multiple updates accumulation for the same version.
    """
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="version",
            category=CommandCategory.SYSTEM,
            version="2.1.0",
            description="Display or increment Brain CLI version with semantic changelog",
            examples=[
                "brain system version",
                "brain system version --json",
                "brain system version --added 'New feature X' --changed 'Refactored Y'",
                "brain system version --details 'Implementation notes'",
                "brain system version --added 'Feature A' --added 'Feature B' --changed 'Updated C'"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        @app.command(name=self.metadata().name)
        def execute(
            ctx: typer.Context,
            added: Optional[List[str]] = typer.Option(
                None, 
                "--added", 
                help="Feature or capability added (can be used multiple times)"
            ),
            changed: Optional[List[str]] = typer.Option(
                None, 
                "--changed", 
                help="Feature or behavior changed (can be used multiple times)"
            ),
            details: Optional[List[str]] = typer.Option(
                None, 
                "--details", 
                help="Implementation detail or technical note (can be used multiple times)"
            )
        ):
            """
            Display or increment the version number.
            
            Using any of --added, --changed, or --details will automatically increment
            the patch version (e.g., 0.1.1 → 0.1.2) and update the changelog.
            
            Multiple calls for the same version accumulate changelog entries instead
            of overwriting previous ones.
            
            Examples:
                brain system version
                    → Display current version
                
                brain system version --added "New AI schema support"
                    → Increment version and log feature addition
                
                brain system version --added "Feature A" --changed "Refactored B"
                    → Increment once with multiple changelog entries
                
                # Multiple calls accumulate:
                brain system version --added "Feature 1"
                brain system version --added "Feature 2"
                brain system version --changed "Updated X"
                    → All three changelog entries will be in the same version
            """
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            # Check if any changelog flags were provided
            has_changelog = any([added, changed, details])
            
            try:
                from brain.core.system.info_manager import SystemInfoManager
                
                manager = SystemInfoManager()
                
                if has_changelog:
                    # Increment version with changelog
                    if gc.verbose:
                        typer.echo("📝 Incrementing version with changelog...", err=True)
                    
                    new_version = manager.increment_version(
                        added=added,
                        changed=changed,
                        details=details
                    )
                    
                    # Check if request was updated (frozen mode)
                    is_frozen = manager._is_frozen
                    is_update = False
                    update_count = 1
                    
                    if is_frozen:
                        # Try to read update_count from version_request.json
                        import json
                        exe_dir = Path(sys.executable).parent
                        request_file = exe_dir / "version_request.json"
                        if request_file.exists():
                            try:
                                with open(request_file, 'r', encoding='utf-8') as f:
                                    data = json.load(f)
                                    update_count = data.get("update_count", 1)
                                    is_update = update_count > 1
                            except:
                                pass
                    
                    result = {
                        "status": "success",
                        "operation": "version_increment",
                        "data": {
                            "version": new_version,
                            "changelog": {
                                "added": added or [],
                                "changed": changed or [],
                                "details": details or []
                            },
                            "mode": "frozen" if is_frozen else "development",
                            "is_update": is_update,
                            "update_count": update_count
                        }
                    }
                    
                    gc.output(result, self._render_increment)
                else:
                    # Just display current version
                    version = manager.get_version()
                    result = {
                        "status": "success",
                        "operation": "version",
                        "data": {"version": version}
                    }
                    
                    gc.output(result, self._render_version)
                
            except ValueError as e:
                self._handle_error(gc, str(e))
            except Exception as e:
                self._handle_error(gc, f"Failed to process version: {e}")
    
    def _render_version(self, data: dict):
        """Simple version output."""
        version = data["data"]["version"]
        typer.echo(f"Brain CLI v{version}")
    
    def _render_increment(self, data: dict):
        """Output for version increment with changelog."""
        info = data["data"]
        version = info["version"]
        changelog = info.get("changelog", {})
        mode = info.get("mode", "unknown")
        is_update = info.get("is_update", False)
        update_count = info.get("update_count", 1)
        
        typer.echo("\n" + "=" * 70)
        if is_update:
            typer.echo(f"🔄 Actualización #{update_count} para versión: {version}")
        else:
            typer.echo(f"🎯 Version Increment: {version}")
        typer.echo("=" * 70)
        
        # Display changelog sections
        added = changelog.get("added", [])
        changed = changelog.get("changed", [])
        details = changelog.get("details", [])
        
        if added:
            typer.echo("\n✨ ADDED:")
            for item in added:
                typer.echo(f"   • {item}")
        
        if changed:
            typer.echo("\n🔄 CHANGED:")
            for item in changed:
                typer.echo(f"   • {item}")
        
        if details:
            typer.echo("\n📋 DETAILS:")
            for item in details:
                typer.echo(f"   • {item}")
        
        typer.echo("\n" + "-" * 70)
        
        if mode == "frozen":
            if is_update:
                typer.echo("\n✅ Changelog acumulado actualizado")
                typer.echo(f"📦 Versión objetivo: {version}")
                typer.echo(f"🔢 Actualizaciones acumuladas: {update_count}")
                typer.echo(f"\n💡 Archivo: version_request.json")
                typer.echo(f"   Todas las entradas se fusionarán al procesar la solicitud.")
            else:
                typer.echo("\n✅ Solicitud de incremento guardada")
                typer.echo(f"📦 Nueva versión solicitada: {version}")
                typer.echo(f"\n💡 Archivo creado: version_request.json")
                typer.echo(f"   El launcher procesará esta solicitud y recompilará Brain.")
        else:
            typer.echo(f"\n✅ Versión actualizada: {version}")
            typer.echo(f"📝 Changelog guardado en pyproject.toml y versions.json")
        
        typer.echo("\n" + "=" * 70 + "\n")
    
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