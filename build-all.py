#!/usr/bin/env python3
"""
BloomNucleus — Cross-Platform Build Orchestrator
Soporta: Windows | macOS | Linux

Estructura esperada:
  root/
  ├── build-all.py               ← este archivo
  ├── builds/
  │   ├── windows/
  │   │   ├── build-component.bat
  │   │   └── brain.ps1
  │   └── macos/
  │       ├── build-component.sh
  │       └── build-host.sh
  └── installer/
      ├── nucleus/
      ├── sentinel/
      ├── metamorph/
      ├── sensor/
      ├── conductor/
      ├── cortex/
      └── bootstrap/

USO:
  python3 build-all.py                   # build completo
  python3 build-all.py --only nucleus    # solo un componente Go
  python3 build-all.py --skip host       # saltar host (C++)
"""

from __future__ import annotations

import argparse
import json
import os
import platform as _platform
import subprocess
import sys
import textwrap
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

# ─────────────────────────────────────────────────────────────────────────────
# CONSTANTES DE PLATAFORMA
# ─────────────────────────────────────────────────────────────────────────────

IS_WINDOWS = sys.platform == "win32"
IS_MACOS   = sys.platform == "darwin"
IS_LINUX   = sys.platform.startswith("linux")

ROOT = Path(__file__).resolve().parent


# ─────────────────────────────────────────────────────────────────────────────
# CORRECCIÓN 1 — Paths de NUCLEUS_HOME por plataforma
# ─────────────────────────────────────────────────────────────────────────────

def _resolve_nucleus_home() -> Path:
    if IS_WINDOWS:
        appdata = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData/Local"))
        return Path(os.environ.get("BLOOM_NUCLEUS_HOME", appdata / "BloomNucleus"))
    elif IS_MACOS:
        return Path(os.environ.get(
            "BLOOM_NUCLEUS_HOME",
            Path.home() / "Library" / "Application Support" / "BloomNucleus"
        ))
    else:  # Linux
        xdg = os.environ.get("XDG_DATA_HOME", str(Path.home() / ".local/share"))
        return Path(os.environ.get("BLOOM_NUCLEUS_HOME", Path(xdg) / "BloomNucleus"))


def _exe(stem: str) -> str:
    """Retorna el nombre del ejecutable con extensión correcta para la plataforma."""
    return stem + (".exe" if IS_WINDOWS else "")


NUCLEUS_HOME = _resolve_nucleus_home()
NUCLEUS_EXE  = NUCLEUS_HOME / "bin" / "nucleus" / _exe("nucleus")


# ─────────────────────────────────────────────────────────────────────────────
# CORRECCIÓN 2 — _DEV_BIN_BASE: detectar arquitectura en macOS
# ─────────────────────────────────────────────────────────────────────────────

def _get_dev_bin_base() -> Path:
    if IS_WINDOWS:
        return ROOT / "installer/native/bin/win64"
    elif IS_MACOS:
        arch = _platform.machine()  # 'arm64' o 'x86_64'
        folder = "darwin_arm64" if arch == "arm64" else "darwin_x64"
        return ROOT / "installer/native/bin" / folder
    else:  # Linux
        return ROOT / "installer/native/bin/linux_x64"


_DEV_BIN_BASE  = _get_dev_bin_base()
_PROD_BIN_BASE = NUCLEUS_HOME / "bin"


# ─────────────────────────────────────────────────────────────────────────────
# CORRECCIÓN 3 — BUILDS: seleccionar .bat vs .sh por plataforma
# ─────────────────────────────────────────────────────────────────────────────

def _build_script_dir() -> Path:
    """Carpeta de scripts de build para la plataforma actual."""
    return ROOT / "builds" / ("windows" if IS_WINDOWS else "macos")


_BUILD_DIR = _build_script_dir()

# npm / node: usar "npm.cmd" en Windows, "npm" en unix
_NPM = "npm.cmd" if IS_WINDOWS else "npm"

BUILDS: dict[str, Path | None] = {
    # Brain: PowerShell en Windows, bash en macOS/Linux
    "brain": (
        ROOT / "builds/windows/brain.ps1"
        if IS_WINDOWS
        else ROOT / "builds/macos/build-brain.sh"
    ),

    # Host (C++): solo macOS/Linux — None en Windows indica skip explícito
    "host": (
        None
        if IS_WINDOWS
        else _BUILD_DIR / "build-host.sh"
    ),

    # Go components: un solo script genérico por plataforma
    "nucleus":   _BUILD_DIR / ("build-component.bat" if IS_WINDOWS else "build-component.sh"),
    "sentinel":  _BUILD_DIR / ("build-component.bat" if IS_WINDOWS else "build-component.sh"),
    "metamorph": _BUILD_DIR / ("build-component.bat" if IS_WINDOWS else "build-component.sh"),
    "sensor":    _BUILD_DIR / ("build-component.bat" if IS_WINDOWS else "build-component.sh"),

    # JS/Node: paths a sus directorios de proyecto
    # ¡NO usar build_script() para estos — tienen build_node() propio!
    "conductor": ROOT / "installer/conductor",
    "cortex":    ROOT / "installer/cortex",
    "bootstrap": ROOT / "installer/bootstrap",
    "vsix":      ROOT,
}


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS DE EJECUCIÓN
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class StepResult:
    name:    str
    ok:      bool
    output:  str = ""
    error:   str = ""
    skipped: bool = False
    skip_reason: str = ""


