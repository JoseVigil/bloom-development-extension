#!/usr/bin/env python3
"""
migrate_to_v2_complete.py - Migrador Completo a Bloom CLI v2.0

VERSIÓN PRODUCTION READY con código completo embebido.

USO:
    python migrate_to_v2_complete.py --dry-run     # Simular
    python migrate_to_v2_complete.py               # Ejecutar
"""

import os
import shutil
import sys
from pathlib import Path
from datetime import datetime
from typing import List, Tuple
import argparse


# ============================================================================
# TEMPLATES COMPLETOS (Código real embebido)
# ============================================================================

VERSION_PY = '''"""Versión global del CLI"""
VERSION = "2.0.0"
'''

BASE_PY = '''"""BaseCommand: Contrato que garantiza compatibilidad eterna"""
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List
from pathlib import Path
import typer


class CommandMetadata:
    """Metadata de cada comando para versionado y deprecación"""
    def __init__(
        self,
        name: str,
        version: str,
        category: str,
        description: str,
        deprecated: bool = False,
        deprecated_message: Optional[str] = None,
        replacement: Optional[str] = None,
        examples: Optional[List[str]] = None
    ):
        self.name = name
        self.version = version
        self.category = category
        self.description = description
        self.deprecated = deprecated
        self.deprecated_message = deprecated_message
        self.replacement = replacement
        self.examples = examples or []


class BaseCommand(ABC):
    """
    Contrato base para todos los comandos de Bloom CLI.
    GARANTÍAS: Este contrato NUNCA cambiará en versiones mayores.
    """
    
    @abstractmethod
    def metadata(self) -> CommandMetadata:
        """Define metadata del comando - OBLIGATORIO"""
        pass
    
    @abstractmethod
    def register(self, app: typer.Typer) -> None:
        """Registra el comando en Typer - OBLIGATORIO"""
        pass
    
    def validate_environment(self) -> bool:
        """Valida entorno antes de registrar"""
        return True
    
    def on_before_execute(self, **kwargs) -> Dict[str, Any]:
        """Hook pre-ejecución"""
        return kwargs
    
    def on_after_execute(self, result: Any, **kwargs) -> None:
        """Hook post-ejecución"""
        pass
    
    def on_error(self, error: Exception, **kwargs) -> None:
        """Handler de errores por defecto"""
        typer.secho(f"❌ Error: {error}", fg=typer.colors.RED)
        raise typer.Exit(code=1)
'''

LOADER_PY = '''"""CommandLoader: Descubre y registra comandos automáticamente"""
import importlib
import inspect
from pathlib import Path
from typing import List
import typer
from core.cli.base import BaseCommand


class CommandLoader:
    """Carga comandos automáticamente desde el filesystem"""
    
    def discover_and_register(self, app: typer.Typer, commands_dir: Path) -> List[str]:
        """Descubre y registra todos los comandos"""
        registered = []
        
        if not commands_dir.exists():
            typer.secho(
                f"⚠️  Directorio de comandos no encontrado: {commands_dir}",
                fg=typer.colors.YELLOW
            )
            return registered
        
        # Buscar recursivamente archivos .py
        for py_file in commands_dir.rglob("*.py"):
            if py_file.name.startswith("_"):
                continue
            
            relative_path = py_file.relative_to(commands_dir.parent)
            module_path = str(relative_path.with_suffix("")).replace(os.sep, ".")
            
            try:
                module = importlib.import_module(f"core.{module_path}")
                
                for name, obj in inspect.getmembers(module, inspect.isclass):
                    if (issubclass(obj, BaseCommand) and 
                        obj is not BaseCommand and
                        not inspect.isabstract(obj)):
                        
                        command = obj()
                        metadata = command.metadata()
                        
                        if not command.validate_environment():
                            continue
                        
                        command.register(app)
                        registered.append(metadata.name)
                        
                        if metadata.deprecated:
                            typer.secho(
                                f"⚠️  '{metadata.name}' deprecado: {metadata.deprecated_message}",
                                fg=typer.colors.YELLOW
                            )
                        
            except Exception as e:
                typer.secho(f"❌ Error cargando {py_file.name}: {e}", fg=typer.colors.RED)
                continue
        
        return registered
'''

