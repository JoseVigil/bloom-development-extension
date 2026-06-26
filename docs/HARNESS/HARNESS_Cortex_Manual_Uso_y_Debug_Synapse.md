# Harness — Manual de Uso y Debug del Protocolo Synapse (Cortex)

**Sistema:** Bloom Cortex · extensión Chrome MV3
**Versión del manual:** Junio 2026 — revisión Jun 25 (auditado contra código fuente)
**Propósito:** Contexto completo para retomar la investigación del Harness en una nueva sesión.

---

## 1. Qué es el Harness y para qué existe

El Harness es una herramienta de observabilidad y simulación del protocolo Synapse. **Solo existe en builds dev** — no se despliega en producción.

Su URL es una página interna de la extensión Chrome:
```
chrome-extension://<ID>/harness/index.html
```

Tiene dos funciones:
- **Observar** los mensajes `chrome.runtime` que fluyen entre la extensión, background.js y el host.
- **Simular** eventos del protocolo para avanzar o testear pasos del flujo sin depender del sistema real.

El Harness **no modifica** el estado del sistema. Despacha mensajes como si los hubiera enviado otro componente. background.js los recibe y los procesa exactamente igual.

---

## 2. Cómo se genera el Harness

```
sentinel seed <alias> <is_master> --dev
```

El flag `--dev` pasa `--dev` a Brain, que llama a `harness_generator.py`. Este copia los assets estáticos al directorio de extensión del perfil.

El archivo de configuración `harness.synapse.config.js` **no se genera en seed** — se genera en cada launch por `ignition_identity.go::writeHarnessConfig()`. Detecta dev mode chequeando si `harness/index.html` existe en el extensionDir.

---

## 3. Prerequisitos para que el Harness esté vivo

1. La extensión está cargada en modo developer en `chrome://extensions`
2. `bloom-host` está corriendo (log de background.js: `HANDSHAKE COMPLETADO`)
3. El perfil fue creado con `sentinel seed --dev`
4. Al menos un launch fue ejecutado (para que `harness.synapse.config.js` exista)

Para abrir Dev Tools del propio Harness:
```
chrome://extensions → Bloom Nucleus Bridge → Inspect views → harness/index.html
```

---

## 4. Layout — los 3 paneles

```
┌─────────────────────────────────────────────────────────────────┐
│  🌱 Bloom Harness  [DEV]         MasterWorker  ● Config loaded  │  ← Top bar
├────────────────┬──────────────────────────────┬─────────────────┤
│                │                              │  [Log] [Config] │
│  PROTOCOLS     │  SIMULATE                    │                 │
│  ▼ discovery   │  Seleccioná un mensaje       │  Log entries    │
│    8 mensajes  │  del panel izquierdo         │  en tiempo real │
│                │  para ver el form            │                 │
│  ▼ landing     │  y despacharlo               │  Filter logs…   │
│    6 mensajes  │                              │                 │
│  (post-onb.)   │                              │  Config raw     │
│                │                              │  (profileId,    │
│  ▼ ionpump     │                              │   launchId)     │
│    10 mensajes │                              │                 │
└────────────────┴──────────────────────────────┴─────────────────┘
```

> **Nota:** la sección `landing` solo aparece post-onboarding, cuando `landing/landingProtocol.js` existe en el extensionDir.

---

## 5. Panel izquierdo — Protocol reader

*(actualizado Jun 26 2026)* — ProtocolReader carga los protocolos desde JSON schemas via `fetch()`. El método principal es `discoverFromJSON()`, que construye la URL de cada schema con `chrome.runtime.getURL()` y los parsea como JSON:

- `protocols/discovery.schema.json`  → DISCOVERY_PROTOCOL_MANIFEST  
- `protocols/landing.schema.json`    → LANDING_PROTOCOL_MANIFEST  
- `protocols/ionpump.schema.json`    → IONPUMP_PROTOCOL_MANIFEST  

