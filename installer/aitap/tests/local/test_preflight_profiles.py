import copy
import io
import json
import struct
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

from aitap.local.catalog import load_catalog
from aitap.local.preflight import PreflightError, common, linux, run_preflight
from aitap.local.preflight.macho import parse_minos, read_minos
from aitap.runtime_paths import resource_root

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "local"
PROFILES = sorted(FIXTURES.glob("*.json"))
SCHEMA = json.loads((resource_root() / "contracts" / "local" / "v1" / "preflight-result.schema.json").read_text())


def _run(fixture, tmp_path, **overrides):
    observed = copy.deepcopy(fixture["observed"])
    observed["readiness"].update(overrides.pop("readiness", {}))
    observed["stable"].update(overrides.pop("stable", {}))
    return run_preflight(collector=lambda base: observed, probe=lambda host: dict(fixture["probe"]),
                         base=tmp_path, **overrides)


@pytest.mark.parametrize("profile", PROFILES, ids=[p.stem for p in PROFILES])
def test_profile_verdicts_match_evidence(profile, tmp_path):
    fixture = json.loads(profile.read_text())
    result = _run(fixture, tmp_path)
    Draft202012Validator(SCHEMA).validate(result)
    for verdict in result["verdicts"]:
        expected = fixture["expected"][verdict["model_id"]]
        assert verdict["verdict"] == expected["verdict"], verdict
        assert verdict["reasons"] == expected["reasons"], verdict
        assert result["readiness"]["models"][verdict["model_id"]]["installed"] == expected["installed"]


def _synthetic_catalog(known_insufficient_ram_mb):
    """Catalogo de prueba con un segundo modelo generico que declara RAM insuficiente conocida."""
    document = json.loads((resource_root() / "local" / "catalog" / "local-intelligence-catalog-v1.json").read_text())
    extra = copy.deepcopy(document["models"][0])
    extra.update(model_id="modelo-sintetico", display_name="Modelo sintetico de prueba", mandatory=False)
    extra["source"]["ollama_ref"] = "sintetico:1b"
    extra["backend"].update(backend_id="local.ollama.modelo-sintetico", model="sintetico:1b")
    for platform in extra["platforms"]:
        platform["known_insufficient_ram_mb"] = known_insufficient_ram_mb
    document["models"].append(extra)
    return load_catalog(document=document)


def test_real_mac_profile_keeps_functiongemma(tmp_path):
    fixture = json.loads((FIXTURES / "darwin-x86_64-4gib-13.7.8.json").read_text())
    verdicts = {v["model_id"]: v for v in _run(fixture, tmp_path)["verdicts"]}
    assert set(verdicts) == {"functiongemma-270m"}
    assert verdicts["functiongemma-270m"]["verdict"] == "APTO_CON_SALVEDADES"


def test_known_insufficient_ram_blocks(tmp_path):
    fixture = json.loads((FIXTURES / "darwin-x86_64-4gib-13.7.8.json").read_text())
    result = _run(fixture, tmp_path, catalog=_synthetic_catalog(4096),
                  selection=["functiongemma-270m", "modelo-sintetico"])
    verdicts = {v["model_id"]: v for v in result["verdicts"]}
    assert verdicts["modelo-sintetico"]["verdict"] == "BLOQUEADO"
    assert "RAM_TOTAL_INSUFFICIENT" in verdicts["modelo-sintetico"]["reasons"]
    assert verdicts["functiongemma-270m"]["verdict"] == "APTO_CON_SALVEDADES"


def test_volatile_readiness_never_changes_verdict_or_fingerprint(tmp_path):
    fixture = json.loads((FIXTURES / "darwin-x86_64-4gib-13.7.8.json").read_text())
    calm = _run(fixture, tmp_path, readiness={"free_memory_pct": 58, "swap_used_mb": 0})
    busy = _run(fixture, tmp_path, readiness={"free_memory_pct": 9, "swap_used_mb": 900, "memory_pressure": "critical"})
    assert calm["eligibility_fingerprint"] == busy["eligibility_fingerprint"]
    assert calm["verdicts"] == busy["verdicts"]
    assert {"FREE_MEMORY_LOW", "MEMORY_PRESSURE_HIGH"} <= set(busy["readiness"]["advisories"])
    assert calm["readiness"]["state"] == "OK"


def test_stable_profile_change_changes_fingerprint(tmp_path):
    fixture = json.loads((FIXTURES / "darwin-x86_64-4gib-13.7.8.json").read_text())
    base = _run(fixture, tmp_path)
    upgraded = _run(fixture, tmp_path, stable={"ram_total_mb": 16384})
    assert base["eligibility_fingerprint"] != upgraded["eligibility_fingerprint"]
    catalog = _synthetic_catalog(4096)
    upgraded = _run(fixture, tmp_path, stable={"ram_total_mb": 16384}, catalog=catalog,
                    selection=["modelo-sintetico"])
    assert "RAM_TOTAL_INSUFFICIENT" not in upgraded["verdicts"][0]["reasons"]