APP_PY = '''"""Factory que crea la app Typer y registra comandos automáticamente"""
import typer
from pathlib import Path
from core.cli.loader import CommandLoader
from core.cli.version import VERSION


def create_app() -> typer.Typer:
    """Crea y configura la aplicación CLI con auto-discovery de comandos"""
    app = typer.Typer(
        name="bloom",
        help=f"🌸 Bloom Cognitive Core v{VERSION} - Sistema de Gestión de Proyectos Inteligente",
        no_args_is_help=True,
        add_completion=True,
        pretty_exceptions_enable=False
    )
    
    # Cargar comandos automáticamente
    loader = CommandLoader()
    commands_dir = Path(__file__).parent.parent / "commands"
    registered = loader.discover_and_register(app, commands_dir)
    
    # Callback global
    @app.callback(invoke_without_command=True)
    def global_callback(
        version: bool = typer.Option(False, "--version", "-v", help="Mostrar versión"),
        ctx: typer.Context = None
    ):
        if version:
            typer.echo(f"Bloom CLI v{VERSION}")
            raise typer.Exit()
    
    return app
'''

NEW_MAIN_PY = '''"""
Bloom CLI v2.0 - Sistema de Comandos Autoregistrables
Agregar comandos: Crear clase en core/commands/* que herede BaseCommand
"""
import sys
import os
from pathlib import Path

# --- BLOOM NUCLEUS BOOTSTRAP ------------------------------------------------
current_dir = os.path.dirname(os.path.abspath(__file__))
libs_dir = os.path.join(current_dir, 'libs')
if os.path.exists(libs_dir) and libs_dir not in sys.path:
    sys.path.insert(0, libs_dir)
# ----------------------------------------------------------------------------

from core.cli.app import create_app


def main():
    """Entry point - Carga automática de comandos"""
    app = create_app()
    app()


if __name__ == "__main__":
    main()
'''


def get_tree_command() -> str:
    return '''"""TreeCommand - Genera mapas visuales del proyecto"""
from pathlib import Path
from typing import List, Optional
import typer
from core.cli.base import BaseCommand, CommandMetadata
from core.filesystem.tree_manager import TreeManager


class TreeCommand(BaseCommand):
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="tree",
            version="1.0.0",
            category="filesystem",
            description="Genera el mapa visual y técnico del proyecto",
            examples=[
                "bloom tree --out project-tree.txt --hash",
                "bloom tree --out tree.txt --root ./src --json"
            ]
        )
    
    def register(self, app: typer.Typer) -> None:
        @app.command(name="tree", help=self.metadata().description)
        def tree_command(
            output: Path = typer.Option(..., "--out", "-o", help="Archivo de destino"),
            paths: Optional[List[str]] = typer.Argument(None, help="Carpetas a incluir"),
            root: Path = typer.Option(Path("."), "--root", "-r", help="Raíz del proyecto"),
            hash: bool = typer.Option(False, "--hash", help="Calcular MD5"),
            json: bool = typer.Option(False, "--json", help="Exportar JSON metadata")
        ):
            try:
                if output.is_dir():
                    typer.secho(
                        f"❌ Error: '{output}' es un directorio. Indica un archivo.",
                        fg=typer.colors.RED
                    )
                    raise typer.Exit(code=1)
                
                manager = TreeManager(root_path=root)
                typer.secho("🌳 Bloom Tree Generator", fg=typer.colors.GREEN, bold=True)
                
                manager.generate(
                    targets=paths,
                    output_file=output,
                    use_hash=hash,
                    use_json=json
                )
                
                typer.secho(f"✅ Árbol generado en: {output}", fg=typer.colors.GREEN)
                
            except Exception as e:
                self.on_error(e)
'''


