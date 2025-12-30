"""
Backups command for Chrome extension
"""

import typer
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class BackupsCommand(BaseCommand):
    """
    Manage Chrome extension version backups.
    Supports listing and restoring previous versions.
    """
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="backups",
            category=CommandCategory.EXTENSION,
            version="1.0.0",
            description="Manage Chrome extension version backups",
            examples=[
                "brain extension backups list",
                "brain extension backups restore 1.0.0",
                "brain extension backups list --json"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        """
        Register the backups command group with the Typer app.
        
        Args:
            app: Typer application instance
        """
        backups_app = typer.Typer(
            help="Manage extension version backups",
            no_args_is_help=True
        )
        
        @backups_app.command(
            name="list",
            help="List all available extension backups"
        )
        def list_backups(ctx: typer.Context):
            """
            List all available extension backups.
            
            Shows version, date, and path for each backup.
            """
            # 1. Recuperar GlobalContext
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                # 2. Lazy Import del Core
                from brain.core.extension.manager import ExtensionManager
                
                # 3. Verbose logging
                if gc.verbose:
                    typer.echo("📦 Listing extension backups...", err=True)
                
                # 4. Ejecutar lógica del Core
                manager = ExtensionManager()
                backups = manager.list_backups()
                
                # 5. Empaquetar resultado
                output_data = {
                    "status": "success",
                    "operation": "extension_backups_list",
                    "data": {
                        "count": len(backups),
                        "backups": [
                            {
                                "version": b['version'],
                                "date": b['date'].isoformat(),
                                "path": b['path']
                            }
                            for b in backups
                        ]
                    }
                }
                
                # 6. Output dual
                gc.output(output_data, self._render_list)
                
            except Exception as e:
                self._handle_error(gc, f"Error listing backups: {e}")
        
        @backups_app.command(
            name="restore",
            help="Restore a specific backup version"
        )
        def restore_backup(
            ctx: typer.Context,
            version: str = typer.Argument(..., help="Version to restore")
        ):
            """
            Restore a specific backup version.
            
            Args:
                version: Version number to restore (e.g., "1.0.0")
            """
            # 1. Recuperar GlobalContext
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                # 2. Lazy Import del Core
                from brain.core.extension.manager import ExtensionManager
                
                # 3. Verbose logging
                if gc.verbose:
                    typer.echo(f"⏮️  Restoring backup version {version}...", err=True)
                
                # 4. Ejecutar lógica del Core
                manager = ExtensionManager()
                result = manager.restore_backup(version)
                
                # 5. Empaquetar resultado
                if result['success']:
                    output_data = {
                        "status": "success",
                        "operation": "extension_backups_restore",
                        "data": {
                            "version": result['version'],
                            "previous_version": result.get('previous_version'),
                            "extension_path": str(manager.extension_dir)
                        }
                    }
                else:
                    output_data = {
                        "status": "error",
                        "operation": "extension_backups_restore",
                        "message": result.get('error', 'Unknown error')
                    }
                
                # 6. Output dual
                if output_data['status'] == 'success':
                    gc.output(output_data, self._render_restore)
                else:
                    self._handle_error(gc, output_data['message'])
                
            except Exception as e:
                self._handle_error(gc, f"Restore error: {e}")
        
        # Add subcommands to main app
        app.add_typer(backups_app, name="backups")
    
    def _render_list(self, data: dict):
        """Output humano para listado de backups."""
        operation_data = data['data']
        count = operation_data['count']
        backups = operation_data['backups']
        
        if count == 0:
            typer.echo("📦 No backups found")
            return
        
        typer.echo(f"📦 Available backups ({count}):")
        typer.echo()
        
        for backup in backups:
            # Format date nicely
            from datetime import datetime
            date_obj = datetime.fromisoformat(backup['date'])
            date_str = date_obj.strftime("%Y-%m-%d %H:%M")
            
            typer.echo(f"   • Version {backup['version']}")
            typer.echo(f"     Date: {date_str}")
            typer.echo(f"     Path: {backup['path']}")
            typer.echo()
    
    def _render_restore(self, data: dict):
        """Output humano para restauración exitosa."""
        operation_data = data['data']
        version = operation_data['version']
        prev_version = operation_data.get('previous_version')
        
        typer.echo(f"✅ Backup restored successfully")
        typer.echo(f"   Restored version: {version}")
        if prev_version:
            typer.echo(f"   Previous version: {prev_version} (backed up)")
        typer.echo(f"   Location: {operation_data['extension_path']}")
        typer.echo("\n💡 Reload the extension in Chrome for changes to take effect")
    
    def _handle_error(self, gc, message: str):
        """Manejo unificado de errores."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({
                "status": "error",
                "operation": "extension_backups",
                "message": message
            }))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)