def log(msg: str) -> None:
    print(f"  {msg}")


def run(cmd: list[str], cwd: Path | None = None) -> tuple[int, str, str]:
    """
    Ejecuta un comando y retorna (returncode, stdout, stderr).
    stdout y stderr se capturan por separado y se combinan en el output
    para diagnóstico — soluciona el problema de scripts bash que redirigen
    stderr al log file, dejando run() con stderr vacío.
    """
    proc = subprocess.run(
        cmd,
        cwd=cwd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,   # ← CORRECCIÓN: merge stderr→stdout
        text=True,
    )
    return proc.returncode, proc.stdout.strip(), ""


# ─────────────────────────────────────────────────────────────────────────────
# CORRECCIÓN 4 — build_brain(): seleccionar PowerShell vs bash
# ─────────────────────────────────────────────────────────────────────────────

def build_brain() -> StepResult:
    brain_script = BUILDS["brain"]
    if not brain_script or not brain_script.exists():
        return StepResult("Brain", False, error=f"Script no encontrado: {brain_script}")

    if IS_WINDOWS:
        log("Ejecutando brain.ps1 ...")
        cmd = ["powershell", "-ExecutionPolicy", "Bypass", "-File", brain_script.name]
    else:
        log("Ejecutando build-brain.sh ...")
        cmd = ["bash", brain_script.name]

    code, out, _ = run(cmd, cwd=brain_script.parent)
    if code != 0:
        return StepResult("Brain", False, error=out)
    return StepResult("Brain", True, output=out)


# ─────────────────────────────────────────────────────────────────────────────
# CORRECCIÓN 5 — build_go_component(): pasa el nombre del componente como arg
#                El script de build redirige stderr al log file propio,
#                por eso usamos stderr=STDOUT en run() para capturar todo.
# ─────────────────────────────────────────────────────────────────────────────

def build_go_component(component: str) -> StepResult:
    """
    Compila un componente Go usando el script genérico de la plataforma.
    El nombre del componente se pasa como primer argumento al script.
    """
    script_path = BUILDS[component]
    if not script_path or not script_path.exists():
        return StepResult(
            component.capitalize(), False,
            error=f"Script no encontrado: {script_path}"
        )

    log(f"Compilando {component} con {script_path.name} ...")

    if IS_WINDOWS:
        cmd = ["cmd", "/c", script_path.name, component]
    else:
        cmd = ["bash", script_path.name, component]

    code, out, _ = run(cmd, cwd=script_path.parent)
    if code != 0:
        # Mostrar las últimas líneas del output para diagnóstico
        tail = "\n".join(out.splitlines()[-20:]) if out else "(sin output)"
        return StepResult(component.capitalize(), False, error=tail)
    return StepResult(component.capitalize(), True, output=out)


def build_host() -> StepResult:
    """
    Compila bloom-host (C++). Solo en macOS/Linux.
    En Windows: skip explícito con cartel informativo.
    """
    if IS_WINDOWS:
        return StepResult(
            "Host",
            ok=True,
            skipped=True,
            skip_reason=(
                "bloom-host (C++) no compila en Windows. "
                "Compilar desde macOS o Linux."
            ),
        )

    host_script = BUILDS["host"]
    if not host_script or not host_script.exists():
        return StepResult("Host", False, error=f"Script no encontrado: {host_script}")

    log(f"Ejecutando {host_script.name} ...")
    code, out, _ = run(["bash", host_script.name], cwd=host_script.parent)
    if code != 0:
        tail = "\n".join(out.splitlines()[-20:]) if out else "(sin output)"
        return StepResult("Host", False, error=tail)
    return StepResult("Host", True, output=out)


# ─────────────────────────────────────────────────────────────────────────────
# CORRECCIÓN 6 — Pasos Node/npm: usar npm run, no bash sobre un directorio
# ─────────────────────────────────────────────────────────────────────────────

