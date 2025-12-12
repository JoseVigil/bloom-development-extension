import sys
import asyncio
import typer
from bloom_core.orchestrator.engine import BloomEngine
from bloom_core.config import settings

app = typer.Typer(name="bloom-cli")

@app.command()
def run(
    intent_id: str = typer.Option(..., help="UUID del Intent"),
    phase: str = typer.Option(..., help="briefing | execution | refinement"),
    project_root: str = typer.Option(..., help="Ruta absoluta del proyecto del usuario")
):
    """
    Comando principal invocado por VSCode.
    """
    # Inicializar el motor con configs inyectadas
    engine = BloomEngine(
        project_root=project_root,
        api_key=settings.GEMINI_API_KEY  # Viene de variables de entorno
    )
    
    # Ejecutar asíncronamente
    asyncio.run(engine.execute_phase(intent_id, phase))

@app.command()
def hydrate(intent_id: str, project_root: str):
    """Herramienta de diagnóstico para generar payload sin llamar a IA."""
    pass

if __name__ == "__main__":
    app()