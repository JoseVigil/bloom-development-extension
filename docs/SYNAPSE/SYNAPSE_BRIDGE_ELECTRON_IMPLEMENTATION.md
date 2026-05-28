# Synapse Bridge — Implementación Electron
## Documento de handoff para nueva sesión

> **Estado:** Implementación completa. Pendiente: integración en los `main.js` existentes y prueba end-to-end en Darwin.

---

## 1. Qué se implementó y por qué

### El problema
El handshake Synapse y el heartbeat ocurren en el **main process** de Electron (donde corre el spawn de `nucleus` y el socket TCP a Brain). El renderer (la UI de instalación / workspace) vive en un contexto aislado (`contextIsolation: true`). Sin un bridge IPC explícito, los eventos nunca atraviesan ese aislamiento aunque el protocolo funcione correctamente en los logs.

### La solución
Un bridge en tres capas siguiendo el patrón canónico de Electron:

```
Brain (TCP IPC)
    ↓  4-byte UInt32 LE + JSON
SynapseBridge (main process)
    ↓  webContents.send('synapse:event', payload)
preload-synapse.js (contextBridge)
    ↓  window.bloomSynapse.onEvent(callback)
Renderer (UI)
```

---

## 2. Archivos entregados

### Árbol de destino dentro de `conductor/`

```
conductor/
├── shared/
│   ├── synapse-bridge.js                  ← NUEVO — motor del protocolo
│   ├── preload-synapse.js                 ← NUEVO — contextBridge para el renderer
│   ├── global_paths.js                    (existente, no modificado)
│   └── logger.js                          (existente, no modificado)
├── setup/
│   └── ipc/
│       ├── setup-synapse-handlers.js      ← NUEVO — ipcMain handlers para setup
│       ├── install-handlers.js            (existente, no modificado)
│       ├── launch-handlers.js             (existente, no modificado)
│       └── shared-handlers.js             (existente, no modificado)
└── workspace/
    └── ipc/
        ├── workspace-synapse-handlers.js  ← NUEVO — ipcMain handlers para workspace
        ├── health-handlers.js             (existente, no modificado)
        └── profiles-handlers.js           (existente, no modificado)
```

### Descripción de cada archivo

| Archivo | Responsabilidad |
|---|---|
| `shared/synapse-bridge.js` | Clase `SynapseBridge`. Gestiona: spawn de `nucleus`, polling del port file, conexión TCP, parseo del protocolo 4-byte LE, clasificación de mensajes, watchdog de heartbeat, y envío al renderer. |
| `shared/preload-synapse.js` | Expone `window.bloomSynapse` al renderer via `contextBridge`. Contiene `onEvent()`, `seedAndLaunch()`, `launch()`. |
| `setup/ipc/setup-synapse-handlers.js` | Registra `ipcMain.handle('synapse:seedAndLaunch')` y `ipcMain.handle('synapse:launch')` para la app de instalación. Una instancia de bridge a la vez. |
| `workspace/ipc/workspace-synapse-handlers.js` | Mismo contrato que el de setup, pero soporta múltiples ventanas (`Map` de bridges por `webContentsId`). |

---

## 3. Integración en los `main.js` existentes

### 3.1 `setup/main.js`

**a) Registrar los handlers** después de crear la ventana:

```js
const { registerSynapseHandlers } = require('./ipc/setup-synapse-handlers');

// ... donde ya creás mainWindow ...
registerSynapseHandlers(
  () => mainWindow,
  {
    nucleusBinary: 'nucleus',   // o path absoluto si no está en PATH
    verbose: !app.isPackaged,   // logs en desarrollo
  }
);
```

**b) El cleanup** ya está cubierto por `app.on('before-quit')` dentro del handler. Si necesitás hacerlo explícito en el `closed` de la ventana:

```js
mainWindow.on('closed', () => {
  const { getActiveBridge } = require('./ipc/setup-synapse-handlers');
  const bridge = getActiveBridge();
  if (bridge) bridge.destroy();
});
```

### 3.2 `setup/preload.js`

