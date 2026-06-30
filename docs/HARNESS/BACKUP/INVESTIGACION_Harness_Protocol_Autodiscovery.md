# Investigación: Harness Protocol Autodiscovery
## Harness como lector de protocolos, no duplicador de contratos

---

## 1. El problema raíz: duplicación de contratos

La versión anterior del Harness definía una tabla estática de mensajes que podía simular. Esa tabla era una copia manual del contrato que ya existe en `discoveryProtocol.js` y `landingProtocol.js`. Cada vez que Discovery agregara un nuevo paso de onboarding — un nuevo sitio web, un nuevo evento, una nueva transición de estado — habría que actualizar dos lugares: el protocolo real y la tabla del Harness.

Eso es duplicación por definición. Y la duplicación en sistemas de desarrollo se paga en el peor momento: cuando estás debuggeando algo urgente y el Harness tiene una versión vieja del contrato.

**El principio correcto:** el Harness no tiene un protocolo propio. El Harness lee los protocolos existentes en runtime y genera su UI a partir de ellos.

---

## 2. Dónde viven los protocolos hoy

Los protocolos ya existen como archivos JavaScript dentro de la extensión:

```
extension/
├── discovery/
│   └── discoveryProtocol.js     ← contrato del flujo de onboarding
└── landing/
    └── landingProtocol.js       ← contrato del flujo de landing
```

Estos archivos definen los eventos, comandos, transiciones de estado, y payloads que el sistema reconoce. Son la fuente de verdad. El Harness tiene que leerlos — no copiarlos.

---

## 3. El mecanismo: Protocol Reader en Cortex

### 3.1 El contrato autodescriptivo

Para que el Harness pueda leer los protocolos en runtime, los protocolos necesitan exponer una estructura autodescriptiva. No cambia lo que hacen — solo agrega un bloque de metadatos que describe lo que ya hacen.

Cada protocolo exporta un objeto `PROTOCOL_MANIFEST`:

```javascript
// discoveryProtocol.js — agrega al final, no modifica nada existente

self.DISCOVERY_PROTOCOL_MANIFEST = {
  version: "1.0.0",
  protocol: "discovery",
  description: "Onboarding flow — GitHub auth, API key detection, account registration",

  messages: [
    {
      id: "onboarding_navigate",
      type: "command",
      direction: "harness_to_background",
      description: "Navigate Discovery to a specific onboarding step",
      payload_template: {
        command: "onboarding_navigate",
        payload: { step: "$STEP" }
      },
      parameters: [
        {
          name: "step",
          type: "enum",
          variable: "$STEP",
          options: ["welcome", "github_auth", "github_confirm", "api_key", "complete"]
        }
      ]
    },
    {
      id: "github_pat_detected",
      type: "event",
      direction: "harness_to_background",
      description: "Simulate clipboard monitor detecting a GitHub PAT",
      payload_template: {
        event: "GITHUB_PAT_DETECTED",
        token: "$TOKEN"
      },
      parameters: [
        {
          name: "token",
          type: "string",
          variable: "$TOKEN",
          default: "ghp_simulatedToken123456789"
        }
      ]
    },
    {
      id: "github_token_stored",
      type: "event",
      direction: "harness_to_background",
      description: "Simulate user confirming GitHub token",
      payload_template: {
        event: "GITHUB_TOKEN_STORED",
        token_fingerprint: "$FINGERPRINT",
        profile_id: "$PROFILE_ID",
        launch_id: "$LAUNCH_ID"
      },
      parameters: [
        {
          name: "token_fingerprint",
          type: "string",
          variable: "$FINGERPRINT",
          default: "ghp_...abc123"
        },
        {
          name: "profile_id",
          type: "auto",
          variable: "$PROFILE_ID",
          source: "HARNESS_CONFIG.profileId"
        },
        {
          name: "launch_id",
          type: "auto",
          variable: "$LAUNCH_ID",
          source: "SYNAPSE_CONFIG.launchId"
        }
      ]
    }
    // ... resto de mensajes
  ],

  observable_events: [
    "HANDSHAKE_CONFIRMED",
    "API_KEY_REGISTERED",
    "ACCOUNT_REGISTERED",
    "DISCOVERY_COMPLETE"
  ]
};
```

