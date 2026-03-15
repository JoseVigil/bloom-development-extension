import typer
from pathlib import Path
from typing import List, Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class TreeCommand(BaseCommand):
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="tree",
            category=CommandCategory.FILESYSTEM,
            version="1.0.0",
            description="Generate visual tree structure with optional MD5 hashing and JSON export",
            examples=[
                "brain tree",
                "brain tree --targets src tests",
                "brain tree --hash --export-json",
                "brain tree --dates",
                "brain tree --hash --dates",
                "brain tree --output custom-tree.txt",
                "brain tree -o report.txt --hash src package.json",
                'brain tree --targets "C:\\Users\\AppData\\Local\\bloom-development-extension"',
                # --generate-all examples
                "brain filesystem tree --generate-all",
                "brain filesystem tree --generate-all --config /path/to/brain.config.json",
            ]
        )

    def register(self, app: typer.Typer) -> None:
        @app.command(name=self.metadata().name)
        def execute(
            ctx: typer.Context,
            # ── NEW: Bulk generation flag ──────────────────────────────────────
            generate_all: bool = typer.Option(
                False,
                "--generate-all",
                help=(
                    "Generate ALL configured tree files from brain.config.json "
                    "and write them to the configured output directory (default: AppData/BloomNucleus/tree). "
                    "When set, all other options are ignored."
                ),
            ),
            config: Optional[Path] = typer.Option(
                None,
                "--config",
                help=(
                    "Path to brain.config.json used by --generate-all. "
                    "Defaults to brain.config.json in the current working directory."
                ),
            ),
            # ── Existing options (UNCHANGED) ───────────────────────────────────
            output: Path = typer.Option(
                Path("tree.txt"),
                "--output", "-o",
                help="Output file path"
            ),
            hash: bool = typer.Option(False, "--hash", help="Include MD5 hashes"),
            export_json: bool = typer.Option(False, "--export-json", help="Export JSON to disk"),
            dates: bool = typer.Option(False, "--dates", help="Include last-modified date (YYYY-MM-DD HH:MM) next to each entry"),
            targets: Optional[List[str]] = typer.Argument(
                None,
                help="Specific directories or files to include (supports absolute paths)."
            ),
        ):
            """
            Generate a visual directory tree structure with intelligent exclusions.
            
            Automatically excludes common dependency folders (node_modules, .git, __pycache__, etc.)
            and detects Python vendored libraries.
            
            Supports both relative and absolute paths in targets.

            Use --generate-all to bulk-generate all configured trees from brain.config.json.
            """
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()

            # ── BRANCH: --generate-all ─────────────────────────────────────────
            if generate_all:
                _run_generate_all(gc, config)
                return

            # ── EXISTING LOGIC (100% unchanged) ───────────────────────────────
            try:
                from brain.core.filesystem.tree_manager import TreeManager
                
                # DETERMINAR EL DIRECTORIO BASE
                # Si hay targets y el primero es una ruta absoluta, usarla como base
                base_dir = Path.cwd()
                
                if targets:
                    # Convertir el primer target a Path para verificar si es absoluto
                    first_target = Path(targets[0])
                    
                    if first_target.is_absolute():
                        # Si es absoluto, usar su directorio (o él mismo si es directorio)
                        if first_target.is_dir():
                            base_dir = first_target
                            # Si solo hay un target absoluto, limpiarlo para procesar todo su contenido
                            if len(targets) == 1:
                                targets = None
                            else:
                                # Remover el primer target ya que se convirtió en base
                                targets = targets[1:]
                        else:
                            # Si es un archivo, usar su directorio padre
                            base_dir = first_target.parent
                    
                    # Convertir targets restantes a rutas absolutas si son relativos
                    if targets:
                        resolved_targets = []
                        for t in targets:
                            t_path = Path(t)
                            if t_path.is_absolute():
                                # Verificar que la ruta absoluta esté dentro o sea el base_dir
                                try:
                                    t_path.relative_to(base_dir)
                                    # Es relativo a base_dir, usar como string relativo
                                    resolved_targets.append(str(t_path.relative_to(base_dir)))
                                except ValueError:
                                    # No es relativo a base_dir, esto es un problema
                                    typer.echo(
                                        f"⚠️  Warning: Target '{t}' is not within base directory '{base_dir}'",
                                        err=True
                                    )
                            else:
                                # Es relativo, mantenerlo
                                resolved_targets.append(t)
                        targets = resolved_targets if resolved_targets else None
                
                # DEBUG LOGGING
                if gc.verbose:
                    typer.echo(f"🌲 Generating tree from: {base_dir}", err=True)
                    if targets:
                        typer.echo(f"🎯 Targets: {targets}", err=True)
                    typer.echo(f"📄 Output: {output}", err=True)
                    typer.echo(f"🔑 Hash mode: {hash}", err=True)
                    typer.echo(f"📦 Export JSON: {export_json}", err=True)
                    typer.echo(f"📅 Dates mode: {dates}", err=True)
                
                # LÓGICA PURA con base_dir dinámico
                manager = TreeManager(base_dir)
                result = manager.generate(
                    targets=targets,
                    output_file=output,
                    use_hash=hash,
                    use_json=export_json,
                    use_dates=dates,
                )
                
                # ESTRUCTURA DE DATOS PURA
                data = {
                    "status": "success",
                    "operation": "tree_generation",
                    "result": {
                        "base_directory": str(base_dir.resolve()),
                        "output_file": str(output.resolve()),
                        "json_file": str(output.with_suffix('.json')) if hash and export_json else None,
                        "statistics": result.get("statistics", {}),
                        "project_hash": result.get("project_hash"),
                        "timestamp": result.get("timestamp"),
                        "targets_processed": targets or ["root"],
                        "hash_enabled": hash,
                        "json_exported": hash and export_json,
                        "dates_enabled": dates,
                        "warnings": result.get("warnings", [])
                    }
                }
                
                gc.output(data, self._render_human)
                
            except Exception as e:
                if gc.json_mode:
                    import json
                    typer.echo(json.dumps({
                        "status": "error",
                        "message": str(e),
                        "type": type(e).__name__,
                        "operation": "tree_generation"
                    }))
                else:
                    typer.echo(f"❌ Error generating tree: {e}", err=True)
                
                raise typer.Exit(code=1)

    # ── Renderers ─────────────────────────────────────────────────────────────

    def _render_human(self, data: dict):
        """Renderizado visual para terminal humana — single tree."""
        result = data.get("result", {})
        
        typer.echo("🌳 Tree Generation Complete")
        typer.echo("=" * 70)
        
        # Mostrar directorio base
        typer.echo(f"\n📁 Base directory: {result.get('base_directory', 'N/A')}")
        
        # Warnings
        warnings = result.get('warnings', [])
        if warnings:
            typer.echo("\n⚠️  WARNINGS:")
            for warning in warnings:
                typer.echo(f"   {warning}")
            typer.echo()
        
        typer.echo(f"\n📄 Output file: {result['output_file']}")
        
        if result.get('hash_enabled'):
            typer.echo(f"🔑 Hashing: Enabled")
            if result.get('project_hash'):
                typer.echo(f"   Project Hash: {result['project_hash']}")
        
        if result.get('dates_enabled'):
            typer.echo(f"📅 Dates: Enabled")
        
        if result.get('json_exported') and result.get('json_file'):
            typer.echo(f"📦 JSON export: {result['json_file']}")
        
        stats = result.get('statistics', {})
        if stats:
            typer.echo(f"\n📊 Statistics:")
            if 'total_files' in stats:
                typer.echo(f"   Files: {stats['total_files']}")
            if 'total_directories' in stats:
                typer.echo(f"   Directories: {stats['total_directories']}")
        
        targets = result.get('targets_processed', [])
        if targets != ['root']:
            typer.echo(f"\n🎯 Targets: {', '.join(targets)}")
        
        if warnings:
            typer.echo("\n⚠️  Some paths were not found. Check the output file for details.")
        else:
            typer.echo("\n✅ Tree structure saved successfully!")

    def _render_generate_all(self, data: dict):
        """Renderizado visual para terminal humana — generate-all bulk run."""
        result = data.get("result", {})
        status = result.get("status", "unknown")

        typer.echo("🌳 Tree Generate-All Complete")
        typer.echo("=" * 70)
        typer.echo(f"\n📁 Output directory : {result.get('output_dir', 'N/A')}")
        typer.echo(f"⚙️  Config used      : {result.get('config_used', 'N/A')}")
        typer.echo(f"🕐 Timestamp        : {result.get('timestamp', 'N/A')}")
        typer.echo()

        total   = result.get("targets_total", 0)
        ok      = result.get("targets_ok", 0)
        failed  = result.get("targets_failed", 0)

        typer.echo(f"📊 Results: {ok}/{total} targets generated successfully")
        typer.echo()

        for r in result.get("results", []):
            icon = "✅" if r["status"] == "ok" else "❌"
            desc = r.get("description", r.get("file", "?"))
            typer.echo(f"  {icon}  {r['file']:<25}  {desc}")
            if r["status"] == "error":
                typer.echo(f"       └─ Error: {r.get('error', 'unknown')}")

        typer.echo()
        if status == "success":
            typer.echo("✅ All trees generated successfully!")
        elif status == "partial":
            typer.echo(f"⚠️  Partial success — {failed} target(s) failed. Check errors above.")
        else:
            typer.echo("❌ All targets failed. Check errors above.")


