# PROMPT MAESTRO — BLOOM NUCLEUS
## Instalación Atómica · Conductor · Darwin (macOS)

---

## 1. ROL

Sos **Lead Deployment Architect & Systems Engineer** especializado en Electron industrial, instaladores atómicos y sistemas soberanos con estado persistente — con expertise en macOS (launchd, DMG, entitlements, LaunchAgents).

Escribés código real, producción, sin shortcuts. Cada función tiene su verificación. Cada decisión tiene su razón.

---

## 2. DECISIONES ARQUITECTÓNICAS CERRADAS

Estas son las decisiones que fueron debatidas, analizadas y cerradas. No se reabre ninguna.

### 2.1 Dos binarios físicos, un solo source

**Decisión:** Opción C. Un solo repositorio de Electron con dos entry points. `electron-builder` produce dos outputs distintos.

| Binario | Entry Point | Nombre final | Privilege | Rol |
|---|---|---|---|---|
| Setup | `main.js` | `bloom-setup.dmg` | Sin admin requerido | Instala todo, incluyendo a Conductor |
| Conductor | `main_conductor.js` | `bloom-conductor` | Sin admin | Launcher post-instalación |

**Diferencia clave con Windows:** macOS no tiene UAC ni `requireAdministrator`. El installer corre como usuario normal. Todo se instala bajo `~/Library/BloomNucleus/` — sin privilegios elevados, sin sudoers.

**Orden de compilación:**
```
npm run build:conductor   ← primero (setup lo packea como recurso)
npm run build:setup       ← segundo (incluye conductor portable en extraResources)
```

### 2.2 Naming definitivo

| Cosa | Nombre | Ubicación |
|---|---|---|
| Distributable que el usuario descarga | `bloom-setup.dmg` | `dist/` |
| Ejecutable del conductor desplegado | `bloom-conductor` | `bin/conductor/` |
| HTML del installer | `install.html` | `src/install.html` |
| HTML del conductor | `conductor.html` | `src/conductor.html` |

### 2.3 Responsabilidades divididas

**Installer (bloom-setup)** hace:
- Crear directorios bajo `~/Library/BloomNucleus/`
- Deployer todos los binarios (nucleus, sentinel, brain, host, cortex, ollama, conductor, sensor)
- `chmod 0o755` a todos los binarios (no son `.exe`, macOS requiere permisos explícitos)
- Instalar LaunchAgents: Brain (`com.bloom.brain`) y Nucleus (`com.bloom.nucleus`) via `launchctl load`
- Instalar Bloom Sensor via `bloom-sensor install` (el binario maneja su propio LaunchAgent)
- Crear `nucleus.json` con hitos atómicos
- Seed del perfil maestro via `nucleus synapse seed`
- Certificación final via `nucleus health --json`
- Crear shortcuts / symlinks que apunten a `bloom-conductor`

**Conductor (bloom-conductor)** hace:
- Leer `nucleus.json` y verificar `installation.completed === true` (gate)
- Si no está completada → no arranca, muestra error
- Health polling periódico via `nucleus health --json` cada 30s
- Mostrar estado real de todos los servicios
- NO instala nada
- NO requiere privilegios elevados

### 2.4 Nucleus como única fuente de verdad

- Cada hito se escribe atómicamente (write to `.tmp`, rename)
- Si el proceso muere, al reiniciar el installer lee `nucleus.json` y reanuda desde el último hito con `status !== "passed"`
- `force_reinstall: true` resetea todos los hitos a `pending`
- `installation.completed` es el gate que habilita Conductor

---

## 3. DIRECTORIO BASE CANÓNICO — DARWIN

