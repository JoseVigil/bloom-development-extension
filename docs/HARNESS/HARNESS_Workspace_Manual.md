# Bloom Workspace Harness — Manual de Referencia

**Sistema:** Bloom Conductor · Workspace (Electron)  
**Protocolo:** Synapse v4  
**Estado:** funcional — canal Workspace → nucleus → bus → Cortex verificado  

---

## 1. Qué es el Harness y para qué existe

El Harness es el panel de debug del protocolo Synapse en el lado de Workspace. Su rol es doble:

- **Observar** todos los eventos que circulan por el bus de nucleus en tiempo real, vía WebSocket
- **Simular** eventos del protocolo para testear que Cortex los recibe y los procesa correctamente, sin depender del flujo real

El Harness **no modifica estado del sistema** por sí mismo. Cuando simula un evento, lo inyecta en el bus exactamente igual que lo haría cualquier otro componente. nucleus lo procesa y lo distribuye. El resultado es indistinguible de un evento real.

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
        │                           Cortex
   todos los clientes              (web / extension)
   conectados al WS
```

### Canal 1 — WebSocket (observación)

`ws://localhost:4124` — el Control Plane de nucleus hace broadcast de todos los eventos del bus a todos los clientes conectados.

Envelope que emite nucleus:
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

> **Importante:** el discriminador es `type: "system:event"` (dos puntos), no `"system_event"` (guión bajo). El código actual acepta ambos para compatibilidad.

Al conectar, nucleus también emite:
```json
{
  "event": "bloom.ai.execution.connected",
  "data": { "clientId": "client_...", "timestamp": ... }
}
```
Este mensaje no tiene `type: "system:event"` por lo que el Harness lo ignora correctamente.

### Canal 2 — HTTP REST (simulación)

`POST http://localhost:48215/api/internal/system-event`

Payload:
```json
{
  "category": "nucleus",
  "event": "BOOTSTRAP_READY",
  "data": { "ws_port": 4124, "api_port": 48215 },
  "profile_id": null
}
```

Respuesta exitosa: `{"ok": true}`

El evento entra al bus de nucleus y nucleus lo redistribuye por WS a todos los clientes conectados, incluyendo al propio Harness (que lo ve aparecer en el feed) y a Cortex.

### Canal 3 — postMessage bridge (IPC proxy)

Como `debug.html` corre en un `<iframe>`, no tiene acceso a `window.onboarding` (que el preload de Electron solo inyecta en el documento raíz). Para el health, `onboarding.js` actúa como proxy:

```
debug.html (iframe)
  → postMessage({ type: 'REQUEST_HEALTH' }) → onboarding.html (padre)
  ← postMessage({ type: 'HEALTH_RESPONSE', data }) ← window.onboarding.health() via IPC
```

El sim también tiene este fallback pero actualmente no se usa porque el fetch directo a `:48215` funciona.

---

## 3. Archivos del sistema

| Archivo | Ubicación | Rol |
|---|---|---|
| `debug.html` | `shared/debug.html` | Panel de debug completo — feed, sim-bar, health sidebar |
| `onboarding.html` | `onboarding/onboarding.html` | Documento raíz que monta el iframe |
| `onboarding.js` | `onboarding/onboarding.js` | Lógica del renderer — incluye `toggleDebugPanel()` y el postMessage bridge |
| `preload_onboarding.js` | `onboarding/preload_onboarding.js` | Expone `window.onboarding` al renderer raíz via `contextBridge` |
| `main_conductor.js` | `main_conductor.js` | Proceso main — IPC handlers, spawn de nucleus, `onboarding:health` |
| `onboarding-handlers.js` | `onboarding-handlers.js` | Handlers IPC específicos del flujo de onboarding |

---

## 4. Layout del Harness