def build_node(name: str, project_dir: Path, npm_script: str) -> StepResult:
    """
    Ejecuta 'npm run <npm_script>' en project_dir.
    Reemplaza el uso incorrecto de build_script() sobre directorios.
    """
    if not project_dir.exists():
        return StepResult(name, False, error=f"Directorio no encontrado: {project_dir}")

    pkg_json = project_dir / "package.json"
    if not pkg_json.exists():
        return StepResult(name, False, error=f"package.json no encontrado en: {project_dir}")

    log(f"Ejecutando npm run {npm_script} en {project_dir.name}/ ...")
    cmd = [_NPM, "run", npm_script]
    code, out, _ = run(cmd, cwd=project_dir)
    if code != 0:
        tail = "\n".join(out.splitlines()[-20:]) if out else "(sin output)"
        return StepResult(name, False, error=tail)
    return StepResult(name, True, output=out)


def build_cortex() -> StepResult:
    """
    Cortex: ejecuta package.py con python3, no con bash.
    El script está en installer/cortex/build-cortex/package.py
    """
    cortex_dir   = BUILDS["cortex"]
    package_py   = cortex_dir / "build-cortex" / "package.py"  # type: ignore[operator]

    if not package_py.exists():
        # Fallback: buscar package.py directamente en cortex_dir
        package_py = cortex_dir / "package.py"                 # type: ignore[operator]
        if not package_py.exists():
            return StepResult("Cortex", False,
                              error=f"package.py no encontrado en: {cortex_dir}")

    log(f"Ejecutando python3 {package_py.name} ...")
    cmd = [sys.executable, package_py.name]
    code, out, _ = run(cmd, cwd=package_py.parent)
    if code != 0:
        tail = "\n".join(out.splitlines()[-20:]) if out else "(sin output)"
        return StepResult("Cortex", False, error=tail)
    return StepResult("Cortex", True, output=out)


def build_bootstrap() -> StepResult:
    """
    Bootstrap: ejecuta version-bootstrap.py con python3, no con bash.
    """
    bootstrap_dir = BUILDS["bootstrap"]
    script_py     = bootstrap_dir / "version-bootstrap.py"     # type: ignore[operator]

    if not script_py.exists():
        return StepResult("Bootstrap", False,
                          error=f"version-bootstrap.py no encontrado en: {bootstrap_dir}")

    log(f"Ejecutando python3 {script_py.name} ...")
    cmd = [sys.executable, script_py.name]
    code, out, _ = run(cmd, cwd=script_py.parent)
    if code != 0:
        tail = "\n".join(out.splitlines()[-20:]) if out else "(sin output)"
        return StepResult("Bootstrap", False, error=tail)
    return StepResult("Bootstrap", True, output=out)


# ─────────────────────────────────────────────────────────────────────────────
# CORRECCIÓN 7 — get_contracts(): sin PowerShell en macOS
# ─────────────────────────────────────────────────────────────────────────────

def get_conductor_version(bin_base: Path) -> tuple[str, str]:
    """
    Lee la versión de Conductor desde version.json (generado por el build)
    o desde resources/app/package.json del app empaquetado.
    Compatible con Windows y macOS sin PowerShell.
    """
    version_json = bin_base / "conductor" / "version.json"
    if version_json.exists():
        try:
            data = json.loads(version_json.read_text())
            return str(data.get("version", "?")), str(data.get("build", "?"))
        except Exception:
            pass

    pkg_json = bin_base / "conductor" / "resources" / "app" / "package.json"
    if pkg_json.exists():
        try:
            data = json.loads(pkg_json.read_text())
            return str(data.get("version", "?")), "?"
        except Exception:
            pass

    return "?", "?"


def get_contracts(bin_base: Path) -> dict:
    contracts: dict[str, str] = {}

    cond_version, cond_build = get_conductor_version(bin_base)
    contracts["conductor"] = f"{cond_version} (build {cond_build})"

    for comp in ("nucleus", "sentinel", "metamorph", "sensor"):
        build_info = ROOT / "installer" / comp / "internal" / "core" / "build_info.go"
        if build_info.exists():
            try:
                text = build_info.read_text()
                for line in text.splitlines():
                    if "BuildNumber" in line and "=" in line:
                        build_num = line.split("=")[1].strip()
                        contracts[comp] = f"build {build_num}"
                        break
            except Exception:
                contracts[comp] = "?"
        else:
            contracts[comp] = "?"

    return contracts


# ─────────────────────────────────────────────────────────────────────────────
# UTILIDADES DE PRESENTACIÓN
# ─────────────────────────────────────────────────────────────────────────────

def _sep(char: str = "─", width: int = 60) -> str:
    return char * width


def _header(title: str) -> None:
    print()
    print(_sep("═"))
    print(f"  {title}")
    print(_sep("═"))


def _step_header(n: int, total: int, name: str) -> None:
    print()
    print(_sep())
    print(f"  [{n}/{total}] {name}")
    print(_sep())


