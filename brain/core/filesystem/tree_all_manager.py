"""
TreeAllManager - Bulk Tree Generation from Configuration File.

Reads brain.config.json, resolves output paths (including appdata:// protocol),
and runs TreeManager for each configured target. Zero subprocesses — all logic
is executed in-process via direct TreeManager API calls.

Used by: brain filesystem tree --generate-all
Replaces: scripts/python/generate_tree_files.py (external subprocess-based script)
"""

import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


# ---------------------------------------------------------------------------
# AppData Path Resolution
# ---------------------------------------------------------------------------

def _resolve_appdata_base() -> Path:
    """
    Returns the platform-appropriate BloomNucleus base directory.

    Windows : %LOCALAPPDATA%\\BloomNucleus
    macOS   : ~/Library/Application Support/BloomNucleus
    Linux   : ~/.local/share/BloomNucleus
    """
    if sys.platform == "win32":
        local_app_data = os.environ.get("LOCALAPPDATA", "")
        if local_app_data:
            return Path(local_app_data)
        return Path.home() / "AppData" / "Local"

    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support"

    return Path.home() / ".local" / "share"


def _resolve_appdata_uri(uri: str) -> Path:
    """
    Resolves 'appdata://BloomNucleus/tree' → absolute Path.

    Protocol:
        appdata://<AppName>[/sub/path]
        e.g. appdata://BloomNucleus/tree  →  %LOCALAPPDATA%\\BloomNucleus\\tree
    """
    if not uri.startswith("appdata://"):
        raise ValueError(f"Expected 'appdata://' URI, got: {uri!r}")

    remainder = uri[len("appdata://"):]         # "BloomNucleus/tree"
    parts = remainder.replace("\\", "/").split("/")
    app_name = parts[0]                          # "BloomNucleus"
    sub_parts = parts[1:] if len(parts) > 1 else []

    base = _resolve_appdata_base() / app_name
    if sub_parts:
        base = base.joinpath(*sub_parts)
    return base


def _resolve_path(raw: str, project_root: Path) -> Path:
    """
    Resolves a raw path string from the config.

    Supports:
        appdata://BloomNucleus/...  →  absolute OS-specific AppData path
        relative/path               →  project_root / relative/path
        /absolute/path              →  Path as-is
    """
    if raw.startswith("appdata://"):
        return _resolve_appdata_uri(raw)
    p = Path(raw)
    if p.is_absolute():
        return p
    return project_root / p


# ---------------------------------------------------------------------------
# Config Loader
# ---------------------------------------------------------------------------

def _load_config(config_path: Path) -> Dict[str, Any]:
    """Loads and validates brain.config.json."""
    if not config_path.exists():
        raise FileNotFoundError(
            f"Config file not found: {config_path}\n"
            f"Expected at: {config_path.resolve()}\n"
            f"Tip: create brain.config.json at your project root."
        )

    with open(config_path, encoding="utf-8") as f:
        data = json.load(f)

    if "tree" not in data:
        raise ValueError("Config file is missing required 'tree' section.")

    tree_section = data["tree"]
    if "targets" not in tree_section or not isinstance(tree_section["targets"], list):
        raise ValueError("Config 'tree.targets' must be a non-empty list.")

    return data


# ---------------------------------------------------------------------------
# TreeAllManager
# ---------------------------------------------------------------------------

