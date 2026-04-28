# BTIPS — Guía de Migración Cross-Platform
## Windows 32/64 ↔ macOS Darwin
**Basado en análisis de código real — v1.0**

---

## Estado general del esfuerzo

Después de analizar los 8 archivos centrales del proyecto, el diagnóstico es más favorable de lo esperado. El **60% del trabajo ya está hecho** por diseño. El 40% restante está muy concentrado en 5 zonas específicas, la mayoría de ellas en el Sensor (Go) y el instalador (JS).

**Estimación de esfuerzo total:** 3–5 semanas de trabajo enfocado, con 0 cambios en la VSCode Extension, 0 cambios en Contracts, y 0 cambios en Synapse/IonPump.

---

## Parte 1: Lo que ya funciona en macOS (no tocar)

### VSCode Extension (TypeScript)
Todo el código en `bloom-development-extension/src/` es 100% cross-platform. Las APIs de VSCode abstraen el sistema operativo completamente. No requiere ningún cambio.

### Contracts
`installer/contracts/types.ts`, `state-machines.ts`, `websocket-protocol.ts` son tipos y contratos puros. Sin dependencias de OS.

### Synapse Protocol / IonPump
El protocolo usa TCP localhost. Agnóstico de plataforma por diseño.

### `admin-utils.js`
Este archivo ya tiene el guard correcto:

```javascript
async function isElevated() {
  if (process.platform !== 'win32') return true;  // ← macOS siempre retorna true
  // ...
}
```

En macOS la instalación va a `~/Library/Application Support/BloomNucleus` — no requiere privilegios de sistema. Este archivo no necesita cambios.

### `chromium-installer.js`
Este archivo es el más completo del proyecto en términos de portabilidad. Ya tiene:
- Triple branch `win32 / darwin / linux` en `getChromiumPaths()`
- Path correcto para macOS: `Chromium.app/Contents/MacOS/Chromium`
- `setExecutablePermissions()` con `chmod 0o755` y manejo de `Helpers/`
- Extracción via `unzip` en unix, PowerShell en Windows
- Smoke test cross-platform

**No requiere cambios.**

### `main_conductor.js`
Prácticamente listo. Usa `paths` de `global_paths.js` para todo. El único detalle menor es el ícono:

```javascript
icon: path.join(__dirname, 'assets', 'bloom.ico'),  // .ico solo para Windows
```

En macOS Electron acepta `.icns`. Esto no rompe la aplicación (Electron lo ignora silenciosamente), pero para producción hay que agregar un `.icns`.

---

## Parte 2: Correcciones menores (1–3 líneas cada una)

### 2.1 `global_paths.js` — Arch detection

**Problema:** La detección de arquitectura siempre resuelve a variantes de Windows.

```javascript
// ACTUAL — rompe en macOS
const arch = os.arch() === 'x64' ? 'win64' : 'win32';
```

**Corrección:**

```javascript
// CORRECTO
function getPlatformArch() {
  const plat = os.platform();
  const a = os.arch();
  if (plat === 'win32') {
    return a === 'x64' ? 'win64' : 'win32';
  } else if (plat === 'darwin') {
    return a === 'arm64' ? 'arm64' : 'x64';
  }
  return a;
}
const arch = getPlatformArch();
```

Esto impacta a todos los `getResourcePath()` que usan `arch`, haciendo que apunten correctamente a `native/bin/darwin/x64/nucleus` en lugar de `native/bin/win64/nucleus`.

**Además**, el `chromeDir` y `chromeExe` están hardcodeados a Windows:

```javascript
// ACTUAL
chromeDir: path.join(baseDir, 'bin', 'chrome-win'),
chromeExe: platform === 'win32'
  ? path.join(baseDir, 'bin', 'chrome-win', 'chrome.exe')
  : null,  // ← null en macOS rompe cualquier check de existencia
```

```javascript
// CORRECTO
chromeDir: platform === 'win32'
  ? path.join(baseDir, 'bin', 'chrome-win')
  : path.join(baseDir, 'bin', 'chrome-mac'),
chromeExe: platform === 'win32'
  ? path.join(baseDir, 'bin', 'chrome-win', 'chrome.exe')
  : path.join(baseDir, 'bin', 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
```

### 2.2 `paths.py` — Binary paths con `.exe` hardcodeado

**Problema:** Cuatro properties tienen `.exe` fijo.

```python
# ACTUAL — rompe en macOS
@property
def nucleus_exe(self) -> Path:
    return self.bin_dir / "nucleus" / "nucleus.exe"
```

**Corrección:** Agregar un helper privado y usarlo en todas las properties de binarios.

```python
def _exe_name(self, stem: str) -> str:
    """Retorna el nombre del binario con extensión correcta para la plataforma."""
    suffix = ".exe" if platform.system() == "Windows" else ""
    return stem + suffix

@property
def nucleus_exe(self) -> Path:
    return self.bin_dir / "nucleus" / self._exe_name("nucleus")

@property
def sentinel_exe(self) -> Path:
    return self.bin_dir / "sentinel" / self._exe_name("sentinel")

@property
def conductor_exe(self) -> Path:
    return self.bin_dir / "conductor" / self._exe_name("bloom-conductor")

@property
def sensor_exe(self) -> Path:
    return self.bin_dir / "sensor" / self._exe_name("bloom-sensor")
```

