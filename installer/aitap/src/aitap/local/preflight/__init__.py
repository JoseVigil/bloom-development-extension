"""Verificacion previa de solo lectura: perfil de la maquina y veredicto por modelo.

No escribe archivos, no descarga, no lanza procesos. Las unicas E/S son
lecturas de archivos del sistema, llamadas nativas y GET HTTP a la API local
(loopback) de Ollama.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Callable

from aitap.local.catalog import Catalog, bloom_base_dir, load_catalog
from aitap.local.preflight import common

Collector = Callable[[Path], dict[str, Any]]


class PreflightError(ValueError):
    def __init__(self, code: str, message: str):
        self.code = code
        super().__init__(message)


def default_collector() -> Collector:
    if os.name == "nt":
        from aitap.local.preflight import windows
        return windows.collect
    if os.uname().sysname == "Darwin":
        from aitap.local.preflight import darwin
        return darwin.collect
    from aitap.local.preflight import linux
    return linux.collect


def run_preflight(*, catalog: Catalog | None = None, selection: list[str] | None = None,
                  collector: Collector | None = None, base: Path | None = None,
                  probe: Callable[[str | None], dict[str, Any]] | None = None) -> dict[str, Any]:
    catalog = catalog or load_catalog()
    selection = list(dict.fromkeys(selection or catalog.mandatory_ids))
    unknown = [mid for mid in selection if catalog.model(mid) is None]
    if unknown:
        raise PreflightError("UNKNOWN_MODEL", f"modelo no presente en el catalogo: {', '.join(unknown)}")
    base = base or bloom_base_dir()
    observed = (collector or default_collector())(base)
    stable, readiness = observed["stable"], dict(observed["readiness"])

    verdicts = [common.evaluate_model(catalog.model(mid), stable, catalog, selection) for mid in selection]

    ollama_probe = (probe or common.probe_ollama)(observed.get("ollama_host"))
    destinations = {
        "ollama_store": stable["ollama"].get("models_dir_effective") or str(base / "models"),
    }
    destinations_free = {name: common.disk_free_mb(Path(path)) for name, path in destinations.items()}
    installed_refs = set(ollama_probe.get("installed_refs") or [])
    installed_digests = ollama_probe.get("installed_digests") or {}
    # Una sola observacion de /api/tags para todos los modelos: la vigencia es
    # readiness.observed_at + ttl_seconds, sin marca de tiempo por modelo.
    tags_observed = bool(ollama_probe.get("reachable")) and ollama_probe.get("tags_observed", True)
    models_state = {}
    for mid in selection:
        model = catalog.model(mid)
        ref = model["source"].get("ollama_ref") if model["runtime"] == "ollama" else None
        if ref is not None:
            installed = ref in installed_refs if tags_observed else None
        else:
            installed = None  # verificable cuando exista el aprovisionamiento (D4 pendiente)
        manifest = installed_digests.get(ref) if installed else None
        available = True if installed and manifest else False if installed is False else None
        models_state[mid] = {"model": ref, "installed": installed, "available": available,
                             "manifest_sha256": manifest}

    advisories = common.readiness_advisories(
        readiness, [{**v, "installed": models_state[v["model_id"]]["installed"]} for v in verdicts],
        catalog, ollama_probe, destinations_free)
    readiness.update({
        "observed_at": common.now_iso(),
        "ttl_seconds": common.READINESS_TTL_SECONDS,
        "ollama": {k: ollama_probe.get(k) for k in ("reachable", "version", "installed_refs")},
        "disk_free_mb": destinations_free,
        "models": models_state,
        "advisories": advisories,
        "state": "ADVISORY" if advisories else "OK",
    })
    return {
        "schema_version": common.SCHEMA_VERSION,
        "catalog_version": catalog.version,
        "catalog_fingerprint": catalog.fingerprint,
        "selection": selection,
        "eligibility_fingerprint": common.eligibility_fingerprint(stable, catalog, selection),
        "machine_eligibility_fingerprint": common.machine_eligibility_fingerprint(stable, catalog, selection),
        "stable_profile": stable,
        "verdicts": verdicts,
        "readiness": readiness,
        "destinations": destinations,
    }
