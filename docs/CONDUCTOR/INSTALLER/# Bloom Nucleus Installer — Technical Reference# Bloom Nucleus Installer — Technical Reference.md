# Bloom Nucleus Installer — Technical Reference# Bloom Nucleus Installer — Technical Reference
> `workspace` · v1.0 · Electron (Windows x64) · Internal Dev Reference

---

## ⚠️ Rename In Progress: `launcher` → `workspace`

Los siguientes puntos del codebase contienen referencias legacy que deben actualizarse:

| Archivo | Contexto | Referencia legacy | Reemplazo |
|---|---|---|---|
| `service-installer-sensor.js` | Comentario "Detener bloom-launcher legacy..." | `bloom-launcher` | `bloom-workspace` o eliminar |
| `service-installer-sensor.js` | "reemplaza automáticamente la clave BloomLauncher en HKCU\Run" | `BloomLauncher` | Comentario impreciso — el comportamiento ya es correcto, solo el comentario falla |
| `installer.js` | Comentario `// 10. CONDUCTOR (Wokspace)` | typo `Wokspace` | `Workspace` |
| `BTIPS v3.0` | Sección 2.6 bloom-sensor | `bloom-launcher` | `bloom-workspace` en doc futura |
| `package.json` del proyecto | Nombre del proyecto | `launcher` | `workspace` |

---

## Visión General del Sistema

El **Bloom Nucleus Installer** es una aplicación Electron que ejecuta el despliegue completo del ecosistema Bloom en Windows. Opera con privilegios de administrador (`requireAdministrator`), no requiere intervención manual, y está diseñado para ser **idempotente**: cada paso se registra como un milestone atómico en `nucleus.json`, permitiendo reanudar la instalación exactamente donde se interrumpió.

### Componentes que instala

| Componente | Binario | Rol |
|---|---|---|
| **Chromium** | `chrome.exe` | Browser aislado para perfiles Sentinel |
| **Python Runtime** | `python310` embebido | Base de ejecución para Brain, modo aislado |
| **Brain** | `brain.exe` | Motor Python. Pipeline engine, AI provider integration, Event Bus TCP server |
| **Native Host** | `bloom-host.exe` | Bridge C++ entre Chromium Extension y Brain |
| **NSSM** | `nssm.exe` | Service manager Windows |
| **Nucleus** | `nucleus.exe` | Capa de gobernanza. Orquesta identidad, Temporal workflows, vault y updates |
| **Sentinel** | `sentinel.exe` | Sidecar daemon. Event Bus persistente entre Brain y Cortex |
| **Metamorph** | `metamorph.exe` | Reconciliador declarativo de estado binario. Gestiona updates atómicos |
| **Cortex** | `cortex/` | Chrome Extension. UI + Synapse Client. Runtime cognitivo en Chromium |
| **Ollama** | `ollama.exe` | LLM server local. Gestionado por Nucleus |
| **Node.js** | `node.exe` | Runtime para servicios API de Nucleus |
| **Temporal** | `temporal.exe` | Workflow orchestration engine. Requerido para synapse workflows |
| **Conductor** | `bloom-conductor.exe` | Workspace UI (Sovereign Intent Interface). Stateless, conecta a Nucleus via HTTP/WS |
| **Bloom Sensor** | `bloom-sensor.exe` | Human Presence Runtime. Session agent en HKCU\Run. Reemplaza `bloom-launcher` |
| **Setup** | `bloom-setup.exe` | Copia del instalador para self-update |
| **Python Hooks** | `hooks/` | Hooks de extensibilidad para Brain pipelines |

### Política de Telemetría — CRÍTICO
```
❌ Electron NUNCA escribe telemetry.json directamente
❌ No usar TelemetryManager, TelemetryWriter ni rename() sobre telemetry.json
✅ Electron solo crea .log en logs/electron/
✅ Registrar streams via: nucleus telemetry register
✅ Nucleus es el ÚNICO escritor autorizado de telemetry.json
```

---

## Índice de Milestones

El instalador ejecuta **10 milestones secuenciales** más un paso no-crítico intercalado.
El estado de cada milestone se persiste en `config/nucleus.json` — una instalación interrumpida reanuda desde el último milestone fallido.
```
M01 → directories
M02 → chromium
M03 → brain_runtime
M04 → binaries              ← Deploy unificado de todos los binarios del sistema
M05 → metamorph_audit       ← Snapshot de versiones y hashes post-deploy
M06 → brain_service_install ← Instala BloomBrainService via NSSM
M07 → nucleus_service_install ← Instala BloomNucleusService (24/7 crítico)
     ↳ sensor_install        ← No-crítico: bloom-sensor en HKCU\Run
M08 → certification         ← Health check mínimo: brain_service + temporal
M09 → nucleus_seed          ← Crea MasterWorker via synapse seed + Temporal
M10 → nucleus_launch        ← Heartbeat final: Temporal → Sentinel → Cortex
```