Los schemas están declarados en `web_accessible_resources` en `manifest.json`.

*(sistema anterior — transitorio)* — Durante la migración, `ProtocolReader.discover()` sigue activo como fallback y lee los globals `self.DISCOVERY_PROTOCOL_MANIFEST`, `self.LANDING_PROTOCOL_MANIFEST` e `self.IONPUMP_PROTOCOL_MANIFEST` desde los archivos legacy `*Protocol.js`. Estos archivos están marcados para eliminación al completarse la limpieza de la Fase 5. Ver ARCHITECTURE_HarnessProtocol.md §8.

**Tipos de mensaje:**
- `command` — un mensaje que el Harness inicia hacia background.js
- `event` — simulación de algo que normalmente haría otro componente

**Mensajes DISCOVERY disponibles (8):**

| ID | Tipo | Descripción |
|---|---|---|
| `onboarding_navigate` | command | Fuerza Discovery a un step específico |
| `github_pat_detected` | event | Simula que el clipboard monitor detectó un PAT |
| `github_token_stored` | event | Simula guardado de token en vault |
| `api_key_registered` | event | Simula registro de API key |
| `account_registered` | event | Simula registro de cuenta |
| `discovery_complete` | event | Cierra el flujo de onboarding |
| `handshake_confirmed` | event | Simula handshake exitoso con el host |
| `host_ready` | event | Simula que el host está listo |

**Steps válidos para `onboarding_navigate`** (enum actualizado Jun 25):
`github_auth`, `nucleus_create`, `vault_init`, `google_auth`, `ai_provider_setup`, `project_create`, `success`

**Mensajes LANDING disponibles (6):**

| ID | Tipo | Descripción |
|---|---|---|
| `profile_load` | command | Solicita recarga de datos del perfil |
| `health_check` | command | Dispara health check (scope: extension/host/full-stack) |
| `nucleus_sync` | command | Dispara sync de proyectos con nucleus |
| `intent_list` | command | Pide lista de intents activos |
| `session_status` | event | Simula cambio de estado de sesión |
| `stats_update` | event | Simula actualización de stats |

**Mensajes IONPUMP disponibles (10):**

| ID | Tipo | Descripción |
|---|---|---|
| `dom_click` | command | Click en un selector CSS en una tab |
| `dom_type` | command | Tipear un valor en un campo |
| `dom_wait` | command | Esperar a que aparezca un selector |
| `dom_focus` | command | Focus en un elemento |
| `dom_scroll` | command | Scroll a un elemento |
| `dom_extract` | command | Extraer texto o atributo de un elemento |
| `event_emit` | event | Disparar un evento nombrado en una tab |
| `ion_execute_flow` | command | Ejecutar un flow registrado para un ion site |
| `ion_reload` | command | Hot-reload de recipes para un site |
| `ion_inspect` | command | Ver estado del registro IonPump |

---

## 6. Panel central — Simulator

Cuando se hace click en un mensaje del panel izquierdo, el Simulator carga ese mensaje:

- **Campos `type: string`** — editables libremente con un valor default precargado
- **Campos `type: enum`** — dropdown con las opciones definidas en el manifest
- **Campos `type: auto`** — se resuelven automáticamente desde `HARNESS_CONFIG` (profileId) y `SYNAPSE_CONFIG` (launchId). No son editables.

El **preview JSON** se actualiza en tiempo real mostrando el payload exacto que se va a despachar.

El botón **Send** llama a `chrome.runtime.sendMessage(payload)` hacia background.js.

---

## 7. Panel derecho — Log y Config

### Tab Log

Stream en tiempo real. El número en la tab es la cantidad de entradas.

| Tipo | Qué significa |
|---|---|
| `[INFO]` | Ciclo de vida del Harness (boot, config loaded, harness ready) |
| `[SEND]` | Mensaje despachado desde Simulate, con payload completo |
| `[ACK]` | Respuesta de background.js al mensaje despachado |
| `[ERR]` | Error de dispatch o `chrome.runtime.lastError` |

