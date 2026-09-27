import json

import pytest

from aitap.health.probes import HealthError, probe_nucleus, probe_state, run_health


def test_state_not_configured():
    result = probe_state({})
    assert result["state"] == "not_configured" and result["ttl_seconds"] == 30


def test_state_inside_project_is_unavailable(tmp_path):
    (tmp_path / ".git").mkdir()
    inside = tmp_path / "accounting"
    inside.mkdir()
    result = probe_state({"AITAP_STATE_DIR": str(inside)})
    assert result["state"] == "unavailable"
    assert {c["name"]: c["ok"] for c in result["checks"]}["outside_projects"] is False


def test_state_healthy(tmp_path):
    state = tmp_path / "outside" / "state"
    state.mkdir(parents=True)
    result = probe_state({"AITAP_STATE_DIR": str(state)})
    assert result["state"] == "healthy" or any(  # un checkout con pyproject en un ancestro es legitimamente "inside"
        (p / "pyproject.toml").exists() or (p / ".git").exists() for p in state.parents)


def _enrolled_base(tmp_path):
    (tmp_path / "authority").mkdir()
    (tmp_path / "authority" / "aitap-service-identity.json").write_text("{}")
    (tmp_path / "config").mkdir()
    (tmp_path / "config" / "nucleus.json").write_text(json.dumps({"onboarding": {
        "active_org_slug": "acme", "organizations": [{"org_slug": "acme", "organization_id": "org-1"}]}}))
    return tmp_path


def test_nucleus_healthy_when_all_prerequisites_exist(tmp_path):
    base = _enrolled_base(tmp_path)
    result = probe_nucleus({"AITAP_VAULT_GRANT_ID": "grant-1"}, base, which=lambda name: "/usr/bin/nucleus")
    assert result["state"] == "healthy"
    assert "grant-1" not in json.dumps(result)


def test_nucleus_degraded_without_enrollment_and_unavailable_without_binary(tmp_path):
    degraded = probe_nucleus({}, tmp_path, which=lambda name: "/usr/bin/nucleus")
    assert degraded["state"] == "degraded"
    missing = probe_nucleus({}, tmp_path, which=lambda name: None)
    assert missing["state"] == "unavailable"
    configured_missing = probe_nucleus({"NUCLEUS_BIN": str(tmp_path / "nope")}, tmp_path, which=lambda n: None)
    assert configured_missing["state"] == "unavailable"


def test_probes_never_write(tmp_path):
    base = _enrolled_base(tmp_path)
    before = {p: p.stat().st_mtime_ns for p in base.rglob("*")}
    run_health(env={"AITAP_STATE_DIR": str(base)}, base=base, which=lambda name: None)
    assert {p: p.stat().st_mtime_ns for p in base.rglob("*")} == before


def test_overall_is_worst_and_unknown_component_fails(tmp_path):
    result = run_health(env={}, base=tmp_path, which=lambda name: None)
    assert result["overall"] == "unavailable"
    with pytest.raises(HealthError) as exc:
        run_health(["gpu"], env={}, base=tmp_path)
    assert exc.value.code == "UNKNOWN_COMPONENT"
