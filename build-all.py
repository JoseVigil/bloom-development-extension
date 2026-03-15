"""
Bloom Build All
===============
Orquestador maestro de builds para todos los componentes del ecosistema Bloom.

Secuencia de ejecución:
  1. Brain        → build_brain.ps1
  2. Nucleus      → installer/nucleus/scripts/build.bat
  3. Sentinel     → installer/sentinel/scripts/build.bat
  4. Host         → skipped on Windows (Linux build via installer/host/build.sh)
  5. Conductor    → cd installer/conductor && npm run build:all
                    (buildea sensor + setup en un solo paso)
  6. Metamorph    → installer/metamorph/scripts/build.bat
  7. Sensor       → installer/sensor/scripts/build.bat
  8. Plugin       → npm run build (tsc + copy-assets + esbuild bundle)
                    Output: installer/native/bin/bootstrap/bundle.js
  9. Vsix         → npm run package:vscode (vsce package)
                    Output: installer/vscode/bloom-extension.vsix
  10. Bootstrap   → installer/bootstrap/version-bootstrap.py
                    (incrementa build_number en bootstrap.meta.json)
                    copia bootstrap.meta.json + version-bootstrap.py
                    a installer/native/bin/bootstrap/
  11. Cortex      → installer/cortex/build-cortex/package.py
                    (lee cortex.meta.json, incrementa build_number, produce .blx)

Luego de buildear los ejecutables, interroga cada uno para verificar versión
y reporta un resumen final del estado de todos los componentes.

Uso:
  python build-all.py [--channel stable|beta|dev] [--production] [--skip-verify]

Requisitos: Python 3.9+ stdlib only. Windows.
"""

import argparse
import json
import os
import subprocess
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

# ---------------------------------------------------------------------------
# Telemetría — paths y constantes siguiendo BLOOM_NUCLEUS_LOGGING_SPEC
# ---------------------------------------------------------------------------

APPDATA        = Path(os.environ.get("LOCALAPPDATA",
                    Path.home() / "AppData/Local"))
NUCLEUS_HOME   = Path(os.environ.get("BLOOM_NUCLEUS_HOME",
                    APPDATA / "BloomNucleus"))
NUCLEUS_EXE    = NUCLEUS_HOME / "bin/nucleus/nucleus.exe"
LOGS_BUILD_DIR = NUCLEUS_HOME / "logs/build"

BUILD_ALL_STREAM   = "build_all"
BUILD_ALL_LABEL    = "🔨 BUILD ALL"
BUILD_ALL_PRIORITY = 2


def get_log_path() -> Path:
    """
    Genera el path del log con fecha del dia: build_all_YYYYMMDD.log
    Multiples runs del mismo dia hacen append al mismo archivo.
    El stream_id es fijo (build_all) — nucleus sobreescribe el path en cada registro.
    """
    ts = datetime.now(timezone.utc).strftime("%Y%m%d")
    return LOGS_BUILD_DIR / f"build_all_{ts}.log"


def write_log(log_path: Path, build_results: list, verify_results: list,
              channel: str, verify_env: str) -> None:
    """
    Escribe el log de build siguiendo el spec:
    - Directorio: logs/build/
    - Nombre: build_all_YYYYMMDD.log  (append, no reemplaza)
    - Formato: timestamp + severity + mensaje
    """
    LOGS_BUILD_DIR.mkdir(parents=True, exist_ok=True)

    ts_run = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    lines = []
    lines.append(f"[{ts_run}] INFO  ============================================")
    lines.append(f"[{ts_run}] INFO  BUILD ALL  channel={channel}  verify={verify_env}")
    lines.append(f"[{ts_run}] INFO  ============================================")

    # Resultados de build
    lines.append(f"[{ts_run}] INFO  --- BUILD ---")
    for r in build_results:
        if r.skipped:
            lines.append(f"[{ts_run}] INFO  SKIP  {r.component}: {r.skip_reason}")
        elif r.success:
            ver = f" v{r.version} build {r.build}" if r.version else ""
            lines.append(f"[{ts_run}] INFO  OK    {r.component}{ver}")
        else:
            lines.append(f"[{ts_run}] ERROR FAIL  {r.component}: {(r.error or '').splitlines()[0]}")

    # Resultados de verificación
    verify_map = {vr.component: vr for vr in verify_results}
    if verify_map:
        lines.append(f"[{ts_run}] INFO  --- VERIFY ---")
        for r in build_results:
            vr = verify_map.get(r.component)
            if vr is None:
                continue
            if vr.success:
                lines.append(f"[{ts_run}] INFO  OK    {vr.component} v{vr.version} build {vr.build}")
            else:
                lines.append(f"[{ts_run}] ERROR FAIL  {vr.component}: {vr.error or 'unknown'}")

    # Resultado final
    failed = [r for r in build_results if not r.success and not r.skipped]
    outcome = "SUCCESS" if not failed else "FAILED"
    lines.append(f"[{ts_run}] INFO  RESULT: {outcome}")
    lines.append("")

    with log_path.open("a", encoding="utf-8") as f:
        f.write('\n'.join(lines) + '\n')