**Interpretación del ACK:**
- `{"status": "ok"}` → background.js recibió y procesó
- `{"received": true}` → handler recibió, fire-and-forward (comportamiento normal en mayoría de handlers)
- `null` → fire-and-forget — puede ser comportamiento esperado
- `[ERR]` → el mensaje no llegó a background.js

**Replay automático al abrir:** gracias al mecanismo `HARNESS_HELLO`/`HARNESS_REPLAY`, cuando el Harness abre envía automáticamente `HARNESS_HELLO` a background.js y recibe todos los eventos acumulados en el buffer circular (últimas 100 entradas). Esto permite ver `HANDSHAKE_CONFIRMED`, `EXTENSION_LOADED` y otros eventos que ocurrieron antes de que la tab del Harness abriera.

### Tab Config

Muestra el estado de `HARNESS_CONFIG` y `SYNAPSE_CONFIG` cargados al boot.

Si `HARNESS_CONFIG` muestra `—` en todos los campos: `harness.synapse.config.js` no existe todavía (el launch nunca corrió).

---

## 8. Cómo funciona la observabilidad — doble feed

`background.js` emite cada evento importante hacia **dos destinos simultáneos**:

1. **POST** `http://localhost:48215/api/internal/system-event` → nucleus Control Plane → Workspace Harness (Electron)
2. **`chrome.runtime.sendMessage({event: 'HARNESS_LOG', ...})`** → Cortex Harness tab (este panel Log)

Ambos son fire-and-forget. El evento también se guarda en un buffer en memoria en background.js. El Harness lo recupera vía `HARNESS_HELLO`/`HARNESS_REPLAY` al abrir.

Esto significa que el feed del Cortex Harness y el feed del Workspace Harness muestran los mismos eventos — son dos vistas del mismo bus.

---

## 9. Instrucciones de debug paso a paso

### Verificar que el sistema está listo

1. `chrome://extensions` → verificar que Bloom Nucleus Bridge está activo
2. Verificar que `bloom-host` está corriendo (log de background.js: `HANDSHAKE COMPLETADO`)
3. Abrir el Harness: `chrome-extension://<ID>/harness/index.html`
4. Tab **Config**: verificar que `profileId` y `launchId` tienen valores reales

### Simular el flujo completo github_auth → Landing (primer milestone)

Este es el flujo objetivo del primer test. El objetivo es que la secuencia correctamente complete el registro de GitHub y dispare la apertura de Landing.

```
Paso 1: onboarding_navigate → step: "github_auth"
  → Discovery muestra la pantalla github-login
  ACK: {status:"ok"} desde background.js, redirige a discovery tab

Paso 2: github_pat_detected → token: "ghp_simulatedToken123456789"
  → background.js: sendToHost(GITHUB_PAT_DETECTED)
  → background.js: chrome.runtime.sendMessage(GITHUB_PAT_DETECTED) → discovery.js
  → Discovery: GithubAuthFlow._handleTokenDetected() → muestra 'github-confirm'
  ACK: {received:true}

Paso 3: account_registered  [saltea la pantalla de confirmación manual]
  → background.js handler:
     1. forwardToDebugPanel('synapse', 'ACCOUNT_REGISTERED')
     2. sendToHost(ACCOUNT_REGISTERED) → MilestoneReactor → Landing
     3. sendToHost(GITHUB_TOKEN_STORED) [emitido internamente, no por discovery.js]
  ACK: {received:true}

Paso 4: discovery_complete
  → background.js: sendToHost(DISCOVERY_COMPLETE)
  ACK: {received:true}
```

Después del Paso 3, Brain debería disparar el re-launch en modo landing → Landing page abre.

### Si el ACK es null

background.js recibió el mensaje pero el handler no retornó respuesta explícita. Verificar en Dev Tools de background.js si el handler ejecutó.

### Abrir Dev Tools de background.js

