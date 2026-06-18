# Bloom — Harness + IonPump Integration Master
## Documento de Integración v1.0
### Estado: Aprobado para desarrollo — Milestone GitHub Onboarding

---

## 0. Preámbulo — Por qué este documento existe

Este documento resuelve una tensión arquitectónica real: Harness e IonPump se especificaron por separado, pero comparten superficie. Sin este documento, un implementador puede duplicar contratos, abrir canales paralelos, o construir el Harness contra una tabla estática que se desactualiza el día uno.

**Regla de oro que gobierna ambas features:**
> La fuente de verdad es el protocolo. El Harness la lee. IonPump la alimenta. Nadie la duplica.

---

## 1. Mapa de responsabilidades — quién hace qué

```
┌─────────────────────────────────────────────────────────────────────┐
│                     ECOSYSTEM VIEW                                   │
├──────────────┬──────────────────────────────────────────────────────┤
│ COMPONENTE   │ ROL EN HARNESS/IONPUMP                               │
├──────────────┼──────────────────────────────────────────────────────┤
│ Brain        │ Aloja IonPumpManager (runtime). Expone admin CLI.     │
│              │ Genera harness_generator.py en seed.                  │
├──────────────┼──────────────────────────────────────────────────────┤
│ Sentinel     │ Ejecuta writeHarnessConfig() en seed.                 │
│              │ Copia harness/index.html desde Brain templates.       │
│              │ No participa del runtime de IonPump.                  │
├──────────────┼──────────────────────────────────────────────────────┤
│ Cortex       │ Aloja harness/index.html (copiado por Sentinel/Brain).│
│              │ Expone DISCOVERY_PROTOCOL_MANIFEST y                  │
│              │ IONPUMP_PROTOCOL_MANIFEST en self.*                   │
│              │ El content.js ejecuta comandos DOM de IonPump.        │
│              │ NO modifica nada más.                                 │
├──────────────┼──────────────────────────────────────────────────────┤
│ Metamorph    │ Inspecciona y reconcilia .ion recipes en filesystem.  │
│              │ Actualiza recetas sin reiniciar Brain (via manifest). │
│              │ NO participa del runtime IonPump en ejecución.        │
├──────────────┼──────────────────────────────────────────────────────┤
│ Harness      │ Herramienta de debug. Lee manifests de protocolo en   │
│              │ runtime. Genera UI dinámica. Observa y simula.        │
│              │ No tiene protocolo propio. No abre canales propios.   │
└──────────────┴──────────────────────────────────────────────────────┘
```

---

## 2. El problema que Harness resuelve y el que IonPump resuelve

Son problemas ortogonales que comparten infraestructura.

**Harness resuelve:** "¿Cómo debuggeo el flujo de onboarding sin un usuario real, sin tener todos los componentes corriendo, y sin que el Harness se desactualice cada vez que Discovery agrega un paso?"

**IonPump resuelve:** "¿Cómo ejecuta Brain acciones DOM en sitios web arbitrarios sin hardcodear lógica por sitio, sin requerir deploy de Cortex cuando cambia la UI de un sitio, y manteniendo el protocolo Synapse existente sin modificaciones?"

**La superficie compartida:** ambos necesitan que Cortex exponga manifests de protocolo legibles en runtime. IonPump define el `IONPUMP_PROTOCOL_MANIFEST`. El Harness lo lee. Es una relación unidireccional: IonPump produce, Harness consume.

---

## 3. Harness — Arquitectura definitiva

### 3.1 Principio de diseño: lector de protocolos, no duplicador

El Harness NO tiene tabla de mensajes propia. NO define eventos. NO mantiene contratos. Todo eso vive en:

```
extension/
├── discovery/discoveryProtocol.js    → DISCOVERY_PROTOCOL_MANIFEST
├── landing/landingProtocol.js        → LANDING_PROTOCOL_MANIFEST
└── (futuro) ionpump_protocol.js      → IONPUMP_PROTOCOL_MANIFEST
```

Cada protocolo exporta un objeto `*_PROTOCOL_MANIFEST` en `self.*`. El Harness los descubre y lee al inicializarse. Agregar un mensaje al protocolo actualiza el Harness automáticamente. No hay paso 2.

### 3.2 Dónde vive el Harness

**El Harness NO vive en el .blx de Cortex.** Vive en Brain templates y Sentinel lo copia durante el seed.

