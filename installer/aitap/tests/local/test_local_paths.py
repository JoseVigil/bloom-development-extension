import os

import pytest

from aitap.local.paths import PathGuardError, allowed_root, resolve_under


def test_valid_root_and_nested_paths(tmp_path):
    root = allowed_root(tmp_path)
    assert resolve_under(root, "local", "ensure", "m.json") == root / "local" / "ensure" / "m.json"


def test_relative_missing_or_system_root_is_rejected(tmp_path):
    with pytest.raises(PathGuardError):
        allowed_root("relative/dir")
    with pytest.raises(PathGuardError):
        allowed_root(tmp_path / "missing")
    with pytest.raises(PathGuardError):
        allowed_root(os.path.abspath(os.sep))


@pytest.mark.parametrize("marker", [".git", ".bloom"])
def test_project_workspaces_are_rejected(tmp_path, marker):
    project = tmp_path / "project"
    (project / marker).mkdir(parents=True)
    (project / "state").mkdir()
    with pytest.raises(PathGuardError):
        allowed_root(project)
    with pytest.raises(PathGuardError):
        allowed_root(project / "state")


@pytest.mark.parametrize("parts", [("..", "x"), ("/etc",), ("a/b",), ("",), (".",), ("a\\b",)])
def test_escaping_components_are_rejected(tmp_path, parts):
    with pytest.raises(PathGuardError):
        resolve_under(allowed_root(tmp_path), *parts)


def test_symlink_escaping_root_is_rejected(tmp_path):
    root = tmp_path / "state"
    outside = tmp_path / "outside"
    root.mkdir()
    outside.mkdir()
    (root / "local").symlink_to(outside, target_is_directory=True)
    with pytest.raises(PathGuardError) as caught:
        resolve_under(allowed_root(root), "local", "ensure.json")
    assert caught.value.code == "PATH_OUTSIDE_ROOT"


def test_symlinked_root_resolves_to_real_directory(tmp_path):
    real = tmp_path / "real"
    real.mkdir()
    link = tmp_path / "link"
    link.symlink_to(real, target_is_directory=True)
    assert allowed_root(link) == real.resolve()