def get_compress_command() -> str:
    return '''"""CompressCommand - Empaqueta código/docs"""
from pathlib import Path
from typing import List, Optional
import typer
from core.cli.base import BaseCommand, CommandMetadata
from core.filesystem.files_compressor import FilesCompressor


class CompressCommand(BaseCommand):
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="compress",
            version="1.0.0",
            category="filesystem",
            description="Empaqueta código/docs usando Protocolo v2.1 (Gzip+Base64)",
            examples=[
                "bloom compress --mode codebase --input ./src --output ./dist",
                "bloom compress --mode docbase --input ./docs --no-comments"
            ]
        )
    
    def register(self, app: typer.Typer) -> None:
        @app.command(name="compress", help=self.metadata().description)
        def compress_command(
            mode: str = typer.Option(..., "--mode", "-m", help="codebase | docbase"),
            inputs: List[str] = typer.Option(..., "--input", "-i", help="Paths de entrada"),
            output: Optional[Path] = typer.Option(None, "--output", "-o", help="Directorio de salida"),
            exclude: Optional[str] = typer.Option(None, "--exclude", "-e", help="Patrones a excluir (csv)"),
            no_comments: bool = typer.Option(False, "--no-comments", help="Remover comentarios")
        ):
            try:
                exclude_patterns = [p.strip() for p in exclude.split(',')] if exclude else None
                compressor = FilesCompressor(mode=mode, preserve_comments=not no_comments)
                
                json_path, index_path = compressor.compress_paths(
                    input_paths=inputs,
                    output_dir=str(output) if output else None,
                    exclude_patterns=exclude_patterns
                )
                
                typer.secho(f"✅ Compresión exitosa: {json_path}", fg=typer.colors.GREEN)
                typer.echo(f"   📋 Índice: {index_path}")
                
            except Exception as e:
                self.on_error(e)
'''


def get_extract_command() -> str:
    return '''"""ExtractCommand - Descomprime archivos"""
from pathlib import Path
from typing import Optional
import typer
from core.cli.base import BaseCommand, CommandMetadata
from core.filesystem.files_extractor import FilesExtractor


class ExtractCommand(BaseCommand):
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="extract",
            version="1.0.0",
            category="filesystem",
            description="Descomprime archivos usando FilesExtractor",
            examples=[
                "bloom extract --input project.codebase.json --output ./restored",
                "bloom extract --input backup.json --file 'src/main.py'"
            ]
        )
    
    def register(self, app: typer.Typer) -> None:
        @app.command(name="extract", help=self.metadata().description)
        def extract_command(
            input: Path = typer.Option(..., "--input", "-i", help="Archivo JSON (.codebase.json)"),
            output: Optional[Path] = typer.Option(None, "--output", "-o", help="Directorio destino"),
            file: Optional[str] = typer.Option(None, "--file", "-f", help="Archivo específico"),
            no_verify: bool = typer.Option(False, "--no-verify", help="Saltar verificación de hash")
        ):
            try:
                extractor = FilesExtractor(verify_hashes=not no_verify)
                
                if file:
                    content = extractor.get_file(str(input), file)
                    print(content)
                else:
                    extractor.extract(str(input), str(output) if output else None)
                    typer.secho("✅ Extracción completada.", fg=typer.colors.GREEN)
                    
            except Exception as e:
                self.on_error(e)
'''


def get_init_nucleus_command() -> str:
    return '''"""InitNucleusCommand - Inicializa estructura .bloom"""
from pathlib import Path
import typer
from core.cli.base import BaseCommand, CommandMetadata
from core.generators.nucleus_generator import NucleusGenerator


class InitNucleusCommand(BaseCommand):
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="init-nucleus",
            version="1.0.0",
            category="project",
            description="Inicializa la estructura .bloom para un proyecto Nucleus",
            examples=[
                "bloom init-nucleus --org 'Mi Empresa' --url 'https://empresa.com'",
                "bloom init-nucleus --org 'StartupXYZ' --root ./monorepo"
            ]
        )
    
    def register(self, app: typer.Typer) -> None:
        @app.command(name="init-nucleus", help=self.metadata().description)
        def init_nucleus_command(
            org: str = typer.Option(..., help="Nombre de la organización"),
            url: str = typer.Option("", help="URL de la organización"),
            root: Path = typer.Option(Path("."), "--root", "-r", help="Raíz del proyecto"),
            output: Path = typer.Option(Path(".bloom"), "--output", "-o", help="Carpeta de salida")
        ):
            try:
                generator = NucleusGenerator(root)
                typer.secho(f"🚀 Inicializando Nucleus: {org}", fg=typer.colors.BLUE, bold=True)
                
                project_count = generator.generate(org, url, output)
                
                typer.secho(f"✅ Nucleus generado en: {output}", fg=typer.colors.GREEN)
                typer.echo(f"   🔗 Proyectos vinculados: {project_count}")
                
            except Exception as e:
                self.on_error(e)
'''