def _print_result(result: StepResult) -> None:
    if result.skipped:
        print(f"  ⊘  SKIP — {result.skip_reason}")
    elif result.ok:
        print(f"  ✅ OK")
    else:
        print(f"  ❌ FAILED")
        if result.error:
            for line in result.error.splitlines()[-15:]:
                print(f"     {line}")


def _print_summary(results: list[StepResult]) -> None:
    print()
    print(_sep("═"))
    print("  RESUMEN DEL BUILD")
    print(_sep("═"))

    ok_count     = sum(1 for r in results if r.ok and not r.skipped)
    skip_count   = sum(1 for r in results if r.skipped)
    failed_count = sum(1 for r in results if not r.ok)

    for r in results:
        if r.skipped:
            icon   = "⊘ "
            detail = f"(skipped: {r.skip_reason})"
        elif r.ok:
            icon   = "✅"
            detail = ""
        else:
            icon   = "❌"
            detail = r.error.splitlines()[0] if r.error else ""

        print(f"  {icon}  {r.name:<20} {detail}")

    print()
    print(f"  OK: {ok_count}  |  Skipped: {skip_count}  |  Failed: {failed_count}")
    print(_sep("═"))

    if failed_count > 0:
        print()
        print("  ⚠️  El build terminó con errores.")
        sys.exit(1)
    else:
        print()
        print("  🎉 Build completo.")


# ─────────────────────────────────────────────────────────────────────────────
# ARGPARSE — soporte para --only y --skip
# ─────────────────────────────────────────────────────────────────────────────

ALL_STEP_NAMES = [
    "brain", "host", "nucleus", "sentinel", "metamorph",
    "sensor", "conductor", "cortex", "bootstrap", "vsix",
]


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="BloomNucleus Build Orchestrator",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent(f"""
            Componentes disponibles: {', '.join(ALL_STEP_NAMES)}

            Ejemplos:
              python3 build-all.py
              python3 build-all.py --only nucleus
              python3 build-all.py --only nucleus sentinel
              python3 build-all.py --skip host brain
        """),
    )
    parser.add_argument(
        "--only",
        nargs="+",
        metavar="STEP",
        help="Ejecutar solo estos pasos (espacio entre nombres)",
    )
    parser.add_argument(
        "--skip",
        nargs="+",
        metavar="STEP",
        help="Saltar estos pasos",
    )
    return parser.parse_args()


# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────

def main() -> None:
    args = _parse_args()

    _header(
        f"BloomNucleus — Build Orchestrator\n"
        f"  Platform : {sys.platform}  ({_platform.machine()})\n"
        f"  Bin base : {_DEV_BIN_BASE}"
    )

    # Definir todos los pasos en orden.
    # Conductor, Bootstrap y VSIX usan npm run; Cortex usa python3.
    # Brain y Host usan sus propios builders.
    # Los 4 Go components usan build_go_component().
    all_steps: list[tuple[str, str, Callable[[], StepResult]]] = [
        ("brain",     "Brain",     build_brain),
        ("host",      "Host",      build_host),
        ("nucleus",   "Nucleus",   lambda: build_go_component("nucleus")),
        ("sentinel",  "Sentinel",  lambda: build_go_component("sentinel")),
        ("metamorph", "Metamorph", lambda: build_go_component("metamorph")),
        ("sensor",    "Sensor",    lambda: build_go_component("sensor")),
        # Conductor: npm run build:all en installer/conductor/
        ("conductor", "Conductor", lambda: build_node("Conductor", BUILDS["conductor"], "build:all")),  # type: ignore[arg-type]
        # Cortex: python3 package.py (no bash, no npm)
        ("cortex",    "Cortex",    build_cortex),
        # Bootstrap: python3 version-bootstrap.py (no bash)
        ("bootstrap", "Bootstrap", build_bootstrap),
        # VSIX: npm run package:vscode en ROOT
        ("vsix",      "VSIX",      lambda: build_node("VSIX", ROOT, "package:vscode")),
    ]

    # Filtrar por --only / --skip
    only_set = set(s.lower() for s in args.only) if args.only else None
    skip_set = set(s.lower() for s in args.skip) if args.skip else set()

    steps = [
        (key, display, fn)
        for key, display, fn in all_steps
        if (only_set is None or key in only_set) and key not in skip_set
    ]

    if not steps:
        print("  ⚠️  No hay pasos que ejecutar con los filtros indicados.")
        sys.exit(0)

    results: list[StepResult] = []
    total = len(steps)

    for i, (_, name, fn) in enumerate(steps, start=1):
        _step_header(i, total, name)
        result = fn()
        result.name = name
        _print_result(result)
        results.append(result)

    _print_summary(results)


if __name__ == "__main__":
    main()
