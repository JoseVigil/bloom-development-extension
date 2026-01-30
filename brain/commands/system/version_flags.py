"""
Global version flags for Brain CLI.
Intercepted in __main__.py before Typer parses arguments.
"""

import typer
import sys
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class VersionFlagCommand(BaseCommand):
    """
    Command to handle --version flag globally.
    
    This command is NEVER called via Typer's normal routing.
    Instead, __main__.py intercepts "--version" in sys.argv and calls
    execute_intercepted() directly before Typer sees the arguments.
    """
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="version-flag",
            category=CommandCategory.SYSTEM,
            version="1.0.0",
            description="Global --version flag handler (intercepted)",
            requires_git=False,
            requires_network=False,
            examples=[
                "brain --version",
                "brain --version --json"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        """
        Register stub command (never actually called via Typer).
        The real execution happens via execute_intercepted() in __main__.py.
        """
        pass  # No Typer registration needed - interception handles this
    
    @staticmethod
    def execute_intercepted(json_mode: bool = False, verbose: bool = False):
        """
        Execute --version logic when intercepted from sys.argv.
        
        Args:
            json_mode: Whether to output JSON
            verbose: Whether to show verbose logging
        """
        try:
            # Lazy import Core
            from brain.core.system.metadata_manager import MetadataManager
            
            # Verbose logging
            if verbose and not json_mode:
                typer.echo("🔍 Reading version information...", err=True)
            
            # Execute Core logic
            manager = MetadataManager()
            data = manager.get_release_info()
            
            # Package result
            result = {
                "status": "success",
                "operation": "version",
                "data": data
            }
            
            # Dual output
            if json_mode:
                import json
                typer.echo(json.dumps(result, indent=2))
            else:
                # Human-readable format: "brain.exe release X.Y.Z build N"
                app_name = data.get('app_name', 'brain.exe')
                version = data.get('app_release', 'unknown')
                build = data.get('build_counter', 0)
                typer.echo(f"{app_name} release {version} build {build}")
            
            sys.exit(0)
            
        except Exception as e:
            if json_mode:
                import json
                typer.echo(json.dumps({
                    "status": "error",
                    "message": f"Failed to get version: {e}"
                }))
            else:
                typer.echo(f"❌ Error: {e}", err=True)
            sys.exit(1)


class ReleaseFlagCommand(BaseCommand):
    """
    Command to handle --release flag globally.
    
    This command is NEVER called via Typer's normal routing.
    Instead, __main__.py intercepts "--release" in sys.argv and calls
    execute_intercepted() directly before Typer sees the arguments.
    """
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="release-flag",
            category=CommandCategory.SYSTEM,
            version="1.0.0",
            description="Global --release flag handler (intercepted)",
            requires_git=False,
            requires_network=False,
            examples=[
                "brain --release",
                "brain --release --json"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        """
        Register stub command (never actually called via Typer).
        The real execution happens via execute_intercepted() in __main__.py.
        """
        pass  # No Typer registration needed - interception handles this
    
    @staticmethod
    def execute_intercepted(json_mode: bool = False, verbose: bool = False):
        """
        Execute --release logic when intercepted from sys.argv.
        
        Args:
            json_mode: Whether to output JSON
            verbose: Whether to show verbose logging
        """
        try:
            # Lazy import Core
            from brain.core.system.metadata_manager import MetadataManager
            
            # Verbose logging
            if verbose and not json_mode:
                typer.echo("🔍 Retrieving release information...", err=True)
            
            # Execute Core logic
            manager = MetadataManager()
            data = manager.get_release_info()
            
            # Package result
            result = {
                "status": "success",
                "operation": "release_info",
                "data": data
            }
            
            # Dual output
            if json_mode:
                import json
                typer.echo(json.dumps(result, indent=2))
            else:
                # Human-readable format: "brain.exe release X.Y.Z build N"
                app_name = data.get('app_name', 'brain.exe')
                version = data.get('app_release', 'unknown')
                build = data.get('build_counter', 0)
                typer.echo(f"{app_name} release {version} build {build}")
            
            sys.exit(0)
            
        except Exception as e:
            if json_mode:
                import json
                typer.echo(json.dumps({
                    "status": "error",
                    "message": f"Failed to get release info: {e}"
                }))
            else:
                typer.echo(f"❌ Error: {e}", err=True)
            sys.exit(1)