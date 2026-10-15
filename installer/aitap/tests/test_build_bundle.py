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