Agregar al final del preload existente:

```js
require('../../shared/preload-synapse');
```

**Si tu preload ya usa `contextBridge.exposeInMainWorld`** para otras APIs y no querés conflicto de nombres, el merge manual queda así:

```js
const { contextBridge, ipcRenderer } = require('electron');
const { SYNAPSE_IPC_CHANNEL } = require('../../shared/synapse-bridge');

// Tu exposición existente:
contextBridge.exposeInMainWorld('bloomAPI', { /* tu API actual */ });

// Synapse en su propio namespace — no colisiona:
contextBridge.exposeInMainWorld('bloomSynapse', {
  onEvent(cb) {
    const h = (_, p) => cb(p);
    ipcRenderer.on(SYNAPSE_IPC_CHANNEL, h);
    return () => ipcRenderer.removeListener(SYNAPSE_IPC_CHANNEL, h);
  },
  seedAndLaunch: (alias, opts) =>
    ipcRenderer.invoke('synapse:seedAndLaunch', { alias, options: opts }),
  launch: (id, opts) =>
    ipcRenderer.invoke('synapse:launch', { profileIdOrAlias: id, options: opts }),
});
```

### 3.3 `workspace/main_conductor.js`

```js
const { registerSynapseHandlers } = require('./ipc/workspace-synapse-handlers');

// Después de crear la ventana principal:
registerSynapseHandlers(
  () => mainWindow,
  { verbose: !app.isPackaged }
);
```

### 3.4 Preloads del workspace

El workspace tiene dos preloads: `preload_core.js` y `preload_onboarding.js`. Agregar a los que correspondan a las ventanas que necesitan recibir eventos Synapse:

```js
require('../../shared/preload-synapse');
```

---

## 4. Uso en el renderer

Una vez que el preload está integrado, cualquier renderer puede hacer:

```js
// Suscribirse a eventos
const unsubscribe = window.bloomSynapse.onEvent(event => {
  switch (event.type) {
    case 'HEARTBEAT':
      updateHeartbeatIndicator();
      break;
    case 'HANDSHAKE':
      showHandshakeConfirmed();
      break;
    case 'STATUS':
      updateStatus(event.phase, event.message);
      break;
    case 'ERROR':
      showError(event.message);
      break;
    case 'INTENT':
      updateIntentProgress(event);
      break;
    case 'SYNAPSE_EVENT':
      // catch-all: cualquier evento nuevo de Brain cae aquí
      console.log('Synapse event:', event.command || event.event, event);
      break;
  }
});

// Lanzar un perfil nuevo (setup)
async function startInstallation(alias) {
  const result = await window.bloomSynapse.seedAndLaunch(alias, {
    master: true,
    mode: 'discovery',
  });
  if (!result.success) showError(result.error);
}

// Lanzar perfil existente (workspace)
async function openProfile(profileId) {
  await window.bloomSynapse.launch(profileId, { mode: 'landing' });
}

// Limpiar al desmontar el componente / cerrar la página
window.addEventListener('beforeunload', () => unsubscribe());
```

---

## 5. Estructura de los eventos

Todos los eventos que llegan a `onEvent(callback)` tienen esta forma base:

```js
{
  type:       string,   // clasificación: ver tabla abajo
  _ts:        number,   // Date.now() cuando llegó al main process
  _profileId: string,   // profileId de la sesión activa
  _launchId:  string,   // launchId de la sesión activa

  // Campos propios del mensaje Brain (pasan sin modificar):
  command?:   string,
  event?:     string,
  // ... cualquier otro campo del payload JSON de Brain
}
```

### Tipos de eventos

| `type` | Origen | Cuándo |
|---|---|---|
| `STATUS` | Bridge (sintético) | Cambios de fase internos del bridge |
| `HEARTBEAT` | Brain | Señal periódica de que el perfil está vivo |
| `HANDSHAKE` | Brain | `event: 'HANDSHAKE_CONFIRMED'` — handshake de 3 fases completado |
| `HOST_READY` | Brain | `event: 'HOST_READY'` — Brain como host listo |
| `INTENT` | Brain | Cualquier `event` con prefijo `INTENT_` |
| `ION` | Brain | Cualquier `event` con prefijo `ION_` |
| `PROFILE` | Brain | Cualquier `event` con prefijo `PROFILE_` |
| `SYNAPSE_EVENT` | Brain | Todo lo demás — catch-all para eventos futuros |
| `ERROR` | Bridge (sintético) | Errores de conexión o timeouts |