### 2.3 `main.js` (installer) — `preflight-checks` hardcodeado

**Problema:** El check de preflight hardcodea `.exe` ignorando el ternario que ya existe en `paths`.

```javascript
// ACTUAL
const nucleusExe = path.join(BLOOM_BASE, 'bin', 'nucleus', 'nucleus.exe');

// CORRECTO — usar paths que ya tiene el ternario correcto
const nucleusExe = paths.nucleusExe;
```

### 2.4 `installer.js` — Python `.pth` con separadores Windows

**Problema:** El archivo de configuración de Python usa `\\` hardcodeado.

```javascript
// ACTUAL
const pthContent = ['.', 'python310.zip', 'Lib', 'Lib\\site-packages'].join('\n');
```

En macOS la estructura del Python bundleado es diferente: `bin/python3`, `lib/python3.x/site-packages`. El `.pth` de Windows no aplica en macOS — el runtime bundleado para mac tiene su propio layout. Esta sección entera necesita un branch de plataforma:

```javascript
if (platform === 'win32') {
  const pthFile = path.join(paths.runtimeDir, 'python310._pth');
  const pthContent = ['.', 'python310.zip', 'Lib', 'Lib\\site-packages'].join('\n');
  await fs.writeFile(pthFile, pthContent, 'utf8');
} else {
  // macOS: el runtime tiene su propio layout, no necesita .pth
  // Solo verificar que existe el binario
}
```

---

## Parte 3: Trabajo real — Go (Sentinel / Sensor)

Este es el núcleo del esfuerzo. Los subproyectos Go usan build tags correctamente (`//go:build windows`), lo que significa que el compilador ya sabe que estos archivos son Windows-only. El trabajo es crear los archivos `_darwin.go` equivalentes.

### 3.1 `sentinel/internal/core/paths.go` — Reescritura completa

**Problema:** Hardcodeado a `LOCALAPPDATA`, `USERPROFILE`, y `nucleus.exe`.

```go
// ACTUAL — solo Windows
localAppData := os.Getenv("LOCALAPPDATA")
if localAppData == "" {
    localAppData = filepath.Join(os.Getenv("USERPROFILE"), "AppData", "Local")
}
appDataDir := filepath.Join(localAppData, "BloomNucleus")
nucleusBin := filepath.Join(binDir, "nucleus", "nucleus.exe")
```

**Solución:** El patrón Go correcto es extraer la resolución de `appDataDir` a un archivo por plataforma.

**Crear `paths_windows.go`:**
```go
//go:build windows

package core

import (
    "os"
    "path/filepath"
)

func resolveAppDataDir() string {
    localAppData := os.Getenv("LOCALAPPDATA")
    if localAppData == "" {
        localAppData = filepath.Join(os.Getenv("USERPROFILE"), "AppData", "Local")
    }
    return filepath.Join(localAppData, "BloomNucleus")
}

func nucleusBinaryName() string { return "nucleus.exe" }
```

**Crear `paths_darwin.go`:**
```go
//go:build darwin

package core

import (
    "os"
    "path/filepath"
)

func resolveAppDataDir() string {
    home := os.Getenv("HOME")
    if home == "" {
        home, _ = os.UserHomeDir()
    }
    return filepath.Join(home, "Library", "Application Support", "BloomNucleus")
}

func nucleusBinaryName() string { return "nucleus" }
```

**`paths.go` modificado** (agnóstico de plataforma):
```go
package core

import (
    "os"
    "path/filepath"
    "strings"
)

type Paths struct {
    BinDir       string
    SentinelDir  string
    AppDataDir   string
    ProfilesDir  string
    LogsDir      string
    TelemetryDir string
    NucleusBin   string
}

func InitPaths() (*Paths, error) {
    exe, err := os.Executable()
    if err != nil {
        return nil, err
    }
    sentinelDir := filepath.Dir(exe)
    binDir := filepath.Dir(sentinelDir)

    appDataDir := resolveAppDataDir()  // ← función por plataforma
    nucleusBin := filepath.Join(binDir, "nucleus", nucleusBinaryName())  // ← función por plataforma

    paths := &Paths{
        BinDir:       binDir,
        SentinelDir:  sentinelDir,
        AppDataDir:   appDataDir,
        ProfilesDir:  filepath.Join(appDataDir, "profiles"),
        LogsDir:      filepath.Join(appDataDir, "logs"),
        TelemetryDir: filepath.Join(appDataDir, "logs"),
        NucleusBin:   nucleusBin,
    }
    // resto igual...
    return paths, nil
}
```

**El mismo patrón aplica a `nucleus/internal/core/paths.go` y `metamorph/internal/core/paths.go`.** Los tres usan la misma arquitectura — crear `paths_windows.go` y `paths_darwin.go` en cada uno.

### 3.2 `sensor/internal/session/windows.go` → Crear `session_darwin.go`

El Sensor detecta si la sesión del usuario está activa (no bloqueada). En Windows usa `wtsapi32.dll`. En macOS el equivalente es consultar el estado del screensaver / CGSession.

