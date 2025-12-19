"""GitHub authentication status command."""
import typer
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory

class GithubAuthStatusCommand(BaseCommand):
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="auth-status",
            category=CommandCategory.GITHUB,
            version="1.0.0",
            description="Check GitHub authentication status",
            examples=["brain github auth-status"]
        )
    
    def register(self, app: typer.Typer):
        @app.command("auth-status")
        def status(ctx: typer.Context):
            """Check GitHub authentication status."""
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                from brain.core.github.credentials import GitHubCredentials
                from brain.core.github.api_client import GitHubAPIClient
                
                creds = GitHubCredentials()
                if not creds.has_token():
                    if gc.json_mode:
                        import json
                        typer.echo(json.dumps({"status": "not_authenticated"}))
                    else:
                        typer.echo("❌ Not authenticated")
                    return
                
                token = creds.get_token()
                client = GitHubAPIClient(token)
                user = client.get_current_user()
                
                if gc.json_mode:
                    import json
                    typer.echo(json.dumps({"status": "authenticated", "user": user["login"]}))
                else:
                    typer.echo(f"✅ Authenticated as @{user['login']}")
            except Exception as e:
                if gc.json_mode:
                    import json
                    typer.echo(json.dumps({"status": "error", "message": str(e)}))
                else:
                    typer.echo(f"❌ {e}", err=True)
