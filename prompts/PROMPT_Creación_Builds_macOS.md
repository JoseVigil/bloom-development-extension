# Prompt 2 — Creación de scripts macOS en `builds/macos/`

## Contexto del proyecto

Proyecto BTIPS/BloomNucleus — sistema multi-componente con binarios Go (Nucleus, Sentinel, Metamorph, Sensor), un host C++ (bloom-host), y Brain (Python/PyInstaller). Los builds de Windows ya existen; los de macOS se están creando por primera vez como parte de la migración cross-platform.

Nueva estructura canónica de build:
```
builds/
  macos/      ← scripts .sh que vas a crear
  common/     ← helpers compartidos que también vas a crear
```

Helpers disponibles en `builds/common/` (creados en paralelo, podés asumir que existen):
- `detect-arch.sh` — exporta `$BIN_ARCH` (`darwin_arm64` o `darwin_x64`) y `$ARCH` (`arm64` o `x86_64`)
- `go-flags.sh` — exporta `$GO_LDFLAGS` (`-s -w -trimpath`) y funciones de logging
- `log.sh` — funciones `log_info`, `log_ok`, `log_error`

Para usarlos: `source "$SCRIPT_DIR/../common/detect-arch.sh"`

---

## Componentes a crear

### Grupo A — Binarios Go (mismo patrón, nombres distintos)

Para cada uno de estos 4 componentes, crear `builds/macos/<componente>.sh`:

| Componente | Directorio fuente en el repo | Binario output | Tiene `.sh` existente como referencia |
|---|---|---|---|
| nucleus | `installer/nucleus/` | `nucleus` | Sí — `installer/nucleus/scripts/build-darwin.sh` |
| sentinel | `installer/sentinel/` | `sentinel` | Sí — `installer/sentinel/scripts/build-darwin.sh` |
| metamorph | `installer/metamorph/` | `metamorph` | No — crear desde cero |
| sensor | `installer/sensor/` | `bloom-sensor` | No — crear desde cero |

**Para nucleus y sentinel:** se te va a pasar el contenido actual de sus `build-darwin.sh`. Tomarlo como fuente de verdad para la lógica de build, pero:
- Adaptar los paths al nuevo `SCRIPT_DIR` (`builds/macos/` → repo root es `../..`)
- Reemplazar la detección de arquitectura inline por `source "$SCRIPT_DIR/../common/detect-arch.sh"`
- Reemplazar flags de go build inline por `source "$SCRIPT_DIR/../common/go-flags.sh"` si aplica

**Para metamorph y sensor:** inferir la lógica a partir del patrón de nucleus/sentinel. El `go.mod` de cada uno está en `installer/<componente>/`. Preguntar si hay flags especiales antes de asumir.

**Template base para todos los Go:**
```bash
#!/usr/bin/env bash
# builds/macos/<componente>.sh — build macOS para <Componente>
# Migrado/creado como parte de la reorganización builds/
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

source "$SCRIPT_DIR/../common/detect-arch.sh"
source "$SCRIPT_DIR/../common/log.sh"

OUTPUT_DIR="$REPO_ROOT/installer/native/bin/$BIN_ARCH/<componente>"
mkdir -p "$OUTPUT_DIR"

log_info "Building <Componente> for $ARCH → $OUTPUT_DIR"

cd "$REPO_ROOT/installer/<componente>"
go build \
  -ldflags="-s -w" \
  -trimpath \
  -o "$OUTPUT_DIR/<binario>" \
  .  # o ./cmd/<componente>/... según estructura

# Verificar output
if [[ ! -f "$OUTPUT_DIR/<binario>" ]]; then
  log_error "Build fallido — binario no encontrado en $OUTPUT_DIR"
  exit 1
fi

log_ok "<Componente> built: $OUTPUT_DIR/<binario>"
```

---

### Grupo B — Host C++ (`builds/macos/host.sh`)

El host ya tiene `installer/host/build.sh` como referencia. Pasar ese contenido. Adaptar:
- Paths al nuevo SCRIPT_DIR
- Asegurar que detecta arquitectura via `detect-arch.sh` para definir el output correcto
- Output: `installer/native/bin/$BIN_ARCH/host/bloom-host`
- Toolchain: `clang++` en macOS (en lugar de `g++`/MinGW que usa Windows)
- Flags macOS específicos: `-mmacosx-version-min=10.15` y linker flags de OpenSSL via `$(brew --prefix openssl)`

**Verificación OpenSSL:** el script debe fallar con mensaje claro si OpenSSL no está disponible:
```bash
OPENSSL_PREFIX=$(brew --prefix openssl 2>/dev/null) || {
  log_error "OpenSSL no encontrado. Instalar con: brew install openssl"
  exit 1
}
```

---

### Grupo C — Brain Python/PyInstaller (`builds/macos/brain.sh`)

Brain es Python + PyInstaller. No hay `.sh` existente — crear desde cero.

