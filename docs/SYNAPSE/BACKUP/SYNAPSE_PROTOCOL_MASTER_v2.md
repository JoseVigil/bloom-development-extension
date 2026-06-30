# SYNAPSE PROTOCOL MASTER
## Arquitectura, Estado y Hoja de Ruta
### Bloom BTIPS — Documento fundacional del ducto de comunicación Chrome ↔ Brain
### Versión: 2.0 — Actualizado post-implementación Prompts A, B y C

---

> **Para el implementador / LLM que recibe este documento:**
>
> Este documento es la fuente de verdad del protocolo Synapse y sus tres activos.
> Fue construido a partir del código real verificado — no de documentación aspiracional.
> Cada sección distingue explícitamente entre lo que está **implementado**, lo que está
> **contratado pero no verificado en ejecución real**, y lo que **falta construir**.
>
> Antes de modificar cualquier componente Synapse, leer este documento completo.
> La distinción entre "implementado" y "verificado" es intencional y crítica.

---

## CHANGELOG

**v2.0 — Post-implementación Prompts A, B, C**
- Sección 7 (Gaps) actualizada: todos los handlers de `background.js` están implementados
- Tablas de estado actualizadas: Discovery, Landing, Harness
- Layer 3 actualizado: `_action_map` refleja handlers DOM + Landing + IonPump
- Constraint #7 de IonPump aclarado: aplica a `content.js`, no a `background.js`
- `SYNAPSE_DEBUG` corregido: estructura real del objeto en `background.js`
- Nuevo gap identificado: `content.js` DOM execution (desbloquea después de Test 5)
- Paths Darwin (macOS) agregados al lado de Windows

---

## 1. QUÉ ES SYNAPSE Y POR QUÉ EXISTE

Synapse es el **ducto de comunicación bidireccional** entre Brain (proceso Python en el host)
y Cortex (extensión Chrome). Es la única vía por la que Brain puede observar y controlar
lo que sucede en el browser.

El protocolo usa **Chrome Native Messaging**: Chrome invoca a `brain.exe` / `brain` como
proceso hijo al conectar la extensión, y la comunicación ocurre por `stdin/stdout` con
mensajes JSON prefijados por 4 bytes de longitud en formato Little Endian. Este canal es
el único que Chrome permite para comunicación con procesos nativos del host.

### Los tres activos del protocolo

```
┌─────────────────────────────────────────────────────────────────────┐
│ SYNAPSE PROTOCOL                                                    │
│                                                                     │
│  Discovery  ←→  Onboarding (GitHub auth, API key, registro)        │
│  Landing    ←→  Dashboard del perfil (estado, cuentas, acciones)   │
│  Harness    ←→  Debug UI (simular mensajes, observar eventos)       │
│                                                                     │
│  Los tres comparten el mismo canal Native Messaging.                │
│  Los tres son páginas dentro de la extensión Cortex.                │
│  Los tres leen configuración de *.synapse.config.js en runtime.     │
│  Los tres se autodescribren con un PROTOCOL_MANIFEST en self.*      │
└─────────────────────────────────────────────────────────────────────┘
```

### Por qué el Harness existe y qué rol cumple en esta etapa

El protocolo Synapse tiene tres activos, mensajes bidireccionales, un handshake de
múltiples fases, y una capa IPC para automatización. Desarrollar y depurar este sistema
sin observabilidad es inviable.

**El Harness es la herramienta de observabilidad y simulación del protocolo.** Permite:
- Observar todos los mensajes en tiempo real sin modificar el código de producción
- Simular mensajes de cualquier protocolo sin que el flujo completo esté implementado
- Verificar que los contratos (manifests) reflejan la realidad del código
- Testear handlers individuales de forma aislada

El Harness no tiene conocimiento hardcodeado de ningún mensaje — lee los manifests
dinámicamente. Cuando se agrega un nuevo mensaje al protocolo, el Harness lo refleja
automáticamente sin modificar `harness/index.html`.

