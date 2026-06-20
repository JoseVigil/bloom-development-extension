# Harness — Manual de Uso y Debug del Protocolo Synapse

**Sistema:** Bloom Cortex · extensión Chrome MV3  
**Versión del manual:** Junio 2026  
**Propósito de este documento:** Contexto completo para retomar la investigación del Harness en una nueva sesión. Contiene arquitectura, estado actual, instrucciones de uso, y dudas abiertas a resolver.

---

## 1. Qué es el Harness y para qué existe

El Harness es una herramienta de observabilidad y simulación del protocolo Synapse. **Solo existe en builds dev** — no se despliega en producción.

Su URL es una página interna de la extensión Chrome:
```
chrome-extension://hpblclepliicmihaplldignhjdggnkdh/harness/index.html
```

Tiene dos funciones:
- **Observar** los mensajes `chrome.runtime` que fluyen entre la extensión, background.js y el host mientras el onboarding corre en Discovery.
- **Simular** eventos del protocolo para avanzar o testear pasos del flujo sin depender del sistema real (clipboard, GitHub, Brain) cuando algo no responde.

El Harness **no modifica** el estado del sistema. Despacha mensajes como si los hubiera enviado otro componente. background.js los recibe y los procesa exactamente igual.

---

## 2. Cómo se genera el Harness

El Harness se genera en el momento del seed del perfil:

```
sentinel seed <alias> <is_master> --dev
```

El flag `--dev` en `seed.go` pasa `--dev` a Brain, que llama a `harness_generator.py`. Este copia los assets estáticos:
- `harness/index.html`
- `harness/harness.js`
- `harness/ionpump_protocol.js`
- `harness/ion.manifest.json`

al directorio de extensión del perfil en:
```
~/Library/BloomNucleus/profiles/<UUID>/extension/harness/
```

El archivo de configuración `harness.synapse.config.js` **no se genera en seed** — se genera en cada launch por `ignition_identity.go::writeHarnessConfig()`. Detecta dev mode chequeando si `harness/index.html` existe en el extensionDir.

---

## 3. Prerequisitos para que el Harness esté vivo

1. La extensión está cargada en modo developer en `chrome://extensions`
2. `bloom-host` está corriendo (el log de background.js debe mostrar `HANDSHAKE COMPLETADO`)
3. El perfil fue creado con `sentinel seed --dev` (el directorio `harness/` existe)
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

---

## 5. Panel izquierdo — Protocol reader

Lo que se ve es la lista de mensajes definidos en los manifests JS cargados al boot. No es el estado del sistema — es la descripción del contrato.

**Fuente de datos:**
- `discoveryProtocol.js` → expone `self.DISCOVERY_PROTOCOL_MANIFEST` (8 mensajes)
- `ionpump_protocol.js` → expone `self.IONPUMP_PROTOCOL_MANIFEST` (10 comandos)

`harness.js` los carga con `loadScriptOptional()` antes de llamar a `Harness.init()`. El `ProtocolReader` escanea esos globales en `self`/`window` y los renderiza.

**Tipos de mensaje:**
- `command` — un mensaje que el Harness inicia hacia background.js (ej: `onboarding_navigate`, `dom_click`)
- `event` — simulación de algo que normalmente haría otro componente (ej: `github_pat_detected` simula lo que haría el clipboard monitor)

**Mensajes DISCOVERY disponibles:**
| ID | Tipo | Descripción |
|---|---|---|
| `onboarding_navigate` | command | Fuerza Discovery a un step específico del onboarding |
| `github_pat_detected` | event | Simula que el clipboard monitor detectó un PAT |
| `github_token_stored` | event | Simula que el usuario confirmó el token |
| `api_key_registered` | event | Simula que se registró una API key |
| `account_registered` | event | Simula registro de cuenta |
| `discovery_complete` | event | Cierra el flujo de onboarding |
| `handshake_confirmed` | event | Simula handshake exitoso con el host |
| `host_ready` | event | Simula que el host está listo |

**Mensajes IONPUMP disponibles:**
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
- **Campos `type: auto`** — se resuelven automáticamente desde `HARNESS_CONFIG` (profileId) y `SYNAPSE_CONFIG` (launchId). No son editables. Si muestran `(not available)` es porque el launch no corrió todavía.

El **preview JSON** se actualiza en tiempo real mostrando el payload exacto que se va a despachar.

El botón **Send** llama a `chrome.runtime.sendMessage(payload)` hacia background.js.

---

## 7. Panel derecho — Log y Config

### Tab Log

Stream en tiempo real de lo que el Harness registra internamente. El número en la tab es simplemente la cantidad de entradas — no es un indicador de estado del sistema.

| Tipo | Qué significa |
|---|---|
| `[INFO]` | Ciclo de vida del Harness (boot, config loaded, harness ready, late discovery) |
| `[SEND]` | Mensaje despachado desde Simulate, con payload completo |
| `[ACK]` | Respuesta de background.js al mensaje despachado |
| `[ERR]` | Error de dispatch o `chrome.runtime.lastError` |