---

## M01 — `directories`

**Función:** `createDirectories(win)` · **Progreso:** 1/10

Crea la estructura de directorios base bajo `%LOCALAPPDATA%\BloomNucleus\`.

### Directorios creados
```
BloomNucleus/
├── bin/
│   ├── nucleus/      sentinel/     brain/       host/
│   ├── ollama/       cortex/       conductor/   chrome-win/
│   └── temporal/     (+ más según paths config)
├── config/
├── engine/
├── runtime/
├── profiles/
├── logs/
└── temporal/
```

También inicializa `config/profiles.json` vacío si no existe:
```json
{
  "profiles": [],
  "version": "1.0.0",
  "last_updated": "...",
  "metadata": { "created_by": "installer" }
}
```

> **Por qué:** `worker_manager` falla durante el boot del servicio si `profiles.json` no existe. Se crea aquí como precondición explícita.

---

## M02 — `chromium`

**Función:** `runChromiumInstall(win)` → `installChromium()` · **Progreso:** 2/10  
**Archivo:** `chromium-installer.js`

Extrae y despliega el browser Chromium aislado usado por Sentinel para lanzar perfiles.

### Flujo

1. **Localiza ZIP** en `resources/chrome-win/` (producción). Valida tamaño mínimo > 50 MB.
2. **Limpia** `bin/chrome-win/` eliminando instalación previa.
3. **Extrae** usando `extract-zip` (preferido) o `PowerShell Expand-Archive` como fallback. Maneja estructura anidada `chrome-win/` dentro del ZIP.
4. **Valida** `chrome.exe`: existencia, legibilidad, tamaño > 50 MB.
5. **Smoke test** (opcional): `chrome.exe --version --headless --no-first-run` con perfil temporal.

---

## M03 — `brain_runtime`

**Función:** `runRuntimeInstall(win)` → `installRuntime()` · **Progreso:** 3/10  
**Archivo:** `runtime-installer.js`

Configura Python 3.10 embebido en modo completamente aislado del sistema operativo.

### Acciones

1. **Detiene y elimina** `BloomBrainService` si existe (para no bloquear archivos del runtime).
2. **Escribe** `python310._pth` para modo aislado:
```
   .
   python310.zip
   Lib
   Lib\site-packages
