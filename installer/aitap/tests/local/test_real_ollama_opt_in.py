"""Prueba real contra el Ollama de macOS. Opt-in: ``AITAP_REAL_OLLAMA=1``, solo Darwin.

Nunca descarga modelos: si el modelo no esta instalado, la prueba se salta.

- ``test_real_preflight_digest_matches_catalog``: el ``digest`` de ``/api/tags``
  coincide con el ``manifest_digest`` fijado en el catalogo.
- ``test_real_ollama_local_supply_transport``: una inferencia por la ruta local
  completa (acceso, elegibilidad, digest antes del POST, journal y contabilidad)
  con politica, registry y permiso de prueba en tmp. Usa el modelo obligatorio
  del catalogo SOLO como prueba de transporte: no es una prueba de aptitud para
  ``gen`` ni selecciona modelo.
- ``test_real_route_supply_with_signed_files``: si se indican
  ``AITAP_REAL_POLICY``, ``AITAP_REAL_REGISTRY`` y ``AITAP_REAL_REQUEST``
  (Fase 2), corre ``aitap --json route supply`` tal como lo invoca MANDATE.
"""
import hashlib
import json
import os
import platform
import subprocess
import sys
from pathlib import Path

import pytest

pytestmark = pytest.mark.skipif(
    os.environ.get("AITAP_REAL_OLLAMA") != "1" or platform.system() != "Darwin",
    reason="opt-in: AITAP_REAL_OLLAMA=1 en macOS")

TESTS = Path(__file__).resolve().parents[1]
SRC = TESTS.parent / "src"


def _catalog_model():
    from aitap.local.catalog import load_catalog
    catalog = load_catalog()
    return catalog, catalog.model(catalog.mandatory_ids[0])


def _observed_digest(model):
    from aitap.local.preflight import run_preflight
    result = run_preflight(selection=[model["model_id"]])
    state = result["readiness"]["models"][model["model_id"]]
    if state["installed"] is not True:
        pytest.skip(f"{model['source']['ollama_ref']} no esta instalado; esta prueba nunca descarga")
    return result, state


def test_real_preflight_digest_matches_catalog():
    _, model = _catalog_model()
    result, state = _observed_digest(model)
    assert state["available"] is True and state["model"] == model["source"]["ollama_ref"]
    assert "sha256:" + state["manifest_sha256"] == model["source"]["manifest_digest"]
    assert result["readiness"]["ttl_seconds"] <= 60


def test_real_ollama_local_supply_transport(tmp_path):
    sys.path.insert(0, str(TESTS))
    import test_local_supply_mandate_gen as local
    from aitap.accounting.store import AccountingStore
    from aitap.intelligence.service import IntelligenceService, LocalSupplyContext
    from aitap.routing.engine import RoutingEngine

    _, model = _catalog_model()
    _, state = _observed_digest(model)
    backend = model["backend"]["backend_id"]
    policy = local.local_policy(backend_id=backend, max_output_tokens=128, timeout_seconds=300)
    policy["intelligence_supply"]["local"]["options"]["num_ctx"] = 4096
    registry = local.local_registry(backend_id=backend, model=model["source"]["ollama_ref"],
                                    model_digest=state["manifest_sha256"],
                                    accounting_ref="accounting://backend/" + backend)
    policy_path, registry_path = local.write_files(tmp_path, policy=policy, registry=registry)
    access, raw = local.granted_access()
    supply = IntelligenceService(RoutingEngine.from_files(policy_path, registry_path),
                                 AccountingStore(tmp_path / "state"), local.Vault(), local.CloudProvider(),
                                 local=LocalSupplyContext(access_policy=access))
    request = local.gen_request()
    result = supply.supply(request)
    assert set(result) == local.TOP_LEVEL and result["provider"] == "ollama"
    assert result["routing_decision"]["resource_fingerprints"] == {
        "supply_policy_sha256": hashlib.sha256(policy_path.read_bytes()).hexdigest(),
        "registry_sha256": hashlib.sha256(registry_path.read_bytes()).hexdigest(),
        "access_policy_sha256": hashlib.sha256(raw).hexdigest(),
        "model_manifest_sha256": state["manifest_sha256"]}
    attempt = supply.store.read(request["logical_inference_id"])["attempts"][0]
    assert (attempt["cost_usd"], attempt["cost_status"]) == (0, "local_zero")
    assert supply.supply(request) == result          # replay sin segunda llamada
    print(json.dumps({"usage": result["usage"], "latency_ms": result["latency_ms"],
                      "routing_decision_id": result["routing_decision_id"]}))


def test_real_route_supply_with_signed_files(tmp_path):
    paths = [os.environ.get(k) for k in ("AITAP_REAL_POLICY", "AITAP_REAL_REGISTRY", "AITAP_REAL_REQUEST")]
    if not all(paths):
        pytest.skip("Fase 2: requiere AITAP_REAL_POLICY, AITAP_REAL_REGISTRY y AITAP_REAL_REQUEST")
    environment = {**os.environ, "PYTHONPATH": str(SRC), "PYTHONIOENCODING": "utf-8"}
    command = [sys.executable, "-B", "-m", "aitap", "--json", "route", "supply", "--request", paths[2],
               "--state-dir", str(tmp_path / "state"), "--policy", paths[0], "--registry", paths[1]]
    completed = subprocess.run(command, capture_output=True, text=True, timeout=600, env=environment)
    assert completed.returncode == 0, completed.stdout
    result = json.loads(completed.stdout)
    assert result["outcome"] == "completed" and result["provider"] == "ollama"
    assert result["routing_decision"]["effective_intelligence"]["credential_ref"] is None
