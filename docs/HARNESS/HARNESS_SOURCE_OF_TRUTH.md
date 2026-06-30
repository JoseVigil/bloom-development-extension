# Bloom — Harness + IonPump: Fuente de Verdad
## Versión consolidada · Junio 2026 — revisión Jun 25 (auditoría completa contra código fuente)
### Supersede: todos los documentos del directorio `/docs/HARNESS/`

> **Jerarquía de fuentes para esta revisión:**
> 1. `background.js` — verificado Jun 25 2026 (1680 líneas)
> 2. `harness.js` — verificado Jun 25 2026 (746 líneas)
> 3. `discoveryProtocol.js` — verificado Jun 25 2026 (503 líneas)
> 4. `discovery.js` — verificado Jun 25 2026 (1310 líneas)
> 5. `landingProtocol.js` — verificado Jun 25 2026 (594 líneas)
> 6. `landing.js` — verificado Jun 25 2026
> 7. `HARNESS_SOURCE_OF_TRUTH.md` — revisión anterior Jun 19 2026 (secciones no re-verificadas)
>
> **No verificados en esta ronda** (no provistos): `harness/index.html`, `manifest.json`, `harnessProtocol.js`, `bloom-host`, archivos de Brain, `seed.go`, `ignition_identity.go`. Lo que este documento afirma sobre esos archivos proviene de la revisión Jun 19 o de revisiones anteriores.

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
9. [Implementación — Cortex (verificado Jun 25)](#9-implementación--cortex-verificado-jun-25)
10. [Implementación — Sentinel](#10-implementación--sentinel)
11. [Implementación — Metamorph](#11-implementación--metamorph)
12. [Uso operativo — cómo debuggear el flujo onboarding](#12-uso-operativo--cómo-debuggear-el-flujo-onboarding)
13. [Estado actual del sistema](#13-estado-actual-del-sistema)
14. [Estructura de archivos completa](#14-estructura-de-archivos-completa)
15. [Checklist de implementación por componente](#15-checklist-de-implementación-por-componente)
16. [Restricciones absolutas](#16-restricciones-absolutas)
17. [Invariantes del sistema a preservar](#17-invariantes-del-sistema-a-preservar)
18. [Preguntas abiertas](#18-preguntas-abiertas)
19. [Adenda — verificación Jun 19 2026](#19-adenda--verificación-jun-19-2026)
20. [Adenda — auditoría Jun 25 2026 (esta revisión)](#20-adenda--auditoría-jun-25-2026-esta-revisión)
21. [Adenda — Fase 5: migración a JSON schemas (Jun 26 2026)](#21-adenda--fase-5-migración-a-json-schemas-jun-26-2026)

---

---

## 1. Qué es el Harness y qué es IonPump

### Harness

El Harness es una **herramienta de observabilidad y simulación del protocolo Synapse**. Existe exclusivamente en builds dev — no se despliega en producción.

Sus dos roles son:
- **Observar** todos los mensajes `chrome.runtime` que fluyen entre la extensión, `background.js` y el host mientras el onboarding corre en Discovery.
- **Simular** eventos del protocolo para avanzar o testear pasos del flujo sin depender del sistema real (clipboard, GitHub, Brain) cuando algo no responde.

El Harness **no modifica el estado del sistema**. Despacha mensajes como si los hubiera enviado otro componente. `background.js` los recibe y los procesa exactamente igual.

Existe un segundo consumidor del feed `HARNESS_LOG`: el **Workspace Harness** (lado Electron/VSCode), que escucha el mismo formato de mensaje por WebSocket vía nucleus. Ver §18 pregunta #6.

### IonPump

IonPump es un **runtime de automatización web** que vive dentro de Brain. Ejecuta recetas de automatización por sitio (`.ion` files) que traducen flujos declarativos en comandos atómicos Synapse que se ejecutan en el browser via la extensión Cortex.

**IonPump no es un módulo CLI de usuario. Es un runtime interno invocado por IntentExecutor.**

### Las tres páginas que el Harness puede observar/simular

| Página | Cuándo corre | Manifest | Estado del manifest |
|---|---|---|---|
| **Discovery** (`discovery/index.html`) | Handshake inicial; si `register=true`, todo el onboarding | `DISCOVERY_PROTOCOL_MANIFEST` | Implementado — 8 mensajes (ver §6.4) |
| **Landing** (`landing/index.html`) | Post-onboarding, en cada uso normal del perfil | `LANDING_PROTOCOL_MANIFEST` | Implementado — 6 mensajes (ver §6.4b) |
| **Harness** (`harness/index.html`) | Solo en builds `--dev` | No tiene manifest propio | Lee los tres de arriba en runtime |

`harness.js` intenta cargar los tres protocolos en el boot usando `loadScriptOptional()`, que resuelve sin error si el archivo no existe todavía.

### Relación entre Harness e IonPump

Son problemas ortogonales que comparten infraestructura. La superficie compartida es que ambos necesitan que Cortex exponga manifests de protocolo legibles en runtime. IonPump define el `HARNESS_PROTOCOL_MANIFEST`. El Harness lo lee. Relación unidireccional: IonPump produce, Harness consume.

**La regla de oro:**
> La fuente de verdad es el protocolo. El Harness la lee. IonPump la alimenta. Nadie la duplica.

---

---

## 2. Principios de diseño no negociables

**El Harness no tiene protocolo propio.** Lee los protocolos existentes en runtime. Es un lector, no un duplicador.

**El manifest es el contrato.** Cada protocolo expone un `*_PROTOCOL_MANIFEST` autodescriptivo. El Harness genera UI desde ese manifest. Agregar features al protocolo actualiza el Harness automáticamente.

*(actualizado Jun 26 2026) — A partir de la Fase 1, los manifests viven en JSON schemas independientes en `extension/protocols/` en lugar de globals `self.*_PROTOCOL_MANIFEST` en archivos `*Protocol.js`. El Harness los carga via `ProtocolReader.discoverFromJSON()`. El principio es el mismo; el mecanismo de entrega cambió.*

**Los canales son tipos, no hardcoding.** El manifest diferencia mensajes de `runtime` y de `tabs`. El Harness selecciona el mecanismo de dispatch correcto según el tipo. *(Nota Jun 25 2026: en `harnessProtocol.js` el canal `"tabs"` todavía no aparece — los 10 mensajes existentes son todos `"runtime"`. Ver §6.5 y §18 pregunta #7.)*

**Dev/prod por construcción, no por flags.** El Harness existe en builds dev porque Brain lo genera en seed. No existe en prod porque Brain no lo genera.

**Re-seed como mecanismo de actualización.** Cambios en el Harness se aplican con un re-seed.

**Brain es el único escritor del `extensionDir`.** Sentinel orquesta el seed y pasa flags, pero no toca `extensionDir` después de llamar a `brain profile create`.

---

---

## 3. Mapa de responsabilidades por componente

| Componente | Rol en Harness/IonPump |
|---|---|
| **Brain** | Aloja `IonPumpManager` (runtime). Expone admin CLI. Genera `harness_generator.py` en seed. Es el único escritor del `extensionDir`. |
| **Sentinel** | Pasa flag `--dev` a `brain profile create` en seed. Escribe `harness.synapse.config.js` en launch (no en seed). No toca `extensionDir` después de llamar a Brain. |
| **Cortex** | Aloja `harness/index.html`. *(actualizado Jun 26 2026)* — Expone los protocolos como JSON schemas en `extension/protocols/` (`discovery.schema.json`, `landing.schema.json`, `harness.schema.json`), declarados en `web_accessible_resources`. *(transitorio)* — Los globals `self.*_PROTOCOL_MANIFEST` en archivos `*Protocol.js` siguen presentes como fallback durante la migración. El `content.js` ejecuta comandos DOM de IonPump. |
| **Metamorph** | Inspecciona y reconcilia `.ion` recipes en filesystem. Es el único escritor de `ionsites/`. No participa del runtime IonPump. |
| **background.js** | Router central. Único poseedor de `nativePort`. Implementa el buffer `harnessLogBuffer` (100 entradas), `forwardToDebugPanel()` (doble destino: POST nucleus + `chrome.runtime.sendMessage` Harness), y el handler `HARNESS_HELLO`/`HARNESS_REPLAY`. |

---

---

## 4. Arquitectura del Harness

### 4.1 Dónde vive

El Harness vive en Brain templates. Brain lo copia durante el seed.

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

En prod, `generate_harness_page()` es un no-op.

### 4.2 Los 3 paneles del Harness

```
┌─────────────────────────────────────────────────────────────────┐
│  🌱 Bloom Harness  [DEV]          MasterWorker  ● Connected     │  ← Top bar
├────────────────┬──────────────────────────────┬─────────────────┤
│                │                              │  [Log] [Config] │
│  PROTOCOLS     │  SIMULATE                    │                 │
│  ▼ discovery   │  Seleccioná un mensaje       │  Log en tiempo  │
│    8 mensajes  │  del panel izquierdo         │  real           │
│  ▼ landing     │  para ver el form            │                 │
│    6 mensajes  │  y despacharlo               │  Config raw     │
│  ▼ ionpump     │                              │  (profileId,    │
│    10 mensajes │                              │   launchId)     │
└────────────────┴──────────────────────────────┴─────────────────┘
```

> **Corrección Jun 25:** el panel izquierdo puede mostrar **tres** secciones (discovery, landing, ionpump) cuando landing está disponible post-onboarding. Las versiones anteriores solo listaban discovery e ionpump.

**Panel izquierdo — Protocols:** `ProtocolReader` escanea `self.*` buscando los tres globals. Cada protocolo es una sección colapsable. Click en un mensaje lo carga en Simulate.

**Panel central — Simulate:** campos editables para parámetros `string`/`enum`, preview JSON en tiempo real, botón **Send** que despacha via `chrome.runtime.sendMessage`. Parámetros `type: "auto"` se resuelven desde `HARNESS_CONFIG`/`SYNAPSE_CONFIG` — no son editables.

**Panel derecho — Log / Config:** stream de `INFO`, `SEND`, `ACK`, `ERR`. Tab Config: muestra estado de `HARNESS_CONFIG` y `SYNAPSE_CONFIG`.

### 4.3 Cómo abrir el Harness

```
chrome-extension://<ID>/harness/index.html
```

**Prerrequisitos:**
1. La extensión está cargada en modo developer en `chrome://extensions`
2. `bloom-host` está corriendo (`HANDSHAKE COMPLETADO` en logs de `background.js`)
3. El perfil fue creado con `sentinel seed --dev`
4. Al menos un launch fue ejecutado (para que `harness.synapse.config.js` exista)

Dev Tools del Harness: `chrome://extensions` → Bloom Nucleus Bridge → **Inspect views** → `harness/index.html`

### 4.4 ProtocolReader — implementación real (verificado Jun 25)

`ProtocolReader` es un objeto literal (no una clase) en `harness.js`:

```javascript
const ProtocolReader = {
  manifests: [],
  discover() {
    const candidates = [
      'DISCOVERY_PROTOCOL_MANIFEST',
      'LANDING_PROTOCOL_MANIFEST',
      'HARNESS_PROTOCOL_MANIFEST',
    ];
    this.manifests = [];
    for (const key of candidates) {
      const manifest = (typeof self !== 'undefined' && self[key])
                    || (typeof window !== 'undefined' && window[key]);
      if (manifest) {
        this.manifests.push({ key, manifest });
      }
    }
    return this.manifests;
  },
  render() { /* genera el panel izquierdo dinámicamente */ }
};
```

> **Corrección respecto a versiones anteriores:** la versión anterior del documento mostraba `ProtocolReader` como una clase con método `loadAll()`. El código real usa un objeto literal con método `discover()`. El resultado funcional es el mismo.

### 4.4b ProtocolReader.discoverFromJSON() — nuevo estándar (Fase 1–5)
*(actualizado Jun 26 2026)*

El método principal de carga de protocolos en el nuevo estándar:

```javascript
async discoverFromJSON() {
  const SCHEMA_FILES = [
    { file: 'protocols/discovery.schema.json', key: 'DISCOVERY_PROTOCOL_MANIFEST' },
    { file: 'protocols/landing.schema.json',   key: 'LANDING_PROTOCOL_MANIFEST'   },
    { file: 'protocols/harness.schema.json',   key: 'HARNESS_PROTOCOL_MANIFEST'   },
  ];
  const results = await Promise.allSettled(
    SCHEMA_FILES.map(async ({ file, key }) => {
      const url = chrome.runtime.getURL(file);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${file}`);
      const schema = await res.json();
      this.manifests.push({ key, manifest: schema });
    })
  );
}
```

Los archivos están declarados en `web_accessible_resources` en `manifest.json` (ver §9.7). `ProtocolReader.discover()` (§4.4) sigue activo como fallback transitorio mientras los `*Protocol.js` legacy no sean eliminados.

### 4.5 Dispatcher

`Simulator.send()` en `harness.js` despacha via `chrome.runtime.sendMessage(payload)`. El canal `"tabs"` no está implementado en ningún manifest activo (todos los mensajes actuales son `"runtime"`).

### 4.6 HARNESS_HELLO / HARNESS_REPLAY — mecanismo de buffer (verificado Jun 25)

`background.js` implementa un buffer circular de 100 entradas (`harnessLogBuffer`). Cuando el Harness abre y manda `HARNESS_HELLO`, `background.js` responde con todo lo acumulado:

```javascript
// En background.js — handler de chrome.runtime.onMessage:
if (event === 'HARNESS_HELLO') {
  sendResp({ event: 'HARNESS_REPLAY', entries: harnessLogBuffer.slice() });
  return true;
}
```

Esto resuelve la condición de carrera: `HANDSHAKE_CONFIRMED`, `EXTENSION_LOADED` y otros eventos críticos se emiten antes de que `openHarnessTab()` haya terminado de cargar. Sin buffer, el Harness los perdería.

### 4.7 forwardToDebugPanel — doble destino (verificado Jun 25)

`forwardToDebugPanel(category, event, data, profile_id)` en `background.js` tiene **dos destinos simultáneos**:

1. **POST** `http://localhost:48215/api/internal/system-event` → nucleus Control Plane → Workspace Harness
2. **`chrome.runtime.sendMessage(harnessMsg)`** → Cortex Harness tab

Ambos son fire-and-forget. El mensaje también se guarda en `harnessLogBuffer` independientemente de si alguien está escuchando.

Tokens y keys son sanitizados antes de enviarse (primeros 10 caracteres + `…`). Keepalive y HEARTBEAT son excluidos del log.

### 4.8 Apertura automática del Harness tab (verificado Jun 25)

```javascript
// En background.js — handler de host_ready:
if (config?.harness) {
  openHarnessTab();   // solo si harness/index.html existe (config.harness != null)
}
if (config?.mode === 'discovery') {
  openDiscoveryTab(); // abre/recarga discovery tab
}
```

La apertura del Harness ocurre en **FASE 2 del handshake** (`host_ready` recibido), no en el boot del SW. Esto garantiza que el canal Native Messaging ya está establecido cuando el Harness abre.

---

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

---

## 6. Manifests de protocolo — contratos autodescriptivos

> *(actualizado Jun 26 2026)* — A partir de la Fase 1–5, los manifests de protocolo viven en `extension/protocols/*.schema.json` y son la única fuente autorizada de estructura, defaults y metadata de mensajes. Los globals `self.*_PROTOCOL_MANIFEST` documentados en §6.1–§6.5 siguen siendo válidos como descripción del contrato de mensajes, pero su mecanismo de entrega cambió: ya no viven en archivos `*Protocol.js` sino en JSON schemas cargados via `chrome.runtime.getURL()` + `fetch()`. Ver ARCHITECTURE_HarnessProtocol.md para la especificación completa del formato JSON schema y el wrapper `registerHandler` en background.js.

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

> **Corrección respecto a versiones anteriores de este documento:** el manifest listado antes acá no coincide con el código real en `discoveryProtocol.js`. El real tiene **8 mensajes**, no 6 — incluye `api_key_registered` y `handshake_confirmed`. `host_ready` es un `event`, no un `command`. El bloque de abajo es transcripción literal del archivo fuente.
>
> **Verificado Jun 25 2026:** el enum de `onboarding_navigate` fue actualizado. Las opciones reales son `["github_auth", "nucleus_create", "vault_init", "google_auth", "ai_provider_setup", "project_create", "success"]` — no las opciones legacy `["welcome", "github_auth", "github_confirm", "api_key", "complete"]` que aparecían en revisiones anteriores.

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
          options: ["github_auth", "nucleus_create", "vault_init", "google_auth", "ai_provider_setup", "project_create", "success"] }
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

> Las versiones anteriores de este documento trataban a Landing como pendiente o fuera de alcance. Es incorrecto: `landingProtocol.js` ya tiene el manifest completo, agregado al final del archivo con el mismo patrón append-only que Discovery e IonPump. Los `observable_events` son 7 entradas (no 4 como listaba la revisión Jun 19) — se agregan `GITHUB_TOKEN_STORED`, `GITHUB_ACCOUNT_CREATED` y `ACCOUNT_REGISTERED`.

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

  observable_events: ["SESSION_STATUS", "STATS_UPDATE", "PROFILE_LOADED", "HEALTH_CHECK_RESULT", "GITHUB_TOKEN_STORED", "GITHUB_ACCOUNT_CREATED", "ACCOUNT_REGISTERED"]
};
```

Landing solo aparece en el Harness cuando `landing/landingProtocol.js` existe en el `extensionDir` — es decir, post-onboarding. `harness.js` lo intenta cargar al final de su secuencia de boot (§10.5) y no falla si no está.

### 6.5 HARNESS_PROTOCOL_MANIFEST — estructura real (verificado contra fuente, Jun 19 2026)

> **Corrección respecto a versiones anteriores de este documento:** la estructura documentada acá antes (un array `messages` con `site_ready`/`response_ready` por `chrome.runtime.sendMessage`, más un array separado `tab_messages` con `dom_focus`/`dom_type` por `chrome.tabs.sendMessage`) **no existe en el código real**. El archivo fuente (`harnessProtocol.js`) usa un único array `messages` con **10 comandos**, todos `channel: "runtime"` — no hay segundo array `tab_messages` ni canal `"tabs"` implementado. Si la intención original (background → content vía `chrome.tabs.sendMessage`) sigue siendo válida, todavía no está en el manifest; lo que el Harness puede simular hoy son comandos DOM dirigidos por `tab_id` como parámetro de texto, no por canal de tabs real.

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
self.HARNESS_PROTOCOL_MANIFEST = {
  version: "1.0.0",
  protocol: "harness",
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
- **HARNESS_PROTOCOL_MANIFEST:** agregar `perplexity.ai` al campo `options` de los parámetros `site`.
- **El Harness no se toca.** ProtocolReader refleja el cambio automáticamente en runtime.

---

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
  │           └── discovery_generator.py: copia discoveryProtocol.js, harnessProtocol.js
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
│   ├── harnessProtocol.js           ← NUEVO (copiado por Brain/discovery_generator)
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

### 8.6 harnessProtocol.js — ubicación correcta

El archivo vive en `brain/core/profile/web/templates/discovery/harnessProtocol.js` y es copiado por `discovery_generator.py` junto con los demás assets estáticos. Sentinel no interviene.

Agregar a la lista `files_to_copy` en `discovery_generator.py`:
```python
files_to_copy = [
    "index.html", "discovery.js", "script.js", "discoveryProtocol.js",
    "harnessProtocol.js",  # ← NUEVO
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

---

## 9. Implementación — Cortex (verificado Jun 25)

### 9.1 background.js — estructura general (verificado Jun 25)

`background.js` tiene 1680 líneas. Las secciones relevantes para Harness/IonPump:

- **Líneas 33–89:** `DEBUG_API_URL`, `harnessLogBuffer`, `pushHarnessLog()`, `forwardToDebugPanel()` — doble destino
- **Líneas 357–411:** `loadHarnessConfig()` — carga `harness.synapse.config.js`, activo siempre (no requiere `--dev`)
- **Líneas 413–431:** `openHarnessTab()` — busca tab existente o crea nueva
- **Líneas 433–454:** `openDiscoveryTab()` — abre/recarga discovery tab en `host_ready`
- **Líneas 617–685:** `handleHostMessage()` → rama `host_ready` → handshake FASE 2 y 3, apertura Harness y Discovery tabs, escritura de `synapseStatus` en storage
- **Líneas 969–979:** handler `HARNESS_HELLO` → `HARNESS_REPLAY`
- **Líneas 1127–1138:** handler `DISCOVERY_COMPLETE` / `discovery_complete`
- **Líneas 1141–1183:** handler `ACCOUNT_REGISTERED` — emite ACCOUNT_REGISTERED al host Y GITHUB_TOKEN_STORED internamente
- **Líneas 1187–1210:** handler `GITHUB_PAT_DETECTED`
- **Líneas 1216–1234:** handler `GITHUB_TOKEN_STORED` (standalone, para Harness y otros callers)
- **Líneas 1317–1366:** handlers IonPump: `ION_EXECUTE_FLOW`, `ION_RELOAD`, `ION_INSPECT`

*(actualizado Jun 26 2026) — Infraestructura de schemas (Fase 1–5):*
- **`REGISTERED_HANDLERS`** — registro de handlers por nombre de evento
- **`registerHandler(eventName, schema, handlerFn)`** — wrapper que desacopla schema de lógica de negocio. El handler recibe el mensaje con defaults del schema ya aplicados.
- **`applySchemaDefaults(msg, schema)`** — aplica los `default` del JSON schema al mensaje antes de pasarlo al handler. No muta el mensaje original.
- **`loadProtocolSchemas()`** — carga `protocols/*.schema.json` via fetch al boot y registra los handlers de onboarding.

El bloque `self.SYNAPSE_DEBUG` fue eliminado en la Fase 5.

### 9.2 Handshake de 3 fases (verificado Jun 25)

```
FASE 1: Extension → Host
  background.js conecta nativePort, envía extension_ready

FASE 2: Host → Extension
  msg.command === 'host_ready' || msg.event === 'host_ready'
  → handshakeState = 'HOST_READY'
  → escribe synapseStatus:{command:'system_ready'} en storage
  → forwardToDebugPanel('synapse', 'HANDSHAKE_CONFIRMED', ...)
  → openHarnessTab() si config.harness existe
  → openDiscoveryTab() si config.mode === 'discovery'

FASE 3: Extension → Host
  nativePort.postMessage({command:"handshake_confirm", ...})
  → handshakeState = 'CONFIRMED'
  → chrome.runtime.sendMessage({event:'HANDSHAKE_CONFIRMED'})
```

### 9.3 discovery.js — flujo real (verificado Jun 25)

`DiscoveryFlow.start()`:
1. `loadSynapseConfig()` — lee `chrome.storage.local.synapseConfig`; prioriza `launch_flags` sobre raíz (legacy)
2. Lee `synapseStatus` de storage — si ya es `system_ready`, resuelve inmediatamente
3. `setupStorageListener()` — escucha cambios en `synapseStatus`
4. `startPinging()` — `check_handshake_status` cada 1s, hasta 60 intentos
5. `handleSystemReady()` → `transitionToSuccess()` → branch `requiresRegistration`:
   - `true` → `transitionToOnboarding()` → `routeToStep(stepCurrent)` o `routeToServiceFlow(serviceTarget)`
   - `false` → `autoCloseDiscovery()` — countdown 5s + `window.close()`

`routeToStep()` implementado con todos los cases (verificado Jun 25):
- `github_auth` → `showScreen('github-login')` + `new GithubAuthFlow(this).init()`
- `google_auth` → `showScreen('google-login')`
- `nucleus_create` → sin UI; espera siguiente step del host
- `vault_init` → `showScreen('vault-created')` + `_populateVaultReceipt()`
- `ai_provider_setup` → `showScreen('provider-select')`
- `project_create` → sin UI; espera siguiente step del host
- `success` → `_markOnboardingComplete()` + `showScreen('onboarding-success')`

> **Corrección respecto a revisiones anteriores:** los cases `vault_init`, `ai_provider_setup` y `project_create` están **implementados** en `routeToStep()`. La nota del §9.4 de la revisión Jun 19 que los marcaba como faltantes está desactualizada. Cerrado: pregunta #8 de §18 puede marcarse resuelta.

`OnboardingFlow.setupListeners()` instala el listener de `onboarding_navigate`:
```javascript
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.command === 'onboarding_navigate' && msg.payload?.step) {
    window.BLOOM_VALIDATOR?.routeToStep?.(msg.payload.step);
  }
});
```

### 9.4 GithubAuthFlow — flujo real (verificado Jun 25)

1. Botón "Abrir GitHub" → abre `github.com/settings/tokens/new?scopes=repo,read:org` + `startClipboardMonitoring` + `showWaitingState`
2. `chrome.runtime.onMessage` → `GITHUB_PAT_DETECTED` → `_handleTokenDetected(token)` → `showScreen('github-confirm')` + popup con preview/fingerprint
3. Botón "Confirmar" → `_saveToken(token)`:
   - Guarda en `bloom_vault_temp`
   - Consulta `api.github.com/user` para username (best-effort)
   - Calcula SHA-256 prefix (8 chars) como fingerprint
   - `_updateVaultState(fingerprint)` + `_updateAccountState('github', username)` en `bloom_profile_state`
   - Emite `ACCOUNT_REGISTERED` (service:'github', username, token_fingerprint)
   - `showScreen('github-stored')`

`background.js` handler de `ACCOUNT_REGISTERED`:
1. `forwardToDebugPanel('synapse', 'ACCOUNT_REGISTERED', ...)` — para observabilidad
2. `sendToHost({event:'ACCOUNT_REGISTERED', service, username, token_fingerprint, ...})`
3. Si `service === 'github'` y hay `token_fingerprint`: `sendToHost({event:'GITHUB_TOKEN_STORED', ...})`

El `GITHUB_TOKEN_STORED` al host lo emite **background.js internamente** desde el handler de `ACCOUNT_REGISTERED`, no `discovery.js` directamente.

### 9.5 landing.js — flujo real (verificado Jun 25)

`LandingFlow.start()`:
1. `loadProfileData()` — prioridades: `BLOOM_PROFILE_DATA` inyectado → `chrome.storage.local` → `SYNAPSE_CONFIG`
2. Lee flags desde `synapseConfig.launch_flags` (o raíz como fallback): `register`, `heartbeat`, `service`, `step`, `alias`, `role`, `email`, `extension`, `mode`, `linked_accounts`
3. Lee `bloom_profile_state` (escrito por `discovery.js`, solo lectura aquí)
4. `protocol.init()` + `protocol.executePhase('initialization')`
5. Si tiene `profileData` → `transitionToReady()` → `protocol.executePhase('ready', {profile})`
6. Emite `LANDING_READY` a `chrome.runtime`

`transitionToReady()`:
- Si hay `bloomProfileState`, `mergeProfileState()` enriquece accounts y vaults
- Emite `LANDING_READY` al host
- Instala `setupMessageListener()` para updates en tiempo real: `GITHUB_TOKEN_STORED`, `GITHUB_ACCOUNT_CREATED`, `ACCOUNT_REGISTERED`, `PROFILE_LOADED`

### 9.6 landingProtocol.js — diferencias respecto a doc anterior (verificado Jun 25)

- **Export:** usa `window.PROTOCOL = PROTOCOL` (no `self.PROTOCOL`)
- **Manifest:** usa `self.LANDING_PROTOCOL_MANIFEST` (ambos)
- **`observable_events`** tiene 7 entradas (no 4 como listaba revisión Jun 19): `SESSION_STATUS`, `STATS_UPDATE`, `PROFILE_LOADED`, `HEALTH_CHECK_RESULT`, `GITHUB_TOKEN_STORED`, `GITHUB_ACCOUNT_CREATED`, `ACCOUNT_REGISTERED`
- **`discoveryProtocol.js`** en cambio usa `window.PROTOCOL` pero también `if (typeof module !== 'undefined') module.exports = PROTOCOL` — patrón idéntico

---

### 9.7 manifest.json — agregar a web_accessible_resources

*(actualizado Jun 26 2026)*
```json
{
  "web_accessible_resources": [
    {
      "resources": [
        "protocols/discovery.schema.json",
        "protocols/landing.schema.json",
        "protocols/harness.schema.json",
        "harness/index.html",
        "harness/harness.js",
        "harness.synapse.config.js"
      ],
      "matches": ["<all_urls>"]
    }
  ]
}
```
Los schemas JSON deben estar en `web_accessible_resources` para que `fetch(chrome.runtime.getURL(...))` funcione tanto desde `background.js` como desde `harness.js`. El archivo `discovery/harnessProtocol.js` fue removido de esta lista al migrarse al schema JSON.

### 9.8 Reglas para Cortex — qué NO se hace

- NO modificar `discovery.js`
- NO modificar `discoveryProtocol.js` excepto agregar el manifest al final
- NO modificar `content.js`
- NO modificar `background.js` (excepto fixes puntuales)
- NO abrir un segundo `chrome.runtime.connectNative()` en el Harness
- NO agregar lógica de negocio al Harness

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

---

## 12. Uso operativo — cómo debuggear el flujo onboarding

### 12.1 Verificar que el sistema está listo

1. `chrome://extensions` → verificar que Bloom Nucleus Bridge está activo
2. Verificar que `bloom-host` está corriendo (log de `background.js`: `HANDSHAKE COMPLETADO`)
3. Abrir el Harness: `chrome-extension://<ID>/harness/index.html`
4. Tab **Config** → verificar que `profileId` y `launchId` tienen valores reales

### 12.2 Simular el flujo completo de github_auth → landing

Secuencia correcta para el **primer milestone** (primera validación de registro GitHub → Landing):

```
Harness (Cortex) — dispatches en orden:

1. onboarding_navigate     → step: "github_auth"
   ACK esperado: {status:"ok"} de background.js → Discovery muestra 'github-login'

2. github_pat_detected     → token: "ghp_simulatedToken123456789"
   ACK esperado: {received:true}
   Observar: Discovery muestra 'github-confirm' con preview del token

3. [simular click "Confirmar" — no se puede desde Harness; necesita acción en Discovery]
   Alternativa: despachar directamente:

4. account_registered      → profile_id: auto, launch_id: auto
   ACK esperado: {received:true}
   background.js internamente:
     → sendToHost(ACCOUNT_REGISTERED) → MilestoneReactor → Landing
     → sendToHost(GITHUB_TOKEN_STORED)

5. discovery_complete      → profile_id: auto, launch_id: auto
   ACK esperado: {received:true}
```

Después de step 4, Brain debería disparar el re-launch en modo landing, y la página de Landing debería abrirse. Eso es el **objetivo del primer test**.

### 12.3 Observar mensajes en tiempo real

Todo lo que `forwardToDebugPanel()` emite llega al feed del Workspace Harness (`:4124`) Y al feed del Cortex Harness (tab de la extensión). En el Cortex Harness, el panel Log muestra:
- `[SEND]` — el Harness despachó un mensaje
- `[ACK]` — respuesta de `background.js`
- `[INFO]` — logs de ciclo de vida del Harness
- `[ERR]` — error de dispatch

Adicionalmente, gracias al `HARNESS_HELLO`/`HARNESS_REPLAY`, el Harness también recibe retroactivamente todos los eventos que ocurrieron desde el boot del SW hasta que la tab del Harness abrió.

### 12.4 Gap conocido — botón "Confirmar" en GithubAuthFlow

El Harness no puede simular clicks en la UI de Discovery directamente. El paso "Confirmar token" requiere o:
- Hacer click manual en la página de Discovery, **o**
- Despachar `account_registered` directamente desde el Harness (saltea la pantalla de confirmación pero produce el mismo efecto en `background.js`)

---

---

## 13. Estado actual del sistema

| Componente | Estado | Verificado |
|---|---|---|
| `background.js` — handshake 3 fases | ✅ Implementado | Jun 25 |
| `background.js` — `forwardToDebugPanel()` doble destino | ✅ Implementado | Jun 25 |
| `background.js` — `harnessLogBuffer` + `HARNESS_HELLO`/`REPLAY` | ✅ Implementado | Jun 25 |
| `background.js` — handlers IonPump (`ION_EXECUTE_FLOW`, `ION_RELOAD`, `ION_INSPECT`) | ✅ Implementado | Jun 25 |
| `background.js` — `ACCOUNT_REGISTERED` emite `GITHUB_TOKEN_STORED` internamente | ✅ Implementado | Jun 25 |
| `discoveryProtocol.js` — `DISCOVERY_PROTOCOL_MANIFEST` 8 mensajes | ✅ Implementado | Jun 25 |
| `landingProtocol.js` — `LANDING_PROTOCOL_MANIFEST` 6 mensajes | ✅ Implementado | Jun 25 |
| `discovery.js` — `routeToStep()` con todos los cases | ✅ Implementado | Jun 25 |
| `discovery.js` — `GithubAuthFlow` completo | ✅ Implementado | Jun 25 |
| `landing.js` — `LandingFlow` + `mergeProfileState` | ✅ Implementado | Jun 25 |
| `harness.js` — `ProtocolReader`, `Simulator`, `Logger`, `ConfigReader` | ✅ Implementado | Jun 25 |
| `harnessProtocol.js` — `HARNESS_PROTOCOL_MANIFEST` 10 comandos | ✅ (Jun 19) | Jun 19 |
| `seed.go` — flag `--dev` | ✅ (Jun 19) | Jun 19 |
| `ignition_identity.go` — `writeHarnessConfig()` | ✅ (Jun 19) | Jun 19 |
| `nucleus/internal/supervisor/onboarding_harness.go` | ❓ No auditado | — |

---

---

## 14. Estructura de archivos completa

*(actualizado Jun 26 2026)*
```
profiles/<uuid>/extension/
├── discovery.synapse.config.js     ← Sentinel, en launch
├── landing.synapse.config.js       ← Sentinel, en launch
├── harness.synapse.config.js       ← Sentinel, en launch (solo si harness existe)
├── background.js
├── protocols/                      ← NUEVO (Fase 1–5) — JSON schemas de protocolo
│   ├── discovery.schema.json       ← fuente de verdad del protocolo discovery
│   ├── landing.schema.json         ← fuente de verdad del protocolo landing
│   └── harness.schema.json         ← fuente de verdad del protocolo ionpump
├── discovery/
│   ├── index.html
│   ├── discovery.js
│   ├── discoveryProtocol.js        ← LEGACY — marcado para eliminación (Fase 5)
│   └── harnessProtocol.js         ← LEGACY — marcado para eliminación (Fase 5)
├── landing/
│   ├── index.html
│   ├── landing.js
│   └── landingProtocol.js          ← LEGACY — marcado para eliminación (Fase 5)
└── harness/
    ├── index.html                  ← solo en --dev
    └── harness.js                  ← ProtocolReader, Simulator, Logger, ConfigReader
```

---

---

## 15. Checklist de implementación por componente

### Background.js / Cortex

- [x] `forwardToDebugPanel()` con doble destino (nucleus + Harness tab)
- [x] `harnessLogBuffer` — buffer circular 100 entradas
- [x] Handler `HARNESS_HELLO` → `HARNESS_REPLAY`
- [x] `openHarnessTab()` llamado en `host_ready` cuando `config.harness` existe
- [x] `openDiscoveryTab()` llamado en `host_ready` cuando `config.mode === 'discovery'`
- [x] Handler `ACCOUNT_REGISTERED` emite `GITHUB_TOKEN_STORED` internamente para github
- [x] Handlers IonPump DOM commands (`ION_EXECUTE_FLOW`, `ION_RELOAD`, `ION_INSPECT`)
- [x] `registerHandler` + `applySchemaDefaults` — infraestructura de schemas *(Fase 1–5)*
- [x] `loadProtocolSchemas()` — carga JSON schemas al boot *(Fase 1–5)*
- [x] `extension/protocols/*.schema.json` — tres schemas declarados en `web_accessible_resources` *(Fase 1–5)*
- [x] `ProtocolReader.discoverFromJSON()` en harness.js *(Fase 1–5)*
- [ ] Eliminar archivos legacy `*Protocol.js` — pendiente limpieza Fase 5
- [ ] Eliminar `ProtocolReader.discover()` y `loadScriptOptional` del boot — pendiente limpieza Fase 5

### Discovery

- [x] `DISCOVERY_PROTOCOL_MANIFEST` con 8 mensajes y enum actualizado
- [x] `routeToStep()` con todos los cases: `github_auth`, `google_auth`, `nucleus_create`, `vault_init`, `ai_provider_setup`, `project_create`, `success`
- [x] `GithubAuthFlow` completo (clipboard, confirmación, guardado, ACCOUNT_REGISTERED)
- [x] Listener `onboarding_navigate` para navegación remota desde Nucleus/Harness

### Landing

- [x] `LANDING_PROTOCOL_MANIFEST` con 6 mensajes
- [x] `observable_events` completo (7 entradas)
- [x] `LandingFlow.loadProfileData()` con flags desde `launch_flags`
- [x] `mergeProfileState()` con accounts y vaults de `bloom_profile_state`
- [x] Listener de mensajes para updates en tiempo real

### Sentinel

- [x] Flag `--dev` en `seed.go`
- [x] `writeHarnessConfig()` en launch
- [ ] Auditar `nucleus/internal/supervisor/onboarding_harness.go` (ver §18 #6)

### Metamorph

- [ ] Reconciliación (`--reconcile`) — bloqueada hasta Bartcave

---

---

## 16. Restricciones absolutas

1. El Harness NO define contratos de mensajes. Los lee.
2. El Harness NO abre `chrome.runtime.connectNative()`.
3. El Harness NO habla directamente con bloom-host.
4. El Harness NO existe en prod.
5. El Harness NO modifica el estado de iones. Solo observa y simula.
6. IonPump NO es un módulo CLI de usuario. Es un runtime interno.
7. IonPump NO hace eager loading de recipes. Lazy only.
8. IonPump NO modifica el protocolo Synapse.
9. IonPump NO modifica `content.js`.
10. IonPump NO hace llamadas de red. Todos los recipes son locales.
11. IonPump NO escribe en `ionsites/`. Solo Metamorph escribe ahí.
12. IonPump NO llama directamente a `SynapseManager` — usa el IPC layer (TCP localhost).
13. NO existe `send_command()` en `SynapseManager` — IPC es el único canal para envíos proactivos.
14. *(actualizado Jun 26 2026)* — Cada protocolo define su contrato en `extension/protocols/*.schema.json`. No se definen defaults de mensajes de protocolo en archivos `.js`. *(transitorio)* — Los globals `self.*_PROTOCOL_MANIFEST` en `*Protocol.js` se mantienen hasta completar la limpieza de la Fase 5.
15. `SynapseIPCServer` solo escucha en `127.0.0.1` — nunca en `0.0.0.0`.
16. Brain es el único escritor del `extensionDir`.
17. `harness.synapse.config.js` se escribe en launch, no en seed.
18. `forwardToDebugPanel()` NUNCA envía tokens completos — solo fingerprints (primeros 10 chars + `…`).

---

---

## 17. Invariantes del sistema a preservar

1. **Un solo canal Native Messaging.** Solo `background.js` tiene `nativePort`.
2. **Un solo handshake.** `bloom-host` espera exactamente un `extension_ready` por launch.
3. **`background.js` es el router.** Todos los mensajes pasan por él.
4. **Synapse es el protocolo de transporte.** IonPump lo usa, no lo reemplaza.
5. **Cortex es stateless.** No guarda estado de iones. Solo ejecuta.
6. **Metamorph no participa del Event Bus.** Es invocado bajo demanda por Nucleus.
7. **IonPump executor no envía.** Solo genera `SynapseCommand` objects. `IonPumpManager` llama a `IPCClient`.
8. **`bloom_profile_state` es propiedad de Discovery.** Solo `discovery.js` escribe. `landing.js` solo lee.
9. **`ACCOUNT_REGISTERED` → `GITHUB_TOKEN_STORED` es una consecuencia interna de background.js.** `discovery.js` solo emite `ACCOUNT_REGISTERED`. El segundo evento lo genera el handler de background.

---

---

## 18. Preguntas abiertas

| # | Pregunta | Estado | Blocking? |
|---|---|---|---|
| 1 | ¿El archivo `intent_executor.py` existe en `brain/core/intent/`? | Abierta | Fase 3 |
| 2 | ¿`watchdog` library está ya en `requirements.txt` de Brain? | Abierta | Fase 4 |
| 3 | ¿`LANDING_PROTOCOL_MANIFEST` se requiere para milestone GitHub? | **Resuelta** — implementado, 6 mensajes | No |
| 4 | ¿Qué versión mínima de Cortex requiere el ion de `github.com`? | Abierta | Semana 2 |
| 5 | Bartcave — ¿cuándo estará desplegado para desbloquear Fase 6b (reconcile)? | Abierta | Fase 6b |
| 6 | ¿Qué es `nucleus/internal/supervisor/onboarding_harness.go`? | Abierta — no auditado | No bloqueante |
| 7 | ¿Canal `"tabs"` sigue siendo objetivo de roadmap para IonPump, o descartado? | Abierta — afecta checklist §15 | Bloquea checklist |
| 8 | ¿`routeToStep()` faltaban cases `vault_init`, `ai_provider_setup`, `project_create`? | **Resuelta Jun 25** — todos están implementados | No |

---

*Documento consolidado — Junio 2026*
*Revisión Jun 25 2026: auditoría completa contra background.js, harness.js, discoveryProtocol.js, discovery.js, landingProtocol.js, landing.js*

---

---

*Documento consolidado — Junio 2026*  
*Fuente primaria: estado operativo de sesión Jun 6 (`HARNESS_Manual_Onboarding_Debug.md`)*  
*Correcciones arquitectónicas: `IMPL_PROMPT_CORTEX_SENTINEL_Harness_v2.md` + `IMPL_PROMPT_BRAIN_IonPump_Harness_v2.md` (Abr 25)*  
*Los documentos anteriores en `/docs/HARNESS/` pueden archivarse.*

---

## 19. Adenda — verificación contra código fuente real (Jun 19 2026)

Esta sección documenta el proceso de la revisión que generó las correcciones de este documento, para que quien retome el trabajo sepa qué se verificó y contra qué.

**Archivos fuente leídos directamente para esta adenda:**
`discoveryProtocol.js`, `discovery.js` (completo, 1166 líneas), `onboarding.js` (completo, 438 líneas), `harness.js` (completo, 731 líneas), `landingProtocol.js`, `landing.js`, `harnessProtocol.js`, `discovery/index.html`, `landing/index.html`.

**No se pudo verificar en esta ronda** (no provistos): `harness/index.html`, `manifest.json`, `background.js`, `bloom-host`, cualquier archivo de Brain (`harness_generator.py`, `discovery_generator.py`, `synapse_manager.py`), `seed.go`, `ignition_identity.go`. Todo lo que este documento afirma sobre esos archivos sigue siendo lo heredado de versiones anteriores — **no re-verificado**, no asumir que está confirmado solo porque aparece en este documento.

**Resumen de hallazgos:**

1. Landing (`landingProtocol.js` → `LANDING_PROTOCOL_MANIFEST`) está completo e implementado — las versiones previas de este documento lo trataban como pendiente o fuera de alcance. Corregido en §1 y §6.4b.
2. `DISCOVERY_PROTOCOL_MANIFEST` real tiene 8 mensajes, no 6 — el manifest documentado en versiones previas no coincidía con el archivo fuente. Corregido en §6.4.
3. `HARNESS_PROTOCOL_MANIFEST` real no tiene canal `"tabs"` ni array `tab_messages` — la estructura documentada en versiones previas no existe en el código. Corregido en §6.5, abierto como pregunta #7 en §18.
4. Existe un mecanismo `HARNESS_HELLO`/`HARNESS_REPLAY`/`HARNESS_LOG` en `harness.js` que resuelve la pregunta histórica sobre captura de broadcasts — no documentado en ninguna versión anterior. Nuevo §9.3. Revela la existencia de un "Workspace Harness" no documentado en ningún archivo — pregunta #6 en §18.
5. Gap de código real (no documental) entre `onboarding.js` (VSCode) y `routeToStep()` en `discovery.js`: tres steps (`vault_init`, `ai_provider_setup`, `project_create`) que el lado VSCode pide navegar no tienen case en Discovery. Nuevo §9.4, pregunta #8 en §18.
6. La nota de limitación en §12.2 sobre mensajes invisibles para el Harness por "límite de arquitectura MV3" ya no es precisa dado el mecanismo de §9.3 — corregida.

---

## 20. Adenda — auditoría Jun 25 2026 (esta revisión)

**Archivos leídos:** `background.js` (1680 líneas), `harness.js` (746 líneas), `discoveryProtocol.js` (503 líneas), `discovery.js` (1310 líneas), `landingProtocol.js` (594 líneas), `landing.js`.

**Correcciones respecto a revisión Jun 19:**

1. **`routeToStep()` — cases completos.** La pregunta abierta #8 está resuelta: `vault_init`, `ai_provider_setup` y `project_create` están implementados en `discovery.js`. El doc anterior los marcaba como faltantes.

2. **`observable_events` de Landing.** Tiene 7 entradas, no 4. Se agregan `GITHUB_TOKEN_STORED`, `GITHUB_ACCOUNT_CREATED`, `ACCOUNT_REGISTERED`.

3. **`ProtocolReader` es un objeto literal, no una clase.** El método es `discover()`, no `loadAll()`. Resultado funcional idéntico.

4. **`ACCOUNT_REGISTERED` → `GITHUB_TOKEN_STORED` es interno de background.js.** `discovery.js` solo emite `ACCOUNT_REGISTERED`. background.js handler emite internamente el `GITHUB_TOKEN_STORED` al host. Esto no estaba documentado claramente.

5. **`landingProtocol.js` usa `window.PROTOCOL`, no `self.PROTOCOL`.** Diferencia de contexto de ejecución: Landing corre en una página Chrome Extension normal (tiene `window`); el manifest sigue usando `self.LANDING_PROTOCOL_MANIFEST`.

6. **`forwardToDebugPanel()` confirma doble destino.** El Workspace Harness y el Cortex Harness reciben el mismo evento simultáneamente. El buffer resuelve la condición de carrera para el Cortex Harness.

7. **`bloom_profile_state` — propiedad exclusiva de Discovery.** `landing.js` solo lee. `discovery.js` es el único que escribe. Nuevo invariante #8 agregado.

**No verificado en esta ronda:** `harness/index.html`, `harnessProtocol.js`, `manifest.json`, archivos de Brain, `seed.go`, `ignition_identity.go`, `onboarding_harness.go`.
---

## 21. Adenda — Fase 5: migración a JSON schemas (Jun 26 2026)

Esta adenda documenta los cambios arquitectónicos implementados en las Fases 1–5 del Harness Protocol Single Source of Truth.

### Cambio central

Los protocolos de mensajes ya no viven en archivos `*Protocol.js` con globals `self.*_PROTOCOL_MANIFEST`. Ahora viven en JSON schemas independientes:

```
extension/protocols/
├── discovery.schema.json
├── landing.schema.json
└── harness.schema.json
```

Declarados en `web_accessible_resources` para acceso via `chrome.runtime.getURL()`.

### Cambios en background.js

- Nuevo sistema `registerHandler(eventName, schema, handlerFn)` + `applySchemaDefaults()` que consume los JSON schemas directamente.
- `loadProtocolSchemas()` carga los schemas al boot via fetch.
- El bloque `self.SYNAPSE_DEBUG` fue eliminado.

### Cambios en harness.js

- `ProtocolReader.discoverFromJSON()` hace `fetch()` a los JSON via `chrome.runtime.getURL()` en lugar de leer globals.
- `ProtocolReader.discover()` se mantiene como fallback transitorio.

### Archivos legacy marcados para eliminación

| Archivo | Reemplazado por |
|---|---|
| `discovery/discoveryProtocol.js` | `protocols/discovery.schema.json` |
| `landing/landingProtocol.js` | `protocols/landing.schema.json` |
| `harnessProtocol.js` | `protocols/harness.schema.json` |

La secuencia de `loadScriptOptional()` en el boot del Harness se elimina junto con estos archivos. Ver ARCHITECTURE_HarnessProtocol.md §8 para el orden de limpieza recomendado.

### Invariante nuevo

> Los datos de protocolo (estructura de mensajes, parámetros, defaults) no se inyectan como globals de JavaScript. Solo los configs de sesión (`*.synapse.config.js`) pueden seguir usando ese patrón mientras no sean migrados.

**Archivos verificados para esta adenda:** contexto de sesión Jun 26 2026 + ARCHITECTURE_HarnessProtocol.md v1.0 Post-Fase 5.
