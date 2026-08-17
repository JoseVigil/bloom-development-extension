# Bloom Workspace — Setup Manifest
> v1.0 · Fuente de verdad única para el instalador Electron (`bloom-setup`) y el runtime `bloom-workspace`.
> Reemplaza: `conductor-setup-asset-map.md`, `DARWIN_CONDUCTOR_INSTALLATION_PROMPT_MAESTRO_BLOOM.md`.
> Complementa (no reemplaza): [`reference/windows-technical-reference.md`](reference/windows-technical-reference.md).

---

## 0. Changelog

| Versión | Fecha | Cambios |
|---|---|---|
| v1.0 | 2026-08-17 | Consolidación inicial. Fusiona asset-map (fuente de verdad de componentes) + milestones M01-M10 (Technical Reference) + sección launchd/Darwin (doc Darwin, terminología migrada `conductor`→`workspace`) + inventario de código sin documentar (scripts/utils/diagnose/ipc/registry). Se descartan los docs viejos que quedan subsumidos acá. |

> **Regla de mantenimiento:** este es el único doc que se edita a mano para setup. `setup-tree-snapshot.txt` se regenera del repo (`tree -I node_modules > setup-tree-snapshot.txt`) y sirve para verificar que este manifest no mienta — no se edita a mano.

---

## 1. Convenciones

| Token | Significado |
|---|---|
| `{repo}` | Raíz del repositorio (origen en el bundle del instalador) |
| `{base}` | `AppData/.shared/` (Windows/Linux) o `~/Library/BloomNucleus/` (Darwin) — destino raíz en la máquina del usuario |
| `DIR` | Copiar directorio completo recursivamente (preservar symlinks) |
| `FILE` | Copiar archivo único |
| `ZIP` | Extraer archivo ZIP al destino |
| `TAR.XZ` | Extraer archivo tar.xz al destino |
| `chmod 0755` | Aplicar permisos de ejecución post-deploy (Darwin/Linux) |
| `chmod 4755` | Setuid root — requiere privilegios (Linux, chrome-sandbox) |

### Helper: resolución de plataforma (`nativePlatformDir`)

| OS | ARCH | Directorio |
|---|---|---|
| windows | amd64 | `win64` |
| darwin | amd64 | `darwin_x64` |
| darwin | arm64 | `darwin_arm64` |
| linux | amd64 | `linux_x64` |
| linux | arm64 | `linux_arm64` |

`nativeBin(comp)` = `{repo}/installer/native/bin/{nativePlatformDir()}/{comp}/`

---

## 2. Componentes — mapa de assets

### Capa de gobernanza (Go binaries)

| Componente | Origen | Tipo | Destino |
|---|---|---|---|
| `brain` | `nativeBin("brain")` | DIR | `{base}/bin/brain/` |
| `nucleus` | `nativeBin("nucleus")` | DIR | `{base}/bin/nucleus/` |
| `sentinel` | `nativeBin("sentinel")` | DIR | `{base}/bin/sentinel/` |
| `metamorph` | `nativeBin("metamorph")` | DIR | `{base}/bin/metamorph/` |

> ⚠️ Windows: el binario de `metamorph` puede estar en uso — manejar el reemplazo con reintentos o renombrado atómico.

### Native messaging host

| Componente | Origen | Tipo | Destino |
|---|---|---|---|
| `host` | `nativeBin("host")` | DIR | `{base}/bin/host/` |

> Windows: el directorio contiene `bloom-host.exe` + todas las DLLs necesarias. Copiar el directorio completo captura todo automáticamente. Darwin/Linux: sin DLLs, no aplica.

### Workspace / UI (Electron)

| Plataforma | Origen | Tipo | Destino |
|---|---|---|---|
| windows | `{repo}/installer/native/bin/win64/workspace/bloom-workspace.exe` | FILE | `{base}/bin/workspace/` |
| darwin amd64 | `{repo}/installer/native/bin/darwin_x64/workspace/mac/bloom-workspace.app` | DIR | `{base}/bin/workspace/` |
| darwin arm64 | `{repo}/installer/native/bin/darwin_x64/workspace/mac-arm64/bloom-workspace.app` | DIR | `{base}/bin/workspace/` |
| linux | `nativeBin("workspace")/linux-unpacked/` | DIR | `{base}/bin/workspace/` |

> Darwin: el bundle `.app` contiene symlinks en `Frameworks/` — el copiado debe preservarlos (no seguirlos).

### Setup