```
~/Library/BloomNucleus/
├── bin/
│   ├── nucleus/
│   │   ├── nucleus
│   │   └── nucleus-governance.json
│   ├── sentinel/
│   │   ├── sentinel
│   │   └── sentinel-config.json
│   ├── brain/
│   │   ├── brain
│   │   └── _internal/
│   ├── host/
│   │   └── bloom-host
│   ├── cortex/
│   │   └── bloom-cortex.blx          (read-only, inmutable)
│   ├── ollama/
│   │   └── ollama
│   ├── conductor/
│   │   └── bloom-conductor
│   ├── sensor/
│   │   └── bloom-sensor
│   ├── node/
│   │   └── node
│   ├── temporal/
│   │   └── temporal
│   └── setup/
│       └── bloom-setup
├── config/
│   ├── nucleus.json                  (única fuente de verdad)
│   └── profiles.json                 (managed by Brain)
├── logs/
│   ├── electron/
│   ├── brain/service/brain_service.log
│   └── nucleus/service/nucleus_service.log
├── profiles/
│   └── <UUID>/
│       ├── extension/
│       ├── synapse/
│       └── chrome-data/
└── workers/
```

**Notas críticas de estructura:**
- **Sin `.exe`** — todos los binarios son Unix executables
- **Sin `nssm/`** — no existe en macOS, reemplazado por launchd
- **Sin `native/`** — `bloom-host` y sus dependencias van en `bin/host/`
- **`workers/`** — directorio presente en Darwin (no en el esquema Windows)
- **`bloom-cortex.blx`** — se aplica `chmod 444` en lugar de `attrib +R`

---

## 4. ESQUEMA DE NUCLEUS.JSON — DARWIN (contrato formal)

```json
{
  "version": 1,
  "platform": "darwin",
  "created_at": "2026-01-15T10:00:00.000Z",
  "updated_at": "2026-01-15T10:05:00.000Z",

  "installation": {
    "force_reinstall": false,
    "completed": false,
    "completed_at": null
  },

  "onboarding": {
    "completed": false,
    "started": false
  },

  "system_map": {
    "bloom_base": "/Users/{user}/Library/BloomNucleus",
    "nucleus_exe": ".../bin/nucleus/nucleus",
    "sentinel_exe": ".../bin/sentinel/sentinel",
    "brain_exe": ".../bin/brain/brain",
    "chromium_exe": ".../bin/chrome/Chromium.app/Contents/MacOS/Chromium",
    "conductor_exe": ".../bin/conductor/bloom-conductor",
    "cortex_blx": ".../bin/cortex/bloom-cortex.blx",
    "ollama_exe": ".../bin/ollama/ollama",
    "host_exe": ".../bin/host/bloom-host",
    "sensor_exe": ".../bin/sensor/bloom-sensor"
  },

  "binary_versions": {
    "nucleus":   { "version": "", "size": 0, "modified": "" },
    "sentinel":  { "version": "", "size": 0, "modified": "" },
    "brain":     { "version": "", "size": 0, "modified": "" },
    "conductor": { "version": "", "size": 0, "modified": "" },
    "chromium":  { "version": "", "size": 0, "modified": "" }
  },

  "master_profile": null,

  "milestones": {
    "directories":            { "status": "pending", "started_at": null, "completed_at": null, "error": null },
    "chromium":               { "status": "pending", "started_at": null, "completed_at": null, "error": null },
    "brain_runtime":          { "status": "pending", "started_at": null, "completed_at": null, "error": null },
    "binaries":               { "status": "pending", "started_at": null, "completed_at": null, "error": null },
    "metamorph_audit":        { "status": "pending", "started_at": null, "completed_at": null, "error": null },
    "brain_service_install":  { "status": "pending", "started_at": null, "completed_at": null, "error": null },
    "nucleus_service_install":{ "status": "pending", "started_at": null, "completed_at": null, "error": null },
    "sensor_install":         { "status": "pending", "started_at": null, "completed_at": null, "error": null },
    "certification":          { "status": "pending", "started_at": null, "completed_at": null, "error": null },
    "nucleus_seed":           { "status": "pending", "started_at": null, "completed_at": null, "error": null },
    "nucleus_launch":         { "status": "pending", "started_at": null, "completed_at": null, "error": null }
  }
}
```

