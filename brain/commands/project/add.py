"""
Comando CLI: brain project add

Vincula un proyecto local existente a un Nucleus.
Usa el sistema de detección existente (MultiStackDetector).
"""

import typer
from pathlib import Path
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class ProjectAddCommand(BaseCommand):
    """
    Comando para vincular proyectos locales existentes a un Nucleus.
    
    Integra con el sistema de detección existente (MultiStackDetector)
    para identificar automáticamente el tipo de proyecto.
    """
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="add",
            category=CommandCategory.PROJECT,
            version="1.0.0",
            description="Vincula un proyecto local existente a un Nucleus",
            examples=[
                "brain project add ./my-app --nucleus ../nucleus-org",
                "brain project add ./android-app -n ../nucleus --description 'App principal'",
                "brain project add ./web-app -n ../nucleus --json",
                "brain project add ./legacy-app -n ../nucleus --strategy generic"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        """
        Registra el comando en la aplicación Typer.
        """
        @app.command(name=self.metadata().name)
        def execute(
            ctx: typer.Context,
            project_path: str = typer.Argument(
                ...,
                help="Ruta al proyecto a vincular"
            ),
            nucleus: str = typer.Option(
                ...,
                "--nucleus", "-n",
                help="Ruta al Nucleus destino"
            ),
            name: Optional[str] = typer.Option(
                None,
                "--name",
                help="Nombre custom del proyecto (default: nombre de carpeta)"
            ),
            strategy: Optional[str] = typer.Option(
                None,
                "--strategy",
                help="Forzar estrategia específica (default: auto-detect)"
            ),
            description: Optional[str] = typer.Option(
                None,
                "--description",
                help="Descripción del proyecto"
            ),
            repo_url: Optional[str] = typer.Option(
                None,
                "--repo-url",
                help="URL del repositorio GitHub"
            )
        ):
            """
            Vincula un proyecto local existente a un Nucleus.
            
            El comando detecta automáticamente el tipo de proyecto usando
            el sistema MultiStackDetector y crea todos los archivos necesarios
            para la vinculación.
            """
            
            # 1. Recuperar GlobalContext
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                # 2. Lazy Import del Core
                from brain.core.project.linker import ProjectLinker
                
                # 3. Validar paths
                project_path_obj = Path(project_path)
                nucleus_path_obj = Path(nucleus)
                
                # 4. Verbose logging
                if gc.verbose:
                    typer.echo(f"📂 Proyecto: {project_path_obj.resolve()}", err=True)
                    typer.echo(f"🧠 Nucleus: {nucleus_path_obj.resolve()}", err=True)
                    typer.echo("", err=True)
                
                # 5. Crear linker y ejecutar
                linker = ProjectLinker(
                    project_path=project_path_obj,
                    nucleus_path=nucleus_path_obj
                )
                
                if gc.verbose:
                    typer.echo("🔍 Detectando tipo de proyecto...", err=True)
                
                linked_project = linker.link(
                    name=name,
                    strategy=strategy,
                    description=description,
                    repo_url=repo_url,
                    verbose=gc.verbose
                )
                
                # 6. Empaquetar resultado
                result = {
                    "status": "success",
                    "operation": "project_add",
                    "data": {
                        "project": linked_project.to_dict(),
                        "files_created": [
                            f"{nucleus_path_obj}/.bloom/core/nucleus-config.json",
                            f"{project_path_obj}/.bloom/nucleus.json",
                            f"{nucleus_path_obj}/.bloom/brain/projects/{linked_project.name}/overview.bl",
                            f"{nucleus_path_obj}/.bloom/brain/_index.bl"
                        ]
                    }
                }
                
                # 7. Output dual
                gc.output(result, self._render_success)
                
            except FileNotFoundError as e:
                self._handle_error(gc, f"Archivo no encontrado: {e}")
            except ValueError as e:
                self._handle_error(gc, f"Error de validación: {e}")
            except Exception as e:
                self._handle_error(gc, f"Error inesperado: {e}")
    
    def _render_success(self, data: dict):
        """Output humano para éxito."""
        project_data = data["data"]["project"]
        files = data["data"]["files_created"]
        
        typer.echo()
        typer.echo("✅ Proyecto vinculado exitosamente")
        typer.echo()
        typer.echo(f"   Nombre: {project_data['displayName']}")
        typer.echo(f"   ID: {project_data['id']}")
        typer.echo(f"   Estrategia: {project_data['strategy']}")
        typer.echo(f"   Path: {project_data['localPath']}")
        if project_data.get('repoUrl'):
            typer.echo(f"   Repo: {project_data['repoUrl']}")
        typer.echo()
        typer.echo(f"📝 Archivos generados:")
        for file_path in files:
            # Mostrar solo nombre de archivo para brevedad
            typer.echo(f"   - {Path(file_path).name}")
    
    def _handle_error(self, gc, message: str):
        """Manejo unificado de errores."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({
                "status": "error",
                "operation": "project_add",
                "message": message
            }))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)
