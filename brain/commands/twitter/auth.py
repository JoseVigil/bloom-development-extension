import typer
import json
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory

class TwitterAuthCommand(BaseCommand):
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="twitter",
            category=CommandCategory.TWITTER,
            version="1.0.0",
            description="Manage Twitter/X authentication",
            examples=["brain twitter auth-status"]
        )

    def register(self, app: typer.Typer) -> None:
        twitter_app = typer.Typer(help="Twitter operations")

        @twitter_app.command(name="auth-status")
        def status(ctx: typer.Context):
            gc = ctx.obj
            from brain.core.twitter.auth_manager import TwitterAuthManager
            manager = TwitterAuthManager()
            data = manager.get_status()
            gc.output({"status": "success", "data": data}, self._render_status)

        @twitter_app.command(name="auth-login")
        def login(ctx: typer.Context, token: str, username: str):
            from brain.core.twitter.auth_manager import TwitterAuthManager
            TwitterAuthManager().save_auth(token, username)
            typer.echo(json.dumps({"status": "success"}))

        app.add_typer(twitter_app, name="twitter")

    def _render_status(self, data: dict):
        d = data['data']
        typer.echo(f"✅ Linked to X: @{d['username']}" if d['authenticated'] else "❌ X not linked")