def register_telemetry(log_path: Path, build_results: list) -> None:
    """
    Registra el stream en telemetry.json via nucleus telemetry register.
    Nucleus es el UNICO escritor de telemetry.json — nunca escribir directo.

    Convenciones aplicadas (BLOOM_NUCLEUS_LOGGING_SPEC):
      - stream_id : build_all  (fijo — nucleus sobreescribe el path en cada registro)
      - category  : build
      - source    : omitido — build-all.py es un script externo, no un binario del ecosistema
      - path      : archivo diario con append — multiples runs del mismo dia en el mismo archivo
      - priority  : 2 (Important — pipeline principal de compilacion)
      - timestamps: UTC en el archivo de log
    """
    if not NUCLEUS_EXE.exists():
        print(f"  {YELLOW}[telemetry] nucleus.exe no encontrado en {NUCLEUS_EXE} — registro omitido{RESET}", flush=True)
        return

    # Categorías: "build" siempre + categoría válida de cada componente buildeado exitosamente
    COMPONENT_CATEGORY = {
        "Brain":     "brain",
        "Nucleus":   "nucleus",
        "Sentinel":  "sentinel",
        "Metamorph": "metamorph",
        "Conductor": "conductor",
        "Sensor":    "sensor",
        "Vscode":    "vscode",
        "Vsix":      "vsix",
        "Bootstrap": "bootstrap",
        "Cortex":    "cortex",
    }
    extra_categories = [
        COMPONENT_CATEGORY[r.component]
        for r in build_results
        if r.component in COMPONENT_CATEGORY and (r.success or r.skipped)
    ]
    categories = ["build"] + extra_categories

    cmd = [
        str(NUCLEUS_EXE),
        "telemetry", "register",
        "--stream",      BUILD_ALL_STREAM,
        "--label",       BUILD_ALL_LABEL,
        "--path",        str(log_path).replace(chr(92), "/"),
        "--priority",    str(BUILD_ALL_PRIORITY),
        "--description", "build-all.py pipeline log — registra resultado de cada fase (compilacion, empaquetado, verificacion) por run del orquestador maestro",
    ]
    for cat in categories:
        cmd += ["--category", cat]


    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=10,
        )
        if result.returncode == 0:
            print(f"  {GREEN}[telemetry] stream '{BUILD_ALL_STREAM}' registrado correctamente{RESET}", flush=True)
        else:
            print(f"  {YELLOW}[telemetry] registro fallido (code {result.returncode}): {result.stderr.strip()}{RESET}", flush=True)
    except Exception as e:
        print(f"  {YELLOW}[telemetry] error al registrar: {e}{RESET}", flush=True)

ROOT = Path(__file__).parent.resolve()

BUILDS = {
    "brain":      ROOT / "build_brain.ps1",
    "nucleus":    ROOT / "installer/nucleus/scripts/build.bat",
    "sentinel":   ROOT / "installer/sentinel/scripts/build.bat",
    "metamorph":  ROOT / "installer/metamorph/scripts/build.bat",
    "conductor":  ROOT / "installer/conductor",          # cwd para npm
    "sensor":     ROOT / "installer/sensor/scripts/build.bat",
    "cortex":     ROOT / "installer/cortex/build-cortex/package.py",
    # Plugin VSCode — repo raíz (bloom-development-extension)
    # build: tsc + copy-assets + esbuild bundle → installer/native/bin/bootstrap/bundle.js
    # vsix:  vsce package → installer/vscode/bloom-extension.vsix
    "vscode":     ROOT,                                  # cwd para npm run build
    "vsix":       ROOT,                                  # cwd para npm run package:vscode
    # Bootstrap — incrementa build_number después del build del plugin
    "bootstrap":  ROOT / "installer/bootstrap/version-bootstrap.py",
}

def get_bin_base(verify_env: str) -> Path:
    """Retorna el directorio raíz de binarios según el entorno de verificación."""
    if verify_env == "prod":
        return _PROD_BIN_BASE
    return _DEV_BIN_BASE  # dev: installer/native/bin/win64

@dataclass
class BinaryContract:
    name: str
    bin_path: Path           # ruta al ejecutable
    version_cmd: list[str]   # comando completo para obtener versión
    info_cmd: list[str]      # comando completo para obtener info
    version_field: str       # dotpath al campo de versión en la respuesta JSON
    build_field: str         # dotpath al campo de build_number en la respuesta JSON

def dotget(data: dict, path: str):
    """Accede a campos anidados con notación 'data.version' → data['data']['version']."""
    for key in path.split("."):
        if isinstance(data, dict):
            data = data.get(key)
        else:
            return None
    return data

def get_contracts(verify_env: str) -> list[BinaryContract]:
    """
    Retorna los contratos de verificación apuntando al entorno correcto.
      dev  → installer/native/bin/win64/   (binarios recién buildeados)
      prod → BloomNucleus/bin/             (binarios instalados en producción)

    IMPORTANTE: version_cmd usa el path absoluto del binario como primer elemento.
    Cada binario tiene su propia convención de flags, tomada literalmente
    de los outputs verificados el 2026-02-18.
    """
    b = get_bin_base(verify_env)
    brain     = str(b / "brain/brain.exe")
    nucleus   = str(b / "nucleus/nucleus.exe")
    sentinel  = str(b / "sentinel/sentinel.exe")
    host      = str(b / "host/bloom-host.exe")
    metamorph = str(b / "metamorph/metamorph.exe")
    sensor    = str(b / "sensor/bloom-sensor.exe")
    ps1       = str(b / "conductor/win-unpacked/bloom-conductor-version.ps1")
    ps1_setup = str(b / "setup/win-unpacked/bloom-setup-version.ps1")

    # Plugin: bundle.js siempre vive en bootstrap/ dentro del bin base
    # dev  → installer/native/bin/bootstrap/bundle.js
    # prod → AppData/Local/BloomNucleus/bin/bootstrap/bundle.js
    plugin_bundle = b / "bootstrap/bundle.js"

    # Vsix: solo existe en dev (installer/vscode/). En prod ya fue instalado por code CLI.
    vsix_path = ROOT / "installer/vscode"

    return [
        BinaryContract(
            name         = "Brain",
            bin_path     = b / "brain/brain.exe",
            version_cmd  = [brain, "--json", "--version"],
            info_cmd     = [brain, "--json", "--info"],
            version_field= "data.app_release",
            build_field  = "data.build_counter",
        ),
        BinaryContract(
            name         = "Nucleus",
            bin_path     = b / "nucleus/nucleus.exe",
            version_cmd  = [nucleus, "--json", "version"],
            info_cmd     = [nucleus, "--json", "info"],
            version_field= "version",
            build_field  = "build_number",
        ),
        BinaryContract(
            name         = "Sentinel",
            bin_path     = b / "sentinel/sentinel.exe",
            version_cmd  = [sentinel, "--json", "version"],
            info_cmd     = [sentinel, "--json", "info"],
            version_field= "version",
            build_field  = "build",
        ),
        BinaryContract(
            name         = "Host",
            bin_path     = b / "host/bloom-host.exe",
            version_cmd  = [host, "--version", "--json"],
            info_cmd     = [host, "--info", "--json"],
            version_field= "version",
            build_field  = "build",
        ),
        BinaryContract(
            name         = "Conductor",
            bin_path     = b / "conductor/bloom-conductor.exe",
            version_cmd  = ["powershell", "-ExecutionPolicy", "Bypass", "-File", ps1, "--json"],
            info_cmd     = ["powershell", "-ExecutionPolicy", "Bypass", "-File", ps1, "--json"],
            version_field= "version",
            build_field  = "build",
        ),
        BinaryContract(
            name         = "Metamorph",
            bin_path     = b / "metamorph/metamorph.exe",
            version_cmd  = [metamorph, "--json", "version"],
            info_cmd     = [metamorph, "--json", "info"],
            version_field= "version",
            build_field  = "build_number",
        ),
        BinaryContract(
            # build_number es string en la salida de sensor (ej: "0"),
            # verify_binary lo maneja via _parse_build() que acepta str y float.
            name         = "Sensor",
            bin_path     = b / "sensor/bloom-sensor.exe",
            version_cmd  = [sensor, "--json", "version"],
            info_cmd     = [sensor, "--json", "info"],
            version_field= "version",
            build_field  = "build",
        ),
        BinaryContract(
            name         = "Setup",
            bin_path     = b / "setup/bloom-setup.exe",
            version_cmd  = ["powershell", "-ExecutionPolicy", "Bypass", "-File", ps1_setup, "--json"],
            info_cmd     = ["powershell", "-ExecutionPolicy", "Bypass", "-File", ps1_setup, "--json"],
            version_field= "version",
            build_field  = "build",
        ),
    ]

