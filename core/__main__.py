import sys
import os
from pathlib import Path
from typing import List, Optional
import typer

# --- BOOTSTRAP: VENDORING DE LIBS ---
current_dir = os.path.dirname(os.path.abspath(__file__))
libs_dir = os.path.join(current_dir, 'libs')
if libs_dir not in sys.path:
    sys.path.insert(0, libs_dir)
# ------------------------------------

from core.filesystem.tree_manager import TreeManager
from core.filesystem.files_compressor import FilesCompressor
from core.filesystem.files_extractor import FilesExtractor
from core.generators.nucleus_generator import NucleusGenerator

app = typer.Typer(name="bloom-cli", help="Bloom Cognitive Core CLI")

# --- COMANDO: TREE ---
@app.command()
def tree(
    output: Path = typer.Option(..., "--out", "-o", help="Archivo de destino"),
    paths: Optional[List[str]] = typer.Argument(None, help="Carpetas a incluir"),
    root: Path = typer.Option(Path("."), "--root", "-r", help="Raíz del proyecto"),
    hash: bool = typer.Option(False, "--hash", help="Calcular MD5"),
    json: bool = typer.Option(False, "--json", help="Exportar JSON metadata")
):
    """
    Genera el mapa del proyecto.
    """
    if output.is_dir():
        typer.secho(f"❌ Error: El destino '{output}' es un directorio. Indica un archivo.", fg=typer.colors.RED)
        raise typer.Exit(code=1)

    manager = TreeManager(root_path=root)
    
    typer.secho(f"🌳 Bloom Tree Generator", fg=typer.colors.GREEN, bold=True)
    
    try:
        manager.generate(
            targets=paths,
            output_file=output,
            use_hash=hash,
            use_json=json
        )
        typer.secho(f"✅ Árbol generado en: {output}", fg=typer.colors.GREEN)

    except Exception as e:
        typer.secho(f"❌ Error crítico: {e}", fg=typer.colors.RED)
        raise typer.Exit(code=1)

# --- COMANDO: COMPRESS ---
@app.command()
def compress(
    mode: str = typer.Option(..., "--mode", "-m", help="codebase | docbase"),
    inputs: List[str] = typer.Option(..., "--input", "-i", help="Paths de entrada"),
    output: Optional[Path] = typer.Option(None, "--output", "-o", help="Directorio de salida"),
    exclude: Optional[str] = typer.Option(None, "--exclude", "-e", help="Patrones a excluir (csv)"),
    no_comments: bool = typer.Option(False, "--no-comments", help="Remover comentarios")
):
    """
    Comprime archivos usando el FilesCompressor v2.1.
    """
    try:
        # Parsear exclusiones
        exclude_patterns = [p.strip() for p in exclude.split(',')] if exclude else None
        
        compressor = FilesCompressor(
            mode=mode,
            preserve_comments=not no_comments
        )
        
        # Convertir Path a str si existe, para compatibilidad con el script legacy
        output_str = str(output) if output else None

        json_path, index_path = compressor.compress_paths(
            input_paths=inputs,
            output_dir=output_str,
            exclude_patterns=exclude_patterns
        )
        
        typer.secho(f"✅ Compresión exitosa: {json_path}", fg=typer.colors.GREEN)
        typer.echo(f"   📑 Índice: {index_path}")
        
    except Exception as e:
        typer.secho(f"❌ Error: {e}", fg=typer.colors.RED)
        raise typer.Exit(1)

# --- COMANDO: EXTRACT ---
@app.command()
def extract(
    input: Path = typer.Option(..., "--input", "-i", help="Archivo JSON (.codebase.json)"),
    output: Optional[Path] = typer.Option(None, "--output", "-o", help="Directorio destino"),
    file: Optional[str] = typer.Option(None, "--file", "-f", help="Archivo específico"),
    no_verify: bool = typer.Option(False, "--no-verify", help="Saltar verificación de hash")
):
    """
    Descomprime archivos usando FilesExtractor.
    """
    try:
        extractor = FilesExtractor(verify_hashes=not no_verify)
        
        if file:
            content = extractor.get_file(str(input), file)
            print(content)
        else:
            extractor.extract(str(input), str(output) if output else None)
            typer.secho("✅ Extracción completada.", fg=typer.colors.GREEN)
            
    except Exception as e:
        typer.secho(f"❌ Error: {e}", fg=typer.colors.RED)
        raise typer.Exit(1)

# --- STUBS ORQUESTADOR ---
@app.command()
def run(intent_id: str, phase: str):
    """Stub para ejecución de intent."""
    typer.echo(f"🚀 Running {intent_id} in {phase}")

@app.command()
def hydrate(intent_id: str):
    """Stub para hidratación."""
    typer.echo(f"💧 Hydrating {intent_id}")

if __name__ == "__main__":
    app()


@app.command()
def init_nucleus(
    org: str = typer.Option(..., help="Nombre de la organización"),
    url: str = typer.Option("", help="URL de la organización (GitHub/Web)"),
    root: Path = typer.Option(Path("."), "--root", "-r", help="Raíz del proyecto Nucleus"),
    output: Path = typer.Option(Path(".bloom"), "--output", "-o", help="Carpeta de salida")
):
    """
    Inicializa la estructura .bloom para un proyecto Nucleus (Organizacional).
    """
    generator = NucleusGenerator(root)
    
    typer.secho(f"🚀 Inicializando Nucleus: {org}", fg=typer.colors.BLUE)
    
    try:
        project_count = generator.generate(org, url, output)
        
        typer.secho(f"✅ Nucleus generado en: {output}", fg=typer.colors.GREEN)
        typer.echo(f"   🏢 Organización: {org}")
        typer.echo(f"   🔗 Proyectos vinculados: {project_count}")
        
    except Exception as e:
        typer.secho(f"❌ Error: {e}", fg=typer.colors.RED)
        raise typer.Exit(1)