```
chrome://extensions → Bloom Nucleus Bridge → Inspect views: background page (service_worker)
```

### Simular solo el handshake (sin host real)

```
1. host_ready      → simula FASE 2 del handshake
   [background.js procesará como si el host lo hubiera enviado por NativeMessaging]
```

> **Advertencia:** simular `host_ready` desde el Harness cuando ya hay un host real conectado puede causar comportamiento inesperado. Usar solo cuando no hay host corriendo.

---

## 10. Arquitectura de archivos del Harness

```
extension/
├── harness.synapse.config.js        ← generado por Sentinel en cada launch
│                                       self.HARNESS_CONFIG = { profileId, launchId, profileAlias }
├── discovery.synapse.config.js      ← generado por Sentinel en cada launch
│                                       self.SYNAPSE_CONFIG = { profileId, launchId, ... }
└── harness/
    ├── index.html                   ← layout de 3 paneles, solo carga <script src="harness.js">
    └── harness.js                   ← ProtocolReader, Simulator, Logger, ConfigReader, boot

extension/discovery/
├── discoveryProtocol.js             ← self.DISCOVERY_PROTOCOL_MANIFEST (8 mensajes)
└── ionpump_protocol.js              ← self.IONPUMP_PROTOCOL_MANIFEST (10 comandos)

extension/landing/
└── landingProtocol.js               ← window.PROTOCOL + self.LANDING_PROTOCOL_MANIFEST (6 mensajes)
                                        [solo existe post-onboarding]

extension/
└── protocols/                        ← NUEVO (Fase 1–5)
    ├── discovery.schema.json         ← fuente de verdad del protocolo discovery
    ├── landing.schema.json           ← fuente de verdad del protocolo landing
    └── ionpump.schema.json           ← fuente de verdad del protocolo ionpump
```

**Secuencia de boot de harness.js (DOMContentLoaded):**
```
*(actualizado Jun 26 2026)*
DOMContentLoaded
  └─ loadScriptOptional (configs legacy — transitorio)
  └─ Harness.init()
       ├─ ConfigReader.read()              ← lee self.HARNESS_CONFIG (transitorio)
       ├─ ProtocolReader.discover()        ← lee self.*_MANIFEST (transitorio / fallback)
       ├─ ProtocolReader.discoverFromJSON() ← fetch JSON desde protocols/*.schema.json ← NUEVO ESTÁNDAR
       ├─ ProtocolReader.render()
       └─ chrome.runtime.sendMessage HARNESS_HELLO → replay de buffer

*(sistema anterior — transitorio, pendiente limpieza)*
Los seis loadScriptOptional() del boot anterior cargaban los configs legacy
y los archivos *Protocol.js. Siguen presentes durante la migración. Se eliminan
junto con los archivos físicos al completarse la Fase 5.
```

---

## 11. Dos contextos de ejecución — distinción crítica

| Archivo | Dónde corre | Tiene `chrome.runtime` |
|---|---|---|
| `discovery.js` | Extensión Chrome (`chrome-extension://...`) | ✅ Sí |
| `landing.js` | Extensión Chrome (`chrome-extension://...`) | ✅ Sí |
| `harness.js` | Extensión Chrome (`chrome-extension://...`) | ✅ Sí |
| `onboarding.js` (VSCode) | VSCode Webview (Electron) | ❌ No |

`onboarding.js` (VSCode) es el stepper de la UI del IDE. Se comunica con Brain vía `window.onboarding.*` (IPC preload). Habla con Discovery enviando `onboarding_navigate` que llega vía brain → bloom-host → background.js → `chrome.tabs.sendMessage` → `discovery.js`.

---

## 12. Estado de implementación (Jun 25 2026)

### Confirmado como completo (verificado contra código fuente Jun 25)