**El Harness es la herramienta principal para verificar que el ducto Synapse funciona
end-to-end antes de que los flujos de producción estén completos.**

---

## 2. ARQUITECTURA DEL STACK COMPLETO

### Capas del sistema

```
┌──────────────────────────────────────────────────────────────────────┐
│ LAYER 5 — IonPump Runtime                                           │
│   brain/core/ionpump/                                               │
│   Ejecuta flujos .ion → genera SynapseCommand objects               │
│   Se comunica con Brain-Host vía IPC (TCP localhost)                │
└──────────────────────────┬───────────────────────────────────────────┘
                           │ TCP 127.0.0.1:{port}
┌──────────────────────────▼───────────────────────────────────────────┐
│ LAYER 4 — IPC Layer                                                 │
│   brain/core/synapse/synapse_ipc_server.py  (en Brain-Host process) │
│   brain/core/ionpump/ionpump_ipc.py         (en proceso IonPump)    │
│   Canal: TCP localhost                                              │
│   Port file: BloomNucleus/run/ipc_{launch_id}.port                  │
└──────────────────────────┬───────────────────────────────────────────┘
                           │ protocol.send_message()
┌──────────────────────────▼───────────────────────────────────────────┐
│ LAYER 3 — SynapseManager                                            │
│   brain/core/synapse/synapse_manager.py                             │
│   Dispatcher: _action_map → handlers                                │
│   Inicia SynapseIPCServer en thread daemon al arrancar              │
│   _action_map completo (v2.0):                                      │
│     SYSTEM_HELLO, HEARTBEAT, LOG_ENTRY                              │
│     DOM_FOCUS, DOM_TYPE, DOM_CLICK, DOM_WAIT,                       │
│     DOM_SCROLL, DOM_EXTRACT, EVENT_EMIT, STATE_TRANSITION           │
│     PROFILE_LOAD, HEALTH_CHECK, NUCLEUS_SYNC, INTENT_LIST           │
│     ION_EXECUTE_FLOW, ION_RELOAD, ION_INSPECT, DOM_COMMAND_ACK      │
└──────────────────────────┬───────────────────────────────────────────┘
                           │ stdin/stdout (4-byte LE prefix + JSON)
┌──────────────────────────▼───────────────────────────────────────────┐
│ LAYER 2 — SynapseProtocol                                           │
│   brain/core/synapse/synapse_protocol.py                            │
│   Transporte puro: read_message() / send_message()                  │
│   JSON con prefijo 4 bytes Little Endian (Chrome Native Messaging)  │
└──────────────────────────┬───────────────────────────────────────────┘
                           │ Chrome Native Messaging
┌──────────────────────────▼───────────────────────────────────────────┐
│ LAYER 1 — Cortex Extension                                          │
│   background.js — Service Worker, gestiona Native Messaging port    │
│                   Todos los handlers de protocolo implementados     │
│   content.js    — Ejecuta acciones DOM en páginas web               │
│                   ⚠️ DOM commands recibidos, ejecución pendiente    │
│   discovery/    — Onboarding UI                                     │
│   landing/      — Dashboard UI                                      │
│   harness/      — Debug UI (solo en dev builds)                     │
└──────────────────────────────────────────────────────────────────────┘
```

### Procesos involucrados y sus fronteras

```
Chrome (proceso)
  └── Cortex Extension (Service Worker)
        └── chrome.runtime.connectNative("bloom_host")
              └── [invoca via OS]
                    └── brain — PROCESO A (Brain-Host)
                          ├── SynapseManager.run_host_loop()  [bloqueante]
                          └── SynapseIPCServer [thread daemon]
                                └── escucha TCP 127.0.0.1:{port}
                                └── escribe BloomNucleus/run/ipc_{launch_id}.port

brain — PROCESO B (IntentExecutor / IonPump)
  └── IonPumpManager.execute_flow()
        └── IonPumpIPCClient
              └── lee BloomNucleus/run/ipc_{launch_id}.port
              └── conecta a PROCESO A via TCP localhost
```

