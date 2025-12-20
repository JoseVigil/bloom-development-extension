"""
GitHub Organizations Commands
List user's organizations.
"""

import typer
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class GithubOrgsCommand(BaseCommand):
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="orgs",
            category=CommandCategory.GITHUB,
            version="1.0.0",
            description="List GitHub organizations",
            examples=[
                "brain github orgs list"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        orgs_app = typer.Typer(help="GitHub organizations commands")
        
        @orgs_app.command(name="list")
        def list_orgs(ctx: typer.Context):
            """List user's GitHub organizations."""
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                from brain.core.github.api_client import GitHubAPIClient
                
                if gc.verbose:
                    typer.echo("🏢 Fetching organizations...", err=True)
                
                client = GitHubAPIClient()
                
                # Get user and orgs
                user = client.get_current_user()
                orgs_data = client.get_user_orgs()
                
                # Include user as first "org"
                all_orgs = [
                    {
                        "login": user["login"],
                        "id": user["id"],
                        "avatar_url": user.get("avatar_url"),
                        "description": "Personal account",
                        "is_user": True
                    }
                ]
                
                # Add actual organizations
                for org in orgs_data:
                    all_orgs.append({
                        "login": org["login"],
                        "id": org["id"],
                        "avatar_url": org.get("avatar_url"),
                        "description": org.get("description"),
                        "is_user": False
                    })
                
                result = {
                    "status": "success",
                    "operation": "list",
                    "count": len(all_orgs),
                    "user": user["login"],
                    "organizations": all_orgs
                }
                
                gc.output(result, self._render_list)
                
            except Exception as e:
                self._handle_error(gc, f"Failed to list organizations: {e}")
        
        app.add_typer(orgs_app, name="orgs")

    def _render_list(self, data: dict):
        """Human-readable list output."""
        orgs = data["organizations"]
        
        if not orgs:
            typer.echo("🔭 No organizations found")
            return
        
        typer.echo(f"🏢 Organizations ({data['count']}):\n")
        
        for org in orgs:
            icon = "👤" if org.get("is_user") else "🏢"
            typer.echo(f"{icon} @{org['login']}")
            if org.get("description"):
                typer.echo(f"   {org['description']}")
            typer.echo()

    def _handle_error(self, gc, message: str):
        """Unified error handling."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)