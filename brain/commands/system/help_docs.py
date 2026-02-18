"""
Help Docs Command — brain system help --generate-all

Generates all configured help documentation files in-process (no subprocesses)
and deploys them to the configured output directory (default: AppData/BloomNucleus/bin/help).

This command replaces scripts/python/generate_help_files.py.
"""

import json as json_lib
from pathlib import Path
from typing import Optional

import typer

from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class HelpDocsCommand(BaseCommand):
    """
    Generates and deploys all brain help documentation files.

    Uses render_help() internally (zero subprocess calls) to produce:
      - help.txt             Plain text help (brain --help)
      - help-full.txt        Full help with all commands (brain --help --full)
      - brain-legacy.json    Legacy JSON schema (brain --json --help)
      - brain-ai-schema.json AI-Native JSON schema (brain --ai --help)
      - brain-ai-full.json   AI-Native JSON schema full (brain --ai --help --full)

    Output directory and variant list are driven by brain.config.json.
    """

    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="help",
            category=CommandCategory.SYSTEM,
            version="1.0.0",
            description="Generate and deploy all help documentation files from brain.config.json",
            examples=[
                "brain system help --generate-all",
                "brain system help --generate-all --config /path/to/brain.config.json",
                "brain system help --generate-all --json",
                "brain system help --generate-all --verbose",
            ],
        )

    def register(self, app: typer.Typer) -> None:
        @app.command(name=self.metadata().name)
        def execute(
            ctx: typer.Context,
            generate_all: bool = typer.Option(
                False,
                "--generate-all",
                help=(
                    "Generate ALL configured help documentation files from brain.config.json "
                    "and deploy them to the configured output directory "
                    "(default: AppData/BloomNucleus/bin/help)."
                ),
            ),
            config: Optional[Path] = typer.Option(
                None,
                "--config",
                help=(
                    "Path to brain.config.json. "
                    "Defaults to brain.config.json in the current working directory."
                ),
            ),
        ):
            """
            Generate and deploy all brain help documentation files.

            Use --generate-all to bulk-generate all variants defined in brain.config.json.
            Output directory is read from config (default: AppData/BloomNucleus/bin/help).
            """
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()

            if not generate_all:
                typer.echo(
                    "ℹ️  No action specified. Use --generate-all to generate help documentation.",
                    err=True,
                )
                typer.echo("   Example: brain system help --generate-all", err=True)
                raise typer.Exit(code=0)

            _run_generate_all(gc, config)

    # ------------------------------------------------------------------
    # Error handler
    # ------------------------------------------------------------------

    def _handle_error(self, gc, message: str, operation: str = "help_generate_all") -> None:
        """Unified error output (JSON or human)."""
        if gc.json_mode:
            typer.echo(json_lib.dumps({
                "status": "error",
                "message": message,
                "operation": operation,
            }))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)


# ---------------------------------------------------------------------------
# Standalone orchestration helper
# ---------------------------------------------------------------------------

def _run_generate_all(gc, config: Optional[Path]) -> None:
    """
    Orchestrates the --generate-all flow for help docs.
    Module-level function to keep the Typer closure clean.
    """
    try:
        from brain.core.system.help_docs_manager import HelpDocsManager
        from brain.cli.registry import CommandRegistry

        if gc.verbose:
            typer.echo("📄 Starting help generate-all from config...", err=True)
            if config:
                typer.echo(f"⚙️  Config: {config}", err=True)

        # Resolve the registry — adjust to your actual registry access pattern.
        # Common patterns:
        #   registry = gc.registry          (if gc exposes it)
        #   registry = CommandRegistry.get_instance()  (if singleton)
        #   registry = CommandRegistry()    (if constructed fresh)
        registry = _get_registry(gc)

        manager = HelpDocsManager(
            registry=registry,
            config_path=config,
        )
        result = manager.generate_all()

        data = {
            "status": result["status"],
            "operation": "help_generate_all",
            "result": result,
        }

        gc.output(data, _render_generate_all)

        if result["status"] == "error":
            raise typer.Exit(code=1)

    except FileNotFoundError as e:
        _emit_error(gc, str(e), "FileNotFoundError")

    except Exception as e:
        _emit_error(gc, str(e), type(e).__name__)


def _get_registry(gc) -> "CommandRegistry":
    """
    Retrieves the active CommandRegistry from GlobalContext or creates one.

    Priority:
        1. gc.registry   — if GlobalContext exposes the registry (preferred)
        2. CommandRegistry.get_instance() — if it's a singleton
        3. Raises AttributeError with a helpful message
    """
    from brain.cli.registry import CommandRegistry

    if hasattr(gc, "registry") and gc.registry is not None:
        return gc.registry

    if hasattr(CommandRegistry, "get_instance"):
        return CommandRegistry.get_instance()

    raise AttributeError(
        "Cannot resolve CommandRegistry. "
        "Expose it via gc.registry or add a CommandRegistry.get_instance() classmethod."
    )


def _render_generate_all(data: dict) -> None:
    """Human-readable renderer for help generate-all results."""
    result = data.get("result", {})
    status = result.get("status", "unknown")

    typer.echo("📄 Help Generate-All Complete")
    typer.echo("=" * 70)
    typer.echo(f"\n📁 Output directory : {result.get('output_dir', 'N/A')}")
    typer.echo(f"⚙️  Config used      : {result.get('config_used', 'N/A')}")
    typer.echo(f"🕐 Timestamp        : {result.get('timestamp', 'N/A')}")
    typer.echo()

    total  = result.get("variants_total", 0)
    ok     = result.get("variants_ok", 0)
    failed = result.get("variants_failed", 0)

    typer.echo(f"📊 Results: {ok}/{total} variants generated successfully")
    typer.echo()

    for r in result.get("results", []):
        icon  = "✅" if r["status"] == "ok" else "❌"
        desc  = r.get("description", r.get("file", "?"))
        mode  = r.get("mode", "?")
        full  = " [full]" if r.get("full") else ""
        size  = f"  ({r['bytes_written']:,} bytes)" if r.get("bytes_written") else ""
        typer.echo(f"  {icon}  {r['file']:<25}  [{mode}{full}]{size}")
        if r["status"] == "error":
            typer.echo(f"       └─ Error: {r.get('error', 'unknown')}")

    typer.echo()
    if status == "success":
        typer.echo("✅ All help documentation generated successfully!")
    elif status == "partial":
        typer.echo(f"⚠️  Partial success — {failed} variant(s) failed. Check errors above.")
    else:
        typer.echo("❌ All variants failed. Check errors above.")


def _emit_error(gc, message: str, error_type: str) -> None:
    """Emits error in the appropriate format and exits."""
    if gc.json_mode:
        typer.echo(json_lib.dumps({
            "status": "error",
            "message": message,
            "type": error_type,
            "operation": "help_generate_all",
        }))
    else:
        typer.echo(f"❌ {message}", err=True)
    raise typer.Exit(code=1)