**Principio crítico:** PROCESO A y PROCESO B son OS processes distintos.
No comparten memoria. El IPC layer es el único canal entre ellos.

### Paths por plataforma

| Recurso | Windows | macOS (Darwin) |
|---|---|---|
| BloomNucleus root | `%LOCALAPPDATA%\BloomNucleus\` | `~/Library/Application Support/BloomNucleus/` |
| ionsites/ | `...\bin\cortex\ionsites\` | `.../bin/cortex/ionsites/` |
| IPC port file | `...\run\ipc_{launch_id}.port` | `.../run/ipc_{launch_id}.port` |
| Profiles | `...\profiles\<uuid>\` | `.../profiles/<uuid>/` |

---

## 3. LOS TRES ACTIVOS — ESTADO REAL Y VERIFICADO

### Leyenda de estado

| Símbolo | Significado |
|---|---|
| ✅ | Implementado y verificado en código |
| ⚠️ | Implementado en código, pendiente verificación en ejecución real |
| 🔲 | No implementado — trabajo futuro definido |
| ⛔ | Bloqueado por dependencia externa |

---

### 3.1 Discovery

**Propósito:** Onboarding del usuario. Guía el flujo desde la instalación hasta
tener GitHub auth, API key, y cuenta registrada en Nucleus.

**Archivos en templates (Brain):**
```
brain/core/profile/web/templates/discovery/
├── index.html
├── discovery.js
├── script.js
├── discoveryProtocol.js        ← PROTOCOL object + DISCOVERY_PROTOCOL_MANIFEST
├── harnessProtocol.js         ← HARNESS_PROTOCOL_MANIFEST (leído por Harness)
├── content-aistudio.js
├── onboarding.js
└── styles.css
```

**Archivos generados en runtime:**
```
profiles/<uuid>/extension/discovery/   ← copiado por discovery_generator.py en seed
profiles/<uuid>/extension/
└── discovery.synapse.config.js        ← generado por Sentinel en launch
```

**DISCOVERY_PROTOCOL_MANIFEST — 8 mensajes implementados:**

| id | type | Descripción |
|---|---|---|
| `onboarding_navigate` | command | Navegar a un step del onboarding |
| `github_pat_detected` | event | Simular detección de PAT en clipboard |
| `github_token_stored` | event | Simular confirmación de token GitHub |
| `api_key_registered` | event | Simular registro exitoso de API key |
| `account_registered` | event | Simular registro de cuenta completado |
| `discovery_complete` | event | Simular finalización del onboarding |
| `handshake_confirmed` | event | Simular confirmación del handshake de 3 fases |
| `host_ready` | event | Simular señal de bloom-host listo |

**observable_events:** `HOST_READY`, `HANDSHAKE_CONFIRMED`, `API_KEY_REGISTERED`,
`ACCOUNT_REGISTERED`, `DISCOVERY_COMPLETE`

**Estado de Discovery:**

| Componente | Estado |
|---|---|
| Assets estáticos copiados por `discovery_generator.py` | ✅ |
| `harnessProtocol.js` incluido en `files_to_copy` | ✅ |
| `DISCOVERY_PROTOCOL_MANIFEST` al final de `discoveryProtocol.js` | ✅ |
| `discovery.synapse.config.js` generado por Sentinel en launch | ✅ |
| PROTOCOL object (fases, UI, mensajes) | ✅ |
| Handler `onboarding_navigate` en `background.js` | ✅ |
| Handler `GITHUB_PAT_DETECTED` en `background.js` | ✅ |
| Handler `GITHUB_TOKEN_STORED` en `background.js` | ✅ |
| Handler `ACCOUNT_REGISTERED` en `background.js` | ✅ |
| Handler `DISCOVERY_COMPLETE` en `background.js` | ✅ |
| Handshake 3 fases en `background.js` (`extension_ready` → `host_ready` → `handshake_confirm`) | ✅ |
| Handshake 3 fases end-to-end en sesión real | ⚠️ Pendiente — Test 5 |

**El handshake — implementado en background.js, verificación pendiente:**
```
1. background.js → Brain:  { command: "extension_ready", profile_id, launch_id }
2. Brain → background.js:  { command: "host_ready" }  ← SynapseManager responde
3. background.js → Brain:  { command: "handshake_confirm", profile_id, launch_id }
   → Brain emite { event: "HANDSHAKE_CONFIRMED" } hacia la extension
