# BTIPS — BLOOM CORTEX REFERENCE v1.0
**Fuente de verdad técnica de la Chrome Extension Bloom Cortex**
*Platform Engineering · Abril 2026*

---

## Índice

1. [¿Qué es Cortex?](#1-qué-es-cortex)
2. [Posición en el ecosistema Bloom](#2-posición-en-el-ecosistema-bloom)
3. [Filosofía de diseño](#3-filosofía-de-diseño)
4. [Estructura de archivos](#4-estructura-de-archivos)
5. [Componentes internos](#5-componentes-internos)
   - 5.1 [background.js — Synapse Thin Client](#51-backgroundjs--synapse-thin-client)
   - 5.2 [content.js — Synapse Actuator](#52-contentjs--synapse-actuator)
6. [Protocolo Synapse — Handshake de 3 fases](#6-protocolo-synapse--handshake-de-3-fases)
7. [Páginas internas — Discovery y Landing](#7-páginas-internas--discovery-y-landing)
   - 7.1 [Discovery Page](#71-discovery-page)
   - 7.2 [Landing Page](#72-landing-page)
8. [Gestión de perfiles y configuración](#8-gestión-de-perfiles-y-configuración)
9. [Comandos DOM — Motor de actuación](#9-comandos-dom--motor-de-actuación)
10. [Slave Mode — Control de UI](#10-slave-mode--control-de-ui)
11. [Clipboard Monitor — Detección de API Keys](#11-clipboard-monitor--detección-de-api-keys)
12. [IonPump — Automatización web desde Cortex](#12-ionpump--automatización-web-desde-cortex)
13. [Harness — Debugging y desarrollo](#13-harness--debugging-y-desarrollo)
14. [Manifest de la extensión](#14-manifest-de-la-extensión)
15. [Generadores de assets estáticos](#15-generadores-de-assets-estáticos)
16. [Despliegue — Artefacto .blx](#16-despliegue--artefacto-blx)
17. [Logging y debugging](#17-logging-y-debugging)
18. [Extensión de capacidades — Guía para nuevos desarrollos](#18-extensión-de-capacidades--guía-para-nuevos-desarrollos)

---

## 1. ¿Qué es Cortex?

**Bloom Cortex** es el runtime de ejecución cognitiva dentro de Chromium. Se materializa como una Chrome Extension (Manifest V3) versionada, inmutable y reproducible. Es el componente del ecosistema Bloom que opera más cerca del usuario y de los AI Providers.

Cortex cumple tres roles fundamentales:

- **Puente de comunicación**: conecta el stack backend de Bloom (Brain → Host) con el navegador y las páginas web a través del protocolo Synapse.
- **Ejecutor de acciones DOM**: traduce comandos abstractos emitidos por Brain en acciones concretas sobre el DOM del navegador (clicks, typing, lectura de contenido, scroll).
- **Interfaz de usuario local**: sirve las páginas internas Discovery y Landing que permiten al usuario interactuar con el sistema durante el onboarding y la operación normal.

Cortex **no razona**, **no persiste estado organizacional** y **no toma decisiones**. Es deliberadamente stateless: toda la inteligencia reside en Brain y Nucleus. Cortex ejecuta órdenes y reporta resultados.

---

## 2. Posición en el ecosistema Bloom

En la arquitectura de capas del sistema Bloom, Cortex ocupa la capa 7 — la más externa:

```
Electron App (Node.js)          ← UI host
  └─ Nucleus CLI (Go)           ← Gobernanza
       └─ Temporal Worker (Go)  ← Orquestación
            └─ Sentinel (Go)    ← Lifecycle de perfiles
                 └─ Brain (Python) :5678  ← Motor de ejecución
                      └─ bloom-host.exe (C++)  ← Native Messaging bridge
                           └─ Cortex Extension (JavaScript)  ← ESTE COMPONENTE
                                └─ Discovery Page / Landing Page / AI Sites
```

Cortex se comunica exclusivamente con `bloom-host.exe` via Chrome Native Messaging (stdin/stdout). Nunca habla directamente con Brain, Sentinel ni Nucleus. El host es su único upstream.

```
Cortex ↔ bloom-host.exe ↔ Brain TCP :5678 ↔ Sentinel ↔ Nucleus
```

Cortex también interactúa con los AI Providers directamente a través del navegador:

```
Cortex content.js → claude.ai / chatgpt.com / grok.com / aistudio.google.com
```

---

## 3. Filosofía de diseño

**Stateless por diseño.** Cortex no mantiene estado organizacional. Su configuración de sesión la recibe inyectada por Brain/Sentinel en cada launch. Si el Service Worker se suspende, al reactivarse relee la configuración del filesystem de extensión.

**Músculo ciego.** `content.js` ejecuta comandos primitivos sin interpretar su significado. No sabe si está sirviendo a IonPump, a un intent de onboarding, o a un flujo de automatización. Recibe un comando y lo ejecuta.

**Canal seguro antes de operar.** Ningún mensaje de datos fluye antes de que el handshake de 3 fases esté confirmado. Esta restricción es explícita en `background.js` y se aplica en ambas direcciones.

**Zero network en runtime.** Toda la comunicación en runtime es localhost. No hay dependencias externas en el canal Cortex ↔ Host ↔ Brain.

**Despliegue inmutable.** Cortex se distribuye como artefacto `.blx` firmado. Metamorph gestiona su actualización; no hay auto-update desde Chrome Web Store.

---

## 4. Estructura de archivos

```
extension/
├── manifest.json                    ← Definición de la extensión (MV3)
├── background.js                    ← Service Worker — Synapse Thin Client
├── content.js                       ← Content Script — Synapse Actuator
│
├── discovery/
│   ├── index.html                   ← UI de la página de discovery/onboarding
│   ├── discovery.js                 ← DiscoveryFlow — state machine del onboarding
│   ├── discoveryProtocol.js         ← Protocolo UI de discovery + DISCOVERY_PROTOCOL_MANIFEST
│   ├── content-aistudio.js          ← Content script específico para aistudio.google.com
│   ├── onboarding.js                ← Flujos de onboarding (GitHub, Gemini, API keys)
│   ├── script.js                    ← Helpers de UI
│   └── styles.css                   ← Estilos de la página
│
├── landing/
│   ├── index.html                   ← UI del cockpit de sesión
│   ├── landing.js                   ← LandingFlow — ciclo de vida del cockpit
│   ├── landingProtocol.js           ← Protocolo UI de landing + LANDING_PROTOCOL_MANIFEST
│   ├── data-loader.js               ← Carga de datos del perfil
│   ├── script.js                    ← Helpers de UI
│   └── styles.css                   ← Estilos de la página
│
├── harness/
│   └── index.html                   ← Herramienta de debug (solo builds dev)
│
├── discovery.synapse.config.js      ← Config de sesión para modo discovery (generado por Sentinel)
├── landing.synapse.config.js        ← Config de sesión para modo landing (generado por Sentinel)
├── harness.synapse.config.js        ← Config de sesión para el Harness (generado por Sentinel, solo builds dev)
│
└── assets/
    ├── icon16.png
    ├── icon128.png
    └── 128x128.png
```

### Separación de responsabilidades por archivo

| Archivo | Responsabilidad |
|---------|----------------|
| `background.js` | Conexión Native Messaging, handshake, routing de mensajes, keepalive, clipboard monitor |
| `content.js` | Ejecución DOM, slave mode, ribbon visual |
| `discovery.js` | State machine del onboarding, polling de handshake, notificación de completion |
| `discoveryProtocol.js` | Renderizado de UI de discovery, fases, mensajes localizados, manifiesto del protocolo |
| `landing.js` | Ciclo de vida del cockpit, connection checks, command dispatcher |
| `landingProtocol.js` | Renderizado de dashboard, stats, accounts, actions, manifiesto del protocolo |
| `*.synapse.config.js` | Contexto de sesión inyectado por Sentinel — profileId, launchId, flags |

---

## 5. Componentes internos

### 5.1 background.js — Synapse Thin Client

El Service Worker es el corazón operativo de la extensión. Corre en background persistente (mantenido vivo por un alarm de keepalive cada 1 minuto) y es el único punto de contacto con `bloom-host.exe`.

#### Responsabilidades

- Cargar la configuración de sesión (`SYNAPSE_CONFIG`) al inicializarse
- Establecer la conexión Native Messaging con el host
- Ejecutar el handshake de 3 fases
- Enrutar mensajes entrantes del host hacia las páginas internas o tabs específicas
- Enrutar mensajes salientes de las páginas hacia el host
- Gestionar reconexión automática con backoff exponencial
- Enviar heartbeats periódicos al host para mantener el workflow de Temporal vivo
- Monitorear el clipboard en busca de API keys durante el onboarding

#### Estados internos

```javascript
connectionState  // 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED'
handshakeState   // 'NONE' | 'EXTENSION_READY' | 'HOST_READY' | 'CONFIRMED'
config           // Objeto SYNAPSE_CONFIG cargado desde *.synapse.config.js
isInitialized    // Guard contra inicialización duplicada
reconnectAttempts // Contador para backoff exponencial (max 10)
```

#### Secuencia de inicialización

```
initialize()
  ├─ loadConfig()            ← lee *.synapse.config.js via importScripts o fetch
  │    ├─ detectActiveMode() ← detecta si hay tab de discovery o landing abierta
  │    ├─ validateConfig()   ← verifica campos requeridos según el modo
  │    └─ enforceDiscoveryWindowSize() ← 600×800 si modo discovery
  ├─ setupKeepalive()        ← alarm cada 1 minuto
  └─ connectNative()         ← chrome.runtime.connectNative(config.bridge_name)
```

#### Detección de modo

`background.js` detecta automáticamente si opera en modo `discovery` o `landing` inspeccionando las tabs abiertas:

```javascript
// Si hay una tab con URL que incluye chrome.runtime.id + 'discovery' → modo discovery
// Si hay una tab con URL que incluye chrome.runtime.id + 'landing'   → modo landing
// Fallback: chrome.storage.local.get('synapseMode') || 'discovery'
```

Según el modo, carga el archivo de configuración correspondiente:
- `discovery.synapse.config.js` para modo discovery
- `landing.synapse.config.js` para modo landing

#### Carga de configuración — doble estrategia

```javascript
// Intento 1: importScripts (synchronous, preferido)
importScripts(configFile);
if (self.SYNAPSE_CONFIG) { config = { ...self.SYNAPSE_CONFIG, mode }; }

// Intento 2: fetch + regex matchers (fallback)
const resp = await fetch(chrome.runtime.getURL(configFile));
const text = await resp.text();
// Extrae campos via regex: profileId, launchId, bridge_name, etc.
```

El fallback por regex existe porque `importScripts` puede fallar en ciertos contextos de Service Worker. La normalización snake_case → camelCase también ocurre aquí (`profile_id` → `profileId`, `launch_id` → `launchId`).

#### Enrutamiento de mensajes del host

Cuando llega un mensaje desde `bloom-host.exe` (post-handshake), `background.js` lo clasifica y enruta:

| Tipo de mensaje | Acción |
|----------------|--------|
| `host_ready` / `event: host_ready` | Completa fase 2 del handshake, envía `handshake_confirm` |
| `API_KEY_REGISTERED` / `API_KEY_REGISTRATION_FAILED` | Maneja respuesta del vault, notificación al usuario |
| `ACCOUNT_REGISTERED` | Reenvía confirmación a discovery.js via `chrome.runtime.sendMessage` |
| `onboarding_navigate` | Envía a la tab de discovery via `chrome.tabs.sendMessage` |
| `NAVIGATE` + `payload.url` | Navega la tab activa |
| Mensaje con `target` | `forwardToContent(msg)` — dirige al content script del tab |
| Mensaje con `command` | `executeCommand(msg)` — ejecuta comando de gestión de tabs/window |
| Mensaje con `event` | Broadcast a todos los tabs via `chrome.tabs.query` |

#### Enrutamiento de mensajes internos (desde páginas/content scripts)

`chrome.runtime.onMessage` maneja mensajes de las páginas internas y de `content.js`:

| Acción / Evento | Origen | Comportamiento |
|----------------|--------|---------------|
| `executeBrainCommand` | Landing | Envía `BRAIN_COMMAND` al host |
| `ping` | Landing | Responde con estado de conexión |
| `checkHost` | Landing | Responde con `hostConnected` y estados |
| `check_handshake_status` | Discovery | Responde con estado del handshake |
| `window_layout_request` | Discovery Protocol | Aplica layout de ventana via `chrome.windows.update` |
| `DISCOVERY_COMPLETE` | Discovery | Reenvía al host |
| `ACCOUNT_REGISTERED` | Discovery | Reenvía al host con profile_id y launch_id |
| `HEARTBEAT_SUCCESS` | Discovery | Reenvía al host |
| `actuator_ready` | content.js | Notifica al host que el actuator está activo |
| `slave_mode_changed` | content.js | Notifica al host del estado del slave mode |
| `slave_mode_timeout` | content.js | Notifica al host del timeout de seguridad |
| `SET_MODE` | Interno | Cambia el modo activo y recarga configuración |

#### Keepalive y heartbeat

El Service Worker de Chrome puede ser suspendido. Para evitarlo y para mantener vivo el workflow de Temporal:

```javascript
// Alarm cada 1 minuto
chrome.alarms.create('keepalive', { periodInMinutes: 1 });

// En cada tick: si handshake CONFIRMED, envía HEARTBEAT al host
sendToHost({
  event: 'HEARTBEAT',
  profile_id: config.profileId,
  launch_id: config.launchId,
  timestamp: Date.now(),
  status: 'alive'
});
```

Sin este heartbeat, el `ProfileLifecycleWorkflow` de Temporal degrada el perfil a estado `DEGRADED` a los 2 minutos.

#### Reconexión automática

Si el native host se desconecta:

```javascript
const delay = BASE_DELAY * Math.pow(1.5, reconnectAttempts); // backoff 1.5x
// BASE_DELAY = 2000ms, MAX_RECONNECT = 10 intentos
```

#### sendToHost — guard de handshake

```javascript
function sendToHost(msg) {
  if (nativePort && connectionState === 'CONNECTED') {
    if (handshakeState !== 'CONFIRMED' && handshakeState !== 'HOST_READY') {
      // Mensaje bloqueado — canal no seguro todavía
      return;
    }
    nativePort.postMessage(msg);
  }
}
```

---

### 5.2 content.js — Synapse Actuator

Inyectado en **todas las páginas** (`"matches": ["<all_urls>"]`, `run_at: "document_start"`). Es el músculo ciego del sistema: recibe comandos primitivos de `background.js` y los ejecuta sobre el DOM sin interpretarlos.

#### Filosofía

> "Músculo ciego. Ejecuta comandos primitivos sin pensar."

El Actuator no sabe quién envió el comando ni por qué. No conoce IonPump, no conoce intents. Solo conoce el DOM y los comandos Synapse.

#### Indicador visual

Al inyectarse, agrega un ribbon verde en la parte superior de la página:

```javascript
// Ribbon: línea de 4px, gradiente #00ff88 → #00d4ff, z-index máximo
// Indica visualmente que Cortex está activo en esta página
```

#### Comandos DOM disponibles

Todos los comandos llegan via `chrome.runtime.onMessage` con estructura `{ command, payload }`.

**DOM_CLICK**
```javascript
// Hace click en un elemento del DOM
payload: { selector: string, options: { multiple?: bool, waitVisible?: bool } }
// Simula secuencia humana: mousedown → click → mouseup
```

**DOM_TYPE**
```javascript
// Escribe texto en un input/textarea
payload: { selector: string, text: string, options: { clear?: bool, triggerEvents?: bool } }
// Dispara eventos input y change para compatibilidad con React/Vue/Angular
```

**DOM_READ**
```javascript
// Extrae contenido del DOM
payload: { selector: string, options: { attribute?: string, multiple?: bool } }
// Para inputs: devuelve .value; para otros: devuelve .innerText
```

**DOM_UPLOAD**
```javascript
// Sube archivos a un input[type=file]
payload: { selector: string, files: [{ name, content, mime_type }] }
// Crea DataTransfer con los archivos y asigna al input
```

**DOM_SCROLL**
```javascript
// Scrollea la página
payload: { target: 'top' | 'bottom' | number | selector, options: { behavior?: string } }
```

**DOM_WAIT**
```javascript
// Espera hasta que aparezca un elemento (async)
payload: { selector: string, options: { timeout?: number, checkInterval?: number } }
// Default: timeout 10000ms, checkInterval 500ms
```

**DOM_SNAPSHOT**
```javascript
// Captura estado completo de un elemento
payload: { options: { selector?: string, includeStyles?: bool } }
// Retorna: { url, title, html, text, timestamp, computed_styles? }
```

**LOCK_UI**
```javascript
// Activa el Slave Mode — bloquea interacción del usuario
payload: { message?: string }
```

**UNLOCK_UI**
```javascript
// Desactiva el Slave Mode
```

#### Respuesta de comandos

Todos los comandos responden con:
```javascript
{ success: true, result: {...} }   // éxito
{ success: false, error: string }  // error
```

---

## 6. Protocolo Synapse — Handshake de 3 fases

El handshake establece un canal seguro entre la extensión y `bloom-host.exe` antes de que fluya cualquier dato operativo.

```
FASE 1 — Extension → Host
  background.js envía:
  {
    command: "extension_ready",
    profile_id: config.profileId,
    launch_id: config.launchId,
    extension_id: chrome.runtime.id,
    profile_alias: config.profile_alias,
    timestamp: Date.now()
  }
  handshakeState → 'EXTENSION_READY'

FASE 2 — Host → Extension
  bloom-host.exe responde:
  { command: "host_ready" }   (o event: "host_ready")
  Opcionalmente puede incluir: { window: { width, height, left, top, state } }
  handshakeState → 'HOST_READY'

FASE 3 — Extension → Host
  background.js envía:
  {
    command: "handshake_confirm",
    profile_id: config.profileId,
    launch_id: config.launchId,
    extension_id: chrome.runtime.id,
    timestamp: Date.now()
  }
  handshakeState → 'CONFIRMED'
  ✓ Canal seguro establecido
```

Una vez confirmado el handshake:
- `background.js` emite `chrome.runtime.sendMessage({ event: 'HANDSHAKE_CONFIRMED' })` para notificar a las páginas internas.
- `discovery.js` puede detectar este evento via `chrome.storage.onChanged` o via polling.
- Si el payload de `host_ready` incluye `window`, se aplica inmediatamente el layout de ventana.

**Correlación de identidad:** El `profile_id` y `launch_id` deben estar presentes en los mensajes de handshake. Si están ausentes, `bloom-host.exe` no puede inicializar su logger y el handshake falla silenciosamente. El `background.js` valida esto explícitamente antes de intentar la conexión.

---

## 7. Páginas internas — Discovery y Landing

Las páginas internas son archivos HTML/CSS/JS dentro de la extensión, accesibles en `chrome-extension://{extension_id}/discovery/index.html` y `chrome-extension://{extension_id}/landing/index.html`. Son generadas como assets estáticos por los generadores Python y configuradas por Sentinel en cada launch.

Ambas páginas siguen el mismo patrón arquitectónico:
- Un archivo `*Protocol.js` que define la lógica de UI, fases y rendering.
- Un archivo `*.js` que implementa el flujo de datos y la interacción con `background.js`.
- El objeto `PROTOCOL` se expone en `window.PROTOCOL` para uso del script principal.

---

### 7.1 Discovery Page

**Propósito:** Página de validación de handshake y onboarding de nuevos perfiles. Se abre automáticamente cuando Brain lanza un perfil en modo `discovery`. Es transitoria — se cierra sola al completarse.

#### State machine

```
DOMContentLoaded
  └─ DiscoveryFlow.start()
       ├─ loadSynapseConfig()     ← chrome.storage → SYNAPSE_CONFIG fallback
       ├─ protocol.init()         ← cachea referencias DOM
       ├─ Stage 0: Initializing   ← completa inmediatamente
       ├─ setupStorageListener()  ← escucha chrome.storage.onChanged para 'system_ready'
       └─ startPinging()          ← cada 1 segundo: sendMessage('check_handshake_status')

  On handshake confirmed (ping o storage change):
  handleSystemReady(payload)
       ├─ Stage 2: Handshake  (visual)
       ├─ Stage 3: Heartbeat  (visual)
       ├─ Stage 4: Ready      (visual)
       │
       ├─ [heartbeat=true]   → sendHeartbeatSuccess() → window.close() tras 2s
       ├─ [register=true]    → transitionToOnboarding() → muestra pantallas de registro
       └─ [register=false]   → notifyHost(DISCOVERY_COMPLETE) → countdown 7s → close()
```

#### Flags de comportamiento (desde SYNAPSE_CONFIG)

| Flag | Valor | Comportamiento |
|------|-------|----------------|
| `heartbeat` | `true` | Solo valida que el canal funciona. Envía `HEARTBEAT_SUCCESS` y cierra. |
| `register` | `false` | Flujo normal. Notifica `DISCOVERY_COMPLETE` y cierra con countdown. |
| `register` | `true` | Activa el flujo de onboarding completo. La página no cierra sola. |

#### Flujo de onboarding (register=true)

Cuando un perfil nuevo necesita registrar cuentas y API keys, Discovery muestra pantallas secuenciales. El step activo lo define `SYNAPSE_CONFIG.step`. Los servicios disponibles los define `SYNAPSE_CONFIG.service`.

Los steps típicos son:
- `welcome` — pantalla inicial
- `github_auth` — autenticación GitHub
- `github_confirm` — confirmación de token GitHub
- `api_key_waiting` — espera que el usuario copie una API key al clipboard
- `gemini_api_waiting` — específico para Gemini
- `complete` — onboarding finalizado

Durante el paso de API keys, `background.js` activa el **Clipboard Monitor** (ver sección 11).

Al completar cada step, `discovery.js` emite:
```javascript
chrome.runtime.sendMessage({
  event: 'ACCOUNT_REGISTERED',
  profile_id: string,
  launch_id: string,
  service: 'google' | 'gemini' | 'github',
  email: string,
  timestamp: number
})
```

Al finalizar todo el onboarding:
```javascript
chrome.runtime.sendMessage({
  event: 'onboarding_complete',
  payload: { email, api_key_validated: true }
})
```

#### Navegación remota de onboarding

Brain puede navegar el onboarding remotamente sin intervención del usuario:

```
Brain TCP → bloom-host → Native Messaging → background.js
background.js detecta msg.command === 'onboarding_navigate'
→ chrome.tabs.sendMessage(discoveryTabId, { command: 'onboarding_navigate', payload: { step } })
→ discovery.js muestra el step indicado
```

**Nota importante:** `background.js` busca la tab de Discovery con `chrome.runtime.getURL('discovery/index.html')` (no `discovery.html`). Esta distinción es crítica — un path incorrecto silencia el navigate.

#### DISCOVERY_COMPLETE payload

Cuando el flujo termina sin onboarding:
```javascript
{
  event: "DISCOVERY_COMPLETE",
  payload: {
    profile_id: string,
    profile_alias: string,
    launch_id: string,
    ping_response: object   // último payload de check_handshake_status
  }
}
```

#### Control de ventana

Discovery opera en ventana de **600×800px**. El control ocurre en dos momentos:

1. `enforceDiscoveryWindowSize()` en `loadConfig()` — aplica solo dimensiones (service worker no tiene acceso a `screen`).
2. `discoveryProtocol.requestWindowLayout()` — se ejecuta desde page context donde `screen` está disponible, envía `window_layout_request` a `background.js` con coordenadas resueltas incluyendo centrado.

El host también puede controlar la ventana: si `host_ready` incluye un objeto `window`, `background.js` lo aplica inmediatamente via `applyWindowLayout()`.

---

### 7.2 Landing Page

**Propósito:** Cockpit persistente del perfil activo. A diferencia de Discovery, Landing no se cierra — es el panel de control de la sesión en curso. Muestra stats, cuentas vinculadas, estado de conexiones y permite ejecutar comandos a Brain.

#### State machine

```
DOMContentLoaded
  └─ LandingFlow.start()
       ├─ loadProfileData()          ← storage → BLOOM_PROFILE_DATA → SYNAPSE_CONFIG
       ├─ protocol.init()            ← cachea referencias DOM
       ├─ protocol.executePhase('initialization')
       ├─ startConnectionChecks()    ← cada 5 segundos
       └─ transitionToReady()        → protocol.executePhase('ready', { profile })
            └─ renderDashboard(profile)
                 ├─ renderStats()
                 ├─ renderAccounts()
                 ├─ renderActions()  ← botones con data-command attributes
                 └─ renderSystemInfo()

  Ongoing (cada 5s):
  checkConnections()
       ├─ sendMessage({ action: 'ping' })      → actualiza dot de extensión
       └─ sendMessage({ action: 'checkHost' }) → actualiza dot de host
```

#### Carga de datos del perfil — prioridad

```
1. window.BLOOM_PROFILE_DATA (inyectado por Brain)
2. chrome.storage.local['profileData']
3. Construido desde SYNAPSE_CONFIG (fallback)
```

#### Estructura del objeto de perfil

```javascript
{
  alias: string,
  role: string,
  stats: {
    totalLaunches: number,
    uptime: number,        // segundos
    intentsCompleted: number,
    lastSync: string       // ISO timestamp
  },
  accounts: [
    { provider: string, email: string, status: string }
  ],
  system: {
    id: string,            // UUID del perfil
    created: string,
    lastLaunch: string
  }
}
```

#### Acciones rápidas

Las acciones del dashboard dispatche comandos a Brain via:
```javascript
window.executeCommand(command)
  → chrome.runtime.sendMessage(extensionId, { action: 'executeBrainCommand', command })
  → background.js → sendToHost({ type: 'BRAIN_COMMAND', command, source: 'landing_cockpit' })
  → bloom-host → Brain TCP
```

Acciones predefinidas:
- `nucleus sync` — sincronizar proyectos
- `intent list` — listar intents activos
- `health full-stack` — health check del sistema
- `profile list` — ver todos los perfiles

#### Flags de SYNAPSE_CONFIG leídos por Landing

Landing lee los flags del nodo `launch_flags` (o raíz como fallback legacy):

```javascript
requiresRegistration  ← flags.register === true
heartbeatMode         ← flags.heartbeat === true
serviceTarget         ← flags.service
stepCurrent           ← flags.step
profileAlias          ← flags.alias
profileRole           ← flags.role
userEmail             ← flags.email
extensionOverride     ← flags.extension
launchMode            ← flags.mode
linkedAccounts        ← flags.linked_accounts
```

---

## 8. Gestión de perfiles y configuración

### SYNAPSE_CONFIG — el objeto de sesión

`SYNAPSE_CONFIG` es el objeto que Brain/Sentinel inyectan en la extensión antes del launch. Es la fuente de verdad de la sesión actual. Se expone en `self.SYNAPSE_CONFIG` (disponible en Service Worker y páginas de extensión).

#### Campos del SYNAPSE_CONFIG

| Campo | Tipo | Modo | Descripción |
|-------|------|------|-------------|
| `profileId` | string | Ambos | UUID del perfil activo |
| `launchId` | string | Ambos | ID único del launch actual (para correlación) |
| `bridge_name` | string | Ambos | Nombre del Native Messaging host (`com.bloom.host`) |
| `extension_id` | string | Ambos | ID de la extensión — usado por páginas para sendMessage |
| `profile_alias` | string | Ambos | Nombre legible del perfil |
| `mode` | string | Ambos | `discovery` o `landing` |
| `register` | boolean | Discovery | `true` → activar flujo de onboarding |
| `heartbeat` | boolean | Discovery | `true` → solo validar canal y cerrar |
| `service` | string | Discovery | Provider objetivo para login (ej: `"google"`) |
| `email` | string | Discovery | Email pre-filled para onboarding |
| `step` | number | Discovery | Step activo del onboarding |
| `total_launches` | number | Landing | Estadísticas del perfil |
| `uptime` | number | Landing | Uptime en segundos |
| `intents_done` | number | Landing | Intents completados |
| `last_synch` | string | Landing | Timestamp del último sync |
| `launch_flags` | object | Ambos | Nodo canónico de flags (contiene los campos anteriores) |

#### Archivos de configuración

Los archivos `*.synapse.config.js` son generados por Sentinel (Go) en `ignition_identity.go::prepareSessionFiles()` durante el launch sequence. Son archivos JavaScript que asignan el objeto a `self.SYNAPSE_CONFIG`:

```javascript
// discovery.synapse.config.js (generado por Sentinel)
self.SYNAPSE_CONFIG = {
  "profileId": "uuid-del-perfil",
  "launchId": "launch-uuid-123",
  "bridge_name": "com.bloom.host",
  "extension_id": "abc123extid",
  "profile_alias": "worker-01",
  "register": false,
  "heartbeat": false,
  "mode": "discovery",
  "launch_flags": { ... }
};
```

Los generadores Python (`discovery_generator.py`, `landing_generator.py`) **no generan estos archivos** — solo copian los assets estáticos HTML/CSS/JS. Esta separación es intencional y fue introducida en v3.0 para establecer a Sentinel como única fuente de verdad de la identidad de sesión.

#### Perfil de extensión en Chrome

Cada perfil Bloom tiene su propio directorio de perfil de Chrome. Cortex se despliega como parte de ese perfil. La configuración de sesión se escribe en el directorio de extensión antes del launch de Chrome. Cuando Chrome abre, la extensión ya tiene su `*.synapse.config.js` esperándola.

---

## 9. Comandos DOM — Motor de actuación

El motor de actuación de Cortex implementa una API DOM completa que permite a Brain controlar cualquier página web. Todos los comandos se envían desde `background.js` a `content.js` via `chrome.tabs.sendMessage(tabId, { command, payload })`.

### Tabla de comandos

| Comando | Acción | Retorna |
|---------|--------|---------|
| `DOM_CLICK` | Click sobre selector | `{ clicked: N, selector }` |
| `DOM_TYPE` | Tipea texto en input | `{ typed: N, selector }` |
| `DOM_READ` | Lee contenido/valor | `string` o `string[]` |
| `DOM_UPLOAD` | Sube archivos a file input | `{ uploaded: N }` |
| `DOM_SCROLL` | Scrollea página o elemento | `{ scrolled_to: target }` |
| `DOM_WAIT` | Espera aparición de elemento | `{ found: true, selector }` |
| `DOM_SNAPSHOT` | Captura estado de la página | `{ url, title, html, text, timestamp }` |
| `LOCK_UI` | Activa slave mode | `{ locked: true }` |
| `UNLOCK_UI` | Desactiva slave mode | `{ unlocked: true }` |

### Flujo de un comando DOM desde Brain hasta el navegador

```
Brain Python
  └─ SynapseServer.send_command(profile_id, tab_id, command, payload)
       └─ TCP :5678 → bloom-host.exe
            └─ Native Messaging stdin/stdout
                 └─ background.js handleHostMessage()
                      └─ forwardToContent(msg) → chrome.tabs.sendMessage(tab_id, msg)
                           └─ content.js onMessage listener
                                └─ executeXxx(payload)
                                     └─ DOM operation
                                          └─ sendResponse({ success, result })
                                               └─ background.js respondToHost(id, payload)
                                                    └─ Native Messaging
                                                         └─ bloom-host.exe
                                                              └─ TCP :5678 → Brain
```

### Targets de tab

El campo `target` en el mensaje del host controla a qué tab va el comando:

```javascript
target: 'active'   // Tab activa de la ventana actual
target: number     // tabId específico
```

---

## 10. Slave Mode — Control de UI

El Slave Mode bloquea la interacción del usuario con el navegador mientras Brain ejecuta automatizaciones. Previene que el usuario interfiera con operaciones en progreso.

### Activación

```javascript
// Brain envía a content.js:
{ command: "LOCK_UI", payload: { message: "🤖 BLOOM AI OPERATING" } }
```

Al activarse:
- `document.body.style.pointerEvents = 'none'` — bloquea mouse
- `document.body.style.userSelect = 'none'` — bloquea selección de texto
- Se inyecta un overlay semitransparente con blur y mensaje visual animado
- Se inicia un **timer de seguridad de 30 segundos**

### Timer de seguridad

El Slave Mode tiene un mecanismo de auto-liberación:

```javascript
const SLAVE_MODE_TIMEOUT_MS = 30000; // 30 segundos
```

Si no llega ningún comando durante 30 segundos, el Slave Mode se libera automáticamente y notifica a `background.js` via `slave_mode_timeout`. Cada comando recibido mientras Slave Mode está activo **resetea el timer**.

La secuencia de notificación al host:
```javascript
chrome.runtime.sendMessage({ event: "slave_mode_timeout", time_since_last_command, timestamp })
→ background.js → sendToHost({ event: "SLAVE_MODE_TIMEOUT", tab_id, timestamp })
→ bloom-host → Brain
```

### Desactivación

```javascript
{ command: "UNLOCK_UI" }
// Restaura pointerEvents y userSelect
// Remueve el overlay
// Limpia el timer de seguridad
// Notifica via slave_mode_changed(enabled: false)
```

---

## 11. Clipboard Monitor — Detección de API Keys

Durante el onboarding, `background.js` monitorea el clipboard para detectar automáticamente API keys de los proveedores soportados.

### Proveedores soportados

| Provider | Patrón regex | Consola |
|----------|-------------|---------|
| Gemini | `^AIzaSy[A-Za-z0-9_-]{33}$` | aistudio.google.com/app/apikey |
| Claude | `^sk-ant-api\d{2}-[A-Za-z0-9_-]{95,}$` | console.anthropic.com/settings/keys |
| OpenAI | `^sk-[A-Za-z0-9]{48}$` | platform.openai.com/api-keys |
| xAI/Grok | `^xai-[A-Za-z0-9_-]{32,}$` | console.x.ai/keys |

### Ciclo de detección

```
startClipboardMonitoring()
  └─ setInterval(1000ms)
       └─ navigator.clipboard.readText()
            └─ detectAPIKeyProvider(text)
                 ├─ Si detectado y no duplicado:
                 │    ├─ sendToHost({ event: 'API_KEY_DETECTED', provider, key })
                 │    └─ chrome.notifications.create() ← aviso al usuario
                 └─ Si error de permiso: stopClipboardMonitoring()
```

El monitoreo se activa/desactiva escuchando cambios en `chrome.storage.local['onboarding_state']`:
- `currentStep.includes('api_waiting')` → `startClipboardMonitoring()`
- `completed === true` → `stopClipboardMonitoring()`

### Respuesta del host

Cuando Brain registra la key en el vault, responde con:
```javascript
{ event: 'API_KEY_REGISTERED', provider, profile_name, status: 'success' }
// o
{ event: 'API_KEY_REGISTRATION_FAILED', provider, error }
```

`background.js` muestra notificación al usuario y reenvía el evento a la Discovery Page.

---

## 12. IonPump — Automatización web desde Cortex

**Estado actual: en desarrollo activo (rama separada).**

IonPump es el runtime de automatización web de Brain. Desde la perspectiva de Cortex, IonPump es un **consumidor del Actuator** — traduce recipes `.ion` en comandos Synapse que llegan a `content.js`. Cortex no sabe que existe IonPump; solo ve los mismos comandos DOM que usa cualquier otro sistema.

### Posición de IonPump en la cadena

```
Brain: IntentExecutor
  └─ Detecta intent_subtype == "web_automation"
       └─ IonPumpManager.execute_flow(site, flow, context)
            └─ IonPumpExecutor: traduce .ion steps → comandos Synapse
                 └─ SynapseServer.send_command(profile_id, tab_id, command, payload)
                      └─ [Cortex standard path — sin cambios]
                           └─ background.js → forwardToContent → content.js DOM
```

### Contrato con Cortex

IonPump no modifica Cortex. Usa la API existente de comandos DOM. El mapping de steps `.ion` a comandos Cortex es:

| Step .ion | Comando Cortex |
|-----------|---------------|
| `wait` | `DOM_WAIT` |
| `click` | `DOM_CLICK` |
| `type` | `DOM_TYPE` |
| `focus` | `DOM_FOCUS` (extensión de DOM_CLICK) |
| `scroll` | `DOM_SCROLL` |
| `extract` | `DOM_READ` |
| `emit` | `EVENT_EMIT` (broadcast via runtime) |

### Eventos que IonPump genera hacia Cortex (via chrome.runtime)

```javascript
// content.js → background.js (cuando IonPump completa un step)
{ event: "SITE_READY",    site: string, tab_id: number }
{ event: "RESPONSE_READY", site: string, tab_id: number }
{ event: "CODE_EXTRACTED", code: string }
```

### Diferencia de canal — aspecto crítico para desarrollo

IonPump usa `chrome.tabs.sendMessage(tabId, ...)` para enviar comandos al content script. Esto es diferente de `chrome.runtime.sendMessage` que usan Discovery y Landing.

**Implicación:** El Harness (herramienta de debug) puede interceptar mensajes `runtime` directamente, pero necesita conocer el `tabId` para interceptar mensajes `tabs`. Ver sección 13 para el mecanismo de Tab-Aware Proxy del Harness.

### Agregar soporte para un nuevo sitio

Para agregar `perplexity.ai` u otro sitio:

1. **Brain:** Crear recipe `ionsites/perplexity.ai/message.ion`. IonPump lo detecta por hot-reload del filesystem.
2. **Cortex:** Si el dominio no está en `content_scripts.matches` del manifest, agregar `"*://perplexity.ai/*"`. Esto requiere re-empaquetar y desplegar el `.blx`.
3. **Harness:** En `IONPUMP_PROTOCOL_MANIFEST`, agregar el dominio al campo `options` del parámetro `site`. El Harness lo refleja automáticamente.

---

## 13. Harness — Debugging y desarrollo

El Harness es la herramienta de desarrollo de Cortex. **Solo existe en builds de desarrollo** — en producción, `brain/core/profile/web/harness_generator.py` no se ejecuta y la URL `chrome-extension://{id}/harness/index.html` devuelve 404.

### Arquitectura del Harness

El Harness vive en `brain/core/profile/web/templates/harness/index.html` y Brain lo copia durante el seed del perfil. No está en el artefacto `.blx`. Esta separación permite:

- Actualizar el Harness con un re-seed sin reempaquetar Cortex.
- Garantizar que no existe en producción sin flags ni builds separados.
- Inyectar datos del perfil en el HTML durante el seed.

### Protocol Reader — autodescubrimiento de protocolos

El principio central del Harness es que **no tiene protocolo propio**. Lee los manifests de protocolo que los propios archivos de Cortex exponen y genera su UI dinámicamente desde ellos.

Cada protocolo expone un objeto `*_PROTOCOL_MANIFEST` en el contexto global:

```javascript
// discoveryProtocol.js expone:
self.DISCOVERY_PROTOCOL_MANIFEST = {
  version: "1.0.0",
  protocol: "discovery",
  messages: [
    {
      id: "onboarding_navigate",
      type: "command",
      direction: "harness_to_background",
      description: "Navigate Discovery to a specific onboarding step",
      payload_template: { command: "onboarding_navigate", payload: { step: "$STEP" } },
      parameters: [
        { name: "step", type: "enum", variable: "$STEP",
          options: ["welcome", "github_auth", "api_key", "complete"] }
      ]
    },
    // ...
  ],
  observable_events: ["HANDSHAKE_CONFIRMED", "API_KEY_REGISTERED", "DISCOVERY_COMPLETE"]
};

// landingProtocol.js expone:
self.LANDING_PROTOCOL_MANIFEST = { ... };

// content.js (o ionsites-protocol.js) expone:
self.IONPUMP_PROTOCOL_MANIFEST = { ... };
```

El `ProtocolReader` del Harness carga todos los manifests disponibles al inicializarse. El mecanismo es un **escaneo de `self.*`**: itera sobre el contexto global buscando cualquier objeto que tenga la forma `{ version, protocol, messages: [] }`. No existe un array hardcodeado de nombres de protocolo en `harness/index.html`.

```javascript
class ProtocolReader {
  async loadAll() {
    // Escanea self.* en busca de objetos con la forma de un manifest
    for (const key of Object.keys(self)) {
      const val = self[key];
      if (
        val && typeof val === 'object' &&
        val.version && val.protocol && Array.isArray(val.messages)
      ) {
        this.protocols[val.protocol] = val;
      }
    }
  }
}
```

Esta arquitectura garantiza que **agregar un nuevo protocolo no requiere modificar `harness/index.html`**. El Harness detecta automáticamente cualquier `*_PROTOCOL_MANIFEST` que esté presente en el contexto global — siempre que el archivo que lo define sea accesible desde el Service Worker del Harness y esté incluido en `web_accessible_resources` del `manifest.json`.

### Panel Simulate — UI generada dinámicamente

El Panel Simulate del Harness genera sus controles desde los manifests, sin hardcoding:

```
Para cada message en el manifest:
  ├─ Card con descripción del mensaje
  ├─ Campos editables para parámetros type: "string" | "enum"
  │    (los parámetros type: "auto" se resuelven automáticamente desde config)
  ├─ Preview del payload resuelto
  └─ Botón Dispatch
```

**Tipos de parámetros:**
- `type: "string"` → campo de texto editable
- `type: "enum"` → dropdown con las opciones definidas
- `type: "auto"` → se resuelve desde `source` (ej: `"HARNESS_CONFIG.profileId"`, `"SYNAPSE_CONFIG.launchId"`) sin intervención del developer

### Canales de dispatch — runtime vs tabs

El Harness diferencia el canal de dispatch por el campo `channel` del mensaje:

```javascript
channel: "runtime"  → chrome.runtime.sendMessage(payload)
channel: "tabs"     → chrome.tabs.sendMessage(selectedTabId, payload)
```

Para mensajes de tipo `tabs`, el Panel Config del Harness muestra un selector de tab activo donde el developer elige a qué tab (claude.ai, chatgpt.com, etc.) dirigir el comando.

### Tab-Aware Proxy — debugging de IonPump

Para debuggear flujos de IonPump sin Brain corriendo:

**Dirección A — simular comandos DOM desde Brain:**
```javascript
// El Harness descubre tabs de ION sites
const ionTabs = await chrome.tabs.query({})
  .filter(tab => ['claude.ai','chatgpt.com','grok.com'].some(d => tab.url.includes(d)));

// Muestra selector de tab en el Panel Config
// Dispatch via: chrome.tabs.sendMessage(selectedTabId, { command: 'DOM_TYPE', payload: {...} })
```

**Dirección B — simular respuestas del content script:**
```javascript
// Dispatch via runtime (no necesita tabId)
chrome.runtime.sendMessage({ event: 'RESPONSE_READY', site: 'claude.ai', tab_id: X })
```

### Ciclo de actualización del Harness

```bash
# Actualizar Harness (no requiere reempaquetar Cortex):
sentinel seed --profile-id {id} --reseed

# Esto sobreescribe harness/index.html y harness.synapse.config.js
# El .blx de Cortex no se toca
```

### Agregar un nuevo mensaje al protocolo

1. Developer actualiza el handler real en `discoveryProtocol.js` o `landingProtocol.js`.
2. Developer agrega la entrada al `*_PROTOCOL_MANIFEST` correspondiente.
3. El Harness refleja el cambio automáticamente en el próximo re-seed.

No hay paso 3 en el Harness. Esta es la garantía de que el Harness siempre está en sincronía con el protocolo real.

---

## 14. Manifest de la extensión

```json
{
  "manifest_version": 3,
  "name": "Bloom Nucleus Bridge",
  "version": "2.0.0",

  "permissions": [
    "tabs", "scripting", "activeTab", "nativeMessaging",
    "storage", "alarms", "identity", "identity.email",
    "cookies", "webNavigation", "clipboardRead", "notifications"
  ],

  "host_permissions": [
    "<all_urls>",
    "*://*.google.com/*",
    "*://aistudio.google.com/*",
    "https://console.anthropic.com/*",
    "https://platform.openai.com/*",
    "https://console.x.ai/*"
  ],

  "background": {
    "service_worker": "background.js",
    "type": "module"
  },

  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "run_at": "document_start",
      "all_frames": true
    },
    {
      "matches": [
        "*://aistudio.google.com/app/apikey*",
        "https://console.anthropic.com/*",
        "https://platform.openai.com/*",
        "https://console.x.ai/*"
      ],
      "js": ["discovery/content-aistudio.js"],
      "run_at": "document_idle"
    }
  ],

  "web_accessible_resources": [
    {
      "matches": ["<all_urls>"],
      "resources": [
        "discovery.synapse.config.js",
        "landing.synapse.config.js",
        "discovery/*",
        "landing/*"
      ]
    }
  ]
}
```

### Notas sobre permisos

- **`nativeMessaging`**: requerido para `chrome.runtime.connectNative()` — el canal con `bloom-host.exe`.
- **`clipboardRead`**: requerido para el Clipboard Monitor de API keys.
- **`alarms`**: requerido para el keepalive del Service Worker.
- **`<all_urls>`** en host_permissions: permite que `content.js` opere en cualquier página — necesario para IonPump.
- **`all_frames: true`** en content_scripts: `content.js` se inyecta también en iframes.

### content-aistudio.js

Content script especializado que se inyecta en las consolas de los AI Providers. Su función es asistir el proceso de detección y extracción de API keys cuando el usuario está en la página de gestión de keys de cada proveedor. Trabaja en conjunto con el Clipboard Monitor.

---

## 15. Generadores de assets estáticos

Los generadores Python son responsables de copiar los assets estáticos de las páginas internas al directorio de la extensión del perfil.

### discovery_generator.py

```python
def generate_discovery_page(target_ext_dir: Path, profile_data: Dict) -> None:
    """
    Despliega assets estáticos de discovery.
    NO genera archivos de configuración — eso es responsabilidad de Sentinel.
    """
    discovery_dir = target_ext_dir / "discovery"
    _copy_static_assets(discovery_dir)

# Archivos copiados:
# index.html, discovery.js, script.js, discoveryProtocol.js,
# content-aistudio.js, onboarding.js, styles.css
```

### landing_generator.py

```python
def generate_profile_landing(target_ext_dir: Path, profile_data: Dict) -> None:
    """
    Despliega assets estáticos de landing.
    NO genera archivos de configuración ni data loaders.
    """
    landing_dir = target_ext_dir / "landing"
    _copy_static_assets(landing_dir)

# Archivos copiados:
# index.html, landing.js, landingProtocol.js, data-loader.js,
# script.js, styles.css
```

### harness_generator.py (solo builds dev)

```python
def generate_harness_page(target_ext_dir: Path, profile_data: Dict) -> None:
    """
    Despliega el Harness de debug.
    En builds de producción: no-op o no se llama.
    """
    harness_dir = target_ext_dir / "harness"
    shutil.copy(template_dir / "index.html", harness_dir / "index.html")
```

### Responsabilidad de Sentinel vs Python

Esta separación fue introducida en v3.0:

| Responsabilidad | Quién |
|----------------|-------|
| Copiar HTML/CSS/JS estáticos | Python generators |
| Generar `*.synapse.config.js` | Sentinel (`ignition_identity.go::prepareSessionFiles()`) |
| Generar `launch_id` | Sentinel (`generateLogicalLaunchID()`) |
| Inyectar `BLOOM_PROFILE_DATA` | Sentinel override system |
| Actualizar config en re-seed | Sentinel override system |

**Rationale:** Elimina duplicación Python/Go, establece Sentinel como única fuente de verdad de identidad de sesión.

---

## 16. Despliegue — Artefacto .blx

Cortex se distribuye como un artefacto `.blx` — un formato empaquetado propio de Bloom que Metamorph gestiona.

### Ciclo de vida

```
Batcave (remoto)
  └─ Genera manifest firmado con hash SHA256 del .blx
       └─ Nucleus valida firma y ACL
            └─ Metamorph descarga y verifica el .blx
                 └─ Desempaqueta la extensión en el directorio del perfil
                      └─ Sentinel genera *.synapse.config.js
                           └─ Python generators copian assets estáticos
                                └─ Chrome lanza el perfil con la extensión lista
```

### Construcción

```bash
# Reconstruir y redesplegar la extensión
cd installer/cortex/build-cortex && python package.py
```

Este comando empaqueta el directorio de la extensión como `.blx`, lo firma y lo pone disponible para distribución via Metamorph.

### Actualización

Metamorph actualiza Cortex como parte del proceso de reconciliación declarativa. El manifest especifica la versión requerida; si la instalada difiere, Metamorph descarga y reemplaza atómicamente.

Cortex **no se actualiza** desde Chrome Web Store. No existe en Chrome Web Store. Su ciclo de vida es completamente interno al ecosistema Bloom.

---

## 17. Logging y debugging

### Logs de la extensión

Los logs de Chrome y Cortex se escriben en:
```
BloomNucleus/logs/chrome/profile_{id}/chrome_debug.log
```

Para ver logs de la extensión en tiempo real: abrir `chrome://extensions`, activar "Developer mode", clic en "Service Worker" del perfil → abre DevTools del Service Worker.

### Logs del Native Host

```
BloomNucleus/logs/host/synapse_host_*.log
```

Contiene el tráfico completo de Native Messaging entre la extensión y `bloom-host.exe`.

### Estado del handshake — debug rápido

`background.js` expone un helper de debug cuando la URL incluye `debug=true`:

```javascript
self.SYNAPSE_DEBUG.getState()
// Retorna: { initialized, connectionState, handshakeState, hasPort, config, mode }

self.SYNAPSE_DEBUG.forceReconnect()
// Fuerza desconexión y reinicialización
```

### Problemas comunes y diagnóstico

**La extensión no conecta con el host:**
- Verificar que `bridge_name` en SYNAPSE_CONFIG coincide con el nombre registrado del native host.
- Verificar que `profileId` y `launchId` no son undefined en el config — JSON.stringify los omite silenciosamente.
- Si el config usa snake_case (`profile_id`, `launch_id`), el normalizer de `background.js` debería cubrirlo, pero verificar los logs de inicio.

**Discovery no avanza más allá del polling:**
- Verificar que el handshake completó las 3 fases en los logs del Service Worker.
- El polling de `check_handshake_status` continúa hasta recibir `handshake_confirmed: true`.
- Si `bloom-host.exe` no responde con `host_ready`, el handshake se traba en EXTENSION_READY.

**Slave Mode no se libera:**
- El timeout de 30 segundos debería auto-liberarlo.
- Si no funciona, verificar que `content.js` está efectivamente inyectado (el ribbon verde debe ser visible).
- El evento `slave_mode_timeout` llega a Brain para diagnóstico.

**Config no carga:**
- Verificar que `*.synapse.config.js` fue generado por Sentinel antes de que Chrome abra.
- Verificar que el archivo está en `web_accessible_resources` del manifest.
- El fallback por fetch + regex debería cubrir casos donde `importScripts` falla.

---

## 18. Extensión de capacidades — Guía para nuevos desarrollos

Esta sección describe los puntos de extensión de Cortex para desarrollo de nuevas features.

### Agregar un nuevo comando DOM

1. **`content.js`**: Implementar la función `executeNewCommand(payload)` y agregar el case en el switch del `onMessage` listener.
2. **Brain**: Agregar el nuevo tipo de comando en `SynapseServer` y en los módulos que lo necesiten (IonPump, intent executor, etc.).
3. **Harness**: Si el nuevo comando necesita testing, agregar al `IONPUMP_PROTOCOL_MANIFEST` o al manifest correspondiente.

### Agregar un nuevo sitio a IonPump

Ver sección 12. Resumen:
1. Crear recipe `.ion` en `ionsites/{dominio}/message.ion`.
2. Si el dominio no está en `content_scripts.matches`, agregar y reempaquetar `.blx`.
3. Agregar el dominio al `options` del parámetro `site` en `IONPUMP_PROTOCOL_MANIFEST`.

### Agregar una nueva página interna

1. Crear directorio en `extension/nueva_pagina/`.
2. Implementar `nuevaProtocol.js` con el patrón `PROTOCOL` + fases.
3. Agregar `nueva_pagina/*` a `web_accessible_resources` en `manifest.json`.
4. Crear `nueva_generator.py` siguiendo el patrón de `discovery_generator.py`.
5. Agregar lógica de apertura en `background.js` o en Brain.
6. Agregar config handler en `background.js` si la página necesita SYNAPSE_CONFIG propio.

### Agregar un nuevo flag de SYNAPSE_CONFIG

1. **Sentinel (`ignition_identity.go`)**: Agregar el campo en `prepareSessionFiles()`.
2. **`background.js`**: Agregar regex matcher o lectura directa desde `self.SYNAPSE_CONFIG`.
3. Si el flag aplica a Discovery: agregar en `requiredDiscovery` de `validateConfig()`.
4. Si el flag aplica a Landing: agregar en `requiredLanding`.
5. Documentar el campo en la tabla de SYNAPSE_CONFIG de este documento.

### Sistema de posicionamiento de tabs y perfiles

Para desarrollar un sistema de gestión de posicionamiento (qué tabs están abiertas, en qué posición, en qué ventana), los puntos de anclaje en Cortex son:

**Lectura de estado de tabs:**
```javascript
// background.js puede consultar:
chrome.tabs.query({ windowId: chrome.windows.WINDOW_ID_CURRENT })
chrome.windows.getAll({ populate: true })
```

**Control de ventana:**
```javascript
// applyWindowLayout() ya existe en background.js:
await applyWindowLayout({ width, height, left, top, state })

// chrome.windows.update(windowId, { left, top, width, height, focused })
// chrome.tabs.move(tabId, { windowId, index })
```

**Desde Brain:** Se puede enviar un comando custom al host que `background.js` procese:
```javascript
// Nuevo comando: 'window.position'
case 'window.position':
  await applyWindowLayout(payload.layout);
  respondToHost(msgId, { success: true });
  break;
```

**Desde Sentinel:** Se puede extender `HOST_INIT_ACK` para incluir layout inicial de ventanas, o crear un nuevo mensaje `WINDOW_LAYOUT_INIT` que `bloom-host.exe` forwardee a `background.js` al completar el handshake.

El campo `window` en el payload de `host_ready` ya es el mecanismo existente para layout inicial — es el punto de extensión natural.

### Extender el onboarding con nuevos proveedores

1. Agregar el patrón de API key en `API_KEY_PATTERNS` de `background.js`.
2. Agregar el step correspondiente en `discoveryProtocol.js` (handler de fase + UI).
3. Agregar el mensaje en `DISCOVERY_PROTOCOL_MANIFEST`.
4. Actualizar los steps de onboarding en Sentinel para incluir el nuevo servicio.
5. Agregar el dominio de la consola en `content_scripts.matches` si se necesita `content-aistudio.js` equivalente.

### Extender el Harness con nuevos protocolos

El Harness se extiende automáticamente cuando se agrega un nuevo `*_PROTOCOL_MANIFEST` en cualquier archivo de la extensión. El `ProtocolReader` lo detectará en el próximo re-seed.

Para agregar soporte de un nuevo protocolo:
1. Crear el manifest en el archivo JS correspondiente: `self.NUEVO_PROTOCOL_MANIFEST = { ... }`.
2. Asegurarse de que el archivo que define el manifest esté incluido en `web_accessible_resources`
   del `manifest.json` de la extensión.
3. Re-seed del perfil — el `ProtocolReader` lo detectará automáticamente.

> ❌ **No modificar `harness/index.html`.** El `ProtocolReader` escanea `self.*` en el contexto
> global — no requiere registro manual de ningún protocolo.

---

## Apéndice — Eventos del sistema y su trazabilidad

Esta tabla muestra todos los eventos que fluyen a través de Cortex y su trazabilidad completa.

| Evento | Origen | Destino | Persistido en Brain |
|--------|--------|---------|-------------------|
| `PROFILE_CONNECTED` | bloom-host.exe → Brain | Todos los Sentinels | ✅ Crítico |
| `PROFILE_DISCONNECTED` | bloom-host.exe TCP close | Todos los Sentinels | ✅ Crítico |
| `ONBOARDING_COMPLETE` | discovery.js → background.js → host → Brain | Sentinels | ✅ Crítico |
| `EXTENSION_ERROR` | background.js → host → Brain | Sentinels | ✅ Crítico |
| `DISCOVERY_COMPLETE` | discovery.js → background.js → host | Brain | No |
| `HEARTBEAT` | background.js → host → Brain | Temporal workflow | No |
| `HEARTBEAT_SUCCESS` | discovery.js → background.js → host | Brain | No |
| `SLAVE_MODE_CHANGED` | content.js → background.js → host | Brain | No |
| `SLAVE_MODE_TIMEOUT` | content.js → background.js → host | Brain | No |
| `ACTUATOR_READY` | content.js → background.js → host | Brain | No |
| `API_KEY_DETECTED` | background.js → host → Brain | Vault | No |
| `API_KEY_REGISTERED` | Brain → host → background.js | Discovery Page | ✅ Vault |
| `ACCOUNT_REGISTERED` | discovery.js ↔ background.js ↔ host ↔ Brain | Nucleus | ✅ Crítico |
| `HANDSHAKE_CONFIRMED` | background.js → runtime broadcast | Discovery/Landing | No |

---

*BTIPS · BLOOM CORTEX REFERENCE v1.0 · Platform Engineering · Abril 2026*
*Fuente de verdad de la Chrome Extension Bloom Cortex — arquitectura, protocolos, extensión de capacidades*
