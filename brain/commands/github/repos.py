"""
GitHub Repositories Commands
List and create GitHub repositories.
"""

import typer
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class GithubReposCommand(BaseCommand):
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="repos",
            category=CommandCategory.GITHUB,
            version="1.0.0",
            description="Manage GitHub repositories",
            examples=[
                "brain github repos list",
                "brain github repos list --org myorg",
                "brain github repos create my-project --org myorg",
                "brain github repos get owner/repo"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        repos_app = typer.Typer(help="GitHub repositories commands")
        
        @repos_app.command(name="list")
        def list_repos(
            ctx: typer.Context,
            org: Optional[str] = typer.Option(
                None,
                "--org", "-o",
                help="Organization name (omit for personal repos)"
            ),
            limit: int = typer.Option(
                100,
                "--limit", "-l",
                help="Maximum number of repos to return"
            ),
            sort: str = typer.Option(
                "updated",
                "--sort", "-s",
                help="Sort by: created, updated, pushed, full_name"
            )
        ):
            """List GitHub repositories."""
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                from brain.core.github.api_client import GitHubAPIClient
                
                if gc.verbose:
                    target = f"@{org}" if org else "personal"
                    typer.echo(f"📦 Fetching {target} repositories...", err=True)
                
                client = GitHubAPIClient()
                
                if org:
                    repos = client.get_org_repos(org, per_page=limit, sort=sort)
                else:
                    repos = client.get_user_repos(per_page=limit, sort=sort)
                
                result = {
                    "status": "success",
                    "operation": "list",
                    "count": len(repos),
                    "org": org,
                    "repos": [r.to_dict() for r in repos]
                }
                
                gc.output(result, self._render_list)
                
            except Exception as e:
                self._handle_error(gc, f"Failed to list repositories: {e}")

        @repos_app.command(name="create")
        def create_repo(
            ctx: typer.Context,
            name: str = typer.Argument(..., help="Repository name"),
            org: Optional[str] = typer.Option(
                None,
                "--org", "-o",
                help="Organization name (omit for personal repo)"
            ),
            description: Optional[str] = typer.Option(
                None,
                "--description", "-d",
                help="Repository description"
            ),
            private: bool = typer.Option(
                False,
                "--private",
                help="Make repository private"
            ),
            no_init: bool = typer.Option(
                False,
                "--no-init",
                help="Don't initialize with README"
            )
        ):
            """Create new GitHub repository."""
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                from brain.core.github.api_client import GitHubAPIClient
                
                if gc.verbose:
                    target = f"@{org}" if org else "personal"
                    typer.echo(f"🔨 Creating {target} repository '{name}'...", err=True)
                
                client = GitHubAPIClient()
                
                # Check if repo exists
                if org and client.repo_exists(org, name):
                    raise ValueError(f"Repository {org}/{name} already exists")
                elif not org:
                    user = client.get_current_user()
                    if client.repo_exists(user["login"], name):
                        raise ValueError(f"Repository {user['login']}/{name} already exists")
                
                # Create repo
                repo = client.create_repo(
                    name=name,
                    description=description,
                    private=private,
                    auto_init=not no_init,
                    org=org
                )
                
                if gc.verbose:
                    typer.echo(f"✅ Repository created: {repo.html_url}", err=True)
                
                result = {
                    "status": "success",
                    "operation": "create",
                    "repo": repo.to_dict()
                }
                
                gc.output(result, self._render_create)
                
            except ValueError as e:
                self._handle_error(gc, str(e))
            except Exception as e:
                self._handle_error(gc, f"Failed to create repository: {e}")

        @repos_app.command(name="get")
        def get_repo(
            ctx: typer.Context,
            full_name: str = typer.Argument(
                ...,
                help="Repository in owner/repo format"
            )
        ):
            """Get repository details."""
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                from brain.core.github.api_client import GitHubAPIClient
                
                # Parse owner/repo
                try:
                    owner, repo_name = full_name.split("/", 1)
                except ValueError:
                    raise ValueError(
                        f"Invalid format '{full_name}'. Use: owner/repo"
                    )
                
                if gc.verbose:
                    typer.echo(f"🔍 Fetching {owner}/{repo_name}...", err=True)
                
                client = GitHubAPIClient()
                repo = client.get_repo(owner, repo_name)
                
                result = {
                    "status": "success",
                    "operation": "get",
                    "repo": repo.to_dict()
                }
                
                gc.output(result, self._render_get)
                
            except ValueError as e:
                self._handle_error(gc, str(e))
            except Exception as e:
                self._handle_error(gc, f"Repository not found: {e}")
        
        app.add_typer(repos_app, name="repos")

    def _render_list(self, data: dict):
        """Human-readable list output."""
        repos = data["repos"]
        org = data.get("org")
        
        if not repos:
            typer.echo("🔭 No repositories found")
            return
        
        header = f"@{org}" if org else "Personal"
        typer.echo(f"📦 {header} Repositories ({data['count']}):\n")
        
        for repo in repos:
            visibility = "🔒" if repo["private"] else "🌍"
            stars = f"⭐ {repo['stars']}" if repo["stars"] > 0 else ""
            lang = repo.get("language") or "—"
            
            typer.echo(f"{visibility} {repo['full_name']}")
            typer.echo(f"   Language: {lang} {stars}")
            if repo.get("description"):
                typer.echo(f"   {repo['description']}")
            typer.echo(f"   {repo['html_url']}\n")

    def _render_create(self, data: dict):
        """Human-readable create output."""
        repo = data["repo"]
        visibility = "private" if repo["private"] else "public"
        
        typer.echo(f"✅ Repository created ({visibility})")
        typer.echo(f"   Name: {repo['full_name']}")
        typer.echo(f"   URL: {repo['html_url']}")
        typer.echo(f"   Clone: {repo['clone_url']}")

    def _render_get(self, data: dict):
        """Human-readable get output."""
        repo = data["repo"]
        visibility = "🔒 Private" if repo["private"] else "🌍 Public"
        
        typer.echo(f"📦 {repo['full_name']} ({visibility})")
        if repo.get("description"):
            typer.echo(f"   {repo['description']}")
        typer.echo(f"   Language: {repo.get('language') or '—'}")
        typer.echo(f"   Stars: {repo['stars']}")
        typer.echo(f"   Updated: {repo['updated_at']}")
        typer.echo(f"   URL: {repo['html_url']}")
        typer.echo(f"   Clone: {repo['clone_url']}")

    def _handle_error(self, gc, message: str):
        """Unified error handling."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)