- `background.js` — handshake 3 fases, buffer, doble forwardToDebugPanel, apertura automática de tabs
- `background.js` — handlers: `ACCOUNT_REGISTERED`, `GITHUB_PAT_DETECTED`, `GITHUB_TOKEN_STORED`, `GITHUB_ACCOUNT_CREATED`, `DISCOVERY_COMPLETE`, IonPump commands, Landing commands
- `harness.js` — ProtocolReader (objeto literal con `discover()` legacy + `discoverFromJSON()` nuevo estándar), Simulator, Logger, ConfigReader, boot async
- `discoveryProtocol.js` — `DISCOVERY_PROTOCOL_MANIFEST` con 8 mensajes y enum actualizado
- `landingProtocol.js` — `LANDING_PROTOCOL_MANIFEST` con 6 mensajes y 7 observable_events
- `discovery.js` — `routeToStep()` completo (todos los cases implementados)
- `discovery.js` — `GithubAuthFlow` completo (clipboard, SHA-256 fingerprint, confirmación, ACCOUNT_REGISTERED)
- `landing.js` — `LandingFlow` completo con `mergeProfileState` y listener de updates
- `background.js` — `registerHandler(eventName, schema, handlerFn)` + `applySchemaDefaults()` *(Fase 1–5)*
- `background.js` — `loadProtocolSchemas()` — carga `protocols/*.schema.json` via fetch al boot *(Fase 1–5)*
- `extension/protocols/` — `discovery.schema.json`, `landing.schema.json`, `ionpump.schema.json` *(Fase 1–5)*

### Pendiente / No auditado

| Tarea | Archivo | Estado |
|---|---|---|
| Auditar | `nucleus/internal/supervisor/onboarding_harness.go` | No provisto — auditar en próxima sesión |
| Verificar | `harness/index.html` | No provisto — verificar que no tiene JS inline |
| Verificar | `ionpump_protocol.js` | No provisto en esta sesión (auditado Jun 19) |
| Decisión pendiente | Canal `"tabs"` en IonPump | ¿Roadmap o descartado? (§18 #7) |

---

## 13. Preguntas abiertas

1. **¿Qué contiene `nucleus/internal/supervisor/onboarding_harness.go`?**
   Existe en el workspace pero ningún documento lo menciona. Auditar en próxima sesión.

2. **¿El canal `"tabs"` de IonPump sigue siendo objetivo de roadmap?**
   Hoy `tab_id` es un parámetro `type: "string"` editado a mano. Si se implementa canal `"tabs"`, el Simulator necesita un picker de tab activa.

3. **¿El Workspace Harness (Electron) comparte el formato de `HARNESS_LOG` con el Cortex Harness?**
   `forwardToDebugPanel()` en background.js los envía simultáneamente. Si el shape del mensaje cambia, rompe a los dos consumidores.

4. **¿Cómo funciona el flow completo cuando Brain dispara el re-launch post `ACCOUNT_REGISTERED`?**
   Background.js forwardea al host → MilestoneReactor en Brain → ¿qué trigger abre landing.html? Pendiente de auditar el lado Brain.

---

## 14. Archivos de contexto a adjuntar en la próxima sesión

Para continuar desde donde terminamos:

| Archivo | Ubicación | Para qué sirve |
|---|---|---|
| Este documento | `/docs/HARNESS/` | Contexto completo de la sesión Jun 25 |
| `harness/index.html` | `templates/harness/index.html` | Verificar que no hay JS inline (CSP) |
| `ionpump_protocol.js` | `templates/harness/ionpump_protocol.js` | Confirmar 10 mensajes vs doc |
| `onboarding_harness.go` | `nucleus/internal/supervisor/onboarding_harness.go` | Wildcard no documentado — auditar |
| `ignition_identity.go` | `sentinel/...` | Verificar `writeHarnessConfig()` lines 408-444 |
| `background.js` del host (bloom-host) | No provisto aún | Para entender MilestoneReactor |

---

*Documento actualizado al cierre de la sesión Jun 25 2026.*
*Basado en lectura directa de: background.js, harness.js, discoveryProtocol.js, discovery.js, landingProtocol.js, landing.js*