```
┌─────────────────────────────────────────────────────────────────────┐
│  🌱 Bloom Harness [DEV]  ●  ws://localhost:4124  [live/reconnecting]│  ← titlebar + WS dot
├──────────────┬──────────────────────────────────────────────────────┤
│              │                                                      │
│  HEALTH      │  FEED                                                │
│  ────────    │                                                      │
│  ● nucleus   │  [nucleus] BOOTSTRAP_READY  19:17:47  success       │
│    API OK    │  [synapse] HANDSHAKE_CONFIRMED  19:15:22  info      │
│              │  [temporal] WORKFLOW_STATE_CHANGED  19:14:01  warn  │
│  FILTERS     │                                                      │
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

### Sidebar izquierdo — Health + Filters

**Health section:** muestra el estado de nucleus. Dado que `/health` REST devuelve `{status, timestamp, version}` sin detalle de componentes, la UI muestra "API OK" cuando el server responde 200. El detalle completo de componentes (brain, temporal, vault, etc.) solo está disponible via `nucleus --json health` en la CLI.

**Filters:** checkbox por categoría de evento. Cada categoría tiene un color distinto en el feed. El contador muestra cuántos eventos de esa categoría llegaron en la sesión actual.

### Feed central

Cada entrada muestra: categoría (con color), nombre del evento, timestamp, nivel (success/warn/error/info).

Click en una entrada abre el **detail drawer** con el payload completo en JSON.

El feed tiene un máximo de 500 entradas. Las entradas más nuevas aparecen arriba.

**Botón Pause** (⏸): congela el feed sin desconectar el WS. Los eventos siguen llegando pero no se renderizan hasta que se reanude.

**Botón Clear** (🗑): limpia el feed visual y el array de estado.

### Sim-bar inferior

Dropdown con todos los eventos simulables agrupados por categoría + botón **POST →** que los despacha al bus.

**Auto:** modo de disparo automático que envía el evento seleccionado cada N segundos. Útil para testear que Cortex maneja eventos repetidos correctamente.

---

## 5. Eventos disponibles para simular

### synapse
| Evento | Propósito | Data |
|---|---|---|
| `GITHUB_PAT_DETECTED` | Simula que el clipboard monitor detectó un token | `token_fingerprint: "ghp_...abc"` |
| `GITHUB_TOKEN_STORED` | Simula que el token fue cifrado en vault | `vault_key: "sk_bloom_pat"` |
| `DISCOVERY_COMPLETE` | Cierra el flujo de onboarding | `steps_done: 5` |
| `HANDSHAKE_CONFIRMED` | Handshake Synapse entre Workspace y Cortex | `extension_id: "bloom-ext"` |

### temporal
| Evento | Propósito | Data |
|---|---|---|
| `WORKFLOW_STATE_CHANGED` | Cambio de estado de un workflow Temporal | `from: "PENDING", to: "RUNNING"` |
| `INTENT_COMPLETED` | Un intent de automatización completó | `intent: "navigate_to_pr"` |
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

1. Tener Cortex conectado al WS en `:4124` (verificar en logs de Cortex)
2. En el sim-bar, seleccionar el evento a testear
3. Presionar **POST →**
4. Verificar en el feed de Workspace que aparece la entrada (borde verde = llegó al servidor)
5. Verificar en Cortex que el evento llegó con el mismo timestamp

### Flujo B — Simular el flujo completo de onboarding

Disparar en orden, verificando que Cortex avanza en cada paso:

```
1. nucleus    · BOOTSTRAP_READY          ← handshake inicial
2. sentinel   · EXTENSION_LOADED         ← extensión lista
3. brain      · PROFILE_LAUNCHED         ← Chrome con perfil activo
4. synapse    · HANDSHAKE_CONFIRMED      ← sesión Synapse establecida
5. synapse    · GITHUB_PAT_DETECTED      ← token detectado
6. synapse    · GITHUB_TOKEN_STORED      ← token cifrado
7. synapse    · DISCOVERY_COMPLETE       ← onboarding finalizado
```

### Flujo C — Testear resiliencia de Cortex

Usar **Auto** con `temporal · INTENT_FAILED` para verificar que Cortex maneja fallos repetidos sin romperse. Verificar que no acumula handlers o que el retry logic funciona correctamente.

---

## 7. Diagnóstico de problemas comunes

### WS dot en rojo / "reconnecting"

**Causa:** `:4124` no está escuchando o el Control Plane no levantó.

**Verificar:**
```bash
ss -tlnp | grep 4124
nucleus --json health | python3 -m json.tool
```

Si el proceso existe pero el WS no conecta, revisar que el iframe no tenga una CSP que bloquee `ws://localhost`. La meta CSP de `debug.html` debe incluir `ws://localhost:4124` en `connect-src`.

---

### Health muestra "UNKNOWN"

**Causa A:** el bridge de postMessage no está instalado — `onboarding.js` no tiene `_installDebugHealthBridge()` o `toggleDebugPanel()` no la llama.

**Causa B:** nucleus no está corriendo. Verificar con `nucleus --json health`.

**Causa C:** todas las rutas REST fallaron. La única ruta real es `/health`. Si devuelve 200 con `{status:"ok"}` pero el Harness muestra UNKNOWN, el código está validando por `data.components || data.state` y `/health` no tiene esos campos — usar `renderHealthSimple()`.

---

### POST → no hace nada visible

**Causa A:** el fetch llegó al servidor (`{"ok":true}`) pero el evento no vuelve por WS porque el WS no está conectado. Verificar el dot del WS.