# ---------------------------------------------------------------------------
# Resultado de cada step
# ---------------------------------------------------------------------------

@dataclass
class StepResult:
    component: str
    success: bool
    version: Optional[str]   = None
    build:   Optional[int]   = None
    error:   Optional[str]   = None
    skipped: bool            = False
    skip_reason: str         = ""

# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------

BOLD  = "\033[1m"
GREEN = "\033[92m"
RED   = "\033[91m"
YELLOW= "\033[93m"
RESET = "\033[0m"

def log(msg: str) -> None:
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"  [{ts}] {msg}", flush=True)

def header(title: str) -> None:
    print(flush=True)
    print(f"{BOLD}{'─' * 60}{RESET}", flush=True)
    print(f"{BOLD}  {title}{RESET}", flush=True)
    print(f"{BOLD}{'─' * 60}{RESET}", flush=True)

def run(cmd: list[str], cwd: Optional[Path] = None, timeout: int = 300) -> tuple[int, str, str]:
    """
    Ejecuta un comando mostrando su output en tiempo real (streaming).
    Retorna (returncode, stdout_completo, stderr_completo).
    Fuerza UTF-8 con reemplazo de caracteres inválidos para evitar
    UnicodeDecodeError en consolas Windows con codepage CP1252.
    """
    if cwd is None:
        cwd = ROOT
    stdout_lines: list[str] = []
    stderr_lines: list[str] = []

    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"

    proc = subprocess.Popen(
        cmd,
        cwd=str(cwd),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        encoding="utf-8",
        errors="replace",
        env=env,
    )

    import threading

    def stream(pipe, store: list, prefix: str):
        for line in pipe:
            line = line.rstrip()
            if line:
                store.append(line)
                print(f"    {prefix}{line}", flush=True)

    t_out = threading.Thread(target=stream, args=(proc.stdout, stdout_lines, ""))
    t_err = threading.Thread(target=stream, args=(proc.stderr, stderr_lines, ""))
    t_out.start()
    t_err.start()

    try:
        proc.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        proc.kill()
        t_out.join()
        t_err.join()
        raise

    t_out.join()
    t_err.join()

    return proc.returncode, "\n".join(stdout_lines), "\n".join(stderr_lines)

def parse_json_output(raw: str) -> Optional[dict]:
    """Extrae el primer bloque JSON válido del output (ignora logs previos)."""
    raw = raw.strip()
    # Algunos binarios emiten logs antes del JSON (ej: sentinel)
    # Buscamos el primer '{'
    idx = raw.find("{")
    if idx == -1:
        return None
    try:
        return json.loads(raw[idx:])
    except json.JSONDecodeError:
        return None

# ---------------------------------------------------------------------------
# Build steps
# ---------------------------------------------------------------------------

def build_brain() -> StepResult:
    brain_ps1 = BUILDS["brain"]
    if not brain_ps1.exists():
        return StepResult("Brain", False, error=f"Script no encontrado: {brain_ps1}")
    log("Ejecutando build_brain.ps1 ...")
    code, out, err = run(
        ["powershell", "-ExecutionPolicy", "Bypass", "-File", brain_ps1.name],
        cwd=brain_ps1.parent,
    )
    if code != 0:
        return StepResult("Brain", False, error=err or out)
    return StepResult("Brain", True)


def build_bat(component: str, bat_path: Path) -> StepResult:
    if not bat_path.exists():
        return StepResult(component, False, error=f"Script no encontrado: {bat_path}")
    log(f"Ejecutando {bat_path.name} ...")
    # cwd = directorio del .bat para que sus rutas relativas internas resuelvan correctamente
    code, out, err = run(["cmd", "/c", bat_path.name], cwd=bat_path.parent)
    if code != 0:
        return StepResult(component, False, error=err or out)
    return StepResult(component, True)


def build_conductor() -> StepResult:
    conductor_dir = BUILDS["conductor"]
    if not conductor_dir.is_dir():
        return StepResult("Conductor", False, error=f"Directorio no encontrado: {conductor_dir}")
    log("Ejecutando npm run build:all (sensor + setup) ...")
    # En Windows npm es npm.cmd, no un ejecutable directo
    npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"
    code, out, err = run(
        [npm_cmd, "run", "build:all"],
        cwd=conductor_dir,
    )
    if code != 0:
        return StepResult("Conductor", False, error=err or out)
    return StepResult("Conductor", True)


def build_sensor() -> StepResult:
    sensor_bat = BUILDS["sensor"]
    if not sensor_bat.exists():
        return StepResult("Sensor", False, error=f"Script no encontrado: {sensor_bat}")
    log("Ejecutando build.bat ...")
    code, out, err = run(["cmd", "/c", sensor_bat.name], cwd=sensor_bat.parent)
    if code != 0:
        return StepResult("Sensor", False, error=err or out)
    return StepResult("Sensor", True)