Comportamiento esperado:
1. Detectar arquitectura → definir `$BIN_ARCH`
2. Crear/activar venv en `installer/brain/.venv`
3. `pip install -r installer/brain/requirements.txt`
4. `pip install pyinstaller`
5. Correr PyInstaller con `--onedir --name brain`
6. Output final: `installer/native/bin/$BIN_ARCH/brain/brain` (binario Mach-O, sin extensión)
7. Verificar que el binario existe y es ejecutable (`-x`)
8. Desactivar venv

**Nota crítica:** en macOS PyInstaller produce `brain` (Mach-O) + `_internal/` con `.dylib` y `.so`. No hay `.pyd`. El script NO debe verificar `brain.exe` — verificar `brain` sin extensión.

**Universal Binary (opcional, preguntar antes de implementar):** si se quiere un binario que corra tanto en Intel como en Apple Silicon sin Rosetta, hay que buildear dos veces y combinar con `lipo`. Solo implementar si se confirma que es un requerimiento.

---

### Grupo D — Helpers compartidos (`builds/common/`)

Crear los tres helpers que todos los scripts anteriores importan:

#### `builds/common/detect-arch.sh`
```bash
#!/usr/bin/env bash
# Exporta: ARCH (arm64|x86_64) y BIN_ARCH (darwin_arm64|darwin_x64)
ARCH=$(uname -m)
if [[ "$ARCH" == "arm64" ]]; then
  export BIN_ARCH="darwin_arm64"
else
  export BIN_ARCH="darwin_x64"
  ARCH="x86_64"
fi
export ARCH
```

#### `builds/common/go-flags.sh`
```bash
#!/usr/bin/env bash
# Exporta: GO_LDFLAGS con flags estándar de producción
export GO_LDFLAGS="-s -w"
export GO_BUILD_FLAGS="-trimpath"
```

#### `builds/common/log.sh`
```bash
#!/usr/bin/env bash
log_info()  { echo "→ $*"; }
log_ok()    { echo "✅ $*"; }
log_error() { echo "❌ $*" >&2; }
```

---

## Patch para `build-all.py`

Además de los scripts, producir el patch completo de `build-all.py` que:

1. Agrega la función `_build_script()` con la nueva ruta base `builds/<plataforma>/`:
```python
def _build_script(component: str) -> Path:
    if sys.platform == "win32":
        return ROOT / "builds" / "windows" / f"{component}.bat"
    elif sys.platform == "darwin":
        return ROOT / "builds" / "macos" / f"{component}.sh"
    else:
        return ROOT / "builds" / "linux" / f"{component}.sh"
```

2. Actualiza el diccionario `BUILDS`:
```python
BUILDS = {
    "brain":     ROOT / "builds" / ("windows/brain.ps1" if sys.platform == "win32" else f"{_platform_dir()}/brain.sh"),
    "nucleus":   _build_script("nucleus"),
    "sentinel":  _build_script("sentinel"),
    "metamorph": _build_script("metamorph"),
    "sensor":    _build_script("sensor"),
    "host":      _build_script("host"),
    "conductor": ROOT / "installer/conductor",
    "cortex":    ROOT / "installer/cortex/build-cortex/package.py",
    "bootstrap": ROOT / "installer/bootstrap/version-bootstrap.py",
    "vsix":      ROOT,
}
```

3. Renombra `build_bat()` → `build_script()` con soporte para `bash`:
```python
def build_script(component: str, script_path: Path) -> StepResult:
    if not script_path.exists():
        return StepResult(component, False, error=f"Script no encontrado: {script_path}")
    log(f"Ejecutando {script_path.name} ...")
    if sys.platform == "win32":
        cmd = ["cmd", "/c", str(script_path)]
    else:
        cmd = ["bash", str(script_path)]
    code, out, err = run(cmd, cwd=script_path.parent)
    if code != 0:
        return StepResult(component, False, error=err or out)
    return StepResult(component, True)
```

---

## Formato de respuesta esperado

Para cada componente o helper:

```
## <Componente/Helper>

### builds/macos/<nombre>.sh  (o builds/common/<nombre>.sh)
\`\`\`bash
<contenido completo>
\`\`\`

### Notas
- <decisiones tomadas, dependencias asumidas, preguntas si algo no está claro>
```

Al final, el patch completo de `build-all.py` en formato diff.

---

## Orden de trabajo recomendado

1. Crear primero los 3 helpers de `common/` (todo lo demás los importa)
2. nucleus.sh (tiene referencia — build-darwin.sh existente)
3. sentinel.sh (tiene referencia)
4. metamorph.sh (inferir desde patrón)
5. sensor.sh (inferir desde patrón — verificar nombre binario: `bloom-sensor` vs `sensor`)
6. host.sh (adaptar desde build.sh existente)
7. brain.sh (más complejo — PyInstaller)
8. Patch build-all.py
