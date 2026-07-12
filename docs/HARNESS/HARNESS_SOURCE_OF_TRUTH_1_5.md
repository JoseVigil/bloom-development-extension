# Bloom — Harness + IonPump: Fuente de Verdad
## Versión consolidada · v1.5 — Jul 12 2026 (VAULT_INITIALIZED — institucionalización, 6ta instancia del patrón transversal §5)
### Supersede: todos los documentos del directorio `/docs/HARNESS/`

> **v1.5 — resumen del cambio:** ronda de institucionalización de `VAULT_INITIALIZED` verificada
> capa por capa (`background.js` → `discovery.js` → `synapse-bridge.js` → `server_manager.py` →
> `milestone-registry.js`). No requiere cambios en `harness_schema.json` (protocolo `ionpump`) ni en
> `harness_generator.py`. Hallazgo principal: `discoveryProtocol.js` (legacy manifest ya identificado
> en §5 como instancia #1 del patrón) sigue sin `vault_initialized`/`VAULT_INITIALIZED` en su propia
> copia de `messages`/`observable_events`, lo que puede neutralizar el fix de `discovery_schema.json`
> en cualquier contexto donde `harness.js` priorice el legacy global sobre el JSON. Ver §25 para el
> detalle completo.

> **v1.4 — resumen del cambio:** el mismo drift corregido en §23 para `discovery.schema.json`
> existía, en espejo, del lado de **Conductor Workspace** — la app Electron que es la contraparte
> de Harness pero corriendo del lado host/Cortex en vez de dentro de la extensión de Chrome.
> `debug.html` (hoy vive en `onboarding/`, va a mudarse a `core/`) tenía su propio panel de
> "Simulate" con el mismo par retirado `GITHUB_PAT_DETECTED` / `GITHUB_TOKEN_STORED` hardcodeado en
> tres lugares (`sim-select`, `EVENT_LEVELS`, `AUTO_EVENTS`), sin ningún rastro del Device Flow. Ver
> §24 para el detalle completo.

> **v1.3 — resumen del cambio:** `discoveryProtocol.js` fue actualizado (573 líneas, vs. las 503
> verificadas en v1.2) para reemplazar el flujo de detección de PAT por clipboard
> (`GITHUB_PAT_DETECTED` / `GITHUB_TOKEN_STORED` / `API_KEY_DETECTED`) por GitHub App Device Flow
> (`GITHUB_DEVICE_CODE` / `GITHUB_APP_AUTHORIZED` / `GITHUB_DEVICE_FLOW_ERROR`), más entrada manual
> de API keys (`api_key_registered` ya no depende de clipboard). Ese cambio **nunca se propagó** a
> `discovery.schema.json` (la fuente de verdad real que lee el Harness vía `fetch`) ni a este
> documento. Resultado: el Harness seguía ofreciendo simular un flujo que ya no existe, y no tenía
> forma de simular el Device Flow — que es justamente el flujo real que falla hoy cuando
> `GITHUB_APP_CLIENT_ID` es un placeholder (`'TODO_GITHUB_APP_CLIENT_ID'`) sin registrar. Ver §23
> para el detalle completo.
>
> **v1.2 — resumen del cambio (histórico):** la revisión Jun 25 (v1.1) afirmaba que el handler de
> `ACCOUNT_REGISTERED` en `background.js` emitía internamente `GITHUB_TOKEN_STORED` al host. Esa
> cascada no existe en el código: son dos handlers independientes, y `GITHUB_TOKEN_STORED` es un
> evento sintético del Harness que solo se dispara si se simula manualmente. Ver §22 para el
> detalle completo y la lista de secciones corregidas (§9.1, §9.4, §12.2, §13, §15, §17, §20).
> **Nota v1.3:** `GITHUB_TOKEN_STORED` fue retirado del manifest en esta revisión — ver §23. La
> explicación de §22 sobre por qué no había cascada sigue siendo históricamente correcta, pero el
> evento sintético que describe ya no está disponible para simular desde el Harness.

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
22. [Adenda — corrección cascada ACCOUNT_REGISTERED / GITHUB_TOKEN_STORED (v1.2, Jul 1 2026)](#22-adenda--corrección-cascada-account_registered--github_token_stored-v12-jul-1-2026)
23. [Adenda — migración a GitHub Device Flow, retiro del clipboard flow (v1.3, Jul 11 2026)](#23-adenda--migración-a-github-device-flow-retiro-del-clipboard-flow-v13-jul-11-2026)
24. [Adenda — Conductor Workspace / debug.html, mismo drift del lado Electron (v1.4, Jul 11 2026)](#24-adenda--conductor-workspace--debughtml-mismo-drift-del-lado-electron-v14-jul-11-2026)
25. [Adenda — VAULT_INITIALIZED, institucionalización (v1.5, Jul 12 2026)](#25-adenda--vault_initialized-institucionalización-v15-jul-12-2026)

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
- **Líneas 1141–1183:** handler `ACCOUNT_REGISTERED` — `forwardToDebugPanel()`, `sendToHost({event:'ACCOUNT_REGISTERED', ...})`, `sendResp({received:true})` y broadcast interno vía `chrome.runtime.sendMessage`. No emite `GITHUB_TOKEN_STORED` (corregido en v1.2, ver §22)
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

`background.js` handler de `ACCOUNT_REGISTERED` (líneas 1063–1102, vía `registerHandler()` dentro de `registerOnboardingHandlers()`), hace y solo hace:
1. `forwardToDebugPanel('synapse', 'ACCOUNT_REGISTERED', ...)` — log al Harness
2. `sendToHost({event:'ACCOUNT_REGISTERED', service, username, token_fingerprint, ...})` — **un** evento al host nativo
3. `sendResp({received: true})`
4. `chrome.runtime.sendMessage({event:'ACCOUNT_REGISTERED', ...})` — broadcast interno

**No existe ningún `if (service === 'github')` ni emisión de `GITHUB_TOKEN_STORED` dentro de este handler.** `ACCOUNT_REGISTERED` y `GITHUB_TOKEN_STORED` son dos `if` independientes dentro del mismo listener `chrome.runtime.onMessage` (línea 1105), cada uno con su propio `sendToHost()`. No hay cascada interna entre ellos. `GITHUB_TOKEN_STORED` es un evento sintético del Harness (`discovery.schema.json`, mensaje `github_token_stored`, `"direction": "harness_to_background"`) que solo se dispara si algo lo activa manualmente desde el panel de testing — nunca como parte del flujo real de `GithubAuthFlow`. *(Corregido en v1.2 — ver §22. Esta misma afirmación falsa estaba duplicada como comentario en `background.js:1345-1348` y `discovery.js:1076-1078`; ambos comentarios deben corregirse o borrarse por separado.)*

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
   background.js:
     → sendToHost(ACCOUNT_REGISTERED) → MilestoneReactor → Landing
   (GITHUB_TOKEN_STORED NO se dispara automáticamente aquí — es un evento sintético
   separado del Harness; despacharlo requiere un paso 4b manual: `github_token_stored`.
   Corregido en v1.2, ver §22)

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
| `background.js` — `ACCOUNT_REGISTERED` y `GITHUB_TOKEN_STORED` son handlers independientes, sin cascada | ✅ Verificado | v1.2 (corregido) |
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
- [x] Handler `ACCOUNT_REGISTERED` — un solo evento a host + broadcast interno; NO emite `GITHUB_TOKEN_STORED` (corregido v1.2, ver §22)
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
9. **`ACCOUNT_REGISTERED` y `GITHUB_TOKEN_STORED` NO tienen relación de cascada.** *(Corregido en v1.2 — ver §22.)* `discovery.js` solo emite `ACCOUNT_REGISTERED` (emisor único: `GithubAuthFlow._saveToken()`). `GITHUB_TOKEN_STORED` no es un evento de producción: es un evento sintético del Harness (`discovery.schema.json`, `github_token_stored`, `"direction": "harness_to_background"`) que solo se dispara si se simula manualmente desde el panel de testing. El handler de `background.js` para `ACCOUNT_REGISTERED` no contiene ningún `if (service === 'github')` ni emite `GITHUB_TOKEN_STORED`; son dos `if` independientes dentro del mismo listener `chrome.runtime.onMessage`, cada uno con su propio `sendToHost()`. Si se observan ambos eventos casi simultáneos, la causa es que el evento simulado del Harness se disparó mientras el flujo real de `discovery.js` corría en paralelo — un artefacto de tener dos fuentes activas a la vez, no una cascada de código.

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

4. ~~**`ACCOUNT_REGISTERED` → `GITHUB_TOKEN_STORED` es interno de background.js.**~~ **⚠️ Afirmación incorrecta — corregida en v1.2, ver §22.** Esta revisión (Jun 25) introdujo por error la afirmación de que `discovery.js` solo emite `ACCOUNT_REGISTERED` y que el handler de background.js emite internamente `GITHUB_TOKEN_STORED` al host. La revisión posterior (auditoría Jun 30/Jul 1 2026) encontró que esa cascada no existe en el código: son dos handlers independientes sin relación entre sí. La primera mitad de la afirmación (que `discovery.js` solo emite `ACCOUNT_REGISTERED`) era correcta; la segunda (que background.js dispara `GITHUB_TOKEN_STORED` como consecuencia) no lo era.

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

---

## 22. Adenda — corrección cascada ACCOUNT_REGISTERED / GITHUB_TOKEN_STORED (v1.2, Jul 1 2026)

> **Número de versión de este documento: 1.2**

> Reemplaza la afirmación de la revisión Jun 25 (§9.1, §9.4, §13, §15, §17 invariante 9, §20 punto 4)
> sobre una cascada `ACCOUNT_REGISTERED → GITHUB_TOKEN_STORED` interna a `background.js`. Esa cascada
> **no existe en el código** y era deuda documental copiada en dos archivos distintos de este mismo
> documento — no fue verificada contra el código fuente real en el momento en que se escribió.

**Archivos releídos para esta corrección:** `background.js`, `discovery.js`, `discovery.schema.json`,
`harness.schema.json`, `landing.schema.json`.

### Flujo real: registro de cuenta GitHub

**Emisor único: `discovery.js`, clase `GithubAuthFlow`, método `_saveToken()` (líneas 1025-1100).**

Cuando el usuario confirma el guardado del token, `discovery.js`: persiste el token en
`bloom_vault_temp`, resuelve el username vía `api.github.com/user` (best-effort), actualiza el
estado local del vault y de la cuenta, y emite **un solo mensaje** vía `chrome.runtime.sendMessage`:

```js
// discovery.js:1080-1088
chrome.runtime.sendMessage({
  event:             'ACCOUNT_REGISTERED',
  service:           'github',
  username:          vault.github_user || '',
  token_fingerprint: fingerprint,
  profile_id:        self.SYNAPSE_CONFIG?.profileId,
  launch_id:         self.SYNAPSE_CONFIG?.launchId,
  timestamp:         Date.now(),
});
```

`discovery.js` **no emite `GITHUB_TOKEN_STORED` en ningún punto del archivo** (verificado por
búsqueda exhaustiva — cero ocurrencias como `sendMessage`).

### Receptor: background.js

El handler registrado para `ACCOUNT_REGISTERED` (líneas 1063-1102, vía `registerHandler()` dentro
de `registerOnboardingHandlers()`) hace, y solo hace:

1. `forwardToDebugPanel('synapse', 'ACCOUNT_REGISTERED', {...})` — log al Harness.
2. `sendToHost({ event: 'ACCOUNT_REGISTERED', ... })` — **un** evento al host nativo.
3. `sendResp({ received: true })`.
4. `chrome.runtime.sendMessage({ event: 'ACCOUNT_REGISTERED', ... })` — broadcast interno.

**No existe ningún `if (service === 'github')` ni ninguna emisión de `GITHUB_TOKEN_STORED` dentro
de este handler.** `ACCOUNT_REGISTERED` y `GITHUB_TOKEN_STORED` son dos `if` independientes dentro
del mismo listener `chrome.runtime.onMessage` (línea 1105), cada uno con su propio `sendToHost()`.
No hay cascada interna entre ellos.

### `GITHUB_TOKEN_STORED`: qué es realmente

No es un evento de producción. Es un **evento sintético del Harness**, definido en
`discovery.schema.json` (mensaje `github_token_stored`) con `"direction": "harness_to_background"`
— solo existe para que el panel de testing simule manualmente "el usuario confirmó guardado de
token", sin pasar por el flujo real de `discovery.js`. Aparece también en `harness.schema.json`
como opción de `EVENT_EMIT` (simulación vía IonPump/Harness), y en `landing.schema.json` como
`observable_event` — Landing está preparado para reaccionar si lo recibe, pero ningún código de
producción se lo manda hoy.

`background.js` sí tiene un handler para `GITHUB_TOKEN_STORED` (líneas 1345-1400) que reenvía al
host — pero solo se activa si algo lo dispara manualmente (Harness), nunca como parte del flujo
real de auth de GitHub.

### Deuda documental duplicada (pendiente de limpieza fuera de este doc)

La misma afirmación falsa está escrita en dos comentarios de código distintos, no solo en las
versiones previas de este documento:

- `background.js:1345-1348`, comentario sobre el handler de `GITHUB_TOKEN_STORED`:
  > "este evento llega emitido internamente por el handler de ACCOUNT_REGISTERED"
- `discovery.js:1076-1078`, comentario sobre la emisión de `ACCOUNT_REGISTERED`:
  > "background.js recibe este evento y: ... 2. Internamente emite GITHUB_TOKEN_STORED al host"

Ninguno de los dos describe código que existe. Ambos deberían corregirse o borrarse por separado
(fuera de alcance de este documento).

### Otro hallazgo: handler duplicado en canal host→extension

`background.js:801-828`, dentro de `handleHostMessage()` (canal *host → extensión*, no
`chrome.runtime.onMessage`), hay un segundo handler para `msg.event === 'ACCOUNT_REGISTERED'` que
reenvía el mismo evento de vuelta al host vía `sendToHost()`. Es código vestigial: si el host
alguna vez devuelve `ACCOUNT_REGISTERED` en lugar de su `_ACK`, esto lo reenvía en loop. No se
dispara en el flujo actual (los ACKs vienen con sufijo `_ACK`), pero es riesgo latente.

### Qué significa esto para bugs de duplicación de eventos

Si se observan `ACCOUNT_REGISTERED` y `GITHUB_TOKEN_STORED` casi simultáneos (deltas de ~1ms), la
única fuente posible en el código actual es que alguien haya disparado manualmente el evento
simulado `github_token_stored` del Harness mientras el flujo real de `discovery.js` corría en
paralelo y emitía su propio `ACCOUNT_REGISTERED`. No es una falla de emisión en `background.js` ni
en `discovery.js` — ambos emiten correctamente un solo evento por acción real. Es un artefacto de
tener dos fuentes (una real, una simulada) activas al mismo tiempo, no una cascada de código.

La deduplicación del lado receptor (fuera de alcance de este doc — pendiente de confirmar contra
`milestone-reactor.js`) sigue siendo la estrategia correcta para tolerar este escenario,
independientemente de si el origen es este artefacto de testing u otro futuro.

### Secciones corregidas por esta adenda

| Sección | Cambio |
|---|---|
| §9.1 | Descripción del handler `ACCOUNT_REGISTERED` corregida — ya no dice que emite `GITHUB_TOKEN_STORED` |
| §9.4 | Flujo `GithubAuthFlow` → `background.js` reescrito con los 4 pasos reales del handler |
| §12.2 (walkthrough Harness) | Paso 4 corregido — ya no asume disparo automático de `GITHUB_TOKEN_STORED` |
| §13 | Fila de la tabla de estado corregida |
| §15 | Ítem de checklist corregido |
| §17 | Invariante #9 reescrito |
| §20 | Punto 4 marcado como incorrecto, con nota explicativa |

---

*Documento consolidado — v1.2 · Jul 1 2026*
*Corrección aplicada sobre v1.1 (Jun 25 2026) según HARNESS_SOURCE_OF_TRUTH_FIX.md: elimina la
afirmación errónea de una cascada interna `ACCOUNT_REGISTERED → GITHUB_TOKEN_STORED` en
`background.js`. Ver §22.*

---

## 23. Adenda — migración a GitHub Device Flow, retiro del clipboard flow (v1.3, Jul 11 2026)

> **Número de versión de este documento: 1.3**

**Archivos releídos para esta corrección:** `discoveryProtocol.js` (573 líneas — versión posterior
a las 503 líneas verificadas en v1.2), `discovery.schema.json`, `harness.schema.json`,
`ARCHITECTURE_HarnessProtocol.md` (v1.0, Post-Fase 5, actualizado Jun 26 2026).

### Qué cambió en el flujo real

`discoveryProtocol.js` reemplazó el flujo de detección de token por clipboard monitor por
**GitHub App Device Flow**. El manifest legacy (`self.DISCOVERY_PROTOCOL_MANIFEST`) hoy declara:

| Evento viejo (retirado) | Evento nuevo |
|---|---|
| `GITHUB_PAT_DETECTED` (clipboard monitor detecta un PAT pegado) | `GITHUB_DEVICE_CODE` (background recibe el device code de `POST /login/device/code`) |
| — | `GITHUB_APP_AUTHORIZED` (Device Flow autorizado — reemplaza también a `ACCOUNT_REGISTERED` con `service: "github"`) |
| — | `GITHUB_DEVICE_FLOW_ERROR` (denied / expired_token / access_denied — incluye el caso de un `client_id` inválido) |
| `API_KEY_DETECTED` (clipboard monitor detecta una API key) | `api_key_registered` ahora documentado explícitamente como entrada **manual**, no detección |
| `GITHUB_TOKEN_STORED` (evento sintético de testing, ver §22) | Retirado del manifest — ya no aparece en `messages` ni en `observable_events` de `discoveryProtocol.js` |

`onboarding_navigate` también cambió su enum: el step pasó de `"github_auth"` a
`"github_app_auth"`, consistente con la screen `screen-github-app-device` que pinta el `user_code`
y `verification_uri` del Device Flow.

`account_registered` (el evento genérico) quedó restringido a `service: ["google"]` — GitHub ya no
lo usa, tiene su propio evento (`GITHUB_APP_AUTHORIZED`).

Se agregaron además dos comandos de bypass para debugging que no existían en ninguna revisión
anterior de este documento: `harness_simulate_handshake` (fuerza `handshakeState` a `CONFIRMED` sin
native host) y `harness_open_landing` (abre la tab de landing directamente desde el Harness).

### El gap que causó el problema original

Según **Regla 4** de `ARCHITECTURE_HarnessProtocol.md` (§7), los schemas se cargan exclusivamente
vía `chrome.runtime.getURL(...)` + `fetch()` — nunca se importan los archivos `*Protocol.js` como
fuente para el Harness una vez completada la Fase 5. Eso significa que, en la práctica, el Harness
**no veía nada del Device Flow**: seguía leyendo `discovery.schema.json`, que todavía tenía
`github_pat_detected`, `api_key_detected_gemini` y `github_token_stored` como si fueran el flujo
vigente, y un `onboarding_navigate` con `"github_auth"` en vez de `"github_app_auth"`.

`discoveryProtocol.js` sí tenía el contrato correcto — pero ese archivo está marcado para
eliminación (§8 de `ARCHITECTURE_HarnessProtocol.md`, "Fase 5") y `ProtocolReader.discover()` solo
lo usa como *fallback* legacy si el schema JSON no cargó. En un build donde el schema JSON carga
sin error (el caso normal), el manifest correcto del `.js` nunca se renderiza en el simulador.

Esto es exactamente el patrón "zombie" que ya había sido señalado dentro del propio
`discoveryProtocol.js` (comentario junto a `observable_events`, línea ~554): un evento declarado
en `messages` pero no reflejado donde el simulador realmente lo necesita — en este caso, invertido:
declarado en el `.js` legacy pero no en el JSON que manda.

### Consecuencia práctica (caso que originó esta revisión)

Con el schema desactualizado, no había forma de simular `GITHUB_DEVICE_CODE` /
`GITHUB_APP_AUTHORIZED` / `GITHUB_DEVICE_FLOW_ERROR` desde el Harness. La única opción para
avanzar el onboarding pasando por GitHub era correr el Device Flow real — que falla con
`404 Not Found` en `POST https://github.com/login/device/code` mientras
`GITHUB_APP_CLIENT_ID` en `background-github-device-flow.js` siga siendo el placeholder literal
`'TODO_GITHUB_APP_CLIENT_ID'` en vez de un client_id de una GitHub App registrada. Ese bug de
`client_id` es un problema de configuración de producto, no del Harness — pero la ausencia de
simulación en el Harness es lo que obligaba a pegarse contra el flujo real para poder seguir
probando el resto del onboarding.

### Corrección aplicada

- `discovery.schema.json` → `1.1.0`: se agregaron `github_device_code`, `github_app_authorized`,
  `github_device_flow_error`, `harness_simulate_handshake`, `harness_open_landing`; se retiraron
  `github_pat_detected`, `api_key_detected_gemini`, `github_token_stored`; se corrigió el enum de
  `onboarding_navigate` (`github_auth` → `github_app_auth`) y el de `account_registered.service`
  (limitado a `["google"]`); se actualizó `api_key_registered` con los campos `provider`,
  `profile_name` y `timestamp` que ya tenía el `.js` legacy y que el JSON no reflejaba.
- `harness.schema.json` → `1.1.0`: el enum de `event_emit.event_name` tenía `"google"` y
  `"gemini"` como si fueran nombres de evento (no lo son — parecen resto de un copy-paste del enum
  de `provider`) y ofrecía `GITHUB_PAT_DETECTED` / `GITHUB_TOKEN_STORED`, que ya no son eventos
  reales del flujo. Se reemplazaron por `GITHUB_DEVICE_CODE`, `GITHUB_APP_AUTHORIZED` y
  `GITHUB_DEVICE_FLOW_ERROR` para mantener paridad con Discovery.

### Pendiente — fuera de alcance de este documento

1. **`GITHUB_APP_CLIENT_ID` sin registrar** en `background-github-device-flow.js` — bug de
   producción real, no de Harness. No se toca acá; requiere que alguien cargue el client_id de la
   GitHub App registrada.
2. **`landing.schema.json`** no fue releído en esta revisión — si tiene los mismos eventos de
   clipboard flow como `observable_events` (ver §19, línea ~625: listaba `GITHUB_TOKEN_STORED` y
   `GITHUB_ACCOUNT_CREATED`), probablemente tenga el mismo drift y valga la pena auditarlo con el
   mismo criterio.
3. **`harnessProtocol.js`** (el legacy `.js` de IonPump) no incluía `"google"`/`"gemini"` en su
   propio manifest — o sea que ese bug se introdujo *solo* en `harness.schema.json`, probablemente
   a mano, sin sincronizar contra el `.js`. Vale la pena revisar si hay más divergencias entre ese
   par que no haya sido cubiertas acá.
4. Confirmar si `discoveryProtocol.js` y `harnessProtocol.js` ya pueden borrarse del bundle
   (Fase 5, paso 3 de `ARCHITECTURE_HarnessProtocol.md` §8) ahora que el JSON quedó al día, o si
   siguen actuando como fallback necesario en algún build.

---

*Documento consolidado — v1.3 · Jul 11 2026*
*Corrección aplicada sobre v1.2 (Jul 1 2026): propaga al schema JSON la migración a GitHub Device
Flow que ya estaba en `discoveryProtocol.js` pero nunca llegó a `discovery.schema.json` ni a este
documento. Ver §23.*

---

## 24. Adenda — Conductor Workspace / debug.html, mismo drift del lado Electron (v1.4, Jul 11 2026)

> **Número de versión de este documento: 1.4**

**Archivo releído para esta corrección:** `debug.html` (1345 líneas), ubicado hoy dentro de
`onboarding/` en Conductor Workspace, con nota del equipo de que se va a mudar a `core/` más
adelante.

### Qué es Conductor Workspace y cómo se relaciona con Harness

Conductor Workspace es la app Electron que corre del lado host (Nucleus/Cortex), no dentro de la
extensión de Chrome. `debug.html` es su panel de debugging: observa en tiempo real todo lo que
cruza por el `SynapseBridge` — vía WebSocket (`ws://localhost:4124`) para el feed categorizado y
filtrable, y vía un canal separado sin filtrar ("Synapse raw", `SYNAPSE_RAW_EVENT`/`SYNAPSE_EVENT`
por `postMessage` o por el bridge de `preload` según el frame) para ver el tráfico crudo tal cual
llega.

Además de observar, tiene su propio botón **Simulate**: un `<select>` con eventos predefinidos que
al hacer `POST /api/internal/system-event` (puerto `48215`) inyecta un evento sintético en el
pipeline — con fallback a `postMessage` si el `fetch` directo falla por CSP, y como último recurso
ingesta solo local (UI, sin llegar a Cortex) si ninguna de las dos vías responde. Es, en espíritu,
exactamente lo mismo que el "Simulate" del Harness dentro de la extensión, pero mirando el sistema
desde el lado del host en vez del lado del navegador — de ahí que el usuario lo describa como "la
contraparte de Harness en Cortex".

### El mismo drift, en tres lugares distintos del archivo

`debug.html` tenía el par retirado `GITHUB_PAT_DETECTED` / `GITHUB_TOKEN_STORED` (ver §23 — mismo
flujo de clipboard ya reemplazado por Device Flow en `discoveryProtocol.js` y ahora en
`discovery.schema.json`) hardcodeado, sin ninguna referencia a `GITHUB_DEVICE_CODE`,
`GITHUB_APP_AUTHORIZED` o `GITHUB_DEVICE_FLOW_ERROR`, en tres puntos independientes:

1. **`<select id="sim-select">`, optgroup `synapse`** — las opciones que arma el dropdown de
   simulación manual.
2. **`EVENT_LEVELS`** — el mapa que decide el color/nivel (`success` / `info` / `warn` / `error`)
   con el que se pinta cada evento en el feed.
3. **`AUTO_EVENTS`** — la secuencia que reproduce el botón "Auto" (un evento por segundo, en loop),
   pensada como demo/replay del happy path del onboarding.

A diferencia de `discovery.schema.json`, acá no hay un `.js` legacy "más actualizado" del que
copiar — los tres arrays estaban escritos a mano, directo en el HTML, sin ningún archivo de
schema que los generara. Es la misma clase de problema que describe la Regla 1 de
`ARCHITECTURE_HarnessProtocol.md` (§7) — "nunca hardcodear defaults de mensajes de protocolo en un
`.js`" — solo que acá el hardcodeo está en un tercer lugar que esa regla no cubre todavía: el panel
de debug de Conductor Workspace.

### Corrección aplicada

En `debug.html`:

- **`sim-select`** → se retiraron las opciones `GITHUB_PAT_DETECTED` y `GITHUB_TOKEN_STORED`; se
  agregaron `GITHUB_DEVICE_CODE`, `GITHUB_APP_AUTHORIZED`, `GITHUB_DEVICE_FLOW_ERROR`,
  `API_KEY_REGISTERED` y `ACCOUNT_REGISTERED` (con payloads espejados de los `payload_template` de
  `discovery.schema.json` — mismos nombres de campo, mismos valores default) para no volver a
  divergir del schema real.
- **`EVENT_LEVELS`** → se quitaron las entradas de los dos eventos retirados; se agregaron
  `GITHUB_DEVICE_CODE: 'info'` (esperando que el usuario autorice — mismo nivel que tenía
  `GITHUB_PAT_DETECTED`), `GITHUB_APP_AUTHORIZED: 'success'`, `GITHUB_DEVICE_FLOW_ERROR: 'error'`,
  `API_KEY_REGISTERED: 'success'` y `ACCOUNT_REGISTERED: 'success'`.
- **`AUTO_EVENTS`** → el paso `GITHUB_PAT_DETECTED → GITHUB_TOKEN_STORED` de la secuencia de replay
  se reemplazó por `GITHUB_DEVICE_CODE → GITHUB_APP_AUTHORIZED`, manteniendo el resto de la
  secuencia (`WORKFLOW_STATE_CHANGED`, `PROFILE_LAUNCHED`, `EXTENSION_LOADED`,
  `DISCOVERY_COMPLETE`, `INTENT_COMPLETED`, `BOOTSTRAP_READY`) sin cambios.

No se tocó nada del layout, el WebSocket, el feed raw, ni el mecanismo de `fireSimEvent()` — el
drift estaba únicamente en los datos hardcodeados de los eventos GitHub, no en la lógica del panel.

### Pendiente — fuera de alcance de este documento

1. **Sin fuente de verdad compartida.** `debug.html` no lee `discovery.schema.json` ni ningún otro
   schema — los payloads de simulación están escritos a mano en el HTML. Esto significa que
   cualquier cambio futuro al protocolo va a requerir, otra vez, actualizar este archivo a mano en
   un tercer lugar (además de `discovery.schema.json` y, mientras exista, `discoveryProtocol.js`).
   Si Conductor Workspace puede hacer `fetch` a los mismos `.schema.json` de la extensión (o a una
   copia empaquetada), sería el mismo cambio de arquitectura que ya se hizo en Harness vía Fase 5,
   aplicado ahora del lado Electron — pero eso es una decisión de arquitectura, no un fix de datos,
   y queda fuera de esta revisión.
2. **Migración `onboarding/` → `core/`.** El usuario mencionó que `debug.html` va a mudarse de
   carpeta. No se tocaron rutas ni imports en esta revisión — cuando ese move ocurra, hay que
   confirmar que el `Content-Security-Policy` (`ws://localhost:4124`, `http://localhost:48215`) y
   los endpoints hardcodeados sigan siendo válidos en la nueva ubicación.
3. Igual que en §23, sigue pendiente auditar `landing.schema.json` por el mismo patrón de drift.

---

*Documento consolidado — v1.4 · Jul 11 2026*
*Corrección aplicada sobre v1.3 (Jul 11 2026): mismo drift de GitHub Device Flow que en §23, ahora
corregido en `debug.html` (Conductor Workspace, contraparte de Harness del lado Electron/host). Ver
§24.*

---

## 25. Adenda — VAULT_INITIALIZED, institucionalización (v1.5, Jul 12 2026)

> **Número de versión de este documento: 1.5**

**Archivos releídos para esta corrección:** `background.js`, `discovery.js`, `synapse-bridge.js`,
`server_manager.py`, `milestone-registry.js` — verificación capa por capa del evento
`VAULT_INITIALIZED` a través de toda la cadena. Ver `discovery_schema.json` y
`prompt_update_harness_vault_initialized.md` para el detalle completo de esa verificación; esta
sección resume lo que aporta la ronda específicamente sobre el Harness.

### Qué cambia (y qué no) en el Harness

- **`harness_schema.json` (protocolo `ionpump`) — sin cambios.** No corresponde agregar
  `VAULT_INITIALIZED` al enum `event_name` de `event_emit`. Ese protocolo es para automatización DOM
  sobre ion sites reales (`github.com`, `claude.ai`, `anthropic.com`); `vault_initialized` es
  host-driven, sin manifestación DOM en ningún sitio registrado. `discovery_schema.json` es la única
  fuente que necesita el evento.
- **`harness_generator.py` — sin cambios.** Solo copia estáticos (`index.html`, `harness.js`,
  `harnessProtocol.js`); no tiene listas de eventos hardcodeadas, así que no hay drift que corregir
  ahí.
- **`harness.js` (`ProtocolReader`) — sin cambios de código, pero relevante para el hallazgo de abajo.**
  Deriva la UI dinámicamente de los tres JSON schemas vía `fetch()`, pero da prioridad a los
  "legacy globals" (`window.DISCOVERY_PROTOCOL_MANIFEST`, etc.) sobre el JSON: si el legacy global
  está presente, el JSON schema correspondiente se salta por completo (`discoverFromJSON()`, chequeo
  `alreadyLoaded`).

### Hallazgo nuevo — 6ta instancia del patrón transversal (§5, PROTOCOLO v3)

`discoveryProtocol.js` — el legacy manifest #1 ya identificado en §5 (el mismo archivo del par
retirado `GITHUB_PAT_DETECTED`/`GITHUB_TOKEN_STORED`, ver §23) — define `self.DISCOVERY_PROTOCOL_MANIFEST`
con su propia copia de `messages`/`observable_events`, y esa copia **sigue sin**
`vault_initialized`/`VAULT_INITIALIZED` (línea 275, línea 560-571).

Como `ProtocolReader` prioriza el legacy global sobre el JSON, el fix de `discovery_schema.json`
puede quedar neutralizado en cualquier contexto donde `discoveryProtocol.js` esté cargado junto con
`harness.js`: el Harness mostraría el manifest viejo (sin `VAULT_INITIALIZED`) aunque el JSON ya esté
al día, exactamente el mismo mecanismo de drift que ya se documentó cinco veces antes en §5.

### Pendiente — fuera de alcance de este documento

1. Aplicar el mismo fix (agregar el mensaje `vault_initialized` y `VAULT_INITIALIZED` a
   `observable_events`) directamente en `discoveryProtocol.js` — o, mejor, dado el patrón repetido en
   §5, evaluar deprecar el legacy global una vez confirmado que el JSON alcanza en todos los
   contextos donde hoy corre `discoveryProtocol.js`.
2. **`harnessProtocol.js`** (análogo legacy del protocolo Harness) — no estuvo disponible en esta
   sesión, no confirmado si tiene el mismo problema.
3. Sigue pendiente, igual que en §23-24, auditar `landing.schema.json` por el mismo patrón de drift.

---

*Documento consolidado — v1.5 · Jul 12 2026*
*Corrección aplicada sobre v1.4 (Jul 11 2026): institucionalización de `VAULT_INITIALIZED` verificada
capa por capa; identificada 6ta instancia del patrón de drift entre legacy global y JSON schema
(§5), esta vez en `discoveryProtocol.js` respecto de `vault_initialized`. Ver §25.*

**VERSIÓN: 1.5**