| Plataforma | Origen | Tipo | Destino |
|---|---|---|---|
| windows | `{repo}/installer/native/bin/win64/setup/bloom-setup.exe` | FILE | `{base}/bin/setup/` |
| darwin amd64 | `{repo}/installer/native/bin/darwin_x64/setup/mac/bloom-setup.app` | DIR | `{base}/bin/setup/` |
| darwin arm64 | `{repo}/installer/native/bin/darwin_x64/setup/mac-arm64/bloom-setup.app` | DIR | `{base}/bin/setup/` |
| linux | `nativeBin("setup")/linux-unpacked/` | DIR | `{base}/bin/setup/` |

> Linux: el ejecutable principal dentro de `linux-unpacked/` es `bloom-nucleus-installer`.

### Agentes de sesión

| Componente | Origen | Tipo | Destino |
|---|---|---|---|
| `sensor` | `nativeBin("sensor")` | DIR | `{base}/bin/sensor/` |

> Copiar el directorio completo para incluir subdirectorios como `help/`.

### Cross-platform (sin subdirectorio de arch)

| Componente | Origen | Tipo | Destino |
|---|---|---|---|
| `cortex` | `{repo}/installer/native/bin/cortex/bloom-cortex.blx` | FILE | `{base}/bin/cortex/` |
| `ionpump` | `{repo}/installer/native/ionpump/` | DIR | `{base}/bin/cortex/ionpump/` |
| `vsix` | `{repo}/installer/vscode/bloom-extension.vsix` | FILE | `{base}/bin/vscode/` |
| `bootstrap` | `{repo}/installer/native/bin/bootstrap/` (win/darwin únicamente) | DIR | `{base}/bin/bootstrap/` |
| `hooks` | `{repo}/installer/native/hooks/` | DIR | `{base}/hooks/` |
| `config` | `{repo}/config/` | DIR | `{base}/config/` |

> `ionpump`: contiene `bootstrap-ions.json` + archivos `*.ion` (ZIPs). El instalador solo copia — no ejecuta el pipeline de reconcile (eso lo hace `metamorph` en runtime).
> `vsix`: post-deploy opcional — `code --install-extension bloom-extension.vsix --force` si el CLI de VS Code está disponible. No crítico si falla.
> `bootstrap`: no aplica en Linux.

### Solo Windows

| Componente | Origen | Tipo | Destino |
|---|---|---|---|
| `nssm` | `{repo}/installer/native/bin/win64/nssm/nssm.exe` | FILE | `{base}/bin/nssm/` |

### LLM Runtime

| Componente | Windows | Darwin | Linux | Destino | Post-deploy |
|---|---|---|---|---|---|
| `ollama` | `installer/ollama/windows/ollama.exe` | `installer/ollama/darwin/ollama` | `installer/ollama/linux/ollama` | `bin/ollama/` | `chmod 0755` (Darwin/Linux) |
| `temporal` | `installer/temporal/win64/temporal.exe` | `installer/temporal/darwin/temporal` | `installer/temporal/linux/temporal` | `bin/temporal/` | `chmod 0755` (Darwin/Linux) |

### Node.js

| Plataforma | Origen | Tipo | Destino | Post-deploy |
|---|---|---|---|---|
| windows | `installer/node/win64/node.exe` | FILE | `bin/node/` | — |
| darwin | `installer/node/darwin/node` | FILE | `bin/node/` | — |
| linux | `installer/node/linux_x64/linux-x64.tar.xz` (arm64: `linux_arm64/linux-arm64.tar.xz`) | TAR.XZ | `bin/node/` | `chmod 0755 node` |

> Linux: extraer el tar.xz, localizar el binario en `bin/node` dentro del árbol extraído (e.g. `node-v*/bin/node`), copiar solo ese binario al destino como `node`.

### Runtime Python

| Plataforma | Origen | Tipo | Destino |
|---|---|---|---|
| windows | `installer/resources/runtime-windows/` | DIR | `bin/engine/runtime/` |
| darwin | `installer/resources/runtime-darwin/` | DIR | `bin/engine/runtime/` |
| linux | `installer/resources/runtime-linux/` | DIR | `bin/engine/runtime/` |

> Copiar directorio completo preservando estructura. Sin subdirectorio de arch. En Darwin no hay `.pth` file — el runtime embebido ya trae su estructura correcta (ver M03 en sección 3).

### Chromium