```
brain/core/profile/web/
├── templates/
│   └── harness/
│       └── index.html        ← fuente en Brain
└── harness_generator.py      ← NUEVO: genera/hidrata el template

sentinel/internal/seed/
└── seed.go                   ← agrega writeHarnessConfig()
                               ← copia harness/index.html al directorio de Cortex
```

**Por qué:** en prod, `generate_harness_page()` es un no-op. El directorio `harness/` nunca se crea. La URL devuelve 404. No hay builds separados de Cortex ni flags de feature.

**Ciclo de actualización del Harness:** re-seed. No requiere empaquetar ni firmar un nuevo `.blx`.

### 3.3 El manifest autodescriptivo — contrato de adición

Cada protocolo existente agrega al final un bloque `*_PROTOCOL_MANIFEST`. No modifica nada de su lógica:

```javascript
// discoveryProtocol.js — AGREGA AL FINAL, no modifica nada

self.DISCOVERY_PROTOCOL_MANIFEST = {
  version: "1.0.0",
  protocol: "discovery",

  messages: [
    {
      id: "onboarding_navigate",
      type: "command",
      direction: "harness_to_background",
      channel: "runtime",                     // → chrome.runtime.sendMessage
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
      channel: "runtime",
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
      channel: "runtime",
      description: "Simulate user confirming GitHub token",
      payload_template: {
        event: "GITHUB_TOKEN_STORED",
        token_fingerprint: "$FINGERPRINT",
        profile_id: "$PROFILE_ID",
        launch_id: "$LAUNCH_ID"
      },
      parameters: [
        { name: "token_fingerprint", type: "string", variable: "$FINGERPRINT", default: "ghp_...abc123" },
        { name: "profile_id", type: "auto", variable: "$PROFILE_ID", source: "HARNESS_CONFIG.profileId" },
        { name: "launch_id", type: "auto", variable: "$LAUNCH_ID", source: "SYNAPSE_CONFIG.launchId" }
      ]
    }
  ],

  observable_events: [
    "HANDSHAKE_CONFIRMED",
    "API_KEY_REGISTERED",
    "ACCOUNT_REGISTERED",
    "DISCOVERY_COMPLETE"
  ]
};
```

**Tipos de parámetro:**
- `type: "auto"` + `source`: se resuelve desde config activo, invisible al developer
- `type: "string"`: campo editable en el Harness
- `type: "enum"`: dropdown en el Harness

**Tipos de canal:**
- `channel: "runtime"` → `chrome.runtime.sendMessage`
- `channel: "tabs"` → `chrome.tabs.sendMessage(selectedTabId, ...)` (para comandos DOM de IonPump)

### 3.4 ProtocolReader — el motor del Harness

```javascript
class ProtocolReader {
  constructor() { this.protocols = {}; }

  async loadAll() {
    const available = [
      { key: 'discovery', global: 'DISCOVERY_PROTOCOL_MANIFEST' },
      { key: 'landing',   global: 'LANDING_PROTOCOL_MANIFEST' },
      { key: 'ionpump',   global: 'IONPUMP_PROTOCOL_MANIFEST' }   // cuando exista
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
    return source.split('.').reduce((obj, part) => obj?.[part], self) || null;
  }
}
```

### 3.5 Lo que el Harness hace y lo que no hace

| Hace | No hace |
|------|---------|
| Observa mensajes `chrome.runtime` pasivamente | Abre su propio Native Messaging port |
| Genera UI dinámica desde manifests | Tiene tabla de mensajes hardcodeada |
| Despacha mensajes a `background.js` vía `chrome.runtime.sendMessage` | Habla directamente con bloom-host |
| Lee `SYNAPSE_CONFIG` y `HARNESS_CONFIG` para resolver parámetros `auto` | Modifica el estado de iones |
| Existe en builds de dev (seed lo genera) | Existe en prod |
| Se actualiza con re-seed | Requiere rebuild de Cortex para actualizarse |

### 3.6 Milestone GitHub — mensajes mínimos requeridos en DISCOVERY_PROTOCOL_MANIFEST

Para que el onboarding de GitHub sea debuggeable desde el Harness desde el día uno:

```
onboarding_navigate         → navegar a github_auth
github_pat_detected         → simular clipboard con PAT
github_token_stored         → simular confirmación de token
account_registered          → simular registro de cuenta GitHub
host_ready                  → completar handshake manualmente
discovery_complete          → simular fin de discovery
```

