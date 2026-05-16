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
import datetime
import json
import logging
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
# VERSIONADO POR PLATAFORMA
#
# Cada componente puede tener tres archivos en su carpeta scripts/:
#   build_number.txt          ← número base (fuente de verdad, siempre existe)
#   build_number.windows.txt  ← offset para Windows  (opcional)
#   build_number.darwin.txt   ← offset para macOS     (opcional)
#
# Build number efectivo = base + offset_plataforma
# Si el archivo de offset no existe, se asume 0 (sin diferencia).
#
# Convención de paths por componente:
#   Go    → installer/<comp>/scripts/build_number*.txt
#   host  → installer/host/build_number*.txt   (sin subdirectorio scripts/)
#   cortex→ installer/cortex/build-cortex/build_number*.txt
#   conductor → installer/conductor/workspace/build_info.json  (JSON especial)
# ─────────────────────────────────────────────────────────────────────────────

# Sufijo de plataforma para los archivos de override
_PLATFORM_SUFFIX = (
    "windows" if IS_WINDOWS else
    "darwin"  if IS_MACOS   else
    "linux"
)

# Directorio de scripts de build_number por componente
_BUILD_NUMBER_DIRS: dict[str, Path] = {
    "nucleus":          ROOT / "installer/nucleus/scripts",
    "sentinel":         ROOT / "installer/sentinel/scripts",
    "metamorph":        ROOT / "installer/metamorph/scripts",
    "sensor":           ROOT / "installer/sensor/scripts",
    "host":             ROOT / "installer/host",
    "cortex":           ROOT / "installer/cortex/build-cortex",
    "conductor":        ROOT / "installer/conductor/workspace",  # usa build_info.json, no .txt
    "conductor_setup":  ROOT / "installer/conductor/setup",      # segunda app de Conductor
    "brain":            ROOT / "brain",                          # build_number.txt en brain/
}


def _read_int(path: Path, default: int = 0) -> int:
    """Lee un entero de un archivo de texto. Retorna default si no existe o es inválido."""
    try:
        return int(path.read_text(encoding="utf-8").strip())
    except (FileNotFoundError, ValueError):
        return default


def _ensure_build_number_files(scripts_dir: Path, component: str) -> None:
    """
    Garantiza que los tres archivos de versionado existen en scripts_dir.
    Si alguno falta, lo crea con valor 0 (sin offset).

    Archivos que se crean si no existen:
      build_number.txt          → número base (fuente de verdad)
      build_number.windows.txt  → offset para Windows
      build_number.darwin.txt   → offset para macOS

    Una vez creados, el operador puede editarlos manualmente para ajustar offsets
    (ej: darwin=100 para separar builds macOS de Windows).
    """
    try:
        scripts_dir.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        log(f"  ⚠ No se pudo crear directorio {scripts_dir}: {exc}")
        return

    # Conductor usa build_info.json y brain usa solo archivos de plataforma — no crear build_number.txt base
    if component not in ("conductor", "conductor_setup", "brain"):
        base_file = scripts_dir / "build_number.txt"
        if not base_file.exists():
            base_file.write_text("0", encoding="utf-8")
            try:
                rel = base_file.relative_to(ROOT)
            except ValueError:
                rel = base_file
            log(f"  📄 Creado {rel} (valor inicial: 0)")

    for platform_suffix in ("windows", "darwin"):
        offset_file = scripts_dir / f"build_number.{platform_suffix}.txt"
        if not offset_file.exists():
            offset_file.write_text("0", encoding="utf-8")
            try:
                rel = offset_file.relative_to(ROOT)
            except ValueError:
                rel = offset_file
            log(f"  📄 Creado {rel} (offset inicial: 0)")


