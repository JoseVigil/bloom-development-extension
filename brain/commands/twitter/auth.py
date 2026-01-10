"""
Twitter CLI Layer - Handle Typer orchestration and output.
"""
import typer
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory

class TwitterAuthCommand(BaseCommand):
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="twitter",
            category=CommandCategory.TWITTER,
            version="1.0.0",
            description="Manage Twitter/X authentication and data",
            examples=["brain twitter auth-status", "brain twitter login --json"]
        )

    def register(self, app: typer.Typer) -> None:
        twitter_app = typer.Typer(help="Twitter/X management commands")
        
        @twitter_app.command(name="auth-status")
        def status(ctx: typer.Context):
            """Check if X account is linked."""
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                from brain.core.twitter.auth_manager import TwitterAuthManager
                manager = TwitterAuthManager()
                data = manager.get_status()
                
                result = {
                    "status": "success",
                    "operation": "twitter_auth_status",
                    "data": data
                }
                gc.output(result, self._render_status)
            except Exception as e:
                self._handle_error(gc, str(e))

        app.add_typer(twitter_app, name="twitter")

    def _render_status(self, data: dict):
        d = data['data']
        if d.get('authenticated'):
            typer.echo(f"✅ Linked to X as @{d.get('username')}")
        else:
            typer.echo("❌ Twitter account not linked")

    def _handle_error(self, gc, message: str):
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)