### Fases de los eventos STATUS

```
SEEDING      → nucleus seed en ejecución
SEEDED       → perfil creado en Temporal
LAUNCHING    → nucleus launch en ejecución
LAUNCHED     → Chrome + Sentinel levantados
CONNECTING   → esperando/conectando IPC TCP
CONNECTED    → socket TCP a Brain establecido
DISCONNECTED → socket caído, reconectando con backoff
DEGRADED     → sin heartbeat por más de 20s
```

### Extensibilidad

El bridge **no necesita modificarse** para absorber mensajes nuevos del protocolo. Cualquier mensaje que Brain emita y no coincida con ninguna categoría conocida llega al renderer como `SYNAPSE_EVENT` con todos sus campos intactos. Si en algún momento se quiere promover un tipo nuevo a categoría propia (por ejemplo `VAULT`), basta agregar un `case` en `_classifyMessage()` dentro de `shared/synapse-bridge.js`.

---

## 6. Protocolo Synapse — capa de transporte

Brain se comunica con el bridge via **TCP localhost** usando el mismo wire format que Chrome Native Messaging:

```
┌─────────────────────────────────────────────────────┐
│  [0..3]  UInt32 Little Endian = N (longitud JSON)   │
│  [4..N+3] JSON payload                              │
└─────────────────────────────────────────────────────┘
```

El puerto se lee del archivo:

```
{bloomRoot}/run/ipc_{launchId}.port
```

Si `launchId` no está disponible (arranque en dev sin haber pasado por `seedAndLaunch`), el bridge toma el primer `.port` que encuentre en el directorio `run/`.

### BloomRoot por plataforma

| Plataforma | Path canónico |
|---|---|
| macOS (Darwin) | `~/Library/BloomNucleus/` |
| Windows | `%LOCALAPPDATA%\BloomNucleus\` |
| Linux | `$XDG_DATA_HOME/BloomNucleus/` o `~/.local/share/BloomNucleus/` |

`getBloomRoot()` está exportada desde `shared/synapse-bridge.js` y es la única fuente de verdad de paths en todo el bridge.

---

## 7. Flujo completo de una sesión

```
Renderer                    main process                Brain
   │                              │                        │
   │─ seedAndLaunch('alias') ────►│                        │
   │◄─ STATUS: SEEDING ──────────│─ nucleus seed ─────────►│
   │◄─ STATUS: SEEDED ───────────│◄─ { profile_id } ───────│
   │◄─ STATUS: LAUNCHING ────────│─ nucleus launch ────────►│
   │◄─ STATUS: LAUNCHED ─────────│◄─ { launch_id, pid } ───│
   │                              │                         │
   │◄─ STATUS: CONNECTING ───────│  [polling port file]    │
   │                              │─ TCP :PORT ─────────────►│
   │◄─ STATUS: CONNECTED ────────│                         │
   │                              │                         │
   │◄─ HOST_READY ───────────────│◄── HOST_READY ──────────│
   │◄─ HANDSHAKE ────────────────│◄── HANDSHAKE_CONFIRMED ─│
   │◄─ HEARTBEAT ────────────────│◄── heartbeat ───────────│
   │◄─ HEARTBEAT ────────────────│◄── heartbeat ───────────│
   │◄─ INTENT ───────────────────│◄── INTENT_STARTED ──────│
   │◄─ INTENT ───────────────────│◄── INTENT_PROGRESS ─────│
   │◄─ INTENT ───────────────────│◄── INTENT_COMPLETED ────│
