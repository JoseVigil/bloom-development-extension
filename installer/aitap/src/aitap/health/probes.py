"""Sondas de salud de dependencias. Dominio puro: sin Typer, sin prints."""
from __future__ import annotations

import json
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Mapping

from aitap.local.catalog import bloom_base_dir

TTL_SECONDS = 30
STATE_ORDER = {"healthy": 0, "not_configured": 1, "degraded": 2, "unavailable": 3}
COMPONENTS = ("state", "nucleus")


class HealthError(ValueError):
    def __init__(self, code: str, message: str):
        self.code = code
        super().__init__(message)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _check(name: str, ok: bool, detail: str | None = None) -> dict[str, Any]:
    return {"name": name, "ok": bool(ok), "detail": detail}


def _inside_project(path: Path) -> bool:
    # Misma regla que route supply: la Contabilidad nunca vive dentro de un codebase.
    return any((p / ".git").exists() or (p / "pyproject.toml").exists() for p in [path, *path.parents])


def probe_state(env: Mapping[str, str]) -> dict[str, Any]:
    raw = env.get("AITAP_STATE_DIR", "")
    if not raw:
        return {"component": "state", "state": "not_configured", "observed_at": _now(), "ttl_seconds": TTL_SECONDS,
                "checks": [_check("configured", False, "AITAP_STATE_DIR no definido")]}
    path = Path(raw).expanduser()
    resolved = path.resolve()
    exists = resolved.is_dir()
    checks = [
        _check("configured", True, str(path)),
        _check("exists", exists),
        _check("writable", exists and os.access(resolved, os.W_OK | os.X_OK)),
        _check("outside_projects", not _inside_project(resolved)),
    ]
    state = "healthy" if all(c["ok"] for c in checks) else "unavailable"
    return {"component": "state", "state": state, "observed_at": _now(), "ttl_seconds": TTL_SECONDS, "checks": checks}


def _resolve_nucleus(env: Mapping[str, str], base: Path, which: Callable[[str], str | None]) -> tuple[str | None, str]:
    configured = env.get("NUCLEUS_BIN")
    if configured:
        candidate = Path(configured)
        if candidate.is_absolute():
            return (str(candidate), "NUCLEUS_BIN") if candidate.is_file() else (None, "NUCLEUS_BIN")
        found = which(configured)
        return (found, "NUCLEUS_BIN") if found else (None, "NUCLEUS_BIN")
    found = which("nucleus")
    if found:
        return found, "PATH"
    installed = base / "bin" / "nucleus" / ("nucleus.exe" if os.name == "nt" else "nucleus")
    return (str(installed), "bloom_base") if installed.is_file() else (None, "not_found")


def _active_org(base: Path) -> bool:
    try:
        onboarding = json.loads((base / "config" / "nucleus.json").read_text(encoding="utf-8"))["onboarding"]
        slug = onboarding["active_org_slug"]
        return any(o.get("org_slug") == slug and o.get("organization_id") for o in onboarding["organizations"])
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        return False


def probe_nucleus(env: Mapping[str, str], base: Path,
                  which: Callable[[str], str | None] = shutil.which) -> dict[str, Any]:
    binary, source = _resolve_nucleus(env, base, which)
    identity = (base / "authority" / "aitap-service-identity.json").is_file()
    checks = [
        _check("binary", binary is not None, f"{source}: {binary}" if binary else source),
        _check("service_identity_enrolled", identity,
               None if identity else "authority/aitap-service-identity.json ausente (enrolamiento explicito pendiente)"),
        _check("active_organization", _active_org(base)),
        _check("vault_grant_configured", bool(env.get("AITAP_VAULT_GRANT_ID")),
               None if env.get("AITAP_VAULT_GRANT_ID") else "AITAP_VAULT_GRANT_ID no definido"),
    ]
    if binary is None:
        state = "unavailable"
    elif all(c["ok"] for c in checks):
        state = "healthy"
    else:
        state = "degraded"
    return {"component": "nucleus", "state": state, "observed_at": _now(), "ttl_seconds": TTL_SECONDS, "checks": checks,
            "note": "Solo verifica prerrequisitos; no invoca Nucleus ni resuelve credenciales."}


def run_health(components: list[str] | None = None, *, env: Mapping[str, str] | None = None,
               base: Path | None = None, which: Callable[[str], str | None] = shutil.which) -> dict[str, Any]:
    env = os.environ if env is None else env
    selected = list(dict.fromkeys(components or COMPONENTS))
    unknown = [c for c in selected if c not in COMPONENTS]
    if unknown:
        raise HealthError("UNKNOWN_COMPONENT", f"componente desconocido: {', '.join(unknown)}")
    base = base or bloom_base_dir()
    results = []
    for component in selected:
        results.append(probe_state(env) if component == "state" else probe_nucleus(env, base, which))
    overall = max((r["state"] for r in results), key=lambda s: STATE_ORDER[s])
    return {"overall": overall, "components": results}
