"""Motor de veredicto de la verificacion previa (puro, sin E/S) y sondas comunes.

Separacion central del diseño:

* **Elegibilidad (estable):** funcion pura del perfil estable de la maquina +
  catalogo + seleccion. Mismas entradas => mismo veredicto y misma huella.
* **Preparacion (volatil):** memoria libre, presion, swap, servicio alcanzable,
  disco libre. Tiene ``observed_at`` y ``ttl_seconds`` y NUNCA cambia el
  veredicto; solo produce avisos.
"""
from __future__ import annotations

import json
import re
import shutil
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from aitap.local.catalog import Catalog, canonical_digest

SCHEMA_VERSION = "cognituum.local-intelligence.preflight/v1"
READINESS_TTL_SECONDS = 60
LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "::1", "[::1]"}
DEFAULT_OLLAMA_HOST = "127.0.0.1:11434"
_HEX64 = re.compile(r"^[0-9a-f]{64}$")

# Codigos estables. Bloqueantes => BLOQUEADO; salvedades => APTO_CON_SALVEDADES.
BLOCKING = {
    "OS_UNSUPPORTED", "ARCH_UNSUPPORTED", "OS_BELOW_OBSERVED_MINIMUM",
    "RAM_TOTAL_INSUFFICIENT", "COEXISTENCE_BUDGET_EXCEEDED",
    "RUNTIME_SERVICE_ABSENT", "RUNTIME_COMPANION_MISSING",
}
# Codigos que describen el runtime (servicio y acompanantes), no la maquina.
RUNTIME_REASONS = {"RUNTIME_SERVICE_ABSENT", "RUNTIME_COMPANION_MISSING"}
CAVEATS = {
    "OS_BELOW_VENDOR_MINIMUM", "GPU_ACCEL_UNAVAILABLE",
    "CATALOG_UNMEASURED_ON_PLATFORM", "COEXISTENCE_UNMEASURED",
}


def normalize_arch(machine: str) -> str:
    machine = (machine or "").lower()
    if machine in {"x86_64", "amd64", "x64"}:
        return "x86_64"
    if machine in {"arm64", "aarch64", "armv8"}:
        return "arm64"
    return machine or "unknown"


def version_tuple(value: str | None) -> tuple[int, ...] | None:
    if not value:
        return None
    parts = []
    for piece in str(value).split("."):
        digits = "".join(ch for ch in piece if ch.isdigit())
        if not digits:
            break
        parts.append(int(digits))
    return tuple(parts) or None


def _below(current: str | None, minimum: str | None) -> bool | None:
    cur, low = version_tuple(current), version_tuple(minimum)
    if cur is None or low is None:
        return None
    width = max(len(cur), len(low))
    return cur + (0,) * (width - len(cur)) < low + (0,) * (width - len(low))


def evaluate_model(model: dict[str, Any], stable: dict[str, Any], catalog: Catalog,
                   selection: list[str]) -> dict[str, Any]:
    """Veredicto estable de un modelo. Puro: sin E/S ni lectura del reloj."""
    reasons: list[str] = []
    entry = Catalog.platform_entry(model, stable["os"], stable["arch"])
    if entry is None:
        known_os = {p["os"] for p in model["platforms"]}
        reasons.append("ARCH_UNSUPPORTED" if stable["os"] in known_os else "OS_UNSUPPORTED")
    else:
        if entry["status"] == "a_medir":
            reasons.append("CATALOG_UNMEASURED_ON_PLATFORM")
        vendor_min = entry["vendor_min_os"]
        if model["runtime"] == "ollama":
            vendor_min = stable["ollama"].get("binary_minos") or vendor_min
        observed_min = entry["observed_min_os"]
        if _below(stable["os_version"], vendor_min):
            if observed_min is None:
                reasons.append("OS_UNSUPPORTED")
            elif _below(stable["os_version"], observed_min):
                reasons.append("OS_BELOW_OBSERVED_MINIMUM")
            else:
                reasons.append("OS_BELOW_VENDOR_MINIMUM")
        elif _below(stable["os_version"], observed_min):
            reasons.append("OS_BELOW_OBSERVED_MINIMUM")
        insufficient = entry["known_insufficient_ram_mb"]
        if insufficient is not None and stable["ram_total_mb"] is not None and stable["ram_total_mb"] <= insufficient:
            reasons.append("RAM_TOTAL_INSUFFICIENT")
        if model["runtime"] == "ollama":
            ollama = stable["ollama"]
            if not ollama.get("service_defined") or not ollama.get("binary_present"):
                reasons.append("RUNTIME_SERVICE_ABSENT")
            if entry["requires_companion"] and not ollama.get("companion_present"):
                reasons.append("RUNTIME_COMPANION_MISSING")
        reasons.extend(entry["flags"])
    coexistence = catalog.coexistence
    if coexistence["baseline_cognituum_mb"] is None or coexistence["safety_factor"] is None:
        reasons.append("COEXISTENCE_UNMEASURED")
    elif stable["ram_total_mb"] is not None:
        resident = sum((catalog.model(mid) or {}).get("memory", {}).get("resident_mb") or 0 for mid in selection)
        budget = stable["ram_total_mb"] * coexistence["safety_factor"]
        if resident + coexistence["baseline_cognituum_mb"] > budget:
            reasons.append("COEXISTENCE_BUDGET_EXCEEDED")
    reasons = sorted(dict.fromkeys(reasons))
    # Elegibilidad de la maquina: el mismo criterio sin los codigos del runtime, para
    # poder ofrecer un modelo antes de registrar el servicio. ``verdict`` no cambia.
    machine_reasons = [r for r in reasons if r not in RUNTIME_REASONS]
    return {
        "model_id": model["model_id"],
        "backend_id": model["backend"]["backend_id"],
        "mandatory": model["model_id"] in catalog.mandatory_ids,
        "verdict": _verdict(reasons),
        "reasons": reasons,
        "platform_status": entry["status"] if entry else None,
        "coexistence_set": sorted(selection),
        "machine_eligibility": {"verdict": _verdict(machine_reasons), "reasons": machine_reasons},
        "runtime_reasons": [r for r in reasons if r in RUNTIME_REASONS],
    }


