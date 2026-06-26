# Bloom Workspace Harness — Manual de Referencia

**Sistema:** Bloom Conductor · Workspace (Electron)
**Protocolo:** Synapse v4
**Estado:** funcional — canal Workspace → nucleus → bus → Cortex verificado
**Revisión:** Junio 2026 — Jun 25 (actualizado con hallazgos de auditoría Cortex)

---

## 1. Qué es el Harness y para qué existe

El Harness es el panel de debug del protocolo Synapse en el lado de Workspace. Su rol es doble:

- **Observar** todos los eventos que circulan por el bus de nucleus en tiempo real, vía WebSocket
- **Simular** eventos del protocolo para testear que Cortex los recibe y los procesa correctamente

El Harness **no modifica estado del sistema** por sí mismo. Cuando simula un evento, lo inyecta en el bus exactamente igual que lo haría cualquier otro componente. nucleus lo procesa y lo distribuye.

### Relación con el Cortex Harness

El Workspace Harness y el Cortex Harness son **dos consumidores del mismo feed**. `background.js` (Cortex) emite cada evento hacia dos destinos simultáneos:

1. **POST** `http://localhost:48215/api/internal/system-event` → llega aquí (Workspace Harness, via nucleus)
2. **`chrome.runtime.sendMessage`** → llega al Cortex Harness (tab de la extensión)

Si el shape del mensaje `HARNESS_LOG` cambia, **rompe a los dos consumidores**. Cualquier cambio en el formato debe coordinarse.

---

## 2. Arquitectura — los tres canales

```
┌─────────────────────────────────────────────────────────┐
│  Workspace (Electron)                                   │
│                                                         │
│  onboarding.html                                        │
│    └── <iframe id="debug-frame"> → debug.html           │
│             │                                           │
│             ├── WebSocket ws://localhost:4124           │  ← observación (broadcast)
│             └── HTTP POST :48215/api/internal/          │  ← simulación (inyección)
│                           system-event                  │
└─────────────────────────────────────────────────────────┘
                        │
              nucleus Control Plane
                        │
                   bus interno
                        │
        ┌───────────────┴───────────────┐
        │                               │
   WS broadcast                   otros listeners
   type: "system:event"                │
        │                           Cortex / background.js
   todos los clientes              (también recibe por POST)
   conectados al WS
```

### Canal 1 — WebSocket (observación)

`ws://localhost:4124` — nucleus hace broadcast de todos los eventos del bus.

Envelope:
```json
{
  "type": "system:event",
  "payload": {
    "category": "nucleus",
    "event": "BOOTSTRAP_READY",
    "data": { "ws_port": 4124, "api_port": 48215 },
    "profile_id": null,
    "timestamp": 1781810167360
  }
}
```

> El discriminador es `type: "system:event"` (con dos puntos). El código actual acepta ambos formatos (`"system:event"` y `"system_event"`) para compatibilidad retroactiva.

### Canal 2 — HTTP REST (simulación)

`POST http://localhost:48215/api/internal/system-event`

```json
{
  "category": "nucleus",
  "event": "BOOTSTRAP_READY",
  "data": { "ws_port": 4124, "api_port": 48215 },
  "profile_id": null
}
```

Respuesta exitosa: `{"ok": true}`

El evento entra al bus de nucleus y se redistribuye por WS a todos los clientes.

### Canal 3 — postMessage bridge (IPC proxy)

Como `debug.html` corre en un `<iframe>`, no tiene acceso a `window.onboarding`. Para el health, `onboarding.js` actúa como proxy:

```
debug.html (iframe)
  → postMessage({ type: 'REQUEST_HEALTH' }) → onboarding.html (padre)
  ← postMessage({ type: 'HEALTH_RESPONSE', data }) ← window.onboarding.health() via IPC
```

---

## 3. Archivos del sistema

| Archivo | Ubicación | Rol |
|---|---|---|
| `debug.html` | `shared/debug.html` | Panel de debug — feed, sim-bar, health sidebar |
| `onboarding.html` | `onboarding/onboarding.html` | Documento raíz que monta el iframe |
| `onboarding.js` | `onboarding/onboarding.js` | Lógica del renderer — `toggleDebugPanel()`, postMessage bridge |
| `preload_onboarding.js` | `onboarding/preload_onboarding.js` | Expone `window.onboarding` via `contextBridge` |
| `main_conductor.js` | `main_conductor.js` | Proceso main — IPC handlers, spawn de nucleus |
| `onboarding-handlers.js` | `onboarding-handlers.js` | Handlers IPC del flujo de onboarding |

