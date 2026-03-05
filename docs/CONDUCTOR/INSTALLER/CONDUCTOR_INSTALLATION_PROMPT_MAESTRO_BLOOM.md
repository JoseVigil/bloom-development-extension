# PROMPT MAESTRO — BLOOM NUCLEUS
## Instalación Atómica · Conductor · Rollout Industrial

---

## 1. ROL

Sos **Lead Deployment Architect & Systems Engineer** especializado en Electron industrial, instaladores atómicos y sistemas soberanos con estado persistente.

Escribés código real, producción, sin shortcuts. Cada función tiene su verificación. Cada decisión tiene su razón.

---

## 2. DECISIONES ARQUITECTÓNICAS CERRADAS

Estas son las decisiones que fueron debatidas, analizadas y cerradas. No se reabre ninguna.

### 2.1 Dos binarios físicos, un solo sourc

**Decisión:** Opción C. Un solo repositorio de Electron con dos entry points. `electron-builder` produce dos outputs distintos.

| Binario | Entry Point | Nombre final | Privilege | Rol |
|---|---|---|---|---|
| Setup | `main.js` | `bloom-setup.exe` | `requireAdministrator` | Instala todo, incluyendo a Conductor |
| Conductor | `main_conductor.js` | `bloom-conductor.exe` | `asInvoker` (NO admin) | Launcher post-instalación |

**Razón del modelo:** La separación de privilege levels es imposible con un solo binario. El installer necesita admin para NSSM y servicios Windows. Conductor nunca necesita admin. Este es el modelo que usa VS Code (`code.exe` vs `code-helper.exe`), Slack, Discord. Es el estándar industrial.

**Orden de compilación:**
```
npm run build:conductor   ← primero (setup lo packea como recurso)
npm run build:setup       ← segundo (incluye conductor portable en extraResources)
```

### 2.2 Naming definitivo

| Cosa | Nombre | Ubicación |
|---|---|---|
| Distributable que el usuario descarga | `bloom-setup.exe` | `dist/` |
| Ejecutable del conductor desplegado | `bloom-conductor.exe` | `bin/conductor/` |
| HTML del installer | `install.html` | `src/install.html` |
| HTML del conductor | `conductor.html` | `src/conductor.html` |
| Flag del installer | ninguno (es el default) | — |
| Flag del conductor | ninguno (es un exe separado) | — |

### 2.3 Responsabilidades divididas

**Installer (bloom-setup.exe)** hace:
- Crear directorios
- Deployer todos los binarios (nucleus, sentinel, brain, host, cortex, ollama, conductor)
- Instalar servicio Windows (Brain via NSSM)
- Crear nucleus.json con hitos
- Verificar cada paso vía hitos
- Seed del perfil maestro via Sentinel
- Certificación final via `nucleus health` y `sentinel health`
- Crear shortcuts que apunten a `bloom-conductor.exe`
- Checks de **instalación** (archivos existen, hitos pasaron)

**Conductor (bloom-conductor.exe)** hace:
- Leer nucleus.json y verificar `installation.completed === true` (gate)
- Si no está completada la instalación → no arranca, muestra error
- Health polling periódico de **funcionamiento** via `nucleus health` (que internamente consulta sentinel)
- Mostrar estado real de todos los servicios
- Vista de health completa (dashboard)
- NO instala nada
- NO necesita admin

### 2.4 Nucleus como única fuente de verdad

- Cada hito se escribe atómicamente (write to `.tmp`, rename)
- Si el proceso muere, al reiniciar el installer lee nucleus.json y reanuda desde el último hito con `status !== "passed"`
- `force_reinstall: true` resetea todos los hitos a `pending` (checkbox del usuario en la UI)
- `installation.completed` es el gate que habilita Conductor

---

## 3. ESTRUCTURA DE DESPLIEGUE FINAL