```

---

### 3.2 Landing

**Propósito:** Dashboard del perfil activo. Estado de sesión, cuentas vinculadas,
stats de uso, y acciones rápidas post-onboarding.

**Archivos en templates (Brain):**
```
brain/core/profile/web/templates/landing/
├── index.html
├── landing.js
├── landingProtocol.js          ← PROTOCOL object + LANDING_PROTOCOL_MANIFEST
└── styles.css
```

**Archivos generados en runtime:**
```
profiles/<uuid>/extension/landing/    ← copiado por landing_generator.py en seed
profiles/<uuid>/extension/
└── landing.synapse.config.js         ← generado por Sentinel en launch
```

**LANDING_PROTOCOL_MANIFEST — 6 mensajes implementados:**

| id | type | Descripción |
|---|---|---|
| `profile_load` | command | Solicitar recarga de datos del perfil |
| `health_check` | command | Health check con scope `extension`, `host`, o `full-stack` |
| `nucleus_sync` | command | Trigger de sync con Nucleus |
| `intent_list` | command | Lista de intents activos del perfil |
| `session_status` | event | Simular update de estado de sesión |
| `stats_update` | event | Simular update de stats |

**observable_events:** `SESSION_STATUS`, `STATS_UPDATE`, `PROFILE_LOADED`,
`HEALTH_CHECK_RESULT`

**Estado de Landing:**

| Componente | Estado |
|---|---|
| Assets estáticos copiados por `landing_generator.py` | ✅ |
| `LANDING_PROTOCOL_MANIFEST` con guard `typeof self !== 'undefined'` | ✅ |
| `landing.synapse.config.js` generado por Sentinel en launch | ✅ |
| PROTOCOL object con renderDashboard, stats, accounts, actions | ✅ |
| Handler `profile_load` en `background.js` → forwarding a Brain | ✅ |
| Handler `health_check` en `background.js` → forwarding a Brain | ✅ |
| Handler `nucleus_sync` en `background.js` → forwarding a Brain | ✅ |
| Handler `intent_list` en `background.js` → forwarding a Brain | ✅ |
| Routing de respuestas en `handleHostMessage` (`PROFILE_LOADED`, etc.) | ✅ |
| Handler `PROFILE_LOAD` en `SynapseManager` → responde con datos reales | ✅ |
| Handler `HEALTH_CHECK` en `SynapseManager` → responde con estado | ✅ |
| Handler `NUCLEUS_SYNC` en `SynapseManager` → responde con confirmación | ✅ |
| Handler `INTENT_LIST` en `SynapseManager` → responde (vacío, Phase 3 deferred) | ✅ |
| Brain responde `PROFILE_LOADED` con datos reales del perfil | ⚠️ Datos reales pendientes de verificar |
| Dashboard de Landing renderiza con datos de Brain | ⚠️ Pendiente — Test 5 |

---

### 3.3 Harness

**Propósito:** Herramienta de debug. Observador pasivo + simulador activo del protocolo.
Existe únicamente en dev builds — no afecta producción.

**Archivos en templates (Brain):**
```
brain/core/profile/web/templates/harness/
└── index.html                  ← UI completa autocontenida (HTML + CSS + JS inline)
```

**Archivos generados en runtime:**
```
profiles/<uuid>/extension/harness/   ← SOLO si el perfil fue creado con --dev
└── index.html

profiles/<uuid>/extension/
└── harness.synapse.config.js         ← generado por Sentinel en launch
                                         SOLO si harness/index.html existe