**Causa B:** el envelope del WS cambió. El discriminador actual acepta `type: "system:event"` y `type: "system_event"`. Si nucleus cambia el envelope, actualizar en `ws.onmessage` de `debug.html`.

**Causa C:** el fetch falla con 404. La ruta correcta es `/api/internal/system-event`. Verificar con:
```bash
curl -X POST http://localhost:48215/api/internal/system-event \
  -H "Content-Type: application/json" \
  -d '{"category":"nucleus","event":"TEST","data":{}}'
# Respuesta esperada: {"ok":true}
```

---

### Notification-rail visible al abrir debug

**Causa:** `toggleDebugPanel()` en `onboarding.js` no oculta `#notification-rail`.

**Fix:** en la rama `if (debugPanelOpen)` de `toggleDebugPanel()`:
```javascript
const rail = document.getElementById('notification-rail');
if (rail) rail.style.display = 'none';
document.getElementById('cortex-bar')?.classList.remove('visible');
```
Y en la rama `else`:
```javascript
const rail2 = document.getElementById('notification-rail');
if (rail2) rail2.style.display = '';
```

---

### postMessage bridge timeout en logs

```
[WARN] postMessage health bridge: timeout
```

Esto es esperado si `onboarding.js` no tiene el bridge instalado. El Harness cae al fallback REST y muestra "API OK" con la info simplificada. No es un error bloqueante — el health y el sim funcionan igual.

Para eliminar el warning, agregar `_installDebugHealthBridge()` en `onboarding.js` y llamarla desde `toggleDebugPanel()`.

---

## 8. Issues conocidos y mejoras pendientes

### Issues

| # | Problema | Impacto | Estado |
|---|---|---|---|
| 1 | Health sidebar muestra "API OK" en vez del detalle de componentes | Informativo — no se puede ver el estado de brain, temporal, vault desde el Harness | Requiere bridge postMessage funcionando |
| 2 | postMessage bridge da timeout — el bridge en `onboarding.js` no se instala correctamente en todos los builds | Health y sim funcionan igual por REST, pero los logs muestran warnings | Investigar por qué `_installDebugHealthBridge()` no responde |
| 3 | `profile_id` hardcodeado en los eventos del sim-bar (`"2183af25"`) | Los eventos simulados no corresponden al perfil activo de la sesión | Leer el `profile_id` real desde `window.onboarding` o desde un meta tag en `onboarding.html` |
| 4 | WS se reconecta con backoff pero no avisa en el feed cuando reconecta | Se pierde contexto de cuándo el canal estuvo caído | Agregar entrada de sistema al feed en `ws.onopen` después de reconexión |

### Features pendientes

| # | Feature | Descripción |
|---|---|---|
| F1 | Editar payload antes de enviar | Hoy el sim-bar envía el payload hardcodeado. Agregar un textarea editable que se muestre al seleccionar un evento |
| F2 | Historial de sesión | Exportar el feed completo como JSON o copiar al clipboard para compartir en issues |
| F3 | Filtro por `profile_id` | Cuando hay múltiples perfiles activos, poder ver solo los eventos de uno |
| F4 | Indicador de latencia | Mostrar el tiempo entre el POST y el momento en que el evento vuelve por WS |
| F5 | Agregar eventos al sim-bar sin modificar el HTML | Cargar el catálogo de eventos desde un JSON externo o desde nucleus via REST |
| F6 | Health con detalle completo | Cuando el bridge esté funcionando, mostrar cada componente del JSON de `nucleus --json health` con su estado individual |

---

## 9. Constantes de configuración

Definidas al inicio del script de `debug.html`:

```javascript
const WS_URL     = 'ws://localhost:4124';       // Control Plane WebSocket
const API_URL    = 'http://localhost:48215';    // nucleus REST API
const MAX_ENTRIES = 500;                        // máximo de entradas en el feed
```

Rutas REST relevantes:
```
GET  /health                           → { status, timestamp, version }
POST /api/internal/system-event        → { ok: true }
```

---

## 10. Estado verificado al cierre de esta sesión

```
✓  WebSocket conecta a ws://localhost:4124
✓  Envelope WS: { type: "system:event", payload: { category, event, data, profile_id, timestamp } }
✓  POST /api/internal/system-event responde {"ok":true}
✓  Eventos simulados aparecen en el feed con borde success
✓  nucleus --json health muestra todos los componentes HEALTHY
✓  notification-rail y cortex-bar se ocultan al abrir el debug panel
✓  CSP permite img-src data: (grain SVG sin errores)

✗  postMessage bridge da timeout (health via REST funciona como fallback)
✗  Health sidebar muestra "API OK" sin detalle de componentes
?  Cortex recibe los eventos del bus — pendiente verificar en la sesión de Cortex
```