---

## 4. Layout del Harness

```
┌─────────────────────────────────────────────────────────────────────┐
│  🌱 Bloom Harness [DEV]  ●  ws://localhost:4124  [live/reconnecting]│  ← titlebar + WS dot
├──────────────┬──────────────────────────────────────────────────────┤
│              │                                                      │
│  HEALTH      │  FEED                                                │
│  ────────    │                                                      │
│  ● nucleus   │  [synapse] HANDSHAKE_CONFIRMED  19:15:22  info      │
│    API OK    │  [synapse] HOST→:ACCOUNT_REGISTERED  19:16:01  info │
│              │  [synapse] GITHUB_PAT_DETECTED  19:17:30  info      │
│  FILTERS     │  [nucleus] BOOTSTRAP_READY  19:17:47  success       │
│  ────────    │                                                      │
│  ☑ synapse   │                                                      │
│  ☑ temporal  │                                                      │
│  ☑ brain     │                                                      │
│  ☑ nucleus   │                                                      │
│  ☑ health    │                                                      │
│  ☑ sentinel  │                                                      │
│              │                                                      │
├──────────────┴──────────────────────────────────────────────────────┤
│  Simulate → [nucleus · BOOTSTRAP_READY ▾]  [POST →]  [Auto]        │  ← sim-bar
└─────────────────────────────────────────────────────────────────────┘
```

### Feed central

Cada entrada muestra: categoría (con color), nombre del evento, timestamp, nivel.

Las categorías que emite `background.js` hacia este feed son:
- `synapse` — eventos del protocolo Synapse (handshake, tokens, discovery, IonPump)
- `sentinel` — eventos de la extensión Chrome (actuator_ready → `EXTENSION_LOADED`)
- `brain` — eventos IonPump (ION_FLOW_*, ION_RELOAD_*, ION_INSPECT_RESULT)

Los nombres de eventos tienen prefijos direccionales:
- `HOST→:LABEL` — mensaje entrante del host a background.js
- `→HOST:LABEL` — mensaje saliente de background.js al host
- `LABEL` sin prefijo — evento reportado por el propio componente (ej: `HANDSHAKE_CONFIRMED`)

> **Nota de seguridad:** tokens y API keys son sanitizados antes de llegar al feed — primeros 10 caracteres + `…`. Nunca aparece el token completo.

### Filtros

Checkbox por categoría. El contador muestra cuántos eventos de esa categoría llegaron en la sesión actual.

---

## 5. Eventos disponibles para simular

### synapse
| Evento | Propósito | Data |
|---|---|---|
| `GITHUB_PAT_DETECTED` | Simula clipboard monitor detectando token | `token_fingerprint: "ghp_...abc"` |
| `GITHUB_TOKEN_STORED` | Simula token cifrado en vault | `vault_key: "sk_bloom_pat"` |
| `DISCOVERY_COMPLETE` | Cierra el flujo de onboarding | `steps_done: 5` |
| `HANDSHAKE_CONFIRMED` | Handshake Synapse entre Workspace y Cortex | `extension_id: "bloom-ext"` |

### temporal
| Evento | Propósito | Data |
|---|---|---|
| `WORKFLOW_STATE_CHANGED` | Un workflow cambió de estado | `workflow: "onboarding", state: "completed"` |
| `INTENT_FAILED` | Un intent falló | `intent: "click_merge", error: "element_not_found"` |

### brain
| Evento | Propósito | Data |
|---|---|---|
| `PROFILE_LAUNCHED` | Brain lanzó Chrome con el perfil | `chrome_pid: 14392, debug_port: 9222` |

### health
| Evento | Propósito | Data |
|---|---|---|
| `COMPONENT_STATE_CHANGED` | Un componente cambió de estado | `component: "brain_service", state: "UNREACHABLE"` |

### nucleus
| Evento | Propósito | Data |
|---|---|---|
| `BOOTSTRAP_READY` | Sistema listo — handshake inicial | `ws_port: 4124, api_port: 48215` |

