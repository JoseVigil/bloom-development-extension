"""
Bloom Build All
===============
Orquestador maestro de builds para todos los componentes del ecosistema Bloom.

Secuencia de ejecución:
  1. Brain        → build_brain.ps1
  2. Nucleus      → installer/nucleus/scripts/build.bat
  3. Sentinel     → installer/sentinel/scripts/build.bat
  4. Host         → skipped on Windows (Linux build via installer/host/build.sh)
  5. Conductor    → cd installer/conductor && npm run build:launcher
  6. Metamorph    → installer/metamorph/scripts/build.bat
  7. Cortex       → installer/cortex/build-cortex/package.py
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
    """Genera el path del log con timestamp del dia: build_all_YYYYMMDD.log"""
    ts = datetime.now().strftime("%Y%m%d")
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

    ts_run = datetime.now().strftime("%Y-%m-%dT%H:%M:%SZ")

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


def register_telemetry(log_path: Path) -> None:
    """
    Registra el stream en telemetry.json via nucleus telemetry register.
    Nucleus es el UNICO escritor de telemetry.json — nunca escribir directo.
    """
    if not NUCLEUS_EXE.exists():
        print(f"  {YELLOW}[telemetry] nucleus.exe no encontrado en {NUCLEUS_EXE} — registro omitido{RESET}", flush=True)
        return

    cmd = [
        str(NUCLEUS_EXE),
        "telemetry", "register",
        "--stream",   BUILD_ALL_STREAM,
        "--label",    BUILD_ALL_LABEL,
        "--path",     str(log_path).replace(chr(92), "/"),
        "--priority", str(BUILD_ALL_PRIORITY),
    ]

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


# ---------------------------------------------------------------------------
# Rutas — relativas a la raíz del repositorio (donde vive este script)
# ---------------------------------------------------------------------------

ROOT = Path(__file__).parent.resolve()

BUILDS = {
    "brain":      ROOT / "build_brain.ps1",
    "nucleus":    ROOT / "installer/nucleus/scripts/build.bat",
    "sentinel":   ROOT / "installer/sentinel/scripts/build.bat",
    "metamorph":  ROOT / "installer/metamorph/scripts/build.bat",
    "conductor":  ROOT / "installer/conductor",          # cwd para npm
    "cortex":     ROOT / "installer/cortex/build-cortex/package.py",
}

CORTEX_SOURCE = ROOT / "installer/cortex/extension"
CORTEX_OUTPUT = ROOT / "installer/native/bin/cortex"

# ---------------------------------------------------------------------------
# Contratos de interrogación por componente
# Cada entrada define cómo obtener versión y build_number del binario ya buildeado.
# ---------------------------------------------------------------------------

# BIN_BASE se resuelve en runtime según --verify-env (ver get_bin_base())
_PROD_BIN_BASE = Path(os.environ.get("BLOOM_NUCLEUS_HOME",
    Path.home() / "AppData/Local/BloomNucleus/bin"
))
_DEV_BIN_BASE  = ROOT / "installer/native/bin/win64"

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
    ps1       = str(b / "conductor/win-unpacked/bloom-conductor-version.ps1")
    ps1_setup = str(b / "setup/win-unpacked/bloom-setup-version.ps1")

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

def run(cmd: list[str], cwd: Path = ROOT, timeout: int = 300) -> tuple[int, str, str]:
    """
    Ejecuta un comando mostrando su output en tiempo real (streaming).
    Retorna (returncode, stdout_completo, stderr_completo).
    Fuerza UTF-8 con reemplazo de caracteres inválidos para evitar
    UnicodeDecodeError en consolas Windows con codepage CP1252.
    """
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
    log("Ejecutando npm run build:launcher ...")
    # En Windows npm es npm.cmd, no un ejecutable directo
    npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"
    code, out, err = run(
        [npm_cmd, "run", "build:launcher"],
        cwd=conductor_dir,
    )
    if code != 0:
        return StepResult("Conductor", False, error=err or out)
    return StepResult("Conductor", True)


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
                    build=int(build) if build is not None else None,
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
                    build=int(build) if build is not None else None,
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

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Bloom Build All — orquestador maestro de builds."
    )
    parser.add_argument(
        "--channel", default="stable", choices=["stable", "beta", "dev"],
        help="Release channel para todos los builds (default: stable)"
    )
    parser.add_argument(
        "--production", action="store_true",
        help="Excluye archivos .map del paquete Cortex"
    )
    parser.add_argument(
        "--skip-verify", action="store_true",
        help="Omite la verificación post-build de los binarios"
    )
    parser.add_argument(
        "--verify-env", default="dev", choices=["dev", "prod"],
        help="Entorno de verificacion: dev=installer/native/bin/win64 prod=BloomNucleus/bin"
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

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
    else:
        log("Verificación omitida (--skip-verify)")

    # ------------------------------------------------------------------
    # Resumen y errores
    # ------------------------------------------------------------------
    print_errors(build_results + verify_results)
    print_summary(build_results, verify_results)

    # ------------------------------------------------------------------
    # FASE 4: Telemetría
    # ------------------------------------------------------------------
    header("FASE 4 — Telemetría")
    log_path = get_log_path()
    print(f"  Log: {log_path}", flush=True)

    write_log(log_path, build_results, verify_results, args.channel, args.verify_env)
    log(f"{GREEN}OK{RESET}  →  log escrito")

    register_telemetry(log_path)

    # Exit code: 0 si todo OK, 1 si algún build falló
    failed = [r for r in build_results if not r.success and not r.skipped]
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()