def test_os_below_observed_minimum_blocks(tmp_path):
    fixture = json.loads((FIXTURES / "darwin-x86_64-4gib-13.7.8.json").read_text())
    result = _run(fixture, tmp_path, stable={"os_version": "13.2"})
    fg = next(v for v in result["verdicts"] if v["model_id"] == "functiongemma-270m")
    assert fg["verdict"] == "BLOQUEADO" and "OS_BELOW_OBSERVED_MINIMUM" in fg["reasons"]


def test_missing_service_blocks_ollama_models(tmp_path):
    fixture = json.loads((FIXTURES / "darwin-x86_64-4gib-13.7.8.json").read_text())
    stable = copy.deepcopy(fixture["observed"]["stable"])
    stable["ollama"]["service_defined"] = False
    result = _run(fixture, tmp_path, stable={"ollama": stable["ollama"]})
    fg = next(v for v in result["verdicts"] if v["model_id"] == "functiongemma-270m")
    assert "RUNTIME_SERVICE_ABSENT" in fg["reasons"] and fg["verdict"] == "BLOQUEADO"


def test_unknown_architecture_and_model_selection(tmp_path):
    fixture = json.loads((FIXTURES / "linux-x86_64-companion-missing.json").read_text())
    result = _run(fixture, tmp_path, stable={"arch": "arm64"})
    assert all("ARCH_UNSUPPORTED" in v["reasons"] for v in result["verdicts"])
    with pytest.raises(PreflightError) as exc:
        _run(fixture, tmp_path, selection=["no-existe"])
    assert exc.value.code == "UNKNOWN_MODEL"


def test_disk_advisory_only_for_models_not_installed(tmp_path, monkeypatch):
    fixture = json.loads((FIXTURES / "darwin-arm64-16gib-14.json").read_text())
    monkeypatch.setattr(common, "disk_free_mb", lambda path: 100)
    result = _run(fixture, tmp_path)
    assert "DISK_INSUFFICIENT" in result["readiness"]["advisories"]


def test_linux_collector_is_read_only(tmp_path):
    before = sorted(tmp_path.rglob("*"))
    observed = linux.collect(tmp_path, home=tmp_path)
    assert sorted(tmp_path.rglob("*")) == before
    assert observed["stable"]["os"] == "linux"
    assert observed["stable"]["ollama"]["service_defined"] is False


def test_ollama_probe_never_contacts_non_loopback():
    calls = []
    result = common.probe_ollama("10.0.0.5:11434", opener=lambda *a, **k: calls.append(a))
    assert result["skipped"] == "NON_LOOPBACK_HOST" and not calls


def test_ollama_probe_reads_version_and_tags():
    class Response(io.BytesIO):
        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

    replies = {"/api/version": {"version": "0.23.2"}, "/api/tags": {"models": [{"name": "functiongemma:270m"}]}}
    seen = []

    def opener(url, timeout):
        seen.append(url)
        return Response(json.dumps(replies[url.split("11434", 1)[1]]).encode())

    result = common.probe_ollama("http://127.0.0.1", opener=opener)
    assert result == {"host": "127.0.0.1:11434", "reachable": True, "version": "0.23.2",
                      "installed_refs": ["functiongemma:270m"]}
    assert seen == ["http://127.0.0.1:11434/api/version", "http://127.0.0.1:11434/api/tags"]


def _thin(cputype, command, minos):
    if command == 0x32:
        load = struct.pack("<IIIIII", 0x32, 24, 1, minos, minos, 0)
    else:
        load = struct.pack("<IIII", 0x24, 16, minos, minos)
    header = struct.pack("<IiiIIIII", 0xFEEDFACF, cputype, 0, 2, 1, len(load), 0, 0)
    return header + load


def test_macho_thin_and_fat_minos(tmp_path):
    arm = _thin(0x0100000C, 0x32, (14 << 16))
    intel = _thin(0x01000007, 0x24, (13 << 16) | (5 << 8))
    assert parse_minos(arm) == {"arm64": "14.0"}
    assert parse_minos(intel) == {"x86_64": "13.5"}
    offset_a, offset_b = 4096, 8192
    fat = bytearray(struct.pack(">II", 0xCAFEBABE, 2))
    fat += struct.pack(">iiIII", 0x01000007, 3, offset_a, len(intel), 12)
    fat += struct.pack(">iiIII", 0x0100000C, 0, offset_b, len(arm), 14)
    fat += b"\x00" * (offset_a - len(fat)) + intel
    fat += b"\x00" * (offset_b - len(fat)) + arm
    binary = tmp_path / "ollama"
    binary.write_bytes(bytes(fat))
    assert read_minos(binary) == {"x86_64": "13.5", "arm64": "14.0"}
    assert read_minos(tmp_path / "missing") == {}
    assert parse_minos(b"not a macho") == {}


def test_catalog_is_the_only_source_of_model_names():
    catalog = load_catalog()
    source = (Path(common.__file__).parent).rglob("*.py")
    text = "".join(p.read_text() for p in source)
    for model in catalog.models:
        assert model["model_id"] not in text