```

> **Nota:** La copia física del runtime (`bin/runtime/`) ocurre en M04. Este milestone es solo configuración del `.pth` file — separado para que sea idempotente.

---

## M04 — `binaries`

**Función:** `runBinariesDeploy(win)` → `deployAllSystemBinaries(win)` · **Progreso:** 4/10  
**Archivo:** `installer.js`

**Milestone central.** Única función autorizada para copiar binarios. Despliega todos los componentes del sistema en orden determinista.

### Pre-condición: `preInstallCleanup`

Se ejecuta automáticamente antes de cualquier copia:

1. Valida `nucleus.json` — schema desactualizado activa `force_reinstall`
2. Para servicios: `BloomBrainService`, `BloomNucleusService`, `BloomBrain`, `BloomNucleus`
3. Elimina servicios con NSSM
4. Mata procesos: `brain.exe`, `nucleus.exe`, `sentinel.exe`, `bloom-host.exe`, `bloom-conductor.exe`, `bloom-sensor.exe`, `temporal.exe`, `ollama.exe`
   > ⚠️ `node.exe` **nunca se mata** — el instalador Electron lo usa.
5. Espera 3 segundos para liberar file locks.

### Secuencia de deploy

| # | Componente | Tipo | Destino | Obligatorio |
|---|---|---|---|---|
| 1 | Python Runtime | Directorio | `bin/runtime/` | ✅ |
| 2 | Brain Service | Directorio | `bin/brain/` | ✅ (valida `_internal/`) |
| 3 | Native Host | `bloom-host.exe` + DLLs | `bin/host/` | ✅ |
| 4 | NSSM | `nssm.exe` | `bin/nssm/` | ✅ |
| 5 | Nucleus | Directorio | `bin/nucleus/` | ✅ |
| 6 | Sentinel | Directorio | `bin/sentinel/` | ✅ |
| 7 | Metamorph | Directorio | `bin/metamorph/` | ✅ |
| 8 | Cortex | Directorio | `bin/cortex/` | ✅ |
| 9 | Ollama | Directorio | `bin/ollama/` | ⚠️ opcional |
| 10 | Node.js | Directorio | `bin/node/` | ⚠️ opcional |
| 11 | Temporal | Directorio | `bin/temporal/` | ⚠️ opcional |
| 12 | Conductor | `bloom-conductor.exe` | `bin/conductor/` | ⚠️ opcional |
| 13 | Bloom Sensor | `bloom-sensor.exe` | `bin/sensor/` | ⚠️ opcional |
| 14 | Setup | `bloom-setup.exe` | `bin/setup/` | ⚠️ opcional |
| 15 | Python Hooks | Subcarpetas | `bin/hooks/` | ⚠️ opcional |

Los componentes opcionales loguean warning si no se encuentran pero no abortan la instalación.

---

## M05 — `metamorph_audit`

**Función:** `runMetamorphAudit(win)` · **Progreso:** 5/10  
**Archivo:** `installer.js`

Genera el snapshot inicial de versiones y hashes de todos los binarios deployados. Este es el **estado de verdad post-instalación** y sirve como baseline para futuras reconciliaciones de Metamorph.

### Comando ejecutado
```bash
metamorph.exe --json inspect --all
```

Genera `config/metamorph.json` con versiones, hashes SHA256 y estado de cada binario.

### Por qué `inspect` y no `verify-sync`

`verify-sync` detecta drift comparando source vs destino — tiene sentido en producción para detectar modificaciones no autorizadas. En una instalación fresca, el source de verdad *es* el deploy que acabamos de hacer, por lo que `inspect` es el comando correcto.

### Validación post-audit

Binarios críticos verificados: `Brain`, `Nucleus`, `Sentinel`, `Host`, `Metamorph`, `Cortex`.  
Un `size_bytes == 0` en cualquiera de estos → error fatal.

> `status: unknown` en `Host`, `Conductor` y `Setup` es **comportamiento esperado** — no exponen versión semántica, quedan en `external_binaries`. No es un error.

> Si `metamorph.exe` no existe, el milestone se marca `skipped` (no fatal) y la instalación continúa.

---

## M06 — `brain_service_install`

**Función:** `installBrainService(win)` · **Progreso:** 6/10  
**Archivo:** `service-installer-brain.js`

Instala y arranca `BloomBrainService` via NSSM.

### Configuración del servicio

| Parámetro | Valor |
|---|---|
| Nombre | `BloomBrainService` |
| Display | `Bloom Brain Service` |
| Binario | `bin/brain/brain.exe` |
| Argumentos | `service start` |
| Start type | `SERVICE_AUTO_START` |
| Restart policy | `AppExit Default Restart` |
| Log stdout + stderr | `logs/brain/service/brain_service.log` |

### Variables de entorno inyectadas
```
PYTHONUNBUFFERED=1
PYTHONIOENCODING=utf-8
LOCALAPPDATA=<ruta real del usuario>
```

> **Por qué `LOCALAPPDATA` explícito:** NSSM corre en Session 0 sin usuario interactivo. La variable no existe en esa sesión — debe inyectarse para que Brain sepa dónde están los perfiles.

### Retry logic para "marked for deletion"

Si NSSM devuelve este error, reintenta hasta **5 veces** con backoff lineal (1s, 2s, 3s, 4s). Si falla, la instalación aborta con instrucción de reiniciar el equipo.

### Telemetry

Registra stream `brain_service` en Nucleus telemetry · prioridad 3 · categoría `brain`.

---

## M07 — `nucleus_service_install`

**Función:** `installNucleusService(win)` · **Progreso:** 7/10  
**Archivo:** `service-installer-nucleus.js`

Instala y arranca `BloomNucleusService` — el **servicio crítico 24/7** del ecosistema.

> **Orden crítico:** Nucleus Service debe arrancar **antes** de `certification` y `seed` porque Seed necesita Temporal workflows, y Temporal es iniciado por Nucleus Service durante su boot.

### Configuración del servicio

| Parámetro | Valor |
|---|---|
| Nombre | `BloomNucleusService` |
| Display | `Bloom Nucleus Service` |
| Binario | `bin/nucleus/nucleus.exe` |
| Argumentos | `service start` |
| Start type | `SERVICE_AUTO_START` |
| Restart delay | 5000 ms |
| Log stdout + stderr | `logs/nucleus/service/nucleus_service.log` |

### Variables de entorno (vía registro directo)

Escribe directamente a `HKLM\SYSTEM\CurrentControlSet\Services\BloomNucleusService\Parameters` usando `reg add` con tipo `REG_MULTI_SZ`:
```
PYTHONUNBUFFERED=1  ·  PYTHONIOENCODING=utf-8  ·  BLOOM_ENVIRONMENT=production
NUCLEUS_MODE=service  ·  LOCALAPPDATA=<ruta>  ·  BLOOM_ROOT=<ruta>\BloomNucleus
BLOOM_BIN_DIR=<...>\bin  ·  BLOOM_LOGS_DIR=<...>\logs  ·  BLOOM_DIR=<ruta>\BloomNucleus
PATH=<bin/nucleus>;<bin/sentinel>;<system PATH>
```

### Componentes que bootea el servicio internamente

Al ejecutar `nucleus service start`, Nucleus inicializa:
- Temporal workflow engine
- Ollama LLM server
- Worker Manager
- Control Plane

### Telemetry

Registra stream `nucleus_service` · prioridad 1 (crítico) · categoría `nucleus`.

---

## M07-B — `sensor_install` *(no-crítico)*

**Función:** `installSessionSensor(win)`  
**Archivo:** `service-installer-sensor.js`

Instala `bloom-sensor.exe` como agente de sesión de usuario. Corre en **Session 1** (sesión interactiva), registrado en `HKCU\Run`. No requiere admin.

> ⚠️ Puede fallar sin abortar la instalación. Si no confirma `RUNNING`, el sensor iniciará en el próximo login del usuario.

### Flujo

1. Mata instancia previa de `bloom-sensor.exe` si existe
2. Ejecuta `bloom-sensor.exe install` → el binario se auto-registra:
```
   HKCU\...\Run
     BloomSensor = "...\bin\sensor\bloom-sensor.exe" serve
