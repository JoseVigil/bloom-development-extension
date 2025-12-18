"""
GitHub Clone Command
Clone GitHub repositories with progress tracking.
"""

import typer
from pathlib import Path
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class GithubCloneCommand(BaseCommand):
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="clone",
            category=CommandCategory.PROJECT,
            version="1.0.0",
            description="Clone GitHub repository",
            examples=[
                "brain github clone owner/repo",
                "brain github clone https://github.com/owner/repo",
                "brain github clone owner/repo --path ./projects/myapp"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        @app.command(name="clone")
        def clone(
            ctx: typer.Context,
            repo: str = typer.Argument(
                ...,
                help="Repository (owner/repo or full URL)"
            ),
            path: Optional[Path] = typer.Option(
                None,
                "--path", "-p",
                help="Target directory (defaults to repo name in current dir)"
            ),
            progress: bool = typer.Option(
                True,
                "--progress/--no-progress",
                help="Show clone progress"
            )
        ):
            """Clone GitHub repository to local directory."""
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                from brain.core.github.api_client import GitHubAPIClient
                from brain.core.git.executor import GitExecutor
                import re
                
                # Parse repo identifier
                clone_url, repo_name = self._parse_repo(repo)
                
                # Determine target path
                if path is None:
                    path = Path.cwd() / repo_name
                
                # Check if directory already exists
                if path.exists():
                    if not gc.json_mode:
                        confirm = typer.confirm(
                            f"Directory {path} already exists. Continue?"
                        )
                        if not confirm:
                            raise typer.Abort()
                    else:
                        raise ValueError(f"Directory already exists: {path}")
                
                if gc.verbose:
                    typer.echo(f"📥 Cloning {repo} to {path}...", err=True)
                
                # Clone with progress
                git = GitExecutor()
                
                if progress and not gc.json_mode:
                    # Stream progress to stderr
                    git.clone(
                        clone_url,
                        path,
                        on_progress=lambda line: typer.echo(f"   {line}", err=True)
                    )
                else:
                    # Silent clone
                    git.clone(clone_url, path)
                
                # Verify clone
                if not git.is_repository(path):
                    raise RuntimeError("Clone completed but repository is invalid")
                
                result = {
                    "status": "success",
                    "operation": "clone",
                    "repository": repo,
                    "local_path": str(path.absolute()),
                    "clone_url": clone_url
                }
                
                gc.output(result, self._render_clone)
                
            except ValueError as e:
                self._handle_error(gc, str(e))
            except Exception as e:
                self._handle_error(gc, f"Clone failed: {e}")

    def _parse_repo(self, repo: str) -> tuple[str, str]:
        """
        Parse repository identifier.
        
        Args:
            repo: owner/repo or full URL
            
        Returns:
            Tuple of (clone_url, repo_name)
        """
        import re
        
        # Full URL
        if repo.startswith("http://") or repo.startswith("https://"):
            # Extract repo name from URL
            match = re.search(r'github\.com[/:]([\w-]+)/([\w-]+?)(?:\.git)?$', repo)
            if match:
                repo_name = match.group(2)
                return repo, repo_name
            else:
                raise ValueError(f"Invalid GitHub URL: {repo}")
        
        # owner/repo format
        if "/" in repo:
            parts = repo.split("/", 1)
            if len(parts) == 2:
                owner, name = parts
                clone_url = f"https://github.com/{owner}/{name}.git"
                return clone_url, name
        
        raise ValueError(
            f"Invalid repository format: {repo}\n"
            "Use: owner/repo or https://github.com/owner/repo"
        )

    def _render_clone(self, data: dict):
        """Human-readable clone output."""
        typer.echo(f"✅ Repository cloned successfully")
        typer.echo(f"   Location: {data['local_path']}")
        typer.echo(f"   Repository: {data['repository']}")

    def _handle_error(self, gc, message: str):
        """Unified error handling."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)