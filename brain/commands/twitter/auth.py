"""
Twitter/X Authentication Commands.
REFACTORED: Registro correcto sin sub-typer anidado.
"""
import typer
import json
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class TwitterAuthCommand(BaseCommand):
    """
    Gestiona la autenticación con Twitter/X.
    
    ARQUITECTURA:
    - Registra comandos directamente en el app de la categoría TWITTER
    - No crea sub-apps anidados (evita brain twitter twitter auth-status)
    """
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="auth",
            category=CommandCategory.TWITTER,
            version="1.0.0",
            description="Manage Twitter/X authentication and account status",
            examples=[
                "brain twitter auth-status",
                "brain twitter auth-login --token <TOKEN> --username <USERNAME>",
                "brain twitter auth-status --json"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        """
        Registra los comandos de autenticación directamente en la categoría TWITTER.
        
        CRÍTICO: No crear sub-typer, registrar comandos directamente en app.
        """
        
        @app.command(name="auth-status")
        def status(ctx: typer.Context):
            """Check Twitter/X authentication status."""
            # Recuperar GlobalContext
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                # Lazy import del Core
                from brain.core.twitter.auth_manager import TwitterAuthManager
                
                # Verbose logging
                if gc.verbose:
                    gc.log("🔍 Checking Twitter authentication status...", "info")
                
                # Ejecutar lógica del Core
                manager = TwitterAuthManager()
                auth_data = manager.get_status()
                
                # Empaquetar resultado
                result = {
                    "status": "success",
                    "operation": "twitter_auth_status",
                    "data": auth_data
                }
                
                # Output dual
                gc.output(result, self._render_auth_status)
                
            except Exception as e:
                gc.error(f"Failed to check Twitter authentication: {e}")
        
        @app.command(name="auth-login")
        def login(
            ctx: typer.Context,
            token: str = typer.Option(..., "--token", "-t", help="Twitter API token"),
            username: str = typer.Option(..., "--username", "-u", help="Twitter username")
        ):
            """Authenticate with Twitter/X using API credentials."""
            # Recuperar GlobalContext
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                # Lazy import del Core
                from brain.core.twitter.auth_manager import TwitterAuthManager
                
                # Verbose logging
                if gc.verbose:
                    gc.log(f"🔐 Authenticating Twitter account @{username}...", "info")
                
                # Ejecutar lógica del Core
                manager = TwitterAuthManager()
                manager.save_auth(token, username)
                
                # Empaquetar resultado
                result = {
                    "status": "success",
                    "operation": "twitter_auth_login",
                    "data": {
                        "username": username,
                        "authenticated": True
                    }
                }
                
                # Output dual
                gc.output(result, self._render_auth_login)
                
            except Exception as e:
                gc.error(f"Failed to authenticate Twitter account: {e}")
    
    def _render_auth_status(self, data: dict):
        """Renderizado humano para auth-status."""
        auth_data = data.get('data', {})
        authenticated = auth_data.get('authenticated', False)
        username = auth_data.get('username', 'unknown')
        
        if authenticated:
            typer.echo(f"✅ Twitter/X Account Linked")
            typer.echo(f"   Username: @{username}")
        else:
            typer.echo("❌ Twitter/X Account Not Linked")
            typer.echo("   Run 'brain twitter auth-login' to authenticate")
    
    def _render_auth_login(self, data: dict):
        """Renderizado humano para auth-login."""
        auth_data = data.get('data', {})
        username = auth_data.get('username', 'unknown')
        
        typer.echo(f"✅ Twitter/X Authentication Successful")
        typer.echo(f"   Account: @{username}")