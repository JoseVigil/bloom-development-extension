#!/usr/bin/env python3
"""Generate and verify the portable AITAP bundle manifest."""

from __future__ import annotations

import hashlib
import json
import os
import platform
import shutil
import subprocess
import tempfile
from pathlib import Path


MANIFEST_NAME = "bundle-manifest.json"
REQUIRED_PATHS = (
    "_internal/contracts",
    "_internal/policies",
    "_internal/registry",
    "_internal/local/catalog",
    "help/aitap_help.json",
    "help/aitap_help.txt",
    "_internal/aitap.config.json",
    "_internal/VERSION",
)
SMOKE_COMMANDS = (
    ("system.version", ("--json", "system", "version")),
    ("system.info", ("--json", "system", "info")),
    ("json_help", ("--json-help",)),
    ("route.policy", ("--json", "route", "policy")),
    ("local.preflight", ("--json", "local", "preflight")),
)
FORBIDDEN_PARTS = {"pytest", "_pytest"}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_required_resources(root: Path) -> None:
    missing = [relative for relative in REQUIRED_PATHS if not (root / relative).exists()]
    if missing:
        raise RuntimeError("missing packaged resources: " + ", ".join(missing))


def assert_no_test_tools(root: Path) -> None:
    forbidden = []
    for path in root.rglob("*"):
        lowered = {part.casefold() for part in path.relative_to(root).parts}
        if lowered & FORBIDDEN_PARTS:
            forbidden.append(path.relative_to(root).as_posix())
    if forbidden:
        raise RuntimeError("test tooling present in production bundle: " + ", ".join(forbidden))


def run_smokes(root: Path) -> dict[str, dict]:
    executable = root / ("aitap.exe" if os.name == "nt" else "aitap")
    if not executable.is_file():
        raise RuntimeError(f"missing bundle executable: {executable}")
    environment = dict(os.environ)
    for key in ("PYTHONPATH", "PYTHONHOME", "BLOOM_PROJECT_ROOT",
                "AITAP_REAL_PROVIDER_OPT_IN", "AITAP_REAL_OLLAMA"):
        environment.pop(key, None)
    environment["PYTHONNOUSERSITE"] = "1"
    environment["PYTHONSAFEPATH"] = "1"
    environment["PATH"] = str(root) + os.pathsep + os.defpath

    results: dict[str, dict] = {}
    cwd = tempfile.mkdtemp(prefix="aitap-bundle-smoke-")
    try:
        for name, arguments in SMOKE_COMMANDS:
            completed = subprocess.run(
                [str(executable), *arguments], cwd=cwd, env=environment,
                capture_output=True, text=True, encoding="utf-8", errors="replace",
            )
            if completed.returncode != 0:
                raise RuntimeError(
                    f"smoke {name} failed ({completed.returncode}): {completed.stderr.strip()}"
                )
            try:
                payload = json.loads(completed.stdout)
            except json.JSONDecodeError as exc:
                raise RuntimeError(f"smoke {name} did not emit JSON-only stdout: {exc}") from exc
            if not isinstance(payload, dict):
                raise RuntimeError(f"smoke {name} did not emit a JSON object")
            results[name] = payload
    finally:
        shutil.rmtree(cwd, ignore_errors=True)
    return results


def _inventory(root: Path) -> list[dict]:
    entries = []
    for path in sorted(root.rglob("*"), key=lambda item: item.relative_to(root).as_posix()):
        if not path.is_file() or path.name == MANIFEST_NAME:
            continue
        entries.append({
            "path": path.relative_to(root).as_posix(),
            "size": path.stat().st_size,
            "sha256": sha256_file(path),
        })
    return entries


def write_manifest(root: Path, *, version: str, build_number: int,
                   smokes: dict[str, dict]) -> Path:
    validate_required_resources(root)
    assert_no_test_tools(root)
    files = _inventory(root)
    canonical = json.dumps(files, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    system_info = smokes["system.info"]
    manifest = {
        "schema_version": "bloom.aitap-bundle/v1",
        "product": "AITAP",
        "version": version,
        "build_number": build_number,
        "platform": platform.system().lower(),
        "architecture": platform.machine().lower(),
        "embedded_python_version": system_info["python_version"],
        "packaging_mode": "pyinstaller-onedir",
        "inventory_sha256": hashlib.sha256(canonical.encode("utf-8")).hexdigest(),
        "required_paths": list(REQUIRED_PATHS),
        "smokes": {name: "passed" for name in smokes},
        "files": files,
    }
    destination = root / MANIFEST_NAME
    destination.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return destination


def verify_manifest(root: Path) -> dict:
    manifest_path = root / MANIFEST_NAME
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("schema_version") != "bloom.aitap-bundle/v1":
        raise RuntimeError("unsupported AITAP bundle manifest")
    expected = manifest.get("files")
    actual = _inventory(root)
    if expected != actual:
        raise RuntimeError("bundle inventory or SHA-256 verification failed")
    canonical = json.dumps(actual, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    if manifest.get("inventory_sha256") != hashlib.sha256(canonical.encode("utf-8")).hexdigest():
        raise RuntimeError("bundle inventory digest verification failed")
    validate_required_resources(root)
    assert_no_test_tools(root)
    return manifest


def main() -> int:
    import argparse

    parser = argparse.ArgumentParser(description="Verify an autonomous AITAP bundle")
    parser.add_argument("bundle", type=Path, help="Path to the AITAP onedir bundle")
    args = parser.parse_args()
    manifest = verify_manifest(args.bundle.resolve())
    print(json.dumps({
        "status": "valid",
        "version": manifest["version"],
        "build_number": manifest["build_number"],
        "files": len(manifest["files"]),
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

