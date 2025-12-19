"""GitHub repositories list command."""
import typer
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory

class GithubReposListCommand(BaseCommand):
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="repos-list",
            category=CommandCategory.GITHUB,
            version="1.0.0",
            description="List GitHub repositories",
            examples=["brain github repos-list --org myorg"]
        )
    
    def register(self, app: typer.Typer):
        @app.command("repos-list")
        def list_repos(
            ctx: typer.Context,
            org: Optional[str] = typer.Option(None, "--org", help="Organization name")
        ):
            """List GitHub repositories."""
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                from brain.core.github.credentials import GitHubCredentials
                from brain.core.github.api_client import GitHubAPIClient
                
                creds = GitHubCredentials()
                token = creds.get_token()
                client = GitHubAPIClient(token)
                
                if org:
                    repos = client.get_org_repos(org)
                else:
                    repos = client.get_user_repos()
                
                if gc.json_mode:
                    import json
                    typer.echo(json.dumps({"repos": [r["full_name"] for r in repos]}))
                else:
                    for repo in repos:
                        typer.echo(f"  {repo['full_name']}")
            except Exception as e:
                if gc.json_mode:
                    import json
                    typer.echo(json.dumps({"status": "error", "message": str(e)}))
                else:
                    typer.echo(f"❌ {e}", err=True)
                raise typer.Exit(code=1)