def build_plugin() -> StepResult:
    """
    Compila el plugin VSCode en tres pasos:
      1. tsc  -> out/
      2. copy-assets -> out/ui/
      3. esbuild bundle -> installer/native/bin/bootstrap/bundle.js

    El script npm run build ya encadena los tres pasos.
    Output critico: installer/native/bin/bootstrap/bundle.js
    """
    plugin_dir = BUILDS["vscode"]
    npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"
    log("Ejecutando npm run build (tsc + copy-assets + esbuild bundle) ...")
    code, out, err = run(
        [npm_cmd, "run", "build"],
        cwd=plugin_dir,
    )
    if code != 0:
        return StepResult("Vscode", False, error=err or out)

    # Verificar que bundle.js fue generado
    bundle_path = plugin_dir / "installer/native/bin/bootstrap/bundle.js"
    if not bundle_path.exists():
        return StepResult("Vscode", False,
                          error=f"Build OK pero bundle.js no encontrado en {bundle_path}")

    size_kb = bundle_path.stat().st_size / 1024
    log(f"bundle.js generado: {size_kb:.1f} KB → {bundle_path}")
    return StepResult("Vscode", True)


def build_vsix() -> StepResult:
    """
    Empaqueta el plugin como .vsix usando vsce.
    Output: installer/vscode/bloom-extension.vsix
    Requiere que build_plugin() haya corrido antes (necesita out/ y bundle.js).
    """
    plugin_dir = BUILDS["vsix"]
    npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"
    log("Ejecutando npm run package:vscode (vsce package) ...")
    code, out, err = run(
        [npm_cmd, "run", "package:vscode"],
        cwd=plugin_dir,
    )
    if code != 0:
        return StepResult("Vsix", False, error=err or out)

    # Verificar que el .vsix fue generado
    vsix_dir = plugin_dir / "installer/vscode"
    vsix_files = list(vsix_dir.glob("*.vsix")) if vsix_dir.exists() else []
    if not vsix_files:
        return StepResult("Vsix", False,
                          error=f"vsce OK pero no se encontró .vsix en {vsix_dir}")

    # El más reciente en caso de que haya varios
    vsix_file = max(vsix_files, key=lambda p: p.stat().st_mtime)
    size_kb = vsix_file.stat().st_size / 1024
    log(f".vsix generado: {vsix_file.name} ({size_kb:.1f} KB)")
    return StepResult("Vsix", True)


def build_bootstrap() -> StepResult:
    """
    Cuatro responsabilidades:
      1. Corre npm run build:bundle para generar bundle.js y bundle.js.map.
      2. Verifica que bundle.js y bundle.js.map fueron generados en native/.
      3. Incrementa build_number en installer/bootstrap/bootstrap.meta.json.
      4. Copia bootstrap.meta.json + version-bootstrap.py + server-bootstrap.js a
         installer/native/bin/bootstrap/ para que queden disponibles en el
         deploy a AppData y nucleus pueda consultar version/info desde ahí.

    Nota: Nucleus (supervisor.go) lanza bundle.js directamente — no server-bootstrap.js.
    server-bootstrap.js se copia a native/ solo como referencia del entry point de esbuild.
    """
    script    = BUILDS["bootstrap"]
    source_dir = script.parent                                          # installer/bootstrap/
    native_dir = ROOT / "installer/native/bin/bootstrap"               # output del build

    # ------------------------------------------------------------------
    # 1. Correr npm run build:bundle para generar bundle.js
    # ------------------------------------------------------------------
    npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"
    log("Ejecutando npm run build:bundle ...")
    code, out, err = run(
        [npm_cmd, "run", "build:bundle"],
        cwd=ROOT,
    )
    if code != 0:
        return StepResult("Bootstrap", False, error=err or out)

    # ------------------------------------------------------------------
    # 2. Verificar que bundle.js y bundle.js.map existen en native
    # ------------------------------------------------------------------
    for fname in ("bundle.js", "bundle.js.map"):
        fpath = native_dir / fname
        if not fpath.exists():
            return StepResult("Bootstrap", False,
                              error=f"{fname} no encontrado en {native_dir} — build:bundle no generó el archivo esperado")
        size_kb = fpath.stat().st_size / 1024
        log(f"{fname}: {size_kb:.1f} KB  ✓")

    # ------------------------------------------------------------------
    # 3. Incrementar build_number
    # ------------------------------------------------------------------
    if not script.exists():
        return StepResult("Bootstrap", False, error=f"Script no encontrado: {script}")

    log("Incrementando build_number en bootstrap.meta.json ...")
    code, out, err = run([sys.executable, str(script)], cwd=source_dir)
    if code != 0:
        return StepResult("Bootstrap", False, error=err or out)

    # version-bootstrap.py emite JSON — parsearlo directamente
    result_json = parse_json_output(out)
    if not result_json or not result_json.get("success"):
        return StepResult("Bootstrap", False,
                          error=result_json.get("error", "version-bootstrap.py no emitió JSON válido") if result_json else "Sin output JSON")

    version      = result_json["version"]
    build_number = result_json["build_number"]
    log(f"v{version}  build {build_number}")

    # ------------------------------------------------------------------
    # 4. Copiar meta + script a native para deploy
    # ------------------------------------------------------------------
    import shutil
    native_dir.mkdir(parents=True, exist_ok=True)

    for fname in ("bootstrap.meta.json", "version-bootstrap.py", "server-bootstrap.js"):
        src = source_dir / fname
        dst = native_dir / fname
        if not src.exists():
            return StepResult("Bootstrap", False, error=f"Archivo fuente no encontrado: {src}")
        shutil.copy2(src, dst)
        log(f"Copiado → {dst.relative_to(ROOT)}")

    return StepResult("Bootstrap", True, version=version, build=build_number)


