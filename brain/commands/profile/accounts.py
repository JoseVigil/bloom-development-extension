"""
Comandos para gestión de cuentas AI vinculadas a perfiles.
Organiza el linkeo y deslinkeo de cuentas a perfiles de Workers.
"""

import typer
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class AccountsLinkCommand(BaseCommand):
    """Vincula una cuenta de email a un perfil."""
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="link",
            category=CommandCategory.PROFILE,
            version="1.0.0",
            description="Vincula una cuenta de email a un perfil de Chrome",
            examples=[
                "brain profile accounts link <profile-id> user@example.com",
                "brain profile accounts link <profile-id> work@company.com --json"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        @app.command(name="link")
        def link_account(
            ctx: typer.Context,
            profile_id: str = typer.Argument(..., help="ID del perfil"),
            email: str = typer.Argument(..., help="Email de la cuenta a vincular")
        ):
            """Vincula una cuenta de email al perfil especificado."""
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                from brain.core.browser.profile_manager import ProfileManager
                
                if gc.verbose:
                    typer.echo(f"🔗 Vinculando cuenta {email} al perfil...", err=True)
                
                pm = ProfileManager()
                account_data = pm.set_account(profile_id, email)
                
                result = {
                    "status": "success",
                    "operation": "link-account",
                    "data": account_data
                }
                
                gc.output(result, self._render_link)
            except Exception as e:
                self._handle_error(gc, f"Error al vincular cuenta: {str(e)}")

    def _render_link(self, data: dict) -> None:
        """Renderiza la confirmación de vinculación."""
        typer.echo(f"\n✅ Cuenta vinculada exitosamente")
        typer.echo(f"   Perfil: {data.get('alias', 'N/A')} ({data.get('profile_id')[:8]}...)")
        typer.echo(f"   Email:  {data.get('linked_account')}\n")

    def _handle_error(self, gc, message: str):
        """Manejo unificado de errores."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)


class AccountsUnlinkCommand(BaseCommand):
    """Desvincula la cuenta de un perfil."""
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="unlink",
            category=CommandCategory.PROFILE,
            version="1.0.0",
            description="Desvincula la cuenta asociada a un perfil",
            examples=[
                "brain profile accounts unlink <profile-id>",
                "brain profile accounts unlink <profile-id> --json"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        @app.command(name="unlink")
        def unlink_account(
            ctx: typer.Context,
            profile_id: str = typer.Argument(..., help="ID del perfil")
        ):
            """Desvincula la cuenta asociada al perfil."""
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                from brain.core.browser.profile_manager import ProfileManager
                
                if gc.verbose:
                    typer.echo(f"🔓 Desvinculando cuenta del perfil...", err=True)
                
                pm = ProfileManager()
                account_data = pm.set_account(profile_id, None)
                
                result = {
                    "status": "success",
                    "operation": "unlink-account",
                    "data": account_data
                }
                
                gc.output(result, self._render_unlink)
            except Exception as e:
                self._handle_error(gc, f"Error al desvincular cuenta: {str(e)}")

    def _render_unlink(self, data: dict) -> None:
        """Renderiza la confirmación de desvinculación."""
        typer.echo(f"\n✅ Cuenta desvinculada exitosamente")
        typer.echo(f"   Perfil: {data.get('alias', 'N/A')} ({data.get('profile_id')[:8]}...)")
        typer.echo(f"   Estado: Sin cuenta asociada\n")

    def _handle_error(self, gc, message: str):
        """Manejo unificado de errores."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)