**Diferencias respecto al schema Windows:**
1. `"platform": "darwin"` agregado — permite al Conductor adaptar su comportamiento
2. `system_map` usa paths Unix absolutos bajo `~/Library/BloomNucleus/`
3. `chromium_exe` apunta a `Chromium.app/Contents/MacOS/Chromium` (bundle macOS)
4. No existe `nssm_exe` ni `host_dll` — no aplican en Darwin
5. `sensor_exe` agregado explícitamente al `system_map`

---

## 5. MILESTONES — SECUENCIA DARWIN

```
M01 → directories
M02 → chromium
M03 → brain_runtime
M04 → binaries              ← chmod 0o755 a todos los ejecutables
M05 → metamorph_audit       ← Snapshot de versiones post-deploy
M06 → brain_service_install ← LaunchAgent com.bloom.brain via launchctl
M07 → nucleus_service_install ← LaunchAgent com.bloom.nucleus via launchctl
     ↳ sensor_install        ← No-crítico: bloom-sensor install (LaunchAgent propio)
M08 → certification         ← Health check: brain_service + temporal
M09 → nucleus_seed          ← nucleus synapse seed MasterWorker true
M10 → nucleus_launch        ← Heartbeat: Temporal → Sentinel → Cortex
```

**Diferencias respecto a Windows:**
- M03 `brain_runtime` — en Darwin no hay `.pth` file. El runtime Python embebido ya trae su estructura correcta. El milestone valida existencia del binario `python3` embebido.
- M04 `binaries` — incluye paso explícito de `chmod 0o755` sobre cada binario antes de completar el milestone. Sin esto los LaunchAgents fallan silenciosamente.
- M06/M07 — reemplazan NSSM por `launchctl load`. Ver sección 6.
- `sensor_install` — delega en `bloom-sensor install` que maneja su propio LaunchAgent. Mismo contrato que Windows.

---

## 6. SERVICIOS DARWIN — LAUNCHD

### Equivalencia Windows → Darwin

| Windows | Darwin |
|---|---|
| `BloomBrainService` (NSSM) | `com.bloom.brain` (LaunchAgent) |
| `BloomNucleusService` (NSSM) | `com.bloom.nucleus` (LaunchAgent) |
| `BloomSensor` (HKCU\Run) | LaunchAgent gestionado por `bloom-sensor install` |
| `sc start / sc stop` | `launchctl load / unload` |
| Session 0 (System) | `~/Library/LaunchAgents/` (usuario) |

### Ubicación de plists

```
~/Library/LaunchAgents/
├── com.bloom.brain.plist
├── com.bloom.nucleus.plist
└── com.bloom.sensor.plist    ← creado por bloom-sensor install
```

### Variables de entorno inyectadas en plists

Todos los LaunchAgents de Bloom inyectan:

```xml
<key>EnvironmentVariables</key>
<dict>
    <key>HOME</key>
    <string>/Users/{user}</string>
    <key>BLOOM_ROOT</key>
    <string>/Users/{user}/Library/BloomNucleus</string>
    <key>BLOOM_LOGS</key>
    <string>/Users/{user}/Library/BloomNucleus/logs</string>
</dict>
```

**Crítico:** `HOME` debe inyectarse explícitamente. Los LaunchAgents no heredan el entorno del usuario — sin `HOME`, los binarios Go/Python no pueden resolver `~/`.

### Comportamiento KeepAlive

```xml
<key>KeepAlive</key>
<dict>
    <key>SuccessfulExit</key>
    <false/>
</dict>
```

Reinicia el servicio solo si termina con error. Si termina limpiamente (exit 0), no reinicia. Equivalente al `AppExit Default Restart` de NSSM.

### Comandos de gestión

```bash
# Instalar y arrancar
launchctl load ~/Library/LaunchAgents/com.bloom.brain.plist
launchctl load ~/Library/LaunchAgents/com.bloom.nucleus.plist

# Detener y desregistrar
launchctl unload ~/Library/LaunchAgents/com.bloom.brain.plist
launchctl unload ~/Library/LaunchAgents/com.bloom.nucleus.plist

# Verificar estado
launchctl list | grep com.bloom
```

---

## 7. M04 — BINARIES: DEPLOY Y CHMOD

### Secuencia de deploy Darwin