def get_analyze_command() -> str:
    return '''"""AnalyzeCommand - Análisis técnico automático"""
from pathlib import Path
import typer
from core.cli.base import BaseCommand, CommandMetadata
from core.generators.context_strategy import ContextStrategyManager


class AnalyzeCommand(BaseCommand):
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="analyze",
            version="1.0.0",
            category="analysis",
            description="[GENESIS PHASE 2] Discovery: Análisis técnico automático (Multi-Stack)",
            examples=[
                "bloom analyze --root ./project",
                "bloom analyze --output custom-architecture.bl"
            ]
        )
    
    def register(self, app: typer.Typer) -> None:
        @app.command(name="analyze", help=self.metadata().description)
        def analyze_command(
            root: Path = typer.Option(Path("."), "--root", "-r", help="Raíz del proyecto"),
            output: Path = typer.Option(
                Path(".project/.doc.app.architecture.bl"),
                "--output", "-o",
                help="Archivo de destino"
            )
        ):
            try:
                manager = ContextStrategyManager(root)
                
                typer.secho(
                    f"🔍 [Genesis: Discovery] Iniciando análisis en: {root.resolve()}",
                    fg=typer.colors.BLUE
                )
                
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
                self.on_error(e)
'''


def get_run_command() -> str:
    return '''"""RunCommand - Orquestador de ciclos cognitivos (ALPHA)"""
from pathlib import Path
import typer
from core.cli.base import BaseCommand, CommandMetadata


class RunCommand(BaseCommand):
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="run",
            version="0.1.0",
            category="orchestrator",
            description="[ALPHA] Ejecuta un ciclo cognitivo completo",
            examples=[
                "bloom run --intent-id abc-123 --phase briefing"
            ]
        )
    
    def register(self, app: typer.Typer) -> None:
        @app.command(name="run", help=self.metadata().description)
        def run_command(
            intent_id: str = typer.Option(..., help="UUID del Intent"),
            phase: str = typer.Option(..., help="Fase: briefing | execution | refinement"),
            root: Path = typer.Option(Path("."), "--root", "-r", help="Raíz del proyecto")
        ):
            typer.secho(
                f"🚀 [ALPHA] Ejecutando Engine para Intent: {intent_id}",
                fg=typer.colors.YELLOW
            )
            typer.echo(f"   Fase: {phase}")
            typer.echo(f"   Root: {root}")
            typer.echo("\\n⚠️  Esta funcionalidad está en desarrollo activo.")
'''


def get_hydrate_command() -> str:
    return '''"""HydrateCommand - Generador de contexto (ALPHA)"""
import typer
from core.cli.base import BaseCommand, CommandMetadata


class HydrateCommand(BaseCommand):
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="hydrate",
            version="0.1.0",
            category="orchestrator",
            description="[ALPHA] Genera payload de contexto sin llamar a AI",
            examples=[
                "bloom hydrate --intent-id abc-123"
            ]
        )
    
    def register(self, app: typer.Typer) -> None:
        @app.command(name="hydrate", help=self.metadata().description)
        def hydrate_command(
            intent_id: str = typer.Option(..., help="UUID del Intent a hidratar")
        ):
            typer.secho(
                f"💧 [ALPHA] Hydrating Intent: {intent_id}",
                fg=typer.colors.YELLOW
            )
            typer.echo("\\n⚠️  Esta funcionalidad está en desarrollo activo.")
'''