| Plataforma | Origen | Tipo | Destino | Post-deploy |
|---|---|---|---|---|
| windows | `installer/chrome/chrome-win.zip` | ZIP | `bin/chrome-win/` | — |
| darwin | `installer/chrome/chrome-mac.zip` | ZIP | `bin/chrome-mac/` | `chmod 0755` sobre `Chromium.app/Contents/MacOS/Chromium` y cada archivo en `Contents/Helpers/` |
| linux | `installer/chrome/chrome-linux.tar.xz` | TAR.XZ | `bin/chrome-linux/` | `chmod 0755` ejecutable principal + `chown root:root chrome-sandbox && chmod 4755 chrome-sandbox` (requiere privilegios; si falla, loggear warning y documentar `--no-sandbox`) |

**Notas de extracción (todas las plataformas):**
- Limpiar el directorio de destino antes de extraer (idempotencia).
- Extraer a directorio temporal primero, luego mover al destino.
- Si el ZIP/TAR contiene una carpeta anidada única, aplanar moviendo su contenido directamente al destino.

---

## 3. Resumen por plataforma

### Windows — 19 componentes
`brain · nucleus · sentinel · metamorph · host · workspace · setup · sensor · cortex · ionpump · vsix · bootstrap · hooks · config · nssm · ollama · temporal · node · runtime · chrome-win`

### Darwin amd64 / arm64 — 19 componentes
Igual que Windows, sin `nssm`. En arm64, `workspace` y `setup` se distribuyen desde el subdirectorio `darwin_x64` (artefacto universal/rosetta gestionado por `electron-builder`) — el resto de binarios sí usa `darwin_arm64`.

### Linux amd64 / arm64 — 18 componentes
Igual que Windows, sin `nssm` ni `bootstrap`.

*(Tablas completas componente-por-componente con paths exactos por plataforma: ver historial de `conductor-setup-asset-map.md` en git blame de este archivo, o regenerar desde `nativeBin()` + esta sección.)*

---

## 4. Flujo de instalación — Milestones M01-M10

Secuencia lógica **idéntica** en las tres plataformas. Implementación difiere (NSSM vs launchd). Estado persistido en `config/nucleus.json` — instalación interrumpida reanuda desde el último milestone `!== "passed"`.

```
M01 → directories
M02 → chromium
M03 → brain_runtime
M04 → binaries              ← Deploy unificado de todos los binarios del sistema
M05 → metamorph_audit       ← Snapshot de versiones/hashes post-deploy
M06 → brain_service_install
M07 → nucleus_service_install
     ↳ sensor_install        ← No-crítico
M08 → certification         ← Health check mínimo: brain_service + temporal
M09 → nucleus_seed          ← Crea MasterWorker via synapse seed + Temporal
M10 → nucleus_launch        ← Heartbeat final: Temporal → Sentinel → Cortex
```

| Milestone | Windows | Darwin |
|---|---|---|
| M03 `brain_runtime` | Escribe `python310._pth` (modo aislado) | No hay `.pth`; valida existencia del `python3` embebido |
| M04 `binaries` | Deploy vía `deployAllSystemBinaries()` en `installer.js` | Igual + paso obligatorio `chmod 0o755` sobre cada ejecutable (sin esto, los LaunchAgents fallan con `Errno 13` sin mensaje claro) |
| M06/M07 `*_service_install` | `NSSM` — `BloomBrainService`, `BloomNucleusService` | `launchctl load` — `com.bloom.brain`, `com.bloom.nucleus` |

Detalle exhaustivo de M01-M10 (funciones reales, comandos, JSON de respuesta esperado, eventos IPC, pantallas del renderer): ver [`reference/windows-technical-reference.md`](reference/windows-technical-reference.md).

Patrón de milestone atómico (contrato común a las tres plataformas):

```javascript
if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
  return { success: true, skipped: true };  // idempotencia garantizada
}
await nucleusManager.startMilestone(MILESTONE);
try {
  // ... trabajo del milestone
  await nucleusManager.completeMilestone(MILESTONE, { ...metadata });
  return { success: true };
} catch (error) {
  await nucleusManager.failMilestone(MILESTONE, error.message);
  throw error; // aborta la instalación
}
```

---

## 5. Servicios Darwin — launchd

> Rescatado del doc Darwin viejo, con nomenclatura migrada `conductor` → `workspace`.

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

### Variables de entorno inyectadas

Todos los LaunchAgents de Bloom inyectan `HOME`, `BLOOM_ROOT`, `BLOOM_LOGS`. **Crítico:** `HOME` debe inyectarse explícitamente — los LaunchAgents no heredan el entorno del usuario; sin `HOME` los binarios Go/Python no resuelven `~/`.

### KeepAlive

```xml
<key>KeepAlive</key>
<dict>
    <key>SuccessfulExit</key>
    <false/>
</dict>
```

Reinicia el servicio solo si termina con error (equivalente a `AppExit Default Restart` de NSSM).