```
%LOCALAPPDATA%\BloomNucleus\
│
├── bin\
│   ├── nucleus\
│   │   ├── nucleus.exe
│   │   └── nucleus-governance.json
│   ├── sentinel\
│   │   ├── sentinel.exe
│   │   └── sentinel-config.json
│   ├── brain\
│   │   ├── brain.exe
│   │   └── _internal\
│   ├── native\
│   │   ├── bloom-host.exe
│   │   ├── libwinpthread-1.dll
│   │   └── nssm.exe
│   ├── cortex\
│   │   └── bloom-cortex.blx          (read-only, inmutable)
│   ├── ollama\
│   │   ├── ollama.exe
│   │   └── lib\
│   │       ├── cuda_v12\
│   │       ├── cuda_v13\
│   │       └── vulkan\
│   ├── conductor\
│   │   └── bloom-conductor.exe
│   └── chrome-win\
│       └── chrome.exe
│
├── config\
│   ├── nucleus.json                  (única fuente de verdad)
│   └── profiles.json                 (managed by Brain)
│
├── engine\
│   └── runtime\                      (Python embeddido)
│
├── profiles\
│   └── [UUID]\
│       ├── extension\                (desempaquetado de cortex por Brain)
│       ├── synapse\
│       └── chrome-data\
│
└── logs\
    ├── install\
    │   └── electron_install.log
    ├── brain\
    │   └── service\
    │       └── brain_service.log
    └── telemetry.json
```

**Notas críticas de estructura:**
- **Nucleus** está arriba de Sentinel en jerarquía (gobernanza → operatoria)
- **No existe `bin\extension`** — la extensión vive empaquetada en `bloom-cortex.blx` y se despliega por perfil en `profiles\[UUID]\extension`
- **libwinpthread-1.dll** copiada junto a `bloom-host.exe` (dependencia runtime)
- **Blueprints renombrados** para diferenciación semántica:
  - `nucleus-governance.json` — configuración de Nucleus (nivel superior)
  - `sentinel-config.json` — configuración de Sentinel (nivel operacional)

---

## 4. ESQUEMA DE NUCLEUS.JSON (contrato formal)

Este es el esquema exacto. Cada campo es obligatorio. La estructura no cambia sin versionar.

```json
{
  "version": 1,
  "created_at": "2025-01-15T10:00:00.000Z",
  "updated_at": "2025-01-15T10:05:00.000Z",

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
    "bloom_base": "C:\\Users\\{user}\\AppData\\Local\\BloomNucleus",
    "nucleus_exe": "...\\bin\\nucleus\\nucleus.exe",
    "sentinel_exe": "...\\bin\\sentinel\\sentinel.exe",
    "brain_exe": "...\\bin\\brain\\brain.exe",
    "chromium_exe": "...\\bin\\chrome-win\\chrome.exe",
    "conductor_exe": "...\\bin\\conductor\\bloom-conductor.exe",
    "cortex_blx": "...\\bin\\cortex\\bloom-cortex.blx",
    "ollama_exe": "...\\bin\\ollama\\ollama.exe",
    "host_exe": "...\\bin\\native\\bloom-host.exe"
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
    "directories": {
      "status": "pending",
      "started_at": null,
      "completed_at": null,
      "verification": {
        "method": "file_exists",
        "targets": ["bin", "bin/nucleus", "bin/sentinel", "bin/brain", "bin/native", "bin/cortex", "bin/ollama", "bin/conductor", "config", "engine/runtime", "profiles", "logs"],
        "result": null
      },
      "error": null
    },
    "chromium": {
      "status": "pending",
      "started_at": null,
      "completed_at": null,
      "verification": {
        "method": "file_exists_and_smoke",
        "targets": ["bin/chrome-win/chrome.exe"],
        "smoke_test": "--version",
        "result": null
      },
      "error": null
    },
    "brain_runtime": {
      "status": "pending",
      "started_at": null,
      "completed_at": null,
      "verification": {
        "method": "file_exists",
        "targets": ["engine/runtime/python.exe"],
        "result": null
      },
      "error": null
    },
    "binaries": {
      "status": "pending",
      "started_at": null,
      "completed_at": null,
      "verification": {
        "method": "sovereign_manifest",
        "components": {
          "nucleus":  ["nucleus.exe", "nucleus-governance.json"],
          "sentinel": ["sentinel.exe", "sentinel-config.json"],
          "brain":    ["brain.exe"],
          "host":     ["bloom-host.exe", "libwinpthread-1.dll"],
          "cortex":   ["bloom-cortex.blx"],
          "ollama":   ["ollama.exe", "lib/cuda_v12", "lib/cuda_v13", "lib/vulkan"]
        },
        "result": null
      },
      "error": null
    },
    "brain_service": {
      "status": "pending",
      "started_at": null,
      "completed_at": null,
      "verification": {
        "method": "nssm_service_installed",
        "service_name": "BloomBrain",
        "exe_path": "...\\bin\\brain\\brain.exe",
        "result": null
      },
      "error": null
    },
    "ollama_init": {
      "status": "pending",
      "started_at": null,
      "completed_at": null,
      "verification": {
        "method": "sentinel_command",
        "command": "sentinel --json ollama healthcheck",
        "result": null
      },
      "error": null
    },
    "nucleus_seed": {
      "status": "pending",
      "started_at": null,
      "completed_at": null,
      "verification": {
        "method": "sentinel_command",
        "command": "sentinel --json seed MasterWorker true",
        "result": null
      },
      "error": null
    },
    "certification": {
      "status": "pending",
      "started_at": null,
      "completed_at": null,
      "verification": {
        "method": "nucleus_health_check",
        "command": "nucleus --json health",
        "expected_services": ["brain", "sentinel", "ollama", "host"],
        "all_healthy": false,
        "result": null
      },
      "error": null
    }
  }
}
```