```
   La clave legacy `BloomLauncher` es eliminada automáticamente por el binario.
3. Arranca inmediatamente: `spawn(sensorExe, ['serve'], { detached: true })`
4. Verifica: `bloom-sensor.exe status` → espera `RUNNING`

### Rol en el ecosistema

Human Presence Runtime. Mide actividad de usuario (activo, bloqueado, idle) via Windows Session APIs. Publica eventos `HUMAN_*` a Sentinel cada 60 segundos. Produce `energy_index` determinista `[0.0–1.0]`. Ring buffer de 1440 snapshots (24h a 1 tick/min). **Observable pasivo** — publica estado, no recibe comandos.

---

## M08 — `certification`

**Función:** `runCertification(win)` · **Progreso:** 8/10

Verifica que los **componentes mínimos para Seed** estén operativos.

### Pre-wait fijo

Espera **15 segundos** para que Nucleus Service complete el boot interno de Temporal y Brain.

### Componentes verificados

| Componente | Por qué |
|---|---|
| `brain_service` | Operaciones básicas de Brain |
| `temporal` | **Requerido** por synapse workflows — Seed los usa directamente |

Solo se verifican estos 2. La verificación completa del stack (Ollama, Worker, Control Plane) ocurre post-onboarding.

### Respuesta esperada de `nucleus health --json`
```json
{
  "success": true,
  "state": "DEGRADED | OPERATIONAL",
  "components": {
    "brain_service": { "healthy": true, "state": "RUNNING" },
    "temporal":      { "healthy": true, "state": "RUNNING" }
  }
}
```

Si cualquiera de los 2 retorna `healthy: false` → fallo fatal, instalación abortada.

---

## M09 — `nucleus_seed`

**Función:** `seedMasterProfile(win)` · **Progreso:** 9/10

Crea y registra el **Perfil Maestro** (`MasterWorker`) con `is_master: true`. Es el punto de entrada para el onboarding.

### Comando ejecutado
```bash
nucleus.exe --json synapse seed MasterWorker true
```

### Respuesta esperada
```json
{
  "success": true,
  "profile_id": "<UUID>",
  "alias": "MasterWorker",
  "is_master": true,
  "workflow_id": "<temporal-workflow-id>"
}
```

El `profile_id` se persiste en `nucleus.json` via `nucleusManager.setMasterProfile(uuid)`.

> **Por qué requiere Temporal:** `synapse seed` crea un workflow persistente en Temporal que representa el ciclo de vida del perfil. Sin Temporal activo (garantizado en M08) el comando falla.

---

## M10 — `nucleus_launch`

**Función:** `launchMasterProfile(win)` · **Progreso:** 10/10

Milestone final. Lanza el perfil maestro y valida el **handshake completo** entre Temporal, Sentinel, Chromium y la extensión Cortex. Prueba de fuego del stack completo.

### UI durante el milestone

1. Emite `heartbeat:starting` → renderer muestra círculo 🔴 pulsante
2. Reposiciona ventana del instalador a mitad izquierda de pantalla para que Chrome quede a la derecha
3. Al completar Paso 2: emite `heartbeat:launch-done` → círculo 🟡 estático (synapse)
4. Al completar Paso 3: emite `heartbeat:validated` → círculo 🟢 (connected)

### Secuencia interna

**Paso 1 — `nucleus temporal ensure`**  
Verifica que el servidor Temporal está activo.

**Paso 2 — `nucleus synapse launch <uuid> --mode discovery`**  
Lanza Sentinel con Chromium. Respuesta debe incluir `extension_loaded: true`.

**Paso 3 — Polling de estado** (10 intentos × 3s = 30s máx)  
Llama a `nucleus synapse status <uuid>` en loop.

Estados de éxito:
- `READY` — onboarding ya completado (reinstalaciones)
- `RUNNING` + `sentinel_running: true` — primer boot (instalación fresca)

Estados que abortan inmediatamente:
- `DEGRADED` o `FAILED` — estado terminal, revisar logs de Sentinel

> **Por qué no `nucleus heartbeat`:** Requiere org inicializada. En instalación fresca la org no existe todavía (se crea en onboarding). `synapse status` consulta solo el workflow en Temporal, sin dependencia de org.

### Datos persistidos en el milestone
```json
{
  "profile_id": "<UUID>",
  "chrome_pid": 12345,
  "extension_loaded": true,
  "debug_port": 9222,
  "profile_state": "RUNNING"
}
```

---

## Patrón de Milestone Atómico

Todos los milestones siguen el mismo contrato:
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

## Flujo de IPC: Main ↔ Renderer

| Evento (main → renderer) | Cuándo | Payload |
|---|---|---|
| `installation-progress` | Cada milestone | `{ current, total, percentage, message }` |
| `heartbeat:starting` | Inicio M10 | `{ profile_id }` |
| `heartbeat:launch-done` | Sentinel lanzado (M10 Paso 2) | `{ profile_id, chrome_pid, extension_loaded }` |
| `heartbeat:validated` | Polling exitoso (M10 Paso 3) | `{ profile_id, profile_state, chrome_pid }` |
| `installation-complete` | Todo exitoso | `{ success: true, profile_id }` |
| `installation-error` | Fallo en cualquier milestone | `{ error, stack }` |

---

## Estructura de Pantallas del Renderer
```
1. welcome-screen          → Botón INSTALAR
2. installation-screen     → Progress bar + spinner + mensaje de milestone
3. success-screen          → Lista de componentes deployados
4. heartbeat-screen        → Semáforo: 🔴 → 🟡 → 🟢
5. connection-success-screen → Botón INICIAR ONBOARDING
6. error-screen            → Mensaje + stack trace + botón Reintentar
```

---

## Output de una Instalación Exitosa
```
%LOCALAPPDATA%\BloomNucleus\
├── bin/                     ← Todos los binarios deployados
├── config/
│   ├── nucleus.json         ← Milestones + master_profile UUID
│   ├── profiles.json        ← Perfil MasterWorker registrado
│   └── metamorph.json       ← Snapshot de versiones post-install
├── logs/
│   ├── electron/            ← Logs del proceso instalador
│   ├── brain/service/brain_service.log
│   └── nucleus/service/nucleus_service.log
└── profiles/
    └── <UUID>/              ← Directorio del perfil Chromium maestro
```

### Servicios Windows instalados

| Servicio | Manager | Start | Sesión |
|---|---|---|---|
| `BloomBrainService` | NSSM | AUTO | Session 0 |
| `BloomNucleusService` | NSSM | AUTO (24/7 crítico) | Session 0 |
| `BloomSensor` | HKCU\Run | Login de usuario | Session 1 |

---

*Snapshot técnico basado en `installer.js` · `installer_nucleus.js` · BTIPS v3.0 · Generado para uso interno del equipo de desarrollo.*