def _verdict(reasons: list[str]) -> str:
    if any(r in BLOCKING for r in reasons):
        return "BLOQUEADO"
    return "APTO_CON_SALVEDADES" if reasons else "APTO"


def eligibility_fingerprint(stable: dict[str, Any], catalog: Catalog, selection: list[str]) -> str:
    return canonical_digest({"stable_profile": stable, "catalog_fingerprint": catalog.fingerprint,
                             "selection": sorted(selection)})


def machine_eligibility_fingerprint(stable: dict[str, Any], catalog: Catalog, selection: list[str]) -> str:
    """Huella del perfil estable sin el estado del runtime de Ollama."""
    machine = {k: v for k, v in stable.items() if k != "ollama"}
    return canonical_digest({"machine_profile": machine, "catalog_fingerprint": catalog.fingerprint,
                             "selection": sorted(selection)})


# --------------------------------------------------------------------------- sondas volatiles

def normalize_manifest_digest(value: Any) -> str | None:
    """``digest`` de /api/tags -> 64 hex minusculas sin prefijo; None si no es valido."""
    if not isinstance(value, str):
        return None
    if value.startswith("sha256:"):
        value = value[len("sha256:"):]
    return value if _HEX64.match(value) else None


def probe_ollama(host: str | None, timeout: float = 1.5, opener=None) -> dict[str, Any]:
    """GET de solo lectura a la API local de Ollama. Nunca contacta hosts no loopback.

    ``tags_observed`` indica que /api/tags respondio; ``installed_digests`` mapea cada
    referencia exacta (``name`` o, si falta, ``model``) a su digest normalizado o None.
    """
    host = (host or DEFAULT_OLLAMA_HOST).strip()
    for scheme in ("http://", "https://"):
        if host.startswith(scheme):
            host = host[len(scheme):]
    host = host.rstrip("/")
    if host.startswith("["):
        hostname = host[: host.find("]") + 1]
    elif host.count(":") == 1:
        hostname = host.split(":", 1)[0]
    else:
        hostname = host
    if hostname == host:
        host = f"{host}:11434"
    result: dict[str, Any] = {"host": host, "reachable": False, "version": None, "installed_refs": [],
                              "tags_observed": False, "installed_digests": {}}
    if hostname not in LOOPBACK_HOSTS:
        result["skipped"] = "NON_LOOPBACK_HOST"
        return result
    opener = opener or urllib.request.urlopen
    base = f"http://{host}"
    try:
        with opener(base + "/api/version", timeout=timeout) as response:
            result["version"] = json.loads(response.read()).get("version")
        result["reachable"] = True
        with opener(base + "/api/tags", timeout=timeout) as response:
            models = json.loads(response.read()).get("models", [])
        digests = {}
        for entry in models:
            ref = entry.get("name") or entry.get("model")
            if ref:
                digests[ref] = normalize_manifest_digest(entry.get("digest"))
        result["installed_refs"] = sorted(digests)
        result["installed_digests"] = digests
        result["tags_observed"] = True
    except (urllib.error.URLError, OSError, ValueError, TypeError, AttributeError):
        pass
    return result


def disk_free_mb(path: Path) -> int | None:
    probe = Path(path)
    while not probe.exists() and probe != probe.parent:
        probe = probe.parent
    try:
        return int(shutil.disk_usage(probe).free // (1024 * 1024))
    except OSError:
        return None


def companion_present(binary: Path) -> bool:
    folder = Path(binary).parent
    return (folder / "llama-server").exists() or (folder / "llama-server.exe").exists() \
        or (folder.parent / "lib" / "ollama").is_dir() or (folder / "lib" / "ollama").is_dir()


def readiness_advisories(readiness: dict[str, Any], verdicts: list[dict[str, Any]], catalog: Catalog,
                         ollama_probe: dict[str, Any], destinations_free: dict[str, int | None]) -> list[str]:
    advisories: list[str] = []
    free = readiness.get("free_memory_pct")
    if free is not None and free < 15:
        advisories.append("FREE_MEMORY_LOW")
    if readiness.get("memory_pressure") in {"warn", "critical"}:
        advisories.append("MEMORY_PRESSURE_HIGH")
    needs_ollama = any((catalog.model(v["model_id"]) or {}).get("runtime") == "ollama" for v in verdicts)
    if needs_ollama and not ollama_probe.get("reachable"):
        advisories.append("RUNTIME_SERVICE_UNREACHABLE")
    for verdict in verdicts:
        model = catalog.model(verdict["model_id"]) or {}
        if verdict.get("installed"):
            continue
        free_mb = destinations_free.get(model.get("destination"))
        need_mb = int(model.get("size_bytes", 0) * 1.2 // (1024 * 1024)) + 512
        if free_mb is not None and free_mb < need_mb:
            advisories.append("DISK_INSUFFICIENT")
    return sorted(dict.fromkeys(advisories))


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