def resolve_build_number(component: str) -> int:
    """
    Resuelve el build number efectivo para un componente en la plataforma actual.

    Crea los archivos de versión si no existen (con valor 0 como punto de partida).
    Luego lee:
      build_number.txt              → base
      build_number.<platform>.txt   → offset de plataforma (opcional, suma al base)

    Ejemplo con base=384 y darwin offset=100:
      Windows → 384 + 0   = 384
      macOS   → 384 + 100 = 484
    """
    scripts_dir = _BUILD_NUMBER_DIRS.get(component)
    if scripts_dir is None:
        return 0

    # Crear archivos faltantes antes de leer
    _ensure_build_number_files(scripts_dir, component)

    base      = _read_int(scripts_dir / "build_number.txt", default=0)
    offset    = _read_int(scripts_dir / f"build_number.{_PLATFORM_SUFFIX}.txt", default=0)
    effective = base + offset

    if offset != 0:
        log(f"  build_number [{component}]: {base} + {offset} ({_PLATFORM_SUFFIX}) = {effective}")
    else:
        log(f"  build_number [{component}]: {effective} (sin offset de plataforma)")

    return effective


def inject_build_number_env(component: str, base_env: dict | None = None) -> dict:
    """
    Retorna un dict de entorno con BLOOM_BUILD_NUMBER inyectado.
    Los scripts de build (bat/sh/py) deben leer esta variable para respetar
    el override de plataforma en lugar de leer build_number.txt directamente.

    Además escribe build_number.effective.txt en la misma carpeta, para
    herramientas que leen el archivo en disco (ej: generador de build_info.go).
    Los archivos de versión se crean automáticamente si no existen.
    """
    env = {**(base_env or os.environ)}
    build_num = resolve_build_number(component)
    env["BLOOM_BUILD_NUMBER"] = str(build_num)

    scripts_dir = _BUILD_NUMBER_DIRS.get(component)
    if scripts_dir and scripts_dir.exists():
        effective_file = scripts_dir / "build_number.effective.txt"
        try:
            effective_file.write_text(str(build_num), encoding="utf-8")
        except OSError:
            pass  # No es crítico si falla la escritura

    return env


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
    return ROOT / "builds" / ("windows" if IS_WINDOWS else "darwin")


_BUILD_DIR = _build_script_dir()

# npm / node: usar "npm.cmd" en Windows, "npm" en unix
_NPM = "npm.cmd" if IS_WINDOWS else "npm"

