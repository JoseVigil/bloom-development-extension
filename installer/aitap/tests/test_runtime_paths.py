from pathlib import Path

from aitap import runtime_paths


def test_resource_root_from_sources():
    assert (runtime_paths.resource_root() / "pyproject.toml").is_file()


def test_resource_root_from_pyinstaller(monkeypatch, tmp_path: Path):
    monkeypatch.setattr(runtime_paths.sys, "_MEIPASS", str(tmp_path), raising=False)
    assert runtime_paths.resource_root() == tmp_path.resolve()