### sentinel
| Evento | Propósito | Data |
|---|---|---|
| `EXTENSION_LOADED` | La extensión Chrome cargó | `manifest_version: 3` |

---

## 6. Cómo usar el Harness — flujos de trabajo

### Flujo A — Verificar que Cortex recibe un evento

1. Tener Cortex conectado (verificar handshake completado en logs de background.js)
2. En el sim-bar, seleccionar el evento a testear
3. Presionar **POST →**
4. Verificar en el feed de Workspace que aparece la entrada
5. Verificar en el Cortex Harness (tab de la extensión) que el mismo evento aparece en su feed

### Flujo B — Simular el flujo completo github_auth → Landing

El objetivo del **primer milestone**: disparar desde Workspace y verificar que Cortex lo recibe y abre Landing.

```
Workspace sim-bar → Cortex background.js → Discovery → Landing

1. nucleus    · BOOTSTRAP_READY          ← handshake inicial
2. sentinel   · EXTENSION_LOADED         ← extensión lista
3. brain      · PROFILE_LAUNCHED         ← Chrome con perfil activo
4. synapse    · HANDSHAKE_CONFIRMED      ← sesión Synapse establecida
5. synapse    · GITHUB_PAT_DETECTED      ← token detectado
6. synapse    · GITHUB_TOKEN_STORED      ← token cifrado
7. synapse    · DISCOVERY_COMPLETE       ← onboarding finalizado
```

Verificar en el feed del Cortex Harness que aparecen los mismos eventos con los mismos timestamps.

### Flujo C — Testear resiliencia de Cortex

Usar **Auto** con `temporal · INTENT_FAILED` para verificar que Cortex maneja fallos repetidos sin romperse.

---

## 7. Diagnóstico de problemas comunes

### WS dot en rojo / "reconnecting"

**Causa:** `:4124` no está escuchando o el Control Plane no levantó.

```bash
ss -tlnp | grep 4124
nucleus --json health | python3 -m json.tool
```

Verificar que la meta CSP de `debug.html` incluye `ws://localhost:4124` en `connect-src`.

---

### Health muestra "UNKNOWN"

**Causa A:** bridge de postMessage no instalado — `onboarding.js` no tiene `_installDebugHealthBridge()`.

**Causa B:** nucleus no está corriendo. Verificar con `nucleus --json health`.

**Causa C:** `/health` devuelve `{status:"ok"}` pero el Harness valida `data.components || data.state` — usar `renderHealthSimple()`.

---

### POST → no hace nada visible

**Causa A:** el fetch llegó al servidor (`{"ok":true}`) pero el WS no está conectado. Verificar el dot del WS.

**Causa B:** el envelope del WS cambió. Discriminador actual: `type: "system:event"` o `type: "system_event"`.

**Causa C:** fetch falla con 404. Verificar:
```bash
curl -X POST http://localhost:48215/api/internal/system-event \
  -H "Content-Type: application/json" \
  -d '{"category":"nucleus","event":"TEST","data":{}}'
# Respuesta esperada: {"ok":true}
```

---

### Evento llega al Workspace Harness pero no al Cortex Harness

**Causa probable:** `background.js` está emitiendo correctamente (el POST llegó a nucleus), pero la tab del Cortex Harness no tiene un listener activo o hubo un error silencioso en `chrome.runtime.sendMessage`.

**Verificar en Dev Tools de background.js** (service worker):
1. ¿`harnessLogBuffer` tiene entradas?
2. ¿El `chrome.runtime.sendMessage(harnessMsg).catch(() => {})` falló silenciosamente?

El Cortex Harness debería pedir el replay al abrir (`HARNESS_HELLO`). Si el replay no llega, verificar que la tab del Harness está completamente cargada antes de esperarlo.

---

### Notification-rail visible al abrir debug

**Causa:** `toggleDebugPanel()` no oculta `#notification-rail`.

```javascript
// En onboarding.js — rama if (debugPanelOpen):
const rail = document.getElementById('notification-rail');
if (rail) rail.style.display = 'none';
document.getElementById('cortex-bar')?.classList.remove('visible');

// En rama else:
const rail2 = document.getElementById('notification-rail');
if (rail2) rail2.style.display = '';
```

---

### postMessage bridge timeout en logs

```
[WARN] postMessage health bridge: timeout
```