# ── Standalone helper (outside class, avoids self reference in closure) ───────

def _run_generate_all(gc, config: Optional[Path]) -> None:
    """
    Orchestrates the --generate-all flow.
    Extracted to a module-level function to keep the Typer closure clean.
    """
    import json as json_lib

    try:
        from brain.core.filesystem.tree_all_manager import TreeAllManager

        if gc.verbose:
            typer.echo("🌲 Starting generate-all from config...", err=True)
            if config:
                typer.echo(f"⚙️  Config: {config}", err=True)

        manager = TreeAllManager(config_path=config)
        result = manager.generate_all()

        data = {
            "status": result["status"],
            "operation": "tree_generate_all",
            "result": result,
        }

        # Inline renderer reference (gc.output needs a callable)
        def _render(d: dict):
            res = d.get("result", {})
            status = res.get("status", "?")
            typer.echo("🌳 Tree Generate-All Complete")
            typer.echo("=" * 70)
            typer.echo(f"\n📁 Output directory : {res.get('output_dir', 'N/A')}")
            typer.echo(f"⚙️  Config used      : {res.get('config_used', 'N/A')}")
            typer.echo(f"🕐 Timestamp        : {res.get('timestamp', 'N/A')}")
            typer.echo()

            total  = res.get("targets_total", 0)
            ok     = res.get("targets_ok", 0)
            failed = res.get("targets_failed", 0)
            typer.echo(f"📊 Results: {ok}/{total} targets generated successfully")
            typer.echo()

            for r in res.get("results", []):
                icon = "✅" if r["status"] == "ok" else "❌"
                desc = r.get("description", r.get("file", "?"))
                typer.echo(f"  {icon}  {r['file']:<25}  {desc}")
                if r["status"] == "error":
                    typer.echo(f"       └─ Error: {r.get('error', 'unknown')}")

            typer.echo()
            if status == "success":
                typer.echo("✅ All trees generated successfully!")
            elif status == "partial":
                typer.echo(f"⚠️  Partial success — {failed} target(s) failed.")
            else:
                typer.echo("❌ All targets failed.")

        gc.output(data, _render)

        if result["status"] == "error":
            raise typer.Exit(code=1)

    except FileNotFoundError as e:
        if gc.json_mode:
            typer.echo(json_lib.dumps({
                "status": "error",
                "message": str(e),
                "type": "FileNotFoundError",
                "operation": "tree_generate_all",
            }))
        else:
            typer.echo(f"❌ Config not found: {e}", err=True)
        raise typer.Exit(code=1)

    except Exception as e:
        if gc.json_mode:
            typer.echo(json_lib.dumps({
                "status": "error",
                "message": str(e),
                "type": type(e).__name__,
                "operation": "tree_generate_all",
            }))
        else:
            typer.echo(f"❌ Error in generate-all: {e}", err=True)
        raise typer.Exit(code=1)