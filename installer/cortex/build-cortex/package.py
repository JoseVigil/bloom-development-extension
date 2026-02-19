"""
Bloom Cortex Packager
=====================
Reads cortex.meta.json from the build root, auto-increments build_number,
and produces bloom-cortex.blx with this internal structure:

    bloom-cortex.blx (ZIP)
    ├── cortex.meta.json        ← metadata for Metamorph / inspect
    └── extension/              ← Chrome Extension, deployed by Sentinel per profile
        ├── manifest.json
        ├── background/
        ├── content/
        └── ...

Usage:
    python package.py --source <extension_dir> --output <output_dir> [--channel stable|beta|dev] [--production]

Requirements: Python 3.9+ stdlib only.
"""

import argparse
import json
import os
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

META_FILENAME        = "cortex.meta.json"
OUTPUT_FILENAME      = "bloom-cortex.blx"
BUILD_NUMBER_FILE    = "build_number.txt"

VALID_CHANNELS       = {"stable", "beta", "dev"}

EXCLUDE_DIRS  = {".git", "node_modules", "__pycache__", ".DS_Store"}
EXCLUDE_EXTS  = set()          # populated with {".map"} when --production

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def fail(msg: str) -> None:
    print(f"\n[Cortex Packager] ERROR: {msg}", file=sys.stderr)
    sys.exit(1)


def read_meta(meta_path: Path) -> dict:
    """Read and validate cortex.meta.json."""
    if not meta_path.exists():
        fail(f"{META_FILENAME} not found at {meta_path}")

    try:
        with meta_path.open("r", encoding="utf-8") as f:
            meta = json.load(f)
    except json.JSONDecodeError as e:
        fail(f"Failed to parse {META_FILENAME}: {e}")

    for required in ("name", "version", "release_channel", "min_chrome_version"):
        if not meta.get(required):
            fail(f"{META_FILENAME} is missing required field: '{required}'")

    return meta


def resolve_build_number(meta_path: Path, meta: dict) -> int:
    """
    Auto-increment build_number.
    Source of truth: build_number field inside cortex.meta.json.
    Increments it and writes the file back before packaging.
    """
    current = meta.get("build_number", 0)
    if not isinstance(current, int) or current < 0:
        fail(f"'build_number' in {META_FILENAME} must be a non-negative integer, got: {current!r}")

    new_build = current + 1
    meta["build_number"] = new_build

    return new_build


def write_meta_back(meta_path: Path, meta: dict) -> None:
    """Persist updated build_number (and build_date) back to cortex.meta.json."""
    with meta_path.open("w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)
        f.write("\n")


def collect_extension_files(source_dir: Path, exclude_exts: set) -> list[tuple[Path, str]]:
    """
    Walk source_dir and return list of (absolute_path, zip_arcname) tuples.
    arcname is prefixed with 'extension/' so it lands in the right folder in the ZIP.
    """
    files = []
    for root, dirs, filenames in os.walk(source_dir):
        # Prune excluded directories in-place so os.walk skips them
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]

        for filename in filenames:
            abs_path = Path(root) / filename

            # Skip excluded extensions
            if abs_path.suffix.lower() in exclude_exts:
                continue

            # Build the archive name: extension/<relative_path>
            rel_path = abs_path.relative_to(source_dir)
            arcname  = f"extension/{rel_path.as_posix()}"

            files.append((abs_path, arcname))

    return files


def format_size(size_bytes: int) -> str:
    if size_bytes >= 1024 * 1024:
        return f"{size_bytes / (1024 * 1024):.1f} MB"
    return f"{size_bytes / 1024:.1f} KB"


# ---------------------------------------------------------------------------
# Core: build the .blx
# ---------------------------------------------------------------------------

def build_blx(
    meta: dict,
    extension_files: list[tuple[Path, str]],
    output_path: Path,
) -> None:
    """
    Write bloom-cortex.blx to output_path.

    ZIP structure:
        cortex.meta.json          (root)
        extension/<all files>     (Chrome Extension content)
    """
    meta_bytes = json.dumps(meta, indent=2, ensure_ascii=False).encode("utf-8")

    with zipfile.ZipFile(output_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        # 1. Write cortex.meta.json at root
        zf.writestr(META_FILENAME, meta_bytes)

        # 2. Write extension files under extension/
        for abs_path, arcname in extension_files:
            zf.write(abs_path, arcname)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Package Bloom Cortex Chrome Extension as a .blx artifact."
    )
    parser.add_argument(
        "--source", required=True,
        help="Path to the Chrome Extension root directory (contains manifest.json)"
    )
    parser.add_argument(
        "--output", required=True,
        help="Directory where bloom-cortex.blx will be written"
    )
    parser.add_argument(
        "--channel", default=None, choices=list(VALID_CHANNELS),
        help="Release channel override (default: value in cortex.meta.json)"
    )
    parser.add_argument(
        "--production", action="store_true",
        help="Exclude .map files from the package"
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    # Resolve paths
    script_dir   = Path(__file__).parent.resolve()
    source_dir   = Path(args.source).resolve()
    output_dir   = Path(args.output).resolve()
    meta_path    = script_dir / META_FILENAME    # cortex.meta.json sits next to package.py
    output_path  = output_dir / OUTPUT_FILENAME

    # Validate source
    if not source_dir.is_dir():
        fail(f"--source directory not found: {source_dir}")

    manifest_check = source_dir / "manifest.json"
    if not manifest_check.exists():
        fail(f"manifest.json not found in --source directory: {source_dir}\n"
             f"       Make sure --source points to the Chrome Extension root.")

    # Ensure output dir exists
    output_dir.mkdir(parents=True, exist_ok=True)

    # Production mode: exclude source maps
    if args.production:
        EXCLUDE_EXTS.add(".map")

    # --- Read metadata ---
    meta = read_meta(meta_path)

    # Override channel if provided via CLI
    if args.channel:
        meta["release_channel"] = args.channel

    # Validate channel
    if meta["release_channel"] not in VALID_CHANNELS:
        fail(f"Invalid release_channel '{meta['release_channel']}'. Must be one of: {', '.join(VALID_CHANNELS)}")

    # --- Resolve and persist build number ---
    build_number = resolve_build_number(meta_path, meta)
    meta["build_date"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    # Write updated meta back to disk BEFORE packaging
    write_meta_back(meta_path, meta)

    # --- Collect extension files ---
    extension_files = collect_extension_files(source_dir, EXCLUDE_EXTS)
    if not extension_files:
        fail(f"No files found in source directory: {source_dir}")

    # --- Build .blx ---
    build_blx(meta, extension_files, output_path)

    # --- Summary ---
    size = output_path.stat().st_size
    print()
    print("[Cortex Packager]")
    print(f"  Name         : {meta['name']}")
    print(f"  Version      : {meta['version']}")
    print(f"  Build number : {build_number}")
    print(f"  Channel      : {meta['release_channel']}")
    print(f"  Build date   : {meta['build_date']}")
    print(f"  Source       : {source_dir}")
    print(f"  Output       : {output_path}")
    print(f"  Size         : {format_size(size)}")
    print()
    print("Done.")


if __name__ == "__main__":
    main()