Comportamiento esperado si `onboarding.js` no tiene el bridge instalado. El Harness cae al fallback REST y muestra "API OK". No es bloqueante.

Para eliminar el warning, agregar `_installDebugHealthBridge()` en `onboarding.js` y llamarla desde `toggleDebugPanel()`.

---

## 8. Issues conocidos y mejoras pendientes

### Issues

| # | Problema | Impacto | Estado |
|---|---|---|---|
| 1 | Health sidebar muestra "API OK" sin detalle de componentes | No se puede ver el estado de brain, temporal, vault desde el Harness | Requiere bridge postMessage funcionando |
| 2 | postMessage bridge da timeout | Health y sim funcionan igual por REST, pero los logs muestran warnings | Investigar `_installDebugHealthBridge()` |
| 3 | `profile_id` hardcodeado en eventos del sim-bar | Los eventos simulados no corresponden al perfil activo | Leer el `profile_id` real desde `window.onboarding` |
| 4 | WS se reconecta sin aviso en el feed | Se pierde contexto de cuándo el canal estuvo caído | Agregar entrada de sistema al feed en `ws.onopen` |

### Features pendientes

| # | Feature | Descripción |
|---|---|---|
| F1 | Editar payload antes de enviar | Agregar textarea editable al seleccionar un evento |
| F2 | Historial de sesión | Exportar el feed completo como JSON |
| F3 | Filtro por `profile_id` | Para múltiples perfiles activos |
| F4 | Indicador de latencia | Tiempo entre POST y vuelta por WS |
| F5 | Vista del catálogo de schemas de Cortex | *(actualizado Jun 26 2026)* — El catálogo JSON ya existe en Cortex (extension/protocols/*.schema.json, Fase 1–5). Pendiente: exponer esos schemas como lectura en el feed del Workspace Harness para tener visibilidad del contrato desde el lado Electron. |
| F6 | Health con detalle completo | Cuando el bridge esté funcionando |
| F7 | Vista integrada con Cortex Harness | Ver en un solo feed los eventos de ambos Harnesses — hoy se ven separados |

---

## 9. Constantes de configuración

```javascript
const WS_URL     = 'ws://localhost:4124';
const API_URL    = 'http://localhost:48215';
const MAX_ENTRIES = 500;
```

Rutas REST relevantes:
```
GET  /health                           → { status, timestamp, version }
POST /api/internal/system-event        → { ok: true }
```

---

## 10. Estado verificado al cierre de sesión Jun 25

```
✓  WebSocket conecta a ws://localhost:4124
✓  Envelope WS: { type: "system:event", payload: { category, event, data, profile_id, timestamp } }
✓  POST /api/internal/system-event responde {"ok":true}
✓  Eventos simulados aparecen en el feed
✓  background.js confirma doble destino: nucleus POST + Cortex Harness sendMessage
✓  harnessLogBuffer (100 entradas) + HARNESS_HELLO/REPLAY funcionando en Cortex
✓  notification-rail y cortex-bar se ocultan al abrir el debug panel
✓  CSP permite img-src data:

✗  postMessage bridge da timeout (health via REST funciona como fallback)
✗  Health sidebar muestra "API OK" sin detalle de componentes
?  Cortex Harness y Workspace Harness en sync — pendiente verificar en sesión integrada
?  Landing abre correctamente post ACCOUNT_REGISTERED — pendiente test end-to-end
```

---

## 11. Próximo paso — test de primer milestone

El objetivo del primer test es:

> **Verificar que un registro correcto de GitHub (PAT detectado → confirmado → ACCOUNT_REGISTERED) llega correctamente al Workspace y dispara la apertura de Landing.**

Para ejecutarlo:
1. Tener ambos Harnesses abiertos (Workspace en Electron + Cortex en Chrome)
2. Verificar handshake completado en ambos feeds
3. Ejecutar la secuencia del §6 Flujo B
4. Verificar que `ACCOUNT_REGISTERED` aparece en el feed del Workspace Harness con categoría `synapse`
5. Verificar que `→HOST:ACCOUNT_REGISTERED` y `→HOST:GITHUB_TOKEN_STORED` aparecen en el feed del Cortex Harness
6. Verificar que Brain dispara el re-launch y Landing page abre

Si el paso 6 no ocurre, el punto de falla está en el lado Brain (MilestoneReactor) — fuera del scope del Harness de Cortex.
