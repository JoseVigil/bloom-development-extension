"""
Global info flag for Brain CLI.
Intercepted in __main__.py before Typer parses arguments.
"""

import typer
import sys
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class InfoFlagCommand(BaseCommand):
    """
    Command to handle --info flag globally.
    
    This command is NEVER called via Typer's normal routing.
    Instead, __main__.py intercepts "--info" in sys.argv and calls
    execute_intercepted() directly before Typer sees the arguments.
    """
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="info-flag",
            category=CommandCategory.SYSTEM,
            version="1.0.0",
            description="Global --info flag handler (intercepted)",
            requires_git=False,
            requires_network=False,
            examples=[
                "brain --info",
                "brain --info --json"
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
        Execute --info logic when intercepted from sys.argv.
        
        Args:
            json_mode: Whether to output JSON
            verbose: Whether to show verbose logging
        """
        try:
            # Lazy import Core
            from brain.core.system.info_manager import SystemInfoManager
            
            # Verbose logging
            if verbose and not json_mode:
                typer.echo("🔍 Gathering system information...", err=True)
            
            # Execute Core logic
            manager = SystemInfoManager()
            info = manager.get_system_info()
            
            # Package result
            result = {
                "status": "success",
                "operation": "system_info",
                "data": info
            }
            
            # Dual output
            if json_mode:
                import json
                typer.echo(json.dumps(result, indent=2))
            else:
                # Human-readable format: key: value (sorted alphabetically)
                sorted_keys = sorted(info.keys())
                for key in sorted_keys:
                    value = info[key]
                    typer.echo(f"{key}: {value}")
            
            sys.exit(0)
            
        except Exception as e:
            if json_mode:
                import json
                typer.echo(json.dumps({
                    "status": "error",
                    "message": f"Failed to get system info: {e}"
                }))
            else:
                typer.echo(f"❌ Error: {e}", err=True)
            sys.exit(1)