### Comandos de gestión

```bash
launchctl load ~/Library/LaunchAgents/com.bloom.brain.plist
launchctl load ~/Library/LaunchAgents/com.bloom.nucleus.plist
launchctl unload ~/Library/LaunchAgents/com.bloom.brain.plist
launchctl unload ~/Library/LaunchAgents/com.bloom.nucleus.plist
launchctl list | grep com.bloom
```

### Verificación de componentes soberanos (Darwin)

- **Nucleus/Sentinel:** binario existe, config JSON existe, `chmod 0o755` aplicado, smoke test `--version` retorna 0.
- **Ollama:** sin CUDA/Vulkan en Darwin — Apple Silicon usa Metal. No se validan subdirectorios GPU.
- **Cortex:** `bloom-cortex.blx` existe, tamaño > 0, `chmod 0o444` (equivalente a `attrib +R` en Windows).
- **Host:** `bloom-host` existe, `chmod 0o755` aplicado, no existe `libwinpthread-1.dll` (no aplica), smoke test `--version` retorna 0.

### Directorio base canónico Darwin

```
~/Library/BloomNucleus/
├── bin/  (nucleus, sentinel, brain, host, cortex, ollama, workspace, sensor, node, temporal, setup)
├── config/       (nucleus.json, profiles.json)
├── logs/
├── profiles/<UUID>/
└── workers/      ← presente solo en Darwin, no en el esquema Windows
```

**Sin `.exe`. Sin `nssm/`. Sin `native/`** (host y dependencias van directo en `bin/host/`).

---

## 6. Componentes de código sin mapear

> Confirmado contra `setup-tree-snapshot.txt` real del repo. Estas carpetas existen y están activas pero no tienen documentación en ningún doc de setup. Relevante porque al sumar una app nueva al setup, probablemente haya que tocar varias de estas.

| Carpeta/archivo | Contenido | Por qué importa |
|---|---|---|
| `install/diagnose/` | `diagnose-service.js`, `service-diagnostics.js` | Diagnóstico de servicios instalados — probablemente necesite conocer la app nueva |
| `scripts/` (11 archivos) | `cleanup_zombies.ps1`, `emergency-cleanup.bat`, `fix_bridge_id.py`, `sanitize_manifest.py`, `install-*-service.bat`, `reinstall-*-service.bat`, `uninstall-*-service.bat`, `check-status.bat`, `clean_chrome_cache.ps1` | Automatiza instalación/reinstalación/desinstalación de servicios por componente — hoy solo cubre brain/nucleus |
| `utils/` | `exec-helper.js`, `repair-tools.js` | Helpers compartidos de ejecución y reparación |
| `core/menu-builder.js`, `core/window-manager.js` | Menú y gestión de ventanas del installer/workspace Electron | — |
| `ipc/` | `install-handlers.js`, `launch-handlers.js`, `setup-synapse-handlers.js`, `shared-handlers.js` | El Technical Reference documenta los *eventos* IPC (sección "Flujo de IPC") pero no qué handler concreto vive en qué archivo — este mapeo falta |
| `registry-scripts/` | `cleanup.ps1`, `hkcu.ps1` | Limpieza de registro Windows (HKCU) |
| `install/service-installer-{brain,nucleus,sensor}[-darwin\|-linux].js` | Instaladores de servicio por componente y plataforma | Ya referenciados parcialmente en la sección 5, pero sin doc propio |

**Acción recomendada al sumar una app nueva:** revisar como mínimo `scripts/`, `install/diagnose/`, y los `service-installer-*` correspondientes a la plataforma, además de este manifest.

---

## 7. Fuera de alcance de este documento

- **Telemetría/boot logging de Nucleus en runtime** (Temporal, Worker, Ollama, Control Plane, `telemetry.json`): es información de *runtime*, no de *instalación*. Vive en su propia carpeta (`runtime/` o `nucleus/`), no acá. Política crítica a recordar donde sea que se documente: **Electron nunca escribe `telemetry.json` directamente** — Nucleus es el único escritor autorizado; Electron solo registra streams vía `nucleus telemetry register` y escribe `.log` en `logs/electron/`.
- **Detalle de implementación Windows** (funciones reales, JSON de IPC, pantallas del renderer): [`reference/windows-technical-reference.md`](reference/windows-technical-reference.md).

---

## 8. Snapshot del repo

Ver [`setup-tree-snapshot.txt`](setup-tree-snapshot.txt) — regenerar con `tree -I node_modules > setup-tree-snapshot.txt` cada vez que cambie la estructura. No editar a mano.