**Interpretación del ACK:**
- `{"status": "ok"}` → background.js recibió, procesó y respondió explícitamente
- `null` → el mensaje llegó pero el handler hizo fire-and-forget (no llamó `sendResponse`) — puede ser comportamiento esperado
- `[ERR]` → el mensaje no llegó a background.js — verificar que la extensión esté cargada y el host corriendo

### Tab Config

Muestra el estado de `HARNESS_CONFIG` y `SYNAPSE_CONFIG` cargados al boot. Útil para verificar que `profileId` y `launchId` son los correctos antes de despachar.

Si `HARNESS_CONFIG` muestra `—` en todos los campos: `harness.synapse.config.js` no existe todavía (el launch nunca corrió en este perfil).

---

## 8. Flujo completo de un mensaje

```
Harness UI
  │
  │  [1] Usuario hace click en mensaje del panel izquierdo
  │      Simulator carga el form con defaults
  │
  │  [2] Usuario edita campos y hace click en Send
  │
  ▼
chrome.runtime.sendMessage(payload)
  │
  ▼
background.js — chrome.runtime.onMessage.addListener
  │   procesa el evento
  │   retorna response / null
  │
  ▼
[ACK] aparece en Log del Harness
```

**Lo que el Harness NO ve:**
- Mensajes que background.js consume internamente sin hacer broadcast
- Comunicación background.js ↔ bloom-host (Native Messaging, capa por debajo)
- Comunicación bloom-host ↔ Brain (TCP socket, infraestructura local)

Estos solo son visibles en sus respectivos Dev Tools o logs de terminal.

---

## 9. Instrucciones de debug paso a paso

### Verificar que el sistema está listo

1. Abrir `chrome://extensions` → verificar que Bloom Nucleus Bridge está activo
2. Verificar que `bloom-host` está corriendo (log de background.js: `HANDSHAKE COMPLETADO`)
3. Abrir el Harness: `chrome-extension://<ID>/harness/index.html`
4. En tab **Config**: verificar que `profileId` y `launchId` tienen valores reales

### Simular un evento del onboarding

1. En panel izquierdo → DISCOVERY → click en el mensaje deseado (ej: `github_pat_detected`)
2. En panel central → editar el campo `token` con un valor de test (ej: `ghp_simulatedToken123456789`)
3. Verificar el JSON preview
4. Click en **Send**
5. En tab **Log** verificar:
   - `[SEND]` con el payload → el Harness lo despachó
   - `[ACK]` con `{"status":"ok"}` → background.js lo procesó

### Si el ACK es null

background.js recibió el mensaje pero no retornó respuesta. Puede ser:
- Comportamiento esperado (fire-and-forget)
- El handler no reconoció el evento

Para confirmar: abrir Dev Tools de background.js y verificar si el handler ejecutó.

### Abrir Dev Tools de background.js

```
chrome://extensions → Bloom Nucleus Bridge → Inspect views: background page (service_worker)
```

Ahí se ven los `console.log` reales de cómo background.js procesa cada mensaje. El Log del Harness y Dev Tools trabajan en paralelo: el Harness dice si el mensaje llegó, Dev Tools dice qué pasó adentro.

### Simular el flujo completo de onboarding desde cero

Secuencia de dispatches en orden, esperando el ACK entre cada uno:

1. `onboarding_navigate` → step: `github_auth`
2. `github_pat_detected` → token: `ghp_test123`
3. `github_token_stored` → token_fingerprint: `ghp_...abc123`
4. `api_key_registered` → key_fingerprint: `sk-...xyz789`
5. `account_registered`
6. `discovery_complete`

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
    ├── harness.js                   ← ProtocolReader, Simulator, Logger, ConfigReader, boot
    └── ionpump_protocol.js          ← self.IONPUMP_PROTOCOL_MANIFEST (10 comandos)

extension/discovery/
└── discoveryProtocol.js             ← self.DISCOVERY_PROTOCOL_MANIFEST (8 mensajes)
```

**Secuencia de boot de harness.js (DOMContentLoaded):**
```javascript
await loadScriptOptional('../harness.synapse.config.js')    // HARNESS_CONFIG
await loadScriptOptional('../discovery.synapse.config.js')  // SYNAPSE_CONFIG
await loadScriptOptional('../discovery/discoveryProtocol.js') // DISCOVERY manifest
await loadScriptOptional('ionpump_protocol.js')             // IONPUMP manifest
await loadScriptOptional('../landing.synapse.config.js')    // solo post-onboarding
await loadScriptOptional('../landing/landingProtocol.js')   // solo post-onboarding
Harness.init()
```

`loadScriptOptional` resuelve sin error si el archivo no existe — el Harness arranca con lo que haya disponible.

---

## 11. Dos contextos de ejecución — distinción crítica

Hay dos archivos JS con nombres parecidos que corren en contextos completamente distintos:

| Archivo | Dónde corre | Tiene `chrome.runtime` |
|---|---|---|
| `discovery.js` | Extensión Chrome (`chrome-extension://...`) | ✅ Sí |
| `onboarding.js` | VSCode Webview (Electron) | ❌ No |

`onboarding.js` es el stepper de la UI de VSCode. Se comunica con Brain vía `window.onboarding.*` (IPC preload). No tiene acceso a `chrome.runtime` y no puede interactuar directamente con el Harness.