**Principio de diseño:** los parámetros con `type: "auto"` y `source` se rellenan automáticamente desde el config activo. El developer no tiene que tipearlos. Los parámetros con `type: "string"` o `type: "enum"` aparecen como campos editables en el Harness.

### 3.2 El Protocol Reader

El Harness tiene un módulo `ProtocolReader` que carga los manifests al inicializarse:

```javascript
// harness/index.html — bloque interno ProtocolReader

class ProtocolReader {
  constructor() {
    this.protocols = {};
  }

  async loadAll() {
    // Los manifests están en el mismo contexto de extensión
    // Se accede via importScripts o directamente si están en self.*
    
    const available = [
      { key: 'discovery', global: 'DISCOVERY_PROTOCOL_MANIFEST' },
      { key: 'landing',   global: 'LANDING_PROTOCOL_MANIFEST' }
    ];

    for (const { key, global } of available) {
      if (self[global]) {
        this.protocols[key] = self[global];
      }
    }

    return this.protocols;
  }

  getProtocol(key) {
    return this.protocols[key] || null;
  }

  getAllMessages(protocolKey) {
    const protocol = this.protocols[protocolKey];
    if (!protocol) return [];
    return protocol.messages || [];
  }

  resolvePayload(message, overrides = {}) {
    // Toma el payload_template y resuelve las variables
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
    for (const part of parts) {
      obj = obj?.[part];
    }
    return obj || null;
  }
}
```

### 3.3 Cómo el Harness genera la UI del Panel Simulate

El Panel Simulate no tiene botones hardcodeados. Los genera dinámicamente desde los manifests:

```javascript
function renderSimulatePanel(protocolKey) {
  const messages = reader.getAllMessages(protocolKey);
  const container = document.getElementById('simulate-panel');
  container.innerHTML = '';

  for (const message of messages) {
    const card = createMessageCard(message);
    container.appendChild(card);
  }
}

function createMessageCard(message) {
  const card = document.createElement('div');
  card.className = 'message-card';

  // Header con descripción
  card.innerHTML = `
    <div class="card-header">
      <span class="message-id">${message.id}</span>
      <span class="message-type ${message.type}">${message.type}</span>
    </div>
    <div class="card-description">${message.description}</div>
  `;

  // Campos editables para parámetros no-auto
  const editableParams = message.parameters.filter(p => p.type !== 'auto');
  if (editableParams.length > 0) {
    const fields = document.createElement('div');
    fields.className = 'param-fields';
    for (const param of editableParams) {
      fields.appendChild(createParamField(param));
    }
    card.appendChild(fields);
  }

  // Preview del payload resuelto
  const preview = document.createElement('pre');
  preview.className = 'payload-preview';
  preview.textContent = JSON.stringify(reader.resolvePayload(message), null, 2);
  card.appendChild(preview);

  // Botón dispatch
  const btn = document.createElement('button');
  btn.textContent = 'Dispatch';
  btn.onclick = () => dispatchMessage(message, card);
  card.appendChild(btn);

  return card;
}
```

Cuando se agrega un nuevo mensaje al manifest de Discovery, aparece automáticamente en el Panel Simulate sin tocar el Harness.

---

## 4. El problema de IONPump: chrome.tabs.sendMessage vs chrome.runtime.sendMessage

Esta es la frontera que la investigación anterior identificó correctamente. Necesita resolverse con un ejemplo concreto.

### 4.1 Diferencia entre los dos canales

**`chrome.runtime.sendMessage`** — broadcast a todos los listeners de la extensión. Cualquier página de la extensión que tenga `onMessage` lo recibe: background.js, Discovery, Landing, y el Harness.

**`chrome.tabs.sendMessage(tabId, msg)`** — mensaje dirigido a un content script corriendo en una tab específica. El Harness no lo recibe automáticamente porque no está corriendo en esa tab. Solo lo recibe el content script de esa tab.

En el flujo de onboarding, todo pasa por `chrome.runtime.sendMessage` y el Harness puede participar normalmente. En IONPump, el flujo es diferente:

```
Brain → bloom-host → background.js → chrome.tabs.sendMessage(tabId) → content.js en claude.ai
content.js hace DOM actions en claude.ai
content.js → chrome.runtime.sendMessage → background.js
background.js → bloom-host → Brain
```