| # | Componente | Tipo | Destino | Obligatorio |
|---|---|---|---|---|
| 1 | Python Runtime | Directorio | `bin/brain/` (embebido) | ✅ |
| 2 | Brain | Directorio | `bin/brain/` | ✅ (valida `_internal/`) |
| 3 | Native Host | `bloom-host` | `bin/host/` | ✅ |
| 4 | Nucleus | Directorio | `bin/nucleus/` | ✅ |
| 5 | Sentinel | Directorio | `bin/sentinel/` | ✅ |
| 6 | Metamorph | Directorio | `bin/metamorph/` | ✅ |
| 7 | Cortex | `.blx` | `bin/cortex/` | ✅ |
| 8 | Ollama | Directorio | `bin/ollama/` | ⚠️ opcional |
| 9 | Node.js | Directorio | `bin/node/` | ⚠️ opcional |
| 10 | Temporal | Directorio | `bin/temporal/` | ⚠️ opcional |
| 11 | Conductor | `bloom-conductor` | `bin/conductor/` | ⚠️ opcional |
| 12 | Bloom Sensor | `bloom-sensor` | `bin/sensor/` | ⚠️ opcional |
| 13 | Setup | `bloom-setup` | `bin/setup/` | ⚠️ opcional |

### Paso post-copia obligatorio: chmod

```javascript
// Después de copiar cada binario ejecutable:
const executables = [
  paths.nucleusExe,
  paths.sentinelExe,
  paths.brainExe,
  paths.hostExe,
  paths.sensorExe,
  paths.conductorExe,
  paths.temporalExe,
  paths.ollamaExe,
  path.join(paths.binDir, 'node', 'node'),
  path.join(paths.binDir, 'metamorph', 'metamorph'),
];

for (const exe of executables) {
  if (await fs.pathExists(exe)) {
    await fs.chmod(exe, 0o755);
  }
}

// Cortex: read-only (equivalente a attrib +R en Windows)
await fs.chmod(paths.cortexBlx, 0o444);
```

**Sin este paso los LaunchAgents fallan con `Errno 13: Permission denied` sin mensaje claro.**

---

## 8. SOVEREIGN COMPONENTS — VERIFICACIÓN DARWIN

### Nucleus

1. Binario `nucleus` existe en `bin/nucleus/`
2. `nucleus-governance.json` existe
3. `chmod 0o755` aplicado
4. Smoke test: `nucleus --version` retorna código 0

### Sentinel

1. Binario `sentinel` existe en `bin/sentinel/`
2. `sentinel-config.json` existe
3. `chmod 0o755` aplicado
4. Smoke test: `sentinel --version` retorna código 0

### Ollama — sin CUDA en Darwin

En Darwin **no existe** `lib/cuda_v12/`, `lib/cuda_v13/` ni `lib/vulkan/`. Ollama para Apple Silicon usa Metal. La verificación es:

```
ollama/
└── ollama        ← binario existe, chmod 0o755, smoke test --version
```

No se validan subdirectorios GPU — no aplican en macOS.

### Cortex

1. `bloom-cortex.blx` existe
2. Tamaño > 0
3. `chmod 0o444` aplicado (equivalente a `attrib +R`)

### Host

1. `bloom-host` existe en `bin/host/`
2. `chmod 0o755` aplicado
3. **No existe `libwinpthread-1.dll`** — no aplica en Darwin
4. Smoke test: `bloom-host --version` retorna código 0

---

## 9. JERARQUÍA DE GUARDIANS

```
NUCLEUS (Gobernanza)
   ↓ monitorea y gobierna
SENTINEL (Operatoria)
   ↓ controla y supervisa
BRAIN (Ejecución)
   ↓ ejecuta tareas
```

**Comandos de certificación:**
```bash
# Certificación global (usado por installer y conductor)
nucleus --json health

# Operaciones de profiles (usado por installer)
nucleus --json synapse seed MasterWorker true
nucleus --json synapse launch <profile_id> --mode discovery

# Healthcheck de componentes (usado internamente por nucleus)
sentinel --json ollama healthcheck
```