BUILDS: dict[str, Path | None] = {
    # Brain: PowerShell en Windows, bash en macOS/Linux
    "brain": (
        ROOT / "builds/windows/brain.ps1"
        if IS_WINDOWS
        else ROOT / "builds/darwin/build-brain.sh"
    ),

    # Host (C++): solo macOS/Linux — None en Windows indica skip explícito
    "host": (
        None
        if IS_WINDOWS
        else ROOT / "installer/host/build.sh"
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


# ─────────────────────────────────────────────────────────────────────────────
# LOGGER DUAL — consola + archivo en NUCLEUS_HOME/logs/build/
# Se inicializa en _setup_logger() al arrancar main().
# ─────────────────────────────────────────────────────────────────────────────

_logger: logging.Logger | None = None
_log_file_path: Path | None = None


def _resolve_log_dir() -> Path:
    """
    Retorna el directorio de logs según la convención de cada plataforma:
      Windows  → %LOCALAPPDATA%\BloomNucleus\logs\build\
      macOS    → ~/Library/Logs/BloomNucleus/build/
      Linux    → ~/.local/share/BloomNucleus/logs/build/  (XDG_DATA_HOME)
    """
    if IS_WINDOWS:
        return NUCLEUS_HOME / "logs" / "build"
    elif IS_MACOS:
        return Path.home() / "Library" / "Logs" / "BloomNucleus" / "build"
    else:  # Linux
        xdg = os.environ.get("XDG_DATA_HOME", str(Path.home() / ".local/share"))
        return Path(xdg) / "BloomNucleus" / "logs" / "build"


def _setup_logger() -> None:
    """
    Configura el logger dual: StreamHandler (consola) + FileHandler (disco).
    El archivo se crea en el directorio de logs de la plataforma con timestamp en el nombre:
      Windows  → %LOCALAPPDATA%\BloomNucleus\logs\build\
      macOS    → ~/Library/Logs/BloomNucleus/build/
      Linux    → $XDG_DATA_HOME/BloomNucleus/logs/build/
    Debe llamarse una sola vez al inicio de main().
    """
    global _logger, _log_file_path

    log_dir = _resolve_log_dir()
    try:
        log_dir.mkdir(parents=True, exist_ok=True)
        ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        _log_file_path = log_dir / f"build-all_{ts}.log"
        file_handler = logging.FileHandler(_log_file_path, encoding="utf-8")
        file_handler.setFormatter(logging.Formatter("%(message)s"))
    except OSError as exc:
        # Si no se puede crear el directorio de logs, seguimos sin archivo
        print(f"  ⚠ No se pudo crear directorio de logs {log_dir}: {exc}")
        file_handler = None

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(logging.Formatter("%(message)s"))

    _logger = logging.getLogger("build_all")
    _logger.setLevel(logging.DEBUG)
    _logger.addHandler(console_handler)
    if file_handler:
        _logger.addHandler(file_handler)
        _logger.info(f"  📝 Log → {_log_file_path}")


def log(msg: str) -> None:
    if _logger is not None:
        _logger.info(f"  {msg}")
    else:
        print(f"  {msg}")


def run(cmd: list[str], cwd: Path | None = None, env: dict | None = None) -> tuple[int, str, str]:
    """
    Ejecuta un comando y retorna (returncode, stdout, stderr).
    stdout y stderr se capturan por separado y se combinan en el output
    para diagnóstico — soluciona el problema de scripts bash que redirigen
    stderr al log file, dejando run() con stderr vacío.

    Se fuerza UTF-8 explícitamente para evitar UnicodeDecodeError en Windows
    cuando subprocesos (ej: PowerShell con OutputEncoding=UTF8) emiten
    caracteres que cp1252 no puede decodificar.
    errors="replace" como red de seguridad ante bytes inválidos residuales.
    """
    proc = subprocess.run(
        cmd,
        cwd=cwd,
        env=env,                        # ← None = heredar entorno del padre
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,   # ← merge stderr→stdout
        encoding="utf-8",           # ← forzar UTF-8 (evita cp1252 en Windows)
        errors="replace",           # ← reemplazar bytes inválidos en lugar de crashear
    )
    return proc.returncode, proc.stdout.strip(), ""


def run_streaming(
    cmd: list[str],
    cwd: Path | None = None,
    env: dict | None = None,
) -> tuple[int, str]:
    """
    Ejecuta un comando escribiendo cada línea al log en tiempo real (streaming).
    Úsalo para procesos largos como electron-builder / npm / bash donde el
    silencio hace imposible distinguir entre "trabajando" y "colgado".
    Hace flush del logger en cada línea para que el archivo de log se actualice
    en tiempo real y no quede truncado si el proceso muere.
    Retorna (returncode, output_completo).
    """
    proc = subprocess.Popen(
        cmd,
        cwd=cwd,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        encoding="utf-8",
        errors="replace",
    )
    lines: list[str] = []
    assert proc.stdout is not None
    for raw_line in proc.stdout:
        line = raw_line.rstrip()
        lines.append(line)
        log(line)
        # Flush explícito para que el FileHandler escriba al disco en tiempo real
        if _logger:
            for handler in _logger.handlers:
                handler.flush()
    proc.wait()
    return proc.returncode, "\n".join(lines)


# ─────────────────────────────────────────────────────────────────────────────
# CORRECCIÓN 4 — build_brain(): seleccionar PowerShell vs bash
# ─────────────────────────────────────────────────────────────────────────────

def build_brain() -> StepResult:
    brain_script = BUILDS["brain"]
    if not brain_script or not brain_script.exists():
        return StepResult("Brain", False, error=f"Script no encontrado: {brain_script}")

    # Garantizar que existen build_number.txt / .windows.txt / .darwin.txt en brain/
    _ensure_build_number_files(_BUILD_NUMBER_DIRS["brain"], "brain")

    # Garantizar que el directorio de output existe antes de compilar
    brain_out = _DEV_BIN_BASE / "brain"
    brain_out.mkdir(parents=True, exist_ok=True)

    if IS_WINDOWS:
        log("Ejecutando brain.ps1 ...")
        cmd = [
            "powershell",
            "-ExecutionPolicy", "Bypass",
            "-NonInteractive",
            "-File", brain_script.name,
        ]
        # CI/TERM: evita Clear-Host y secuencias ANSI en subprocess
        # BLOOM_PROJECT_ROOT: build.py lo usa para resolver rutas cuando corre
        #   dentro de Start-Job de PowerShell con cwd distinto a la raiz del repo
        env = {**os.environ, "CI": "1", "TERM": "dumb", "BLOOM_PROJECT_ROOT": str(ROOT)}
    else:
        log("Ejecutando build-brain.sh ...")
        cmd = ["bash", brain_script.name]
        env = {**os.environ, "BLOOM_PROJECT_ROOT": str(ROOT)}

    code, out = run_streaming(cmd, cwd=brain_script.parent, env=env)
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

    Después de la compilación, recolecta el log individual escrito por
    build-component.bat/.sh y lo appendea al log central de build-all.py,
    de modo que todos los logs queden en NUCLEUS_HOME/logs/build/.
    """
    script_path = BUILDS[component]
    if not script_path or not script_path.exists():
        return StepResult(
            component.capitalize(), False,
            error=f"Script no encontrado: {script_path}"
        )

    log(f"Compilando {component} con {script_path.name} ...")

    env = inject_build_number_env(component)

    if IS_WINDOWS:
        cmd = ["cmd", "/c", script_path.name, component]
    else:
        cmd = ["bash", script_path.name, component]

    code, out, _ = run(cmd, cwd=script_path.parent, env=env)

    # ── Recolectar log individual del bat/sh y copiarlo a logs/build/ ──
    # build-component.bat escribe a LOCALAPPDATA\BloomNucleus\logs\build\<comp>_build.log
    # build-component.sh  escribe al mismo path equivalente en la plataforma.
    component_log_src = NUCLEUS_HOME / "logs" / "build" / f"{component}_build.log"
    if component_log_src.exists() and _log_file_path:
        try:
            comp_content = component_log_src.read_text(encoding="utf-8", errors="replace")
            separator = f"\n{'─'*60}\n  LOG INDIVIDUAL: {component}_build.log\n{'─'*60}\n"
            with _log_file_path.open("a", encoding="utf-8") as f:
                f.write(separator)
                f.write(comp_content)
            log(f"  📎 Log de {component} appendeado desde {component_log_src.name}")
        except OSError as exc:
            log(f"  ⚠ No se pudo leer {component_log_src}: {exc}")

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
    env = inject_build_number_env("host")
    code, out = run_streaming(["bash", host_script.name], cwd=host_script.parent, env=env)
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
    Para Conductor, actualiza build_info.json con el build number efectivo
    antes de invocar npm, de modo que el empaquetado Electron incluya el número correcto.
    """
    if not project_dir.exists():
        return StepResult(name, False, error=f"Directorio no encontrado: {project_dir}")

    pkg_json = project_dir / "package.json"
    if not pkg_json.exists():
        return StepResult(name, False, error=f"package.json no encontrado en: {project_dir}")

    # Para Conductor: parchear build_info.json con el build number de plataforma
    # antes de lanzar el build de npm.
    env = {**os.environ}
    if name == "Conductor":
        build_num = resolve_build_number("conductor") if "conductor" in _BUILD_NUMBER_DIRS else None
        # Garantizar archivos de versionado en workspace/ y setup/
        _ensure_build_number_files(_BUILD_NUMBER_DIRS["conductor"], "conductor")
        _ensure_build_number_files(_BUILD_NUMBER_DIRS["conductor_setup"], "conductor_setup")
        # conductor usa installer/conductor/workspace/build_info.json
        # y también installer/conductor/setup/build_info.json
        for rel in ("workspace/build_info.json", "setup/build_info.json"):
            bi_path = project_dir / rel
            if bi_path.exists():
                try:
                    data = json.loads(bi_path.read_text(encoding="utf-8"))
                    if build_num is not None:
                        data["buildNumber"] = build_num
                        bi_path.write_text(
                            json.dumps(data, indent=2, ensure_ascii=False),
                            encoding="utf-8",
                        )
                        log(f"  build_info.json [{rel}] → buildNumber={build_num}")
                except Exception as exc:
                    log(f"  ⚠ No se pudo parchear {rel}: {exc}")
        if build_num is not None:
            env["BLOOM_BUILD_NUMBER"] = str(build_num)

    log(f"Ejecutando npm run {npm_script} en {project_dir.name}/ ...")
    cmd = [_NPM, "run", npm_script]
    code, out = run_streaming(cmd, cwd=project_dir, env=env)
    if code != 0:
        tail = "\n".join(out.splitlines()[-20:]) if out else "(sin output)"
        return StepResult(name, False, error=tail)
    return StepResult(name, True, output=out)


def build_cortex() -> StepResult:
    """
    Cortex: ejecuta package.py con python3, no con bash.
    El script está en installer/cortex/build-cortex/package.py.

    BUILDS["cortex"] debe apuntar a installer/cortex/build-cortex/,
    pero como resguardo también se busca en installer/cortex/build-cortex/
    relativo a la raíz si BUILDS["cortex"] apunta un nivel más arriba.
    """
    cortex_dir = BUILDS["cortex"]

    # Candidatos en orden de preferencia
    candidates: list[Path] = []
    if cortex_dir is not None:
        candidates.append(cortex_dir / "package.py")               # correcto: build-cortex/package.py
        candidates.append(cortex_dir / "build-cortex" / "package.py")  # resguardo: apunta a cortex/
    # Siempre agregar la ruta canónica desde ROOT como último recurso
    candidates.append(ROOT / "installer" / "cortex" / "build-cortex" / "package.py")

    package_py: Path | None = None
    for candidate in candidates:
        if candidate.exists():
            package_py = candidate
            break

    if package_py is None:
        checked = "\n    ".join(str(c) for c in candidates)
        return StepResult(
            "Cortex", False,
            error=(
                f"package.py no encontrado. Paths verificados:\n    {checked}\n"
                f"  Verificá que BUILDS['cortex'] apunte al directorio que contiene package.py.\n"
                f"  Valor actual: {cortex_dir}"
            ),
        )

    log(f"Ejecutando python3 {package_py.name} ...")
    env = inject_build_number_env("cortex")

    # --source: raíz de la Chrome Extension (donde está manifest.json)
    # --output: carpeta de destino del .blx en el bin base
    cortex_source = ROOT / "installer" / "cortex" / "extension"
    # bloom-cortex.blx es multiplataforma (ZIP), va en bin/cortex/ sin subfolder de arquitectura
    cortex_output = ROOT / "installer" / "native" / "bin" / "cortex"
    cortex_output.mkdir(parents=True, exist_ok=True)

    cmd = [
        sys.executable, package_py.name,
        "--source", str(cortex_source),
        "--output", str(cortex_output),
    ]
    code, out, _ = run(cmd, cwd=package_py.parent, env=env)
    if code != 0:
        tail = "\n".join(out.splitlines()[-20:]) if out else "(sin output)"
        return StepResult("Cortex", False, error=tail)
    return StepResult("Cortex", True, output=out)


def build_bootstrap() -> StepResult:
    """
    Bootstrap: cuatro pasos en orden:
      1. version-bootstrap.py  — incrementa build_number en bootstrap.meta.json
      2. npm run compile        — compila TypeScript → out/  (requerido por esbuild)
      3. npm run build:bundle   — genera installer/native/bin/bootstrap/bundle.js
      4. copiar static/         — assets estáticos (swagger-ui, etc.) junto al bundle
    """
    bootstrap_dir = BUILDS["bootstrap"]
    script_py     = bootstrap_dir / "version-bootstrap.py"     # type: ignore[operator]

    if not script_py.exists():
        return StepResult("Bootstrap", False,
                          error=f"version-bootstrap.py no encontrado en: {bootstrap_dir}")

    # Paso 1: versionar
    log("Paso 1/4: Incrementando build number ...")
    cmd = [sys.executable, script_py.name]
    code, out, _ = run(cmd, cwd=script_py.parent)
    if code != 0:
        tail = "\n".join(out.splitlines()[-20:]) if out else "(sin output)"
        return StepResult("Bootstrap", False, error=f"version-bootstrap.py falló:\n{tail}")

    # Paso 2: compilar TypeScript (bundle.js depende de out/)
    log("Paso 2/4: Compilando TypeScript (npm run compile) ...")
    cmd2 = [_NPM, "run", "compile"]
    code2, out2 = run_streaming(cmd2, cwd=ROOT)
    if code2 != 0:
        tail = "\n".join(out2.splitlines()[-20:]) if out2 else "(sin output)"
        return StepResult("Bootstrap", False, error=f"npm run compile falló:\n{tail}")

    # Paso 3: generar bundle.js
    log("Paso 3/4: Generando bundle.js (npm run build:bundle) ...")
    cmd3 = [_NPM, "run", "build:bundle"]
    code3, out3 = run_streaming(cmd3, cwd=ROOT)
    if code3 != 0:
        tail = "\n".join(out3.splitlines()[-20:]) if out3 else "(sin output)"
        return StepResult("Bootstrap", False, error=f"npm run build:bundle falló:\n{tail}")

    bundle_path = ROOT / "installer/native/bin/bootstrap/bundle.js"
    size_kb = f"{bundle_path.stat().st_size / 1024:.1f} KB" if bundle_path.exists() else "no encontrado"

    # Paso 4: copiar assets estáticos junto al bundle
    import shutil
    log("Paso 4/4: Copiando assets estáticos ...")
    static_src  = ROOT / "installer" / "bootstrap" / "static"
    static_dest = ROOT / "installer" / "native" / "bin" / "bootstrap" / "static"
    if static_src.exists():
        shutil.copytree(static_src, static_dest, dirs_exist_ok=True)
        log(f"  static/ → {static_dest}")
    else:
        log(f"  ⚠ {static_src} no encontrado — swagger-ui puede fallar en runtime")

    return StepResult("Bootstrap", True, output=f"bundle.js → {size_kb}")


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
    log("")
    log(_sep("═"))
    log(title)
    log(_sep("═"))


def _step_header(n: int, total: int, name: str) -> None:
    log("")
    log(_sep())
    log(f"[{n}/{total}] {name}")
    log(_sep())


def _print_result(result: StepResult) -> None:
    if result.skipped:
        log(f"⊘  SKIP — {result.skip_reason}")
    elif result.ok:
        log("✅ OK")
    else:
        log("❌ FAILED")
        if result.error:
            for line in result.error.splitlines()[-15:]:
                log(f"   {line}")


def _print_summary(results: list[StepResult]) -> None:
    log("")
    log(_sep("═"))
    log("RESUMEN DEL BUILD")
    log(_sep("═"))

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

        log(f"{icon}  {r.name:<20} {detail}")

    log("")
    log(f"OK: {ok_count}  |  Skipped: {skip_count}  |  Failed: {failed_count}")
    log(_sep("═"))

    if _log_file_path:
        log(f"📄 Log guardado en: {_log_file_path}")

    if failed_count > 0:
        log("")
        log("⚠️  El build terminó con errores.")
        sys.exit(1)
    else:
        log("")
        log("🎉 Build completo.")


# ─────────────────────────────────────────────────────────────────────────────
# ARGPARSE — soporte para --only y --skip
# ─────────────────────────────────────────────────────────────────────────────

ALL_STEP_NAMES = [
    "brain", "host", "nucleus", "sentinel", "metamorph",
    "sensor", "conductor", "conductor_pkg", "cortex", "bootstrap", "vsix",
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
# build_conductor_package — electron-builder en setup/ y workspace/
# Genera el instalador nativo: .exe en Windows, .dmg en macOS.
# Se ejecuta DESPUÉS de conductor (build:all) para que el código esté compilado.
# ─────────────────────────────────────────────────────────────────────────────

def build_conductor_package() -> StepResult:
    """
    Ejecuta el script de packaging nativo en installer/conductor/setup/
    y installer/conductor/workspace/.
    - macOS: npm run build:darwin
    - Windows: npm run build  (build:win64)
    """
    conductor_root = ROOT / "installer" / "conductor"
    targets = [
        conductor_root / "setup",
        conductor_root / "workspace",
    ]

    npm_script = "build:darwin" if IS_MACOS else "build"

    env = {**os.environ}
    build_num = resolve_build_number("conductor") if "conductor" in _BUILD_NUMBER_DIRS else None
    if build_num is not None:
        env["BLOOM_BUILD_NUMBER"] = str(build_num)

    all_output: list[str] = []

    for target in targets:
        if not target.exists():
            log(f"  ⚠ Directorio no encontrado, saltando: {target.name}/")
            continue

        pkg_json = target / "package.json"
        if not pkg_json.exists():
            log(f"  ⚠ package.json no encontrado en {target.name}/, saltando")
            continue

        log(f"Ejecutando npm run {npm_script} en {target.name}/ ...")
        cmd = [_NPM, "run", npm_script]
        code, out = run_streaming(cmd, cwd=target, env=env)
        all_output.append(out)

        if code != 0:
            tail = "\n".join(out.splitlines()[-20:]) if out else "(sin output)"
            return StepResult(
                "ConductorPkg", False,
                error=f"npm run {npm_script} falló en {target.name}/:\n{tail}"
            )

        log(f"✅ package completado en {target.name}/")

    return StepResult("ConductorPkg", True, output="\n".join(all_output))


# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────

def main() -> None:
    args = _parse_args()
    _setup_logger()

    _header(
        f"BloomNucleus — Build Orchestrator\n"
        f"  Platform : {sys.platform}  ({_platform.machine()})\n"
        f"  Bin base : {_DEV_BIN_BASE}"
    )

    # Mostrar build numbers efectivos para la plataforma actual
    log(f"Build numbers ({_PLATFORM_SUFFIX}):")
    for comp in ("nucleus", "sentinel", "metamorph", "sensor", "host", "cortex", "conductor"):
        if comp == "cortex":
            # Cortex gestiona su propio build number en cortex.meta.json (no en .txt)
            meta_path = _BUILD_NUMBER_DIRS["cortex"] / "cortex.meta.json"
            try:
                meta_data = json.loads(meta_path.read_text(encoding="utf-8"))
                cortex_build = meta_data.get("build_number", "?")
            except (FileNotFoundError, json.JSONDecodeError):
                cortex_build = "?"
            log(f"  {comp:<12} {cortex_build}")
            continue
        scripts_dir = _BUILD_NUMBER_DIRS.get(comp)
        if scripts_dir:
            base   = _read_int(scripts_dir / "build_number.txt", 0)
            offset = _read_int(scripts_dir / f"build_number.{_PLATFORM_SUFFIX}.txt", 0)
            effective = base + offset
            offset_str = f"  (+{offset} {_PLATFORM_SUFFIX})" if offset else ""
            log(f"  {comp:<12} {effective}{offset_str}")
    log("")

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
        ("conductor",     "Conductor",    lambda: build_node("Conductor", BUILDS["conductor"], "build:all")),  # type: ignore[arg-type]
        # ConductorPkg: electron-builder en setup/ y workspace/ → genera .dmg / .exe
        ("conductor_pkg", "ConductorPkg", build_conductor_package),
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
        log("⚠️  No hay pasos que ejecutar con los filtros indicados.")
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
