# Debug Panel — Estado de Implementación
## Qué se hizo, por qué, y qué falta
_Referencia: IMPL_PROMPT_DEBUG_PANEL_v1.md · BLOOM_HARNESS_IONPUMP_INTEGRATION_MASTER.md_

---

## 1. Contexto — Por qué existe esta página

El objetivo declarado es poder debuguear el onboarding de Synapse en tiempo real. Hoy el sistema es opaco: se lanza `nucleus synapse launch <profile_id> --mode discovery` y los eventos quedan dispersos en ~28 archivos de log distintos (ver `telemetry.json`). No hay forma de ver en un solo lugar qué paso del onboarding está ejecutándose, cuándo llega un `GITHUB_PAT_DETECTED`, o por qué un workflow Temporal cambia de estado.

El Harness es la solución a eso, pero está dividido en dos mundos distintos que hay que conectar.

---

## 2. Los dos mundos del Harness — mapa conceptual

```
MUNDO 1 — Chrome Extension (Harness original)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Archivo fuente:  brain/core/profile/web/templates/harness/index.html
Vive en:         Tab especial dentro del perfil Chrome lanzado por Synapse
Canal:           chrome.runtime.sendMessage / chrome.runtime.onMessage
Qué hace:        Lee DISCOVERY_PROTOCOL_MANIFEST desde discoveryProtocol.js
                 Genera botones de simulación dinámicamente
                 Dispara eventos hacia background.js (GITHUB_PAT_DETECTED, etc.)
                 Observa pasivamente los mensajes chrome.runtime
Estado actual:   STUB — nucleus health lo reporta como healthy/STUB
                 El log está en logs/nucleus/harness/harness.log
                 Sentinel lo copia al directorio de Cortex durante el seed
Limitación:      Solo existe dentro del contexto de la extensión Chrome.
                 No tiene acceso a WebSocket :4124 ni a la API :48215.

MUNDO 2 — Control Plane Debug Panel (lo que se construyó en esta sesión)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Archivo:         debug.html (adjunto en esta sesión)
Vive en:         Electron standalone window / localhost:5173/debug
Canal:           WebSocket ws://localhost:4124 + REST http://localhost:48215
Qué hace:        Feed de eventos del sistema en tiempo real
                 Panel de health con estado de todos los componentes
                 Filtros por categoría (synapse, brain, sentinel, nucleus, temporal, health)
                 Drawer de detalle por evento
                 Simulador de eventos vía POST /internal/system-event
Estado actual:   El HTML existe y está listo.
                 El endpoint POST /internal/system-event NO está implementado aún.
                 El WebSocket no emite 'system:event' todavía.
```

**La confusión razonable:** el nombre "Harness" en la documentación arquitectónica (BLOOM_HARNESS_IONPUMP_INTEGRATION_MASTER.md) se refiere al Mundo 1 — la herramienta dentro de Chrome. Lo que se construyó en esta sesión es el Mundo 2 — el panel de observabilidad desde Electron/Svelte.

Son complementarios, no el mismo componente.

---

## 3. Qué se construyó en esta sesión

### 3.1 `debug.html` — el panel standalone

Un archivo HTML autocontenido que sigue el mismo design system que `onboarding.html` de Conductor (fuente Syne + DM Mono, dark theme `#080A0E`, accent `#C8F55A`).

**Lo que hace el archivo:**

| Feature | Cómo funciona |
|---------|---------------|
| WebSocket al Control Plane | Conecta a `ws://localhost:4124`, escucha mensajes `{ type: 'system:event', payload }`, reconexión automática con backoff (1.5s → tope 10s) |
| Health polling | `GET http://localhost:48215/api/health` al arrancar y cada 10 segundos, renderiza el estado real de cada componente |
| Feed de eventos | Muestra hasta 500 eventos con timestamp, categoría coloreada, nombre de evento, profile_id truncado, y payload JSON |
| Filtros por categoría | Botones toggle por synapse / brain / sentinel / nucleus / temporal / health |
| Drawer de detalle | Click en cualquier evento abre panel lateral con JSON formateado completo |
| Simulador | Dropdown con eventos predefinidos, botón POST → que llama `POST /internal/system-event` con fallback local |
| Auto-play | Reproduce la secuencia completa de onboarding automáticamente a 1 evento/segundo |
| Pause / Clear | Pause congela la ingesta sin desconectar el WebSocket, Clear vacía el feed |

**Por qué HTML standalone y no Svelte:** el path más rápido hacia la integración en Electron es copiar el patrón de `onboarding.html`. No requiere build step, no depende del estado de Vite, y se puede cargar con `debugWin.loadFile()` en el mismo momento en que se resuelve el error de `TipsChat.svelte`.

**Content-Security-Policy:** el `<meta>` CSP en el archivo ya permite exactamente los dos orígenes que necesita: `ws://localhost:4124` y `http://localhost:48215`. Sin esto, Electron bloquearía las conexiones.