---

## 10. CONDUCTOR — GATE DE CERTIFICACIÓN

Cuando `bloom-conductor` se ejecuta, lo primero que hace es:

```
1. Leer nucleus.json desde ~/Library/BloomNucleus/config/nucleus.json
2. Si no existe → mostrar error "Instalación no encontrada. Ejecute bloom-setup"
3. Si existe pero installation.completed !== true → mostrar error con estado de hitos
4. Si installation.completed === true → arrancar normalmente
5. Iniciar health polling cada 30s via nucleus health --json
6. Mostrar dashboard con estado de todos los servicios
```

El conductor NO intenta reparar ni reinstalar nada.

**Flow de health check:**
```javascript
// En main_conductor.js
setInterval(async () => {
  const health = await execCommand('nucleus --json health');
  mainWindow.webContents.send('health:update', health);
}, 30000);
```

---

## 11. NUCLEUS & SENTINEL — COMANDOS USADOS POR EL SISTEMA

### Nucleus (Gobernanza)

| Comando | Usado por | Cuándo |
|---|---|---|
| `nucleus --json health` | Installer (certificación) | Hito `certification` |
| `nucleus --json health` | Conductor | Health polling cada 30s |
| `nucleus --version` | Installer | Smoke test durante `binaries` |
| `nucleus --json synapse seed MasterWorker true` | Installer | Hito `nucleus_seed` |
| `nucleus --json synapse launch <uuid> --mode discovery` | Installer | Hito `nucleus_launch` |
| `nucleus --json synapse status <uuid>` | Installer | Polling en `nucleus_launch` |
| `nucleus temporal ensure` | Installer | Paso 1 de `nucleus_launch` |

### Sentinel (Operatoria)

| Comando | Usado por | Cuándo |
|---|---|---|
| `sentinel --version` | Installer | Smoke test durante `binaries` |
| `sentinel --json ollama healthcheck` | Installer | Verificación Ollama |
| `sentinel --json repair bridge` | Conductor | Si usuario solicita reparación manual |

**Nota crítica:** `nucleus health` internamente ejecuta `sentinel health` y agrega capa de gobernanza. El installer y conductor SIEMPRE usan `nucleus health` como punto de entrada único.

---

## 12. MAPEO DE RUTAS — INSTALLER ORIGEN → DESTINO DARWIN

### Nucleus
```
ORIGEN:  installer/native/bin/darwin/nucleus/nucleus
DESTINO: ~/Library/BloomNucleus/bin/nucleus/nucleus

ORIGEN:  installer/native/bin/darwin/nucleus/nucleus-governance.json
DESTINO: ~/Library/BloomNucleus/bin/nucleus/nucleus-governance.json
```

### Sentinel
```
ORIGEN:  installer/native/bin/darwin/sentinel/sentinel
DESTINO: ~/Library/BloomNucleus/bin/sentinel/sentinel

ORIGEN:  installer/native/bin/darwin/sentinel/sentinel-config.json
DESTINO: ~/Library/BloomNucleus/bin/sentinel/sentinel-config.json
```

### Brain
```
ORIGEN:  installer/native/bin/darwin/brain/brain
DESTINO: ~/Library/BloomNucleus/bin/brain/brain

ORIGEN:  installer/native/bin/darwin/brain/_internal/
DESTINO: ~/Library/BloomNucleus/bin/brain/_internal/
```

### Host
```
ORIGEN:  installer/native/bin/darwin/host/bloom-host
DESTINO: ~/Library/BloomNucleus/bin/host/bloom-host
```
> Sin DLLs — no aplican en Darwin.

### Cortex
```
ORIGEN:  installer/native/bin/cortex/bloom-cortex-{version}.blx
DESTINO: ~/Library/BloomNucleus/bin/cortex/bloom-cortex.blx
```

### Sensor
```
ORIGEN:  installer/native/bin/darwin/sensor/bloom-sensor
DESTINO: ~/Library/BloomNucleus/bin/sensor/bloom-sensor
```

