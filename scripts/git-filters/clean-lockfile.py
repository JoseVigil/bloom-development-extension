#!/usr/bin/env python3
"""
Normalize package-lock.json for cross-platform git storage.
Volatile per-platform data: resolved URLs, integrity hashes, cpu/os arrays.
We keep the dependency graph (name, version, requires) intact so the lock
file still functions as a reproducibility record — just without the
platform-specific noise that causes constant dirty-state conflicts.
"""
import sys, json

STRIP_KEYS = {"resolved", "integrity", "cpu", "os", "engines", "funding",
              "peerDependencies", "peerDependenciesMeta"}

def clean_pkg(pkg):
    if not isinstance(pkg, dict):
        return pkg
    out = {}
    for k, v in pkg.items():
        if k in STRIP_KEYS:
            continue
        elif k == "packages" and isinstance(v, dict):
            out[k] = {name: clean_pkg(p) for name, p in v.items()}
        elif k == "dependencies" and isinstance(v, dict):
            out[k] = {name: clean_pkg(p) for name, p in v.items()}
        else:
            out[k] = v
    return out

raw = sys.stdin.read()
try:
    data = json.loads(raw)
except json.JSONDecodeError:
    sys.stdout.write(raw)
    sys.exit(0)

sys.stdout.write(json.dumps(clean_pkg(data), indent=2, ensure_ascii=False))
sys.stdout.write("\n")
