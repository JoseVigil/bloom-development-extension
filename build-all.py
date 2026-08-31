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
  python3 build-all.py --only workspace  # solo Conductor/workspace
  python3 build-all.py --skip host       # saltar host (C++)
"""

from __future__ import annotations

import argparse
import datetime
import json
import logging
import os
import platform as _platform
import shutil
import subprocess
import sys
import textwrap
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable
from scripts.capture_versions import capture_versions

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
    "cortex":     ROOT / "installer/cortex/build-cortex",
    "workspace":  ROOT / "installer/conductor/workspace",  # usa build_info.json, no .txt
    "setup":      ROOT / "installer/conductor/setup",      # instalador de Conductor
    "brain":      ROOT / "brain",                          # build_number.txt en brain/
}


def _read_int(path: Path, default: int = 0) -> int:
    """Lee un entero de un archivo de texto. Retorna default si no existe o es inválido."""
    try:
        return int(path.read_text(encoding="utf-8").strip())
    except (FileNotFoundError, ValueError):
        return default


def _increment_build_number(component: str) -> None:
    """
    Incrementa build_number.txt en 1 para el componente dado.
    Es la fuente de verdad del conteo — debe llamarse UNA vez por build,
    antes de inject_build_number_env(), para que el número efectivo
    ya refleje el valor nuevo.

    Solo toca build_number.txt (base). Los archivos de offset de plataforma
    (build_number.darwin.txt, build_number.windows.txt) los edita el operador
    manualmente para separar rangos; no se auto-incrementan.
    """
    scripts_dir = _BUILD_NUMBER_DIRS.get(component)
    if scripts_dir is None:
        return
    # Garantizar que los archivos existen antes de intentar leer/escribir
    _ensure_build_number_files(scripts_dir, component)
    base_file = scripts_dir / "build_number.txt"
    current = _read_int(base_file, default=0)
    new_val = current + 1
    try:
        base_file.write_text(str(new_val), encoding="utf-8")
        log(f"  🔢 build_number [{component}]: {current} → {new_val}")
    except OSError as exc:
        log(f"  ⚠ No se pudo incrementar build_number para {component}: {exc}")


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

    # workspace/setup usan build_info.json y brain usa solo archivos de plataforma — no crear build_number.txt base
    if component not in ("workspace", "setup", "brain"):
        base_file = scripts_dir / "build_number.txt"
        if not base_file.exists():
            base_file.write_text("0", encoding="utf-8")
            try:
                rel = base_file.relative_to(ROOT)
            except ValueError:
                rel = base_file
            log(f"  📄 Creado {rel} (valor inicial: 0)")

    for platform_suffix in ("windows", "darwin", "linux"):
        offset_file = scripts_dir / f"build_number.{platform_suffix}.txt"
        if not offset_file.exists():
            offset_file.write_text("0", encoding="utf-8")
            try:
                rel = offset_file.relative_to(ROOT)
            except ValueError:
                rel = offset_file
            log(f"  📄 Creado {rel} (offset inicial: 0)")


def _ensure_cortex_meta(meta_path: Path) -> None:
    """
    Garantiza que cortex.meta.json existe antes de invocar package.py.

    Está gitignoreado (build state por máquina, mismo criterio que
    build_number.txt) así que un clon nuevo del repo no lo trae — package.py
    no tiene lógica de auto-creación y falla duro (fail(f"{META_FILENAME}
    not found at {meta_path}")) si no existe. Mismo patrón que
    _ensure_build_number_files(): crear con defaults sensatos si falta.
    """
    if meta_path.exists():
        return
    meta_path.parent.mkdir(parents=True, exist_ok=True)
    default = {
        "name": "Bloom Cortex",
        "version": "1.0.0",
        "build_number": 0,
        "build_date": datetime.datetime.now().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "release_channel": "stable",
        "min_chrome_version": "120",
    }
    meta_path.write_text(json.dumps(default, indent=2), encoding="utf-8")
    log(f"  📄 Creado {meta_path.relative_to(ROOT)} (build_number inicial: 0)")


def _ensure_bootstrap_meta(meta_path: Path) -> None:
    """
    Garantiza que bootstrap.meta.json existe antes de invocar version-bootstrap.py.
    Mismo motivo y mismo patrón que _ensure_cortex_meta().
    """
    if meta_path.exists():
        return
    meta_path.parent.mkdir(parents=True, exist_ok=True)
    default = {
        "name": "Bloom Bootstrap",
        "info": "Bootstrap runtime for the Bloom VS Code extension. Loads and "
                "initializes the extension's Node.js environment inside the "
                "Nucleus service, acting as the bridge between the VS Code "
                "plugin and the Bloom backend.",
        "version": "1.0.0",
        "build_number": 0,
        "build_date": datetime.datetime.now().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "files": ["bundle.js", "bundle.js.map", "server-bootstrap.js"],
    }
    meta_path.write_text(json.dumps(default, indent=2), encoding="utf-8")
    log(f"  📄 Creado {meta_path.relative_to(ROOT)} (build_number inicial: 0)")


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
            Path.home() / "Library" / "BloomNucleus"
        ))
    else:  # Linux
        xdg = os.environ.get("XDG_DATA_HOME", str(Path.home() / ".local/share"))
        return Path(os.environ.get("BLOOM_NUCLEUS_HOME", Path(xdg) / "BloomNucleus"))


def _exe(stem: str) -> str:
    """Retorna el nombre del ejecutable con extensión correcta para la plataforma."""
    return stem + (".exe" if IS_WINDOWS else "")


NUCLEUS_HOME = _resolve_nucleus_home()
NUCLEUS_EXE  = NUCLEUS_HOME / "bin" / "nucleus" / _exe("nucleus")
METAMORPH_EXE = NUCLEUS_HOME / "bin" / "metamorph" / _exe("metamorph")


# ─────────────────────────────────────────────────────────────────────────────
# CORRECCIÓN 2 — _DEV_BIN_BASE: detectar arquitectura en macOS y Linux
# ─────────────────────────────────────────────────────────────────────────────

def _get_dev_bin_base() -> Path:
    if IS_WINDOWS:
        return ROOT / "installer/native/bin/win64"
    elif IS_MACOS:
        arch = _platform.machine()  # 'arm64' o 'x86_64'
        folder = "darwin_arm64" if arch == "arm64" else "darwin_x64"
        return ROOT / "installer/native/bin" / folder
    else:  # Linux
        arch = _platform.machine()  # 'x86_64', 'aarch64', 'arm64'
        folder = "linux_arm64" if arch in ("aarch64", "arm64") else "linux_x64"
        return ROOT / "installer/native/bin" / folder


_DEV_BIN_BASE  = _get_dev_bin_base()
_PROD_BIN_BASE = NUCLEUS_HOME / "bin"


# ─────────────────────────────────────────────────────────────────────────────
# CORRECCIÓN 3 — BUILDS: seleccionar .bat vs .sh por plataforma
# ─────────────────────────────────────────────────────────────────────────────

def _build_script_dir() -> Path:
    """Carpeta de scripts de build para la plataforma actual."""
    if IS_WINDOWS: return ROOT / "builds" / "windows"
    return             ROOT / "builds" / "unix"


_BUILD_DIR = _build_script_dir()

# npm / node: usar "npm.cmd" en Windows, "npm" en unix
_NPM = "npm.cmd" if IS_WINDOWS else "npm"

BUILDS: dict[str, Path | None] = {
    # Brain: PowerShell en Windows, bash en macOS/Linux
    "brain": (
        ROOT / "builds/windows/brain.ps1"
        if IS_WINDOWS
        else ROOT / "builds/unix/build-brain.sh"
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
    r"""
    Retorna el directorio de logs bajo NUCLEUS_HOME, consistente en todas las
    plataformas con el resto de la aplicación:
      Windows  → %LOCALAPPDATA%\BloomNucleus\logs\build\
      macOS    → ~/Library/BloomNucleus/logs/build/
      Linux    → ~/.local/share/BloomNucleus/logs/build/
    """
    return NUCLEUS_HOME / "logs" / "build"


def _setup_logger() -> None:
    r"""
    Configura el logger dual: StreamHandler (consola) + FileHandler (disco).
    El archivo se crea en el directorio de logs de la plataforma con timestamp en el nombre:
      Windows  → %LOCALAPPDATA%\BloomNucleus\logs\build\
      macOS    → ~/Library/BloomNucleus/logs/build/
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
# STOP BRAIN — detiene cualquier instancia corriendo antes de reconstruir/rollear
#
# Motivo: build_brain() compila y rollout_component() copia el binario nuevo,
# pero si el Brain viejo sigue corriendo (gestionado por systemd --user en
# Linux, launchd en macOS, o nssm en Windows), el proceso viejo sigue vivo
# sirviendo el binario anterior desde memoria — rollout_component() ya
# documenta esto (línea "Text file busy" / unlink de inodo), pero solo evita
# el crash del copy, no hace que el proceso viejo se entere de que hay un
# binario nuevo, ni libera el puerto 5678 si algo necesita relanzarlo limpio.
#
# Sin este paso, cada `build-all.py` (completo o --only brain) deja corriendo
# una versión vieja de Brain en memoria, y cualquier intento posterior de
# levantar el servicio (reinstalación, restart manual) puede chocar contra
# el puerto que el proceso viejo nunca soltó — mismo síntoma que
# `Address already in use` documentado en brain-troubleshooting.md §0.
# ─────────────────────────────────────────────────────────────────────────────

def _resolve_nssm_exe() -> Path | None:
    """
    Resuelve la ruta a nssm.exe en Windows.

    shutil.which("nssm") no sirve en una instalación nueva: nssm nunca se
    agrega al PATH del sistema, solo se bundlea en el repo y se copia a
    NUCLEUS_HOME/bin/nssm/ recién durante la instalación (ver nssmExe en
    installer/conductor/shared/global_paths.js). Antes de eso — el caso
    exacto de build-all.py corriendo en una máquina Windows recién clonada —
    solo existe en installer/native/nssm/<arch>/nssm.exe.

    Orden de resolución:
      1. NUCLEUS_HOME/bin/nssm/nssm.exe          (ya instalado)
      2. installer/native/nssm/<arch>/nssm.exe   (bundleado en el repo, fuente)
      3. PATH del sistema                        (por si se instaló a mano)
    """
    installed = NUCLEUS_HOME / "bin" / "nssm" / "nssm.exe"
    if installed.exists():
        return installed

    arch = os.environ.get("PROCESSOR_ARCHITEW6432") or os.environ.get("PROCESSOR_ARCHITECTURE", "")
    platform_dir = "win64" if arch.upper() in ("AMD64", "ARM64") else "win32"
    bundled = ROOT / "installer" / "native" / "nssm" / platform_dir / "nssm.exe"
    if bundled.exists():
        return bundled

    found = shutil.which("nssm")
    return Path(found) if found else None


def _stop_running_brain_service() -> None:
    """
    Detiene cualquier instancia de Brain corriendo antes de reconstruir,
    para que build_brain() + rollout_component() partan de un estado limpio.

    Best-effort: si no hay nada corriendo (primer build en una máquina nueva,
    por ejemplo) no hay error — solo se loguea que no había nada que parar.
    No aborta el build si el stop falla; el build puede seguir igual, pero
    se deja constancia en el log para que quede visible en vez de silencioso.
    """
    log("  🛑 Deteniendo instancia de Brain en ejecución (si hay alguna) ...")

    stopped_via_service = False

    if IS_LINUX:
        # systemd --user es el mecanismo real confirmado en producción
        # (ver com.bloom.brain.service, Restart=on-failure, RestartSec=10).
        # --quiet evita que systemctl devuelva error visible si el servicio
        # no existe o ya está detenido — eso es un estado válido, no un fallo.
        result = subprocess.run(
            ["systemctl", "--user", "stop", "com.bloom.brain"],
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            encoding="utf-8", errors="replace",
        )
        if result.returncode == 0:
            log("     systemd: com.bloom.brain detenido")
            stopped_via_service = True
        else:
            log("     systemd: com.bloom.brain no estaba activo o no existe como unit (ok)")

    elif IS_MACOS:
        # Label de launchd asumido por convención reverse-DNS (com.bloom.brain),
        # igual al nombre usado en Linux/systemd. Si el label real difiere,
        # este paso queda como no-op silencioso — no bloquea el build, pero
        # revisar el label exacto la primera vez que se confirme en macOS.
        result = subprocess.run(
            ["launchctl", "stop", "com.bloom.brain"],
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            encoding="utf-8", errors="replace",
        )
        if result.returncode == 0:
            log("     launchd: com.bloom.brain detenido")
            stopped_via_service = True
        else:
            log("     launchd: com.bloom.brain no estaba activo o no existe como label (ok)")

    elif IS_WINDOWS:
        # nssm es el gestor de servicios confirmado para Windows en el resto
        # del proyecto (ver nssm_service_check en nucleus_manager.js).
        # _resolve_nssm_exe() en vez de shutil.which("nssm"): en una instalación
        # nueva nssm no está en PATH, y llamar subprocess.run(["nssm", ...]) sin
        # resolver la ruta primero tira FileNotFoundError (WinError 2) sin
        # capturar, matando build-all.py entero (visto en máquina Windows nueva).
        nssm_bin = _resolve_nssm_exe()
        if nssm_bin:
            try:
                result = subprocess.run(
                    [str(nssm_bin), "stop", "com.bloom.brain"],
                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                    encoding="utf-8", errors="replace",
                )
                if result.returncode == 0:
                    log("     nssm: com.bloom.brain detenido")
                    stopped_via_service = True
                else:
                    log("     nssm: com.bloom.brain no estaba activo o no existe como servicio (ok)")
            except OSError as exc:
                log(f"     nssm: no se pudo ejecutar ({exc}) — se ignora, no es bloqueante")
        else:
            log("     nssm.exe no encontrado (ni instalado ni bundleado en el repo) — nada que detener")

    # Red de seguridad adicional para Linux/macOS: si además del servicio
    # gestionado quedó algún proceso suelto (levantado a mano con nohup,
    # por ejemplo — ver brain-troubleshooting.md Sección 4), lo liberamos
    # también. No se hace en Windows por no asumir fuser/lsof ahí.
    if IS_LINUX or IS_MACOS:
        subprocess.run(
            ["bash", "-c", "fuser -k 5678/tcp 2>/dev/null || true"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )

    # Race condition confirmada (ver brain-troubleshooting.md Sección 0):
    # SIGKILL no libera el socket instantáneamente — el kernel puede tardar
    # en soltar el puerto 5678 aunque el proceso ya no aparezca listado.
    # Sin esta espera, un build/rollout inmediatamente posterior que intente
    # relanzar Brain puede fallar con "Address already in use" aunque el
    # proceso viejo ya esté muerto.
    if stopped_via_service or (IS_LINUX or IS_MACOS):
        time.sleep(2)

    log("  ✅ Brain listo para reconstruirse desde estado limpio")


def _ensure_brain_python_deps() -> None:
    """
    Garantiza que brain/requirements.txt está instalado en el Python que va
    a correr brain/build_deploy/update_version.py (invocado por
    brain.ps1 / build-brain.sh dentro de build_brain()).

    Solo instala si falta algo — no corre pip install en cada build. Usa
    tomli_w como proxy: es la dependencia que rompió el build en una máquina
    Windows nueva (ver brain.build.log), y como todas se instalan juntas
    desde el mismo requirements.txt, si esa falta el resto tampoco están.
    """
    requirements = ROOT / "brain" / "requirements.txt"
    if not requirements.exists():
        return

    python_exe = shutil.which("python") or shutil.which("python3") or sys.executable
    check = subprocess.run(
        [python_exe, "-c", "import tomli_w"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    if check.returncode == 0:
        log("  brain: dependencias Python ya instaladas — skipping pip install")
        return

    log("  Instalando dependencias de brain/ (pip install -r requirements.txt) ...")
    code, out = run_streaming(
        [python_exe, "-m", "pip", "install", "-r", str(requirements)], cwd=ROOT
    )
    if code != 0:
        tail = "\n".join(out.splitlines()[-15:]) if out else "(sin output)"
        log(f"  ⚠ pip install de brain/requirements.txt falló (RC={code}):\n{tail}")
        log("  ⚠ El build de Brain probablemente va a fallar por dependencias faltantes.")
    else:
        log("  ✅ Dependencias de brain/ instaladas")

    # PyInstaller no está en requirements.txt a propósito: ese archivo se
    # vendorea a brain/libs/ para el runtime empaquetado (ver
    # install_python_deps.js), y PyInstaller es una herramienta de build, no
    # una dependencia del propio Brain. Nadie la instala si falta — build_main.py
    # asume "python -m PyInstaller" ya disponible y revienta con "No module
    # named PyInstaller" si no lo está (visto en máquina Windows nueva).
    check_pyinstaller = subprocess.run(
        [python_exe, "-c", "import PyInstaller"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    if check_pyinstaller.returncode == 0:
        log("  brain: PyInstaller ya instalado — skipping pip install")
        return

    log("  Instalando PyInstaller (herramienta de build, no va en requirements.txt) ...")
    code, out = run_streaming([python_exe, "-m", "pip", "install", "pyinstaller"], cwd=ROOT)
    if code != 0:
        tail = "\n".join(out.splitlines()[-15:]) if out else "(sin output)"
        log(f"  ⚠ pip install pyinstaller falló (RC={code}):\n{tail}")
        log("  ⚠ El build de Brain probablemente va a fallar por PyInstaller faltante.")
    else:
        log("  ✅ PyInstaller instalado")


def build_brain() -> StepResult:
    _ensure_brain_python_deps()

    brain_script = BUILDS["brain"]
    if not brain_script or not brain_script.exists():
        return StepResult("Brain", False, error=f"Script no encontrado: {brain_script}")

    # Garantizar que existen build_number.txt / .windows.txt / .darwin.txt en brain/
    _ensure_build_number_files(_BUILD_NUMBER_DIRS["brain"], "brain")

    # Incrementar y resolver build number antes de lanzar el script
    _increment_build_number("brain")
    brain_env = inject_build_number_env("brain")

    # Limpiar output anterior antes de compilar para que PyInstaller no
    # reutilice artefactos obsoletos (_internal/, módulos eliminados, etc.)
    brain_out = _DEV_BIN_BASE / "brain"
    if brain_out.exists():
        log(f"  🧹 Limpiando output anterior: {brain_out}")
        shutil.rmtree(brain_out)
    brain_out.mkdir(parents=True, exist_ok=True)

    if IS_WINDOWS:
        log("Ejecutando brain.ps1 ...")
        cmd = [
            "powershell",
            "-ExecutionPolicy", "Bypass",
            "-NonInteractive",
            "-File", brain_script.name,
        ]
        env = {**brain_env, "CI": "1", "TERM": "dumb", "BLOOM_PROJECT_ROOT": str(ROOT)}
    else:
        log("Ejecutando build-brain.sh ...")
        cmd = ["bash", brain_script.name]
        env = {**brain_env, "BLOOM_PROJECT_ROOT": str(ROOT)}

    code, out = run_streaming(cmd, cwd=brain_script.parent, env=env)

    # Appendear log individual de brain al log central (mismo patrón que build_go_component).
    # build-brain.sh escribe brain.build.log (sin arch) en ambas plataformas
    # para paridad de stream_id cross-platform.
    brain_log_src = NUCLEUS_HOME / "logs" / "build" / "brain.build.log"

    if brain_log_src.exists() and _log_file_path:
        try:
            comp_content = brain_log_src.read_text(encoding="utf-8", errors="replace")
            separator = f"\n{'─'*60}\n  LOG INDIVIDUAL: {brain_log_src.name}\n{'─'*60}\n"
            with _log_file_path.open("a", encoding="utf-8") as f:
                f.write(separator)
                f.write(comp_content)
            log(f"  📎 Log de brain appendeado desde {brain_log_src.name}")
        except OSError as exc:
            log(f"  ⚠ No se pudo leer {brain_log_src}: {exc}")
    else:
        log(f"  ⚠ Log individual de brain no encontrado en: {brain_log_src}")

    if code != 0:
        return StepResult("Brain", False, error=out)
    return StepResult("Brain", True, output=out)


# ─────────────────────────────────────────────────────────────────────────────
# STOP NUCLEUS — mismo problema que Brain (build_brain / rollout_component
# pueden dejar corriendo una versión vieja del binario), pero con un
# mecanismo de apagado distinto: Nucleus expone su propio comando nativo de
# shutdown gestionado ('nucleus service stop'), que apaga sus procesos hijos
# (temporal_server, nucleus_worker, brain_server si fue adoptado por el
# supervisor, control_plane_api) de forma prolija en vez de un kill directo.
#
# NOTA — hallazgo pendiente de resolver aparte (no bloquea este fix):
# el supervisor de Nucleus puede levantar su propio 'brain_server' como hijo
# (ver startBrainServer en service.go), independiente del unit systemd
# standalone 'com.bloom.brain' que ya cubre _stop_running_brain_service().
# Pueden coexistir dos caminos por los que Brain termina corriendo. Este fix
# no intenta resolver esa duplicidad — solo garantiza que Nucleus mismo (el
# proceso maestro y lo que él gestiona) se apague antes de reconstruirse.
# ─────────────────────────────────────────────────────────────────────────────

def _stop_running_nucleus_service() -> None:
    """
    Detiene la instancia de Nucleus Service corriendo (si hay alguna) antes
    de reconstruir o rollear el binario — mismo motivo que
    _stop_running_brain_service(): sin esto, el proceso viejo sigue vivo en
    memoria sirviendo el binario/código anterior aunque el nuevo ya esté en
    disco (ver comentario "Text file busy" en rollout_component()).

    Best-effort: no aborta el build si el stop falla o si no había nada
    corriendo — eso es un estado válido (primer build en una máquina nueva).
    """
    log("  🛑 Deteniendo instancia de Nucleus Service en ejecución (si hay alguna) ...")

    stopped_gracefully = False

    # Mecanismo primario: el comando nativo de shutdown gestionado. Preferido
    # sobre systemctl/kill porque apaga a los hijos gestionados de forma
    # prolija (Shutdown() en service.go) en vez de un corte abrupto.
    nucleus_bin = shutil.which("nucleus")
    if nucleus_bin:
        result = subprocess.run(
            [nucleus_bin, "--json", "service", "stop"],
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            encoding="utf-8", errors="replace",
        )
        if result.returncode == 0:
            log("     nucleus service stop: OK — procesos gestionados detenidos (temporal, worker, control_plane)")
            stopped_gracefully = True
        else:
            log("     nucleus service stop: no había servicio corriendo, o falló (ver detalle abajo si hace falta)")
    else:
        log("     'nucleus' no está en PATH todavía — probablemente primera instalación, nada que detener")

    # Red de seguridad: el proceso maestro (systemd --user en Linux).
    # NOTA: nombre de unit asumido por convención con com.bloom.brain
    # (com.bloom.nucleus) — no confirmado contra un .service real de Nucleus
    # como sí lo está el de Brain. Ajustar si el nombre real difiere.
    if IS_LINUX:
        result = subprocess.run(
            ["systemctl", "--user", "stop", "com.bloom.nucleus"],
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            encoding="utf-8", errors="replace",
        )
        if result.returncode == 0:
            log("     systemd: com.bloom.nucleus detenido")
            stopped_gracefully = True
        else:
            log("     systemd: com.bloom.nucleus no estaba activo o no existe como unit (ok)")
    elif IS_MACOS:
        result = subprocess.run(
            ["launchctl", "stop", "com.bloom.nucleus"],
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            encoding="utf-8", errors="replace",
        )
        if result.returncode == 0:
            stopped_gracefully = True
    elif IS_WINDOWS:
        nssm_bin = _resolve_nssm_exe()
        if nssm_bin:
            try:
                result = subprocess.run(
                    [str(nssm_bin), "stop", "com.bloom.nucleus"],
                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                    encoding="utf-8", errors="replace",
                )
                if result.returncode == 0:
                    stopped_gracefully = True
                else:
                    log("     nssm: com.bloom.nucleus no estaba activo o no existe como servicio (ok)")
            except OSError as exc:
                log(f"     nssm: no se pudo ejecutar ({exc}) — se ignora, no es bloqueante")
        else:
            log("     nssm.exe no encontrado (ni instalado ni bundleado en el repo) — nada que detener")

    # Misma race condition que con Brain (ver Sección 0 de
    # brain-troubleshooting.md): el kernel puede tardar en liberar sockets
    # tras el shutdown, aunque el proceso ya no aparezca listado.
    if stopped_gracefully:
        time.sleep(2)

    log("  ✅ Nucleus listo para reconstruirse desde estado limpio")


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
    de modo que todos los logs queden en el directorio de logs centralizado.
    """
    script_path = BUILDS[component]
    if not script_path or not script_path.exists():
        return StepResult(
            component.capitalize(), False,
            error=f"Script no encontrado: {script_path}"
        )

    log(f"Compilando {component} con {script_path.name} ...")

    # Incrementar build_number.txt antes de resolver el effective, de modo que
    # BLOOM_BUILD_NUMBER refleje el número nuevo en este build.
    _increment_build_number(component)

    # BUG FIX 2 — inyectar BLOOM_PROJECT_ROOT además de BLOOM_BUILD_NUMBER.
    # Sin esta variable, build-component.sh no puede resolver PROJECT_ROOT
    # correctamente cuando es invocado desde build-all.py (cwd = builds/unix/),
    # y cae al fallback cd "${SCRIPT_DIR}/../.." que puede apuntar a un path incorrecto.
    env = inject_build_number_env(component)
    env["BLOOM_PROJECT_ROOT"] = str(ROOT)

    if IS_WINDOWS:
        cmd = ["cmd", "/c", script_path.name, component]
    else:
        cmd = ["bash", script_path.name, component]

    code, out, _ = run(cmd, cwd=script_path.parent, env=env)

    # ── Recolectar log individual del bat/sh y appendearlo al log central ──
    # Tanto Windows (.bat) como Darwin (.sh) escriben <comp>_build.log sin arch,
    # alineados con el stream_id cross-platform <comp>_build en telemetry.json.
    component_log_src = NUCLEUS_HOME / "logs" / "build" / f"{component}_build.log"

    if component_log_src.exists() and _log_file_path:
        try:
            comp_content = component_log_src.read_text(encoding="utf-8", errors="replace")
            separator = f"\n{'─'*60}\n  LOG INDIVIDUAL: {component_log_src.name}\n{'─'*60}\n"
            with _log_file_path.open("a", encoding="utf-8") as f:
                f.write(separator)
                f.write(comp_content)
            log(f"  📎 Log de {component} appendeado desde {component_log_src.name}")
        except OSError as exc:
            log(f"  ⚠ No se pudo leer {component_log_src}: {exc}")
    else:
        log(f"  ⚠ Log individual no encontrado: {component_log_src}")

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
    _increment_build_number("host")
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

    # Para Setup/Workspace: parchear build_info.json con el build number de plataforma
    # antes de lanzar el build de npm.
    env = {**os.environ}
    if name in ("Setup", "Workspace"):
        comp_key = name.lower()  # "setup" o "workspace"
        # Incrementar antes de resolver para que build_info.json reciba el número nuevo
        _increment_build_number(comp_key)
        build_num = resolve_build_number(comp_key) if comp_key in _BUILD_NUMBER_DIRS else None
        # Garantizar archivos de versionado en workspace/ y setup/
        _ensure_build_number_files(_BUILD_NUMBER_DIRS["workspace"], "workspace")
        _ensure_build_number_files(_BUILD_NUMBER_DIRS["setup"], "setup")
        # parchear build_info.json del subproyecto correspondiente
        bi_path = project_dir / "build_info.json"
        if bi_path.exists():
            try:
                data = json.loads(bi_path.read_text(encoding="utf-8"))
                if build_num is not None:
                    data["buildNumber"] = build_num
                    bi_path.write_text(
                        json.dumps(data, indent=2, ensure_ascii=False),
                        encoding="utf-8",
                    )
                    log(f"  build_info.json [{project_dir.name}] → buildNumber={build_num}")
            except Exception as exc:
                log(f"  ⚠ No se pudo parchear build_info.json en {project_dir.name}: {exc}")
        if build_num is not None:
            env["BLOOM_BUILD_NUMBER"] = str(build_num)

    # Garantizar node_modules antes de correr el script.
    # Necesario para comandos que dependen de binarios locales (ej: vsce en VSIX)
    # que npm resuelve desde node_modules/.bin/ al ejecutar `npm run`.
    # Sin este paso, la primera ejecución en una máquina nueva falla con
    # "sh: 1: <comando>: not found" aunque el paquete esté en devDependencies.
    node_modules = project_dir / "node_modules"
    lock_file    = node_modules / ".package-lock.json"
    needs_install = (
        not node_modules.exists() or
        not lock_file.exists() or
        pkg_json.stat().st_mtime > lock_file.stat().st_mtime
    )
    if needs_install:
        log(f"Instalando dependencias de {project_dir.name}/ (npm install) ...")
        code_i, out_i = run_streaming([_NPM, "install"], cwd=project_dir, env=env)
        if code_i != 0:
            tail = "\n".join(out_i.splitlines()[-20:]) if out_i else "(sin output)"
            return StepResult(name, False, error=f"npm install en {project_dir.name}/ falló:\n{tail}")
        log(f"  {project_dir.name}/ node_modules instalados")
    else:
        log(f"{project_dir.name}/ node_modules up-to-date - skipping npm install")

    log(f"Ejecutando npm run {npm_script} en {project_dir.name}/ ...")

    if name == "VSIX":
        vsix_out_dir = ROOT / "installer" / "vscode"
        vsix_out_dir.mkdir(parents=True, exist_ok=True)
        log(f"  📁 Directorio de salida garantizado: {vsix_out_dir}")

    cmd = [_NPM, "run", npm_script]
    code, out = run_streaming(cmd, cwd=project_dir, env=env)
    if code != 0:
        tail = "\n".join(out.splitlines()[-20:]) if out else "(sin output)"
        return StepResult(name, False, error=tail)
    return StepResult(name, True, output=out)


import shutil as _shutil

# ─────────────────────────────────────────────────────────────────────────────
# ROLLOUT — copia de binarios desde _DEV_BIN_BASE a NUCLEUS_HOME/bin/
#
# No se usa `metamorph rollout` porque sus SourceFn en rollout.go asumen paths
# que no coinciden con donde build-component.sh y build-brain.sh dejan los
# binarios (ej: busca nucleus/dist/nucleus, pero el output real es
# installer/native/bin/darwin_x64/nucleus/nucleus).
#
# Se copia directamente desde _DEV_BIN_BASE/<comp>/ → NUCLEUS_HOME/bin/<comp>/
# para todos los componentes. Esto es independiente de rollout.go y siempre
# funciona sin importar cambios futuros en el script Go.
# ─────────────────────────────────────────────────────────────────────────────

def rollout_component(component: str) -> StepResult:
    """
    Copia _DEV_BIN_BASE/<component>/ → NUCLEUS_HOME/bin/<component>/.
    Reemplaza archivos existentes (dirs_exist_ok=True).
    """
    # Metamorph es el dueño del lifecycle productivo. Estos componentes no
    # deben duplicar aquí nombres de servicios, esperas ni reglas de restart.
    if component in {"nucleus", "brain", "sensor"}:
        metamorph_name = "metamorph.exe" if IS_WINDOWS else "metamorph"
        candidates = [
            NUCLEUS_HOME / "bin" / "metamorph" / metamorph_name,
            _DEV_BIN_BASE / "metamorph" / metamorph_name,
        ]
        metamorph_bin = next((path for path in candidates if path.exists()), None)
        if metamorph_bin is None:
            return StepResult(
                f"Rollout:{component}", False,
                error="Metamorph no está disponible para ejecutar el rollout administrado.",
            )
        env = os.environ.copy()
        env["BLOOM_REPO_ROOT"] = str(ROOT)
        log(f"Delegando rollout de {component} a Metamorph ...")
        code, out = run_streaming(
            [str(metamorph_bin), "rollout", "--only", component],
            cwd=ROOT,
            env=env,
        )
        if code != 0:
            return StepResult(f"Rollout:{component}", False, error=out)
        return StepResult(f"Rollout:{component}", True, output=out)

    src = _DEV_BIN_BASE / component
    dst = NUCLEUS_HOME / "bin" / component

    if not src.exists():
        return StepResult(
            f"Rollout:{component}", False,
            error=f"Output de '{component}' no encontrado en {src}. ¿Falló el build?",
        )

    log(f"Copiando {component}: {src} → {dst}")
    try:
        dst.mkdir(parents=True, exist_ok=True)

        # En Linux, sobreescribir un ejecutable en uso falla con [Errno 26] Text file busy.
        # La solucion estandar es unlink (borrar) el archivo destino antes de copiar:
        # el proceso que lo tiene abierto sigue usando el inodo viejo, y el nuevo
        # binario ocupa un inodo nuevo. Ambos coexisten sin conflicto hasta que
        # el proceso viejo termine.
        # En Windows y macOS esto no es necesario (copytree lo maneja solo).
        if IS_LINUX:
            for src_file in src.rglob("*"):
                if src_file.is_file():
                    dst_file = dst / src_file.relative_to(src)
                    if dst_file.exists():
                        try:
                            dst_file.unlink()
                        except OSError:
                            pass  # Si no se puede borrar, copytree fallara con el error real

        _shutil.copytree(src, dst, dirs_exist_ok=True)
    except OSError as exc:
        return StepResult(f"Rollout:{component}", False, error=f"Error copiando {component}: {exc}")

    copied = sum(1 for f in dst.rglob("*") if f.is_file())
    log(f"  ✅ {component}: {copied} archivo(s) → {dst}")
    return StepResult(f"Rollout:{component}", True, output=f"{copied} archivos → {dst}")


# ─────────────────────────────────────────────────────────────────────────────
# PATH — registro de usuario en Windows, archivos de shell en macOS/Linux
# ─────────────────────────────────────────────────────────────────────────────

_PATH_COMPONENTS    = ("metamorph", "brain", "nucleus", "sentinel")
_ZSHRC_MARKER_BEGIN = "# >>> BloomNucleus PATH (managed by build-all.py) >>>"
_ZSHRC_MARKER_END   = "# <<< BloomNucleus PATH <<<"


def _write_path_block(target_file: Path) -> None:
    path_lines = [
        f'export PATH="{NUCLEUS_HOME / "bin" / comp}:$PATH"'
        for comp in _PATH_COMPONENTS
    ]
    block = (
        f"{_ZSHRC_MARKER_BEGIN}\n"
        + "\n".join(path_lines)
        + f"\n{_ZSHRC_MARKER_END}\n"
    )
    try:
        current = target_file.read_text(encoding="utf-8") if target_file.exists() else ""
    except OSError as exc:
        log(f"  ⚠ No se pudo leer {target_file.name}: {exc}")
        return

    if _ZSHRC_MARKER_BEGIN in current:
        import re
        pattern = re.compile(
            rf"{re.escape(_ZSHRC_MARKER_BEGIN)}.*?{re.escape(_ZSHRC_MARKER_END)}\n?",
            re.DOTALL,
        )
        new_content = pattern.sub(block, current)
        verb = "actualizado"
    else:
        separator = "\n" if current and not current.endswith("\n") else ""
        new_content = current + separator + block
        verb = "añadido"

    try:
        target_file.write_text(new_content, encoding="utf-8")
        log(f"  ✅ PATH {verb} en ~/{target_file.name}")
    except OSError as exc:
        log(f"  ⚠ No se pudo escribir {target_file.name}: {exc}")


def _normalized_path_entry(value: str) -> str:
    """Normaliza una entrada de PATH para comparaciones idempotentes."""
    expanded = os.path.expandvars(value.strip().strip('"'))
    return os.path.normcase(os.path.normpath(expanded))


def _ensure_path_windows() -> None:
    """
    Registra los directorios de los CLI en el PATH del usuario de Windows.

    También actualiza el proceso actual para que los pasos posteriores de este
    mismo build puedan invocar los comandos sin abrir otra terminal.
    """
    import ctypes
    import winreg

    component_dirs = [str(NUCLEUS_HOME / "bin" / comp) for comp in _PATH_COMPONENTS]

    try:
        with winreg.CreateKeyEx(
            winreg.HKEY_CURRENT_USER,
            "Environment",
            0,
            winreg.KEY_QUERY_VALUE | winreg.KEY_SET_VALUE,
        ) as key:
            try:
                current_user_path, value_type = winreg.QueryValueEx(key, "Path")
            except FileNotFoundError:
                current_user_path, value_type = "", winreg.REG_EXPAND_SZ

            existing = [entry for entry in current_user_path.split(os.pathsep) if entry.strip()]
            managed = {_normalized_path_entry(entry) for entry in component_dirs}
            unmanaged = [
                entry for entry in existing
                if _normalized_path_entry(entry) not in managed
            ]
            updated_user_path = os.pathsep.join(component_dirs + unmanaged)

            if updated_user_path != current_user_path:
                if value_type not in (winreg.REG_SZ, winreg.REG_EXPAND_SZ):
                    value_type = winreg.REG_EXPAND_SZ
                winreg.SetValueEx(key, "Path", 0, value_type, updated_user_path)
                log("  ✅ PATH de usuario actualizado en Windows")
            else:
                log("  ✅ PATH de usuario ya estaba actualizado en Windows")
    except OSError as exc:
        log(f"  ⚠ No se pudo actualizar el PATH de usuario en Windows: {exc}")
        return

    # El registro solo afecta procesos nuevos. Actualizar este proceso permite
    # que el resto de build-all.py use inmediatamente los binarios desplegados.
    process_entries = [entry for entry in os.environ.get("PATH", "").split(os.pathsep) if entry.strip()]
    managed = {_normalized_path_entry(entry) for entry in component_dirs}
    process_unmanaged = [
        entry for entry in process_entries
        if _normalized_path_entry(entry) not in managed
    ]
    os.environ["PATH"] = os.pathsep.join(component_dirs + process_unmanaged)

    # Notificar a Explorer y otras aplicaciones que escuchan cambios de entorno.
    # Las terminales que ya estaban abiertas conservan su entorno anterior.
    try:
        result = ctypes.c_size_t()
        ctypes.windll.user32.SendMessageTimeoutW(
            0xFFFF,       # HWND_BROADCAST
            0x001A,       # WM_SETTINGCHANGE
            0,
            "Environment",
            0x0002,       # SMTO_ABORTIFHUNG
            5000,
            ctypes.byref(result),
        )
    except (AttributeError, OSError) as exc:
        log(f"  ⚠ PATH guardado, pero Windows no pudo recibir la notificación: {exc}")

    log("  📋 Entradas registradas:")
    for component_dir in component_dirs:
        log(f"     {component_dir}")
    log("  💡 Abrí una terminal nueva para usar los comandos fuera de este build.")


def _ensure_path_unix() -> None:
    path_lines = [
        f'export PATH="{NUCLEUS_HOME / "bin" / comp}:$PATH"'
        for comp in _PATH_COMPONENTS
    ]
    if IS_MACOS:
        _write_path_block(Path.home() / ".zshrc")
        _write_path_block(Path.home() / ".zshenv")
    else:  # Linux
        _write_path_block(Path.home() / ".bashrc")
        _write_path_block(Path.home() / ".bash_profile")
        # También escribir en .zshrc/.zshenv si el usuario usa zsh en Linux
        zshrc = Path.home() / ".zshrc"
        if zshrc.exists():
            _write_path_block(zshrc)
            _write_path_block(Path.home() / ".zshenv")
    log(f"  📋 Entradas registradas:")
    for p in path_lines:
        log(f"     {p}")
    log(f"  💡 Abrí una terminal nueva — los comandos estarán disponibles.")


def ensure_components_in_path() -> None:
    if IS_WINDOWS:
        _ensure_path_windows()
    else:
        _ensure_path_unix()


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

    _ensure_cortex_meta(package_py.parent / "cortex.meta.json")

    log(f"Ejecutando python3 {package_py.name} ...")
    _increment_build_number("cortex")
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
    Bootstrap: cinco pasos que dejan el resultado completo en installer/native/bin/bootstrap/.
    El rollout a NUCLEUS_HOME es un paso POSTERIOR y separado (rollout_bootstrap).

    Pasos:
      1. version-bootstrap.py  — incrementa build_number en bootstrap.meta.json
      2. npm run compile        — compila TypeScript → out/  (requerido por esbuild)
      3. npm run build:bundle   — el bundler escribe bundle.js en installer/native/bin/bootstrap/
      4. copiar static/         — assets estáticos desde installer/bootstrap/static/ al bin nativo
      5. copiar fuentes runtime — bootstrap.meta.json, server-bootstrap.js, VERSION, etc.
                                  desde installer/bootstrap/ al bin nativo

    Directorio de origen de fuentes : installer/bootstrap/
    Directorio de build (bin nativo): installer/native/bin/bootstrap/
    """
    import shutil

    bootstrap_src_dir = BUILDS["bootstrap"]                                    # installer/bootstrap/
    bootstrap_bin_dir = ROOT / "installer" / "native" / "bin" / "bootstrap"   # bin nativo (fijo, sin arch)
    script_py         = bootstrap_src_dir / "version-bootstrap.py"             # type: ignore[operator]

    if not script_py.exists():
        return StepResult("Bootstrap", False,
                          error=f"version-bootstrap.py no encontrado en: {bootstrap_src_dir}")

    _ensure_bootstrap_meta(bootstrap_src_dir / "bootstrap.meta.json")

    # Paso 0: garantizar node_modules en webview/app (Svelte dev server)
    # npm install solo corre si node_modules no existe o package.json es mas nuevo.
    # Sin esto, vite no se encuentra y el dev server falla con sh: vite: command not found.
    webview_app_dir = ROOT / "webview" / "app"
    webview_node_modules = webview_app_dir / "node_modules"
    webview_pkg = webview_app_dir / "package.json"
    if webview_pkg.exists():
        lock_file = webview_node_modules / ".package-lock.json"
        needs_install = (
            not webview_node_modules.exists() or
            not lock_file.exists() or
            webview_pkg.stat().st_mtime > lock_file.stat().st_mtime
        )
        if needs_install:
            log("Paso 0/5: Instalando dependencias de webview/app (npm install) ...")
            cmd0 = [_NPM, "install"]
            code0, out0 = run_streaming(cmd0, cwd=webview_app_dir)
            if code0 != 0:
                tail = "\n".join(out0.splitlines()[-20:]) if out0 else "(sin output)"
                return StepResult("Bootstrap", False, error=f"npm install en webview/app fallo:\n{tail}")
            log("  webview/app node_modules instalados")
        else:
            log("Paso 0/5: webview/app node_modules up-to-date - skipping npm install")
    else:
        log(f"Paso 0/5: webview/app/package.json no encontrado en {webview_app_dir} - skipping")

    # Paso 1: versionar (escribe bootstrap.meta.json en installer/bootstrap/)
    log("Paso 1/5: Incrementando build number ...")
    cmd = [sys.executable, script_py.name]
    code, out, _ = run(cmd, cwd=script_py.parent)
    if code != 0:
        tail = "\n".join(out.splitlines()[-20:]) if out else "(sin output)"
        return StepResult("Bootstrap", False, error=f"version-bootstrap.py falló:\n{tail}")

    # Paso 1.5: garantizar node_modules en ROOT (donde está tsconfig.json y @types/*)
    # npm install solo corre si node_modules no existe o package.json es más nuevo.
    # Sin esto, tsc falla con TS2688 (@types/node, @types/mocha, @types/vscode no encontrados)
    # en máquinas donde nunca se corrió npm install en la raíz (ej: primera migración a Linux).
    root_node_modules = ROOT / "node_modules"
    root_pkg          = ROOT / "package.json"
    if root_pkg.exists():
        root_lock = root_node_modules / ".package-lock.json"
        needs_root_install = (
            not root_node_modules.exists() or
            not root_lock.exists() or
            root_pkg.stat().st_mtime > root_lock.stat().st_mtime
        )
        if needs_root_install:
            log("Paso 1.5/5: Instalando dependencias de ROOT (npm install) ...")
            cmd_root = [_NPM, "install"]
            code_root, out_root = run_streaming(cmd_root, cwd=ROOT)
            if code_root != 0:
                tail = "\n".join(out_root.splitlines()[-20:]) if out_root else "(sin output)"
                return StepResult("Bootstrap", False, error=f"npm install en ROOT falló:\n{tail}")
            log("  ROOT node_modules instalados")
        else:
            log("Paso 1.5/5: ROOT node_modules up-to-date - skipping npm install")
    else:
        log(f"Paso 1.5/5: ROOT/package.json no encontrado en {ROOT} - skipping")

    # Paso 2: compilar TypeScript (bundle.js depende de out/)
    log("Paso 2/5: Compilando TypeScript (npm run compile) ...")
    cmd2 = [_NPM, "run", "compile"]
    code2, out2 = run_streaming(cmd2, cwd=ROOT)
    if code2 != 0:
        tail = "\n".join(out2.splitlines()[-20:]) if out2 else "(sin output)"
        return StepResult("Bootstrap", False, error=f"npm run compile falló:\n{tail}")

    # Paso 3: generar bundle.js → el bundler escribe directamente en bootstrap_bin_dir
    log("Paso 3/5: Generando bundle.js (npm run build:bundle) ...")
    cmd3 = [_NPM, "run", "build:bundle"]
    code3, out3 = run_streaming(cmd3, cwd=ROOT)
    if code3 != 0:
        tail = "\n".join(out3.splitlines()[-20:]) if out3 else "(sin output)"
        return StepResult("Bootstrap", False, error=f"npm run build:bundle falló:\n{tail}")

    bundle_path = bootstrap_bin_dir / "bundle.js"
    size_kb = f"{bundle_path.stat().st_size / 1024:.1f} KB" if bundle_path.exists() else "no encontrado"

    # Paso 4: copiar assets estáticos al bin nativo
    log("Paso 4/5: Copiando assets estáticos ...")
    static_src  = bootstrap_src_dir / "static"          # type: ignore[operator]
    static_dest = bootstrap_bin_dir / "static"
    if static_src.exists():
        shutil.copytree(static_src, static_dest, dirs_exist_ok=True)
        log(f"  static/ → {static_dest}")
    else:
        log(f"  ⚠ {static_src} no encontrado — swagger-ui puede fallar en runtime")

    # Paso 5: copiar archivos de runtime desde installer/bootstrap/ al bin nativo
    # Estos son los archivos que el bundler NO genera; viven en el directorio fuente
    # y deben estar presentes en el bin nativo para que el rollout a NUCLEUS_HOME
    # pueda copiar un directorio completo y autosuficiente.
    log("Paso 5/5: Copiando archivos de runtime al bin nativo ...")
    src_files = [
        ("bootstrap.meta.json",  False),   # metadata de versión (generado en paso 1)
        ("bundle.js.map",        False),   # sourcemap (puede no existir en CI)
        ("server-bootstrap.js",  True),    # crítico: requerido por bootControlPlane
        ("VERSION",              True),    # crítico: leído por nucleus en startup
        ("version-bootstrap.py", False),   # utilidad de versionado
    ]
    missing_critical: list[str] = []
    for fname, critical in src_files:
        src_f = bootstrap_src_dir / fname   # type: ignore[operator]
        dst_f = bootstrap_bin_dir / fname
        if src_f.exists():
            shutil.copy2(src_f, dst_f)
            log(f"  {fname} → {dst_f}")
        elif critical:
            log(f"  ❌ {fname} no encontrado en installer/bootstrap/ — REQUERIDO")
            missing_critical.append(fname)
        else:
            log(f"  ⚠ {fname} no encontrado en installer/bootstrap/ — omitido")

    if missing_critical:
        return StepResult(
            "Bootstrap", False,
            error=(
                f"Archivos críticos faltantes en {bootstrap_src_dir}:\n"
                + "\n".join(f"  • {f}" for f in missing_critical)
                + "\nVerificá que installer/bootstrap/ está completo en el repo."
            ),
        )

    built = sum(1 for f in bootstrap_bin_dir.rglob("*") if f.is_file())
    log(f"  ✅ bootstrap build: {built} archivo(s) → {bootstrap_bin_dir}")
    return StepResult("Bootstrap", True, output=f"bundle.js ({size_kb}) → {bootstrap_bin_dir}")


def rollout_bootstrap() -> StepResult:
    """
    Sincroniza installer/native/bin/bootstrap/ → NUCLEUS_HOME/bin/bootstrap/.

    Se llama automáticamente después de build_bootstrap() (igual que rollout_component
    para los componentes Go). El directorio nativo ya contiene todo: bundle.js,
    static/, server-bootstrap.js, VERSION, bootstrap.meta.json — no hay que volver
    a copiar desde installer/bootstrap/.

    Necesario porque bootControlPlane() en service.go busca el bundle en
    NUCLEUS_HOME/bin/bootstrap/bundle.js. Sin este paso el Control Plane
    (puertos 48215 y 4124) nunca levanta.

    Tras copiar, reinicia el proceso de Control Plane con
    'nucleus service restart-bootstrap' y espera a que reporte healthy — sin
    esto, un proceso Node viejo sigue sirviendo el bundle anterior desde
    memoria indefinidamente, porque Node no relee su propio archivo en disco
    mientras corre (ver PROCEDIMIENTO_ACTUALIZAR_BOOTSTRAP.md §1.5, caso real
    documentado: bundle.js zombie sirviendo :48215 varias horas después de
    haber sido reemplazado en disco).
    """
    import shutil

    bootstrap_bin_dir = ROOT / "installer" / "native" / "bin" / "bootstrap"
    bundle_dst_dir    = NUCLEUS_HOME / "bin" / "bootstrap"

    if not bootstrap_bin_dir.exists():
        return StepResult(
            "Rollout:Bootstrap", False,
            error=(
                f"Directorio de build no encontrado: {bootstrap_bin_dir}\n"
                "¿Corriste build_bootstrap() antes de rollout_bootstrap()?"
            ),
        )

    log(f"Copiando bootstrap: {bootstrap_bin_dir} → {bundle_dst_dir}")
    try:
        bundle_dst_dir.mkdir(parents=True, exist_ok=True)
        shutil.copytree(bootstrap_bin_dir, bundle_dst_dir, dirs_exist_ok=True)
        deployed = sum(1 for f in bundle_dst_dir.rglob("*") if f.is_file())
        log(f"  ✅ bootstrap: {deployed} archivo(s) → {bundle_dst_dir}")
    except OSError as exc:
        return StepResult("Rollout:Bootstrap", False, error=f"Rollout a NUCLEUS_HOME falló: {exc}")

    # Reiniciar y confirmar salud. Best-effort por diseño (igual criterio que
    # _stop_running_brain_service/_stop_running_nucleus_service): el archivo
    # ya está correctamente en disco en este punto — eso es lo que este paso
    # garantiza siempre. Que el proceso en memoria haya recogido el cambio es
    # una verificación adicional que no debería tirar abajo todo el pipeline
    # de build si falla, pero SÍ tiene que quedar visible como advertencia
    # explícita — no silenciosa (ver Invariante de Certificación: ninguna
    # dependencia puede degradar sin que el propio sistema lo señale).
    healthy, detail = _restart_bootstrap_and_wait_healthy()
    if not healthy:
        log(f"  ⚠️  {detail}")
        log("  ⚠️  El bundle nuevo está en disco, pero no se pudo confirmar que el proceso")
        log("      en memoria ya lo esté sirviendo. Reiniciar a mano: 'nucleus service restart-bootstrap'")
        return StepResult(
            "Rollout:Bootstrap", True,
            output=f"{deployed} archivo(s) → {bundle_dst_dir}  ⚠️ restart/health NO confirmado: {detail}",
        )

    return StepResult(
        "Rollout:Bootstrap", True,
        output=f"{deployed} archivo(s) → {bundle_dst_dir}, control_plane reiniciado y healthy",
    )


# ─────────────────────────────────────────────────────────────────────────────
# RESTART BOOTSTRAP — companion de rollout_bootstrap(). Distinto en forma a
# _stop_running_brain_service()/_stop_running_nucleus_service(): esos paran
# ANTES de compilar/rollear porque el destino es un binario con lock de
# ejecución (Text file busy en Linux). bundle.js es un archivo de datos que
# Node lee al iniciar, no tiene ese lock — sobreescribirlo mientras el
# proceso viejo corre no falla, solo lo deja sirviendo código desactualizado
# hasta que algo lo reinicie. Por eso acá el orden es copiar → reiniciar,
# no parar → copiar.
#
# Usa el comando escopado 'nucleus service restart-bootstrap' (documentado en
# PROCEDIMIENTO_ACTUALIZAR_BOOTSTRAP.md §4) en vez de
# _stop_running_nucleus_service(): ese último cascadea a TODO el servicio de
# Nucleus (temporal_server, nucleus_worker, brain_server, control_plane) —
# innecesario y desproporcionado para actualizar solo el bundle del Control
# Plane.
# ─────────────────────────────────────────────────────────────────────────────

def _restart_bootstrap_and_wait_healthy(timeout_seconds: int = 30) -> tuple[bool, str]:
    """
    Reinicia el Control Plane con 'nucleus service restart-bootstrap' y hace
    polling de 'nucleus --json health --component control_plane' hasta que
    reporte healthy o se agote el timeout.

    No levanta excepción — devuelve (healthy: bool, detail: str) para que el
    llamador decida cómo reportarlo. 'nucleus' ausente de PATH se trata como
    caso válido (primera instalación, nada que reiniciar todavía), no como
    error — mismo criterio que los otros dos stop helpers de este script.
    """
    nucleus_bin = shutil.which("nucleus")
    if not nucleus_bin:
        return False, "'nucleus' no está en PATH — probablemente primera instalación, nada que reiniciar"

    log("  🔄 Reiniciando Control Plane con el bundle nuevo (nucleus service restart-bootstrap) ...")
    result = subprocess.run(
        [nucleus_bin, "--json", "service", "restart-bootstrap"],
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        encoding="utf-8", errors="replace",
    )
    if result.returncode != 0:
        return False, f"restart-bootstrap devolvió código {result.returncode}: {(result.stdout or '').strip()[:300]}"

    deadline = time.time() + timeout_seconds
    last_output = ""
    while time.time() < deadline:
        health = subprocess.run(
            [nucleus_bin, "--json", "health", "--component", "control_plane"],
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            encoding="utf-8", errors="replace",
        )
        last_output = health.stdout or ""
        try:
            data = json.loads(last_output)
            # Tolerar tanto {"components": {"control_plane": {...}}} como
            # {"healthy": ..., "state": ...} directo, según cómo responda
            # --component a un solo componente.
            comp = data.get("components", {}).get("control_plane", data) if isinstance(data, dict) else {}
            if comp.get("healthy") is True or comp.get("state") == "RUNNING":
                log("  ✅ Control Plane reiniciado y healthy con el bundle nuevo")
                return True, "healthy"
        except (json.JSONDecodeError, AttributeError):
            pass
        time.sleep(1.5)

    return False, f"control_plane no reportó healthy tras {timeout_seconds}s. Último chequeo: {last_output.strip()[:300]}"


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


def _print_summary(results: list[StepResult]) -> int:
    """
    Imprime el resumen del build y retorna la cantidad de pasos fallidos.

    IMPORTANTE: no llama sys.exit() acá. La decisión de terminar el proceso
    con exit code != 0 se toma en main(), DESPUÉS de capture_versions() y
    sync_metamorph_manifest() — para que esos dos pasos de post-procesamiento
    corran siempre, incluso si algún componente del build (ej: VSIX) falló.
    Terminar el proceso acá adentro los salteaba por completo.
    """
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

    return failed_count


# ─────────────────────────────────────────────────────────────────────────────
# ARGPARSE — soporte para --only y --skip
# ─────────────────────────────────────────────────────────────────────────────

ALL_STEP_NAMES = [
    "parser", "brain", "host", "nucleus", "sentinel", "metamorph",
    "sensor", "setup", "workspace", "cortex", "bootstrap", "vsix",
]


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="BloomNucleus Build Orchestrator",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent(f"""
            Componentes disponibles: {', '.join(ALL_STEP_NAMES)}

            Ejemplos:
              python3 build-all.py
              python3 build-all.py --only parser
              python3 build-all.py --only nucleus
              python3 build-all.py --only workspace
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
# build_setup / build_workspace — electron-builder en setup/ y workspace/
# Genera el instalador nativo: .exe en Windows, .dmg en macOS.
# Cada paso corre npm install antes del build para garantizar dependencias.
# ─────────────────────────────────────────────────────────────────────────────

def _build_conductor_subproject(name: str, target: Path) -> StepResult:
    """
    npm install + npm run build:darwin (mac) / build (win) en un subdirectorio de conductor.
    name debe ser "Setup" o "Workspace" — se usa como clave lower() para _BUILD_NUMBER_DIRS.
    """
    if not target.exists():
        return StepResult(name, False, error=f"Directorio no encontrado: {target}")

    pkg_json = target / "package.json"
    if not pkg_json.exists():
        return StepResult(name, False, error=f"package.json no encontrado en: {target}")

    comp_key = name.lower()  # "setup" o "workspace"
    env = {**os.environ}

    # electron-builder auto-descarga winCodeSign (certs/herramientas de firma
    # de macOS) por default en CUALQUIER plataforma, incluso para --win puro
    # que nunca los va a usar. Ese .7z trae symlinks a .dylib de macOS, y
    # 7-Zip en Windows no puede crearlos sin SeCreateSymbolicLinkPrivilege
    # (falla con "Cannot create symbolic link: A required privilege is not
    # held by the client", visto en máquina Windows nueva sin Developer Mode).
    # No hace falta firmar para Mac en un build de Windows — apagar el
    # auto-discovery evita la descarga entera, no solo el síntoma.
    env["CSC_IDENTITY_AUTO_DISCOVERY"] = "false"

    build_num = resolve_build_number(comp_key) if comp_key in _BUILD_NUMBER_DIRS else None
    if build_num is not None:
        env["BLOOM_BUILD_NUMBER"] = str(build_num)

    # ── Limpiar outputs anteriores para evitar EEXIST en symlinks de electron-builder ──
    #
    # electron-builder copia .app completos (con symlinks internos de macOS como
    # Squirrel.framework/Resources) como extraResources. Si esos subdirectorios ya
    # existen de un build anterior, el intento de re-crear los symlinks falla con:
    #   EEXIST: file already exists, symlink 'Versions/Current/Resources' → ...
    #
    # Dos fuentes de symlinks residuales:
    #
    #   1. Output propio (darwin_x64/setup/ o darwin_x64/workspace/):
    #      Se limpia siempre para que electron-builder arranque con directorio vacío.
    #
    #   2. Conductor embebido en setup (darwin_x64/conductor/mac/ y mac-arm64/):
    #      setup/package.json incluye `darwin_${arch}/conductor` como extraResources.
    #      Ese directorio contiene subcarpetas mac/ y mac-arm64/ con .app completos.
    #      electron-builder los copia al output pero no puede sobreescribir sus
    #      symlinks si ya existen de builds previos del workspace/conductor.
    #      Se limpian solo esos subdirectorios .app — los .dmg quedan intactos.

    # 1) Limpiar output propio
    out_dir = _DEV_BIN_BASE / comp_key  # ej: native/bin/darwin_x64/setup
    if out_dir.exists():
        log(f"  🧹 Limpiando output anterior: {out_dir} ...")
        try:
            _shutil.rmtree(out_dir)
            log(f"  ✅ Output limpiado")
        except OSError as exc:
            log(f"  ⚠ No se pudo limpiar {out_dir}: {exc}")

    # 2) Si es setup en macOS: limpiar subcarpetas mac/ y mac-arm64/ del conductor
    #    fuente para evitar EEXIST al copiar los .app embebidos como extraResources.
    if IS_MACOS and comp_key == "setup":
        # Limpiar en todas las variantes de arquitectura que pueda haber buildeado workspace
        for arch_folder in ("darwin_x64", "darwin_arm64"):
            conductor_dir = ROOT / "installer" / "native" / "bin" / arch_folder / "conductor"
            for app_subdir in ("mac", "mac-arm64"):
                app_dir = conductor_dir / app_subdir
                if app_dir.exists():
                    log(f"  🧹 Limpiando .app del conductor: {app_dir} ...")
                    try:
                        _shutil.rmtree(app_dir)
                        log(f"  ✅ Limpiado")
                    except OSError as exc:
                        log(f"  ⚠ No se pudo limpiar {app_dir}: {exc}")

    # ── npm install ────────────────────────────────────────────────────────
    log(f"Ejecutando npm install en {target.name}/ ...")
    code, out = run_streaming([_NPM, "install"], cwd=target, env=env)
    if code != 0:
        tail = "\n".join(out.splitlines()[-20:]) if out else "(sin output)"
        return StepResult(name, False, error=f"npm install falló en {target.name}/:\n{tail}")

    # ── npm run build:darwin / build:linux / build:win ────────────────────
    if IS_MACOS:
        npm_script = "build:darwin"
    elif IS_LINUX:
        npm_script = "build:linux"
    else:
        npm_script = "build:win"
    log(f"Ejecutando npm run {npm_script} en {target.name}/ ...")
    code, out = run_streaming([_NPM, "run", npm_script], cwd=target, env=env)

    if _log_file_path:
        ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        individual_log = _log_file_path.parent / f"conductor_{target.name}_{ts}.log"
        try:
            individual_log.write_text(out, encoding="utf-8")
            log(f"  📄 Log guardado en: {individual_log.name}")
        except OSError as exc:
            log(f"  ⚠ No se pudo escribir log individual: {exc}")

    if code != 0:
        tail = "\n".join(out.splitlines()[-20:]) if out else "(sin output)"
        return StepResult(name, False, error=f"npm run {npm_script} falló en {target.name}/:\n{tail}")

    log(f"✅ package completado en {target.name}/")
    return StepResult(name, True, output=out)


def build_setup() -> StepResult:
    return _build_conductor_subproject("Setup", ROOT / "installer/conductor/setup")


def build_workspace() -> StepResult:
    return _build_conductor_subproject("Workspace", ROOT / "installer/conductor/workspace")


# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────

def _register_build_telemetry() -> None:
    """
    Registra los streams de build en telemetry.json via nucleus.

    Se llama al FINAL del build, después del rollout de nucleus, cuando el
    binario ya existe en NUCLEUS_HOME/bin/nucleus/ y está disponible en PATH.

    Streams registrados acá:
      - brain_build  → build-brain.sh no puede auto-registrarlo porque nucleus
                       no existe todavía cuando brain se compila (brain va después
                       de nucleus en all_steps, pero el rollout ocurre entre pasos).
      - build_all    → stream del orquestador, solo build-all.py sabe su path.

    Los componentes Go (nucleus, sentinel, metamorph, sensor) se auto-registran
    dentro de build-component.sh, después del rollout de nucleus.
    """
    # Buscar nucleus: primero el recién compilado en NUCLEUS_HOME, luego en PATH
    nucleus_exe: Path | None = None
    candidate = NUCLEUS_HOME / "bin" / "nucleus" / _exe("nucleus")
    if candidate.exists():
        nucleus_exe = candidate
    else:
        import shutil as _sh
        found = _sh.which("nucleus")
        if found:
            nucleus_exe = Path(found)

    if nucleus_exe is None:
        log("⚠️  nucleus no encontrado — telemetry de build_all y brain_build no registrado.")
        log("    Ejecutá manualmente después de instalar nucleus:")
        log("    nucleus telemetry register --stream brain_build ...")
        return

    log("")
    log(_sep())
    log("Registrando streams de build en telemetry.json ...")
    log(_sep())

    log_dir = NUCLEUS_HOME / "logs" / "build"

    streams = [
        {
            "stream":      "brain_build",
            "label":       "📦 BRAIN BUILD",
            "path":        log_dir / "brain.build.log",
            "priority":    "3",
            "category":    "build",
            "description": "Brain build pipeline output - compiler and bundler logs for the Brain module",
        },
        {
            "stream":      "build_all",
            "label":       "🔨 BUILD ALL",
            "path":        _log_file_path or (log_dir / "build_all.log"),
            "priority":    "2",
            "category":    ["build", "cortex"],
            "description": "build-all.py pipeline log — registra resultado de cada fase "
                           "(compilacion, empaquetado, verificacion) por run del orquestador maestro",
        },
    ]

    for s in streams:
        path = s["path"]
        if not Path(path).exists():
            log(f"  ⚠  Log no encontrado, saltando registro de {s['stream']}: {path}")
            continue

        norm_path = str(path).replace("\\", "/")
        categories = s["category"] if isinstance(s["category"], list) else [s["category"]]
        category_flags: list[str] = []
        for cat in categories:
            category_flags += ["--category", cat]

        cmd = [
            str(nucleus_exe), "telemetry", "register",
            "--stream",      s["stream"],
            "--label",       s["label"],
            "--path",        norm_path,
            "--priority",    s["priority"],
            "--description", s["description"],
        ] + category_flags

        try:
            result = subprocess.run(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                encoding="utf-8",
                errors="replace",
            )
            if result.returncode == 0:
                log(f"  ✅ Telemetry registrado: {s['stream']}")
            else:
                log(f"  ⚠  nucleus telemetry register [{s['stream']}] RC={result.returncode}")
                if result.stdout:
                    log(f"     {result.stdout.strip()[:120]}")
        except OSError as exc:
            log(f"  ⚠  No se pudo ejecutar nucleus para {s['stream']}: {exc}")


# ─────────────────────────────────────────────────────────────────────────────
# METAMORPH INSPECT — sincroniza metamorph.json al final de cada build-all
# ─────────────────────────────────────────────────────────────────────────────

def sync_metamorph_manifest() -> None:
    """
    Corre `metamorph inspect` contra el metamorph recién deployado en
    NUCLEUS_HOME, para que metamorph.json quede actualizado con las
    versiones y build numbers de este build.

    Se ejecuta SIEMPRE al final del build-all, sin importar qué --only/--skip
    se haya usado — inspect escanea TODOS los managed_binaries de una sola
    pasada, así que no tiene sentido dispararlo por componente individual.

    No aborta build-all.py si falla: se loguea como warning. Si esto no sale
    OK, revisar el log antes de deployar a productivo con este build.
    """
    if not METAMORPH_EXE.exists():
        log(f"  ⚠  metamorph no encontrado en {METAMORPH_EXE}, se salta sync de manifest")
        return

    try:
        result = subprocess.run(
            [str(METAMORPH_EXE), "inspect"],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            encoding="utf-8",
            errors="replace",
            timeout=60,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        log(f"  ⚠  No se pudo ejecutar metamorph inspect: {exc}")
        return

    if result.returncode == 0:
        log("  ✅ metamorph.json actualizado")
        if result.stdout:
            for line in result.stdout.strip().splitlines():
                log(f"     {line}")
    else:
        log(f"  ⚠  metamorph inspect RC={result.returncode}")
        if result.stdout:
            log(f"     {result.stdout.strip()[:300]}")


# ─────────────────────────────────────────────────────────────────────────────
# GRAVITY PREFLIGHT — verifica el parser Go+TypeScript antes de tocar Nucleus
# ─────────────────────────────────────────────────────────────────────────────

def _ensure_gravity_parser_node_dependencies() -> StepResult | None:
    """
    Garantiza que el runtime antlr4 y el compilador TypeScript declarados por
    el package.json raiz esten realmente instalados antes de ejecutar la suite.

    Un checkout puede tener node_modules preexistente pero desactualizado (por
    ejemplo, despues de traer un package-lock.json nuevo desde otra plataforma).
    `npm ls` valida el arbol instalado sin acceder a la red. Solo si falta una
    dependencia o su version no satisface el manifiesto se ejecuta npm install.

    Retorna un StepResult fallido cuando no se pudieron preparar las
    dependencias; retorna None cuando la verificacion puede continuar.
    """
    code_check, _, _ = run(
        [_NPM, "ls", "--depth=0", "antlr4", "typescript"],
        cwd=ROOT,
    )
    if code_check == 0:
        log("  Dependencias Node de Gravity disponibles (antlr4 + typescript)")
        return None

    log("  Dependencias Node de Gravity ausentes o desactualizadas; ejecutando npm install ...")
    code_install, out_install = run_streaming([_NPM, "install"], cwd=ROOT)
    if code_install != 0:
        tail = "\n".join(out_install.splitlines()[-20:]) if out_install else "(sin output)"
        return StepResult(
            "Gravity",
            False,
            error=f"npm install en la raiz fallo al preparar Gravity:\n{tail}",
        )

    code_recheck, out_recheck, _ = run(
        [_NPM, "ls", "--depth=0", "antlr4", "typescript"],
        cwd=ROOT,
    )
    if code_recheck != 0:
        tail = "\n".join(out_recheck.splitlines()[-20:]) if out_recheck else "(sin output)"
        return StepResult(
            "Gravity",
            False,
            error=(
                "npm install termino, pero antlr4/typescript siguen sin estar "
                f"disponibles:\n{tail}"
            ),
        )

    log("  Dependencias Node de Gravity instaladas (antlr4 + typescript)")
    return None


def verify_gravity_parser() -> StepResult:
    """
    Verifica las suites focalizadas del parser de Gravity (Go + TypeScript)
    ANTES de compilar o desplegar Nucleus. Corre sobre fuentes ya generadas y
    commiteadas — NO invoca scripts/generate-gravity-parser.ps1, NO requiere
    Java ni ANTLR_JAR, y no modifica ninguna fuente ni artefacto productivo.

    Esta es la función que usa el gate de Nucleus (ver _GRAVITY_DEPENDENT_COMPONENTS
    en main()) y queda sin cambios: el build normal de Nucleus sigue sin
    depender de Java. La regeneración explícita vive en
    regenerate_and_verify_gravity_parser(), usada solo por `--only parser`.

    NO es de solo lectura en sentido estricto: `npm run test:gravity-parser`
    compila un .tmp temporal (.tmp/gravity-parser-test/) para poder ejecutar
    el test TS. Ese directorio es descartable entre corridas y no forma parte
    de ningún artefacto de build ni de deployment.
    """
    log("Preflight: verificando parser de Gravity (Go + TypeScript) ...")

    # Go: installer/nucleus/internal/gravity
    go_dir = ROOT / "installer/nucleus"
    code_go, out_go, _ = run(
        ["go", "test", "-vet=off", "./internal/gravity"],
        cwd=go_dir,
    )
    if code_go != 0:
        tail = "\n".join(out_go.splitlines()[-20:]) if out_go else "(sin output)"
        return StepResult("Gravity", False, error=f"go test ./internal/gravity falló:\n{tail}")

    dependency_error = _ensure_gravity_parser_node_dependencies()
    if dependency_error is not None:
        return dependency_error

    # TypeScript: contracts/gravity/parser.test.ts vía el script existente en package.json
    code_ts, out_ts = run_streaming([_NPM, "run", "test:gravity-parser"], cwd=ROOT)
    if code_ts != 0:
        tail = "\n".join(out_ts.splitlines()[-20:]) if out_ts else "(sin output)"
        return StepResult("Gravity", False, error=f"npm run test:gravity-parser falló:\n{tail}")

    log("  ✅ Gravity: Go y TypeScript OK")
    return StepResult("Gravity", True, output=f"{out_go}\n{out_ts}")


def regenerate_and_verify_gravity_parser() -> StepResult:
    """
    SOLO para `--only parser`. A diferencia de verify_gravity_parser() (que
    usa el gate de Nucleus y NO cambia), esta función:

      1. Regenera el parser Go + TypeScript desde
         contracts/gravity/GravityExpression.g4, invocando
         scripts/generate-gravity-parser.ps1 en Windows o
         scripts/generate-gravity-parser.sh en Linux/Darwin.
      2. Si la regeneración fue exitosa, corre las mismas suites de
         verify_gravity_parser() sobre lo recién generado.

    Esto SÍ modifica archivos del repositorio (sobreescribe
    installer/nucleus/internal/gravity/ y contracts/gravity/generated/) y SÍ
    requiere Java en PATH — exactamente los mismos requisitos que ya tenía
    correr el .ps1 a mano.

    Resolución del JAR de ANTLR (sin auto-descarga, sin .cache/tools/antlr/):
      1. Si la variable de entorno ANTLR_JAR está seteada, se usa tal cual
         como override explícito (se respeta cualquier ruta que apunte).
      2. Si no está seteada, se usa la ruta predeterminada del repo:
         installer/antlr/antlr-4.13.2-complete.jar (relativa a ROOT).
      3. Si la ruta resultante (de 1 o 2) no existe en disco, se aborta ANTES
         de invocar el script — no se regenera nada — con un error que
         indica la ruta exacta esperada y el enlace oficial de descarga.

    Nucleus no depende de esta función en ningún punto: su gate sigue usando
    verify_gravity_parser(), sin regenerar y sin requerir Java.
    """
    script_name = "generate-gravity-parser.ps1" if IS_WINDOWS else "generate-gravity-parser.sh"
    script_path = ROOT / "scripts" / script_name
    if not script_path.exists():
        return StepResult("Gravity", False, error=f"No se encontró {script_path}")

    _DEFAULT_ANTLR_JAR = ROOT / "installer" / "antlr" / "antlr-4.13.2-complete.jar"
    _ANTLR_DOWNLOAD_URL = "https://www.antlr.org/download/antlr-4.13.2-complete.jar"

    antlr_jar_override = os.environ.get("ANTLR_JAR")
    if antlr_jar_override:
        antlr_jar_path = Path(antlr_jar_override)
        antlr_jar_source = "override explícito vía ANTLR_JAR"
    else:
        antlr_jar_path = _DEFAULT_ANTLR_JAR
        antlr_jar_source = "ruta predeterminada del repo"

    if not antlr_jar_path.exists():
        return StepResult(
            "Gravity",
            False,
            error=(
                f"No se encontró el JAR de ANTLR ({antlr_jar_source}):\n"
                f"  {antlr_jar_path}\n"
                f"Colocá antlr-4.13.2-complete.jar en esa ruta exacta, o seteá "
                f"ANTLR_JAR apuntando a otra ubicación antes de correr "
                f"--only parser.\n"
                f"Descarga oficial: {_ANTLR_DOWNLOAD_URL}"
            ),
        )

    log("Regenerando parser de Gravity desde GravityExpression.g4 ...")
    log(f"  Script:    {script_path}")
    log(f"  ANTLR_JAR: {antlr_jar_path}  ({antlr_jar_source})")

    if IS_WINDOWS:
        cmd = [
            "powershell", "-ExecutionPolicy", "Bypass", "-NonInteractive",
            "-File", str(script_path), "-AntlrJar", str(antlr_jar_path),
        ]
    else:
        cmd = ["bash", str(script_path), str(antlr_jar_path)]

    code_gen, out_gen = run_streaming(cmd, cwd=script_path.parent)
    if code_gen != 0:
        tail = "\n".join(out_gen.splitlines()[-20:]) if out_gen else "(sin output)"
        return StepResult("Gravity", False, error=f"{script_name} falló:\n{tail}")

    log("  ✅ Parser regenerado (Go + TypeScript) desde GravityExpression.g4")

    # Reutiliza exactamente la misma verificación que corre el gate de Nucleus,
    # para confirmar que lo recién generado compila y pasa las suites.
    return verify_gravity_parser()


def main() -> None:
    args = _parse_args()
    _setup_logger()

    _header(
        f"BloomNucleus — Build Orchestrator\n"
        f"  Platform : {sys.platform}  ({_platform.machine()})\n"
        f"  Bin base : {_DEV_BIN_BASE}"
    )

    # Derivar filtros temprano para usarlos en el header de build numbers
    _only_set_preview = set(s.lower() for s in args.only) if args.only else None
    _skip_set_preview = set(s.lower() for s in args.skip) if args.skip else set()

    # Mostrar build numbers: valor actual en disco y el próximo que se compilará.
    # Los componentes que entran en este build muestran "actual → próximo".
    # Los que se saltean muestran solo el valor actual.
    log(f"Build numbers ({_PLATFORM_SUFFIX}):")
    for comp in ("nucleus", "sentinel", "metamorph", "sensor", "host", "cortex", "setup", "workspace"):
        if comp == "cortex":
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
            base      = _read_int(scripts_dir / "build_number.txt", 0)
            offset    = _read_int(scripts_dir / f"build_number.{_PLATFORM_SUFFIX}.txt", 0)
            effective = base + offset
            offset_str = f"  (+{offset} {_PLATFORM_SUFFIX})" if offset else ""
            will_build = (
                (_only_set_preview is None or comp in _only_set_preview)
                and comp not in _skip_set_preview
                and comp not in ("cortex", "setup", "workspace")
            )
            if will_build:
                log(f"  {comp:<12} {effective} → {effective + 1}{offset_str}  ← este build")
            else:
                log(f"  {comp:<12} {effective}{offset_str}")

    # vsix no tiene build_number propio (artefacto npm), pero se muestra
    # para que el operador sepa si entra en este build o no.
    vsix_will_build = (
        (_only_set_preview is None or "vsix" in _only_set_preview)
        and "vsix" not in _skip_set_preview
    )
    vsix_status = "← este build" if vsix_will_build else "(skipped)"
    log(f"  {'vsix':<12} —  {vsix_status}")
    log("")

    # Definir todos los pasos en orden.
    # Setup, Workspace, Bootstrap y VSIX usan npm run; Cortex usa python3.
    # Brain y Host usan sus propios builders.
    # Los 4 Go components usan build_go_component().
    all_steps: list[tuple[str, str, Callable[[], StepResult]]] = [
        # parser: regenera desde GravityExpression.g4 y verifica (Go + TypeScript),
        # invocable en solitario con `--only parser`. A diferencia del gate de
        # Nucleus, esta ruta SÍ requiere Java/ANTLR_JAR y SÍ escribe archivos
        # generados del repositorio — ver regenerate_and_verify_gravity_parser().
        ("parser",    "Gravity Parser", regenerate_and_verify_gravity_parser),
        # nucleus va primero: su rollout deja el binario en PATH antes de que
        # cualquier otro componente intente llamar `nucleus telemetry register`.
        ("nucleus",   "Nucleus",   lambda: build_go_component("nucleus")),
        ("brain",     "Brain",     build_brain),
        ("host",      "Host",      build_host),
        ("sentinel",  "Sentinel",  lambda: build_go_component("sentinel")),
        ("metamorph", "Metamorph", lambda: build_go_component("metamorph")),
        ("sensor",    "Sensor",    lambda: build_go_component("sensor")),
        # Setup: npm install + electron-builder en installer/conductor/setup/
        ("setup",     "Setup",     build_setup),
        # Workspace: npm install + electron-builder en installer/conductor/workspace/
        ("workspace", "Workspace", build_workspace),
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

    # ── Gate de Gravity — si Nucleus y/o "parser" entran en este build ──
    # Fail-fast: si falla, no se construye ni se despliega NADA en esta
    # corrida, aunque haya otros componentes independientes en `steps`.
    # Nucleus es el primer paso de all_steps porque pasos posteriores
    # dependen de él (PATH, telemetry register); dejar que el build siga
    # arriesgaría usar el Nucleus ya instalado en vez de detectar el problema.
    #
    # "parser" usa una función distinta: regenerate_and_verify_gravity_parser()
    # regenera desde GravityExpression.g4 (requiere Java/ANTLR_JAR, escribe
    # archivos generados) y luego corre las mismas suites. Nucleus NO pasa por
    # ahí — su rama sigue siendo verify_gravity_parser(), sin Java y sin tocar
    # el repo, sin cambios respecto a antes.
    _GRAVITY_DEPENDENT_COMPONENTS = ("nucleus", "parser")

    if any(key in _GRAVITY_DEPENDENT_COMPONENTS for key, _, _ in steps):
        parser_requested = any(key == "parser" for key, _, _ in steps)
        if parser_requested:
            _header("Gravity: regeneración (.g4) + verificación — --only parser")
            gravity_result = regenerate_and_verify_gravity_parser()
        else:
            _header("Preflight: Gravity (Go + TypeScript)")
            gravity_result = verify_gravity_parser()
        _print_result(gravity_result)
        results.append(gravity_result)
        if not gravity_result.ok:
            log("")
            log("⛔ Gravity falló. Build abortado antes de compilar Nucleus.")
            _print_summary(results)
            sys.exit(1)
        # Ya se ejecutó arriba: si "parser" fue pedido explícitamente
        # (--only parser), sacarlo de `steps` para que el loop de abajo no lo
        # vuelva a correr (y no regenere una segunda vez).
        steps = [(k, n, f) for k, n, f in steps if k != "parser"]

    _ROLLOUT_GO_COMPONENTS = ("metamorph", "nucleus", "brain", "sentinel")

    total = len(steps)

    for i, (key, name, fn) in enumerate(steps, start=1):
        _step_header(i, total, name)
        result = fn()
        result.name = name
        _print_result(result)
        results.append(result)

        if result.ok and not result.skipped and key in _ROLLOUT_GO_COMPONENTS:
            log("")
            log(f"── Rollout: desplegando '{key}' a NUCLEUS_HOME ──")
            rollout_result = rollout_component(key)
            rollout_result.name = f"Rollout:{name}"
            _print_result(rollout_result)
            results.append(rollout_result)

        if result.ok and not result.skipped and key == "bootstrap":
            log("")
            log("── Rollout: sincronizando bootstrap a NUCLEUS_HOME ──")
            rollout_result = rollout_bootstrap()
            _print_result(rollout_result)
            results.append(rollout_result)

    log("")
    log(_sep())
    log("Registrando los CLI de BloomNucleus en PATH ...")
    log(_sep())
    ensure_components_in_path()

    # ── Registrar streams de telemetría que dependen de nucleus en PATH ──
    # brain_build no puede auto-registrarse durante su build porque nucleus
    # todavía no existe. Lo registramos acá, después del rollout de nucleus.
    # build_all se registra también acá como stream del orquestador.
    _register_build_telemetry()

    failed_count = _print_summary(results)

    log("")
    log(_sep())
    log(f"Capturando versiones → {_PLATFORM_SUFFIX}_versions.txt ...")
    log(_sep())
    capture_versions()

    log("")
    log(_sep())
    log("Sincronizando metamorph.json (metamorph inspect) ...")
    log(_sep())
    sync_metamorph_manifest()

    if failed_count > 0:
        log("")
        log("⚠️  El build terminó con errores.")
        sys.exit(1)
    else:
        log("")
        log("🎉 Build completo.")


if __name__ == "__main__":
    main()
