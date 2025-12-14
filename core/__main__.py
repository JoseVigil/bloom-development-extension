import sys
import os
from pathlib import Path
from typing import List, Optional

# --- BLOOM NUCLEUS BOOTSTRAP -------------------------------------------------
# Garantizar que las librerías vendored (./libs) tengan prioridad absoluta.
# Esto permite la ejecución offline sin que el usuario haga 'pip install'.
current_dir = os.path.dirname(os.path.abspath(__file__))
libs_dir = os.path.join(current_dir, 'libs')

if os.path.exists(libs_dir) and libs_dir not in sys.path:
    # Insertar en índice 0 para forzar el uso de nuestras versiones probadas
    sys.path.insert(0, libs_dir)
# -----------------------------------------------------------------------------

# IMPORTS
import typer
import asyncio

# Módulos internos
from core.filesystem.tree_manager import TreeManager
from core.filesystem.files_compressor import FilesCompressor
from core.filesystem.files_extractor import FilesExtractor
from core.generators.nucleus_generator import NucleusGenerator
from core.generators.context_strategy import ContextStrategyManager

# Inicialización de la aplicación CLI
app = typer.Typer(
    name="bloom-cli",
    help="Bloom Cognitive Core CLI - Sistema de análisis y gestión de proyectos",
    no_args_is_help=True
)


# =============================================================================
# COMANDOS DE DIAGNÓSTICO Y VISUALIZACIÓN
# =============================================================================

@app.command()
def tree(
    output: Path = typer.Option(..., "--out", "-o", help="Archivo de destino"),
    paths: Optional[List[str]] = typer.Argument(None, help="Carpetas a incluir"),
    root: Path = typer.Option(Path("."), "--root", "-r", help="Raíz del proyecto"),
    hash: bool = typer.Option(False, "--hash", help="Calcular MD5"),
    json: bool = typer.Option(False, "--json", help="Exportar JSON metadata")
):
    """
    Genera el mapa visual y técnico del proyecto.
    
    Ejemplo:
        bloom tree --out project-tree.txt --hash
        bloom tree --out tree.txt --root ./src --json
    """
    if output.is_dir():
        typer.secho(
            f"❌ Error: El destino '{output}' es un directorio. Indica un archivo.",
            fg=typer.colors.RED
        )
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


# =============================================================================
# COMANDOS DE I/O (COMPRESIÓN / EXTRACCIÓN)
# =============================================================================

@app.command()
def compress(
    mode: str = typer.Option(..., "--mode", "-m", help="codebase | docbase"),
    inputs: List[str] = typer.Option(..., "--input", "-i", help="Paths de entrada"),
    output: Optional[Path] = typer.Option(None, "--output", "-o", help="Directorio de salida"),
    exclude: Optional[str] = typer.Option(None, "--exclude", "-e", help="Patrones a excluir (csv)"),
    no_comments: bool = typer.Option(False, "--no-comments", help="Remover comentarios")
):
    """
    Empaqueta código/docs usando Protocolo v2.1 (Gzip+Base64).
    
    Ejemplo:
        bloom compress --mode codebase --input ./src --output ./dist
        bloom compress --mode docbase --input ./docs --no-comments
    """
    try:
        exclude_patterns = [p.strip() for p in exclude.split(',')] if exclude else None
        compressor = FilesCompressor(mode=mode, preserve_comments=not no_comments)
        
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