Estos 6 mensajes son el MVP del manifest para milestone GitHub.

---

## 4. IonPump — Arquitectura definitiva

### 4.1 Qué es y qué no es

IonPump es un **runtime de automatización web** que vive dentro de Brain. **No es un módulo CLI**. No es una extensión de Cortex. No modifica el protocolo Synapse. No toca el content.js.

Es la capa que traduce intenciones declarativas (`.ion` files) a comandos Synapse atómicos que el content.js ya sabe ejecutar.

### 4.2 Posición en el stack

```
IntentExecutor (Brain)
    │  detecta intent_subtype == "web_automation"
    ▼
IonPumpManager (Brain) — RUNTIME
    │  carga recipe .ion si no está en memoria
    │  resuelve flow
    │  traduce pasos → comandos Synapse
    ▼
SynapseServer (Brain) — SIN CAMBIOS
    │  recibe comandos de IonPump
    │  forwarda a Host via TCP
    ▼
bloom-host.exe — SIN CAMBIOS
    │  forwarda via Native Messaging a Cortex
    ▼
content.js (Cortex) — SIN CAMBIOS
    │  ejecuta acciones DOM
    │  envía ACK a Brain
```

**Nada en la cadena existente se modifica.** IonPump se inserta entre IntentExecutor y SynapseServer.

### 4.3 El archivo .ion — formato autodescriptivo

Cada sitio tiene su propio directorio bajo `ionsites/`. Cada directorio es un ion autocontenido con su propio manifest:

```
ionsites/
├── github.com/
│   ├── ion.manifest.json       ← NUEVO: autodescripción del ion
│   ├── auth.ion                ← flujo de autenticación
│   └── flows/
│       └── pat_detection.ion
├── claude.ai/
│   ├── ion.manifest.json
│   └── message.ion
└── _meta/
    └── versions.json
```

**El `ion.manifest.json`** es el mecanismo por el cual Brain "aprende" que un ion existe en runtime:

```json
{
  "site": "github.com",
  "version": "1.0.0",
  "description": "GitHub authentication and PAT detection flow",
  "entrypoint": "auth.ion",
  "flows": ["auth", "pat_detection"],
  "triggers": {
    "on_load": "bootstrap",
    "on_user_command": "auth",
    "on_pat_clipboard": "pat_detection"
  },
  "capabilities": ["auth", "clipboard_monitor"],
  "requires_cortex_version": ">=1.2.0"
}
```

Brain escanea `ionsites/*/ion.manifest.json` al arrancar y registra los iones disponibles. Cuando llega un intent `web_automation` para `github.com`, IonPumpManager ya sabe qué recipe cargar (lazy load del .ion real).

### 4.4 Formato .ion — milestone GitHub

El primer ion que debe existir es `github.com/auth.ion`:

```yaml
version: 1.0.0
site: github.com
description: "GitHub PAT authentication flow for Bloom onboarding"

entrypoints:
  on_load: bootstrap
  on_pat_clipboard: handle_pat_detected

variables:
  settings_url: "https://github.com/settings/tokens"
  new_token_url: "https://github.com/settings/tokens/new"

flows:
  bootstrap:
    description: "Verify GitHub is loaded and ready"
    steps:
      - wait:
          selector: "body"
          timeout: 10s
      - emit:
          event: "SITE_READY"
          payload: { site: "github.com" }

  handle_pat_detected:
    description: "Process detected PAT from clipboard"
    requires: ["SITE_READY"]
    steps:
      - emit:
          event: "GITHUB_PAT_DETECTED"
          payload:
            token: "$CONTEXT.clipboard_value"
      - transition:
          to: "await_confirmation"

  await_confirmation:
    description: "Wait for user confirmation in Discovery"
    steps:
      - wait:
          condition: "event_received"
          event: "GITHUB_TOKEN_CONFIRMED"
          timeout: 300s
      - emit:
          event: "GITHUB_TOKEN_STORED"
          payload:
            token_fingerprint: "$CONTEXT.token_fingerprint"
            profile_id: "$CONTEXT.profile_id"
            launch_id: "$CONTEXT.launch_id"

error_handlers:
  timeout:
    retry: 1
    fallback: "emit_error"
  selector_not_found:
    retry: 2
    fallback: "emit_error"
```

### 4.5 El ion y el Harness — cómo se conectan