# ============================================================================
# MIGRADOR
# ============================================================================

class BloomMigrator:
    """Migrador automático de Bloom CLI v1 → v2"""
    
    def __init__(self, root: Path, dry_run: bool = False, backup_dir: Path = None):
        self.root = root
        self.dry_run = dry_run
        self.backup_dir = backup_dir or (root / "backups" / f"bloom_v1_{datetime.now().strftime('%Y%m%d_%H%M%S')}")
        
        self.old_main = root / "__main__.py"
        self.core_dir = root / "core"
        self.commands_dir = self.core_dir / "commands"
        self.cli_dir = self.core_dir / "cli"
        
    def log(self, message: str, level: str = "INFO"):
        """Logger con colores"""
        colors = {
            "INFO": "\033[94m",
            "SUCCESS": "\033[92m",
            "WARNING": "\033[93m",
            "ERROR": "\033[91m",
            "RESET": "\033[0m"
        }
        
        prefix = "🔹" if level == "INFO" else \
                 "✅" if level == "SUCCESS" else \
                 "⚠️ " if level == "WARNING" else \
                 "❌"
        
        color = colors.get(level, colors["RESET"])
        print(f"{color}{prefix} {message}{colors['RESET']}")
        
        if self.dry_run and level in ["INFO", "SUCCESS"]:
            print(f"   [DRY-RUN: No se ejecutó realmente]")
    
    def backup_original(self):
        """Crea backup del __main__.py original"""
        self.log("Creando backup del código original...")
        
        if not self.old_main.exists():
            self.log("No se encontró __main__.py", "ERROR")
            return False
        
        if self.dry_run:
            self.log(f"Se crearía backup en: {self.backup_dir}")
            return True
        
        self.backup_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(self.old_main, self.backup_dir / "__main__.py.backup")
        
        self.log(f"Backup guardado en: {self.backup_dir}", "SUCCESS")
        return True
    
    def create_directory_structure(self):
        """Crea la estructura de directorios v2"""
        self.log("Creando estructura de directorios v2...")
        
        directories = [
            self.cli_dir,
            self.commands_dir / "filesystem",
            self.commands_dir / "analysis",
            self.commands_dir / "project",
            self.commands_dir / "orchestrator"
        ]
        
        for directory in directories:
            if self.dry_run:
                self.log(f"Se crearía: {directory.relative_to(self.root)}")
            else:
                directory.mkdir(parents=True, exist_ok=True)
                (directory / "__init__.py").touch()
        
        self.log("Estructura de directorios creada", "SUCCESS")
        return True
    
    def generate_core_files(self):
        """Genera archivos core del sistema v2"""
        self.log("Generando archivos core...")
        
        files_to_create = [
            (self.cli_dir / "version.py", VERSION_PY),
            (self.cli_dir / "base.py", BASE_PY),
            (self.cli_dir / "loader.py", LOADER_PY),
            (self.cli_dir / "app.py", APP_PY),
            (self.root / "__main__.py", NEW_MAIN_PY)
        ]
        
        for file_path, content in files_to_create:
            if self.dry_run:
                self.log(f"Se crearía: {file_path.relative_to(self.root)}")
            else:
                file_path.write_text(content, encoding='utf-8')
        
        self.log("Archivos core generados", "SUCCESS")
        return True
    
    def migrate_commands(self):
        """Migra los 7 comandos existentes al nuevo formato"""
        self.log("Migrando comandos al nuevo formato...")
        
        commands_map = [
            ("filesystem/tree.py", get_tree_command()),
            ("filesystem/compress.py", get_compress_command()),
            ("filesystem/extract.py", get_extract_command()),
            ("project/init_nucleus.py", get_init_nucleus_command()),
            ("analysis/analyze.py", get_analyze_command()),
            ("orchestrator/run.py", get_run_command()),
            ("orchestrator/hydrate.py", get_hydrate_command())
        ]
        
        for rel_path, content in commands_map:
            file_path = self.commands_dir / rel_path
            
            if self.dry_run:
                self.log(f"Se crearía: commands/{rel_path}")
            else:
                file_path.write_text(content, encoding='utf-8')
        
        self.log(f"Migrados {len(commands_map)} comandos", "SUCCESS")
        return True
    
    def validate_migration(self) -> List[Tuple[str, bool]]:
        """Valida que la migración sea correcta"""
        self.log("Validando migración...")
        
        checks = [
            ("Backup creado", self.backup_dir.exists() if not self.dry_run else False),
            ("Estructura CLI", self.cli_dir.exists() if not self.dry_run else False),
            ("Estructura Commands", self.commands_dir.exists() if not self.dry_run else False),
            ("Nuevo __main__.py", (self.root / "__main__.py").exists()),
            ("core/cli/app.py", (self.cli_dir / "app.py").exists() if not self.dry_run else False),
            ("core/cli/base.py", (self.cli_dir / "base.py").exists() if not self.dry_run else False),
            ("core/cli/loader.py", (self.cli_dir / "loader.py").exists() if not self.dry_run else False),
            ("Comandos migrados", len(list(self.commands_dir.rglob("*.py"))) >= 7 if not self.dry_run else False)
        ]
        
        all_ok = True
        for check_name, result in checks:
            status = "SUCCESS" if result else "ERROR"
            self.log(f"{check_name}: {'✓' if result else '✗'}", status)
            if not result and not self.dry_run:
                all_ok = False
        
        return checks
    
    def run(self):
        """Ejecuta la migración completa"""
        print("\n" + "="*70)
        print("🌸 BLOOM CLI v2.0 - MIGRADOR AUTOMÁTICO")
        print("="*70 + "\n")
        
        if self.dry_run:
            print("🔍 MODO DRY-RUN: No se harán cambios reales\n")
        
        steps = [
            ("Backup del código original", self.backup_original),
            ("Crear estructura de directorios", self.create_directory_structure),
            ("Generar archivos core", self.generate_core_files),
            ("Migrar comandos", self.migrate_commands)
        ]
        
        for step_name, step_func in steps:
            self.log(f"\n{'─'*60}")
            self.log(f"PASO: {step_name}")
            self.log(f"{'─'*60}")
            
            try:
                if not step_func():
                    self.log(f"Error en: {step_name}", "ERROR")
                    return False
            except Exception as e:
                self.log(f"Excepción en {step_name}: {e}", "ERROR")
                return False
        
        # Validación final
        self.log(f"\n{'─'*60}")
        self.log("VALIDACIÓN FINAL")
        self.log(f"{'─'*60}")
        
        checks = self.validate_migration()
        
        if self.dry_run:
            self.log("\n✨ Simulación completada. Ejecutar sin --dry-run para aplicar cambios.", "SUCCESS")
            return True
        
        if all(result for _, result in checks):
            self.log("\n✨ ¡MIGRACIÓN COMPLETADA EXITOSAMENTE!", "SUCCESS")
            self.log(f"\nBackup guardado en: {self.backup_dir}", "INFO")
            self.log("\nPróximos pasos:", "INFO")
            print("   1. Revisar los comandos migrados en core/commands/")
            print("   2. Ejecutar: python -m bloom --help")
            print("   3. Probar cada comando individualmente")
            print("   4. Si algo falla, restaurar desde backup")
            return True
        else:
            self.log("\n⚠️  La migración tuvo problemas", "WARNING")
            return False


def main():
    parser = argparse.ArgumentParser(
        description="Migra Bloom CLI v1 a v2 automáticamente"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simula la migración sin hacer cambios reales"
    )
    parser.add_argument(
        "--backup-dir",
        type=Path,
        help="Directorio para guardar backup"
    )
    parser.add_argument(
        "--root",
        type=Path,
        default=Path("."),
        help="Raíz del proyecto Bloom"
    )
    
    args = parser.parse_args()
    
    migrator = BloomMigrator(
        root=args.root,
        dry_run=args.dry_run,
        backup_dir=args.backup_dir
    )
    
    success = migrator.run()
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()