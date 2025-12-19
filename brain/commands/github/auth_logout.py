"""GitHub authentication logout command."""
import typer
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory

class GithubAuthLogoutCommand(BaseCommand):
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="auth-logout",
            category=CommandCategory.GITHUB,
            version="1.0.0",
            description="Remove stored GitHub token",
            examples=["brain github auth-logout"]
        )
    
    def register(self, app: typer.Typer):
        @app.command("auth-logout")
        def logout(ctx: typer.Context):
            """Remove stored GitHub token."""
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                from brain.core.github.credentials import GitHubCredentials
                creds = GitHubCredentials()
                creds.delete_token()
                
                if gc.json_mode:
                    import json
                    typer.echo(json.dumps({"status": "success"}))
                else:
                    typer.echo("✅ Logged out successfully")
            except Exception as e:
                if gc.json_mode:
                    import json
                    typer.echo(json.dumps({"status": "error", "message": str(e)}))
                else:
                    typer.echo(f"❌ {e}", err=True)
                raise typer.Exit(code=1)
