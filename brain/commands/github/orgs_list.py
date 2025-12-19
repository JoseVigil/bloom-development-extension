"""GitHub organizations list command."""
import typer
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory

class GithubOrgsListCommand(BaseCommand):
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="orgs-list",
            category=CommandCategory.GITHUB,
            version="1.0.0",
            description="List GitHub organizations",
            examples=["brain github orgs-list"]
        )
    
    def register(self, app: typer.Typer):
        @app.command("orgs-list")
        def list_orgs(ctx: typer.Context):
            """List GitHub organizations."""
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
                
                orgs = client.get_user_orgs()
                
                if gc.json_mode:
                    import json
                    typer.echo(json.dumps({"orgs": [o["login"] for o in orgs]}))
                else:
                    for org in orgs:
                        typer.echo(f"  {org['login']}")
            except Exception as e:
                if gc.json_mode:
                    import json
                    typer.echo(json.dumps({"status": "error", "message": str(e)}))
                else:
                    typer.echo(f"❌ {e}", err=True)
                raise typer.Exit(code=1)
