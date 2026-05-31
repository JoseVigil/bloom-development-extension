#!/usr/bin/env python3
"""
build-bootstrap-ions.py
=======================
Empaqueta los ion sites bootstrap en ZIPs y genera los hashes SHA-256 reales
para bootstrap-ions.json. Se ejecuta como parte del build del installer.

Uso:
    python scripts/build-bootstrap-ions.py

Output:
    installer/native/ionpump/github.com.ion.zip    ← ZIP listo para deploy
    installer/native/ionpump/bootstrap-ions.json   ← manifest con hashes reales

Este script reemplaza los placeholders __GENERATED_AT_BUILD_TIME__ del manifest
con los hashes calculados desde los archivos fuente reales.
"""

import hashlib
import json
import os
import zipfile
from pathlib import Path

# ─── Rutas ────────────────────────────────────────────────────────────────────

SCRIPT_DIR    = Path(__file__).parent
REPO_ROOT     = SCRIPT_DIR.parent.parent.parent   # installer/metamorph/scripts/ → repo root
IONS_SRC      = REPO_ROOT / "installer" / "ions"              # fuente de los ion sites
INSTALLER_OUT = REPO_ROOT / "installer" / "native" / "ionpump" # destino de ZIPs y manifest

MANIFEST_TEMPLATE = INSTALLER_OUT / "bootstrap-ions.json"

# Sites a empaquetar. Orden = orden de deploy.
BOOTSTRAP_SITES = [
    "github.com",
    # "gemini.google.com",  # descomentar cuando el site esté listo
]


# ─── Utilidades ───────────────────────────────────────────────────────────────

def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def collect_site_files(site_dir: Path) -> list[Path]:
    """Retorna todos los archivos del site en orden determinístico."""
    files = sorted(
        p for p in site_dir.rglob("*") if p.is_file()
    )
    return files


# ─── Empaquetado ──────────────────────────────────────────────────────────────

def build_site_zip(site_name: str) -> tuple[Path, dict]:
    """
    Empaqueta un ion site en ZIP y retorna:
      - path al ZIP generado
      - dict con sha256 del ZIP y sha256 de cada archivo interno
    """
    site_dir = IONS_SRC / site_name
    if not site_dir.exists():
        raise FileNotFoundError(f"Ion site source not found: {site_dir}")

    zip_path = INSTALLER_OUT / f"{site_name}.ion.zip"
    file_hashes = []

    print(f"  📦 Packaging {site_name}...")

    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for abs_path in collect_site_files(site_dir):
            rel_path = abs_path.relative_to(site_dir)
            arc_name = rel_path.as_posix()   # siempre forward slashes dentro del ZIP

            zf.write(abs_path, arc_name)

            file_hash = sha256_file(abs_path)
            file_hashes.append({
                "path": arc_name,
                "sha256": file_hash
            })
            print(f"     {arc_name}  {file_hash[:12]}...")

    zip_hash = sha256_file(zip_path)
    print(f"  ✅ {zip_path.name}  sha256={zip_hash[:16]}...")

    return zip_path, {
        "sha256": zip_hash,
        "files": file_hashes
    }


# ─── Manifest ─────────────────────────────────────────────────────────────────

def load_site_version(site_name: str) -> str:
    """Lee la versión desde domain.manifest.json del site."""
    manifest_path = IONS_SRC / site_name / "domain.manifest.json"
    with open(manifest_path) as f:
        data = json.load(f)
    return data["version"]


def generate_manifest(results: dict[str, dict]) -> None:
    """Escribe bootstrap-ions.json con hashes reales."""
    with open(MANIFEST_TEMPLATE) as f:
        manifest = json.load(f)

    # Reconstruir ions con hashes reales
    updated_ions = []
    for ion in manifest["ions"]:
        domain = ion["domain"]
        if domain not in results:
            # site no procesado en este build — conservar como estaba
            updated_ions.append(ion)
            continue

        result = results[domain]
        zip_path = f"installer/native/ionpump/{domain}.ion.zip"
        updated_ion = {
            **ion,
            "zip_path": zip_path,
            "sha256": result["sha256"],
            "files": result["files"],
        }
        updated_ions.append(updated_ion)

    manifest["ions"] = updated_ions

    with open(MANIFEST_TEMPLATE, "w") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")

    print(f"\n  📄 bootstrap-ions.json actualizado con {len(updated_ions)} site(s)")


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    print("\n🔨 Bloom Bootstrap Ion Builder")
    print("=" * 50)

    INSTALLER_OUT.mkdir(parents=True, exist_ok=True)

    results = {}
    errors  = []

    for site_name in BOOTSTRAP_SITES:
        try:
            _, hashes = build_site_zip(site_name)
            results[site_name] = hashes
        except Exception as e:
            print(f"  ❌ {site_name}: {e}")
            errors.append((site_name, str(e)))

    if errors:
        print(f"\n❌ Build falló para {len(errors)} site(s):")
        for site, err in errors:
            print(f"   {site}: {err}")
        raise SystemExit(1)

    generate_manifest(results)

    print("\n✅ Build completo.")
    print(f"   ZIPs y manifest en: {INSTALLER_OUT}")
    print("""
Próximos pasos (Conductor Setup):
   metamorph ion-pump reconcile \\
       --manifest installer/native/ionpump/bootstrap-ions.json \\
       --force-swap
""")


if __name__ == "__main__":
    main()