El Harness interactúa con `discovery.js` y con `background.js` — ambos en el contexto de la extensión Chrome.

---

## 12. Estado de implementación al cierre de la sesión anterior

### Confirmado como completo (verificado en código fuente)

- `seed.go` — flag `--dev` implementado y funcional
- `ignition_identity.go` — `writeHarnessConfig()` implementado (líneas 408-444), llamado desde `prepareSessionFiles()` sección 7
- `harness/harness.js` — boot async, ProtocolReader, Simulator, Logger, ConfigReader operativos
- `harness/ionpump_protocol.js` — 10 comandos DOM completos
- `discoveryProtocol.js` — `DISCOVERY_PROTOCOL_MANIFEST` con 8 mensajes completo
- `discovery_generator.py` y `harness_generator.py` — generadores correctos
- `core/ionpump/` — 8 archivos de runtime presentes (ipc, manager, executor, etc.)

### Pendiente de implementar

| Tarea | Archivo | Descripción |
|---|---|---|
| Crear archivo físico | `templates/discovery/ionpump_protocol.js` | Copiar desde `templates/harness/`. El generator ya lo referencia pero el archivo no existe en esa carpeta. |
| Agregar script tag | `templates/discovery/index.html` | `<script src="ionpump_protocol.js">` antes de `discovery.js` |
| Agregar elemento DOM | `templates/discovery/index.html` | `<button id="btn-open-harness" style="display:none">` |
| Implementar detección dev mode | `templates/discovery/discovery.js` | `_initHarnessButton()` con fetch HEAD a `harness/index.html` |
| Completar `routeToStep()` | `templates/discovery/discovery.js` | Cases faltantes: `vault_init`, `ai_provider_setup`, `project_create` |
| Auditar wildcard | `nucleus/internal/supervisor/onboarding_harness.go` | Existe pero no está documentado en ningún doc de referencia |

---

## 13. Dudas abiertas a investigar en la próxima sesión

1. **¿Qué contiene `nucleus/internal/supervisor/onboarding_harness.go`?**  
   Este archivo existe en el workspace pero ningún documento lo menciona. ¿Es integración Nucleus → Harness ya implementada, código obsoleto, o un placeholder?

2. **¿Cómo se comporta el Harness cuando background.js no tiene handler para el mensaje despachado?**  
   El ACK es `null` en fire-and-forget, pero ¿hay algún log en background.js que confirme recepción sin handler vs recepción con handler que no responde?

3. **¿El Log del Harness puede extenderse para capturar mensajes broadcast de background.js?**  
   Actualmente solo registra lo que el propio harness.js escribe. ¿Es posible agregar un listener en harness.js que capture mensajes broadcast de background.js hacia otras tabs?

4. **¿Cómo funciona el flujo desde workspace (VSCode) hasta que el evento llega a Discovery?**  
   `onboarding.js` llama a `window.onboarding.navigate(step)` → ¿qué pasa entre ese IPC call y el momento en que `discovery.js` recibe el `onboarding_navigate` event via `chrome.runtime.onMessage`?

5. **¿El botón "Abrir Harness" en Discovery debe aparecer en todas las screens del onboarding o solo en algunas?**  
   La implementación propuesta lo pone en `screen-github-login`. ¿Es el lugar correcto o debería ser un widget flotante visible en todas las screens?

6. **¿El IonPump runtime (`core/ionpump/`) está integrado con background.js?**  
   Los archivos existen pero no se confirmó si `synapse_ipc_server.py` ya tiene los handlers para los comandos DOM (`DOM_CLICK`, `DOM_TYPE`, etc.) o si eso es trabajo pendiente.

---

## 14. Archivos de contexto a adjuntar en la nueva sesión

Para que el agente pueda continuar sin reconstruir contexto, adjuntar:

| Archivo | Ubicación | Para qué sirve |
|---|---|---|
| `HARNESS_Manual_Uso_y_Debug_Synapse.md` | Este documento | Contexto completo de la sesión anterior |
| `harness.js` | `templates/harness/harness.js` | JS del Harness: ProtocolReader, Simulator, Logger, ConfigReader |
| `harness/index.html` | `templates/harness/index.html` | HTML del Harness (layout de paneles) |
| `discoveryProtocol.js` | `templates/discovery/discoveryProtocol.js` | DISCOVERY_PROTOCOL_MANIFEST con los 8 mensajes |
| `ionpump_protocol.js` | `templates/harness/ionpump_protocol.js` | IONPUMP_PROTOCOL_MANIFEST con los 10 comandos |
| `discovery.js` | `templates/discovery/discovery.js` | JS de Discovery: DiscoveryFlow, GithubAuthFlow, routeToStep() |
| `onboarding_harness.go` | `nucleus/internal/supervisor/onboarding_harness.go` | Wildcard no documentado — auditar |
| `synapse_ipc_server.py` | `brain/core/synapse/synapse_ipc_server.py` | IPC server — verificar handlers de comandos DOM |

---

*Documento generado al cierre de la sesión de relevamiento del 17/06/2026.*