Cuando IonPump existe, `discoveryProtocol.js` ya tiene el `DISCOVERY_PROTOCOL_MANIFEST` con los mensajes de GitHub. El Harness los lee y genera los botones de simulación.

IonPump agrega además el `IONPUMP_PROTOCOL_MANIFEST` en `ionpump_protocol.js` (archivo nuevo en Cortex, sin modificar nada existente):

```javascript
self.IONPUMP_PROTOCOL_MANIFEST = {
  version: "1.0.0",
  protocol: "ionpump",
  description: "Web automation runtime — ion site control",

  messages: [
    {
      id: "site_ready",
      type: "event",
      direction: "content_to_background",
      channel: "runtime",
      description: "Content script signals site loaded and ready",
      payload_template: { event: "SITE_READY", site: "$SITE", tab_id: "$TAB_ID" },
      parameters: [
        { name: "site", type: "enum", variable: "$SITE",
          options: ["github.com", "claude.ai", "chatgpt.com", "grok.com"] },
        { name: "tab_id", type: "auto", variable: "$TAB_ID", source: "selectedTabId" }
      ]
    },
    {
      id: "dom_focus",
      type: "command",
      direction: "background_to_content",
      channel: "tabs",                       // ← usa chrome.tabs.sendMessage
      description: "Focus a DOM element in active ion tab",
      payload_template: { command: "DOM_FOCUS", selector: "$SELECTOR" },
      parameters: [
        { name: "selector", type: "string", variable: "$SELECTOR", default: "#login_field" }
      ]
    }
  ]
};
```

El Harness detecta `channel: "tabs"` y activa el selector de tab activo en su panel Config.

### 4.6 Registro dinámico de iones en Brain — el autodiscovery

Brain registra iones en runtime, no en build time:

```python
# ionpump_loader.py — fragmento del mecanismo de registro

class IonLoader:
    def __init__(self, ionsites_path: str):
        self.ionsites_path = Path(ionsites_path)
        self.registry = {}

    def discover_all(self) -> dict:
        """Escanea ionsites/ y registra manifests. No carga .ion files."""
        for manifest_path in self.ionsites_path.glob("*/ion.manifest.json"):
            site = manifest_path.parent.name
            with open(manifest_path) as f:
                manifest = json.load(f)
            self.registry[site] = {
                "manifest": manifest,
                "recipe": None,          # lazy: carga cuando se necesita
                "path": manifest_path.parent
            }
        return self.registry

    def load_recipe(self, site: str) -> dict:
        """Carga el .ion file real solo cuando se necesita."""
        entry = self.registry.get(site)
        if not entry:
            raise IonNotFoundError(f"No ion registered for site: {site}")
        if entry["recipe"] is None:
            entrypoint = entry["manifest"]["entrypoint"]
            recipe_path = entry["path"] / entrypoint
            entry["recipe"] = self._parse_ion(recipe_path)
        return entry["recipe"]
```

**Patrón:** manifest scan al arrancar (barato), recipe load bajo demanda (costoso, solo cuando se ejecuta).

### 4.7 Actualizaciones via Metamorph

Metamorph es el único que escribe en `ionsites/`. Brain solo lee. El ciclo:

```
Nucleus detecta recipe desactualizado
    → invoca Metamorph con manifest firmado
    → Metamorph descarga nuevo recipe a staging/
    → valida SHA-256 contra manifest
    → swap atómico en ionsites/{site}/
    → IonPump watchdog detecta cambio en filesystem
    → recarga recipe sin reiniciar Brain
    → reporta a Nucleus: reconciliación exitosa
```

El watchdog de IonPump observa `ionsites/` con filesystem watcher (watchdog library). Cuando detecta un cambio en un `*.ion` o `ion.manifest.json`, valida el recipe antes de aplicarlo. Si la validación falla, mantiene la versión anterior (rollback implícito).

### 4.8 Milestone GitHub — scope mínimo de IonPump

Para que el milestone GitHub funcione con IonPump completamente operativo:

**Brain:**
- `ionpump_manager.py` — orchestrator
- `ionpump_loader.py` — con watchdog
- `ionpump_registry.py` — in-memory registry
- `ionpump_executor.py` — Ion → Synapse translator
- `ionpump_state.py` — state machine por (tab_id, domain)
- `ionpump_models.py` — dataclasses

**Recipes:**
- `github.com/ion.manifest.json`
- `github.com/auth.ion`

