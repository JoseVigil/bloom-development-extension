# Bloom — Harness + IonPump: Fuente de Verdad
## Versión consolidada · Junio 2026 — revisión Jun 19 (verificación contra código fuente)
### Supersede: todos los documentos del directorio `/docs/HARNESS/`

> **Jerarquía de versiones usada para producir este documento:**
> 1. `HARNESS_Manual_Onboarding_Debug.md` — Jun 6 · Estado operativo actual (más reciente)
> 2. `IMPL_PROMPT_CORTEX_SENTINEL_Harness_v2.md` — Abr 25 · Correcciones arquitectónicas críticas (v2)
> 3. `IMPL_PROMPT_BRAIN_IonPump_Harness_v2.md` — Abr 25 · IPC layer + correcciones Brain (v2)
> 4. `IONPUMP_IMPLEMENTATION_PROMPT_v2.md` — Abr 25 · Spec técnica IonPump (v2)
> 5. `IMPL_PROMPT_METAMORPH_IonRecipes.md` — May 24 · Inspect/reconcile Metamorph
> 6. `BLOOM_HARNESS_IONPUMP_INTEGRATION_MASTER.md` — May 11 · Master de integración (v1, parcialmente supersedido por v2s)
> 7. `INVESTIGACION_Harness_Protocol_Autodiscovery.md` — Abr 1 · Investigación de diseño original
>
> **Revisión Jun 19 2026:** se contrastaron las secciones 1, 6, 9, 12, 15 y 18 contra el código fuente real (`discoveryProtocol.js`, `discovery.js`, `onboarding.js`, `harness.js`, `landingProtocol.js`, `landing.js`, `ionpump_protocol.js`). Las correcciones quedan marcadas inline con bloques `>` y resumidas en la nueva §19. Esta revisión NO tocó las secciones 2-5, 7-8, 10-11, 13-14, 16-17 más allá de notas puntuales — esas siguen siendo lo heredado de la consolidación de junio, sin re-verificar contra Brain/Sentinel/Metamorph.

---

## Índice