**Crear `session_darwin.go`:**
```go
//go:build darwin

package session

import (
    "os/exec"
    "strings"
)

type Manager struct{}

func NewManager() *Manager { return &Manager{} }

// IsSessionActive devuelve true si la sesión macOS está activa (no bloqueada).
// Usa `ioreg` para leer el estado de CGSSession. Si falla, asume activa.
func (m *Manager) IsSessionActive() bool {
    // CGSSessionScreenIsLocked es la clave oficial de Apple para session lock
    out, err := exec.Command("ioreg", "-n", "Root", "-d1").Output()
    if err != nil {
        return true // degradación elegante
    }
    // Si la pantalla está bloqueada, "CGSSessionScreenIsLocked" = Yes
    return !strings.Contains(string(out), `"CGSSessionScreenIsLocked" = Yes`)
}

func (m *Manager) IsSessionLocked() bool {
    return !m.IsSessionActive()
}
```

> **Alternativa más robusta:** Usar `CGSessionCopyCurrentDictionary()` via `cgo`. Más confiable pero añade dependencia de CGo. Para MVP, `ioreg` es suficiente.

### 3.3 `sensor/internal/startup/startup_windows.go` → Crear `startup_darwin.go`

Este es el cambio conceptualmente más distinto. El autostart en Windows usa el Registry; en macOS usa **LaunchAgents** (archivos plist en `~/Library/LaunchAgents/`).

**Crear `startup_darwin.go`:**
```go
//go:build darwin

package startup

import (
    "fmt"
    "os"
    "os/exec"
    "path/filepath"
    "text/template"
    "bytes"

    "bloom-sensor/internal/cmdregistry"
    "bloom-sensor/internal/core"
    "github.com/spf13/cobra"
)

const plistLabel = "com.bloom.sensor"

func plistPath() string {
    home, _ := os.UserHomeDir()
    return filepath.Join(home, "Library", "LaunchAgents", plistLabel+".plist")
}

const plistTemplate = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>{{.Label}}</string>
    <key>ProgramArguments</key>
    <array>
        <string>{{.ExePath}}</string>
        <string>run</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>
    <key>StandardOutPath</key>
    <string>{{.LogPath}}</string>
    <key>StandardErrorPath</key>
    <string>{{.LogPath}}</string>
</dict>
</plist>`

type plistData struct {
    Label   string
    ExePath string
    LogPath string
}

func Enable(installPath string) error {
    exePath := filepath.Join(installPath, "bloom-sensor")
    home, _ := os.UserHomeDir()
    logPath := filepath.Join(home, "Library", "Logs", "BloomNucleus", "bloom-sensor.log")

    // Asegurar que existe el directorio de logs
    if err := os.MkdirAll(filepath.Dir(logPath), 0755); err != nil {
        return fmt.Errorf("no se pudo crear directorio de logs: %w", err)
    }

    // Asegurar que existe ~/Library/LaunchAgents/
    launchAgentsDir := filepath.Dir(plistPath())
    if err := os.MkdirAll(launchAgentsDir, 0755); err != nil {
        return fmt.Errorf("no se pudo crear LaunchAgents: %w", err)
    }

    // Generar plist
    tmpl, err := template.New("plist").Parse(plistTemplate)
    if err != nil {
        return err
    }
    var buf bytes.Buffer
    if err := tmpl.Execute(&buf, plistData{
        Label:   plistLabel,
        ExePath: exePath,
        LogPath: logPath,
    }); err != nil {
        return err
    }

    // Escribir plist
    if err := os.WriteFile(plistPath(), buf.Bytes(), 0644); err != nil {
        return fmt.Errorf("no se pudo escribir plist: %w", err)
    }

    // Cargar en launchd (equivalente a registrar en HKCU Run)
    if err := exec.Command("launchctl", "load", plistPath()).Run(); err != nil {
        // No fatal — el plist está ahí, cargará en el próximo login
        fmt.Printf("⚠️  launchctl load warning: %v\n", err)
    }

    return nil
}

func Disable() error {
    p := plistPath()

    // Descargar de launchd
    _ = exec.Command("launchctl", "unload", p).Run()

    // Eliminar el plist
    if err := os.Remove(p); err != nil && !os.IsNotExist(err) {
        return fmt.Errorf("no se pudo eliminar plist: %w", err)
    }
    return nil
}

func IsEnabled() (bool, string) {
    p := plistPath()
    if _, err := os.Stat(p); os.IsNotExist(err) {
        return false, ""
    }
    return true, p
}

// RegisterCommands — mismo contrato que startup_windows.go
func RegisterCommands(c *core.Core) {
    cmdregistry.Register(func() *cobra.Command { return newStatusCommand(c) })
    cmdregistry.Register(func() *cobra.Command { return newEnableCommand(c) })
    cmdregistry.Register(func() *cobra.Command { return newDisableCommand(c) })
}

