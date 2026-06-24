"""Nucleus project creation command."""
import typer
from pathlib import Path
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory

class NucleusCreateCommand(BaseCommand):
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="create",
            category=CommandCategory.NUCLEUS,
            version="2.0.0",
            description="Initialize a new Bloom Nucleus project structure",
            examples=[
                "brain nucleus create -o MyOrg",
                "brain nucleus create -o MyOrg -p ./my-nucleus",
                "brain nucleus create -o MyOrg --url https://github.com/myorg",
                "brain nucleus create --github-handle jose-devs -p ~/repos/nucleus",
                "brain nucleus create --temporary -p ~/repos/nucleus",
                "brain nucleus create  # sin flags → temporal automático"
            ]
        )
    
    def register(self, app: typer.Typer):
        @app.command("create")
        def create(
            ctx: typer.Context,
            org: Optional[str] = typer.Option(None, "--org", "-o", help="Organization name or GitHub handle"),
            path: Optional[Path] = typer.Option(None, "--path", "-p", help="Target path (default: current dir)"),
            output: str = typer.Option(".bloom", "--output", help="Output directory name (legacy)"),
            url: str = typer.Option("", "--url", help="Organization URL"),
            force: bool = typer.Option(False, "--force", "-f", help="Force overwrite existing directory"),
            mode: str = typer.Option("auto", "--mode", "-m",
                help="Org identity mode: 'personal' | 'org' | 'temporary' | 'auto'"),
            github_handle: Optional[str] = typer.Option(None, "--github-handle",
                help="GitHub username (for mode=personal). Overrides --org."),
            temporary: bool = typer.Option(False, "--temporary", "-t",
                help="Create with temporary name 'bloom-local'. Skips --org requirement."),
            skip_github_check: bool = typer.Option(False, "--skip-github-check",
                help="Skip async GitHub org verification during create."),
        ):
            """
            Initialize a new Bloom Nucleus V2.0 project structure.
            
            Creates a Meta-Sistema de Gobernanza with:
            - Governance policies and standards
            - Exploration intents structure (.exp)
            - Cache system for project synchronization
            - Relations mapping between projects
            """
            # 1. Get Global Context
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                # 2. Lazy Imports
                from brain.core.nucleus_manager import NucleusManager, OrgMode
                
                target_path = path if path else Path.cwd()

                # 3. Resolver org_slug y mode según los flags recibidos
                if temporary:
                    org_slug = "bloom-local"
                    resolved_mode = OrgMode.TEMPORARY
                elif github_handle:
                    org_slug = github_handle.lower().replace(" ", "-")
                    resolved_mode = OrgMode.PERSONAL
                elif org:
                    org_slug = org.lower().replace(" ", "-").replace("_", "-")
                    resolved_mode = OrgMode.AUTO  # el manager resolverá si es personal/org/new
                else:
                    # Sin ningún flag → modo temporal automático
                    org_slug = "bloom-local"
                    resolved_mode = OrgMode.TEMPORARY
                    if gc.verbose:
                        typer.echo("⚠ No org specified. Using temporary name 'bloom-local'.", err=True)
                
                # 4. Verbose logging
                if gc.verbose:
                    typer.echo(f"🔨 Creating Nucleus V2.0 for {org_slug} at {target_path}...", err=True)
                
                # 5. Execute business logic
                manager = NucleusManager(target_path)
                result = manager.create(
                    organization_name=org_slug,
                    organization_url=url,
                    org_mode=resolved_mode,
                    output_dir=output,
                    force=force,
                    skip_github_check=skip_github_check,
                    on_progress=lambda msg: typer.echo(f"  → {msg}", err=True) if gc.verbose else None
                )
                
                # Add operation metadata
                result["status"] = "success"
                result["operation"] = "create"
                
                # 6. Smart output
                gc.output(result, self._render_success)
                
            except Exception as e:
                self._handle_error(gc, str(e))
    
    def _render_success(self, data: dict):
        """Render success output for humans."""
        typer.echo(f"\n✅ Nucleus Created Successfully!")
        typer.echo(f"📁 Path: {data.get('path')}")
        typer.echo(f"🏢 Organization: {data.get('organization', {}).get('name')}")
        typer.echo(f"🔖 Mode: {data.get('org_mode')}")
        if data.get('org_mode') == 'temporary':
            typer.echo(f"⏳ Temporary nucleus — link to GitHub later with: brain nucleus link --org <handle>")
        typer.echo(f"📊 Projects detected: {data.get('projects_detected', 0)}")
        typer.echo(f"📝 Files created: {len(data.get('files_created', []))}")
        if data.get('github_verified'):
            typer.echo(f"✓ GitHub org verified: {data.get('organization', {}).get('url')}")
        elif data.get('org_mode') == 'org_new':
            typer.echo(f"⚠ New org — create it at github.com/organizations/new then run: brain nucleus link")
    
    def _handle_error(self, gc, message: str):
        """Handle errors with dual output mode."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ Error: {message}", err=True)
        raise typer.Exit(code=1)