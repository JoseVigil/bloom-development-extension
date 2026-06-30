# ARCHITECTURE — Harness Protocol Single Source of Truth

**Versión:** 1.0  
**Proyecto:** Bloom Cortex Extension  
**Estado:** Post-Fase 5 (activo)  
**Última actualización:** Jun 26 2026

---

## Índice

1. [Contexto y problema original](#1-contexto-y-problema-original)
2. [Nuevo estándar: JSON Schema como Single Source of Truth](#2-nuevo-estándar-json-schema-como-single-source-of-truth)
3. [Estructura del JSON Schema de protocolo](#3-estructura-del-json-schema-de-protocolo)
4. [El wrapper `registerHandler` en background.js](#4-el-wrapper-registerhandler-en-backgroundjs)
5. [Cómo el Harness realiza el fetch de schemas](#5-cómo-el-harness-realiza-el-fetch-de-schemas)
6. [Flujo completo end-to-end](#6-flujo-completo-end-to-end)
7. [Reglas de diseño — obligatorias para el equipo](#7-reglas-de-diseño--obligatorias-para-el-equipo)
8. [Deuda técnica pendiente de migración](#8-deuda-técnica-pendiente-de-migración)

---

## 1. Contexto y problema original

Antes de la migración (Fases 1–4), la extensión Bloom Cortex mantenía la definición de sus mensajes de protocolo en tres lugares distintos y no coordinados:

- **Archivos `*Protocol.js`** (`discovery/discoveryProtocol.js`, `landing/landingProtocol.js`, `harnessProtocol.js`): definían globals como `DISCOVERY_PROTOCOL_MANIFEST` inyectados en `window` / `self`. El Harness los leía de forma síncrona en boot.
- **If-chains en `background.js`**: cada evento (`ACCOUNT_REGISTERED`, `GITHUB_PAT_DETECTED`, etc.) tenía su lógica de validación y defaults hardcodeados directamente en el listener.
- **`*.synapse.config.js`**: archivos de configuración de sesión leídos vía regex en `loadConfig()` y `loadHarnessConfig()`.

Este diseño implicaba que agregar o modificar un campo en un mensaje requería cambios en al menos dos archivos distintos. Los schemas no eran la fuente de verdad — eran decoración.

---

## 2. Nuevo estándar: JSON Schema como Single Source of Truth

A partir de la Fase 1, **los schemas JSON en `extension/protocols/` son la única fuente autorizada** que define la estructura, defaults y metadata de cada mensaje de protocolo.

```
extension/
└── protocols/
    ├── discovery.schema.json   ← protocolo de onboarding / registro
    ├── landing.schema.json     ← protocolo de landing / sesión activa
    └── harness.schema.json     ← protocolo de automatización DOM
```

Estos archivos están declarados en `web_accessible_resources` en `manifest.json` para que tanto `background.js` como el Harness puedan accederlos via `chrome.runtime.getURL()`.

**Principio central:** si un campo tiene un valor por defecto, ese default existe únicamente en el JSON schema. Ningún archivo JS hardcodea defaults de mensajes de protocolo.

---

## 3. Estructura del JSON Schema de protocolo

Cada archivo schema tiene la siguiente estructura:

```json
{
  "protocol": "discovery",
  "version": "1.0",
  "messages": [
    {
      "id": "account_registered",
      "type": "event",
      "direction": "content → background",
      "channel": "runtime",
      "description": "Emitido por discovery.js cuando el usuario completa el registro de una cuenta.",
      "payload_template": {
        "event": "ACCOUNT_REGISTERED",
        "service": "$service",
        "username": "$username",
        "token_fingerprint": "$token_fingerprint",
        "profile_id": "$profile_id",
        "launch_id": "$launch_id",
        "timestamp": "$timestamp"
      },
      "parameters": [
        {
          "name": "Service",
          "variable": "$service",
          "type": "enum",
          "options": ["github", "google", "gemini"],
          "default": "github"
        },
        {
          "name": "Username",
          "variable": "$username",
          "type": "string",
          "default": ""
        },
        {
          "name": "Token Fingerprint",
          "variable": "$token_fingerprint",
          "type": "string",
          "default": ""
        },
        {
          "name": "Profile ID",
          "variable": "$profile_id",
          "type": "auto",
          "source": "SYNAPSE_CONFIG.profileId"
        },
        {
          "name": "Launch ID",
          "variable": "$launch_id",
          "type": "auto",
          "source": "SYNAPSE_CONFIG.launchId"
        },
        {
          "name": "Timestamp",
          "variable": "$timestamp",
          "type": "auto",
          "source": "Date.now()"
        }
      ]
    }
  ]
}
```

### Campos obligatorios por mensaje

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | string | Identificador único en snake_case. Debe coincidir con el nombre del evento en SCREAMING_SNAKE_CASE. |
| `type` | `"event"` \| `"command"` \| `"response"` | Categoría semántica del mensaje. |
| `direction` | string | Describe el sentido del flujo. Ej: `"content → background"`. |
| `channel` | `"runtime"` \| `"native"` | Canal por el que viaja el mensaje. |
| `description` | string | Descripción funcional en español. Obligatoria. |
| `payload_template` | object | Template del JSON que se enviará. Las variables usan prefijo `$`. |
| `parameters` | array | Lista de parámetros. Ver tabla de parámetros abajo. |

### Campos de cada parámetro

| Campo | Obligatorio | Descripción |
|---|---|---|
| `name` | Sí | Label legible para la UI del Harness. |
| `variable` | Sí | Nombre de variable en el template. Prefijo `$`. |
| `type` | Sí | `"string"`, `"enum"`, `"auto"`, `"boolean"`, `"number"` |
| `default` | No | Valor por defecto. `applySchemaDefaults()` lo aplica antes de despachar. |
| `options` | Solo si `type="enum"` | Array de valores válidos. |
| `source` | Solo si `type="auto"` | Expresión que resuelve el valor en runtime. Ej: `"SYNAPSE_CONFIG.profileId"`. |

---

## 4. El wrapper `registerHandler` en background.js

### Propósito

`registerHandler` desacopla la **definición del schema** de la **lógica de negocio**. El handler recibe siempre un mensaje con los defaults del schema ya aplicados, sin necesidad de validar o parchear campos individualmente dentro del handler.

### API

```js
registerHandler(eventName, schema, handlerFn)
```

| Parámetro | Tipo | Descripción |
|---|---|---|
| `eventName` | string | El nombre del evento en SCREAMING_SNAKE_CASE. Ej: `"ACCOUNT_REGISTERED"`. |
| `schema` | object | El objeto de mensaje del schema JSON (`discoverySchema.messages.find(...)`). |
| `handlerFn` | function | Handler con firma `(msg, sender, sendResponse) => bool \| void`. Mismo contrato que `chrome.runtime.onMessage`. Retornar `true` si la respuesta es async. |

### Implementación interna

```js
const REGISTERED_HANDLERS = {};

function registerHandler(eventName, schema, handlerFn) {
  REGISTERED_HANDLERS[eventName] = { schema, handlerFn };
}

function applySchemaDefaults(msg, schema) {
  if (!schema || !Array.isArray(schema.parameters)) return msg;
  const patched = Object.assign({}, msg);
  for (const param of schema.parameters) {
    if (param.default !== undefined && patched[param.name] == null) {
      patched[param.name] = param.default;
    }
  }
  return patched;
}
```

El dispatch en `chrome.runtime.onMessage.addListener` verifica primero si el evento tiene un handler registrado:

```js
chrome.runtime.onMessage.addListener((msg, sender, sendResp) => {
  const _registeredEvent = msg.event || msg.command;
  if (_registeredEvent && REGISTERED_HANDLERS[_registeredEvent]) {
    const { schema, handlerFn } = REGISTERED_HANDLERS[_registeredEvent];
    const patchedMsg = applySchemaDefaults(msg, schema);
    const _asyncResult = handlerFn(patchedMsg, sender, sendResp);
    if (_asyncResult === true) return true;
    return;
  }
  // ... if-chain legacy continúa aquí para eventos no migrados
});
```

### Cómo registrar un nuevo handler

```js
// 1. Cargar el schema
const r = await fetch(chrome.runtime.getURL('protocols/discovery.schema.json'));
const discoverySchema = await r.json();

// 2. Extraer la definición del mensaje
const myMessageSchema = discoverySchema.messages.find(m => m.id === 'my_event_id');

// 3. Registrar el handler
registerHandler('MY_EVENT', myMessageSchema, (msg, sender, sendResp) => {
  // msg ya tiene defaults aplicados del schema
  console.log(msg.service); // garantizado: tiene valor por defecto si no vino en el mensaje
  sendResp({ received: true });
  return true; // async response
});
```

---

## 5. Cómo el Harness realiza el fetch de schemas

El Harness (`harness/harness.js`) carga los schemas JSON a través de `ProtocolReader.discoverFromJSON()`. Este método:

1. Construye la URL de cada schema con `chrome.runtime.getURL('protocols/*.schema.json')`.
2. Hace `fetch()` de cada archivo (disponible porque están en `web_accessible_resources`).
3. Convierte la respuesta JSON en un entry del array `ProtocolReader.manifests` con la forma `{ key, manifest }`.
4. Si un global legacy (`self.DISCOVERY_PROTOCOL_MANIFEST`, etc.) ya cargó ese key, el JSON schema se omite para evitar duplicados. Este mecanismo de dedup es **transitorio** y se eliminará cuando se complete la limpieza de los archivos legacy.

```js
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

Una vez cargados, `ProtocolReader.render()` itera `this.manifests` y genera la UI del simulador: secciones colapsables por protocolo, items clicables por mensaje, y el formulario de parámetros en `Simulator.load()`.

### Ciclo de boot del Harness

```
DOMContentLoaded
  └─ loadScriptOptional (configs legacy — transitorio)
  └─ Harness.init()
       ├─ ConfigReader.read()          ← lee self.HARNESS_CONFIG (transitorio)
       ├─ ProtocolReader.discover()    ← lee self.*_MANIFEST (transitorio)
       ├─ ProtocolReader.discoverFromJSON()  ← fetch JSON schemas ← NUEVO ESTÁNDAR
       ├─ ProtocolReader.render()
       └─ chrome.runtime.sendMessage HARNESS_HELLO → replay de buffer
```

---

## 6. Flujo completo end-to-end

```
[JSON Schema]  protocols/discovery.schema.json
      │
      ├── background.js
      │     loadProtocolSchemas()
      │       └─ fetch(chrome.runtime.getURL('protocols/discovery.schema.json'))
      │             └─ registerOnboardingHandlers()
      │                   └─ registerHandler('ACCOUNT_REGISTERED', schema, fn)
      │
      └── harness/harness.js
            ProtocolReader.discoverFromJSON()
              └─ fetch(chrome.runtime.getURL('protocols/discovery.schema.json'))
                    └─ manifests.push({ key, manifest })
                          └─ Simulator.load(msg) → form con defaults del schema


[discovery.js]  emite:  chrome.runtime.sendMessage({ event: 'ACCOUNT_REGISTERED', ... })
      │
      ▼
[background.js]  onMessage
      └─ REGISTERED_HANDLERS['ACCOUNT_REGISTERED']
            └─ applySchemaDefaults(msg, schema)   ← defaults del JSON
                  └─ handlerFn(patchedMsg, ...)
                        └─ sendToHost(...)
                        └─ forwardToDebugPanel(...)
```

---

## 7. Reglas de diseño — obligatorias para el equipo

### Regla 1 — El JSON schema es la única fuente de verdad

Nunca definir defaults de campos de mensajes dentro de un archivo `.js`. Los defaults viven en el campo `default` del parámetro en el JSON schema correspondiente.

```js
// ❌ MAL — default hardcodeado en el handler
const service = msg.service || 'github';

// ✅ BIEN — el schema declara default: "github", applySchemaDefaults lo aplica
const service = msg.service; // ya viene con el default aplicado
```

### Regla 2 — Todo evento nuevo requiere entrada en el schema

Antes de agregar un `registerHandler` en `background.js`, el evento debe existir como entrada en el JSON schema del protocolo correspondiente. El schema es el contrato; el handler es la implementación.

### Regla 3 — No agregar globals `self.*` para datos de protocolo

Los datos de protocolo (estructura de mensajes, parámetros, defaults) no se inyectan como globals de JavaScript. Solo los configs de sesión (`harness.synapse.config.js`, `discovery.synapse.config.js`) pueden seguir usando este patrón mientras no sean migrados.

### Regla 4 — Los schemas se cargan con `chrome.runtime.getURL` + `fetch`

Nunca importar los schemas como módulos JS ni incrustarlos inline. El fetch via `getURL` garantiza que tanto background.js como el Harness y cualquier otro contexto de la extensión consuman exactamente el mismo archivo del bundle.

### Regla 5 — `applySchemaDefaults` no muta el mensaje original

El mensaje entrante se copia con `Object.assign({}, msg)`. Si necesitás guardar referencia al mensaje original, está disponible. No pasar el objeto patcheado a funciones que esperen el mensaje raw.

### Regla 6 — El Harness es el entorno de prueba del contrato

Antes de implementar la lógica de negocio de un nuevo evento, la entrada del schema ya debe ser lo suficientemente completa como para que el Harness pueda simular el mensaje. Si el formulario del Harness no puede generar el payload, el schema está incompleto.

---

## 8. Deuda técnica pendiente de migración

Los siguientes elementos siguen usando el sistema anterior y **no se deben borrar** hasta que se complete su migración:

| Elemento | Archivo | Bloqueador |
|---|---|---|
| `loadConfig()` con fetch + regex | `background.js` | Lee `discovery.synapse.config.js` y `landing.synapse.config.js` para datos de sesión (profileId, launchId, etc.). Estos no son datos de protocolo — son configs de runtime generados por Ignition/Sentinel. |
| `loadHarnessConfig()` | `background.js` | Lee `harness.synapse.config.js` para poblar `config.harness`. |
| `ProtocolReader.discover()` | `harness.js` | Aún lee globals legacy como fallback. Se puede eliminar cuando los archivos `*Protocol.js` sean removidos del bundle. |
| `loadScriptOptional(*.js)` en boot | `harness.js` | Carga los configs legacy en boot. Se elimina junto con los archivos físicos. |
| `ConfigReader.read()` desde `self.*` | `harness.js` | Lee `self.HARNESS_CONFIG` y `self.SYNAPSE_CONFIG`. Se reemplaza por la recepción de `HARNESS_CONFIG_READY` desde background cuando `loadHarnessConfig` sea migrado. |

*(actualizado Jun 26 2026) — Los archivos legacy `discoveryProtocol.js`, `landingProtocol.js` e `harnessProtocol.js` están marcados para eliminación como parte de la Fase 5. La secuencia de limpieza documentada en "Orden recomendado" es el plan activo.*

**Orden recomendado para completar la limpieza:**

1. Migrar `loadHarnessConfig()` en background.js para que lea de un JSON en lugar de parsear regex sobre `.js`.
2. Una vez hecho, eliminar `harness.synapse.config.js` del bundle y simplificar `ConfigReader.read()` en harness.js.
3. Eliminar los archivos `*Protocol.js` legacy y remover `ProtocolReader.discover()` y `loadScriptOptional` del boot sequence.
4. Los `*.synapse.config.js` de sesión (discovery/landing) se mantienen hasta que Ignition/Sentinel los reemplace por otro mecanismo de entrega de config de runtime.
