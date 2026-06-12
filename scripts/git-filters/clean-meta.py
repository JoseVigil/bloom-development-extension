#!/usr/bin/env python3
"""
Normalize JSON build metadata for git storage.
Volatile fields are replaced with canonical zero-values so two machines
building the same code produce identical git objects.
"""
import sys, json, re

# Fields whose VALUES are volatile across builds / platforms.
# Keys not listed here are stored verbatim.
ZERO_INT    = {"build_number", "build"}
ZERO_DATE   = {"build_date", "built_at"}
ZERO_STR    = {"platform", "arch", "git_commit", "node_version",
               "electron_version", "full_version"}

def normalize(obj):
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            if k in ZERO_INT:
                out[k] = 0
            elif k in ZERO_DATE:
                out[k] = "1970-01-01T00:00:00Z"
            elif k in ZERO_STR:
                out[k] = ""
            elif k == "semver" and isinstance(v, str):
                # keep semver but strip build metadata suffix: 1.0.0+build.106 → 1.0.0
                out[k] = re.sub(r'\+.*$', '', v)
            else:
                out[k] = normalize(v)
        return out
    elif isinstance(obj, list):
        return [normalize(i) for i in obj]
    return obj

raw = sys.stdin.read()
try:
    data = json.loads(raw)
except json.JSONDecodeError:
    sys.stdout.write(raw)
    sys.exit(0)

sys.stdout.write(json.dumps(normalize(data), indent=2, ensure_ascii=False))
sys.stdout.write("\n")