**Cambios críticos del esquema:**
1. **`system_map.nucleus_exe`** agregado como path principal del guardian de gobernanza
2. **`binary_versions.nucleus`** agregado para versionado del binario
3. **Hito `directories`**: agregado `bin/nucleus` a los targets
4. **Hito `binaries`**: componente `nucleus` con `nucleus.exe` y `nucleus-governance.json`
5. **Hito `binaries`**: componente `sentinel` con `sentinel-config.json` (renombrado)
6. **Hito `binaries`**: componente `host` incluye `libwinpthread-1.dll`
7. **Hito `certification`**: cambio de `sentinel health` a `nucleus health` (jerarquía correcta)

---

## 4.1 JERARQUÍA DE GUARDIANS

```
NUCLEUS (Gobernanza)
   ↓ monitorea y gobierna
SENTINEL (Operatoria)
   ↓ controla y supervisa
BRAIN (Ejecución)
   ↓ ejecuta tareas
```

**Responsabilidades:**
- **Nucleus**: health check de todo el sistema, decisiones de arranque/parada, certificación global
- **Sentinel**: operaciones de perfiles, seed, launch, repair, healthcheck de componentes individuales
- **Brain**: ejecución de prompts, gestión de profiles.json, comunicación con Chrome

**Comandos de certificación:**
```bash
# Certificación global (usado por installer y conductor)
nucleus --json health

# Operaciones de profiles (usado por installer)
sentinel --json seed MasterWorker true
sentinel --json launch [profile_id] --mode discovery

# Healthcheck de componentes (usado internamente por nucleus)
sentinel --json ollama healthcheck
```

---

## 5. SOVEREIGN COMPONENTS — VERIFICACIÓN COMPLETA

El smoke test actual solo verifica que el exe principal existe. Esto no es suficiente para Ollama ni para el sistema completo.

### Nucleus — verificación de binario y configuración

Además de `nucleus.exe`, debe existir:
1. `nucleus-governance.json` (configuración de gobernanza)
2. Smoke test: `nucleus.exe --version` retorna código 0
3. Blueprint validado contra schema esperado

### Sentinel — verificación de binario y configuración

Además de `sentinel.exe`, debe existir:
1. `sentinel-config.json` (configuración operacional)
2. Smoke test: `sentinel.exe --version` retorna código 0
3. Blueprint validado contra schema esperado

### Ollama — verificación de jerarquía CUDA/Vulkan

Además de `ollama.exe`, estos directorios y archivos deben existir post-copia:

```
ollama/
├── ollama.exe
└── lib/
    ├── cuda_v12/          ← debe existir como directorio, debe tener archivos
    ├── cuda_v13/          ← debe existir como directorio, debe tener archivos
    └── vulkan/            ← debe existir como directorio, debe tener archivos
```

La verificación no es solo `fs.exists`. Es:
1. El directorio existe
2. No está vacío (tiene al menos un archivo)
3. El tamaño total de cada subdir es > un threshold razonable (no fue copiado parcialmente)

### Cortex — verificación de inmutabilidad

1. `bloom-cortex.blx` existe
2. Tamaño > 0
3. Atributo read-only aplicado (`attrib +R`)
4. Si se intenta escribir sobre él, falla explícitamente

### Native — verificación de dependencias runtime

1. `bloom-host.exe` existe
2. `libwinpthread-1.dll` existe en el mismo directorio
3. `nssm.exe` existe
4. Smoke test: `bloom-host.exe --version` retorna código 0

---

## 6. ARCHIVOS QUE SE MODIFICAN, CREAN O ELIMINAN

### Se eliminan (legacy, no existe en producción)