1. [Qué es el Harness y qué es IonPump](#1-qué-es-el-harness-y-qué-es-ionpump)
2. [Principios de diseño no negociables](#2-principios-de-diseño-no-negociables)
3. [Mapa de responsabilidades por componente](#3-mapa-de-responsabilidades-por-componente)
4. [Arquitectura del Harness](#4-arquitectura-del-harness)
5. [Arquitectura de IonPump](#5-arquitectura-de-ionpump)
6. [Manifests de protocolo — contratos autodescriptivos](#6-manifests-de-protocolo--contratos-autodescriptivos)
7. [Ciclo de vida — seed, launch, re-seed](#7-ciclo-de-vida--seed-launch-re-seed)
8. [Implementación — Brain](#8-implementación--brain)
9. [Implementación — Cortex](#9-implementación--cortex)
10. [Implementación — Sentinel](#10-implementación--sentinel)
11. [Implementación — Metamorph](#11-implementación--metamorph)
12. [Uso operativo — cómo debuggear el flujo onboarding](#12-uso-operativo--cómo-debuggear-el-flujo-onboarding)
13. [Estado actual del sistema](#13-estado-actual-del-sistema)
14. [Estructura de archivos completa](#14-estructura-de-archivos-completa)
15. [Checklist de implementación por componente](#15-checklist-de-implementación-por-componente)
16. [Restricciones absolutas](#16-restricciones-absolutas)
17. [Invariantes del sistema a preservar](#17-invariantes-del-sistema-a-preservar)
18. [Preguntas abiertas](#18-preguntas-abiertas)
19. [Adenda — verificación contra código fuente real (Jun 19 2026)](#19-adenda--verificación-contra-código-fuente-real-jun-19-2026)

---

## 1. Qué es el Harness y qué es IonPump

### Harness

El Harness es una **herramienta de observabilidad y simulación del protocolo Synapse**. Existe exclusivamente en builds dev — no se despliega en producción.

Sus dos roles son:
- **Observar** todos los mensajes `chrome.runtime` que fluyen entre la extensión, `background.js` y el host mientras el onboarding corre en Discovery.
- **Simular** eventos del protocolo para avanzar o testear pasos del flujo sin depender del sistema real (clipboard, GitHub, Brain) cuando algo no responde.

El Harness **no modifica el estado del sistema**. Despacha mensajes como si los hubiera enviado otro componente. `background.js` los recibe y los procesa exactamente igual.

### IonPump

IonPump es un **runtime de automatización web** que vive dentro de Brain. Ejecuta recetas de automatización por sitio (`.ion` files) que traducen flujos declarativos en comandos atómicos Synapse que se ejecutan en el browser via la extensión Cortex.

**IonPump no es un módulo CLI de usuario. Es un runtime interno invocado por IntentExecutor.**

### Las tres páginas que el Harness puede observar/simular

Cortex no es una sola página — son tres, cada una atada a un momento distinto del ciclo de vida del perfil. El Harness lee el manifest de las que estén presentes en el boot:

| Página | Cuándo corre | Manifest | Estado del manifest |
|---|---|---|---|
| **Discovery** (`discovery/index.html`) | Handshake inicial; si `register=true`, todo el onboarding | `DISCOVERY_PROTOCOL_MANIFEST` | Implementado — 8 mensajes (ver §6.4) |
| **Landing** (`landing/index.html`, antes "Cockpit") | Post-onboarding, en cada uso normal del perfil | `LANDING_PROTOCOL_MANIFEST` | **Implementado — 6 mensajes** (ver §6.4b). Las versiones anteriores de este documento lo listaban como pendiente; ya no lo es. |
| **Harness** (`harness/index.html`) | Solo en builds `--dev` | No tiene manifest propio | Lee los tres de arriba en runtime |

`harness.js` intenta cargar los tres protocolos en el boot (`discoveryProtocol.js`, `ionpump_protocol.js`, `landingProtocol.js`) usando `loadScriptOptional()`, que resuelve sin error si el archivo no existe todavía — por eso Discovery e IonPump están "siempre presentes desde seed --dev" mientras que Landing solo aparece "post-onboarding" (no porque falte implementar, sino porque el archivo físicamente no existe hasta que el perfil completó el alta).

### Relación entre Harness e IonPump

Son problemas ortogonales que comparten infraestructura. La superficie compartida es que ambos necesitan que Cortex exponga manifests de protocolo legibles en runtime. IonPump define el `IONPUMP_PROTOCOL_MANIFEST`. El Harness lo lee. Relación unidireccional: IonPump produce, Harness consume.

**La regla de oro que gobierna ambas features:**
> La fuente de verdad es el protocolo. El Harness la lee. IonPump la alimenta. Nadie la duplica.

Esta misma regla se extiende a Landing: Landing produce `LANDING_PROTOCOL_MANIFEST`, el Harness lo lee. No hay tratamiento especial por ser la tercera página — el patrón es idéntico al de Discovery e IonPump.

---

## 2. Principios de diseño no negociables

**El Harness no tiene protocolo propio.** Lee los protocolos existentes en runtime. Es un lector, no un duplicador.

**El manifest es el contrato.** Cada protocolo expone un `*_PROTOCOL_MANIFEST` autodescriptivo. El Harness genera UI desde ese manifest. Agregar features al protocolo actualiza el Harness automáticamente.

**Los canales son tipos, no hardcoding.** El manifest diferencia mensajes de `runtime` y de `tabs`. El Harness selecciona el mecanismo de dispatch correcto según el tipo. *(Nota Jun 19 2026: este es el principio de diseño; en la implementación actual de `ionpump_protocol.js` el canal `"tabs"` todavía no aparece — los 10 mensajes existentes son todos `"runtime"`. Ver §6.5 y §15 para el detalle. El principio sigue siendo correcto como objetivo; el código todavía no lo materializa para canal tabs.)*

**Dev/prod por construcción, no por flags.** El Harness existe en builds dev porque Brain lo genera en seed. No existe en prod porque Brain no lo genera. No hay flags de feature, no hay builds separados de Cortex.

**Re-seed como mecanismo de actualización.** Cambios en el Harness se aplican con un re-seed. No requieren empaquetar ni distribuir Cortex.

**Brain es el único escritor del `extensionDir`.** Sentinel orquesta el seed y pasa flags, pero no toca `extensionDir` después de llamar a `brain profile create`.

---

## 3. Mapa de responsabilidades por componente

| Componente | Rol en Harness/IonPump |
|---|---|
| **Brain** | Aloja `IonPumpManager` (runtime). Expone admin CLI. Genera `harness_generator.py` en seed. Es el único escritor del `extensionDir`. |
| **Sentinel** | Pasa flag `--dev` a `brain profile create` en seed. Escribe `harness.synapse.config.js` en launch (no en seed). No toca `extensionDir` después de llamar a Brain. |
| **Cortex** | Aloja `harness/index.html` (copiado por Brain). Expone `DISCOVERY_PROTOCOL_MANIFEST` e `IONPUMP_PROTOCOL_MANIFEST` en `self.*`. El `content.js` ejecuta comandos DOM de IonPump. No modifica nada más. |
| **Metamorph** | Inspecciona y reconcilia `.ion` recipes en filesystem. Es el único escritor de `ionsites/`. No participa del runtime IonPump. |
| **Harness** | Herramienta de debug. Lee manifests de protocolo en runtime. Genera UI dinámica. Observa y simula. No tiene protocolo propio. No abre canales propios. |

---

## 4. Arquitectura del Harness

### 4.1 Dónde vive

El Harness **no vive en el `.blx` de Cortex**. Vive en Brain templates y Brain lo copia durante el seed.

```
brain/core/profile/web/
├── templates/
│   └── harness/
│       └── index.html        ← fuente en Brain
└── harness_generator.py      ← genera/copia el template en seed

profiles/<uuid>/extension/
└── harness/
    └── index.html            ← copiado por Brain en seed (solo --dev)
```

En prod, `generate_harness_page()` es un no-op. El directorio `harness/` nunca se crea. La URL `chrome-extension://{id}/harness/index.html` devuelve 404. Sin builds separados de Cortex, sin flags de feature.

### 4.2 Los 3 paneles del Harness

```
┌─────────────────────────────────────────────────────────────────┐
│  🌱 Bloom Harness  [DEV]          MasterWorker  ● Connected     │  ← Top bar
├────────────────┬──────────────────────────────┬─────────────────┤
│                │                              │  [Log] [Config] │
│  PROTOCOLS     │  SIMULATE                    │                 │
│                │                              │  Log entries    │
│  ▼ discovery   │  Seleccioná un mensaje       │  en tiempo real │
│    8 mensajes  │  del panel izquierdo         │                 │
│                │  para ver el form            │  Filter logs…   │
│  ▼ ionpump     │  y despacharlo               │                 │
│    10 mensajes │                              │  Config raw     │
│                │                              │  (profileId,    │
│                │                              │   launchId)     │
└────────────────┴──────────────────────────────┴─────────────────┘
```

**Panel izquierdo — Protocols:** lista todos los manifests cargados al boot. Cada protocolo es una sección colapsable con sus mensajes. Al hacer click en un mensaje, se carga en el panel central para simular.

**Panel central — Simulate:** muestra el mensaje seleccionado con descripción, campos editables para parámetros `string` o `enum`, preview del payload JSON, y botón **Send** que despacha via `chrome.runtime.sendMessage`. Los parámetros `type: "auto"` se resuelven automáticamente desde `HARNESS_CONFIG` — no aparecen como campos editables.

**Panel derecho — Log / Config:** stream en tiempo real de todos los mensajes. Tipos: `INFO`, `SEND`, `ACK`, `ERR`. Tab Config: muestra estado de `HARNESS_CONFIG` y `SYNAPSE_CONFIG` cargados.

### 4.3 Cómo abrir el Harness

```
chrome-extension://hpblclepliicmihaplldignhjdggnkdh/harness/index.html
```

**Prerrequisitos:**
- La extensión está cargada en modo developer en `chrome://extensions`
- `bloom-host` está corriendo (el log de `background.js` debe mostrar `HANDSHAKE COMPLETADO`)
- El perfil fue creado con `sentinel seed <alias> <master> --dev`

**Dev Tools del Harness:** en `chrome://extensions` → Bloom Nucleus Bridge → **Inspect views** → `harness/index.html`

### 4.4 ProtocolReader — el motor del Harness

```javascript
class ProtocolReader {
  constructor() { this.protocols = {}; }

  async loadAll() {
    const available = [
      { key: 'discovery', global: 'DISCOVERY_PROTOCOL_MANIFEST' },
      { key: 'landing',   global: 'LANDING_PROTOCOL_MANIFEST' },
      { key: 'ionpump',   global: 'IONPUMP_PROTOCOL_MANIFEST' }
    ];
    for (const { key, global } of available) {
      if (self[global]) this.protocols[key] = self[global];
    }
    return this.protocols;
  }

  resolvePayload(message, overrides = {}) {
    const template = JSON.stringify(message.payload_template);
    let resolved = template;
    for (const param of message.parameters) {
      const value = overrides[param.name]
        || this._resolveAutoSource(param.source)
        || param.default
        || `<${param.name}>`;
      resolved = resolved.replaceAll(`"${param.variable}"`, JSON.stringify(value));
    }
    return JSON.parse(resolved);
  }

  _resolveAutoSource(source) {
    if (!source) return null;
    const parts = source.split('.');
    let obj = self;
    for (const part of parts) { obj = obj?.[part]; }
    return obj || null;
  }
}
```

### 4.5 Dispatcher — diferenciación de canales

```javascript
async function dispatchMessage(message, overrides) {
  const payload = reader.resolvePayload(message, overrides);

  if (message.channel === 'runtime') {
    const response = await chrome.runtime.sendMessage(payload);
    addToFeed('ack', response, null);
  } else if (message.channel === 'tabs') {
    const tabId = getSelectedTabId();
    if (!tabId) { showError('No tab selected. Set active tab in Config panel.'); return; }
    const response = await chrome.tabs.sendMessage(tabId, payload);
    addToFeed('ack', response, null);
  }
}
```

### 4.6 Fixes ya aplicados (Jun 2026)

En la sesión de debug de Jun 6 se repararon cuatro problemas raíz:

1. **CSP violation:** el JS inline del Harness fue extraído a `harness/harness.js` — Chrome MV3 bloquea inline scripts.
2. **`discoveryProtocol.js` nunca se cargaba:** el HTML no tenía el `<script src>` para ese archivo.
3. **Timing del boot:** el boot ahora es `async` y espera cada script con `loadScriptOptional()` antes de llamar `Harness.init()`.
4. **Landing condicional:** `landing.synapse.config.js` y `landing/landingProtocol.js` se cargan solo si existen.

**Archivos modificados en esa sesión:**
- `harness/index.html` — solo tiene `<script src="harness.js"></script>`, sin inline JS
- `harness/harness.js` — archivo nuevo con todo el JS extraído + boot async con carga condicional

---

## 5. Arquitectura de IonPump

### 5.1 Posición en el stack

```
IntentExecutor
  │  detecta intent_subtype == "web_automation"
  ▼
IonPumpManager (runtime singleton en Brain)
  │  lazy-carga .ion recipe
  │  traduce Ion steps → SynapseCommand objects
  ▼
IonPumpIPCClient
  │  TCP localhost
  ▼
SynapseIPCServer (thread en Brain-Host process)
  │  lee puerto de run/ipc_{launch_id}.port
  │  llama protocol.send_message()
  ▼
SynapseManager (existente, minimal change)
  │  _action_map extendido con handlers DOM
  │  Native Messaging (existente, sin cambios)
  ▼
bloom-host.exe (sin cambios)
  ▼
content.js en Cortex (sin cambios)
  executa acciones DOM
```

### 5.2 Por qué IPC y no llamada directa

`SynapseManager.run_host_loop()` es un loop bloqueante corriendo en el Brain-Host process (invocado por Chrome como Native Messaging Host). IonPump corre en un proceso Brain separado disparado por un intent. Son procesos OS distintos — no comparten memoria. Un socket TCP local es el canal correcto, consistente con el patrón existente de JSON-over-subprocess del ecosistema.

### 5.3 Archivos IPC de runtime

```
BloomNucleus/run/
└── ipc_{launch_id}.port     # Escrito por SynapseIPCServer al arrancar
                              # Contiene: entero plano (número de puerto TCP)
                              # Borrado cuando termina la sesión de SynapseManager
```

`SynapseIPCServer` solo escucha en `127.0.0.1` — nunca en `0.0.0.0`.

### 5.4 .ion files — formato

```yaml
# claude.ai/message.ion
version: 1.0.0
site: claude.ai
description: "Send messages and wait for responses in Claude"

entrypoints:
  on_load: bootstrap
  on_user_command: send_prompt
  on_response_ready: extract_response

variables:
  input_selector: "#chat-input"
  send_button: "button[type='submit']"
  response_container: ".markdown-content"

flows:
  bootstrap:
    description: "Initialize Claude interface"
    steps:
      - wait:
          selector: "${input_selector}"
          timeout: 10s
      - emit:
          event: "SITE_READY"
          payload: { site: "claude.ai" }

  send_prompt:
    description: "Send prompt to chat"
    requires: ["SITE_READY"]
    steps:
      - focus: { selector: "${input_selector}" }
      - type:  { selector: "${input_selector}", text: "${prompt}" }
      - click: { selector: "${send_button}" }
      - emit:  { event: "PROMPT_SENT" }
```

### 5.5 Filesystem de recipes

```
BloomNucleus/bin/cortex/ionsites/
├── claude.ai/
│   ├── ion.manifest.json
│   └── message.ion
├── chatgpt.com/
│   └── message.ion
├── github.com/
│   ├── ion.manifest.json
│   └── auth.ion
└── _meta/
    └── versions.json
```

Si `ionsites/` no existe al arrancar, `IonLoader.discover_all()` lo crea silenciosamente y retorna 0. No es un error — significa que no hay recipes desplegados aún.

**Responsabilidades de escritura en `ionsites/`:**

| Componente | Lee | Escribe | Hot-Reload |
|---|---|---|---|
| IonPump (Brain) | ✅ | ❌ | ✅ watchdog |
| Metamorph | ✅ | ✅ | ❌ |
| Cortex | ❌ | ❌ | ❌ |
| Sentinel | ❌ | ❌ | ❌ |
| SynapseIPCServer | ❌ | ✅ port file | ❌ |

---

## 6. Manifests de protocolo — contratos autodescriptivos

### 6.1 Principio

La versión anterior del Harness definía una tabla estática de mensajes que era una copia manual del contrato en `discoveryProtocol.js`. Eso es duplicación. El principio correcto: el Harness no tiene protocolo propio — lee los protocolos existentes en runtime.

Cada protocolo agrega al **final** de su archivo un bloque `*_PROTOCOL_MANIFEST`. No modifica nada de su lógica.

### 6.2 Tipos de parámetro

| Tipo | Comportamiento |
|---|---|
| `type: "auto"` + `source` | Se resuelve desde config activo (`HARNESS_CONFIG`, `SYNAPSE_CONFIG`). Invisible al developer en el Harness. |
| `type: "string"` | Campo editable en el Harness. |
| `type: "enum"` | Dropdown en el Harness. |

### 6.3 Tipos de canal

| Canal | Mecanismo de dispatch |
|---|---|
| `channel: "runtime"` | `chrome.runtime.sendMessage` |
| `channel: "tabs"` | `chrome.tabs.sendMessage(selectedTabId, ...)` |

### 6.4 DISCOVERY_PROTOCOL_MANIFEST — completo (verificado contra fuente, Jun 19 2026)

> **Corrección respecto a versiones anteriores de este documento:** el manifest listado antes acá no coincide con el código real en `discoveryProtocol.js`. Diferencias: el real tiene **8 mensajes**, no 6 — incluye `api_key_registered` y `handshake_confirmed`, que no estaban documentados. `host_ready` es un `event` (`{event:"HOST_READY", profile_id, launch_id}`), no un `command` sin payload. No existe ningún mensaje con `payload_template: {command:"host_ready"}`. El bloque de abajo es transcripción literal del archivo fuente.

Agregado al **final** de `discoveryProtocol.js` (línea 269 en adelante), sin tocar el objeto `PROTOCOL` que ocupa el resto del archivo:

```javascript
self.DISCOVERY_PROTOCOL_MANIFEST = {
  version: "1.0.0",
  protocol: "discovery",
  description: "Onboarding flow — extension handshake, GitHub auth, API key detection, account registration",

  messages: [
    {
      id: "onboarding_navigate",
      type: "command",
      direction: "harness_to_background",
      channel: "runtime",
      description: "Navigate Discovery to a specific onboarding step",
      payload_template: { command: "onboarding_navigate", payload: { step: "$STEP" } },
      parameters: [
        { name: "step", type: "enum", variable: "$STEP",
          options: ["welcome", "github_auth", "github_confirm", "api_key", "complete"] }
      ]
    },
    {
      id: "github_pat_detected",
      type: "event",
      direction: "harness_to_background",
      channel: "runtime",
      description: "Simulate clipboard monitor detecting a GitHub PAT",
      payload_template: { event: "GITHUB_PAT_DETECTED", token: "$TOKEN" },
      parameters: [
        { name: "token", type: "string", variable: "$TOKEN", default: "ghp_simulatedToken123456789" }
      ]
    },
    {
      id: "github_token_stored",
      type: "event",
      direction: "harness_to_background",
      channel: "runtime",
      description: "Simulate user confirming GitHub token storage",
      payload_template: {
        event: "GITHUB_TOKEN_STORED",
        token_fingerprint: "$FINGERPRINT", profile_id: "$PROFILE_ID", launch_id: "$LAUNCH_ID"
      },
      parameters: [
        { name: "token_fingerprint", type: "string", variable: "$FINGERPRINT", default: "ghp_...abc123" },
        { name: "profile_id", type: "auto", variable: "$PROFILE_ID", source: "HARNESS_CONFIG.profileId" },
        { name: "launch_id", type: "auto", variable: "$LAUNCH_ID", source: "SYNAPSE_CONFIG.launchId" }
      ]
    },
    {
      id: "api_key_registered",
      type: "event",
      direction: "harness_to_background",
      channel: "runtime",
      description: "Simulate successful API key registration",
      payload_template: {
        event: "API_KEY_REGISTERED",
        key_fingerprint: "$KEY_FINGERPRINT", profile_id: "$PROFILE_ID", launch_id: "$LAUNCH_ID"
      },
      parameters: [
        { name: "key_fingerprint", type: "string", variable: "$KEY_FINGERPRINT", default: "sk-...xyz789" },
        { name: "profile_id", type: "auto", variable: "$PROFILE_ID", source: "HARNESS_CONFIG.profileId" },
        { name: "launch_id", type: "auto", variable: "$LAUNCH_ID", source: "SYNAPSE_CONFIG.launchId" }
      ]
    },
    {
      id: "account_registered",
      type: "event",
      direction: "harness_to_background",
      channel: "runtime",
      description: "Simulate account registration completion",
      payload_template: { event: "ACCOUNT_REGISTERED", profile_id: "$PROFILE_ID", launch_id: "$LAUNCH_ID" },
      parameters: [
        { name: "profile_id", type: "auto", variable: "$PROFILE_ID", source: "HARNESS_CONFIG.profileId" },
        { name: "launch_id", type: "auto", variable: "$LAUNCH_ID", source: "SYNAPSE_CONFIG.launchId" }
      ]
    },
    {
      id: "discovery_complete",
      type: "event",
      direction: "harness_to_background",
      channel: "runtime",
      description: "Simulate full discovery/onboarding flow completion",
      payload_template: { event: "DISCOVERY_COMPLETE", profile_id: "$PROFILE_ID", launch_id: "$LAUNCH_ID" },
      parameters: [
        { name: "profile_id", type: "auto", variable: "$PROFILE_ID", source: "HARNESS_CONFIG.profileId" },
        { name: "launch_id", type: "auto", variable: "$LAUNCH_ID", source: "SYNAPSE_CONFIG.launchId" }
      ]
    },
    {
      id: "handshake_confirmed",
      type: "event",
      direction: "harness_to_background",
      channel: "runtime",
      description: "Simulate extension handshake confirmation",
      payload_template: { event: "HANDSHAKE_CONFIRMED", profile_id: "$PROFILE_ID", launch_id: "$LAUNCH_ID" },
      parameters: [
        { name: "profile_id", type: "auto", variable: "$PROFILE_ID", source: "HARNESS_CONFIG.profileId" },
        { name: "launch_id", type: "auto", variable: "$LAUNCH_ID", source: "SYNAPSE_CONFIG.launchId" }
      ]
    },
    {
      id: "host_ready",
      type: "event",
      direction: "harness_to_background",
      channel: "runtime",
      description: "Simulate bloom-host signaling it is ready to receive commands",
      payload_template: { event: "HOST_READY", profile_id: "$PROFILE_ID", launch_id: "$LAUNCH_ID" },
      parameters: [
        { name: "profile_id", type: "auto", variable: "$PROFILE_ID", source: "HARNESS_CONFIG.profileId" },
        { name: "launch_id", type: "auto", variable: "$LAUNCH_ID", source: "SYNAPSE_CONFIG.launchId" }
      ]
    }
  ],

  observable_events: [
    "HOST_READY",
    "HANDSHAKE_CONFIRMED",
    "API_KEY_REGISTERED",
    "ACCOUNT_REGISTERED",
    "DISCOVERY_COMPLETE"
  ]
};
```

**Gap real (no documental) detectado en `routeToStep()` de `discovery.js`:** el manifest ofrece `onboarding_navigate` con el enum `["welcome", "github_auth", "github_confirm", "api_key", "complete"]`, pero ese enum **no refleja los steps que el flujo real usa**. El lado VSCode (`onboarding.js`) navega a steps `vault_init`, `ai_provider_setup` y `project_create` (ver §9.4), y `routeToStep()` en `discovery.js` solo tiene cases para `github_auth` y `google_auth` — cualquier otro step cae al `default` y se resuelve como `routeToServiceFlow`, no como el step pedido. El enum del manifest debería actualizarse junto con el `switch`, o el Harness va a ofrecer para simular steps que Discovery no sabe rutear.

### 6.4b LANDING_PROTOCOL_MANIFEST — completo (no documentado en versiones anteriores)

> Las versiones anteriores de este documento (incluida la entrada del checklist §15) trataban a Landing como pendiente o fuera de alcance. Es incorrecto: `landingProtocol.js` ya tiene el manifest completo, agregado al final del archivo (línea 380 en adelante) con el mismo patrón append-only que Discovery e IonPump.

```javascript
self.LANDING_PROTOCOL_MANIFEST = {
  version: "1.0.0",
  protocol: "landing",
  description: "Profile cockpit — session state, stats, linked accounts, quick actions",

  messages: [
    {
      id: "profile_load", type: "command", direction: "harness_to_background", channel: "runtime",
      description: "Request a full profile data reload",
      payload_template: { command: "profile_load", profile_id: "$PROFILE_ID" },
      parameters: [{ name: "profile_id", type: "auto", variable: "$PROFILE_ID", source: "HARNESS_CONFIG.profileId" }]
    },
    {
      id: "health_check", type: "command", direction: "harness_to_background", channel: "runtime",
      description: "Trigger a full-stack health check",
      payload_template: { command: "health_check", scope: "$SCOPE" },
      parameters: [{ name: "scope", type: "enum", variable: "$SCOPE", options: ["extension", "host", "full-stack"] }]
    },
    {
      id: "nucleus_sync", type: "command", direction: "harness_to_background", channel: "runtime",
      description: "Trigger a nucleus project sync",
      payload_template: { command: "nucleus_sync", profile_id: "$PROFILE_ID", launch_id: "$LAUNCH_ID" },
      parameters: [
        { name: "profile_id", type: "auto", variable: "$PROFILE_ID", source: "HARNESS_CONFIG.profileId" },
        { name: "launch_id", type: "auto", variable: "$LAUNCH_ID", source: "SYNAPSE_CONFIG.launchId" }
      ]
    },
    {
      id: "intent_list", type: "command", direction: "harness_to_background", channel: "runtime",
      description: "Request the list of active intents for this profile",
      payload_template: { command: "intent_list", profile_id: "$PROFILE_ID" },
      parameters: [{ name: "profile_id", type: "auto", variable: "$PROFILE_ID", source: "HARNESS_CONFIG.profileId" }]
    },
    {
      id: "session_status", type: "event", direction: "harness_to_background", channel: "runtime",
      description: "Simulate a session status update from the host",
      payload_template: { event: "SESSION_STATUS", status: "$STATUS", profile_id: "$PROFILE_ID", launch_id: "$LAUNCH_ID" },
      parameters: [
        { name: "status", type: "enum", variable: "$STATUS", options: ["active", "idle", "disconnected", "error"] },
        { name: "profile_id", type: "auto", variable: "$PROFILE_ID", source: "HARNESS_CONFIG.profileId" },
        { name: "launch_id", type: "auto", variable: "$LAUNCH_ID", source: "SYNAPSE_CONFIG.launchId" }
      ]
    },
    {
      id: "stats_update", type: "event", direction: "harness_to_background", channel: "runtime",
      description: "Simulate a stats update payload (launches, uptime, intents)",
      payload_template: {
        event: "STATS_UPDATE", profile_id: "$PROFILE_ID",
        stats: { totalLaunches: "$TOTAL_LAUNCHES", uptime: "$UPTIME", intentsCompleted: "$INTENTS_COMPLETED" }
      },
      parameters: [
        { name: "profile_id", type: "auto", variable: "$PROFILE_ID", source: "HARNESS_CONFIG.profileId" },
        { name: "total_launches", type: "string", variable: "$TOTAL_LAUNCHES", default: "42" },
        { name: "uptime", type: "string", variable: "$UPTIME", default: "3600" },
        { name: "intents_completed", type: "string", variable: "$INTENTS_COMPLETED", default: "7" }
      ]
    }
  ],

  observable_events: ["SESSION_STATUS", "STATS_UPDATE", "PROFILE_LOADED", "HEALTH_CHECK_RESULT"]
};
```

Landing solo aparece en el Harness cuando `landing/landingProtocol.js` existe en el `extensionDir` — es decir, post-onboarding. `harness.js` lo intenta cargar al final de su secuencia de boot (§10.5) y no falla si no está.

### 6.5 IONPUMP_PROTOCOL_MANIFEST — estructura real (verificado contra fuente, Jun 19 2026)

> **Corrección respecto a versiones anteriores de este documento:** la estructura documentada acá antes (un array `messages` con `site_ready`/`response_ready` por `chrome.runtime.sendMessage`, más un array separado `tab_messages` con `dom_focus`/`dom_type` por `chrome.tabs.sendMessage`) **no existe en el código real**. El archivo fuente (`ionpump_protocol.js`) usa un único array `messages` con **10 comandos**, todos `channel: "runtime"` — no hay segundo array `tab_messages` ni canal `"tabs"` implementado. Si la intención original (background → content vía `chrome.tabs.sendMessage`) sigue siendo válida, todavía no está en el manifest; lo que el Harness puede simular hoy son comandos DOM dirigidos por `tab_id` como parámetro de texto, no por canal de tabs real.

Los 10 mensajes reales, en orden de aparición en el archivo:

| id | type | Resumen |
|---|---|---|
| `dom_click` | command | `DOM_CLICK` en un selector CSS, dado `tab_id` |
| `dom_type` | command | `DOM_TYPE` — foco + tipeo de `value` en `selector` |
| `dom_wait` | command | `DOM_WAIT` — espera a que `selector` aparezca, con `timeout_ms` |
| `dom_focus` | command | `DOM_FOCUS` en `selector` |
| `dom_scroll` | command | `DOM_SCROLL` a `selector`, con `behavior` enum (`smooth`/`instant`/`auto`) |
| `dom_extract` | command | `DOM_EXTRACT` de `selector`, con `attribute` enum (`textContent`/`value`/`href`/`data-id`/`innerText`) |
| `event_emit` | event | `EVENT_EMIT` — dispara un evento nombrado en una tab; `event_name` enum incluye `GITHUB_PAT_DETECTED`, `GITHUB_TOKEN_STORED`, `ION_FLOW_STARTED`, `ION_FLOW_COMPLETED`, `ION_FLOW_ERROR` |
| `ion_execute_flow` | command | `ION_EXECUTE_FLOW` — ejecuta un flow registrado (`site` enum: `github.com`/`claude.ai`/`anthropic.com`; `flow` enum: `bootstrap`/`handle_pat_detected`/`await_confirmation`/`send_prompt`) |
| `ion_reload` | command | `ION_RELOAD` — hot-reload de recipes (`site` enum incluye `--all`) |
| `ion_inspect` | command | `ION_INSPECT` — pide el estado actual del registro IonPump |

`tab_id` aparece como parámetro `type: "string"` con default `"1"` en los comandos DOM — es texto libre que el operador del Harness completa a mano, no se resuelve automáticamente contra la tab activa. `launch_id` sí es `type: "auto"`, resuelto desde `SYNAPSE_CONFIG.launchId`.

```javascript
self.IONPUMP_PROTOCOL_MANIFEST = {
  version: "1.0.0",
  protocol: "ionpump",
  description: "IonPump runtime — web automation DOM commands and event triggers for registered ion sites",
  messages: [ /* dom_click, dom_type, dom_wait, dom_focus, dom_scroll, dom_extract,
                  event_emit, ion_execute_flow, ion_reload, ion_inspect — ver tabla arriba */ ],
  observable_events: [
    "ION_FLOW_STARTED", "ION_FLOW_COMPLETED", "ION_FLOW_ERROR",
    "ION_RELOAD_DONE", "ION_RELOAD_FAILED"
  ]
};
```

### 6.6 Agregar un nuevo sitio a IonPump — qué se actualiza

Cuando se agrega `perplexity.ai`:

- **Brain:** se crea `ionsites/perplexity.ai/message.ion` + `ion.manifest.json`. IonPumpManager lo detecta por hot-reload (watchdog del filesystem).
- **Cortex manifest.json:** si el `matches` del content script no incluye perplexity, hay que agregar el dominio.
- **IONPUMP_PROTOCOL_MANIFEST:** agregar `perplexity.ai` al campo `options` de los parámetros `site`.
- **El Harness no se toca.** ProtocolReader refleja el cambio automáticamente en runtime.

---

## 7. Ciclo de vida — seed, launch, re-seed

### 7.1 Flujo de seed

```
sentinel seed <alias> <master> --dev
  │
  ├── 1. Extrae .blx → bin/extension/ (temporal)
  │
  ├── 2. Llama: brain profile create <alias> --dev
  │       └── Brain crea extension/
  │           └── discovery_generator.py: copia discoveryProtocol.js, ionpump_protocol.js
  │           └── harness_generator.py (--dev): copia harness/index.html
  │           (Brain es el único escritor de extensionDir)
  │
  └── 3. bin/extension/ se borra (defer cleanup en Sentinel)
```

### 7.2 Flujo de launch

```
sentinel launch <alias>
  │
  └── ignition_identity.go::prepareSessionFiles()
        ├── writeDiscoveryConfig()   ← existente
        ├── writeLandingConfig()     ← existente
        └── writeHarnessConfig()     ← NUEVO (solo si harness/index.html existe)
              escribe harness.synapse.config.js con profileId y launchId
```

`harness.synapse.config.js` se escribe en **launch**, no en seed. En launch ya existe el `launch_id`. En seed aún no.

### 7.3 Verificación post-seed (dev)

```
profiles/<uuid>/extension/
├── discovery/
│   ├── index.html
│   ├── discoveryProtocol.js
│   ├── ionpump_protocol.js           ← NUEVO (copiado por Brain/discovery_generator)
│   └── [otros assets]
├── landing/
│   └── [existente]
└── harness/
    └── index.html                    ← NUEVO (solo en --dev)
```

### 7.4 Verificación post-launch

```
profiles/<uuid>/extension/
├── discovery.synapse.config.js       ← existente (Sentinel, en launch)
├── landing.synapse.config.js         ← existente (Sentinel, en launch)
└── harness.synapse.config.js         ← NUEVO (Sentinel, en launch, solo si harness existe)
```

### 7.5 Re-seed como mecanismo de actualización

Cuando el Harness se actualiza (nueva versión del template en Brain):

```bash
sentinel seed <alias> <master> --dev
```

Esto re-ejecuta `brain profile create --dev` que sobrescribe `harness/index.html`. No requiere reinstalar Cortex ni empaquetar un nuevo `.blx`.

---

## 8. Implementación — Brain

### 8.1 Estructura de módulos IonPump

```
brain/core/ionpump/
├── __init__.py
├── ionpump_models.py        ← dataclasses del formato .ion
├── ionpump_registry.py      ← registro en memoria (manifests + recipes)
├── ionpump_loader.py        ← carga YAML, scan manifests, watchdog
├── ionpump_validator.py     ← validación de syntax
├── ionpump_state.py         ← state machine por (tab_id, domain)
├── ionpump_executor.py      ← Ion steps → SynapseCommand objects (yield, NO envía)
├── ionpump_manager.py       ← orquestador singleton, usa IPCClient para enviar
└── ionpump_ipc.py           ← cliente TCP que conecta a SynapseIPCServer

brain/core/synapse/
└── synapse_ipc_server.py    ← servidor TCP en Brain-Host, recibe comandos IonPump

brain/commands/ionpump/
├── __init__.py
├── ionpump_inspect.py
├── ionpump_validate.py
├── ionpump_reload.py
└── ionpump_test.py
```

### 8.2 ionpump_models.py

```python
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any

@dataclass
class IonStep:
    action: str            # "wait", "click", "type", "focus", "emit", "transition", "extract"
    params: Dict[str, Any] = field(default_factory=dict)

@dataclass
class IonFlow:
    name: str
    description: str
    steps: List[IonStep] = field(default_factory=list)
    requires: List[str] = field(default_factory=list)

@dataclass
class IonRecipe:
    version: str
    site: str
    description: str
    entrypoints: Dict[str, str] = field(default_factory=dict)
    variables: Dict[str, str] = field(default_factory=dict)
    flows: Dict[str, IonFlow] = field(default_factory=dict)

@dataclass
class IonManifest:
    """Representa ion.manifest.json — se carga en discovery, no el recipe completo."""
    site: str
    version: str
    description: str
    entrypoint: str
    flows: List[str]
    triggers: Dict[str, str]
    capabilities: List[str] = field(default_factory=list)

@dataclass
class SynapseCommand:
    """Comando listo para enviar al SynapseIPCServer."""
    command: str
    params: Dict[str, Any]
    tab_id: int
```

### 8.3 ionpump_loader.py — contrato de interfaz

```python
class IonLoader:
    def discover_all(self) -> int:
        """
        Crea ionsites/ si no existe (NO es un error).
        Escanea ionsites/ y registra todos los manifests.
        NO carga los .ion files. Solo los manifests JSON.
        Retorna cantidad de ions registrados.
        """

    def load_recipe(self, site: str) -> IonRecipe:
        """
        Carga el .ion file de un site. Usa cache si ya está en registry.
        Lanza IonNotFoundError si el site no está registrado.
        Lanza IonSyntaxError si el YAML es inválido.
        """

    def start_watchdog(self) -> None:
        """
        ⚠️ Prerequisito: 'watchdog' debe estar en requirements.txt antes de implementar.
        Cuando detecta cambio:
        1. Valida el nuevo archivo
        2. Si válido: invalida registry y recarga
        3. Si inválido: mantiene versión anterior, loggea error (rollback implícito)
        """
```

### 8.4 harness_generator.py

Sigue el **patrón exacto** de `discovery_generator.py` v3.0: solo copia assets estáticos, no inyecta datos, no genera configs.

```python
def generate_harness_page(target_ext_dir: Path, profile_data: Dict[str, Any], dev_mode: bool = False) -> None:
    """
    En dev_mode=False: no-op completo. No crea ningún archivo.
    En dev_mode=True: copia harness/index.html al extensionDir/harness/
    
    harness.synapse.config.js es responsabilidad de Sentinel en launch (ignition_identity.go).
    """
    if not dev_mode:
        return

    harness_dir = target_ext_dir / "harness"
    harness_dir.mkdir(parents=True, exist_ok=True)

    template_dir = Path(__file__).parent / "templates" / "harness"
    for file_name in ["index.html"]:
        source = template_dir / file_name
        if source.exists():
            shutil.copy2(source, harness_dir / file_name)
```

### 8.5 Modificación en profile_create.py

```python
def _generate_profile_pages(self, profile_id, profile_name, dev_mode=False):
    from brain.core.profile.web.harness_generator import generate_harness_page
    # ... existente: generate_discovery_page, generate_profile_landing ...
    generate_harness_page(extension_dir, profile_data, dev_mode=dev_mode)

def create_profile(self, profile_id=None, name=None, master=False, dev_mode=False):
    # ... pasar dev_mode a _generate_profile_pages ...
```

### 8.6 ionpump_protocol.js — ubicación correcta

El archivo vive en `brain/core/profile/web/templates/discovery/ionpump_protocol.js` y es copiado por `discovery_generator.py` junto con los demás assets estáticos. Sentinel no interviene.

Agregar a la lista `files_to_copy` en `discovery_generator.py`:
```python
files_to_copy = [
    "index.html", "discovery.js", "script.js", "discoveryProtocol.js",
    "ionpump_protocol.js",  # ← NUEVO
    "content-aistudio.js", "onboarding.js", "styles.css"
]
```

### 8.7 Comandos admin IonPump

```bash
brain ionpump inspect                        # lista sites registrados
brain ionpump inspect --json
brain ionpump validate github.com/auth.ion   # valida syntax
brain ionpump reload github.com              # fuerza hot-reload manual
brain ionpump reload --all
brain ionpump test github.com bootstrap      # dry-run de un flow
brain ionpump test github.com send_prompt --context '{"prompt":"test"}' --dry-run
```

Output de `brain ionpump inspect`:
```
IonPump Registry
────────────────────────────────────────────────────────────
✓ github.com     v1.0.0    3 flows    loaded
✗ claude.ai      v1.2.0    5 flows    not loaded
────────────────────────────────────────────────────────────
Total: 2 sites
```

### 8.8 Fases de implementación Brain

**Fase 1 — Core Runtime:** `models → registry → loader → validator → state`. Crear recipe ejemplo: `ionsites/github.com/auth.ion`.

**Fase 2 — IPC Layer + Execution Engine:** `synapse_ipc_server.py` + `ionpump_ipc.py` + `ionpump_executor.py` (yields SynapseCommand, NO envía) + `ionpump_manager.py` (envía via IPCClient) + modificación `SynapseManager`.

**Fase 3 — Intent Integration:** ⚠️ **DEFERRED** — el archivo `intent_executor.py` no está confirmado en el codebase. Explorar `brain/core/intent/` antes de implementar.

**Fase 4 — Hot-Reload:** prerequisito: confirmar `watchdog` en `requirements.txt`. Implementar `IonRecipeWatcher`.

**Fase 5 — Admin Commands:** los 4 comandos CLI.

**Fase 6a — Metamorph Inspect:** implementable ahora.

**Fase 6b — Metamorph Reconcile:** ⛔ BLOCKED hasta que Bartcave esté desplegado.

**Fase 7 — Recipes adicionales:** `chatgpt.com`, `grok.com`, `perplexity.ai`.

---

## 9. Implementación — Cortex

### 9.1 manifest.json — agregar a web_accessible_resources

```json
{
  "web_accessible_resources": [
    {
      "resources": [
        "harness/index.html",
        "harness/harness.js",
        "harness.synapse.config.js",
        "discovery/ionpump_protocol.js"
      ],
      "matches": ["<all_urls>"]
    }
  ]
}
```

### 9.2 Reglas para Cortex — qué NO se hace

- NO modificar `discovery.js`
- NO modificar `discoveryProtocol.js` excepto agregar el manifest al final
- NO modificar `content.js`
- NO modificar `background.js` (excepto el fix de URL pendiente)
- NO abrir un segundo `chrome.runtime.connectNative()` en el Harness
- NO agregar lógica de negocio al Harness

### 9.3 HARNESS_HELLO / HARNESS_REPLAY / HARNESS_LOG — canal de broadcast (no documentado en versiones anteriores)

> Este mecanismo existe y funciona en `harness/harness.js` (líneas ~510-571). Ninguna versión anterior de este documento lo menciona, incluyendo el manual de Jun 6 que esta consolidación usó como fuente primaria. Resuelve directamente la pregunta abierta histórica *"¿el Log del Harness puede extenderse para capturar mensajes broadcast de background.js?"* — la respuesta es que ya está resuelto, no es trabajo pendiente.

El flujo Simulate → Send → ACK (§4.2, panel central) solo captura la respuesta directa a un mensaje que el propio Harness disparó. Es un canal punto a punto. `HARNESS_HELLO` es un canal aparte, de broadcast, que corre en paralelo:

1. **Al bootear**, antes de terminar `Harness.init()`, el Harness manda `chrome.runtime.sendMessage({event: 'HARNESS_HELLO'})`.
2. Si `background.js` todavía no está listo (el service worker puede seguir procesando `host_ready` y abriendo tabs cuando el Harness ya disparó `DOMContentLoaded`), el `sendMessage` falla con `"Could not establish connection"` aunque el handler exista del lado de background — es una condición de timing de boot, no un error real. El Harness reintenta con backoff: `[0, 200, 500, 1000]` ms, hasta 4 intentos, y si todos fallan asume modo standalone sin loggear error.
3. Si `background.js` responde, lo hace con `{event: 'HARNESS_REPLAY', entries: [...]}` — un buffer de todo lo que pasó **antes** de que esta pestaña del Harness existiera. Sin este replay, cualquier evento emitido entre el boot del sistema y la apertura del Harness se perdería para siempre, porque el Harness no estaba escuchando todavía.
4. Después del hello/replay inicial, el Harness queda con un listener activo (`chrome.runtime.onMessage`) para mensajes `{event: 'HARNESS_LOG', category, sourceEvent, data}` — un broadcast genérico que `background.js` emite hacia cualquier observador, no solo como respuesta a algo que el Harness despachó. Cada uno se renderea en el Log con nivel `INFO` o `ERROR` según `data._level`.

**Implicación arquitectónica:** el comentario en el código fuente dice textualmente que esto *"cierra el punto ciego de Native Messaging / runtime — el Cortex Harness ahora ve el mismo feed que el Workspace Harness"*. Esto confirma la existencia de un **Workspace Harness** (lado VSCode/Electron) que comparte el mismo feed de `HARNESS_LOG` — una pieza del sistema que no aparece documentada en ningún archivo de este repositorio. Queda como pregunta abierta nueva (ver §18).

**Consecuencia práctica para el §12.2 (Caso A — Observar el flujo real):** la limitación documentada ahí — *"el Harness actualmente solo registra mensajes que `chrome.runtime.onMessage` entrega a su propio listener... mensajes que `background.js` consume internamente sin broadcast pueden no aparecer"* — ya no aplica tal como está escrita. Si `background.js` emite `HARNESS_LOG` para un evento, el Harness lo va a ver aunque no haya sido el origen del mensaje. La limitación real pasó a ser más angosta: solo quedan invisibles los eventos que `background.js` **ni siquiera reporta como `HARNESS_LOG`** — que es una decisión de instrumentación del lado de background, no un límite de MV3.

### 9.4 Gap real entre `onboarding.js` (VSCode) y `routeToStep()` (Discovery) — no es deuda documental, es código

> Esto no es un caso de "la documentación está desactualizada" — es una discrepancia real entre dos componentes implementados que deberían estar sincronizados y no lo están.

`onboarding.js` (el stepper de VSCode, contexto Electron — corre en un Webview sin `chrome.runtime`, se comunica con Brain vía `window.onboarding.*` IPC preload, y no puede interactuar directamente con el Harness ni con `discovery.js`) define una secuencia de 8 screens (`SCREEN_IDS`) que mapea 1:1 contra los steps de `onboarding_steps.json`:

```
entry → github_auth → nucleus_create → vault_init → google_auth → ai_provider_setup → project_create → launch
```

Para tres de esos steps, `onboarding.js` llama explícitamente a `window.onboarding.navigate({step: ...})`, que viaja por IPC → Brain → TCP → `bloom-host` → Native Messaging → `background.js` → `chrome.runtime.onMessage` en `discovery.js`, donde el listener de `onboarding_navigate` (línea 670 de `discovery.js`) llama a `window.BLOOM_VALIDATOR.routeToStep(msg.payload.step)`:

| Step pedido desde VSCode | Dónde se llama en `onboarding.js` |
|---|---|
| `vault_init` | `runNucleusTerminal()`, tras completar `nucleus init` |
| `google_auth` | `handleGoogleBtn()` |
| `ai_provider_setup` | `handleProviderBtn()` |
| `project_create` | `createMandateAndContinue()` |

`routeToStep()` en `discovery.js` (línea 397) solo tiene cases para `github_auth` y `google_auth`. **`vault_init`, `ai_provider_setup` y `project_create` no tienen case** — caen al `default`, que llama a `routeToServiceFlow(this.serviceTarget)`, una función diseñada para el flujo de *primer arranque* (decidir entre Google o GitHub como service inicial), no para resolver un step específico del onboarding ya en curso. El resultado funcional: si Discovery recibe `onboarding_navigate` con cualquiera de esos tres steps, no muestra la screen correspondiente — reinterpreta el step como si fuera la selección de service inicial.

Esto también significa que el `step` enum del `DISCOVERY_PROTOCOL_MANIFEST` (§6.4) está incompleto en ambas direcciones: le faltan los tres steps de arriba para reflejar lo que `onboarding.js` realmente puede pedir, y al Harness lo que le falta es la capacidad de simular un `onboarding_navigate` hacia esos steps y ver que Discovery los maneja — porque hoy no los maneja.

**No confundir con un problema de IPC ni de Harness.** El camino IPC → background.js → discovery.js funciona; el corte está puntualmente en el `switch` de `routeToStep()`. Pendiente de implementación, no de documentación (consistente con el checklist §15 — Cortex, ítem *"completar `routeToStep()`"*, que en esta versión sigue sin marcar).

### 9.5 Secuencia de boot real de `harness/harness.js` (verificado contra fuente)

```javascript
document.addEventListener('DOMContentLoaded', async () => {
  // --- Siempre presentes desde seed --dev ---
  await loadScriptOptional('../harness.synapse.config.js');
  await loadScriptOptional('../discovery.synapse.config.js');
  await loadScriptOptional('../discovery/discoveryProtocol.js');
  await loadScriptOptional('ionpump_protocol.js');

  // --- Solo existen post-onboarding ---
  await loadScriptOptional('../landing.synapse.config.js');
  await loadScriptOptional('../landing/landingProtocol.js');

  // Todos los scripts que van a llegar, llegaron. Arrancar.
  Harness.init();
});
```

`loadScriptOptional()` no usa simplemente `<script>` con `onerror` — primero hace un `fetch(url, {method: 'HEAD'})` para confirmar que el archivo existe antes de inyectar el tag. Esto evita que DevTools muestre errores de red 404 para los archivos que legítimamente no existen todavía (los de Landing, antes del onboarding). Si el `HEAD` falla o el `<script>` falla al cargar, la promesa igual resuelve — nunca rechaza — por lo que el boot del Harness nunca se cuelga esperando un archivo ausente.

`Harness.init()` corre recién después de que los 6 `loadScriptOptional` resolvieron (no necesariamente cargaron — resolvieron). Esto significa que el orden de aparición en `ProtocolReader.discover()` (`DISCOVERY_PROTOCOL_MANIFEST`, `LANDING_PROTOCOL_MANIFEST`, `IONPUMP_PROTOCOL_MANIFEST` — ver candidates array en `harness.js`) es independiente del orden de boot; el discover barre los tres globals en `self`/`window` después de que terminó toda la carga, más una segunda pasada 500ms después para scripts que llegaron tarde (`§4.2` ya documenta esta segunda pasada como "late discovery").

---

## 10. Implementación — Sentinel

### 10.1 seed.go — único cambio: flag --dev

```go
// Agregar flag --dev al comando seed
cmd.Flags().BoolVar(&devMode, "dev", false, "Enable dev mode: deploys Harness UI to extension")

// Pasar a brain profile create
args := []string{"--json", "profile", "create", alias}
if isMaster { args = append(args, "--master") }
if devMode  { args = append(args, "--dev") }
```

Eso es **todo** el cambio en Sentinel para seed. Brain hace el resto.

### 10.2 ignition_identity.go — writeHarnessConfig en launch

```go
func writeHarnessConfig(profileID, launchID, profileAlias, extensionDir string) error {
    // No-op si harness/index.html no existe (garantiza que solo corre en perfiles --dev)
    harnessPage := filepath.Join(extensionDir, "harness", "index.html")
    if _, err := os.Stat(harnessPage); os.IsNotExist(err) {
        return nil
    }

    config := fmt.Sprintf(`// harness.synapse.config.js — generado por Sentinel en launch
self.HARNESS_CONFIG = {
  profileId: %q,
  launchId:  %q,
  profileAlias: %q,
  generatedAt: %q
};`,
        profileID, launchID, profileAlias,
        time.Now().UTC().Format(time.RFC3339),
    )

    configPath := filepath.Join(extensionDir, "harness.synapse.config.js")
    return os.WriteFile(configPath, []byte(config), 0644)
}
```

Llamarlo en `prepareSessionFiles()`:
```go
// No fatal — el harness simplemente no tendrá config
if err := writeHarnessConfig(profileID, launchID, profileAlias, extDir); err != nil {
    c.Logger.Warning("[LAUNCH] Could not write harness config: %v", err)
}
```

### 10.3 Lo que Sentinel NO hace

- NO implementa `copyHarnessPage()` en seed — eso lo hace Brain/`harness_generator.py`
- NO implementa `copyIonPumpProtocol()` en seed — eso lo hace Brain/`discovery_generator.py`
- NO escribe en `extensionDir` después de llamar a `brain profile create`

---

## 11. Implementación — Metamorph

### 11.1 Alcance para milestone GitHub

Para el milestone GitHub Onboarding, Metamorph necesita solo `metamorph inspect --ion-recipes`. El ciclo completo de reconciliación (download + swap atómico) puede implementarse después.

### 11.2 Estructura de archivos

```
installer/metamorph/internal/inspection/
├── types.go       ← agregar IonRecipeInfo, IonRecipesResult
├── inspect.go     ← agregar flag --ion-recipes
└── ionrecipes.go  ← NUEVO
```

### 11.3 Data structures (types.go)

```go
type IonRecipeInfo struct {
    Site         string   `json:"site"`
    Version      string   `json:"version"`
    Description  string   `json:"description"`
    Entrypoint   string   `json:"entrypoint"`
    FlowCount    int      `json:"flow_count"`
    Capabilities []string `json:"capabilities"`
    SizeBytes    int64    `json:"size_bytes"`
    LastModified string   `json:"last_modified"`
    Status       string   `json:"status"`    // "healthy", "missing", "corrupted"
    ManifestHash string   `json:"manifest_hash"`
}

type IonRecipesResult struct {
    Recipes    []IonRecipeInfo `json:"recipes"`
    BasePath   string          `json:"base_path"`
    TotalSites int             `json:"total_sites"`
    TotalFlows int             `json:"total_flows"`
    Timestamp  string          `json:"timestamp"`
}
```

### 11.4 Output esperado

```bash
metamorph inspect --ion-recipes
```
```
Ion Automation Recipes
Base: BloomNucleus/bin/cortex/ionsites
──────────────────────────────────────────────────────────────────────
github.com           v1.0.0      3 flows     4.2 KB  ✓ Healthy
claude.ai            v1.2.0      5 flows    12.1 KB  ✓ Healthy
──────────────────────────────────────────────────────────────────────
Total: 2 sites, 8 flows
```

### 11.5 Formato manifest para reconciliación (referencia futura)

```json
{
  "manifest_version": "1.1",
  "ion_recipes": [
    {
      "site": "github.com",
      "version": "1.1.0",
      "sha256_manifest": "def456...",
      "sha256_archive": "ghi789...",
      "download_url": "https://batcave.internal/recipes/github.com-1.1.0.tar.gz",
      "files": [
        { "path": "ion.manifest.json", "sha256": "..." },
        { "path": "auth.ion",          "sha256": "..." }
      ]
    }
  ]
}
```

**Proceso de reconciliación (⛔ BLOCKED hasta Bartcave):** inspect → compare versiones → download a staging → verify sha256 → swap atómico → IonPump watchdog recarga → rollback si falla.

### 11.6 Invariantes de Metamorph

Solo Metamorph escribe en `ionsites/`. El swap es atómico. Metamorph no ejecuta recipes. Metamorph no participa del Event Bus.

---

## 12. Uso operativo — cómo debuggear el flujo onboarding

### 12.1 Flujo de onboarding — pasos

```
welcome
  │
  ▼
github_auth          ← Estado actual del perfil de sesión activa
  │  El sistema abre https://github.com/login?return_to=.../tokens/new
  │  El usuario genera el PAT
  │  El clipboard monitor detecta el token
  │
  ▼  [evento: GITHUB_PAT_DETECTED]
github_confirm
  │  El usuario confirma que el token es el correcto
  │
  ▼  [evento: GITHUB_TOKEN_STORED]
api_key
  │  El sistema espera que el usuario genere/pegue la API key de Gemini
  │
  ▼  [evento: API_KEY_REGISTERED]
complete
  │
  ▼  [evento: DISCOVERY_COMPLETE]
→ Landing page activa
```

### 12.2 Caso A — Observar el flujo real

1. Verificar en **Config** que `launchId` coincide con la sesión activa.
2. Abrir la Discovery page en otra tab.
3. Interactuar con Discovery normalmente (generar PAT en GitHub, pegarlo, confirmar).
4. Cada evento que `background.js` procesa aparece en el **Log** del Harness.

**Nota (corregida — ver §9.3 para el detalle completo):** versiones anteriores de este documento decían que el Harness *"actualmente solo registra mensajes que `chrome.runtime.onMessage` entrega a su propio listener"* y que esto era *"un límite de la arquitectura MV3"*. Eso ya no es así: el canal `HARNESS_HELLO`/`HARNESS_REPLAY`/`HARNESS_LOG` (§9.3) hace que el Log capture también broadcasts de `background.js` que no fueron disparados por el propio Harness, incluyendo los emitidos antes de que la pestaña del Harness existiera (vía replay). Lo único que sigue sin aparecer es lo que `background.js` directamente no instrumenta como `HARNESS_LOG`.

### 12.3 Caso B — Simular un evento

1. En **Protocols**, click en el mensaje a simular (ej: `github_pat_detected`).
2. El panel central muestra el form con el campo `token` editable.
3. Ingresar un valor de test: `ghp_simulatedToken123456789`.
4. Click **Send**.
5. El Log muestra:
   ```
   [SEND]  → github_pat_detected [runtime] {"event":"GITHUB_PAT_DETECTED","token":"ghp_simulated..."}
   [ACK]   {"status": "ok"} | null
   ```
6. La Discovery page debería avanzar al paso `github_confirm`.

Si el ACK devuelve `null`: `background.js` recibió el mensaje pero no retornó respuesta — puede ser fire-and-forget o puede indicar que el handler no reconoció el evento.

### 12.4 Caso C — Simular el flujo completo

Secuencia de dispatches en orden, esperando ACK entre cada uno:

1. `onboarding_navigate` → step: `github_auth`
2. `github_pat_detected` → token: `ghp_test123`
3. `github_token_stored` → token_fingerprint: `ghp_...abc123`
4. `api_key_registered` → key_fingerprint: `sk-...xyz789`
5. `account_registered`
6. `discovery_complete`

### 12.5 Diagnóstico por síntoma

| Síntoma | Dónde mirar | Qué buscar |
|---|---|---|
| Harness no carga protocolos | Dev Tools del Harness → Console | Errores de carga de scripts, `[ProtocolReader] Loaded 0 protocol(s)` |
| Dispatch no tiene ACK | Dev Tools del Harness → Log | `ERR: chrome.runtime.lastError` |
| Discovery no avanza al siguiente paso | Dev Tools de `background.js` → Console | Handler del evento, errores de validación |
| Handshake no completa | Dev Tools de `background.js` → Console | `[HANDSHAKE]` logs, `host_ready` recibido o no |
| Token no se almacena | Dev Tools de `background.js` → Console | Logs de Chrome Storage, Vault operations |

**Para abrir Dev Tools de `background.js`:** `chrome://extensions` → Bloom Nucleus Bridge → **Inspect views: background page (service_worker)**

---

## 13. Estado actual del sistema

**Perfil activo de referencia:** MasterWorker · `d7d6d36b-300e-43db-bdf5-d6bfa40c2a12`  
**launchId de referencia:** `004_d7d6d36b_111324`  
**Objetivo pendiente:** completar flujo `github_auth` → `DISCOVERY_COMPLETE`

**Path base de archivos de extensión:**
```
~/Library/BloomNucleus/profiles/d7d6d36b-300e-43db-bdf5-d6bfa40c2a12/extension/
```

**URL del Harness:**
```
chrome-extension://hpblclepliicmihaplldignhjdggnkdh/harness/index.html
```

**El flag `--dev` en `sentinel seed`** sigue pendiente de implementación formal. Actualmente el Harness se genera manualmente.

---

## 14. Estructura de archivos completa

### Archivos nuevos

```
brain/core/profile/web/
├── templates/harness/
│   └── index.html                    ← Harness UI (auto-contenido)
└── harness_generator.py

brain/core/ionpump/
├── ionpump_manager.py
├── ionpump_loader.py
├── ionpump_registry.py
├── ionpump_executor.py
├── ionpump_state.py
├── ionpump_models.py
├── ionpump_validator.py
└── ionpump_ipc.py

brain/core/synapse/
└── synapse_ipc_server.py

brain/commands/ionpump/
├── ionpump_inspect.py
├── ionpump_validate.py
├── ionpump_reload.py
└── ionpump_test.py

BloomNucleus/bin/cortex/ionsites/
├── github.com/
│   ├── ion.manifest.json
│   └── auth.ion
└── _meta/
    └── versions.json

installer/metamorph/internal/inspection/
└── ionrecipes.go
```

### Archivos modificados

```
brain/core/profile/web/templates/discovery/
├── discoveryProtocol.js    ← agrega DISCOVERY_PROTOCOL_MANIFEST al final
└── ionpump_protocol.js     ← NUEVO (copiado por discovery_generator junto con los otros assets)

brain/core/profile/web/
└── discovery_generator.py  ← agrega ionpump_protocol.js a files_to_copy

brain/core/profile/
└── profile_create.py       ← agrega llamada a generate_harness_page con dev_mode

brain/core/synapse/
└── synapse_manager.py      ← lanza SynapseIPCServer en thread, agrega handlers DOM

sentinel/internal/seed/
└── seed.go                 ← agrega flag --dev, lo pasa a brain profile create

sentinel/internal/ignition/
└── ignition_identity.go    ← agrega writeHarnessConfig() en prepareSessionFiles()

extension/
└── manifest.json           ← agrega harness/*, harness.synapse.config.js,
                               discovery/ionpump_protocol.js a web_accessible_resources

installer/metamorph/internal/inspection/
├── types.go                ← agrega IonRecipeInfo, IonRecipesResult
└── inspect.go              ← agrega flag --ion-recipes
```

### Archivos que NO se modifican

```
background.js
discovery/index.html
discovery/discovery.js
content.js
bloom-host.exe
SynapseServer (protocol layer)
landing/landingProtocol.js (LANDING_PROTOCOL_MANIFEST: no es requerido para milestone GitHub)
```

---

## 15. Checklist de implementación por componente

### Brain

- [ ] `ionpump_models.py` — dataclasses completas
- [ ] `ionpump_registry.py` — registro en memoria con invariantes
- [ ] `ionpump_loader.py` — `discover_all()` crea `ionsites/` si no existe (NO error)
- [ ] `ionpump_validator.py` — retorna `ValidationResult`, no lanza excepciones
- [ ] `ionpump_state.py` — state machine por `(tab_id, domain)`
- [ ] `ionpump_executor.py` — async generator, yield SynapseCommand objects, NO envía
- [ ] `ionpump_ipc.py` — cliente TCP, error claro si port file no existe
- [ ] `synapse_ipc_server.py` — solo 127.0.0.1, port file borrado en shutdown (try/finally)
- [ ] `ionpump_manager.py` — singleton, envía via IPCClient
- [ ] Modificar `SynapseManager` — lanza IPCServer en thread daemon, agrega handlers DOM sin tocar existentes
- [ ] `harness_generator.py` — no-op completo cuando `dev_mode=False`
- [ ] `harness_generator.py` — NO genera `harness.synapse.config.js`
- [ ] Modificar `profile_create.py` — pasar `dev_mode` a `_generate_profile_pages`
- [ ] Modificar `discovery_generator.py` — agregar `ionpump_protocol.js` a `files_to_copy`
- [ ] Los 4 comandos admin ionpump
- [ ] `ionpump_manager.py` es singleton — no se crean múltiples instancias
- [ ] El scan de manifests al arrancar no bloquea el start de Brain

### Cortex

> Estado actualizado Jun 19 2026 contra código fuente real (`discoveryProtocol.js`, `discovery.js`, `harness.js`, `landingProtocol.js`, `ionpump_protocol.js`, `onboarding.js`). Ítems marcados `[x]` fueron leídos directamente del archivo, no inferidos. Ítems sin checkbox de archivo disponible quedan `[ ]` con nota — no se asume completo lo que no se pudo ver.

- [x] `DISCOVERY_PROTOCOL_MANIFEST` agregado al **final** de `discoveryProtocol.js` — confirmado, línea 269 en adelante, no toca el objeto `PROTOCOL` previo
- [x] Mensajes del milestone GitHub presentes en el manifest — son **8**, no 6 (ver §6.4 para la corrección completa, incluye `api_key_registered` y `handshake_confirmed` que no estaban listados antes)
- [ ] `ionpump_protocol.js` creado en `templates/discovery/` — el archivo de IonPump que sí se verificó vive junto a `harness/`, no se pudo confirmar si también existe una copia en `discovery/` como pide el generator (ver duda abierta histórica, sigue sin resolver)
- [ ] `manifest.json` actualizado — no fue provisto en esta ronda de archivos, no se puede confirmar ni objetar
- [ ] `harness/index.html` implementado con ProtocolReader y UI dinámica — `harness.js` (la lógica) está confirmado completo y operativo; el `index.html` del Harness en sí no fue provisto en esta ronda, no se puede confirmar el marcado/CSP
- [x] Boot del Harness es async con `loadScriptOptional()` — confirmado, incluye preflight `fetch HEAD` antes de inyectar el `<script>` (ver §9.5)
- [x] **Nuevo, no estaba en el checklist:** Landing (`landingProtocol.js` → `LANDING_PROTOCOL_MANIFEST`) implementado completo — 6 mensajes, mismo patrón append-only (ver §6.4b)
- [ ] **Nuevo, no estaba en el checklist:** `routeToStep()` en `discovery.js` cubre `vault_init`, `ai_provider_setup`, `project_create` — confirmado que NO los cubre; gap real de código, no documental (ver §9.4)
- [ ] Harness dispatcher diferencia `channel: "runtime"` vs `channel: "tabs"` — **este ítem ya no aplica tal como está escrito**: el canal `"tabs"` no existe en el `IONPUMP_PROTOCOL_MANIFEST` real, todo es `channel: "runtime"` (ver §6.5). O se implementa el canal `tabs` que esta entrada asume, o se reescribe el ítem para reflejar que no es parte del diseño actual.
- [x] Harness listener es pasivo — confirmado: el listener de `HARNESS_LOG`/`HARNESS_REPLAY` en `harness.js` solo loggea y renderiza, nunca devuelve una respuesta con lógica de negocio ni intercepta el mensaje antes de que otros listeners lo procesen
- [ ] No hay JS inline en `harness/index.html` (CSP MV3) — no se puede confirmar, el archivo no fue provisto

### Sentinel

- [ ] Flag `--dev` agregado al comando `seed` en `seed.go`
- [ ] `HandleSeed()` recibe y pasa `devMode` a `brain profile create`
- [ ] `writeHarnessConfig()` implementado en `ignition_identity.go` (en **launch**, no en seed)
- [ ] `writeHarnessConfig()` es no-op si `harness/index.html` no existe en extensionDir
- [ ] `prepareSessionFiles()` llama `writeHarnessConfig()` (no fatal si falla)
- [ ] NO existe `copyHarnessPage()` en seed.go
- [ ] NO existe `copyIonPumpProtocol()` en seed.go

### Metamorph

- [ ] `IonRecipeInfo` y `IonRecipesResult` en `types.go`
- [ ] `ionrecipes.go`: `InspectIonRecipe`, `InspectAllIonRecipes`
- [ ] Flag `--ion-recipes` en `inspect.go`
- [ ] `resolveIonSitesPath()` usando misma lógica que para binarios
- [ ] `metamorph inspect --ion-recipes` devuelve 0 recipes (no error) si `ionsites/` está vacío
- [ ] JSON output incluye `ion_recipes` cuando se usa `--ion-recipes`
- [ ] Reconciliación marcada como Fase siguiente (⛔ BLOCKED hasta Bartcave)

---

## 16. Restricciones absolutas

### Harness

1. El Harness NO define contratos de mensajes. Los lee.
2. El Harness NO abre `chrome.runtime.connectNative()`.
3. El Harness NO habla directamente con bloom-host.
4. El Harness NO existe en prod. `harness_generator.py` es no-op cuando `dev_mode=False`.
5. El Harness NO modifica el estado de iones. Solo observa y simula.

### IonPump

6. IonPump NO es un módulo CLI de usuario. Es un runtime interno.
7. IonPump NO hace eager loading de recipes. Lazy only.
8. IonPump NO modifica el protocolo Synapse.
9. IonPump NO modifica `content.js`.
10. IonPump NO hace llamadas de red. Todos los recipes son locales.
11. IonPump NO escribe en `ionsites/`. Solo Metamorph escribe ahí.
12. IonPump NO llama directamente a `SynapseManager` — usa el IPC layer (TCP localhost).
13. NO existe `send_command()` en `SynapseManager` — IPC es el único canal para envíos proactivos.

### Manifests y arquitectura

14. Cada protocolo exporta su `*_PROTOCOL_MANIFEST` como adición al **final** del archivo existente. NO modifica la lógica existente.
15. Los IDs de mensajes en el manifest son únicos dentro del protocolo.
16. Los parámetros `type: "auto"` son invisibles al developer en el Harness.
17. `SynapseIPCServer` solo escucha en `127.0.0.1` — nunca en `0.0.0.0`.
18. Brain es el único escritor del `extensionDir`. Sentinel no toca `extensionDir` después de llamar a `brain profile create`.
19. `harness.synapse.config.js` se escribe en launch, no en seed.

---

## 17. Invariantes del sistema a preservar

1. **Un solo canal Native Messaging.** Solo `background.js` tiene `nativePort`. Nadie más.
2. **Un solo handshake.** `bloom-host` espera exactamente un `extension_ready` por launch.
3. **`background.js` es el router.** Todos los mensajes pasan por él. Nadie lo saltea.
4. **Synapse es el protocolo de transporte.** IonPump lo usa, no lo reemplaza.
5. **Cortex es stateless.** No guarda estado de iones. Solo ejecuta.
6. **Metamorph no participa del Event Bus.** Es invocado bajo demanda por Nucleus.
7. **IonPump executor no envía.** Solo genera `SynapseCommand` objects. `IonPumpManager` es quien llama a `IPCClient`.

---

## 18. Preguntas abiertas

| # | Pregunta | Estado | Blocking? |
|---|---|---|---|
| 1 | ¿El archivo `intent_executor.py` existe en `brain/core/intent/`? Confirmar antes de Fase 3. | Abierta | Fase 3 |
| 2 | ¿`watchdog` library está ya en `requirements.txt` de Brain? | Abierta | Fase 4 |
| 3 | ¿`LANDING_PROTOCOL_MANIFEST` se requiere para milestone GitHub? | **Resuelta Jun 19 2026** — no es que se requiera, ya existe implementado y completo (6 mensajes, ver §6.4b). No es trabajo pendiente, es estado actual. | No |
| 4 | ¿Qué versión mínima de Cortex requiere el ion de `github.com`? | Abierta | Semana 2 |
| 5 | Bartcave — ¿cuándo estará desplegado para desbloquear Fase 6b (reconcile)? | Abierta | Fase 6b |
| 6 | **Nueva.** ¿Qué es el "Workspace Harness" que menciona el comentario de `harness.js` (§9.3) como receptor del mismo feed `HARNESS_LOG`? ¿Vive del lado VSCode/Electron? ¿Comparte código con el Harness de Cortex o es una implementación paralela? | Abierta | No bloqueante, pero afecta el diseño de cualquier cambio al formato de `HARNESS_LOG` — si hay un segundo consumidor, cambiar el shape del mensaje rompe a los dos. |
| 7 | **Nueva.** ¿El canal `"tabs"` (principio de diseño §2, tabla §6.3) sigue siendo un objetivo de roadmap para IonPump, o quedó descartado en favor de pasar `tab_id` como parámetro string dentro de mensajes `"runtime"` (que es lo que el código real hace hoy)? Afecta si hay que implementar `channel: "tabs"` o reescribir el principio de diseño. | Abierta | Bloquea poder marcar el ítem de checklist correspondiente (§15, Cortex) en cualquier dirección. |
| 8 | **Nueva.** ¿`routeToStep()` en `discovery.js` (§9.4) tiene un owner/timeline para agregar los cases de `vault_init`, `ai_provider_setup`, `project_create`? Sin esos cases, el onboarding completo vía VSCode (steps 3, 5 y 6 de `SCREEN_IDS`) no puede probarse end-to-end ni con el sistema real ni simulando desde el Harness. | Abierta | Sí — bloquea poder usar el Harness para validar el onboarding completo, no solo `github_auth`. |

---

*Documento consolidado — Junio 2026*  
*Fuente primaria: estado operativo de sesión Jun 6 (`HARNESS_Manual_Onboarding_Debug.md`)*  
*Correcciones arquitectónicas: `IMPL_PROMPT_CORTEX_SENTINEL_Harness_v2.md` + `IMPL_PROMPT_BRAIN_IonPump_Harness_v2.md` (Abr 25)*  
*Los documentos anteriores en `/docs/HARNESS/` pueden archivarse.*

---

## 19. Adenda — verificación contra código fuente real (Jun 19 2026)

Esta sección documenta el proceso de la revisión que generó las correcciones de este documento, para que quien retome el trabajo sepa qué se verificó y contra qué.

**Archivos fuente leídos directamente para esta adenda:**
`discoveryProtocol.js`, `discovery.js` (completo, 1166 líneas), `onboarding.js` (completo, 438 líneas), `harness.js` (completo, 731 líneas), `landingProtocol.js`, `landing.js`, `ionpump_protocol.js`, `discovery/index.html`, `landing/index.html`.

**No se pudo verificar en esta ronda** (no provistos): `harness/index.html`, `manifest.json`, `background.js`, `bloom-host`, cualquier archivo de Brain (`harness_generator.py`, `discovery_generator.py`, `synapse_manager.py`), `seed.go`, `ignition_identity.go`. Todo lo que este documento afirma sobre esos archivos sigue siendo lo heredado de versiones anteriores — **no re-verificado**, no asumir que está confirmado solo porque aparece en este documento.

**Resumen de hallazgos:**

1. Landing (`landingProtocol.js` → `LANDING_PROTOCOL_MANIFEST`) está completo e implementado — las versiones previas de este documento lo trataban como pendiente o fuera de alcance. Corregido en §1 y §6.4b.
2. `DISCOVERY_PROTOCOL_MANIFEST` real tiene 8 mensajes, no 6 — el manifest documentado en versiones previas no coincidía con el archivo fuente. Corregido en §6.4.
3. `IONPUMP_PROTOCOL_MANIFEST` real no tiene canal `"tabs"` ni array `tab_messages` — la estructura documentada en versiones previas no existe en el código. Corregido en §6.5, abierto como pregunta #7 en §18.
4. Existe un mecanismo `HARNESS_HELLO`/`HARNESS_REPLAY`/`HARNESS_LOG` en `harness.js` que resuelve la pregunta histórica sobre captura de broadcasts — no documentado en ninguna versión anterior. Nuevo §9.3. Revela la existencia de un "Workspace Harness" no documentado en ningún archivo — pregunta #6 en §18.
5. Gap de código real (no documental) entre `onboarding.js` (VSCode) y `routeToStep()` en `discovery.js`: tres steps (`vault_init`, `ai_provider_setup`, `project_create`) que el lado VSCode pide navegar no tienen case en Discovery. Nuevo §9.4, pregunta #8 en §18.
6. La nota de limitación en §12.2 sobre mensajes invisibles para el Harness por "límite de arquitectura MV3" ya no es precisa dado el mecanismo de §9.3 — corregida.
