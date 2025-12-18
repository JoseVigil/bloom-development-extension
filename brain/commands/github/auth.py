"""
GitHub Authentication Commands
Manages GitHub token storage and validation.
"""

import typer
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class GithubAuthCommand(BaseCommand):
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="auth",
            category=CommandCategory.PROJECT,
            version="1.0.0",
            description="Manage GitHub authentication",
            examples=[
                "brain github auth login --token ghp_xxxxx",
                "brain github auth status",
                "brain github auth logout"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        auth_app = typer.Typer(help="GitHub authentication commands")
        
        @auth_app.command(name="login")
        def login(
            ctx: typer.Context,
            token: str = typer.Option(
                ..., 
                "--token", 
                "-t",
                help="GitHub Personal Access Token (ghp_...)",
                envvar="BRAIN_GITHUB_TOKEN"
            ),
            validate: bool = typer.Option(
                True,
                "--validate/--no-validate",
                help="Validate token with GitHub API"
            )
        ):
            """Store GitHub authentication token."""
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                # Lazy import
                from brain.core.github.credentials import GitHubCredentials
                from brain.core.github.api_client import GitHubAPIClient
                
                if gc.verbose:
                    typer.echo("🔐 Storing GitHub token...", err=True)
                
                # Store token
                creds = GitHubCredentials()
                creds.save_token(token)
                
                result = {
                    "status": "success",
                    "operation": "login",
                    "token_stored": True
                }
                
                # Validate if requested
                if validate:
                    if gc.verbose:
                        typer.echo("✓ Token stored, validating...", err=True)
                    
                    client = GitHubAPIClient(token)
                    user = client.get_current_user()
                    orgs = client.get_user_orgs()
                    
                    result.update({
                        "validated": True,
                        "user": {
                            "login": user["login"],
                            "id": user["id"],
                            "avatar_url": user.get("avatar_url")
                        },
                        "organizations": [org["login"] for org in orgs]
                    })
                    
                    if gc.verbose:
                        typer.echo(f"✓ Authenticated as @{user['login']}", err=True)
                        if orgs:
                            typer.echo(f"✓ Organizations: {', '.join([o['login'] for o in orgs])}", err=True)
                
                gc.output(result, self._render_login)
                
            except ValueError as e:
                self._handle_error(gc, f"Invalid token: {e}")
            except Exception as e:
                self._handle_error(gc, f"Authentication failed: {e}")

        @auth_app.command(name="status")
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
                    result = {
                        "status": "not_authenticated",
                        "authenticated": False,
                        "message": "No GitHub token found"
                    }
                    gc.output(result, self._render_status_unauthenticated)
                    return
                
                # Get stored token
                token = creds.get_token()
                
                # Validate with API
                client = GitHubAPIClient(token)
                user = client.get_current_user()
                orgs = client.get_user_orgs()
                
                result = {
                    "status": "authenticated",
                    "authenticated": True,
                    "user": {
                        "login": user["login"],
                        "id": user["id"],
                        "name": user.get("name"),
                        "email": user.get("email"),
                        "avatar_url": user.get("avatar_url")
                    },
                    "organizations": [
                        {"login": org["login"], "id": org["id"]}
                        for org in orgs
                    ]
                }
                
                gc.output(result, self._render_status_authenticated)
                
            except Exception as e:
                result = {
                    "status": "error",
                    "authenticated": False,
                    "error": str(e)
                }
                gc.output(result, lambda d: typer.echo(f"❌ {d['error']}", err=True))

        @auth_app.command(name="logout")
        def logout(ctx: typer.Context):
            """Remove stored GitHub token."""
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                from brain.core.github.credentials import GitHubCredentials
                
                creds = GitHubCredentials()
                
                if not creds.has_token():
                    result = {
                        "status": "success",
                        "operation": "logout",
                        "message": "Already logged out"
                    }
                    gc.output(result, lambda d: typer.echo("ℹ️  Already logged out"))
                    return
                
                creds.delete_token()
                
                result = {
                    "status": "success",
                    "operation": "logout",
                    "token_removed": True
                }
                
                gc.output(result, self._render_logout)
                
            except Exception as e:
                self._handle_error(gc, f"Logout failed: {e}")
        
        app.add_typer(auth_app, name="auth")

    def _render_login(self, data: dict):
        """Human-readable login output."""
        if data.get("validated"):
            user = data["user"]
            typer.echo(f"✅ Authenticated as @{user['login']}")
            if data.get("organizations"):
                typer.echo(f"📦 Organizations: {', '.join(data['organizations'])}")
        else:
            typer.echo("✅ Token stored (not validated)")

    def _render_status_authenticated(self, data: dict):
        """Human-readable status output."""
        user = data["user"]
        typer.echo(f"✅ Authenticated as @{user['login']}")
        if user.get("name"):
            typer.echo(f"   Name: {user['name']}")
        if user.get("email"):
            typer.echo(f"   Email: {user['email']}")
        if data.get("organizations"):
            orgs = [org["login"] for org in data["organizations"]]
            typer.echo(f"   Organizations: {', '.join(orgs)}")

    def _render_status_unauthenticated(self, data: dict):
        """Human-readable unauthenticated status."""
        typer.echo("❌ Not authenticated")
        typer.echo("   Run: brain github auth login --token <your_token>")

    def _render_logout(self, data: dict):
        """Human-readable logout output."""
        typer.echo("✅ Logged out successfully")

    def _handle_error(self, gc, message: str):
        """Unified error handling."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)