| Archivo | Razón |
|---|---|
| `ExtensionInstaller` class en `renderer.js` | Legacy. Cortex no es extensión. |
| Todo código de `IS_LAUNCH_MODE` en `main.js` | Se mueve a `main_conductor.js` |
| `index_launch.html` | Se convierte en `conductor.html` dentro del conductor build |
| `renderer_launch.js` | Se convierte en `renderer_conductor.js` dentro del conductor build |
| `health-monitor.js` (importado en index_launch.html) | Legacy, no proporcionado, no existe |

### Se crean

| Archivo | Contenido |
|---|---|
| `main_conductor.js` | Entry point de Conductor. Health polling via nucleus. Sin código de instalación. |
| `conductor.html` | UI del conductor. Dashboard de estado. |
| `renderer_conductor.js` | Renderer del conductor. Consume health via IPC. |
| `package.conductor.json` | Config de electron-builder para el conductor build. `asInvoker`, portable only. |
| `nucleus_manager.js` | Clase que maneja lectura/escritura atómica de nucleus.json, lógica de reanudación, esquema de hitos. |
| `preload_conductor.js` | Preload del conductor (subset del preload actual, solo canales de health/status). |

### Se modifican

| Archivo | Qué cambia |
|---|---|
| `main.js` | Se elimina todo el código de launch mode. Solo queda install. Se elimina `IS_LAUNCH_MODE`. Se elimina `registerLaunchHandlers`. Se agrega `port:check` handler. Se agrega `check-brain-service-status` handler (no solo en dev). |
| `installer.js` | `deployLauncher` deja de hacer self-copy. Copia `bloom-conductor.exe` desde `resources/conductor/`. Se integra `nucleus_manager.js` para escritura de hitos. `deployBinaries` copia nucleus.exe, sentinel.exe con blueprints renombrados. Se agrega copia de `libwinpthread-1.dll` junto a bloom-host.exe. Se agrega verificación completa de Ollama subdirs. |
| `renderer.js` | Se elimina `ExtensionInstaller` class completa. Se elimina `HeartbeatManager` (legacy polling manual). Se limpia `startHeartbeatMonitoring` de las pauses fictas (sleep que simulan pasos). |
| `preload.js` | Solo queda lo que el installer necesita. Se agrega `checkPort`. Se agrega `check-brain-service-status` en todas las envs, no solo development. |
| `package.json` | `productName` → `"Bloom Nucleus Setup"`. `appId` → `com.bloom.nucleus.setup`. Se agrega `extraResources` para el conductor portable build. Se agrega script `build:conductor` y `build:all`. |
| `install.html` | Se renombra de `index.html`. El info-box de checkboxes se actualiza con el diseño de styles.css (themed dark, no el green/white actual). |
| `styles.css` | Se aplica la paleta a TODO el installer incluyendo el info-box de features. |
| `paths.js` | Se agrega `nucleusDir`, `nucleusExe`, `conductorDir` y `conductorExe`. Se agrega `webviewBuild` para el path de la app SvelteKit. |

---

## 7. CONDUCTOR — GATE DE CERTIFICACIÓN

Cuando `bloom-conductor.exe` se ejecuta, lo primero que hace es:

```
1. Leer nucleus.json
2. Si no existe → mostrar error "Instalación no encontrada. Ejecute bloom-setup.exe"
3. Si existe pero installation.completed !== true → mostrar error con estado de hitos
4. Si installation.completed === true → arrancar normalmente
5. Iniciar health polling cada 30s via nucleus health --json
6. Mostrar dashboard con estado de todos los servicios
```

El conductor NO intenta reparar ni reinstalar nada. Si algo está caído, lo muestra. El usuario debe correr el setup de nuevo si hay un problema de instalación.

**Flow de health check:**
```javascript
// En main_conductor.js
setInterval(async () => {
  const health = await execCommand('nucleus --json health');
  mainWindow.webContents.send('health:update', health);
}, 30000);
```

---

## 8. NUCLEUS & SENTINEL — COMANDOS USADOS POR EL SISTEMA

Basado en la jerarquía nucleus → sentinel → brain:

### Nucleus (Gobernanza)

| Comando | Usado por | Cuándo |
|---|---|---|
| `nucleus --json health` | Installer (certificación) | Hito `certification` |
| `nucleus --json health` | Conductor | Health polling cada 30s |
| `nucleus --version` | Installer | Smoke test durante `binaries` milestone |

### Sentinel (Operatoria)