El Harness ve los mensajes del paso 4 y 5 (los que van por `chrome.runtime`), pero no puede interceder en el paso 3 (el `tabs.sendMessage` dirigido al content script).

### 4.2 Caso hipotético: debuggear IONPump para claude.ai

Escenario: estás desarrollando el flow `send_prompt` del recipe `claude.ai/message.ion`. El flow hace:
1. `DOM_FOCUS` → content.js focaliza el input
2. `DOM_TYPE` → content.js tipea el prompt
3. `DOM_CLICK` → content.js hace clic en submit
4. content.js emite `RESPONSE_READY` via `chrome.runtime`

El problema de debug tiene dos direcciones:

**Dirección A — simular que Brain envió comandos DOM sin tener Brain corriendo:**
El Harness quiere enviar `DOM_FOCUS`, `DOM_TYPE`, `DOM_CLICK` al content script de claude.ai para probar que el content script ejecuta correctamente. Pero esos mensajes van por `tabs.sendMessage` y el Harness necesita conocer el `tabId` de la tab donde está abierto claude.ai.

**Dirección B — simular que el content script completó su trabajo sin tener claude.ai abierto:**
El Harness quiere emitir `RESPONSE_READY` como si lo hubiera emitido el content script, para probar que `background.js` lo procesa correctamente y lo reenvía a Brain.

### 4.3 Solución: el Harness como Tab-Aware Proxy

Para la Dirección A, el Harness necesita un paso previo de descubrimiento de tab:

```javascript
// Panel Config del Harness — sección IONPump

async function discoverIonTabs() {
  const tabs = await chrome.tabs.query({});
  const ionTabs = tabs
    .filter(tab => tab.url && isIonSite(tab.url))
    .map(tab => ({ id: tab.id, url: tab.url, title: tab.title }));

  renderTabSelector(ionTabs);
}

function isIonSite(url) {
  const ionDomains = ['claude.ai', 'chatgpt.com', 'grok.com', 'aistudio.google.com'];
  return ionDomains.some(domain => url.includes(domain));
}

function dispatchToTab(tabId, message) {
  chrome.tabs.sendMessage(tabId, message, (response) => {
    addFeedEntry('sim-tab', message, `→ tab ${tabId}`);
  });
}
```

Para la Dirección B, el Harness ya puede hacerlo: `chrome.runtime.sendMessage` broadcast sin necesitar tabId.

### 4.4 El manifest de IONPump en el protocolo

Cuando IONPump sea implementado, agrega su propio manifest al sistema:

```javascript
// content.js (o un ionsites-protocol.js separado)

self.HARNESS_PROTOCOL_MANIFEST = {
  version: "1.0.0",
  protocol: "harness",
  description: "Web automation runtime — DOM commands and site events",

  // Mensajes que van POR chrome.runtime (el Harness puede simularlos directamente)
  runtime_messages: [
    {
      id: "site_ready",
      type: "event",
      direction: "content_to_background",
      channel: "runtime",
      description: "Content script signals the site is loaded and ready",
      payload_template: {
        event: "SITE_READY",
        site: "$SITE",
        tab_id: "$TAB_ID"
      },
      parameters: [
        { name: "site", type: "enum", variable: "$SITE",
          options: ["claude.ai", "chatgpt.com", "grok.com", "aistudio.google.com"] },
        { name: "tab_id", type: "auto", variable: "$TAB_ID", source: "selectedTabId" }
      ]
    },
    {
      id: "response_ready",
      type: "event",
      direction: "content_to_background",
      channel: "runtime",
      description: "Content script signals that the AI response is complete",
      payload_template: {
        event: "RESPONSE_READY",
        site: "$SITE",
        tab_id: "$TAB_ID"
      },
      parameters: [
        { name: "site", type: "enum", variable: "$SITE",
          options: ["claude.ai", "chatgpt.com", "grok.com", "aistudio.google.com"] },
        { name: "tab_id", type: "auto", variable: "$TAB_ID", source: "selectedTabId" }
      ]
    }
  ],

  // Mensajes que van POR chrome.tabs.sendMessage (el Harness necesita tabId)
  tab_messages: [
    {
      id: "dom_focus",
      type: "command",
      direction: "background_to_content",
      channel: "tabs",
      description: "Focus a DOM element in the active ion tab",
      payload_template: {
        command: "DOM_FOCUS",
        selector: "$SELECTOR"
      },
      parameters: [
        { name: "selector", type: "string", variable: "$SELECTOR",
          default: "#chat-input" }
      ]
    },
    {
      id: "dom_type",
      type: "command",
      direction: "background_to_content",
      channel: "tabs",
      description: "Type text into a DOM element",
      payload_template: {
        command: "DOM_TYPE",
        selector: "$SELECTOR",
        text: "$TEXT",
        delay: 50
      },
      parameters: [
        { name: "selector", type: "string", variable: "$SELECTOR", default: "#chat-input" },
        { name: "text", type: "string", variable: "$TEXT", default: "Test prompt from Harness" }
      ]
    }
  ]
};
```