def ensure_cortex_meta(meta_path: Path, channel: str) -> None:
    """Crea cortex.meta.json con valores iniciales si no existe."""
    if meta_path.exists():
        return
    log(f"cortex.meta.json no encontrado, creando en {meta_path} ...")
    initial = {
        "name": "Bloom Cortex",
        "version": "1.0.0",
        "build_number": 0,
        "build_date": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "release_channel": channel,
        "min_chrome_version": "120",
    }
    meta_path.parent.mkdir(parents=True, exist_ok=True)
    with meta_path.open("w", encoding="utf-8") as f:
        json.dump(initial, f, indent=2, ensure_ascii=False)
        f.write('\n')
    ver = initial["version"]
    log(f"cortex.meta.json creado con version {ver} build 0")


def build_cortex(channel: str, production: bool) -> StepResult:
    meta_path = BUILDS["cortex"].parent / "cortex.meta.json"
    ensure_cortex_meta(meta_path, channel)
    log("Ejecutando package.py ...")
    cmd = [
        sys.executable,
        str(BUILDS["cortex"]),
        "--source", str(CORTEX_SOURCE),
        "--output", str(CORTEX_OUTPUT),
        "--channel", channel,
    ]
    if production:
        cmd.append("--production")

    code, out, err = run(cmd)
    if code != 0:
        return StepResult("Cortex", False, error=err or out)

    # Leer versión directamente desde cortex.meta.json (ya actualizado por package.py)
    meta_path = BUILDS["cortex"].parent / "cortex.meta.json"
    try:
        with meta_path.open("r", encoding="utf-8") as f:
            meta = json.load(f)
        return StepResult(
            "Cortex", True,
            version=meta.get("version", "unknown"),
            build=meta.get("build_number"),
        )
    except Exception as e:
        return StepResult("Cortex", True, error=f"Build OK pero no se pudo leer meta: {e}")


# ---------------------------------------------------------------------------
# Verificación post-build: interroga cada binario
# ---------------------------------------------------------------------------

def _parse_build(val) -> Optional[int]:
    """Convierte build_number a int de forma segura.
    Acepta int, float (JSON estándar) y string (ej: bloom-sensor emite "0").
    """
    if val is None:
        return None
    try:
        return int(val)
    except (ValueError, TypeError):
        return None


def verify_binary(contract: BinaryContract) -> StepResult:
    """Interroga el binario instalado y extrae versión y build."""
    bin_path = contract.bin_path

    if not bin_path.exists():
        return StepResult(contract.name, False,
                          error=f"Binario no encontrado: {bin_path}")

    # Intentar con version_cmd
    try:
        code, out, err = run(
            contract.version_cmd,
            cwd=bin_path.parent,
            timeout=10,
        )
        data = parse_json_output(out)
        if data:
            version = dotget(data, contract.version_field)
            build   = dotget(data, contract.build_field)
            if version:
                return StepResult(
                    contract.name, True,
                    version=str(version),
                    build=_parse_build(build),
                )
    except Exception as e:
        pass  # fallback a info_cmd

    # Fallback: info_cmd
    try:
        code, out, err = run(
            contract.info_cmd,
            cwd=bin_path.parent,
            timeout=10,
        )
        data = parse_json_output(out)
        if data:
            version = dotget(data, contract.version_field)
            build   = dotget(data, contract.build_field)
            if version:
                return StepResult(
                    contract.name, True,
                    version=str(version),
                    build=_parse_build(build),
                )
    except Exception as e:
        pass

    return StepResult(contract.name, False,
                      error="No se pudo obtener versión del binario")


# ---------------------------------------------------------------------------
# Reporte final
# ---------------------------------------------------------------------------

def print_summary(build_results: list[StepResult], verify_results: list[StepResult]) -> None:
    header("RESUMEN DE BUILD")

    print(f"\n  {'Componente':<14} {'Build':<8} {'Verificación':<14} {'Versión':<16} {'#Build'}")
    print(f"  {'─'*14} {'─'*8} {'─'*14} {'─'*16} {'─'*6}")

    # Indexar verificaciones por nombre
    verify_map = {r.component: r for r in verify_results}

    all_ok = True
    for br in build_results:
        vr = verify_map.get(br.component)

        build_status = f"{GREEN}OK{RESET}" if br.success else (
            f"{YELLOW}SKIPPED{RESET}" if br.skipped else f"{RED}FAIL{RESET}"
        )

        if vr is None:
            verify_status = f"{YELLOW}N/A{RESET}"
            version_str   = "—"
            build_num     = "—"
        elif vr.success:
            verify_status = f"{GREEN}OK{RESET}"
            version_str   = f"v{vr.version}" if vr.version else "unknown"
            build_num     = str(vr.build) if vr.build is not None else "—"
        else:
            verify_status = f"{RED}FAIL{RESET}"
            version_str   = "unknown"
            build_num     = "—"
            all_ok = False

        if not br.success and not br.skipped:
            all_ok = False

        print(f"  {br.component:<14} {build_status:<20} {verify_status:<22} {version_str:<16} {build_num}")

    print()
    if all_ok:
        print(f"  {GREEN}{BOLD}✓ Todos los componentes buildeados y verificados correctamente.{RESET}")
    else:
        print(f"  {RED}{BOLD}✗ Algunos componentes fallaron. Revisá los errores arriba.{RESET}")
    print()