@app.command()
def extract(
    input: Path = typer.Option(..., "--input", "-i", help="Archivo JSON (.codebase.json)"),
    output: Optional[Path] = typer.Option(None, "--output", "-o", help="Directorio destino"),
    file: Optional[str] = typer.Option(None, "--file", "-f", help="Archivo específico"),
    no_verify: bool = typer.Option(False, "--no-verify", help="Saltar verificación de hash")
):
    """
    Descomprime archivos usando el FilesExtractor.
    
    Ejemplo:
        bloom extract --input project.codebase.json --output ./restored
        bloom extract --input backup.json --file "src/main.py"
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


# =============================================================================
# COMANDOS DE GENERACIÓN Y ANÁLISIS
# =============================================================================

@app.command()
def init_nucleus(
    org: str = typer.Option(..., help="Nombre de la organización"),
    url: str = typer.Option("", help="URL de la organización"),
    root: Path = typer.Option(Path("."), "--root", "-r", help="Raíz del proyecto"),
    output: Path = typer.Option(Path(".bloom"), "--output", "-o", help="Carpeta de salida")
):
    """
    Inicializa la estructura .bloom para un proyecto Nucleus.
    
    Ejemplo:
        bloom init-nucleus --org "Mi Empresa" --url "https://empresa.com"
        bloom init-nucleus --org "StartupXYZ" --root ./monorepo
    """
    generator = NucleusGenerator(root)
    typer.secho(f"🚀 Inicializando Nucleus: {org}", fg=typer.colors.BLUE, bold=True)
    
    try:
        project_count = generator.generate(org, url, output)
        typer.secho(f"✅ Nucleus generado en: {output}", fg=typer.colors.GREEN)
        typer.echo(f"   🔗 Proyectos vinculados: {project_count}")
    except Exception as e:
        typer.secho(f"❌ Error: {e}", fg=typer.colors.RED)
        raise typer.Exit(1)


@app.command()
def analyze(
    root: Path = typer.Option(Path("."), "--root", "-r", help="Raíz del proyecto"),
    output: Path = typer.Option(
        Path(".project/.doc.app.architecture.bl"),
        "--output", "-o",
        help="Archivo de destino"
    )
):
    """
    [GENESIS PHASE 2] Discovery: Ejecuta el análisis técnico automático (Multi-Stack).
    Genera la 'Verdad Técnica' basada en los archivos del repositorio.
    """
    manager = ContextStrategyManager(root)
    
    typer.secho(
        f"🔍 [Genesis: Discovery] Iniciando análisis en: {root.resolve()}",
        fg=typer.colors.BLUE
    )
    
    try:
        success = manager.execute_analysis(output)
        
        if success:
            typer.secho(
                f"✅ Análisis completado. Arquitectura generada en: {output}",
                fg=typer.colors.GREEN
            )
        else:
            typer.secho(
                "⚠️  No se detectaron stacks tecnológicos conocidos.",
                fg=typer.colors.YELLOW
            )
            
    except Exception as e:
        typer.secho(f"❌ Error durante el análisis: {e}", fg=typer.colors.RED)
        raise typer.Exit(1)


# =============================================================================
# COMANDOS DEL ORQUESTADOR (STUBS - En Desarrollo)
# =============================================================================

@app.command()
def run(
    intent_id: str = typer.Option(..., help="UUID del Intent"),
    phase: str = typer.Option(..., help="Fase: briefing | execution | refinement"),
    root: Path = typer.Option(Path("."), "--root", "-r", help="Raíz del proyecto")
):
    """
    Ejecuta un ciclo cognitivo completo (En Desarrollo).
    
    NOTA: Este comando está en fase de implementación.
    
    Ejemplo:
        bloom run --intent-id abc-123 --phase briefing
    """
    typer.secho(
        f"🚀 [EN DESARROLLO] Ejecutando Engine para Intent: {intent_id}",
        fg=typer.colors.YELLOW
    )
    typer.echo(f"   Fase: {phase}")
    typer.echo(f"   Root: {root}")
    typer.echo("\n⚠️  Esta funcionalidad estará disponible próximamente.")


@app.command()
def hydrate(
    intent_id: str = typer.Option(..., help="UUID del Intent a hidratar")
):
    """
    Genera payload de contexto sin llamar a AI (En Desarrollo).
    
    NOTA: Este comando está en fase de implementación.
    
    Ejemplo:
        bloom hydrate --intent-id abc-123
    """
    typer.secho(
        f"💧 [EN DESARROLLO] Hydrating Intent: {intent_id}",
        fg=typer.colors.YELLOW
    )
    typer.echo("\n⚠️  Esta funcionalidad estará disponible próximamente.")


# =============================================================================
# PUNTO DE ENTRADA
# =============================================================================

if __name__ == "__main__":
    app()