El `ProtocolReader` del Harness diferencia los dos tipos de mensaje por el campo `channel`:

- `channel: "runtime"` → usa `chrome.runtime.sendMessage`
- `channel: "tabs"` → usa `chrome.tabs.sendMessage(selectedTabId, ...)`

El Panel Config muestra el selector de tab activo cuando el protocolo cargado tiene mensajes de tipo `tabs`.

---

## 5. El problema de agregar un nuevo sitio a IONPump

Pregunta: si se agrega `perplexity.ai` a IONPump, ¿qué se actualiza y dónde?

### 5.1 Lo que cambia en el backend (Brain)

Se crea un nuevo recipe: `ionsites/perplexity.ai/message.ion`. IonPumpManager lo detecta por hot-reload (watchdog del filesystem). No hay cambios en Brain más allá del recipe.

### 5.2 Lo que cambia en Cortex

El content script que existe hoy ya corre en todos los sitios según el `matches` del manifest. Si el pattern es `"<all_urls>"` o incluye `"https://perplexity.ai/*"`, el content script ya está inyectado en perplexity sin cambios.

Si el manifest de Cortex no incluye perplexity en `content_scripts.matches`, hay que agregar el dominio ahí. Eso requiere actualizar el `.blx` — es un cambio de Cortex.

### 5.3 Lo que cambia en el protocolo para que el Harness lo lea

En `HARNESS_PROTOCOL_MANIFEST`, se agrega perplexity al campo `options` de los parámetros `site`:

```javascript
options: ["claude.ai", "chatgpt.com", "grok.com", "aistudio.google.com", "perplexity.ai"]
```

El Harness lo refleja automáticamente en runtime sin ningún cambio en su código.

### 5.4 Lo que NO cambia

- El Harness (`harness/index.html`) no se toca
- El `ProtocolReader` no se toca
- Landing no necesita cambios por agregar un sitio (Landing es el dashboard de sesión, no el ejecutor de automatización)

El patrón es: la fuente de verdad vive en el protocolo. El Harness la lee. Solo se actualiza la fuente.

---

## 6. Harness en dev vs prod — por qué vive en Brain templates y no en el .blx

### 6.1 La decisión

El Harness vive en `brain/core/profile/web/templates/harness/` y Brain lo copia durante el seed. No está en el artefacto `.blx` de Cortex.

### 6.2 Por qué

**Razón primaria — separación de versiones dev/prod:** el Harness es una herramienta de desarrollo. En producción no debe existir. Si viviera en el `.blx`, habría que tener dos builds de Cortex: uno con Harness y uno sin. Eso complica el pipeline de builds de Cortex.

Viviendo en Brain templates, la lógica es trivial: en un build de Brain de producción, `generate_harness_page()` es un no-op o simplemente no se llama. El directorio `harness/` nunca se crea en el filesystem del usuario de producción. La URL `chrome-extension://{id}/harness/index.html` devuelve 404 — que es exactamente lo que querés.

**Razón secundaria — flexibilidad de hidratación:** `generate_harness_page()` puede recibir parámetros dinámicos del perfil igual que `generate_discovery_page()`. Si el Harness en el futuro necesita inyectar datos del perfil en el HTML (feature flags, flags de debug, rutas de logs), Brain puede hacerlo en el momento del seed. Con el `.blx`, eso es imposible sin un paso de postprocesado.

**Razón terciaria — ciclo de actualización independiente:** el Harness puede actualizarse sin tocar Cortex. Si agregás una feature al Harness, hacés un re-seed. No hay que empaquetar, firmar y distribuir un nuevo `.blx`. El ciclo de desarrollo del Harness es local y rápido.

