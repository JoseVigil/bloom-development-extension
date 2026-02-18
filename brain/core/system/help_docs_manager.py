"""
HelpDocsManager - Bulk Help Documentation Generation.

Captures brain's own render_help() output in-process (zero subprocesses)
for every configured variant and writes them to the configured deploy directory.

Used by: brain system help --generate-all
Replaces: scripts/python/generate_help_files.py (external subprocess-based script)
"""

import io
import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from brain.cli.registry import CommandRegistry


# ---------------------------------------------------------------------------
# AppData Path Resolution (shared logic — mirrors tree_all_manager.py)
# ---------------------------------------------------------------------------

def _resolve_appdata_base() -> Path:
    """Returns platform-appropriate base AppData directory."""
    if sys.platform == "win32":
        local_app_data = os.environ.get("LOCALAPPDATA", "")
        if local_app_data:
            return Path(local_app_data)
        return Path.home() / "AppData" / "Local"
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support"
    return Path.home() / ".local" / "share"


def _resolve_appdata_uri(uri: str) -> Path:
    """Resolves 'appdata://BloomNucleus/bin/help' → absolute Path."""
    if not uri.startswith("appdata://"):
        raise ValueError(f"Expected 'appdata://' URI, got: {uri!r}")
    remainder = uri[len("appdata://"):].replace("\\", "/").split("/")
    base = _resolve_appdata_base() / remainder[0]
    if len(remainder) > 1:
        base = base.joinpath(*remainder[1:])
    return base


def _resolve_output_dir(raw: str, project_root: Path) -> Path:
    """Resolves output_dir from config — supports appdata:// and relative paths."""
    if raw.startswith("appdata://"):
        return _resolve_appdata_uri(raw)
    p = Path(raw)
    return p if p.is_absolute() else project_root / p


# ---------------------------------------------------------------------------
# Config Loader
# ---------------------------------------------------------------------------

def _load_config(config_path: Path) -> Dict[str, Any]:
    """Loads brain.config.json and validates the 'help' section."""
    if not config_path.exists():
        raise FileNotFoundError(
            f"Config file not found: {config_path.resolve()}\n"
            f"Tip: create brain.config.json at your project root."
        )
    with open(config_path, encoding="utf-8") as f:
        data = json.load(f)
    if "help" not in data:
        raise ValueError("Config file is missing required 'help' section.")
    if "variants" not in data["help"]:
        raise ValueError("Config 'help.variants' must be a list.")
    return data


# ---------------------------------------------------------------------------
# In-Process Help Capture
# ---------------------------------------------------------------------------

def _capture_render_help(
    registry: CommandRegistry,
    json_mode: bool = False,
    ai_native: bool = False,
    full_help: bool = False,
) -> str:
    """
    Calls render_help() with stdout redirected to a StringIO buffer
    and returns the captured output as a string.

    This is the core trick that eliminates the need for subprocess calls:
    render_help() already detects non-TTY stdout and uses Console(record=True)
    + console.export_text() internally, writing the result to stdout.
    We intercept that write here.

    Args:
        registry   : The live CommandRegistry instance.
        json_mode  : Produce legacy JSON output (brain-legacy.json).
        ai_native  : Produce AI-Native JSON schema (brain-ai-schema.json).
        full_help  : Include all category panels (brain --help --full).

    Returns:
        The complete captured output string (UTF-8).
    """
    from brain.cli.help_renderer import render_help

    # Redirect stdout
    capture_buffer = io.StringIO()
    original_stdout = sys.stdout
    sys.stdout = capture_buffer

    # Temporarily inject --ai into argv when needed so render_help()'s
    # internal argv check (line: `if ai_native or (json_mode and "--ai" in sys.argv)`)
    # behaves correctly.
    original_argv = sys.argv[:]
    if ai_native:
        if "--ai" not in sys.argv:
            sys.argv = sys.argv + ["--ai"]
    
    try:
        render_help(
            registry,
            json_mode=json_mode or ai_native,
            ai_native=ai_native,
            full_help=full_help,
        )
        output = capture_buffer.getvalue()
    finally:
        sys.stdout = original_stdout
        sys.argv = original_argv

    return output


# ---------------------------------------------------------------------------
# HelpDocsManager
# ---------------------------------------------------------------------------