// newStatusCommand, newEnableCommand, newDisableCommand — mismos que en Windows
// (omitidos por brevedad — copiar de startup_windows.go, el código Cobra es idéntico)
```

> **Nota de diseño:** El contrato de `Enable(installPath string)`, `Disable()`, e `IsEnabled()` es idéntico en ambas plataformas. Solo cambia la implementación. Los comandos Cobra en `newEnableCommand` etc. pueden ser literalmente copiados de `startup_windows.go` sin cambios.

---

## Parte 4: Infraestructura del Installer — Los servicios Windows

### 4.1 `service-installer-brain.js` — El problema central

Este archivo está íntegramente construido sobre NSSM y `sc` (Service Control). En macOS no existe ninguno de los dos. **No se puede portar — hay que construir el equivalente.**

El equivalente macOS para un servicio de background es un **LaunchDaemon** (si corre como sistema) o un **LaunchAgent** (si corre en contexto de usuario). Para Brain, que necesita acceso al entorno del usuario (perfil, AppData), la opción correcta es **LaunchAgent**.

**Nuevo archivo `service-installer-brain-darwin.js`:**

```javascript
// service-installer-brain-darwin.js
// macOS equivalent of service-installer-brain.js
// Uses launchd LaunchAgents instead of NSSM

const fs = require('fs-extra');
const path = require('path');
const { execSync, exec } = require('child_process');
const { paths } = require('../config/paths');
const os = require('os');

const PLIST_LABEL = 'com.bloom.brain';
const PLIST_NAME  = `${PLIST_LABEL}.plist`;

function getPlistPath() {
  return path.join(os.homedir(), 'Library', 'LaunchAgents', PLIST_NAME);
}