```

---

## 8. Checklist de integración

- [ ] `shared/synapse-bridge.js` copiado en `conductor/shared/`
- [ ] `shared/preload-synapse.js` copiado en `conductor/shared/`
- [ ] `setup-synapse-handlers.js` copiado en `conductor/setup/ipc/`
- [ ] `workspace-synapse-handlers.js` copiado en `conductor/workspace/ipc/`
- [ ] `registerSynapseHandlers()` llamado en `setup/main.js` (require `./ipc/setup-synapse-handlers`)
- [ ] `registerSynapseHandlers()` llamado en `workspace/main_conductor.js` (require `./ipc/workspace-synapse-handlers`)
- [ ] `require('../../shared/preload-synapse')` agregado al preload de setup
- [ ] `require('../../shared/preload-synapse')` agregado al/los preload/s del workspace que lo necesiten
- [ ] `contextIsolation: true` y `nodeIntegration: false` en todos los `BrowserWindow` (defaults en Electron ≥ 12)
- [ ] Test: `nucleus --json synapse seed test_01` → `{ success: true, profile_id: ... }`
- [ ] Test: `nucleus --json synapse launch test_01 --mode discovery` → `{ success: true, launch_id: ..., chrome_pid: ... }`
- [ ] Test: `ls ~/Library/BloomNucleus/run/` muestra el `.port` file tras el launch

---

## 9. Troubleshooting

### Los eventos no llegan al renderer

1. En DevTools del renderer: `console.log(typeof window.bloomSynapse)`. Si es `undefined`, el preload no está configurado para esa ventana.
2. Verificar que el `preload:` en `webPreferences` de ese `BrowserWindow` apunta al archivo correcto.
3. En el main process: `node -e "require('./shared/synapse-bridge')"` — no debe dar error.

### El port file no aparece

1. `ls ~/Library/BloomNucleus/run/` — el directorio debe existir post-launch.
2. Si no existe, Brain no está levantando el IPC server. Revisar logs en `~/Library/BloomNucleus/logs/`.
3. El bridge espera hasta 30 segundos (`PORT_FILE_MAX_WAIT_MS`). Si ese timeout es muy corto para tu entorno, aumentarlo en `synapse-bridge.js`.

### `nucleus: command not found`

En Electron empaquetado, `PATH` puede diferir del shell. Dos opciones:

```js
// Opción A: derivar desde global_paths (si ya lo tenés resuelto ahí)
const { nucleusBinary } = require('../../shared/global_paths');
registerSynapseHandlers(() => mainWindow, { nucleusBinary });

// Opción B: derivar desde bloomRoot
const path = require('path');
const { getBloomRoot } = require('../../shared/synapse-bridge');
const nucleusBinary = path.join(getBloomRoot(), 'bin', 'nucleus');
registerSynapseHandlers(() => mainWindow, { nucleusBinary });
```

### Heartbeat llega pero HANDSHAKE no

El handshake de 3 fases (`extension_ready` → `host_ready` → `handshake_confirm`) lo inicia `background.js` de Cortex, no el bridge. El bridge escucha pasivamente el `HANDSHAKE_CONFIRMED` que Brain emite al completar el tercer paso. Si heartbeat llega pero HANDSHAKE no, el problema está en Cortex/background.js, no en el bridge.

---

## 10. Notas de diseño

- **Una instancia por ventana:** setup usa un singleton (una ventana a la vez), workspace usa un `Map` (puede tener core + onboarding simultáneos). No hay estado global compartido.
- **Reconexión automática:** si el socket TCP cae, el bridge reconecta con backoff exponencial (2s → 4s → 8s → … → 30s máx), re-leyendo el port file en cada intento por si Brain se reinició en otro puerto.
- **Sin estado compartido entre apps:** setup y workspace son procesos Electron distintos. Sus bridges son completamente independientes.
- **El bridge no conoce el protocolo de alto nivel:** solo parsea el wire format y clasifica los mensajes. La lógica de negocio (qué hacer con cada evento) vive en el renderer.
- **`getBloomRoot()` es la única fuente de verdad de paths:** si el path canónico cambia, se modifica en un solo lugar en `shared/synapse-bridge.js`.