```

**Activación:** `sentinel seed <alias> <master> --dev`

**Estado del Harness:**

| Componente | Estado |
|---|---|
| `harness_generator.py` — patrón v3.0, solo assets estáticos | ✅ |
| `harness/index.html` — ProtocolReader, Feed, Simulate, Config, Protocols | ✅ |
| `harness.synapse.config.js` generado por Sentinel en launch | ✅ |
| Flag `--dev` en `sentinel seed` | ✅ |
| `dev_mode` propagado `create_profile` → `_generate_profile_pages` | ✅ |
| `manifest.json` con `harness/*` en `web_accessible_resources` | ✅ |
| Test end-to-end: seed --dev → estructura correcta en disco | ⚠️ Pendiente — Test 1 |
| Test end-to-end: launch → port file + harness config creados | ⚠️ Pendiente — Test 2 |
| Harness carga los tres manifests en Panel Protocols | ⚠️ Pendiente — Test 4 |

---

## 4. CÓMO FUNCIONA EL HARNESS — REFERENCIA TÉCNICA

### 4.1 Autodescubrimiento de manifests (ProtocolReader)

Al cargar, `ProtocolReader.loadAll()` escanea `self.*` buscando objetos con
la forma `{ version, protocol, messages: [] }`. No hay lista hardcodeada.

**Manifests disponibles y sus ubicaciones:**

| Nombre en `self.*` | Archivo fuente | Destino en extensión |
|---|---|---|
| `self.DISCOVERY_PROTOCOL_MANIFEST` | `templates/discovery/discoveryProtocol.js` | `extension/discovery/discoveryProtocol.js` |
| `self.LANDING_PROTOCOL_MANIFEST` | `templates/landing/landingProtocol.js` | `extension/landing/landingProtocol.js` |
| `self.HARNESS_PROTOCOL_MANIFEST` | `templates/discovery/harnessProtocol.js` | `extension/discovery/harnessProtocol.js` |

**Para agregar un nuevo protocolo:** crear el manifest en el template correspondiente,
agregar el archivo a `web_accessible_resources`, y asegurarse de que se copia en seed.
No se modifica `harness/index.html`.

### 4.2 Los cuatro paneles

**Feed — observador pasivo:**
Registra todos los mensajes de `chrome.runtime.onMessage` en tiempo real.
El listener es adicional al de `background.js` — no interfiere con el routing.

```javascript
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  addToFeed('received', msg, sender);
  sendResponse({ harness_ack: true });
  return true;
});
```

**Simulate — simulador activo:**
Genera botones dinámicamente desde los manifests. Al ejecutar, resuelve variables
y despacha al canal correcto:
- Canal `"runtime"` → `chrome.runtime.sendMessage(payload)`
- Canal `"tabs"` → `chrome.tabs.sendMessage(tabId, payload)`

**Config — identidad de sesión:**
Muestra `profileId` y `launchId` de `HARNESS_CONFIG` y `SYNAPSE_CONFIG`.
Permite override manual. Contiene selector de tab activo para mensajes `channel: "tabs"`.

**Protocols — inspección de manifests:**
Visualiza los manifests cargados. Verificación de que el autodescubrimiento funcionó.

### 4.3 Resolución de variables

| Tipo | Comportamiento |
|---|---|
| `"string"` | Input de texto libre |
| `"enum"` | Dropdown generado desde `options[]` |
| `"auto"` | Inyectado desde `source` (ej: `"HARNESS_CONFIG.profileId"`) |

### 4.4 SYNAPSE_DEBUG — Helper de diagnóstico

Disponible en DevTools del Service Worker en builds `--dev`.
Acceso: `chrome://extensions` → Bloom Cortex → Service Worker → Consola.

```javascript
// Estructura real del objeto (background.js):
self.SYNAPSE_DEBUG = {
  getState: () => ({
    initialized:     isInitialized,
    connectionState: connectionState,
    handshakeState:  handshakeState,
    hasPort:         nativePort !== null,
    config:          config ? { ...config, bridge_name: '***' } : null,
    mode:            config?.mode
  }),
  forceReconnect: () => {
    if (nativePort) nativePort.disconnect();
    isInitialized = false;
    initialize();
  }
}
```

> Solo disponible cuando la URL del Service Worker contiene `debug=true`.
> En builds de producción `self.SYNAPSE_DEBUG` es `undefined`.

### 4.5 HARNESS_PROTOCOL_MANIFEST — 10 mensajes disponibles

| id | Comando | Descripción |
|---|---|---|
| `dom_click` | `DOM_CLICK` | Click en selector CSS en un tab |
| `dom_type` | `DOM_TYPE` | Focus + typing en un campo |
| `dom_wait` | `DOM_WAIT` | Esperar que un selector aparezca |
| `dom_focus` | `DOM_FOCUS` | Focus en un elemento |
| `dom_scroll` | `DOM_SCROLL` | Scroll hacia un elemento |
| `dom_extract` | `DOM_EXTRACT` | Extraer textContent o atributo |
| `event_emit` | `EVENT_EMIT` | Emitir evento nombrado en tab |
| `ion_execute_flow` | `ION_EXECUTE_FLOW` | Trigger de flujo IonPump completo |
| `ion_reload` | `ION_RELOAD` | Hot-reload de recipes |
| `ion_inspect` | `ION_INSPECT` | Estado del registry de IonPump |

**observable_events:** `ION_FLOW_STARTED`, `ION_FLOW_COMPLETED`, `ION_FLOW_ERROR`,
`ION_RELOAD_DONE`, `ION_RELOAD_FAILED`

---

## 5. FLUJO COMPLETO DE DESPLIEGUE

### 5.1 Seed

```
sentinel seed <alias> <master> [--dev]
  │
  └── HandleSeed(alias, master, devMode)
        ├── Extrae .blx → bin/extension/ (temporal)
        └── brain profile create <alias> [--master] [--dev]
              └── ProfileCreator.create_profile(dev_mode=devMode)
                    ├── _copy_extension_to_profile()
                    └── _generate_profile_pages(dev_mode=devMode)
                          ├── generate_discovery_page()
                          │     → extension/discovery/ (incluye harnessProtocol.js)
                          ├── generate_profile_landing()
                          │     → extension/landing/
                          └── generate_harness_page(dev_mode=devMode)
                                dev_mode=True  → extension/harness/index.html
                                dev_mode=False → no-op
```

### 5.2 Launch

```
sentinel launch <profile_id>
  └── ignition_identity.go::prepareSessionFiles()
        ├── writeDiscoveryConfig() → extension/discovery.synapse.config.js
        ├── writeLandingConfig()   → extension/landing.synapse.config.js
        └── writeHarnessConfig()   → extension/harness.synapse.config.js
              (solo si extension/harness/index.html existe)
```

**Resultado en disco después del launch (perfil --dev):**
```
profiles/<uuid>/extension/
├── discovery.synapse.config.js     ← self.SYNAPSE_CONFIG
├── landing.synapse.config.js       ← self.SYNAPSE_CONFIG
└── harness.synapse.config.js       ← self.HARNESS_CONFIG

BloomNucleus/run/
└── ipc_{launch_id}.port            ← puerto TCP del SynapseIPCServer
                                       creado al arrancar, eliminado al cerrar
```

---

## 6. PLAN DE VERIFICACIÓN — TEST END-TO-END

Los tests se ejecutan en orden. Cada uno valida el prerequisito del siguiente.

### Test 1 — Seed con --dev
```bash
sentinel seed dev_test_01 true --dev
```
Verificar:
```
profiles/<uuid>/extension/discovery/harnessProtocol.js  ← si falta: template no está
profiles/<uuid>/extension/harness/index.html             ← si falta: dev_mode no llegó
```

### Test 2 — IPC port file
```bash
sentinel launch <profile_id_del_test_1>
```
Verificar:
```
BloomNucleus/run/ipc_{launch_id}.port          ← entero (1024-65535)
profiles/<uuid>/extension/harness.synapse.config.js
```
Si el port file no existe: `SynapseManager` no recibe `launch_id` y `run_dir`.
Identificar dónde se instancia `SynapseManager` en el entry point de Brain como Host.

### Test 3 — IonPump registry
```bash
cp -r ionsites/github.com $BLOOM_DIR/bin/cortex/ionsites/
brain ionpump inspect
```
Salida esperada:
```
IonPump Registry
────────────────────────────────────────────────────────────
✓ github.com     v1.0.0    3 flows    not loaded
────────────────────────────────────────────────────────────
Total: 1 sites
```

### Test 4 — Harness carga los tres manifests
Prerequisito: Tests 1 y 2 pasados.
Abrir `chrome-extension://<id>/harness/index.html` → Panel Protocols.
Verificar: `discovery` (8 mensajes), `landing` (6 mensajes), `ionpump` (10 mensajes).

### Test 5 — Handshake end-to-end
Prerequisito: Test 4 pasado.
1. Harness → Panel Feed
2. `sentinel launch <profile_id>`
3. Feed debe mostrar `SYSTEM_ACK` de Brain
4. Simulate → Discovery → `host_ready` → ejecutar
5. Feed debe mostrar `HANDSHAKE_CONFIRMED` broadcast

Logs a revisar: `brain.core.synapse.manager`

---

## 7. GAPS CONOCIDOS Y TRABAJO PENDIENTE

### Resuelto en esta sesión

Los siguientes gaps listados en v1.0 están **implementados**:

| Gap | Estado |
|---|---|
| Handler `GITHUB_PAT_DETECTED` en background.js | ✅ Implementado (Prompt A) |
| Handler `GITHUB_TOKEN_STORED` en background.js | ✅ Implementado (Prompt A) |
| Handlers Landing (`profile_load`, `health_check`, `nucleus_sync`, `intent_list`) en background.js | ✅ Implementado (Prompt B) |
| Routing de respuestas Landing en `handleHostMessage` | ✅ Implementado (Prompt B) |
| Handlers Landing en `SynapseManager._action_map` | ✅ Implementado (Prompt B) |
| Handlers IonPump (`ION_EXECUTE_FLOW`, `ION_RELOAD`, `ION_INSPECT`) en background.js | ✅ Implementado (Prompt C) |
| Routing de IonPump events en `handleHostMessage` | ✅ Implementado (Prompt C) |
| DOM commands routing (`DOM_CLICK`, etc.) a `content.js` en `handleHostMessage` | ✅ Implementado (Prompt C) |
| Handlers IonPump en `SynapseManager._action_map` | ✅ Implementado (Prompt C) |

### Gap activo — content.js DOM execution

`background.js` recibe los DOM commands de Brain y los forwarda a `content.js` via
`chrome.tabs.sendMessage(tabId, msg)`. Pero `content.js` debe tener los handlers
que ejecutan esas acciones en el DOM real.

**Mensajes que `content.js` debe manejar:**
```
DOM_CLICK   → document.querySelector(selector).click()
DOM_TYPE    → element.focus(); element.value = value (+ events)
DOM_WAIT    → MutationObserver o polling hasta que selector aparezca
DOM_FOCUS   → document.querySelector(selector).focus()
DOM_SCROLL  → element.scrollIntoView({ behavior })
DOM_EXTRACT → return element.textContent / getAttribute()
```

**Cuándo implementar:** después de que Test 5 pase. Este es el Prompt D del roadmap.
**Archivos a adjuntar para Prompt D:** `content.js` actual + `SYNAPSE_PROTOCOL_MASTER.md`

### Gap activo — INTENT_LIST datos reales

`SynapseManager._handle_intent_list()` responde con lista vacía hasta que
Phase 3 de IonPump se desbloquee. Requiere explorar `brain/core/intent/`.

### Gap activo — PROFILE_LOADED datos completos

`SynapseManager._handle_profile_load()` usa `ProfileManager.get_profile()`.
Si el perfil no tiene `total_launches`, `intents_done`, ni `last_synch` en su
estructura actual, el dashboard de Landing muestra valores en 0. Verificar contra
datos reales después de Test 5.

### Bloqueado — Metamorph reconcile

El download y swap automático de recipes `.ion` está bloqueado hasta que Batcave
esté desplegado. Copia manual mientras tanto.

### Deferred — Phase 3 IonPump (IntentExecutor)

Ver `IONPUMP_IMPLEMENTATION_PROMPT_v3.md` sección Phase 3 para el gate de desbloqueado.

---

## 8. REGLAS DE EXTENSIÓN — CÓMO AGREGAR AL PROTOCOLO

### Agregar un mensaje a un protocolo existente

1. Agregar el objeto de mensaje al manifest en el template de Brain
2. Agregar el handler en `background.js` (chrome.runtime.onMessage)
3. Si llega de Brain: agregar routing en `handleHostMessage`
4. Si Brain debe responder: agregar handler en `SynapseManager._action_map`
5. El Harness refleja el nuevo mensaje automáticamente — no tocar `harness/index.html`

### Agregar un protocolo completamente nuevo

1. Crear `templates/<nombre>/<nombre>Protocol.js` con PROTOCOL object y manifest en `self.*`
2. Crear `<nombre>_generator.py` siguiendo el patrón de `discovery_generator.py` v3.0
3. Agregar la llamada en `_generate_profile_pages()` en `profile_create.py`
4. Agregar archivos del nuevo protocolo a `web_accessible_resources` en `manifest.json`
5. El Harness detecta el nuevo manifest automáticamente

### Convención de naming de manifests

```javascript
if (typeof self !== 'undefined') {
  self.NOMBRE_PROTOCOL_MANIFEST = {
    version: "1.0.0",
    protocol: "nombre",
    description: "...",
    messages: [ ... ],
    observable_events: [ ... ]
  };
}
```

---

## 9. REFERENCIA RÁPIDA — ARCHIVOS CLAVE

| Archivo | Responsabilidad | Modificar cuando... |
|---|---|---|
| `background.js` | Service Worker, todos los handlers del protocolo | Se agrega mensaje o respuesta |
| `content.js` | Ejecución DOM en tabs | Se agrega comando DOM (Prompt D pendiente) |
| `synapse_manager.py` | Dispatcher Brain, inicia IPC server | Se agrega comando en Brain |
| `synapse_protocol.py` | Transporte binario | Nunca — es infraestructura |
| `synapse_ipc_server.py` | TCP server en Brain-Host | Cambios en contrato IPC |
| `ionpump_ipc.py` | TCP client en proceso IonPump | Cambios en contrato IPC |
| `discoveryProtocol.js` | PROTOCOL UI + DISCOVERY_PROTOCOL_MANIFEST | Se agrega mensaje Discovery |
| `landingProtocol.js` | PROTOCOL UI + LANDING_PROTOCOL_MANIFEST | Se agrega mensaje Landing |
| `harnessProtocol.js` | HARNESS_PROTOCOL_MANIFEST | Se agrega comando DOM o evento IonPump |
| `harness/index.html` | Debug UI completa | Solo si cambia arquitectura del Harness |
| `harness_generator.py` | Copia assets Harness en seed | Si se agregan más assets |
| `discovery_generator.py` | Copia assets Discovery en seed | Si se agregan archivos a `templates/discovery/` |
| `profile_create.py` | Orquesta creación del perfil | Si se agrega un nuevo activo |
| `seed.go` | Flags de seed, llama a Brain | Si cambia la interfaz CLI del seed |
| `ignition_identity.go` | Escribe configs en launch | Si se agrega un nuevo `*.synapse.config.js` |

---

*Versión 2.0 — Post-implementación Prompts A, B, C.*
*Próxima actualización: cuando Tests 1-5 se completen en Darwin, o cuando se implemente Prompt D (content.js).*