class HelpDocsManager:
    """
    Orchestrates bulk help documentation generation from brain.config.json.

    For each variant in brain.config.json → help.variants it:
      1. Calls render_help() with appropriate flags (in-process, no subprocess).
      2. Captures the output via stdout redirection.
      3. Writes the result to the configured deploy directory.

    Args:
        registry    : Active CommandRegistry — provides the live command tree.
        config_path : Path to brain.config.json. Defaults to CWD/brain.config.json.
        project_root: Base for resolving relative paths. Defaults to config dir.
    """

    DEFAULT_CONFIG_NAME = "brain.config.json"

    # Maps config "mode" values to render_help() kwarg combinations
    MODE_MAP: Dict[str, Dict[str, bool]] = {
        "text": {"json_mode": False, "ai_native": False},
        "json": {"json_mode": True,  "ai_native": False},
        "ai":   {"json_mode": True,  "ai_native": True},
    }

    def __init__(
        self,
        registry: CommandRegistry,
        config_path: Optional[Path] = None,
        project_root: Optional[Path] = None,
    ):
        self.registry = registry
        self.config_path = config_path or (Path.cwd() / self.DEFAULT_CONFIG_NAME)
        self.config = _load_config(self.config_path)
        self.project_root = project_root or self.config_path.parent

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def generate_all(self) -> Dict[str, Any]:
        """
        Generates all configured help variants and writes them to disk.

        Returns:
            {
                "status": "success" | "partial" | "error",
                "output_dir": str,
                "variants_total": int,
                "variants_ok": int,
                "variants_failed": int,
                "results": [ { "file", "mode", "status", "error"? }, ... ],
                "timestamp": str,
                "config_used": str
            }
        """
        help_cfg = self.config["help"]
        output_dir = _resolve_output_dir(
            help_cfg.get("output_dir", "appdata://BloomNucleus/bin/help"),
            self.project_root,
        )
        output_dir.mkdir(parents=True, exist_ok=True)

        variants: List[Dict[str, Any]] = help_cfg["variants"]
        results: List[Dict[str, Any]] = []
        ok_count = 0
        fail_count = 0

        for variant in variants:
            result = self._process_variant(variant, output_dir)
            results.append(result)
            if result["status"] == "ok":
                ok_count += 1
            else:
                fail_count += 1

        if fail_count == 0:
            overall = "success"
        elif ok_count == 0:
            overall = "error"
        else:
            overall = "partial"

        return {
            "status": overall,
            "output_dir": str(output_dir.resolve()),
            "variants_total": len(variants),
            "variants_ok": ok_count,
            "variants_failed": fail_count,
            "results": results,
            "timestamp": datetime.now().isoformat(),
            "config_used": str(self.config_path.resolve()),
        }

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _process_variant(
        self,
        variant: Dict[str, Any],
        output_dir: Path,
    ) -> Dict[str, Any]:
        """
        Processes a single help variant entry.

        A variant looks like:
            {
                "file": "help-full.txt",
                "description": "Full help with all commands",
                "mode": "text",
                "full": true
            }

        Modes:
            "text"  →  render_help(json_mode=False, ai_native=False)
            "json"  →  render_help(json_mode=True,  ai_native=False)
            "ai"    →  render_help(json_mode=True,  ai_native=True)
        """
        file_name: str = variant.get("file", "")
        mode: str = variant.get("mode", "text")
        full: bool = variant.get("full", False)
        description: str = variant.get("description", file_name)

        if not file_name:
            return {
                "file": "(unnamed)",
                "status": "error",
                "mode": mode,
                "error": "Variant is missing required 'file' key.",
            }

        if mode not in self.MODE_MAP:
            return {
                "file": file_name,
                "description": description,
                "status": "error",
                "mode": mode,
                "error": f"Unknown mode '{mode}'. Valid: {list(self.MODE_MAP)}",
            }

        output_file = output_dir / file_name

        try:
            render_kwargs = {**self.MODE_MAP[mode], "full_help": full}
            content = _capture_render_help(self.registry, **render_kwargs)

            if not content.strip():
                return {
                    "file": file_name,
                    "description": description,
                    "status": "error",
                    "mode": mode,
                    "error": "render_help() produced empty output.",
                }

            output_file.write_text(content, encoding="utf-8", errors="replace")

            return {
                "file": file_name,
                "description": description,
                "status": "ok",
                "mode": mode,
                "full": full,
                "output_path": str(output_file.resolve()),
                "bytes_written": len(content.encode("utf-8")),
            }

        except Exception as exc:
            return {
                "file": file_name,
                "description": description,
                "status": "error",
                "mode": mode,
                "error": str(exc),
            }