### 3.2 Dónde va el archivo en el repo

```
conductor/                          ← o donde viva onboarding.html
├── assets/
│   ├── onboarding.html             ← ya existe
│   └── debug.html                  ← AGREGAR AQUÍ
```

### 3.3 Cómo registrarlo en Electron (main process)

En el mismo archivo donde se abre `onboarding`, agregar:

```javascript
const { BrowserWindow, globalShortcut } = require('electron');
const path = require('path');

let debugWin = null;

function openDebugPanel() {
  if (debugWin && !debugWin.isDestroyed()) {
    debugWin.focus();
    return;
  }
  debugWin = new BrowserWindow({
    width: 1280,
    height: 760,
    minWidth: 900,
    minHeight: 500,
    title: 'Bloom — Debug',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // No preload — habla directo a localhost
    },
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 16, y: 12 }
  });

  debugWin.loadFile(path.join(__dirname, 'assets', 'debug.html'));

  debugWin.on('closed', () => { debugWin = null; });
}

// Abrir con shortcut:
app.whenReady().then(() => {
  globalShortcut.register('CommandOrControl+Shift+D', openDebugPanel);
});
```

---

## 4. Qué falta implementar (pasos restantes ordenados)

### Paso 1 — Endpoint POST /internal/system-event (BLOQUEADOR)

**Archivo:** `src/api/server.ts` (o donde vive `startAPIServer`)

Sin este endpoint, el feed no recibe ningún evento real. El simulador del panel hace el POST pero no hay nada que lo escuche.

```typescript
fastify.post('/internal/system-event', {
  schema: {
    body: {
      type: 'object',
      required: ['category', 'event'],
      properties: {
        category: { type: 'string', enum: ['synapse','brain','sentinel','nucleus','temporal','health'] },
        event:     { type: 'string' },
        data:      { type: 'object' },
        profile_id: { type: 'string' },
        timestamp:  { type: 'number' }
      }
    }
  }
}, async (request, reply) => {
  const { category, event, data, profile_id } = request.body as any;
  wsManager.broadcast('system:event', {
    category,
    event,
    data: data || {},
    profile_id: profile_id || null,
    timestamp: Date.now()
  });
  return reply.send({ ok: true });
});
```

`wsManager` ya está disponible en el scope de `startAPIServer` — llega como parámetro desde `server-bootstrap.js`.

**Verificación rápida una vez implementado:**
```bash
curl -X POST http://localhost:48215/internal/system-event \
  -H "Content-Type: application/json" \
  -d '{"category":"synapse","event":"TEST_EVENT","data":{"msg":"hello"}}'
```
El feed en `debug.html` debe mostrar la línea inmediatamente.

### Paso 2 — PublishSystemEvent en Go (visibilidad del onboarding real)

**Archivo nuevo:** `internal/supervisor/events.go`

Este helper permite que cualquier parte de Nucleus emita eventos al panel sin boilerplate. Es fire-and-forget en goroutine separada — nunca bloquea el flujo principal.

```go
func PublishSystemEvent(category, event string, data map[string]interface{}, profileID string) {
    payload := map[string]interface{}{
        "category":   category,
        "event":      event,
        "data":       data,
        "profile_id": profileID,
        "timestamp":  time.Now().UnixMilli(),
    }
    body, _ := json.Marshal(payload)
    go func() {
        client := &http.Client{Timeout: 2 * time.Second}
        resp, err := client.Post("http://localhost:48215/internal/system-event",
            "application/json", bytes.NewBuffer(body))
        if err != nil { return }
        defer resp.Body.Close()
    }()
}
```

**Dónde llamarlo para el onboarding de Synapse:**

Los eventos más importantes para el milestone GitHub, en `internal/orchestration/activities/sentinel_activities.go` (el archivo unificado post-refactor v3.0):

```go
// Cuando Chrome + extensión están listos:
PublishSystemEvent("synapse", "PROFILE_LAUNCHED", map[string]interface{}{
    "chrome_pid":  result.ChromePID,
    "debug_port":  result.DebugPort,
}, profileID)

// Cuando el workflow Temporal cambia de estado:
PublishSystemEvent("temporal", "WORKFLOW_STATE_CHANGED", map[string]interface{}{
    "from": previousState,
    "to":   newState,
}, profileID)

// Cuando llega GITHUB_PAT_DETECTED del Synapse protocol:
PublishSystemEvent("synapse", "GITHUB_PAT_DETECTED", map[string]interface{}{
    "token_fingerprint": fingerprint,
}, profileID)

// Cuando se completa el onboarding:
PublishSystemEvent("synapse", "DISCOVERY_COMPLETE", map[string]interface{}{
    "completed_steps": completedSteps,
}, profileID)
```

### Paso 3 — Agregar debug.html al Electron main process

Ya descrito en §3.3. Una vez que el Paso 1 esté funcionando, este paso tarda 10 minutos.