**Cortex:**
- `ionpump_protocol.js` — expone `IONPUMP_PROTOCOL_MANIFEST` en `self.*`
- `manifest.json` — agrega `ionpump_protocol.js` a `web_accessible_resources`

**Sentinel:**
- `seed.go` — `writeHarnessConfig()` + copia `harness/index.html`

**Metamorph:**
- `ionrecipes.go` — extiende `metamorph inspect` para mostrar ion recipes
- Formato de manifest para `.ion` files definido

---

## 5. Flujo completo — GitHub onboarding con Harness e IonPump activos

```
1. nucleus synapse launch <profileId> --mode discovery --override-step 0
   → Sentinel ejecuta seed: copia harness/index.html, escribe harness.synapse.config.js
   → Brain arranca IonPumpLoader: escanea ionsites/, registra github.com manifest
   → background.js conecta a bloom-host (handshake 3 fases)

2. Developer abre Harness en tab separada
   → ProtocolReader carga DISCOVERY_PROTOCOL_MANIFEST y IONPUMP_PROTOCOL_MANIFEST
   → Panel Simulate muestra botones generados dinámicamente
   → Feed muestra HANDSHAKE_CONFIRMED (confirma canal activo)

3. Developer simula: "onboarding_navigate · github_auth"
   → Harness → chrome.runtime.sendMessage({ command: 'onboarding_navigate', payload: { step: 'github_auth' } })
   → background.js → Discovery muestra pantalla github-login
   → IonPumpManager activa flow "bootstrap" para github.com
   → content.js en tab de GitHub emite SITE_READY

4. Developer simula: "Clipboard · GitHub PAT"
   → Harness → chrome.runtime.sendMessage({ event: 'GITHUB_PAT_DETECTED', token: 'ghp_...' })
   → background.js → Discovery muestra github-confirm
   → IonPumpManager ejecuta flow "handle_pat_detected"

5. Developer simula: "Confirm Token"
   → Harness construye payload desde HARNESS_CONFIG (profile_id, launch_id automáticos)
   → chrome.runtime.sendMessage({ event: 'GITHUB_TOKEN_STORED', ... })
   → background.js → bloom-host → Brain → Temporal → nucleus.json actualiza completed_steps

6. Feed del Harness muestra GITHUB_TOKEN_STORED saliendo
   → En 3-15s, nucleus.json: completed_steps: ["github_auth"]
   → Metamorph puede verificar estado con: metamorph inspect --ion-recipes
```

---

## 6. Contratos de archivos nuevos y modificados

### Archivos nuevos

```
brain/core/profile/web/
├── templates/harness/
│   └── index.html                    ← Harness UI (auto-contenido)
└── harness_generator.py              ← genera/hidrata template en seed

brain/core/ionpump/
├── ionpump_manager.py
├── ionpump_loader.py                 ← con watchdog para hot-reload
├── ionpump_registry.py
├── ionpump_executor.py
├── ionpump_state.py
├── ionpump_models.py
└── ionpump_validator.py

brain/commands/ionpump/
├── ionpump_inspect.py                ← brain ionpump inspect
├── ionpump_validate.py               ← brain ionpump validate
├── ionpump_reload.py                 ← brain ionpump reload
└── ionpump_test.py                   ← brain ionpump test (dry-run)

ionsites/                             ← ubicación: BloomNucleus/bin/cortex/ionsites/
├── github.com/
│   ├── ion.manifest.json
│   └── auth.ion
└── _meta/
    └── versions.json

installer/metamorph/internal/inspection/
└── ionrecipes.go                     ← extiende metamorph inspect
```

### Archivos modificados

```
extension/
├── discovery/discoveryProtocol.js    ← agrega DISCOVERY_PROTOCOL_MANIFEST al final
├── landing/landingProtocol.js        ← agrega LANDING_PROTOCOL_MANIFEST al final
└── manifest.json                     ← agrega harness/index.html y ionpump_protocol.js
                                         a web_accessible_resources

sentinel/internal/seed/seed.go        ← agrega writeHarnessConfig()
                                         copia harness/index.html al directorio Cortex

brain/core/intent/intent_executor.py  ← agrega detección intent_subtype == "web_automation"
                                         hook a IonPumpManager.execute_flow()
```

### Archivos que NO se modifican