### 6.3 El argumento del re-seed para refrescar

El re-seed del mismo perfil sobreescribe `harness.synapse.config.js` y reemplaza `harness/index.html`. Si el developer actualiza la versión de Brain que incluye una versión nueva del Harness, un re-seed lo aplica sin reinstalar Cortex. Eso es poderoso: el Harness se actualiza con frecuencia durante el desarrollo y el mecanismo de actualización es simplemente `sentinel seed --profile-id {id} --reseed`.

---

## 7. El flujo completo de actualización cuando cambia Discovery

Escenario concreto: se agrega el paso `gemini_auth` al flujo de onboarding de Discovery.

**Paso 1 — Developer actualiza `discoveryProtocol.js`:** agrega el handler para el nuevo evento y la transición de estado.

**Paso 2 — Developer actualiza `DISCOVERY_PROTOCOL_MANIFEST`:** agrega la entrada del nuevo mensaje con su `payload_template` y `parameters`.

```javascript
{
  id: "gemini_auth_complete",
  type: "event",
  direction: "harness_to_background",
  description: "Simulate Gemini auth completion",
  payload_template: {
    event: "GEMINI_AUTH_COMPLETE",
    api_key_fingerprint: "$FINGERPRINT",
    profile_id: "$PROFILE_ID",
    launch_id: "$LAUNCH_ID"
  },
  parameters: [
    { name: "api_key_fingerprint", type: "string", variable: "$FINGERPRINT", default: "gemini_...abc" },
    { name: "profile_id", type: "auto", variable: "$PROFILE_ID", source: "HARNESS_CONFIG.profileId" },
    { name: "launch_id", type: "auto", variable: "$LAUNCH_ID", source: "SYNAPSE_CONFIG.launchId" }
  ]
}
```

**Paso 3 — El Harness refleja el cambio automáticamente:** la próxima vez que se abre el Harness, `ProtocolReader` carga el manifest actualizado y el Panel Simulate muestra el nuevo botón de `gemini_auth_complete`.

No hay paso 4. No hay cambio en el Harness.

---

## 8. Estructura de archivos final

```
extension/
├── discovery/
│   ├── index.html
│   ├── discovery.js
│   ├── discoveryProtocol.js        ← agrega DISCOVERY_PROTOCOL_MANIFEST al final
│   └── ...
├── landing/
│   ├── index.html
│   ├── landing.js
│   ├── landingProtocol.js          ← agrega LANDING_PROTOCOL_MANIFEST al final
│   └── ...
└── harness/
    └── index.html                  ← autocontenido, lee manifests en runtime

brain/core/profile/web/
├── templates/
│   ├── discovery/                  ← sin cambios
│   ├── landing/                    ← sin cambios
│   └── harness/
│       └── index.html              ← copiado por Brain en seed
├── discovery_generator.py          ← sin cambios
├── landing_generator.py            ← sin cambios
└── harness_generator.py            ← NUEVO

sentinel/internal/seed/
└── seed.go                         ← agrega writeHarnessConfig()
```

---

## 9. Resumen de principios de diseño

**El Harness no tiene protocolo propio.** Lee los protocolos existentes en runtime. Es un lector, no un duplicador.

**El manifest es el contrato.** Cada protocolo expone un `*_PROTOCOL_MANIFEST` autodescriptivo. El Harness genera UI desde ese manifest. Agregar features al protocolo actualiza el Harness automáticamente.

**Los canales son tipos, no hardcoding.** El manifest diferencia mensajes de `runtime` y de `tabs`. El Harness selecciona el mecanismo de dispatch correcto según el tipo. Nuevos tipos de canal se agregan al manifest sin tocar el Harness.

**Dev/prod por construcción, no por flags.** El Harness existe en builds de dev porque Brain lo genera en seed. No existe en prod porque Brain no lo genera. No hay flags de feature, no hay builds separados de Cortex.

**Re-seed como mecanismo de actualización.** Cambios en el Harness se aplican con un re-seed. No requieren empaquetar ni distribuir Cortex.

---

*Documento generado como revisión y extensión de INVESTIGACION_Synapse_Harness_Debug_Page.md. Este documento lo reemplaza en los puntos que refina.*