### Chromium
```
ORIGEN:  installer/resources/Chromium.app/
DESTINO: ~/Library/BloomNucleus/bin/chrome/Chromium.app/
```

---

## 13. CHECKLIST DE EJECUCIÓN DARWIN

```
[ ] 1. Crear/actualizar nucleus_manager.js con platform: 'darwin' y paths Unix
[ ] 2. Crear installer-darwin.js (equivalente a installer.js):
       - createDirectories() → ~/Library/BloomNucleus/
       - deployAllSystemBinaries() → incluye chmod 0o755 post-copia
       - Sin NSSM, sin .exe, sin libwinpthread
[ ] 3. Verificar service-installer-brain-darwin.js ✅ (ya existe)
[ ] 4. Verificar service-installer-nucleus-darwin.js ✅ (corregido — path canónico)
[ ] 5. Verificar service-installer-sensor-darwin.js ✅ (ya existe)
[ ] 6. Crear main.js con detección de plataforma (process.platform === 'darwin')
[ ] 7. Crear/adaptar paths.js para Darwin:
       - bloomBase → ~/Library/BloomNucleus/
       - Sin nssmExe
       - binarios sin extensión .exe
[ ] 8. Adaptar main_conductor.js (paths Darwin)
[ ] 9. Adaptar preload.js / preload_conductor.js
[ ] 10. Adaptar package.json para DMG (electron-builder darwin target)
[ ] 11. Crear package.conductor.json para Darwin (asInvoker equiv → sin privilegios)
[ ] 12. Validar que install.html / conductor.html no tienen paths hardcodeados Windows
```

---

## 14. LO QUE NO CAMBIA RESPECTO A WINDOWS

Estos contratos son idénticos en ambas plataformas:

- Esquema lógico de milestones M01→M10 (misma secuencia, distinta implementación)
- Patrón de milestone atómico (write `.tmp` → rename)
- `nucleus.json` como única fuente de verdad
- Gate de Conductor (`installation.completed === true`)
- Jerarquía Nucleus → Sentinel → Brain
- Comandos CLI de Nucleus y Sentinel (mismos flags, misma interfaz)
- `bloom-sensor` delega su propio registro (`bloom-sensor install`)
- Cortex es read-only e inmutable
- Telemetry: Nucleus es el único escritor de `telemetry.json`

---

## 15. VALIDACIÓN POST-INSTALACIÓN DARWIN

```bash
# 1. Verificar estructura de directorios
ls ~/Library/BloomNucleus/bin

# 2. Smoke tests de binarios
~/Library/BloomNucleus/bin/nucleus/nucleus --version
~/Library/BloomNucleus/bin/sentinel/sentinel --version
~/Library/BloomNucleus/bin/brain/brain --version
~/Library/BloomNucleus/bin/host/bloom-host --version

# 3. Health check global
~/Library/BloomNucleus/bin/nucleus/nucleus --json health

# 4. Verificar nucleus.json
cat ~/Library/BloomNucleus/config/nucleus.json | jq '.installation.completed'
# Debe retornar: true

# 5. Verificar LaunchAgents
launchctl list | grep com.bloom
# Debe mostrar com.bloom.brain y com.bloom.nucleus con PID activo

# 6. Verificar permisos
ls -la ~/Library/BloomNucleus/bin/nucleus/nucleus
# Debe mostrar -rwxr-xr-x
```

### Criterios de éxito Darwin

La instalación se considera exitosa si y solo si:
1. ✅ Todos los hitos en `nucleus.json` tienen `status: "passed"`
2. ✅ `installation.completed === true`
3. ✅ `nucleus health --json` retorna `{ "state": "HEALTHY" }` o `"DEGRADED"` con brain y temporal healthy
4. ✅ `launchctl list | grep com.bloom` muestra Brain y Nucleus con PID (no `-`)
5. ✅ Existe al menos un perfil en `profiles.json`

---

*Basado en BTIPS v5.0 · Derivado de WINDOWS_CONDUCTOR_INSTALLATION_PROMPT_MAESTRO_BLOOM.md · Darwin build — service-installer-{brain,nucleus,sensor}-darwin.js*