```
background.js          ← lógica de mensajería intacta
discovery/index.html   ← intacto
discovery/discovery.js ← intacto
content.js             ← intacto
bloom-host.exe         ← intacto
SynapseServer          ← intacto
```

---

## 7. Reglas de implementación — lista de restricciones

Estas restricciones son no negociables. Cualquier implementación que las viole introduce deuda que se paga en el peor momento.

**Harness:**
1. El Harness NO define contratos de mensajes. Los lee.
2. El Harness NO abre `chrome.runtime.connectNative()`.
3. El Harness NO habla directamente con bloom-host.
4. El Harness NO existe en prod. Sentinel no lo copia en builds prod.
5. El Harness NO modifica el estado de iones. Solo observa y simula.

**IonPump:**
6. IonPump NO es un módulo CLI de usuario. Es un runtime interno.
7. IonPump NO hace eager loading de recipes. Lazy only.
8. IonPump NO modifica el protocolo Synapse.
9. IonPump NO modifica content.js.
10. IonPump NO hace llamadas de red. Todos los recipes son locales.
11. IonPump NO escribe en `ionsites/`. Solo Metamorph escribe ahí.

**Manifests:**
12. Cada protocolo exporta su `*_PROTOCOL_MANIFEST` como adición al final del archivo existente. NO modifica la lógica existente.
13. Los IDs de mensajes en el manifest son únicos dentro del protocolo.
14. Los parámetros `type: "auto"` son invisibles al developer en el Harness.

---

## 8. Invariantes del sistema que deben preservarse

Estos son los invariantes del sistema existente que Harness e IonPump deben respetar:

1. **Un solo canal Native Messaging.** Solo `background.js` tiene `nativePort`. Nadie más.
2. **Un solo handshake.** bloom-host espera exactamente un `extension_ready` por launch.
3. **background.js es el router.** Todos los mensajes pasan por él. Nadie lo saltea.
4. **Synapse es el protocolo de transporte.** IonPump lo usa, no lo reemplaza.
5. **Cortex es stateless.** No guarda estado de iones. Solo ejecuta.
6. **Metamorph no participa del Event Bus.** Es invocado bajo demanda por Nucleus.

---

## 9. Orden de implementación recomendado para milestone GitHub

```
Semana 1 — Fundaciones
  1. DISCOVERY_PROTOCOL_MANIFEST en discoveryProtocol.js (6 mensajes GitHub)
  2. harness_generator.py en Brain
  3. writeHarnessConfig() en Sentinel seed.go
  4. harness/index.html con ProtocolReader + UI dinámica

Semana 2 — IonPump Core
  5. ionpump_models.py (dataclasses)
  6. ionpump_loader.py (sin watchdog todavía)
  7. ionpump_registry.py
  8. ionpump_manager.py
  9. github.com/ion.manifest.json + auth.ion

Semana 3 — IonPump Execution + Integración
  10. ionpump_executor.py (Ion → Synapse commands)
  11. ionpump_state.py (state machine)
  12. Modificación de intent_executor.py
  13. IONPUMP_PROTOCOL_MANIFEST en ionpump_protocol.js
  14. manifest.json actualizado (harness + ionpump_protocol)

Semana 4 — Hot-reload + Metamorph + Validación end-to-end
  15. Watchdog en ionpump_loader.py
  16. ionpump_validator.py
  17. ionrecipes.go en Metamorph
  18. Test completo del flujo GitHub con Harness
```

---

## 10. Preguntas abiertas con owner asignado

| # | Pregunta | Owner | Blocking? |
|---|----------|-------|-----------|
| 1 | ¿El `ionpump_protocol.js` vive en Cortex o lo genera Brain en seed? | Arq. | Semana 3 |
| 2 | ¿Qué versión mínima de Cortex requiere el ion de github.com? | Cortex | Semana 2 |
| 3 | ¿El watchdog de IonPump usa `watchdog` library Python o polling manual? | Brain | Semana 4 |
| 4 | Formato exacto del manifest Metamorph para `.ion` files | Metamorph | Semana 4 |
| 5 | ¿`LANDING_PROTOCOL_MANIFEST` se requiere para milestone GitHub? | Arq. | No |

---

*Documento generado: 2026-04-01. Fuente de verdad: INVESTIGACION_Harness_Protocol_Autodiscovery.md.*
*Actualizar cuando cambien contratos de eventos, se agreguen protocolos o cambie el scope del milestone.*