def print_errors(results: list[StepResult]) -> None:
    failed = [r for r in results if not r.success and not r.skipped and r.error]
    if not failed:
        return
    header("ERRORES DETALLADOS")
    for r in failed:
        print(f"\n  {RED}[{r.component}]{RESET}")
        for line in (r.error or "").strip().splitlines():
            print(f"    {line}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

VALID_COMPONENTS = [
    "brain", "nucleus", "sentinel", "metamorph", "conductor",
    "sensor", "vscode", "vsix", "bootstrap", "cortex",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="build-all.py",
        description=(
            "Bloom Build All — Orquestador maestro de builds del ecosistema Bloom.\n"
            "\n"
            "Compila todos los componentes en orden, verifica sus versiones\n"
            "y opcionalmente valida el estado de la instalación en producción.\n"
            "\n"
            "Usa --only <componente> para correr un único build de forma aislada\n"
            "(útil para re-intentar un paso que falló en el build completo)."
        ),
        epilog=(
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            "OPCIONES — DETALLE\n"
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            "  --only COMPONENTE\n"
            "      Corre únicamente el build del componente indicado.\n"
            "      Ideal para re-intentar un paso fallido sin correr el all.\n"
            "      Componentes válidos:\n"
            "        brain      → build_brain.ps1\n"
            "        nucleus    → installer/nucleus/scripts/build.bat\n"
            "        sentinel   → installer/sentinel/scripts/build.bat\n"
            "        metamorph  → installer/metamorph/scripts/build.bat\n"
            "        conductor  → installer/conductor (npm run build:all)\n"
            "        sensor     → installer/sensor/scripts/build.bat\n"
            "        vscode     → npm run build (tsc + copy-assets + esbuild)\n"
            "        vsix       → npm run package:vscode (requiere plugin buildeado)\n"
            "        bootstrap  → installer/bootstrap/version-bootstrap.py\n"
            "                     (requiere plugin buildeado — necesita bundle.js)\n"
            "        cortex     → installer/cortex/build-cortex/package.py\n"
            "      Nota: --only cortex respeta --channel y --production.\n"
            "      Nota: --only omite la verificación post-build (FASE 3).\n"
            "\n"
            "  --channel CHANNEL\n"
            "      Release channel para el empaquetado de Cortex (.blx).\n"
            "        stable   Versión de producción (default)\n"
            "        beta     Versión de prueba pre-release\n"
            "        dev      Versión de desarrollo local\n"
            "\n"
            "  --production\n"
            "      Excluye archivos .map del paquete Cortex (.blx).\n"
            "      Usar en releases públicos para reducir el tamaño del bundle.\n"
            "\n"
            "  --skip-verify\n"
            "      Omite la FASE 3 de verificación post-build.\n"
            "      Útil para builds rápidos cuando solo interesa compilar.\n"
            "\n"
            "  --verify-env ENV\n"
            "      Entorno de verificación para FASE 3 y FASE 5.\n"
            "        dev    Verifica en installer/native/bin/win64/ (default)\n"
            "               verify-sync se omite — no todos los binarios están presentes\n"
            "        prod   Verifica en %%LOCALAPPDATA%%\\BloomNucleus\\bin\\\n"
            "               Activa FASE 5: verify-sync contra metamorph.json\n"
            "               Requiere que el installer haya sido ejecutado\n"
            "\n"
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            "SECUENCIA DE BUILD\n"
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            "  FASE 1  Compilación de ejecutables\n"
            "            Brain      → build_brain.ps1\n"
            "            Nucleus    → installer/nucleus/scripts/build.bat\n"
            "            Sentinel   → installer/sentinel/scripts/build.bat\n"
            "            Metamorph  → installer/metamorph/scripts/build.bat\n"
            "            Conductor  → installer/conductor (npm run build:all)\n"
            "            Host       → SKIPPED en Windows (build via Linux)\n"
            "            Sensor     → installer/sensor/scripts/build.bat\n"
            "            Plugin     → npm run build\n"
            "                         (tsc + copy-assets + esbuild bundle)\n"
            "                         → installer/native/bin/bootstrap/bundle.js\n"
            "            Vsix       → npm run package:vscode (vsce)\n"
            "                         → installer/vscode/bloom-extension.vsix\n"
            "            Bootstrap  → installer/bootstrap/version-bootstrap.py\n"
            "                         (incrementa build_number en bootstrap.meta.json)\n"
            "\n"
            "  FASE 2  Empaquetado de Cortex (.blx)\n"
            "            Cortex     → installer/cortex/build-cortex/package.py\n"
            "\n"
            "  FASE 3  Verificación post-build (versión y build number)\n"
            "            Verifica cada binario recién compilado\n"
            "            dev  → installer/native/bin/win64/\n"
            "            prod → %%LOCALAPPDATA%%\\BloomNucleus\\bin\\\n"
            "\n"
            "  FASE 4  Resumen de errores\n"
            "\n"
            "  FASE 5  Verify-sync (solo con --verify-env prod)\n"
            "            Compara hashes de AppData contra metamorph.json\n"
            "            Requiere que el installer haya sido ejecutado primero\n"
            "\n"
            "  FASE 6  Telemetría\n"
            "            Registra el log del build via nucleus telemetry register\n"
            "\n"
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            "EJEMPLOS — BUILD COMPLETO\n"
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            "  # Build estándar de desarrollo (más común)\n"
            "  python build-all.py\n"
            "\n"
            "  # Build con verify-sync al final (requiere installer ejecutado)\n"
            "  python build-all.py --verify-env prod\n"
            "\n"
            "  # Build de canal beta para Cortex, excluyendo .map files\n"
            "  python build-all.py --channel beta --production\n"
            "\n"
            "  # Build rápido sin verificación post-compilación\n"
            "  python build-all.py --skip-verify\n"
            "\n"
            "  # Build completo de producción: beta, sin .map, verify-sync contra AppData\n"
            "  python build-all.py --channel beta --production --verify-env prod\n"
            "\n"
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            "EJEMPLOS — BUILD INDIVIDUAL (--only)\n"
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            "  # Re-intentar un componente que falló en el build all\n"
            "  python build-all.py --only brain\n"
            "  python build-all.py --only nucleus\n"
            "  python build-all.py --only sentinel\n"
            "  python build-all.py --only metamorph\n"
            "  python build-all.py --only conductor\n"
            "  python build-all.py --only sensor\n"
            "  python build-all.py --only vscode\n"
            "  python build-all.py --only vsix\n"
            "  python build-all.py --only bootstrap\n"
            "  python build-all.py --only cortex\n"
            "\n"
            "  # Cortex individual con opciones de canal\n"
            "  python build-all.py --only cortex --channel beta\n"
            "  python build-all.py --only cortex --channel beta --production\n"
            "\n"
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            "NOTAS\n"
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            "  verify-sync NO corre durante el build en entorno dev.\n"
            "  Es una herramienta post-instalación. Para usarla manualmente:\n"
            "    metamorph verify-sync\n"
            "    metamorph --json verify-sync\n"
            "\n"
            "  Si verify-sync reporta componentes faltantes después del installer:\n"
            "    metamorph rollout\n"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--only",
        default=None,
        choices=VALID_COMPONENTS,
        metavar="COMPONENTE",
        help=(
            f"Corre únicamente el build de un componente: "
            f"{', '.join(VALID_COMPONENTS)}. "
            "Omite verificación post-build."
        ),
    )
    parser.add_argument(
        "--channel",
        default="stable",
        choices=["stable", "beta", "dev"],
        metavar="CHANNEL",
        help="Release channel para Cortex: stable (default), beta, dev",
    )
    parser.add_argument(
        "--production",
        action="store_true",
        help="Excluye archivos .map del paquete Cortex (.blx)",
    )
    parser.add_argument(
        "--skip-verify",
        action="store_true",
        help="Omite la FASE 3 de verificación post-build",
    )
    parser.add_argument(
        "--verify-env",
        default="dev",
        choices=["dev", "prod"],
        metavar="ENV",
        help="Entorno de verificación: dev (default) o prod. Ver detalle abajo.",
    )

    # Regenerar build-all-help.txt siempre que se construye el parser,
    # ANTES de parse_args() — así --help también lo actualiza, no solo el build completo.
    try:
        import io as _io
        _buf = _io.StringIO()
        parser.print_help(_buf)
        _help_file = ROOT / "build-all-help.txt"
        _help_file.write_text(_buf.getvalue(), encoding="utf-8")
    except Exception:
        pass  # nunca bloquear el build por esto

    return parser, parser.parse_args()


def write_help_file(parser: argparse.ArgumentParser) -> None:
    """Escribe build-all-help.txt en la raiz del repo junto al script."""
    import io
    buf = io.StringIO()
    parser.print_help(buf)
    help_file = ROOT / "build-all-help.txt"
    help_file.write_text(buf.getvalue(), encoding="utf-8")
    log(f"{GREEN}OK{RESET}  ->  build-all-help.txt -> {help_file}")


def run_single(component: str, channel: str, production: bool) -> None:
    """
    Corre el build de un único componente y muestra su resultado.
    Usado con --only para re-intentar un paso fallido sin correr el all.
    """
    DISPATCH = {
        "brain":      lambda: build_brain(),
        "nucleus":    lambda: build_bat("Nucleus",   BUILDS["nucleus"]),
        "sentinel":   lambda: build_bat("Sentinel",  BUILDS["sentinel"]),
        "metamorph":  lambda: build_bat("Metamorph", BUILDS["metamorph"]),
        "conductor":  lambda: build_conductor(),
        "sensor":     lambda: build_sensor(),
        "vscode":     lambda: build_plugin(),
        "vsix":       lambda: build_vsix(),
        "bootstrap":  lambda: build_bootstrap(),
        "cortex":     lambda: build_cortex(channel, production),
    }

    fn = DISPATCH.get(component)
    if fn is None:
        print(f"{RED}Componente desconocido: {component}{RESET}")
        print(f"Validos: {', '.join(VALID_COMPONENTS)}")
        sys.exit(2)

    header(f"BLOOM BUILD — {component.upper()}  |  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"\n  {BOLD}-> {component.capitalize()}{RESET}")

    try:
        result = fn()
    except subprocess.TimeoutExpired:
        result = StepResult(component.capitalize(), False, error="Timeout excedido (300s)")
    except Exception as e:
        result = StepResult(component.capitalize(), False, error=str(e))

    if result.skipped:
        log(f"{YELLOW}SKIPPED{RESET} — {result.skip_reason}")
    elif result.success:
        ver = f"  v{result.version} build {result.build}" if result.version else ""
        log(f"{GREEN}OK{RESET}{ver}")
    else:
        log(f"{RED}FAIL{RESET}")
        if result.error:
            header("ERROR DETALLADO")
            for line in result.error.strip().splitlines():
                print(f"    {line}")

    print()
    if result.success or result.skipped:
        print(f"  {GREEN}{BOLD}OK {component.capitalize()} buildeado correctamente.{RESET}")
        print(f"  Podes re-correr el build completo con: python build-all.py")
    else:
        print(f"  {RED}{BOLD}FAIL {component.capitalize()} fallo. Revisa el error arriba.{RESET}")
    print()

    # Logging y telemetría — siempre, incluso en --only
    log_path = get_log_path()
    write_log(log_path, [result], [], channel="n/a", verify_env="n/a")
    register_telemetry(log_path, [result])

    sys.exit(0 if (result.success or result.skipped) else 1)


def main() -> None:
    parser, args = parse_args()

    # ------------------------------------------------------------------
    # Modo --only: build de un unico componente
    # ------------------------------------------------------------------
    if args.only:
        run_single(args.only, args.channel, args.production)
        return  # run_single llama sys.exit(), pero por claridad

    header(f"BLOOM BUILD ALL  |  channel: {args.channel}  |  verify: {args.verify_env}  |  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    build_results: list[StepResult] = []

    # ------------------------------------------------------------------
    # FASE 1: Builds de ejecutables
    # ------------------------------------------------------------------
    header("FASE 1 — Compilación de ejecutables")

    steps = [
        ("Brain",     lambda: build_brain()),
        ("Nucleus",   lambda: build_bat("Nucleus",   BUILDS["nucleus"])),
        ("Sentinel",  lambda: build_bat("Sentinel",  BUILDS["sentinel"])),
        ("Metamorph", lambda: build_bat("Metamorph", BUILDS["metamorph"])),
        ("Conductor", lambda: build_conductor()),
        ("Host",      lambda: StepResult("Host", True, skipped=True,
                                         skip_reason="Build en Linux — installer/host/build.sh")),
        ("Sensor",    lambda: build_sensor()),
        # Plugin debe ir antes de Vsix (vsce necesita out\ y bundle.js)
        ("Vscode",    lambda: build_plugin()),
        ("Vsix",      lambda: build_vsix()),
        # Bootstrap debe ir después de Plugin (bundle.js ya generado)
        ("Bootstrap", lambda: build_bootstrap()),
    ]

    for name, fn in steps:
        print(f"\n  {BOLD}→ {name}{RESET}")
        try:
            result = fn()
        except subprocess.TimeoutExpired:
            result = StepResult(name, False, error="Timeout excedido (300s)")
        except Exception as e:
            result = StepResult(name, False, error=str(e))

        if result.skipped:
            log(f"{YELLOW}SKIPPED{RESET} — {result.skip_reason}")
        elif result.success:
            log(f"{GREEN}OK{RESET}")
        else:
            log(f"{RED}FAIL{RESET}")
            if result.error:
                for line in result.error.strip().splitlines()[:5]:
                    log(f"  {line}")

        build_results.append(result)

    # ------------------------------------------------------------------
    # FASE 2: Empaquetado de Cortex
    # ------------------------------------------------------------------
    header("FASE 2 — Empaquetado de Cortex (.blx)")
    print(f"\n  {BOLD}→ Cortex{RESET}")
    try:
        cortex_result = build_cortex(args.channel, args.production)
    except subprocess.TimeoutExpired:
        cortex_result = StepResult("Cortex", False, error="Timeout excedido (300s)")
    except Exception as e:
        cortex_result = StepResult("Cortex", False, error=str(e))

    if cortex_result.success:
        log(f"{GREEN}OK{RESET}  →  bloom-cortex.blx  v{cortex_result.version}  build {cortex_result.build}")
    else:
        log(f"{RED}FAIL{RESET}")
        if cortex_result.error:
            for line in cortex_result.error.strip().splitlines()[:5]:
                log(f"  {line}")

    build_results.append(cortex_result)

    # ------------------------------------------------------------------
    # FASE 3: Verificación post-build
    # ------------------------------------------------------------------
    verify_results: list[StepResult] = []

    if not args.skip_verify:
        header("FASE 3 — Verificación post-build")
        contracts = get_contracts(args.verify_env)
        log(f"Verificando en: {get_bin_base(args.verify_env)}")
        for contract in contracts:
            print(f"\n  {BOLD}→ {contract.name}{RESET}")
            vr = verify_binary(contract)
            if vr.success:
                log(f"{GREEN}OK{RESET}  →  v{vr.version}  build {vr.build}")
            else:
                log(f"{RED}FAIL{RESET}  —  {vr.error}")
            verify_results.append(vr)

        # Cortex: leer desde cortex.meta.json (no es ejecutable)
        print(f"\n  {BOLD}→ Cortex (meta){RESET}")
        meta_path = BUILDS["cortex"].parent / "cortex.meta.json"
        try:
            with meta_path.open("r", encoding="utf-8") as f:
                meta = json.load(f)
            vr = StepResult("Cortex", True,
                            version=meta.get("version"),
                            build=meta.get("build_number"))
            log(f"{GREEN}OK{RESET}  →  v{vr.version}  build {vr.build}")
        except Exception as e:
            vr = StepResult("Cortex", False, error=str(e))
            log(f"{RED}FAIL{RESET}  —  {e}")
        verify_results.append(vr)

        # Bootstrap: leer desde bootstrap.meta.json (no es ejecutable)
        print(f"\n  {BOLD}→ Bootstrap (meta){RESET}")
        bootstrap_meta_path = BUILDS["bootstrap"].parent / "bootstrap.meta.json"
        try:
            with bootstrap_meta_path.open("r", encoding="utf-8") as f:
                bmeta = json.load(f)
            vr = StepResult("Bootstrap", True,
                            version=bmeta.get("version"),
                            build=bmeta.get("build_number"))
            log(f"{GREEN}OK{RESET}  →  v{vr.version}  build {vr.build}")
        except Exception as e:
            vr = StepResult("Bootstrap", False, error=str(e))
            log(f"{RED}FAIL{RESET}  —  {e}")
        verify_results.append(vr)

    else:
        log("Verificación omitida (--skip-verify)")

    # ------------------------------------------------------------------
    # Resumen y errores
    # ------------------------------------------------------------------
    print_errors(build_results + verify_results)
    print_summary(build_results, verify_results)

    # ------------------------------------------------------------------
    # FASE 5: verify-sync (solo si --verify-env prod)
    # verify-sync es una herramienta post-instalación: compara los binarios
    # desplegados en AppData contra metamorph.json. Solo tiene sentido
    # ejecutarla cuando todos los componentes ya fueron instalados.
    # En entorno dev los binarios viven en installer/native/bin/win64
    # y varios (Host, Sensor) pueden no estar presentes, lo que provocaría
    # falsos negativos. Por eso se omite en dev.
    # ------------------------------------------------------------------
    if args.verify_env == "prod" and not args.skip_verify:
        header("FASE 5 — Verify-sync (entorno producción)")
        metamorph_prod = get_bin_base("prod") / "metamorph/metamorph.exe"
        if metamorph_prod.exists():
            log(f"Ejecutando verify-sync contra AppData ...")
            code, out, err = run([str(metamorph_prod), "--json", "verify-sync"])
            if code == 0:
                log(f"{GREEN}OK{RESET}  — todos los binarios en sync con metamorph.json")
            else:
                log(f"{RED}FAIL{RESET}  — verify-sync reportó componentes faltantes o drifted")
                log(f"  Correr 'metamorph rollout' para redesplegar los binarios faltantes")
        else:
            log(f"{YELLOW}SKIP{RESET}  — metamorph.exe no encontrado en prod ({metamorph_prod})")
            log(f"  El installer aún no fue ejecutado. Correr verify-sync manualmente después.")
    elif args.verify_env == "dev":
        header("FASE 5 — Verify-sync")
        log(f"{YELLOW}SKIP{RESET}  — verify-sync omitido en entorno dev")
        log(f"  verify-sync es una verificación post-instalación.")
        log(f"  Usarlo con: python build-all.py --verify-env prod")
        log(f"  O manualmente después del installer: metamorph verify-sync")

    # ------------------------------------------------------------------
    # FASE 4: Telemetría
    # ------------------------------------------------------------------
    header("FASE 6 — Telemetría")
    log_path = get_log_path()
    print(f"  Log: {log_path}", flush=True)

    write_log(log_path, build_results, verify_results, args.channel, args.verify_env)
    log(f"{GREEN}OK{RESET}  →  log escrito")

    register_telemetry(log_path, build_results)

    # Exit code: 0 si todo OK, 1 si algún build falló
    failed = [r for r in build_results if not r.success and not r.skipped]
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()