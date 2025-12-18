"""
Nucleus Project Commands
Create and manage Nucleus projects with GitHub integration.
"""

import typer
from pathlib import Path
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class NucleusCommand(BaseCommand):
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="nucleus",
            category=CommandCategory.PROJECT,
            version="2.0.0", # Bump version por cambio de arquitectura
            description="Manage Nucleus projects (create, link, status)",
            examples=[
                "brain nucleus create --org myorg --path ./my-nucleus",
                "brain nucleus status --path ./my-nucleus",
                "brain nucleus link ./existing-nucleus"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        # Creamos un sub-typer para agrupar comandos bajo 'nucleus'
        nucleus_app = typer.Typer(help="Nucleus project lifecycle commands")
        
        # ---------------------------------------------------------------------
        # COMANDO: CREATE
        # ---------------------------------------------------------------------
        @nucleus_app.command(name="create")
        def create(
            ctx: typer.Context,
            org: str = typer.Option(..., "--org", "-o", help="Organization name"),
            path: Optional[Path] = typer.Option(None, "--path", "-p", help="Target path"),
            output: str = typer.Option(".bloom", "--output", help="Output directory name"),
            url: str = typer.Option("", "--url", help="Organization URL"),
            force: bool = typer.Option(False, "--force", "-f", help="Force overwrite"),
            # Futuro: private: bool = typer.Option(False, "--private", help="Create private repo")
        ):
            """Initialize a new Bloom Nucleus project structure."""
            
            # 1. Global Context
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                # 2. Lazy Import (El Manager que ya validamos antes)
                from brain.core.nucleus_manager import NucleusManager
                
                # Determine path
                target_path = path if path else Path.cwd()
                
                if gc.verbose:
                    typer.echo(f"🔨 Creating Nucleus project for {org} at {target_path}...", err=True)
                
                # 3. Logic (Nuestra lógica original de scaffolding)
                manager = NucleusManager(target_path)
                result = manager.create(
                    organization_name=org,
                    organization_url=url,
                    output_dir=output
                )
                
                # Enriquecemos el resultado para cumplir con el contrato de la UI
                result["status"] = "success"
                result["operation"] = "create"
                
                # 4. Output
                gc.output(result, self._render_create)
                
            except FileExistsError as e:
                self._handle_error(gc, str(e), "FileExistsError")
            except Exception as e:
                self._handle_error(gc, f"Nucleus creation failed: {e}")

        # ---------------------------------------------------------------------
        # COMANDO: STATUS
        # ---------------------------------------------------------------------
        @nucleus_app.command(name="status")
        def status(
            ctx: typer.Context,
            path: Optional[Path] = typer.Option(None, "--path", "-p", help="Project path")
        ):
            """Check if a directory is a valid Nucleus project."""
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                # Aquí necesitaremos un método 'load' o 'check' en el Manager
                # Por ahora hacemos una verificación simple
                from brain.core.project_manager import ProjectManager
                
                check_path = path or Path.cwd()
                
                if gc.verbose:
                    typer.echo(f"🔍 Checking status at {check_path}...", err=True)
                
                manager = ProjectManager(check_path)
                data = manager.load() # Reusamos la lógica de ProjectManager
                
                is_nucleus = data.get("is_bloom_nucleus", False)
                
                result = {
                    "status": "success",
                    "operation": "status",
                    "is_nucleus": is_nucleus,
                    "path": str(check_path),
                    "details": data
                }
                
                gc.output(result, self._render_status)
                
            except Exception as e:
                self._handle_error(gc, f"Status check failed: {e}")

        # ---------------------------------------------------------------------
        # COMANDO: LINK (Placeholder para futuro)
        # ---------------------------------------------------------------------
        @nucleus_app.command(name="link")
        def link(
            ctx: typer.Context,
            path: Path = typer.Argument(..., help="Path to existing project")
        ):
            """Link an existing folder as a Nucleus project."""
            # Implementación futura: Agregar .bloom config a una carpeta existente
            typer.echo("🚧 Link command coming soon")

        # Registramos el grupo en la app principal
        app.add_typer(nucleus_app, name="nucleus")

    # -------------------------------------------------------------------------
    # RENDERERS
    # -------------------------------------------------------------------------

    def _render_create(self, data: dict):
        """Renderizado humano para create"""
        typer.echo("✅ Nucleus Created Successfully!")
        typer.echo(f"   Name: {data.get('nucleus_name')}")
        typer.echo(f"   Path: {data.get('path')}")
        typer.echo(f"   Files: {len(data.get('files_created', []))}")

    def _render_status(self, data: dict):
        """Renderizado humano para status"""
        is_nuc = data.get("is_nucleus")
        icon = "✅" if is_nuc else "❌"
        typer.echo(f"{icon} Nucleus Status: {'Valid' if is_nuc else 'Invalid'}")
        typer.echo(f"   Path: {data.get('path')}")
        if is_nuc:
            det = data.get("details", {})
            typer.echo(f"   Org: {det.get('config', {}).get('organization', {}).get('name')}")

    def _handle_error(self, gc, message: str, error_type: str = "Error"):
        """Manejo de errores unificado"""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({
                "status": "error",
                "message": message,
                "type": error_type
            }))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)