| Comando | Usado por | Cuándo |
|---|---|---|
| `sentinel --json seed MasterWorker true` | Installer | Hito `nucleus_seed` |
| `sentinel --json ollama start` | Installer | Hito `ollama_init` (inicio) |
| `sentinel --json ollama healthcheck` | Installer | Hito `ollama_init` (verificación) |
| `sentinel --json launch [profile_id] --mode discovery` | Installer | Hito `certification` (pre-check) |
| `sentinel --mode daemon` | Installer | Daemon sidecar durante instalación |
| `sentinel --json repair bridge` | Conductor | Si el usuario solicita reparación manual |
| `sentinel dev-start` | Solo desarrollo | Levanta todo el entorno |
| `sentinel --version` | Installer | Smoke test durante `binaries` milestone |

**Nota crítica:** `nucleus health` internamente ejecuta `sentinel health` y agrega capa de gobernanza. El installer y conductor SIEMPRE usan `nucleus health` como punto de entrada único.

---

## 9. UI — INFO-BOX DE FEATURES (el que necesita estilo)

El cuadro actual en `install.html`:

```html
<div class="info-box" style="background: #f0fff4; border-left-color: #48bb78;">
  ✅ Instalación local (Sin permisos de administrador)<br>
  ✅ Motor IA + Chrome Profile aislado<br>
  ✅ Extensión configurada automáticamente
</div>
```

Problemas:
- `background: #f0fff4` es blanco/verde claro. Contra el fondo oscuro (`--color-bg: #0f0f1e`) es un destello que rompe la jerarquía visual.
- `border-left-color: #48bb78` es correcto (es `--color-success`) pero el background no usa variables.
- Los checkmarks son texto literal, no estilizados.

Lo que debe ser (siguiendo `styles.css` exactamente):

```html
<div class="info-box features-box">
  <div class="feature-item">
    <span class="feature-check">✓</span>
    <span>Instalación local — sin permisos de administrador</span>
  </div>
  <div class="feature-item">
    <span class="feature-check">✓</span>
    <span>Motor IA + Chrome Profile aislado</span>
  </div>
  <div class="feature-item">
    <span class="feature-check">✓</span>
    <span>Extensión configurada automáticamente</span>
  </div>
</div>
```

Con CSS que usa las variables existentes:

```css
.features-box {
  background: var(--color-surface-hover);
  border-left-color: var(--color-success);
}
.feature-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
}
.feature-check {
  color: var(--color-success);
  font-weight: 700;
  font-size: 18px;
  flex-shrink: 0;
}
.feature-item span:last-child {
  color: var(--color-text);
  font-size: 14px;
}
```

---

## 10. MAPEO DE RUTAS — INSTALLER ORIGEN → DESTINO

Basado en `native_tree.txt`, estas son las rutas exactas de copia:

### Nucleus
```
ORIGEN:  installer/native/bin/win32/nucleus/nucleus.exe
DESTINO: %LOCALAPPDATA%\BloomNucleus\bin\nucleus\nucleus.exe

ORIGEN:  installer/native/bin/win32/nucleus/nucleus-governance.json
DESTINO: %LOCALAPPDATA%\BloomNucleus\bin\nucleus\nucleus-governance.json
```

### Sentinel
```
ORIGEN:  installer/native/bin/win32/sentinel/sentinel.exe
DESTINO: %LOCALAPPDATA%\BloomNucleus\bin\sentinel\sentinel.exe

ORIGEN:  installer/native/bin/win32/sentinel/sentinel-config.json
DESTINO: %LOCALAPPDATA%\BloomNucleus\bin\sentinel\sentinel-config.json
```

### Brain
```
ORIGEN:  installer/native/bin/win32/brain/brain.exe
DESTINO: %LOCALAPPDATA%\BloomNucleus\bin\brain\brain.exe

ORIGEN:  installer/native/bin/win32/brain/_internal/
DESTINO: %LOCALAPPDATA%\BloomNucleus\bin\brain\_internal\
```

### Native (Host + DLL + NSSM)
```
ORIGEN:  installer/native/bin/win32/host/bloom-host.exe
DESTINO: %LOCALAPPDATA%\BloomNucleus\bin\native\bloom-host.exe

ORIGEN:  installer/native/bin/win32/host/libwinpthread-1.dll
DESTINO: %LOCALAPPDATA%\BloomNucleus\bin\native\libwinpthread-1.dll

ORIGEN:  installer/native/nssm/win32/nssm.exe
DESTINO: %LOCALAPPDATA%\BloomNucleus\bin\native\nssm.exe
```

### Cortex
```
ORIGEN:  installer/native/bin/cortex/bloom-cortex-1.0.0+build.3.blx
DESTINO: %LOCALAPPDATA%\BloomNucleus\bin\cortex\bloom-cortex.blx
```