### Paso 4 — Versión Svelte en /debug (opcional, para Workspace)

Si se quiere el panel también accesible desde la UI en `:5173`, los tres componentes están especificados en `IMPL_PROMPT_DEBUG_PANEL_v1.md` Parte 3:

```
webview/app/src/routes/debug/+page.svelte
webview/app/src/lib/components/debug/DebugFeed.svelte
webview/app/src/lib/components/debug/SystemHealth.svelte
```

El `DebugFeed.svelte` usa `websocketStore.on('system:event', callback)`. **Verificar que `websocketStore.on()` retorna una función de unsubscribe** — si no la retorna, `onDestroy()` no va a limpiar el listener y va a haber memory leak en navegación entre rutas.

---

## 5. El Harness del Mundo 1 — qué falta ahí

El Harness dentro de la extensión Chrome (el `index.html` en Brain templates) está en estado STUB. Lo que eso significa en la práctica:

- El servicio existe y responde (por eso `nucleus health` lo reporta healthy)
- El log `logs/nucleus/harness/harness.log` existe y está activo
- Pero el `DISCOVERY_PROTOCOL_MANIFEST` **no está definido todavía** en `discoveryProtocol.js`
- Sin ese manifest, el `ProtocolReader` del Harness no puede generar los botones de simulación

**Lo mínimo para que el Harness del Mundo 1 funcione en el milestone GitHub:**

1. Agregar `DISCOVERY_PROTOCOL_MANIFEST` al final de `extension/discovery/discoveryProtocol.js` con los 6 mensajes del milestone:
   - `onboarding_navigate`
   - `github_pat_detected`
   - `github_token_stored`
   - `account_registered`
   - `host_ready`
   - `discovery_complete`

2. Que `seed.go` confirme que copia el `harness/index.html` al directorio de Cortex durante `nucleus synapse seed`.

3. Abrir el tab del Harness dentro del perfil Chrome lanzado y verificar que el `ProtocolReader` detecta el manifest.

**El Harness del Mundo 1 no tiene visibilidad desde el Mundo 2** a menos que se implemente el puente: `background.js` hace `fetch('http://localhost:48215/internal/system-event', ...)` cuando recibe eventos `chrome.runtime`. Ese puente no está implementado todavía y no es bloqueante para arrancar con el panel standalone.

---

## 6. Dónde ver los mensajes del Harness hoy

Mientras no esté el puente background.js → API, los mensajes del Harness del Mundo 1 son visibles en:

| Dónde | Cómo |
|-------|------|
| Chrome DevTools del perfil | F12 → Console en el tab del Harness |
| Log de harness | `tail -f ~/Library/BloomNucleus/logs/nucleus/harness/harness.log` |
| Log de brain_service | `tail -f ~/Library/BloomNucleus/logs/brain/service/brain_service_20260607.log` |
| Log de nucleus_synapse | `tail -f ~/Library/BloomNucleus/logs/nucleus/nucleus_synapse_20260607.log` |

Una vez implementado el Paso 1 y el Paso 2, los eventos aparecen en el feed del `debug.html` en tiempo real.

---

## 7. Orden de implementación recomendado

```
HOY
  1. POST /internal/system-event en server.ts          → 30 min
  2. Agregar debug.html a Conductor + registrar en main → 15 min
  3. Verificar con curl que el feed recibe eventos      → 5 min

PRÓXIMA SESIÓN
  4. PublishSystemEvent en Go + llamadas en sentinel_activities.go
  5. Lanzar nucleus synapse launch y ver eventos reales en el feed
  6. DISCOVERY_PROTOCOL_MANIFEST en discoveryProtocol.js (Mundo 1)

DESPUÉS DEL MILESTONE
  7. Puente background.js → POST /internal/system-event
  8. Versión Svelte en /debug si se quiere en Workspace
  9. IonPump integration (IONPUMP_PROTOCOL_MANIFEST)
```

---

## 8. Pregunta abierta respondida

> **¿La página de harness va a estar en el servidor local en una ruta específica?**

Sí. La ruta en la API Fastify (`:48215`) que le corresponde es:

```
POST http://localhost:48215/internal/system-event
```

Esa es la única ruta nueva que necesita el servidor. El panel en sí no vive _en_ el servidor — vive como archivo HTML cargado por Electron (`debugWin.loadFile()`), igual que `onboarding.html`. El servidor solo provee el endpoint receptor de eventos y el WebSocket difusor.

Si en algún momento se quiere acceder al panel desde un browser sin Electron:

```
GET http://localhost:5173/debug   ← versión Svelte (Paso 4, opcional)
```

Pero eso requiere que el error de `TipsChat.svelte` esté resuelto y que se implementen los tres componentes Svelte.

---

_Generado: 2026-06-07 · Estado del sistema al momento: HEALTHY · harness: STUB · svelte_dev: RUNNING_
