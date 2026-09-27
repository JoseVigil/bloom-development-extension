import copy
import json

import pytest

from aitap.local.catalog import CATALOG_RELATIVE, CatalogError, load_catalog
from aitap.runtime_paths import resource_root


def _document():
    return json.loads((resource_root() / CATALOG_RELATIVE).read_text())


def test_catalog_declares_the_mandatory_model_with_pins():
    catalog = load_catalog()
    assert catalog.mandatory_ids == ["functiongemma-270m"]
    gemma = catalog.model("functiongemma-270m")
    assert gemma["source"]["ollama_ref"] == "functiongemma:270m"
    assert gemma["source"]["layers"]["model"].startswith("sha256:415f8f959d80")
    assert gemma["runtime_min_version"] == "0.13.5"
    assert gemma["backend"] == {"backend_id": "local.ollama.functiongemma-270m", "provider": "ollama",
                                "model": "functiongemma:270m", "credential_ref": None, "privacy": "local"}
    assert gemma["runtime"] == "ollama" and gemma["destination"] == "ollama_store"


def test_measured_memory_comes_from_evidence():
    catalog = load_catalog()
    assert catalog.model("functiongemma-270m")["memory"]["resident_mb"] == 516
    assert catalog.coexistence["status"] == "a_medir" and catalog.coexistence["baseline_cognituum_mb"] is None


def test_fingerprint_is_deterministic():
    assert load_catalog().fingerprint == load_catalog(document=_document()).fingerprint


@pytest.mark.parametrize("mutate, code", [
    (lambda d: d["models"].append(copy.deepcopy(d["models"][0])), "CATALOG_INVALID"),
    (lambda d: d["mandatory_model_ids"].append("no-existe"), "CATALOG_INVALID"),
    (lambda d: d["models"][0].update(runtime="otro-runtime"), "CATALOG_INVALID"),
    (lambda d: d["models"][0]["backend"].update(credential_ref="credential-ref://x/y"), "CATALOG_INVALID"),
    (lambda d: d["models"][0]["source"]["layers"].update(model="sha256:corto"), "CATALOG_INVALID"),
    (lambda d: d["models"][0].update(destination="otro-destino"), "CATALOG_INVALID"),
    (lambda d: d["models"][0]["platforms"].append(copy.deepcopy(d["models"][0]["platforms"][0])), "CATALOG_INVALID"),
    (lambda d: d["models"][0]["backend"].update(privacy="approved_cloud"), "CATALOG_INVALID"),
])
def test_invalid_catalogs_fail_closed(mutate, code):
    document = _document()
    mutate(document)
    with pytest.raises(CatalogError) as exc:
        load_catalog(document=document)
    assert exc.value.code == code


def test_missing_catalog_is_reported(tmp_path):
    with pytest.raises(CatalogError) as exc:
        load_catalog(tmp_path)
    assert exc.value.code == "CATALOG_NOT_FOUND"


def test_adding_a_model_is_data_only():
    document = _document()
    extra = copy.deepcopy(document["models"][0])
    extra["model_id"] = "otro-modelo"
    extra["mandatory"] = False
    extra["backend"]["backend_id"] = "local.ollama.otro-modelo"
    document["models"].append(extra)
    catalog = load_catalog(document=document)
    assert catalog.model("otro-modelo") is not None
    assert catalog.mandatory_ids == ["functiongemma-270m"]