class TreeAllManager:
    """
    Orchestrates bulk directory tree generation from a config file.

    For each target in brain.config.json → tree.targets, it:
      1. Resolves output directory (appdata:// or relative).
      2. Resolves each path in 'paths' (appdata://, relative, or absolute).
      3. Delegates to TreeManager for actual tree generation.
      4. Collects per-target results and returns a unified summary.

    Args:
        config_path: Path to brain.config.json. Defaults to CWD/brain.config.json.
        project_root: Base directory for resolving relative paths in config.
                      Defaults to the directory that contains brain.config.json.
    """

    DEFAULT_CONFIG_NAME = "brain.config.json"

    def __init__(
        self,
        config_path: Optional[Path] = None,
        project_root: Optional[Path] = None,
    ):
        self.config_path = config_path or (Path.cwd() / self.DEFAULT_CONFIG_NAME)
        self.config = _load_config(self.config_path)

        self.project_root = project_root or self.config_path.parent

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def generate_all(self) -> Dict[str, Any]:
        """
        Runs tree generation for every configured target.

        Returns:
            {
                "status": "success" | "partial" | "error",
                "output_dir": str,
                "targets_total": int,
                "targets_ok": int,
                "targets_failed": int,
                "results": [ { "file", "status", "paths", "error"? }, ... ],
                "timestamp": str,
                "config_used": str
            }
        """
        tree_cfg = self.config["tree"]
        output_dir = _resolve_path(
            tree_cfg.get("output_dir", "appdata://BloomNucleus/tree"),
            self.project_root,
        )
        output_dir.mkdir(parents=True, exist_ok=True)

        targets: List[Dict[str, Any]] = tree_cfg["targets"]
        results: List[Dict[str, Any]] = []
        ok_count = 0
        fail_count = 0

        for target in targets:
            result = self._process_target(target, output_dir)
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
            "targets_total": len(targets),
            "targets_ok": ok_count,
            "targets_failed": fail_count,
            "results": results,
            "timestamp": datetime.now().isoformat(),
            "config_used": str(self.config_path.resolve()),
        }

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _process_target(
        self,
        target: Dict[str, Any],
        output_dir: Path,
    ) -> Dict[str, Any]:
        """
        Processes a single target entry from the config.

        A target looks like:
            {
                "file": "brain_tree.txt",
                "description": "Brain CLI source",
                "paths": ["brain"]
            }
        """
        file_name: str = target.get("file", "")
        raw_paths: List[str] = target.get("paths", [])
        description: str = target.get("description", file_name)

        if not file_name:
            return {
                "file": "(unnamed)",
                "status": "error",
                "paths": raw_paths,
                "error": "Target is missing required 'file' key.",
            }

        output_file = output_dir / file_name

        try:
            resolved = self._resolve_target_paths(raw_paths)
            base_dir, relative_targets = resolved

            # Lazy import — keeps Core layer independent of load order
            from brain.core.filesystem.tree_manager import TreeManager

            manager = TreeManager(base_dir)
            manager.generate(
                targets=relative_targets,
                output_file=output_file,
                use_hash=False,
                use_json=False,
            )

            return {
                "file": file_name,
                "description": description,
                "status": "ok",
                "output_path": str(output_file.resolve()),
                "paths": raw_paths,
                "base_dir": str(base_dir.resolve()),
            }

        except Exception as exc:
            return {
                "file": file_name,
                "description": description,
                "status": "error",
                "paths": raw_paths,
                "error": str(exc),
            }

    def _resolve_target_paths(
        self,
        raw_paths: List[str],
    ) -> Tuple[Path, Optional[List[str]]]:
        """
        Resolves a list of raw paths from a target into (base_dir, targets).

        Rules (mirrors tree.py logic):
            - Single absolute path → base_dir = that path, targets = None
            - Multiple paths → base_dir = project_root, targets = relative strings
            - appdata:// paths → resolved to absolute, then treated as absolute

        Returns:
            (base_dir, targets_list_or_None)
        """
        if not raw_paths:
            return self.project_root, None

        absolute_paths = [_resolve_path(p, self.project_root) for p in raw_paths]

        # Single absolute directory — use it as base, scan everything inside
        if len(absolute_paths) == 1 and absolute_paths[0].is_dir():
            return absolute_paths[0], None

        # Multiple paths: use project_root as base, pass relative strings to TreeManager
        relative_targets: List[str] = []
        for abs_path in absolute_paths:
            try:
                rel = abs_path.relative_to(self.project_root)
                relative_targets.append(str(rel))
            except ValueError:
                # Path is outside project_root (e.g. appdata path mixed with others)
                # Pass as absolute string — TreeManager handles it
                relative_targets.append(str(abs_path))

        return self.project_root, relative_targets