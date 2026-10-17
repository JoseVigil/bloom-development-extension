import importlib.util
import sys
from pathlib import Path

import pytest


AITAP_ROOT = Path(__file__).resolve().parents[1]


def load_script(name: str):
    path = AITAP_ROOT / "scripts" / f"{name}.py"
    scripts = str(path.parent)
    if scripts not in sys.path:
        sys.path.insert(0, scripts)
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_build_preflight_fails_when_product_dependency_is_missing():
    build = load_script("build")
    with pytest.raises(RuntimeError, match="dependencias productivas ausentes"):
        build.validate_dependencies(("aitap_dependency_that_does_not_exist",))


def test_build_preflight_fails_when_resource_is_missing(tmp_path):
    build = load_script("build")
    with pytest.raises(RuntimeError, match="recursos productivos ausentes"):
        build.validate_source_resources(tmp_path)


def test_manifest_detects_modified_bundle(tmp_path):
    verifier = load_script("verify_bundle")
    for relative in verifier.REQUIRED_PATHS:
        path = tmp_path / relative
        if Path(relative).suffix:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("resource", encoding="utf-8")
        else:
            path.mkdir(parents=True, exist_ok=True)
    executable = tmp_path / ("aitap.exe" if verifier.os.name == "nt" else "aitap")
    executable.write_bytes(b"binary")
    smokes = {name: ({"python_version": "3.12.0"} if name == "system.info" else {})
              for name, _ in verifier.SMOKE_COMMANDS}
    verifier.write_manifest(tmp_path, version="0.1.0", build_number=1, smokes=smokes)
    verifier.verify_manifest(tmp_path)
    executable.write_bytes(b"tampered")
    with pytest.raises(RuntimeError, match="SHA-256"):
        verifier.verify_manifest(tmp_path)


def test_manifest_rejects_pytest_in_bundle(tmp_path):
    verifier = load_script("verify_bundle")
    (tmp_path / "_internal" / "pytest").mkdir(parents=True)
    with pytest.raises(RuntimeError, match="test tooling"):
        verifier.assert_no_test_tools(tmp_path)


def _bundle_with_framework_symlinks(root: Path, verifier) -> None:
    """Bundle minimo con la forma que PyInstaller da a Python.framework en macOS."""
    for relative in verifier.REQUIRED_PATHS:
        path = root / relative
        if Path(relative).suffix:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("resource", encoding="utf-8")
        else:
            path.mkdir(parents=True, exist_ok=True)
    (root / ("aitap.exe" if verifier.os.name == "nt" else "aitap")).write_bytes(b"binary")
    framework = root / "_internal" / "Python.framework"
    (framework / "Versions" / "3.14" / "Resources").mkdir(parents=True)
    (framework / "Versions" / "3.14" / "Python").write_bytes(b"libpython")
    (framework / "Versions" / "3.14" / "Resources" / "Info.plist").write_text("plist", encoding="utf-8")
    try:
        (framework / "Versions" / "Current").symlink_to("3.14", target_is_directory=True)
        (framework / "Resources").symlink_to("Versions/Current/Resources", target_is_directory=True)
        (framework / "Python").symlink_to("Versions/Current/Python")
    except (OSError, NotImplementedError):
        pytest.skip("el sistema no permite crear enlaces simbolicos")
    smokes = {name: ({"python_version": "3.14.7"} if name == "system.info" else {})
              for name, _ in verifier.SMOKE_COMMANDS}
    verifier.write_manifest(root, version="0.1.0", build_number=1, smokes=smokes)


def test_copied_bundle_keeps_symlinks_and_verifies(tmp_path):
    verifier = load_script("verify_bundle")
    build = load_script("build")
    built = tmp_path / "dist" / "aitap"
    _bundle_with_framework_symlinks(built, verifier)
    verifier.verify_manifest(built)
    output = tmp_path / "native" / "aitap"
    build.copy_bundle(built, output)
    assert (output / "_internal" / "Python.framework" / "Versions" / "Current").is_symlink()
    verifier.verify_manifest(output)


def test_dereferencing_copy_breaks_the_manifest(tmp_path):
    """Documenta la causa del fallo: copiar resolviendo enlaces agrega archivos no inventariados."""
    verifier = load_script("verify_bundle")
    built = tmp_path / "dist" / "aitap"
    _bundle_with_framework_symlinks(built, verifier)
    output = tmp_path / "native" / "aitap"
    verifier.shutil.copytree(built, output)
    with pytest.raises(RuntimeError, match="SHA-256"):
        verifier.verify_manifest(output)
