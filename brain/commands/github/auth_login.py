"""GitHub authentication login command."""
import typer
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory

class GithubAuthLoginCommand(BaseCommand):
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="auth-login",
            category=CommandCategory.GITHUB,
            version="1.0.0",
            description="Store GitHub authentication token",
            examples=["brain github auth-login --token ghp_xxxxx"]
        )
    
    def register(self, app: typer.Typer):
        @app.command("auth-login")
        def login(
            ctx: typer.Context,
            token: str = typer.Option(..., "--token", "-t", help="GitHub Personal Access Token")
        ):
            """Store GitHub authentication token."""
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                from brain.core.github.credentials import GitHubCredentials
                from brain.core.github.api_client import GitHubAPIClient
                
                creds = GitHubCredentials()
                creds.save_token(token)
                
                client = GitHubAPIClient(token)
                user = client.get_current_user()
                
                if gc.json_mode:
                    import json
                    typer.echo(json.dumps({"status": "success", "user": user["login"]}))
                else:
                    typer.echo(f"✅ Authenticated as @{user['login']}")
            except Exception as e:
                if gc.json_mode:
                    import json
                    typer.echo(json.dumps({"status": "error", "message": str(e)}))
                else:
                    typer.echo(f"❌ {e}", err=True)
                raise typer.Exit(code=1)