function generatePlist(binaryPath, logPath) {
  const workDir = path.dirname(binaryPath);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${PLIST_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${binaryPath}</string>
        <string>service</string>
        <string>start</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${workDir}</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PYTHONUNBUFFERED</key>
        <string>1</string>
        <key>PYTHONIOENCODING</key>
        <string>utf-8</string>
        <key>HOME</key>
        <string>${os.homedir()}</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
    </dict>
    <key>StandardOutPath</key>
    <string>${logPath}</string>
    <key>StandardErrorPath</key>
    <string>${logPath}</string>
    <key>ThrottleInterval</key>
    <integer>10</integer>
</dict>
</plist>`;
}

async function installLaunchdService() {
  console.log('\n🤖 INSTALANDO BRAIN SERVICE (macOS LaunchAgent)\n');

  const binaryPath = paths.brainExe;
  const logDir = path.join(paths.logsDir, 'brain', 'service');
  await fs.ensureDir(logDir);
  const serviceLog = path.join(logDir, 'brain_service.log');
  const launchAgentsDir = path.join(os.homedir(), 'Library', 'LaunchAgents');
  const plistPath = getPlistPath();

  if (!await fs.pathExists(binaryPath)) {
    throw new Error(`Brain binary not found: ${binaryPath}`);
  }

  // Asegurar permisos de ejecución
  await fs.chmod(binaryPath, 0o755);

  // Descargar si ya existe
  if (await fs.pathExists(plistPath)) {
    try { execSync(`launchctl unload "${plistPath}"`, { stdio: 'ignore' }); } catch (_) {}
    await fs.remove(plistPath);
  }

  await fs.ensureDir(launchAgentsDir);
  const plistContent = generatePlist(binaryPath, serviceLog);
  await fs.writeFile(plistPath, plistContent, 'utf8');

  console.log(`✅ LaunchAgent plist written: ${plistPath}`);
  return true;
}

async function startService() {
  const plistPath = getPlistPath();
  try {
    execSync(`launchctl load "${plistPath}"`, { stdio: 'pipe' });
    await new Promise(r => setTimeout(r, 2000));
    console.log('✅ Brain LaunchAgent loaded');
    return true;
  } catch (e) {
    console.error(`❌ launchctl load failed: ${e.message}`);
    return false;
  }
}

async function removeService() {
  const plistPath = getPlistPath();
  try { execSync(`launchctl unload "${plistPath}"`, { stdio: 'ignore' }); } catch (_) {}
  try { await fs.remove(plistPath); } catch (_) {}
}

async function cleanupOldServices() {
  await removeService();
  // Matar procesos huérfanos de brain en macOS
  try { execSync('pkill -f "brain service"', { stdio: 'ignore' }); } catch (_) {}
}

module.exports = {
  installWindowsService: installLaunchdService, // mismo nombre de export para compatibilidad
  startService,
  removeService,
  cleanupOldServices,
  NEW_SERVICE_NAME: PLIST_LABEL,
  OLD_SERVICE_NAME: PLIST_LABEL
};
```

### 4.2 Cómo integrar en `installer.js`

La forma más limpia es hacer que `installer.js` cargue el módulo correcto según la plataforma:

```javascript
// ANTES
const { installWindowsService, startService, ... } = require('./service-installer-brain.js');

// DESPUÉS
const brainInstaller = process.platform === 'darwin'
  ? require('./service-installer-brain-darwin.js')
  : require('./service-installer-brain.js');
const { installWindowsService, startService, cleanupOldServices, NEW_SERVICE_NAME } = brainInstaller;
```

El mismo patrón aplica para `service-installer-nucleus.js` y `service-installer-sensor.js`.

---

## Parte 5: Build del instalador — Electron Forge / Builder

El empaquetado del instalador es una dimensión separada. En Windows se genera un `.exe` con Squirrel/NSIS. En macOS hay dos opciones:

**Opción A — `.dmg` + `.app`** (recomendado para distribución)
```json
// forge.config.js — agregar maker de macOS
{
  "name": "@electron-forge/maker-dmg",
  "config": {
    "format": "ULFO",
    "icon": "src/assets/bloom.icns"
  }
}
```

**Opción B — `.pkg`** (recomendado si se necesita instalación desatendida o MDM)

La elección depende del modelo de distribución. Para uso interno/beta, `.dmg` es suficiente.

---

## Resumen de archivos a crear/modificar

| Archivo | Acción | Esfuerzo |
|---|---|---|
| `global_paths.js` | Modificar — arch detection + chrome paths | 20 min |
| `paths.py` | Modificar — helper `_exe_name()` | 20 min |
| `main.js` (installer) | Modificar — preflight usa `paths.nucleusExe` | 5 min |
| `installer.js` | Modificar — branch de plataforma para NSSM y .pth | 1 hora |
| `sentinel/core/paths_windows.go` | Crear nuevo | 30 min |
| `sentinel/core/paths_darwin.go` | Crear nuevo | 30 min |
| `nucleus/core/paths_windows.go` | Crear nuevo | 20 min |
| `nucleus/core/paths_darwin.go` | Crear nuevo | 20 min |
| `metamorph/core/paths_windows.go` | Crear nuevo | 20 min |
| `metamorph/core/paths_darwin.go` | Crear nuevo | 20 min |
| `sensor/session/session_darwin.go` | Crear nuevo | 2 horas |
| `sensor/startup/startup_darwin.go` | Crear nuevo | 2 horas |
| `service-installer-brain-darwin.js` | Crear nuevo | 3 horas |
| `service-installer-nucleus-darwin.js` | Crear nuevo | 2 horas |
| `service-installer-sensor-darwin.js` | Crear nuevo | 1 hora |
| `bloom.icns` | Crear — convertir bloom.ico | 30 min |
| `forge.config.js` | Modificar — agregar makers macOS | 1 hora |

**Total estimado: ~15–20 horas de código, más tiempo de QA e integración.**

---

## Orden recomendado de implementación

### Fase 1 — Quick wins (un día)
1. `global_paths.js` — arch fix y chrome paths
2. `paths.py` — helper `_exe_name()`
3. `main.js` — preflight fix
4. `paths_windows.go` + `paths_darwin.go` en los 3 subproyectos Go (Sentinel, Nucleus, Metamorph)

**Resultado:** El sistema puede compilar y resolver paths correctamente en macOS. Puedes correr Brain y los binarios Go en desarrollo.

### Fase 2 — Sensor (dos días)
5. `session_darwin.go` — detección de sesión macOS
6. `startup_darwin.go` — LaunchAgent autostart

**Resultado:** El Sensor compila y funciona en macOS.

### Fase 3 — Servicios del installer (dos días)
7. `service-installer-brain-darwin.js`
8. `service-installer-nucleus-darwin.js`
9. `service-installer-sensor-darwin.js`
10. Integración en `installer.js` con branch de plataforma

**Resultado:** El instalador completo funciona en macOS.

### Fase 4 — Empaquetado (un día)
11. `bloom.icns`
12. `forge.config.js` con makers macOS
13. Build y firma de la app (requiere Apple Developer ID para distribución)

---

## Parte 6: El sistema de build — `build-all.py` y los scripts de compilación

Este es uno de los puntos más importantes y más frecuentemente subestimados en una migración. El sistema de runtime puede portarse sin que el pipeline de build lo soporte, y el resultado es que no se puede compilar nada en macOS. Hay que tratar el sistema de build como un ciudadano de primera clase en la migración.

### 6.1 Diagnóstico actual de `build-all.py`

El orquestador es Python puro y su lógica de alto nivel **ya es casi cross-platform** — usa `pathlib.Path`, `subprocess`, y detecta `sys.platform` en varios puntos. Sin embargo, **cada función de build invoca herramientas que solo existen en Windows**.

El mapa completo de dependencias por componente:

| Componente | Script invocado | Herramienta | ¿Funciona en macOS? |
|---|---|---|---|
| Brain | `build_brain.ps1` | PowerShell | ✗ No nativo |
| Nucleus | `scripts/build.bat` | `cmd /c` | ✗ Solo Windows |
| Sentinel | `scripts/build.bat` | `cmd /c` | ✗ Solo Windows |
| Metamorph | `scripts/build.bat` | `cmd /c` | ✗ Solo Windows |
| Sensor | `scripts/build.bat` | `cmd /c` | ✗ Solo Windows |
| Conductor | `npm run build:all` | npm (ya usa `npm` vs `npm.cmd`) | ✓ Funciona |
| Bootstrap | `npm run build` | npm (ya usa `npm` vs `npm.cmd`) | ✓ Funciona |
| Vsix | `npm run package:vscode` | npm (ya usa `npm` vs `npm.cmd`) | ✓ Funciona |
| Cortex | `package.py` | Python puro | ✓ Funciona |
| Host | Skipped en Windows, `build.sh` en Linux | bash | ✓ Funciona en mac |

**Resumen:** 5 de los 11 pasos del build están bloqueados. Los 4 subproyectos Go (Nucleus, Sentinel, Metamorph, Sensor) usan `.bat`, y Brain usa `.ps1`. Son exactamente los componentes que también tienen las mayores fricciones en runtime.

### 6.2 Problema adicional: las constantes de paths en `build-all.py`

El script tiene hardcoding de plataforma en sus constantes globales:

```python
# ACTUAL — solo Windows
APPDATA        = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData/Local"))
NUCLEUS_HOME   = Path(os.environ.get("BLOOM_NUCLEUS_HOME", APPDATA / "BloomNucleus"))
NUCLEUS_EXE    = NUCLEUS_HOME / "bin/nucleus/nucleus.exe"

_DEV_BIN_BASE  = ROOT / "installer/native/bin/win64"
_PROD_BIN_BASE = NUCLEUS_HOME / "bin"

CORTEX_OUTPUT  = ROOT / "installer/native/bin/win64/cortex"
```

Y en `get_contracts()`, todos los paths de verificación usan `.exe`:

```python
brain     = str(b / "brain/brain.exe")
nucleus   = str(b / "nucleus/nucleus.exe")
sentinel  = str(b / "sentinel/sentinel.exe")
# ... todos con .exe
ps1       = str(b / "conductor/win-unpacked/bloom-conductor-version.ps1")
ps1_setup = str(b / "setup/win-unpacked/bloom-setup-version.ps1")
```

La verificación de Conductor y Setup usa PowerShell para leer versiones desde `.ps1` — esto no existe en macOS y hay que reemplazarlo.

### 6.3 Estrategia: clonar `.bat` → `.sh` y `.ps1` → `.sh`

La solución más directa y mantenible es crear scripts shell equivalentes para cada componente Go, y luego hacer que `build-all.py` seleccione el script correcto según la plataforma.

**Principio:** no modificar los `.bat` y `.ps1` existentes (siguen siendo necesarios para Windows). Crear un espejo `.sh` con la misma lógica.

#### Estructura de directorios resultante

```
installer/
  nucleus/scripts/
    build.bat        ← existente (Windows)
    build.sh         ← NUEVO (macOS/Linux)
  sentinel/scripts/
    build.bat        ← existente
    build.sh         ← NUEVO
  metamorph/scripts/
    build.bat        ← existente
    build.sh         ← NUEVO
  sensor/scripts/
    build.bat        ← existente
    build.sh         ← NUEVO
build_brain.ps1      ← existente (Windows)
build_brain.sh       ← NUEVO (macOS/Linux)
```

#### Contenido de los `.sh` para subproyectos Go

Los `.bat` de los subproyectos Go típicamente hacen lo mismo: `go build` con flags específicos apuntando al output correcto. El equivalente shell es directo. Ejemplo para Sentinel:

```bash
#!/usr/bin/env bash
# installer/sentinel/scripts/build.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Detectar arquitectura macOS (Intel vs Apple Silicon)
ARCH=$(uname -m)
if [[ "$ARCH" == "arm64" ]]; then
  BIN_ARCH="darwin_arm64"
else
  BIN_ARCH="darwin_x64"
fi

OUTPUT_DIR="$REPO_ROOT/installer/native/bin/$BIN_ARCH/sentinel"
mkdir -p "$OUTPUT_DIR"

echo "→ Building Sentinel for $ARCH → $OUTPUT_DIR"

cd "$SCRIPT_DIR/.."
go build \
  -ldflags="-s -w" \
  -o "$OUTPUT_DIR/sentinel" \
  ./cmd/sentinel/...

echo "✅ Sentinel built: $OUTPUT_DIR/sentinel"
```

El mismo patrón aplica a `nucleus/scripts/build.sh`, `metamorph/scripts/build.sh` y `sensor/scripts/build.sh`. Solo cambia el nombre del comando y el directorio de salida.

#### `build_brain.sh` — el más complejo

Brain es Python + PyInstaller. El proceso de build en macOS difiere del de Windows en el formato de salida y en las dependencias de compilación nativa.

```bash
#!/usr/bin/env bash
# build_brain.sh — equivalente de build_brain.ps1 para macOS
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ARCH=$(uname -m)
if [[ "$ARCH" == "arm64" ]]; then
  BIN_ARCH="darwin_arm64"
else
  BIN_ARCH="darwin_x64"
fi

OUTPUT_DIR="$REPO_ROOT/installer/native/bin/$BIN_ARCH/brain"
mkdir -p "$OUTPUT_DIR"

BRAIN_DIR="$REPO_ROOT/installer/brain"
VENV_DIR="$BRAIN_DIR/.venv"

echo "→ Setting up Python venv..."
python3 -m venv "$VENV_DIR"
source "$VENV_DIR/bin/activate"

echo "→ Installing dependencies..."
pip install --quiet -r "$BRAIN_DIR/requirements.txt"
pip install --quiet pyinstaller

echo "→ Running PyInstaller..."
cd "$BRAIN_DIR"
pyinstaller \
  --onedir \
  --name brain \
  --distpath "$OUTPUT_DIR/.." \
  --workpath "$BRAIN_DIR/build" \
  --noconfirm \
  brain.spec  # o el entrypoint equivalente

echo "✅ Brain built: $OUTPUT_DIR/brain"
deactivate
```

> **Nota crítica sobre PyInstaller en macOS:** El bundle producido en macOS tiene estructura `brain/` con el binario Mach-O `brain` (sin extensión) y una carpeta `_internal/`. No hay `.pyd` — las extensiones nativas van como `.so`. Esto es esperado y correcto. El build en macOS **debe correrse en macOS** — no se puede cross-compilar PyInstaller de Windows a macOS.

### 6.4 Correcciones en `build-all.py`

Con los scripts `.sh` creados, `build-all.py` necesita los siguientes cambios:

#### Corrección 1: Paths de plataforma

```python
import platform as _platform

def _resolve_nucleus_home() -> Path:
    sys_platform = sys.platform
    if sys_platform == "win32":
        appdata = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData/Local"))
        return Path(os.environ.get("BLOOM_NUCLEUS_HOME", appdata / "BloomNucleus"))
    elif sys_platform == "darwin":
        return Path(os.environ.get(
            "BLOOM_NUCLEUS_HOME",
            Path.home() / "Library" / "Application Support" / "BloomNucleus"
        ))
    else:
        xdg = os.environ.get("XDG_DATA_HOME", Path.home() / ".local/share")
        return Path(os.environ.get("BLOOM_NUCLEUS_HOME", Path(xdg) / "BloomNucleus"))

NUCLEUS_HOME = _resolve_nucleus_home()

def _exe(stem: str) -> str:
    """Retorna el nombre del ejecutable con la extensión correcta para la plataforma."""
    return stem + (".exe" if sys.platform == "win32" else "")

NUCLEUS_EXE = NUCLEUS_HOME / "bin" / "nucleus" / _exe("nucleus")
```

#### Corrección 2: `_DEV_BIN_BASE` — detectar arquitectura en macOS

```python
def _get_dev_bin_base() -> Path:
    if sys.platform == "win32":
        return ROOT / "installer/native/bin/win64"
    elif sys.platform == "darwin":
        arch = _platform.machine()  # 'arm64' o 'x86_64'
        folder = "darwin_arm64" if arch == "arm64" else "darwin_x64"
        return ROOT / "installer/native" / "bin" / folder
    else:
        return ROOT / "installer/native/bin/linux_x64"

_DEV_BIN_BASE  = _get_dev_bin_base()
_PROD_BIN_BASE = NUCLEUS_HOME / "bin"
```

#### Corrección 3: `BUILDS` — seleccionar `.bat` vs `.sh`

```python
def _build_script(rel_path_no_ext: str) -> Path:
    """Retorna el path del script de build correcto para la plataforma."""
    if sys.platform == "win32":
        return ROOT / (rel_path_no_ext + ".bat")
    else:
        return ROOT / (rel_path_no_ext + ".sh")

BUILDS = {
    "brain":     ROOT / ("build_brain.ps1" if sys.platform == "win32" else "build_brain.sh"),
    "nucleus":   _build_script("installer/nucleus/scripts/build"),
    "sentinel":  _build_script("installer/sentinel/scripts/build"),
    "metamorph": _build_script("installer/metamorph/scripts/build"),
    "sensor":    _build_script("installer/sensor/scripts/build"),
    "conductor": ROOT / "installer/conductor",
    "cortex":    ROOT / "installer/cortex/build-cortex/package.py",
    "bootstrap": ROOT / "installer/bootstrap/version-bootstrap.py",
    "vsix":      ROOT,
}
```

#### Corrección 4: `build_brain()` — seleccionar PowerShell vs bash

```python
def build_brain() -> StepResult:
    brain_script = BUILDS["brain"]
    if not brain_script.exists():
        return StepResult("Brain", False, error=f"Script no encontrado: {brain_script}")

    if sys.platform == "win32":
        log("Ejecutando build_brain.ps1 ...")
        cmd = ["powershell", "-ExecutionPolicy", "Bypass", "-File", brain_script.name]
    else:
        log("Ejecutando build_brain.sh ...")
        cmd = ["bash", brain_script.name]

    code, out, err = run(cmd, cwd=brain_script.parent)
    if code != 0:
        return StepResult("Brain", False, error=err or out)
    return StepResult("Brain", True)
```

#### Corrección 5: `build_bat()` → `build_script()` — reemplazar `cmd /c` por `bash`

```python
def build_script(component: str, script_path: Path) -> StepResult:
    """Ejecuta un script de build (.bat en Windows, .sh en macOS/Linux)."""
    if not script_path.exists():
        return StepResult(component, False, error=f"Script no encontrado: {script_path}")
    log(f"Ejecutando {script_path.name} ...")

    if sys.platform == "win32":
        cmd = ["cmd", "/c", script_path.name]
    else:
        cmd = ["bash", script_path.name]

    code, out, err = run(cmd, cwd=script_path.parent)
    if code != 0:
        return StepResult(component, False, error=err or out)
    return StepResult(component, True)
```

En `main()`, reemplazar todas las llamadas `build_bat(...)` por `build_script(...)`:

```python
# ANTES
("Nucleus",   lambda: build_bat("Nucleus",   BUILDS["nucleus"])),

# DESPUÉS
("Nucleus",   lambda: build_script("Nucleus",   BUILDS["nucleus"])),
```

#### Corrección 6: `get_contracts()` — verificación sin PowerShell

El paso de verificación llama a `bloom-conductor-version.ps1` y `bloom-setup-version.ps1` para leer la versión de los Electron apps. En macOS no hay PowerShell (a menos que esté instalado via brew, pero no se puede asumir). 

La solución es que los Electron apps (Conductor y Setup) expongan su versión de otra forma. La más simple: leer directamente el `package.json` del app empaquetado, o emitir un archivo `version.json` durante el build.

```python
def get_conductor_version(bin_base: Path) -> tuple[str, str]:
    """Lee la versión de Conductor desde package.json o version.json."""
    # Intentar version.json primero (generado por build)
    version_json = bin_base / "conductor" / "version.json"
    if version_json.exists():
        data = json.loads(version_json.read_text())
        return data.get("version", "?"), str(data.get("build", "?"))
    # Fallback: leer desde el resources/app/package.json del app empaquetado
    pkg_json = bin_base / "conductor" / "resources" / "app" / "package.json"
    if pkg_json.exists():
        data = json.loads(pkg_json.read_text())
        return data.get("version", "?"), "?"
    return "?", "?"
```

En `get_contracts()`, para Conductor y Setup en macOS:

```python
if sys.platform == "win32":
    version_cmd_conductor = ["powershell", "-ExecutionPolicy", "Bypass", "-File", ps1, "--json"]
else:
    # macOS: leer version.json generado por el build de Electron
    version_cmd_conductor = [sys.executable, "-c",
        f"import json,sys; d=json.load(open('{b}/conductor/version.json')); print(json.dumps(d))"]
```

> **Alternativa más robusta:** modificar `npm run build:all` para que genere un `version.json` en el output directory durante el build de Electron. Un script de post-build de 5 líneas en `package.json` es suficiente.

### 6.5 Herramientas de build requeridas en macOS

Para que el pipeline completo funcione en una máquina de desarrollo macOS, se necesitan:

| Herramienta | Propósito | Instalar con |
|---|---|---|
| Go 1.22+ | Compilar Nucleus, Sentinel, Metamorph, Sensor | `brew install go` |
| Python 3.11+ | Brain + build-all.py | `brew install python@3.11` |
| PyInstaller | Empaquetar Brain | `pip install pyinstaller` |
| Node.js 20+ | Conductor, Bootstrap, Vsix | `brew install node` |
| npm | Package manager JS | (incluido con Node) |
| vsce | Empaquetar extensión VSCode | `npm install -g @vscode/vsce` |
| Xcode CLI Tools | Compilar extensiones nativas Python/Go | `xcode-select --install` |

**No se necesita:** Visual Studio, MSVC, NSSM, PowerShell (a menos que se instale explícitamente para pruebas de compatibilidad).

### 6.6 Resumen de archivos de build a crear

| Archivo | Tipo | Acción |
|---|---|---|
| `build_brain.sh` | Bash | Crear — equivalente de `build_brain.ps1` |
| `installer/nucleus/scripts/build.sh` | Bash | Crear — equivalente de `build.bat` |
| `installer/sentinel/scripts/build.sh` | Bash | Crear — equivalente de `build.bat` |
| `installer/metamorph/scripts/build.sh` | Bash | Crear — equivalente de `build.bat` |
| `installer/sensor/scripts/build.sh` | Bash | Crear — equivalente de `build.bat` |
| `build-all.py` | Python | Modificar — 6 correcciones descritas arriba |

**Esfuerzo estimado:** 4–6 horas para los 5 scripts shell + las correcciones en `build-all.py`.

---

## Notas de arquitectura

### Por qué NO usar un archivo único con `if (platform === ...)`

El patrón `if/else` por plataforma en archivos únicos funciona para JS (donde no hay compilador). Para Go, los build tags (`//go:build windows`) son la forma idiomática y permiten que el compilador elimine código de plataformas no objetivo — esto es especialmente importante para el Sensor que usa syscalls de Win32 (no se pueden compilar en macOS ni siquiera si están dentro de un `if`).

### Por qué los LaunchAgents y no LaunchDaemons

Los **LaunchDaemons** corren como root (o usuario de sistema) y arrancan antes del login. Los **LaunchAgents** corren en el contexto del usuario. Brain necesita `HOME`, acceso al perfil del usuario, y variables de entorno del usuario — lo que hace que LaunchAgent sea la elección correcta, igual que HKCU Run en Windows (que también es por usuario, no por sistema).

### Sobre el Python runtime bundleado

En Windows, el runtime es un bundle portable de CPython con `.pyd` y DLLs. En macOS, el equivalente es un bundle de CPython compilado para la arquitectura objetivo (x86_64 o arm64). **El build de PyInstaller para macOS produce un formato diferente** — en lugar de un directorio con `.pyd`, produce una estructura `MacOS/` con un binario Mach-O. No hay ningún archivo `.pth` que configurar. Esta es la razón por la que la sección de configuración del `.pth` en `installer.js` necesita un branch completo, no solo un cambio de separadores.