**Notas críticas:**
1. **Blueprint renaming**: Los archivos `blueprint.json` se renombran durante la copia para diferenciación semántica
2. **Cortex versioning**: El archivo fuente tiene versión (`1.0.0+build.3`), el destino es genérico (`bloom-cortex.blx`)
3. **NSSM architecture**: Se usa `nssm/win32/nssm.exe` (no win64) por compatibilidad
4. **libwinpthread-1.dll**: Dependencia crítica de bloom-host.exe, debe estar en el mismo directorio

---

## 11. CHECKLIST DE EJECUCIÓN

Este es el orden exacto en que se implementan los cambios. No se salta ninguno.

```
[ ] 1. Crear nucleus_manager.js (esquema actualizado, atomicWrite, resumeInstallation)
[ ] 2. Modificar installer.js:
       - Integrar nucleus_manager
       - Agregar deployNucleus() antes de deploySentinel()
       - Copiar nucleus.exe + nucleus-governance.json
       - Copiar sentinel.exe + sentinel-config.json (renombrar blueprint)
       - Copiar libwinpthread-1.dll junto a bloom-host.exe
       - Verificación completa de Ollama subdirs
[ ] 3. Modificar main.js (eliminar launch mode, agregar handlers faltantes)
[ ] 4. Modificar renderer.js (eliminar ExtensionInstaller, limpia HeartbeatManager)
[ ] 5. Modificar preload.js (agregar checkPort, check-brain-service-status en todas envs)
[ ] 6. Modificar paths.js:
       - Agregar nucleusDir, nucleusExe
       - Agregar conductorDir, conductorExe
       - Agregar webviewBuild
[ ] 7. Modificar package.json (setup config, scripts)
[ ] 8. Crear package.conductor.json
[ ] 9. Crear main_conductor.js (health polling via nucleus health --json)
[ ] 10. Crear preload_conductor.js
[ ] 11. Crear conductor.html (ex index_launch.html, limpio)
[ ] 12. Crear renderer_conductor.js (ex renderer_launch.js, limpio)
[ ] 13. Renombrar index.html → install.html, aplicar estilos al info-box
[ ] 14. Modificar styles.css (agregar .features-box y .feature-item)
```

---

## 12. LO QUE NO SE TOCA

Estos archivos están correctos tal como están. No se modifican salvo si un paso anterior los requiere:

- `service-installer.js` — funciona. NSSM, telemetry, log rotation. Todo correcto.
- `chromium-installer.js` — funciona. Extracción, smoke test, validación. Todo correcto.
- `logger.js` — funciona. Telemetry updates, categorías. Todo correcto.
- `admin-utils.js` — funciona. `isElevated`, `relaunchAsAdmin`. Todo correcto.
- `ui_manager.js` — funciona. Es un export ES module que está duplicado en renderer.js como clase inline. La duplication es un tema separado, no se toca ahora.

---

## 13. VALIDACIÓN POST-INSTALACIÓN

### Checklist de certificación

Después de que el installer completa todos los hitos, debe ejecutar:

```bash
# 1. Verificar jerarquía de directorios
ls -R %LOCALAPPDATA%\BloomNucleus\bin

# 2. Smoke tests de binarios
nucleus.exe --version
sentinel.exe --version
brain.exe --version
bloom-host.exe --version

# 3. Health check global
nucleus.exe --json health

# 4. Verificar nucleus.json
cat %LOCALAPPDATA%\BloomNucleus\config\nucleus.json | jq '.installation.completed'
# Debe retornar: true

# 5. Verificar servicio Windows
nssm.exe status BloomBrain
# Debe retornar: SERVICE_RUNNING
```

### Criterios de éxito

La instalación se considera exitosa si y solo si:
1. ✅ Todos los hitos en `nucleus.json` tienen `status: "passed"`
2. ✅ `installation.completed === true`
3. ✅ `nucleus health` retorna `{ "status": "healthy", "all_services_ok": true }`
4. ✅ Servicio Windows `BloomBrain` está en estado `SERVICE_RUNNING`
5. ✅ Existe al menos un perfil en `profiles.json` (creado por seed)

Si alguno falla, el installer debe:
- Loguear el error específico en `logs/install/electron_install.log`
- Actualizar el hito correspondiente con `status: "failed"` y `error: "..."`
- Mostrar mensaje de error al usuario con el hito que falló
- NO marcar `installation.completed = true`
