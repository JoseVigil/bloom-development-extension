# RFC-DA-001 — DebuggerAdapter: migración de la automatización DOM de `content.js` a `chrome.debugger`

| Campo | Valor |
|---|---|
| **Estado** | Borrador para revisión (v0.1) |
| **Fecha** | 2026-09-19 |
| **Componentes afectados** | Cortex (extensión MV3), `bloom-host.exe`, Brain (`SynapseServer`, `IonPumpExecutor`), Sentinel (lanzamiento de Chrome / `SYNAPSE_CONFIG`) |
| **Documentos relacionados** | `AUTHORITY_BOUNDARY.md` v1.2 (precedencia de principios), `BTIPS-CORTEX-REFERENCE-v1_2.md`, `PROVIDER-EXECUTION-SPEC.md` (**no revisado** al redactar), `VAULT-STORAGE-SPEC.md` (no revisado) |
| **Entregable hermano** | `WBS-DA-001-Plan-de-Trabajo.md` |

**Leyenda de evidencia** usada en todo el documento:

- **[V]** verificado en documentación oficial (ver §14).
- **[I]** inferido por lectura del código de `content.js` / `background.js` (no ejecutado).
- **[PoC]** hipótesis que debe validarse empíricamente en la Fase 0 antes de comprometer el diseño.

---

## 0. Resumen ejecutivo

Se propone reemplazar el tramo *background.js → página* (hoy `chrome.tabs.sendMessage` → `content.js`) por un **`DebuggerActuator`** que ejecuta los comandos Synapse `DOM_*` mediante `chrome.debugger` (CDP). Todo lo que hay *aguas arriba* —Native Messaging, `bloom-host.exe`, handshake de 3 fases, heartbeat, Brain— **no cambia**.

Tres decisiones estructuran el diseño:

1. **Fachada cerrada (estilo Windows Messaging).** Brain nunca envía métodos CDP; envía *comandos Synapse* de un registro cerrado, con parámetros tipados. El adaptador traduce cada comando a un presupuesto fijo de métodos CDP y a **plantillas de función pineadas** (no JS arbitrario). Un único módulo (`CdpGate`) puede llamar a `chrome.debugger.sendCommand`.
2. **Denegación por capa de seguridad, no por convención.** Los hosts prohibidos por `AUTHORITY_BOUNDARY` §4 se deniegan en cinco puntos (admisión, attach, navegación, frames hijos, pre-despacho), con política **embebida en el artefacto firmado**, evaluada **fail-closed** y modificable solo en sentido *más restrictivo* en runtime.
3. **Attach perezoso y revocable por el humano.** `chrome.debugger` muestra un banner mientras hay sesión activa [V]. Se adopta como **kill switch del usuario**: si lo descarta, el adaptador detiene la automatización y no vuelve a adjuntarse sin re-autorización explícita.

Dos puntos de fricción requieren decisión empírica (Fase 0): el **slave mode** (`pointer-events:none` en `body`) frente a eventos de entrada *trusted*, y el **comportamiento real de `onDetach`** (ver corrección en §6.3).

---

## 1. Contexto, objetivos y no-objetivos

### 1.1 Problema

`content.js` v2.3 se inyecta en `<all_urls>` desde `document_start` (según el manifest documentado en Reference §15) y ejecuta comandos primitivos con eventos sintéticos (`isTrusted:false`). Esto implica: presencia pasiva en todas las páginas (incluidas pestañas de login), comportamiento frágil en varios comandos (§3) y ninguna frontera de autoridad aplicable *antes* de ejecutar.

### 1.2 Objetivos

- **O1.** Cubrir funcionalmente todos los comandos `DOM_*` actuales con un actuador basado en `chrome.debugger`, sin cambiar el contrato hacia Brain (payloads con selectores CSS, envelope `{success, result}`).
- **O2.** Imponer la frontera de `AUTHORITY_BOUNDARY` de forma técnica: denegar `attach` a hosts prohibidos y a cualquier tab bajo vigilancia de login.
- **O3.** Eliminar la presencia pasiva de scripts en todas las páginas (attach bajo demanda).
- **O4.** Mejorar los comandos donde `content.js` es estructuralmente débil (navegación, tipeo, vigilancia de URL).
- **O5.** Migración escalonada, reversible por comando y por perfil.

### 1.3 No-objetivos

- Reemplazar Native Messaging o `bloom-host.exe` (`chrome.debugger` no sustituye el transporte hacia Brain).
- Exponer CDP —total o parcialmente— a Brain. **Prohibido** (ADR-2).
- Habilitar la automatización de superficies de IA de terceros. `AUTHORITY_BOUNDARY` §4 lo prohíbe *sin importar el actuador*; este RFC solo lo hace cumplir técnicamente.
- Evasión de detección de bots o anti-abuso.
- Publicación en Chrome Web Store (Reference §3: despliegue `.blx`). Si en el futuro se publicara, ver riesgo R-07.

---

## 2. Invariantes (restricciones no negociables)

| ID | Invariante | Origen |
|---|---|---|
| **I-1** | Native Messaging, `bloom-host.exe`, handshake de 3 fases y heartbeat permanecen intactos. | Requisito del proyecto |
| **I-2** | Brain solo puede invocar comandos de un **registro cerrado**. No existe `CDP_SEND`, `EVAL` ni equivalente, ni siquiera bajo flag. | Requisito del proyecto |
| **I-3** | Prohibido automatizar el DOM de claude.ai, chatgpt.com, grok.com y aistudio.google.com *para cualquier fin*, en cualquier actuador. | `AUTHORITY_BOUNDARY` §4 (nota de alcance) |
| **I-4** | La extensión **no confía en el host ni en Brain**: valida esquema y política en la propia extensión (L2). El host valida además (L1) como defensa en profundidad. | Diseño (ADR-6) |
| **I-5** | Prohibido leer o automatizar pantallas de login/registro/generación de credenciales de proveedores; sin captura de secretos por canales pasivos. | `AUTHORITY_BOUNDARY` §1, §3.2, §4 |
| **I-6** | La política de denegación es **monótona** en runtime: se puede agregar, nunca quitar. | Diseño (ADR-4) |
| **I-7** | Fail-closed: ante URL no parseable, esquema no permitido o estado desconocido → denegar. | Diseño |
| **I-8** | El banner de `chrome.debugger` no se suprime en producción. | Diseño (§6.6), coherente con `AUTHORITY_BOUNDARY` §1 (human-in-the-loop) |

---

## 3. Hallazgos sobre el estado actual (motivación técnica)

Basados en lectura de `content.js` y `background.js` **[I]**; no se ejecutó código. Sirven para priorizar y para definir criterios de aceptación de paridad/mejora.

| # | Hallazgo | Impacto | Tratamiento en este RFC |
|---|---|---|---|
| H1 | `executeNavigate` asigna `window.location.href` y espera `load` en el **mismo** contexto JS, que la navegación destruye; la promesa no resuelve y `sendResponse` no se invoca. | `DOM_NAVIGATE` no confirma; el host espera a timeout. | §8.4: `Page.navigate` + eventos de ciclo de vida desde el service worker. |
| H2 | `executeWatchUrl` parchea `history.pushState/replaceState` desde el mundo aislado del content script; ese parche no intercepta llamadas hechas por el JS de la página. | `DOM_WATCH_URL` probablemente no dispara en SPAs (sí `popstate`). Verificable en minutos **[PoC]**. | §8.4: `Page.navigatedWithinDocument` / `webNavigation.onHistoryStateUpdated`. |
| H3 | `background.js` (versión revisada) **no tiene handler** para `SIGNAL` ni `PAGE_CHANGED`. Podría estar en `background-companion.js` (no revisado). | Señales de `DOM_WATCH*` posiblemente no llegan a Brain. | WBS DA-3-15: verificar y cablear. |
| H4 | Existen tres rutas que hacen `tabs.sendMessage`: `DOM_COMMANDS` en `handleHostMessage` (por `tab_id`, responde con evento `DOM_COMMAND_ACK` y solo `if (response)`), `forwardToContent` (por `target`, responde `RESPONSE` con `id`) y `RUNTIME_DOM_COMMANDS` (SynapseSimulator). Las listas no coinciden (`DOM_READ/UPLOAD/SNAPSHOT` y `LOCK_UI` solo por `target`; `DOM_NAVIGATE/WATCH*` solo por `tab_id`). | Dos convenciones de respuesta; comportamiento distinto según ruta. | §4.1: `ActuatorPort` unifica; §5.2 define respuesta canónica con dual-emit temporal. |
| H5 | `tabs.sendMessage(tabId, msg)` sin `frameId` + `all_frames:true` ⇒ el comando corre en **todos** los frames y responde el primero. | Resultados no deterministas con iframes. | §8.2: direccionamiento explícito. |
| H6 | `content.js` envía `actuator_ready` con `window.location.href` en cada carga y frame; `background.js` lo reenvía al host y al debug panel (`localhost:48215`). | Telemetría pasiva de URLs; presencia en pestañas de login (tensión con `AUTHORITY_BOUNDARY` §2.1). | §6.4: `ACTUATOR_READY` solo para tabs registradas. |
| H7 | `executeType` usa `el.value = text` + eventos `input/change`. | Suele fallar con inputs controlados de React; no soporta `contenteditable`. | §8.1: `Input.insertText`. |
| H8 | Slave mode fija `document.body.style.pointerEvents='none'`. | Bloquearía clics *trusted* por hit-testing. | §8.3. |
| H9 | `sendToHost` hace `console.log` del mensaje completo y `forwardToDebugPanel` reenvía el payload (solo trunca `token`/`key`). | Texto tipeado y contenido leído pueden quedar en logs/debug panel. | §7.4: redacción. |
| H10 | `executeUpload` construye `Blob([f.content])`. | Solo contenido textual; binarios se corrompen. | §8.4: subida por referencia. |
| H11 | Según Reference §15, `web_accessible_resources` expone `*.synapse.config.js` a `<all_urls>`. | Identificadores de perfil/launch legibles por páginas si conocen el ID de la extensión. **Nunca colocar secretos en `SYNAPSE_CONFIG`.** | §5.7; WBS DA-1-09. |
| H12 | Reference §11/§15 aún documenta Clipboard Monitor y `clipboardRead`; `background.js` ya lo eliminó y `AUTHORITY_BOUNDARY` §3.2 lo prohíbe. | Drift documental. | WBS DA-4-03. |

---

## 4. Arquitectura propuesta

### 4.1 Vista de componentes

```
┌──────────────────────────── SISTEMA LOCAL ─────────────────────────────┐
│ Brain (Python)                                                          │
│  IntentExecutor / IonPumpExecutor                                       │
│    └─ ActuatorClient   API tipada · cola por tab · timeouts · errores   │
│         └─ SynapseServer.send_command(...)              [existente]     │
│              │ TCP 127.0.0.1:5678  (+ token de lanzamiento, §5.7)       │
│              ▼                                                          │
│  bloom-host.exe (C++)  · L1: tamaño ≤ 1 MB, esquema, comando ∈ SSoT     │
└──────────────┬──────────────────────────────────────────────────────────┘
               │ Native Messaging (stdin/stdout)              [sin cambios]
┌──────────────▼──────────── EXTENSIÓN (MV3 service worker) ──────────────┐
│ background.js — Synapse Thin Client   [handshake 3 fases, heartbeat]    │
│   └─ ActuatorPort.execute(tabId, command, payload, frame, meta)         │
│        ├─ ContentActuator   (legado → tabs.sendMessage → content.js)    │
│        └─ DebuggerActuator  (nuevo)                                     │
│             ├─ CommandRegistry  L2: esquema + comando cerrado           │
│             ├─ PolicyEngine     denylist · allowlist · tiers            │
│             ├─ SessionManager  lease · attach perezoso · onDetach       │
│             ├─ FrameResolver   frameId / sessionId (OOPIF)              │
│             ├─ InputController mouse · teclado · modo de input          │
│             ├─ CdpGate         ÚNICO llamador de chrome.debugger        │
│             └─ AuditLog                                                 │
│  bloom-ui.js — on-demand, solo UI (ribbon · overlay · shield)           │
└──────────────┬──────────────────────────────────────────────────────────┘
               ▼  chrome.debugger  (CDP, subconjunto de dominios [V])
             Pestaña web (solo hosts permitidos)
```

**Costura (seam):** los tres sitios de H4 se reemplazan por una única interfaz:

```ts
interface ActuatorPort {
  execute(req: ActuatorRequest): Promise<ActuatorResponse>; // {success, result | error, error_code, meta}
}
```

`ContentActuator` encapsula el comportamiento actual (sin cambios funcionales) y `DebuggerActuator` es el nuevo. La selección es **por comando y por perfil** (`actuator_impl: content | debugger | shadow`), lo que habilita rollback inmediato (§11).

### 4.2 Modelo de mensajería (analogía con Windows Messaging)

| Windows Messaging | Synapse-Actuator | Propiedad que se busca |
|---|---|---|
| Identificador de mensaje (`WM_*`) de una tabla fija | `command` ∈ `CommandRegistry` | Vocabulario cerrado; nada fuera de la tabla se ejecuta |
| `wParam` / `lParam` tipados | `payload` validado con JSON Schema por comando | Parámetros tipados, sin paquetes arbitrarios |
| `DefWindowProc` para lo no manejado | Default = `E_UNKNOWN_COMMAND`; **nunca** reenviar a CDP | Denegación por omisión |
| Validación de `HWND` | `tab_id` debe estar en el registro de tabs de la sesión | Handles no adivinables/no ajenos |
| UIPI (menor integridad no envía a mayor) | Tiers de dominio: superficies Tier A/B inmunes a cualquier comando | Superficies sensibles fuera de alcance |
| `SendMessage` vs `PostMessage` | Request/response con `id` vs eventos push | Semántica explícita |
| `SetWindowsHookEx` (poder amplio) | `chrome.debugger` = poder máximo → confinado a `CdpGate` | Mínimo privilegio, un solo punto auditable |
| Message filter | `allowed_commands` por perfil/intent | Reducción de superficie por contexto |

### 4.3 Módulos del `DebuggerActuator`

| Módulo | Responsabilidad | Regla de confianza |
|---|---|---|
| `CommandRegistry` | Catálogo cerrado de comandos: esquema, timeout, clase de riesgo (`read`/`write`/`navigate`), presupuesto CDP, capacidad requerida. Se genera desde `protocols/actuator.schema.json` (SSoT). | Desconocido ⇒ denegar. |
| `PolicyEngine` | Decide `ALLOW/DENY` para (tab, frame, URL, comando). Pura y sin efectos: fácil de testear por tablas. | Fail-closed; política embebida y monótona. |
| `SessionManager` | Máquina de estados por tab, attach/detach, idle TTL, revocación, reconciliación al despertar el SW. | Estado persistido en `chrome.storage.session`. |
| `FrameResolver` | Resuelve `frame` → `frameId`/`sessionId`/`executionContextId`; excluye frames denegados. | Nunca `DOM.getDocument({pierce:true})` a ciegas. |
| `InputController` | Clics/teclado trusted, verificación de oclusión, `input_mode`. | Coordenadas recalculadas inmediatamente antes de despachar. |
| `CdpGate` | Único módulo que invoca `chrome.debugger.sendCommand`. Valida método ∈ presupuesto del comando y `callFunctionOn` ∈ plantillas pineadas. | Regla de lint + aserción runtime. |
| `AuditLog` | Registro append-only de decisiones y resultados, sin payload sensible. | Ver §9. |

---

## 5. Interfaz local (Orquestador)

El "orquestador" es el conjunto **Brain → `ActuatorClient` → `SynapseServer` → `bloom-host.exe`** que comanda la automatización. Esta sección define su interfaz, contratos y semántica. Principio rector: **el orquestador expresa *intención tipada* (comando + parámetros); nunca mecanismo (métodos CDP, JS).**

### 5.1 Responsabilidades por capa

| Capa | Responsabilidad | Valida | Confía en |
|---|---|---|---|
| **Brain — `ActuatorClient`** (nuevo, delgado) | API tipada por comando; cola FIFO por tab (1 en vuelo); timeouts; mapeo de errores a excepciones; suscripción a eventos. | Tipos en tiempo de construcción (dataclasses generadas desde el SSoT). | Nada de lo que devuelva la página. |
| **`SynapseServer`** (existente) | Transporte TCP ↔ host; correlación por `id`. | — | — |
| **`bloom-host.exe` — L1** | Puente NM. Descarta y registra lo que viole: tamaño, JSON, `schema_v`, `command` ∈ SSoT. Quarantine de archivos de upload (§7.5). | Esquema y tamaño. | No es fuente de verdad de política. |
| **Extensión — L2 (`ActuatorPort`)** | **Autoridad final**: esquema, política de dominios, presupuesto CDP, estado de sesión. | Todo. | Ni Brain ni host (I-4). |

**Fuente única de contrato (SSoT):** `protocols/actuator.schema.json` (junto a los schemas de discovery/landing ya existentes, Reference §4). De él se generan: dataclasses Python, validadores JS y la tabla de comandos de L1 en C++. Un cambio de contrato = un solo archivo + regeneración.

### 5.2 Contrato de mensajes v2 (aditivo sobre v1)

**Request** (Brain → host → extensión):

```json
{
  "schema_v": 2,
  "id": "0b9c3a54-1f0e-4a77-9d0a-5d2f3c0e91aa",
  "command": "DOM_CLICK",
  "tab_id": 1234,
  "frame": { "by": "main" },
  "payload": {
    "selector": "#submit",
    "options": { "waitVisible": true, "input_mode": "auto" }
  },
  "meta": {
    "profile_id": "…", "launch_id": "…", "intent_id": "…",
    "seq": 42, "issued_at": 1789000000000, "ttl_ms": 15000
  }
}
```

- `schema_v` ausente ⇒ mensaje **v1**: la extensión lo procesa por el *shim de compatibilidad* (`target`/`tab_id`, payload sin `frame`, `frame` = `main`… salvo `frame_compat`, §8.2).
- `tab_id`: `number`. El alias `target:"active"` de v1 se mantiene solo en modo compat; en v2 es preferible `tab_id` explícito (evita ambigüedad sobre qué ventana es "activa").
- `meta.ttl_ms`: la extensión descarta comandos vencidos antes de ejecutarlos (protege contra ejecución tardía tras reconexión).
- Un request v2 **debe pesar < 1 MB**: el mensaje host → Chrome tiene ese tope duro en Native Messaging **[V]**. El límite en sentido inverso (Chrome → host) es 64 MiB **[V]**, suficiente para respuestas de `DOM_SNAPSHOT`.

**Response** (extensión → host → Brain, reutilizando `respondToHost(id, payload)` → `{type:"RESPONSE", id, payload}`):

```json
{ "success": true,
  "result": { "clicked": 1, "selector": "#submit" },
  "meta": { "actuator": "debugger", "frame_id": "…", "elapsed_ms": 38,
            "policy_version": "2026-09-19.1", "outcome": "applied" } }
```
```json
{ "success": false,
  "error": "Denied by authority policy",
  "error_code": "E_POLICY_DENIED",
  "retryable": false,
  "meta": { "rule_id": "A-001", "tier": "A", "outcome": "not_applied" } }
```

- `success`/`result`/`error` conservan la forma v1; `error_code`, `retryable`, `meta` son **adiciones**.
- **Compatibilidad temporal:** para comandos que hoy responden por evento (`DOM_COMMAND_ACK`, ruta `tab_id`), la extensión hace **dual-emit** (RESPONSE + `DOM_COMMAND_ACK`) hasta que Brain migre (WBS DA-1-04 / DA-4-02).
- `meta.outcome ∈ {applied, not_applied, unknown}`: en `E_TIMEOUT` sobre comandos de escritura el resultado puede ser `unknown`; **Brain debe re-observar (`DOM_READ`) antes de reintentar** (§5.4).

**Comandos de control nuevos** (mismo registro cerrado):

| Comando | Propósito |
|---|---|
| `ACTUATOR_REGISTER_TAB {tab_id, intent_id}` | Registra una tab como automatizable (habilita `ACTUATOR_READY`, §6.4). `tab.create` iniciado por Brain registra automáticamente. |
| `ACTUATOR_RELEASE {tab_id}` | Detach inmediato y baja del registro. |
| `ACTUATOR_CANCEL {id}` | Cancela un comando en vuelo (`E_CANCELLED`). |
| `DOM_FRAMES {tab_id}` | Devuelve el árbol de frames **filtrado por política** (frames denegados aparecen como `denied:true` sin URL). |
| `ACTUATOR_STATUS {tab_id?}` | Estado de sesión (diagnóstico). |
| `POLICY_TIGHTEN {hosts[]}` | Agrega hosts a la denylist **hasta el próximo arranque**; jamás quita (I-6, §7.2). Solo desde Sentinel/Brain autenticados. |

**Eventos** (extensión → Brain, canal `sendToHost` existente): `ACTUATOR_CAPABILITIES`, `ACTUATOR_READY`, `ACTUATOR_ATTACHED`, `ACTUATOR_DETACHED`, `ACTUATOR_DENIED`, `SIGNAL`, `PAGE_CHANGED`, `SLAVE_MODE_CHANGED`, `SLAVE_MODE_TIMEOUT` (estos dos ya existen), `ACTUATOR_AUDIT` (lotes, opcional).

### 5.3 Taxonomía de errores

| `error_code` | Significado | `retryable` |
|---|---|---|
| `E_UNKNOWN_COMMAND` | Comando fuera del registro. | No |
| `E_SCHEMA_INVALID` | Payload no cumple el esquema. | No |
| `E_POLICY_DENIED` | Host/tab denegado (incluye `rule_id`, `tier`). | No |
| `E_TAB_NOT_REGISTERED` / `E_TAB_NOT_FOUND` | Tab fuera del registro / inexistente. | No |
| `E_ATTACH_FAILED` | Subcódigos: `FOREIGN_DEBUGGER`, `ENTERPRISE_HOST_POLICY`, `ENTERPRISE_DLP_POLICY`, `UNATTACHABLE_TARGET`. Las dos políticas empresariales corresponden a los errores documentados de `attach` **[V]**. | Solo `FOREIGN_DEBUGGER` (con backoff) |
| `E_REVOKED_BY_USER` | El usuario descartó el banner (§6.3). | No (requiere re-autorización) |
| `E_DETACHED` | Sesión perdida durante el comando. | Solo lecturas |
| `E_FRAME_NOT_FOUND` | Frame inexistente, caduco o denegado. | No |
| `E_ELEMENT_NOT_FOUND` / `E_ELEMENT_NOT_VISIBLE` / `E_ELEMENT_OCCLUDED` | Resolución/visibilidad/oclusión. | Lecturas y waits |
| `E_SENSITIVE_FIELD` | Campo sensible (p. ej. password) bloqueado (§7.4). | No |
| `E_TIMEOUT` / `E_CANCELLED` | Tiempo agotado / cancelado. | Solo lecturas |
| `E_PAYLOAD_TOO_LARGE` / `E_UPLOAD_REF_INVALID` | Límites de tamaño / referencia de upload inválida. | No |
| `E_INTERNAL` | Error no clasificado (se audita). | No |

El campo `error` (string) de v1 se mantiene con el mensaje legible, para no romper consumidores actuales.

### 5.4 Semántica de ejecución

- **Orden y concurrencia:** por tab, FIFO estricto con **un comando en vuelo** (cola en `ActuatorClient` y aserción en la extensión). Entre tabs, paralelo.
- **Timeouts:** cada comando declara un default en el registro; `meta.ttl_ms` puede acortarlo, nunca ampliarlo por encima del máximo del registro.
- **Idempotencia:** `read`/`wait` son reintentables. `write`/`navigate` son *at-most-once*: **sin reintento automático**. Ante `outcome:"unknown"`, Brain re-observa y decide.
- **Cancelación:** `ACTUATOR_CANCEL` aborta esperas (`DOM_WAIT`) y comandos pendientes; no revierte efectos ya aplicados.
- **Backpressure:** cola por tab acotada (p. ej. 32); al excederla, `ActuatorClient` levanta `ActuatorBusy` (no descarta silenciosamente).

### 5.5 Negociación de capacidades

Tras `handshake_confirm` (estado `CONFIRMED`), la extensión emite **un evento adicional** —el handshake de 3 fases no se modifica (I-1):

```json
{ "event": "ACTUATOR_CAPABILITIES",
  "schema_v": 2,
  "actuator_default": "debugger",
  "commands": ["DOM_CLICK", "DOM_TYPE", "…"],
  "features": { "trusted_input": true, "frames": true, "oopif": true, "upload_by_ref": true },
  "policy": { "version": "2026-09-19.1", "sha256": "…", "mode": "deny_and_allow" },
  "chrome_version": "…" }
```

Brain hace *feature detection* con esto y degrada (o se niega) si falta una capacidad. Un `schema_v` mayor que el que Brain entiende ⇒ Brain no envía comandos v2.

### 5.6 API tipada del lado Brain (`ActuatorClient`)

Esbozo (Python) — no prescribe implementación, fija la forma de la interfaz:

```python
@dataclass(frozen=True)
class FrameRef:
    by: Literal["main", "frame_id", "url", "owner_selector", "first_match"] = "main"
    value: str | None = None

class ActuatorClient(Protocol):
    async def capabilities(self, profile_id: str) -> ActuatorCapabilities: ...
    async def register_tab(self, tab: TabRef, intent_id: str) -> None: ...
    async def release(self, tab: TabRef) -> None: ...

    async def navigate(self, tab: TabRef, url: str, *, wait_until: Literal["load", "domcontentloaded"] = "load",
                       timeout_ms: int = 30_000) -> NavResult: ...
    async def click(self, tab: TabRef, selector: str, *, frame: FrameRef = MAIN,
                    input_mode: Literal["auto", "trusted", "synthetic"] = "auto",
                    wait_visible: bool = True, timeout_ms: int = 15_000) -> ClickResult: ...
    async def type_text(self, tab: TabRef, selector: str, text: str, *, frame: FrameRef = MAIN,
                        clear: bool = True, timeout_ms: int = 15_000) -> TypeResult: ...
    async def read(self, tab: TabRef, selector: str, *, frame: FrameRef = MAIN,
                   attribute: str | None = None, multiple: bool = False) -> ReadResult: ...
    async def wait_for(self, tab: TabRef, selector: str, *, frame: FrameRef = MAIN, timeout_ms: int = 10_000) -> WaitResult: ...
    async def frames(self, tab: TabRef) -> list[FrameInfo]: ...
    async def upload(self, tab: TabRef, selector: str, files: list[UploadRef], *, frame: FrameRef = MAIN) -> UploadResult: ...
    def events(self) -> AsyncIterator[ActuatorEvent]: ...   # READY, DETACHED, DENIED, SIGNAL, PAGE_CHANGED…
```

Excepciones tipadas: `PolicyDenied`, `ActuatorRevoked`, `ActuatorDetached`, `ElementNotFound`, `ElementOccluded`, `SensitiveField`, `ActuatorTimeout(outcome)`, `ActuatorBusy`. **No existen** `send_cdp()` ni `evaluate()` en la interfaz; la ausencia es un requisito, no una omisión.

**Flujo típico (IonPump):**

```
IonPumpExecutor         ActuatorClient        host (L1)        Extensión (L2)
   │ click(tab,"#go") ───▶│                        │                  │
   │                      │ REQUEST v2 (id) ──────▶│ valida ─────────▶│ Registry ▸ Policy ▸ Session
   │                      │                        │                  │  ├ attach perezoso (si hace falta)
   │                      │                        │                  │  └ CdpGate ▸ chrome.debugger
   │                      │◀────── RESPONSE(id) ───│◀─────────────────│
   │◀─ ClickResult ───────│                        │                  │
   │  (eventos async: ACTUATOR_ATTACHED / SIGNAL / ACTUATOR_DETACHED …)│
```

### 5.7 Autenticación del canal local — hallazgo abierto

No se revisó cómo se protege hoy `TCP :5678`. Con `chrome.debugger` el techo de daño de un mensaje ilegítimo sube de "interactuar con el DOM de una pestaña" a "controlar el navegador"; la frontera de confianza pasa de un puerto 9222 a **este canal**. Requisitos mínimos propuestos (a confirmar con Brain/Host antes de cerrar Fase 1):

1. Escucha solo en `127.0.0.1`.
2. **Token de lanzamiento** (256 bits, generado por Sentinel por `launch_id`) presentado en el primer frame de cada conexión TCP; rechazo y cierre si falla. Se entrega a Brain y host por un canal privado del SO (herencia de entorno o archivo con ACL restringida), **nunca** vía `SYNAPSE_CONFIG` (H11).
3. Opcional/futuro: reemplazar TCP por *named pipe* con ACL de Windows.
4. Independientemente de lo anterior, **la extensión no confía en el host** (I-4): L2 valida todo.

---

## 6. Ciclo de vida de la sesión

### 6.1 Máquina de estados (por tab)

```
UNREGISTERED ──register / tab.create──▶ REGISTERED (detached)
REGISTERED   ──1er comando admitido───▶ ATTACHING ──ok──▶ ATTACHED_IDLE ◀──▶ ATTACHED_BUSY
ATTACHING    ──error───────────────────▶ REGISTERED   (+ E_ATTACH_FAILED)
ATTACHED_*   ──idle > TTL | RELEASE | UNLOCK+gracia──▶ DETACHING ──▶ REGISTERED
ATTACHED_*   ──onDetach(canceled_by_user)──▶ REVOKED   (pegajoso por launch_id)
ATTACHED_*   ──onDetach(otro / desconocido)─▶ LOST_FOREIGN ──backoff / reacquire──▶ ATTACHING
cualquiera   ──navegación a host denegado──▶ DENIED  (detach inmediato)
DENIED       ──navegación a host permitido─▶ REGISTERED
```

El estado se persiste en `chrome.storage.session` (`{tab_id → {state, intent_id, revoked, since, nav_id}}`) porque el service worker MV3 puede reiniciarse. Las sesiones activas de `chrome.debugger` mantienen vivo el service worker **[V]**, pero la persistencia es necesaria igualmente (crash, actualización, recarga de extensión).

### 6.2 Attach perezoso

Secuencia al llegar el **primer comando admitido** para una tab en `REGISTERED`:

1. **Admisión:** comando ∈ registro, esquema válido, `ttl` vigente, tab registrada y no `REVOKED`.
2. **Política (P1/P2, §7.2):** URL fresca (`chrome.tabs.get`) del top frame y del frame destino ⇒ `ALLOW`. Si `DENY` ⇒ `E_POLICY_DENIED`, **no se llama a `attach`**.
3. `chrome.debugger.attach({tabId}, DEBUGGER_PROTOCOL_VERSION)` con la versión configurable (la documentación indica `"0.1"` como ejemplo del parámetro; se fija la versión efectiva en PoC-3) **[V]/[PoC]**. Errores → `E_ATTACH_FAILED` con subcódigo (incluye los dos errores de política empresarial documentados **[V]**). Se mantiene un `Set` de tabs adjuntas para evitar doble attach.
4. **Asentamiento de layout:** el banner de depuración altera la altura del viewport **[PoC]**; antes de operar con geometría se esperan lecturas estables de `Page.getLayoutMetrics` (2 consecutivas, 50 ms, tope 500 ms). Las coordenadas se recalculan **inmediatamente antes** de cada despacho de input.
5. Habilitación mínima: `Page.enable`, `Page.setLifecycleEventsEnabled`, `Target.setAutoAttach {autoAttach:true, waitForDebuggerOnStart:false, flatten:true, filter:[{type:"iframe"}]}`. `Runtime.enable` solo si se requiere `executionContextCreated`; preferir `Page.createIsolatedWorld` por frame tras cada `Page.frameNavigated`.
6. Emitir `ACTUATOR_ATTACHED` y, si corresponde, `ACTUATOR_READY` (§6.4).

**Detach por inactividad (histéresis):** `idle_detach_ms = 30 000` por defecto —alineado con `SLAVE_MODE_TIMEOUT_MS` de `content.js`— más `post_unlock_grace_ms = 2 000` tras `UNLOCK_UI`. Un detach demasiado agresivo hace parpadear el banner y el layout en flujos con muchos comandos; demasiado laxo extiende la exposición. Ambos valores son configurables por perfil y se calibran en Fase 3.

### 6.3 `onDetach`: razones y acciones

> **Corrección de premisa (investigación).** Se planteó que `canceled_by_user` ocurre al abrir DevTools. La documentación vigente lista dos razones —`target_closed` y `canceled_by_user`— y describe `onDetach` como disparado al cerrar la tab **o al invocar DevTools** sobre ella **[V]**. Documentación archivada de la misma API incluía además `replaced_with_devtools` **[V]**, y el protocolo CDP indica que desde Chrome 63 existen múltiples clientes simultáneos y que el cliente desplazado recibe `detached` con esa razón **[V]**. Se espera que `canceled_by_user` corresponda al descarte del banner, pero la documentación no lo afirma explícitamente **[PoC]**. **Conclusión de diseño:** tratar `reason` como **string abierto**, no como enum cerrado, y mapear por comportamiento observado (PoC-3: matriz versión de Chrome × acción → `reason`).

| `reason` (crudo) | Interpretación | Acción del adaptador | Evento a Brain | Re-attach |
|---|---|---|---|---|
| `target_closed` | Pestaña cerrada | Limpiar lease; fallar en vuelo con `E_DETACHED` | `ACTUATOR_DETACHED {reason}` | n/a |
| `canceled_by_user` | El usuario **revocó** (descartó el banner) | Fallar en vuelo con `E_REVOKED_BY_USER`; estado `REVOKED` pegajoso por `launch_id`; detener timers; retirar UI lock | `ACTUATOR_DETACHED {reason, revoked:true}` | **Solo tras re-autorización explícita** del usuario (Landing) y nuevo `ACTUATOR_REGISTER_TAB` |
| `replaced_with_devtools` u otro cliente | DevTools/otro cliente tomó la sesión | Fallar en vuelo con `E_DETACHED`; estado `LOST_FOREIGN` | `ACTUATOR_DETACHED {reason, foreign:true}` | Backoff exponencial acotado; el `attach` fallará mientras persista el otro cliente ⇒ `E_ATTACH_FAILED/FOREIGN_DEBUGGER` |
| Cualquier valor desconocido | Fail-safe | Tratar como `LOST_FOREIGN`; log de severidad alta con el `reason` crudo | ídem | ídem |

Regla adicional: **jamás** re-adjuntar automáticamente tras `canceled_by_user`, aunque llegue un nuevo comando. La revocación humana prevalece sobre la intención de Brain (coherente con `AUTHORITY_BOUNDARY` §1).

### 6.4 `ACTUATOR_READY` sin romper el contrato

**Contrato actual:** `content.js` emite `actuator_ready` en *cada carga de cada frame de cualquier página*; `background.js` lo traduce a `ACTUATOR_READY {tab_id, url}`. Brain pudo haber asumido "tab abierta y lista para comandos".

**Nueva semántica (compatible en forma, más estrecha en alcance):**

- `ACTUATOR_READY {tab_id, url, frame_id, nav_id, attach_state, source:"debugger"}` se emite al **completar la carga del top frame** (`chrome.webNavigation.onCompleted` frameId 0, y `Page.loadEventFired` si hay sesión) **solo para tabs registradas** y **admitidas por política**.
- **No requiere estar adjunto:** `attach_state ∈ {"detached","attached"}`. Con attach perezoso, exigir attach previo provocaría un interbloqueo si Brain espera `READY` antes de su primer comando.
- Tabs **denegadas** ⇒ `ACTUATOR_DENIED {tab_id, rule_id, tier, point}` **sin URL** (no filtrar navegación sobre superficies protegidas).
- Tabs no registradas ⇒ **ningún** evento. Cambio deliberado frente a H6; requiere auditar en Brain si algún flujo depende de `READY` para tabs no creadas por él (WBS DA-1-07).

### 6.5 Reconciliación tras reinicio del service worker

Al arrancar: (1) recargar lease desde `storage.session`; (2) `chrome.debugger.getTargets()` **solo internamente** (no se reenvía: expone URLs de todas las tabs); (3) para cada tab con lease adjunto y `attached:true` → *adoptar*; con `attached:false` → limpiar; (4) tabs `attached:true` sin lease propio → ignorar (otro cliente); (5) reinstalar listeners `onEvent`/`onDetach` **de forma síncrona en el primer turno** del SW (requisito MV3), no dentro de promesas.

### 6.6 Banner (infobar): desarrollo vs. producción

| Entorno | Política | Justificación |
|---|---|---|
| **Producción** | Banner **visible**; Sentinel **no** pasa `--silent-debugger-extension-api`. | Es el kill switch del usuario (§6.3) e I-8. La ocultación solo es posible con ese switch de línea de comandos **[V]**, es decir, una decisión de quien lanza el navegador, no de la extensión. |
| **Desarrollo / CI** | Sentinel puede pasar el switch por perfil (`dev_silent_debugger: true`), **rechazado por el validador de configuración en builds de producción**. | Evita el banner en suites E2E. Sin el banner no existe la señal `canceled_by_user`: esa rama se prueba manualmente. |

Requisito de plataforma: sesiones planas (`sessionId`) exigen Chrome ≥ 125 **[V]** ⇒ `minimum_chrome_version: "125"` en el manifest y verificación en `ACTUATOR_CAPABILITIES`.

---

## 7. Seguridad

### 7.1 Modelo de amenazas

| # | Amenaza | Vector | Mitigación principal |
|---|---|---|---|
| T1 | Escalada: Brain/host comprometido ejecuta CDP arbitrario (`Network.getCookies`, `Runtime.evaluate`, capturas). | Canal :5678 / host | Fachada cerrada (I-2), `CdpGate`, plantillas pineadas (§7.3); L2 no confía en L1 (I-4); auth de canal (§5.7). |
| T2 | Automatización de superficies prohibidas (IA/credenciales). | Comando legítimo apuntando a host denegado; redirección; iframe; navegación post-attach. | `PolicyEngine` en 5 puntos (§7.2), fail-closed, política embebida y monótona. |
| T3 | Página hostil manipula el actuador (prototipos alterados, spoof de señales). | JS de la página | Ejecución en **mundo aislado**; `Runtime.addBinding` acotado al mundo aislado; payloads de `SIGNAL` tratados como pista no confiable. |
| T4 | Exfiltración de secretos vía `DOM_READ`/`DOM_SNAPSHOT`/logs. | Lectura de campos sensibles; logs de payload | Política de campos sensibles, redacción de logs (§7.4). |
| T5 | Lectura de archivos locales vía `DOM_UPLOAD` (ruta arbitraria → formulario web). | `DOM.setFileInputFiles` acepta rutas de disco **[V]** | Cuarentena + referencia opaca (§7.5); jamás rutas desde Brain. |
| T6 | TOCTOU: URL permitida al chequear, denegada al actuar (redirección/JS). | Navegación entre chequeo y despacho | Recheck pre-despacho (P5) + detach por navegación (P3). |
| T7 | Interferencia entre clientes de depuración (DevTools) o perfil corporativo restrictivo. | Otro cliente / políticas | Manejo explícito de `LOST_FOREIGN` y errores de política **[V]**. |
| T8 | Persistencia de la automatización tras retiro de consentimiento. | Re-attach automático | `REVOKED` pegajoso (§6.3). |

### 7.2 Denegación estricta de hosts

**Fuente única.** `policy/authority-boundary.denylist.json`, **embebido en el artefacto `.blx` firmado**, versionado (`policy_version`) y con hash reportado en `ACTUATOR_CAPABILITIES`. No se descarga ni se acepta del host. En runtime solo puede **añadirse** (I-6): `POLICY_TIGHTEN {hosts:[…]}` desde Brain/Sentinel agrega entradas hasta el próximo arranque; jamás elimina.

```json
{
  "schema_v": 1,
  "policy_version": "2026-09-19.1",
  "source": "AUTHORITY_BOUNDARY.md v1.2 §1, §3, §4",
  "tiers": {
    "A": { "status": "obligatorio",
           "reason": "§4 nota de alcance: superficies de IA",
           "hosts": ["claude.ai", "chatgpt.com", "grok.com", "aistudio.google.com"] },
    "B": { "status": "propuesto — confirmar con Gobernanza",
           "reason": "§1/§3/§4: credenciales y login de proveedores",
           "hosts": ["console.anthropic.com", "platform.openai.com", "console.x.ai",
                     "accounts.google.com", "myaccount.google.com"] },
    "C": { "status": "propuesto — requiere decisión de Gobernanza",
           "reason": "Otras herramientas de IA no enumeradas en §4",
           "hosts": ["gemini.google.com", "chat.openai.com", "perplexity.ai", "copilot.microsoft.com"] }
  },
  "dynamic": { "deny_tab_ids_from": ["googleLoginWatchers"] }
}
```

- **Coincidencia por host**, no por regex sobre la URL: `host === entry || host.endsWith("." + entry)`. Así `www.claude.ai` se deniega, y `claude.ai.evil.com` / `evilclaude.ai` **no** (no son subdominio ni igual). Nótese que `aistudio.google.com` se deniega **sin** denegar `google.com`.
- **Tab dinámica:** todo `tab_id` presente en `googleLoginWatchers` (`background.js`) se deniega **cualquiera sea su host**, cumpliendo `AUTHORITY_BOUNDARY` §2.1 (el watcher no ejecuta scripts en esa tab).
- **Nota de gobierno:** Reference §12 usa `perplexity.ai` como ejemplo de sitio para IonPump. Si "herramientas de IA" se interpreta como categoría, ese ejemplo contradice el límite. **Requiere fallo de Gobernanza** (§12, Q6); mientras tanto, Tier C se incluye en la denylist (opción conservadora).
- **Modo recomendado en producción — `deny_and_allow`:** además de la denylist (que siempre prevalece), exigir una **allowlist por perfil/intent** (`allowed_hosts` en `SYNAPSE_CONFIG`, sin secretos). Una denylist nunca podrá enumerar todas las herramientas de IA; la allowlist cierra esa brecha. `deny_only` queda para desarrollo.

**Normalización y casos borde** (cubiertos por tests de tabla, WBS DA-2-01):

```js
function decide(urlStr, ctx) {                       // ctx: {parentDecision, isTopFrame}
  let u;
  try { u = new URL(urlStr); } catch { return DENY("UNPARSEABLE_URL"); }        // I-7
  if (u.protocol === "blob:") {                      // blob:https://claude.ai/uuid → origin embebido
    if (u.origin === "null") return DENY("OPAQUE_ORIGIN");
    u = new URL(u.origin);
  }
  if (u.protocol === "about:" || u.protocol === "data:") {
    return ctx.parentDecision ?? DENY("OPAQUE_NO_PARENT");                        // heredan del frame padre
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return DENY("SCHEME");   // chrome:, file:, chrome-extension:, devtools:, view-source:
  const host = u.hostname.toLowerCase().replace(/\.$/, "");                       // "CLAUDE.AI." → "claude.ai"
  for (const [tier, t] of TIERS) for (const h of t.hosts)
    if (host === h || host.endsWith("." + h)) return DENY(`TIER_${tier}`, ruleId(tier, h));
  if (MODE === "deny_and_allow" && !matchesAllowlist(host, ctx)) return DENY("NOT_ALLOWLISTED");
  return ALLOW();
}
```

Casos a cubrir: mayúsculas, punto final, puerto, credenciales embebidas (`https://user@claude.ai@evil.com` ⇒ el host real es `evil.com`), punycode/IDN, `blob:`/`data:`/`about:blank` heredando del padre, esquemas no `http(s)`.

**Puntos de aplicación** — la denegación no es un único chequeo:

| Punto | Momento | Acción si `DENY` |
|---|---|---|
| **P1 Admisión** | Cada comando: URL fresca del top frame (`chrome.tabs.get`) y del frame destino; además la URL destino de `DOM_NAVIGATE`. | `E_POLICY_DENIED`; sin CDP. |
| **P2 Attach** | Inmediatamente antes de `chrome.debugger.attach`. | No adjuntar. |
| **P3 Navegación** | `webNavigation.onBeforeNavigate/onCommitted` y `Page.frameNavigated` mientras hay sesión. | **Detach inmediato**, estado `DENIED`, `ACTUATOR_DENIED`. |
| **P4 Frames/targets hijos** | `Target.attachedToTarget` y árbol de frames: si la URL del hijo (o de cualquier ancestro) es denegada. | `Target.detachFromTarget` (OOPIF) o exclusión del frame (mismo proceso); nunca `DOM.getDocument({pierce:true})` global. |
| **P5 Pre-despacho** | Justo antes de cada `Input.*` y de cada plantilla con efecto: URL *committed* más reciente del frame (caché síncrona alimentada por `webNavigation`). | Abortar con `E_POLICY_DENIED`. |

Denegaciones se auditan con `rule_id`, `tier` y **solo hostname** (nunca URL completa con query).

### 7.3 Fachada cerrada: registro, presupuesto CDP y plantillas pineadas

**Principio:** el *único* punto que toca `chrome.debugger.sendCommand` es `CdpGate`. Cada comando declara un **presupuesto** (lista finita de métodos CDP permitidos); cualquier otro es rechazado y auditado como `E_INTERNAL/CDP_BUDGET_VIOLATION` (indica bug, no entrada de usuario).

1. **Lint:** regla `no-restricted-properties` sobre `chrome.debugger.sendCommand` fuera de `cdp-gate.js`.
2. **Runtime:** `CdpGate.send(ctx, method, params)` valida `method ∈ budget(ctx.command)`.
3. **JS pineado:** `Runtime.callFunctionOn` solo con `functionDeclaration` **idéntica a una plantilla registrada** (hash SHA-256 calculado en build). Los argumentos son JSON validado (selectores acotados en longitud, `text` como dato, nunca concatenado en código). No existe camino para que un `payload` inyecte código: **sin `Runtime.evaluate`, sin `expression` desde Brain**.
4. **Sin passthrough ni "modo debug":** ni por flag, ni por perfil, ni en builds dev.

**Presupuesto por comando** (superficie mínima; todo lo demás, denegado):

| Comando | Métodos CDP permitidos (además de setup común §6.2) |
|---|---|
| `DOM_NAVIGATE` | `Page.navigate`; eventos `Page.lifecycleEvent`, `Page.loadEventFired`, `Page.frameNavigated` |
| `DOM_CLICK` | `Runtime.callFunctionOn` (plantillas `resolve`, `hit_test`), `DOM.scrollIntoViewIfNeeded`, `DOM.getContentQuads`, `DOM.getFrameOwner`, `DOM.getBoxModel`, `Page.getLayoutMetrics`, `Input.dispatchMouseEvent`, `Runtime.releaseObject` |
| `DOM_TYPE` | `Runtime.callFunctionOn` (`resolve`, `clear`), `DOM.focus`, `Input.insertText`, `Input.dispatchKeyEvent` (solo teclas de edición) |
| `DOM_READ` / `DOM_EXTRACT` | `Runtime.callFunctionOn` (`read`), `Runtime.releaseObject` |
| `DOM_WAIT` | `Runtime.callFunctionOn` con `awaitPromise` (`wait`) |
| `DOM_FOCUS` / `DOM_SCROLL` | `DOM.focus` / `DOM.scrollIntoViewIfNeeded`, `Runtime.callFunctionOn` (`scroll`) |
| `DOM_SNAPSHOT` | `DOMSnapshot.captureSnapshot` o `Runtime.callFunctionOn` (`outer_html`) |
| `DOM_UPLOAD` | `DOM.setFileInputFiles` (rutas solo de cuarentena) o `Runtime.callFunctionOn` (`upload_datatransfer`) |
| `DOM_WATCH` / `UNWATCH` | `Page.addScriptToEvaluateOnNewDocument` (**solo** plantilla `watch`), `Runtime.addBinding` (acotado a mundo aislado), `Runtime.removeBinding`, `Page.removeScriptToEvaluateOnNewDocument` |
| `DOM_WATCH_URL` | Evento `Page.navigatedWithinDocument` (+ `chrome.webNavigation.onHistoryStateUpdated`) |
| `DOM_FRAMES` | `Page.getFrameTree` |

**Dominios y métodos explícitamente denegados** (fixture de test: se recorre la lista completa de métodos CDP y se afirma que todos los no presupuestados fallan):
`Network.*` (incl. `getCookies`, `getAllCookies`), `Storage.*`, `CacheStorage.*`, `Database.*`, `Fetch.*`, `IO.*`, `Debugger.*`, `Profiler.*`, `Tracing.*`, `WebAuthn.*`, `WebAudio.*`, `Emulation.*`, `Overlay.*`, `Audits.*`, `Log.*`, `Console.*`, `CSS.*`, `DOMDebugger.*`, `Inspector.*`, `Performance.*`; y dentro de dominios usados: `Runtime.evaluate`, `Runtime.compileScript`, `Runtime.runScript`, `Page.captureScreenshot`, `Page.printToPDF`, `Page.setDocumentContent`, `Page.setBypassCSP`, `Page.setInterceptFileChooserDialog`, `Page.addScriptToEvaluateOnNewDocument` con fuente no pineada, `Target.createTarget/closeTarget/getTargets/setDiscoverTargets/attachToTarget` (salvo hijos autorizados vía `setAutoAttach`), `DOM.setOuterHTML/setNodeValue/setAttributeValue` y demás mutaciones. Capturas de pantalla, si algún día se necesitan, serán un **comando propio** con revisión de política (`AUTHORITY_BOUNDARY` §1 prohíbe screenshots automáticos de pantallas de login).

El subconjunto de dominios que Chrome expone a extensiones ya excluye, por ejemplo, `Browser` y `SystemInfo` **[V]**; esta fachada restringe *dentro* de ese subconjunto.

### 7.4 Datos: campos sensibles, logs y auditoría

- **Campos sensibles:** `DOM_READ`, `DOM_SNAPSHOT` y `DOM_TYPE` rechazan con `E_SENSITIVE_FIELD` los elementos `input[type=password]` y los `autocomplete` `current-password`, `new-password`, `one-time-code`, `cc-*`. Levantar esta restricción requiere una bandera de política firmada (Gobernanza), no un parámetro de comando.
- **Redacción de logs (H9):** `sendToHost` y `forwardToDebugPanel` deben omitir `payload.text`, `result` y `response` de comandos `ACTUATOR`; se registra longitud y hash truncado, nunca contenido. Cambio transversal (WBS DA-1-10).
- **Auditoría:** ver §9.

### 7.5 Subida de archivos (`DOM_UPLOAD`)

`DOM.setFileInputFiles` toma **rutas de archivo del disco** **[V]**: si Brain pudiera pasar una ruta arbitraria, cualquier archivo local podría subirse a un formulario web (T5). Diseño:

1. **Cuarentena en el host:** `bloom-host.exe` escribe el archivo bajo `%LOCALAPPDATA%\Bloom\uploads\{launch_id}\{upload_id}\{nombre}` con ACL restringida al usuario, y devuelve `upload_ref {id, sha256, size, name}`. Limpieza tras el comando, por TTL y al terminar el `launch_id`.
2. **El comando lleva `upload_ref`, jamás la ruta.** El host resuelve `id → ruta canónica` y valida: prefijo de cuarentena, sin `..`, sin UNC ni enlaces simbólicos/junctions, tamaño y hash.
3. La extensión **verifica** que la ruta recibida (si viaja al adaptador) tenga el prefijo `upload_root` de `SYNAPSE_CONFIG` y no contenga segmentos `..`; no puede verificar el disco (I-4 limita lo que puede garantizar, por eso la responsabilidad primaria es del host).
4. **Fallback sin disco** (archivos pequeños): plantilla `upload_datatransfer` con contenido en base64 en fragmentos < 1 MB por mensaje (límite host→Chrome **[V]**). La actual implementación (`Blob([f.content])`) solo soporta texto (H10).
5. `DOM_UPLOAD` hereda toda la política de dominios (§7.2). PoC-2 decide entre (1–3) y (4).

### 7.6 Cambios de manifest

| Cambio | Detalle |
|---|---|
| **Agregar** `debugger` | Advierte al instalar: acceso al backend de depuración de páginas y lectura/modificación de datos en todos los sitios **[V]**. |
| `minimum_chrome_version: "125"` | Sesiones planas **[V]**. |
| **Retirar** `content_scripts` estático de `content.js` (`<all_urls>`, `all_frames`) | Solo tras Fase 4. Durante la migración, `content.js` se registra **dinámicamente** (`chrome.scripting.registerContentScripts`) únicamente si `actuator_impl=content`, para que el rollback no obligue a mantener presencia pasiva. |
| **Agregar** `ui/bloom-ui.js` (inyección bajo demanda) | Solo UI (§8.3); sin `onMessage` de comandos DOM. |
| **Revisar** `web_accessible_resources` | Quitar `*.synapse.config.js` si ninguna página web lo necesita (H11). |
| **Verificar ausencia** de `clipboardRead` | Prohibido permanentemente (`AUTHORITY_BOUNDARY` §1/§3.2). |
| **Revisar** `host_permissions: <all_urls>` | El permiso `debugger` ya implica acceso amplio a datos de sitios (advertencia citada arriba) **[V]**. Confirmar empíricamente en DA-1-09 si `<all_urls>` sigue siendo necesario (p. ej., para `scripting.executeScript` de la UI) o puede acotarse. |

---

## 8. Adaptación de comandos

### 8.1 Equivalencias y diferencias frente al modelo anterior

| Comando | Mecanismo CDP | Diferencia respecto de hoy |
|---|---|---|
| `DOM_CLICK` | Resolver elemento (plantilla `resolve`) → `scrollIntoViewIfNeeded` → `getContentQuads` → verificación de oclusión (`hit_test`) → `Input.dispatchMouseEvent` (`mouseMoved`, `mousePressed`, `mouseReleased`). | Eventos **trusted** (hoy `isTrusted:false`); dependen de *hit-testing* ⇒ ver §8.3. La opción `multiple` itera. `waitVisible` pasa a verificar visibilidad y oclusión reales, no `offsetParent`. |
| `DOM_TYPE` | `DOM.focus` + `Input.insertText`; `clear` por plantilla `clear` (`select()`) o `Ctrl+A`/`Delete`. | Mejora (H7): funciona con inputs controlados por frameworks y `contenteditable`. `triggerEvents` se vuelve implícito. Bloquea campos sensibles (§7.4). |
| `DOM_READ` / `DOM_EXTRACT` | Plantilla `read` en **mundo aislado**. | Paridad. `DOM_EXTRACT` sigue como alias explícito. Aplica política de campos sensibles. |
| `DOM_WAIT` | Plantilla `wait` (MutationObserver + `awaitPromise`) con timeout. | Paridad o mejor: comprueba en t=0 (hoy el primer chequeo ocurre a los 500 ms). |
| `DOM_FOCUS` / `DOM_SCROLL` | `DOM.focus`; `scrollIntoViewIfNeeded` / plantilla `scroll`. | Paridad. |
| `DOM_SNAPSHOT` | `DOMSnapshot.captureSnapshot` o `outer_html`. | `includeStyles`: hoy probablemente ineficaz (`getComputedStyle().cssText` suele devolver vacío **[I]**); se reimplementa con datos de `DOMSnapshot`. Límite de 64 MiB en la respuesta **[V]**. |
| `DOM_NAVIGATE` | Ver §8.4. | Corrige H1. |
| `DOM_UPLOAD` | Ver §7.5. | Referencia opaca; soporta binarios. |
| `DOM_WATCH` / `DOM_WATCH_URL` / `DOM_UNWATCH` | Ver §8.4. | Corrige H2; sobrevive a navegaciones. |
| `LOCK_UI` / `UNLOCK_UI` | Script de UI bajo demanda (§8.3). | Deja de correr en todas las páginas. |

### 8.2 Direccionamiento explícito de iframes

**Modelo anterior (H5):** broadcast a todos los frames; responde el primero. **Nuevo:** `frame` explícito en el envelope; **por defecto `main`**.

```json
"frame": { "by": "main" }
"frame": { "by": "frame_id", "value": "F3A9…" }              // obtenido de DOM_FRAMES
"frame": { "by": "url", "value": "https://pay.example.com/*" } // glob sobre la URL del frame
"frame": { "by": "owner_selector", "value": "iframe#checkout" } // CSS en el frame padre → su frame hijo
"frame": { "by": "first_match" }                                // solo compat (ver abajo)
```

**Resolución (`FrameResolver`).**

1. Árbol de frames desde `Page.getFrameTree`, mantenido con `Page.frameAttached/Navigated/Detached`. **Los frames denegados y sus subárboles se excluyen** (P4): un iframe de un host prohibido dentro de una página permitida es inalcanzable.
2. **Mismo proceso:** cada frame es un *contexto de ejecución* del mismo target **[V]**; se crea un mundo aislado por frame (`Page.createIsolatedWorld({frameId})`) y las plantillas se ejecutan con su `executionContextId`.
3. **Fuera de proceso (OOPIF):** el hijo es un target aparte **[V]**. Se atiende con `Target.setAutoAttach` (`flatten:true`, filtro `iframe`) y `sessionId` en `sendCommand` (Chrome ≥ 125) **[V]**. El auto-attach **no es recursivo** (A→B→C exige repetirlo para B) **[V]**: el `onEvent(Target.attachedToTarget)` reaplica `setAutoAttach` sobre cada hijo.
4. **Coordenadas de mouse:** `Input.dispatchMouseEvent` usa coordenadas relativas al viewport del **frame principal** **[V]**; para elementos en iframes se suma el desplazamiento de cada `owner` (`DOM.getFrameOwner` + `DOM.getBoxModel` en la sesión del padre) hasta la raíz, técnica habitual en librerías de automatización **[PoC: DA-0-04]**.
5. **Caducidad:** los `frame_id` son opacos y volátiles; el registro lleva un `nav_id` por frame y responde `E_FRAME_NOT_FOUND` si el frame cambió de generación.
6. **Sin `DOM.getDocument({pierce:true})` global:** atravesaría iframes del mismo proceso sin pasar por política (P4).

**Compatibilidad `frame_compat`.** Algunas recetas `.ion` pueden depender —por accidente— del broadcast. Se ofrece `first_match`: recorre los frames **permitidos** en orden de árbol (principal primero) y ejecuta en el **primer** frame donde el selector resuelve (determinista, a diferencia del "primer respondedor"). Es un puente: se audita el uso (`meta.frame_compat_used`) y se retira en Fase 4 tras migrar recetas (WBS DA-3-02, DA-4-02).

### 8.3 Slave mode vs. entrada *trusted*

**Conflicto.** `content.js` bloquea al usuario con `document.body.style.pointerEvents='none'` (H8). `el.click()` no pasa por hit-testing y funciona igual; `Input.dispatchMouseEvent` sí se comporta como input real **[I]/[PoC]**, por lo que un clic dirigido a un descendiente de `body` caería en `html` y no en el objetivo. La documentación de CDP define `Input.setIgnoreInputEvents` solo como "ignora el procesamiento de eventos de entrada (útil al auditar la página)" **[V]** y **no especifica** si exime a los eventos despachados por `Input.dispatch*`; eso se decide en PoC-1.

| Opción | Descripción | Pro | Contra / riesgo |
|---|---|---|---|
| **S1** | `Input.setIgnoreInputEvents(true)` durante el lock; el adaptador despacha por CDP. | Sin DOM extra; bloqueo real del usuario. | **Incierto** si exime a CDP **[PoC-1a]**. Si no exime, bloquearía también al adaptador. |
| **S2** | **Shield** de viewport completo (`pointer-events:auto`, listeners en captura que cancelan eventos del usuario, sin tomar foco). Antes de cada despacho el adaptador lo pone en `pointer-events:none` (1 llamada), despacha y lo restaura. | Independiente de S1; explícito. | Ventana de milisegundos donde un clic real podría colarse; mitigable con verificación posterior y con S1 si funciona. |
| **S3** | `input_mode:"synthetic"`: `el.click()` vía plantilla (comportamiento actual). | Paridad exacta; sin conflicto. | Pierde eventos trusted; no sirve para sitios que los exijan. |
| **S4** | *Attended mode*: sin bloqueo; banner + ribbon; el adaptador aborta si detecta interferencia (foco/scroll/URL inesperados). | Máxima simplicidad. | Riesgo de interferencia humana. |

**Decisión provisional (sujeta a PoC-1):** por defecto **`input_mode:"auto"`** = trusted con lock **S2** (o **S1** si PoC-1a demuestra exención), degradando a **S3** cuando el trusted sea inviable en esa página. Ninguna variante requiere que el actuador dependa de `pointer-events:none` en `body`.

**Dónde vive la UI.** Ribbon, overlay y shield salen de `content.js` a **`ui/bloom-ui.js`**, inyectado **bajo demanda** con `chrome.scripting.executeScript` **solo** en el *top frame* de tabs admitidas por política (P1) —no en todos los frames—. Contrato mínimo: `UI_LOCK`, `UI_UNLOCK`, `UI_SHIELD {open|closed}`, aceptados **solo** desde el service worker (`sender.id === chrome.runtime.id`); sin lectura/escritura de contenido de la página. Mantiene el *timer de seguridad* de 30 s y los eventos `slave_mode_changed`/`slave_mode_timeout` existentes (contrato intacto). El banner de `chrome.debugger` complementa —no reemplaza— el ribbon.

### 8.4 Comandos con diseño propio

**`DOM_NAVIGATE`.** P1 sobre la **URL destino** (denegar antes de navegar) y solo `http(s)` (nunca `javascript:`, `file:`, `chrome:`). `Page.navigate` + espera de `Page.loadEventFired` / `lifecycleEvent` (`wait_until` configurable) desde el service worker, que sobrevive a la navegación. Alternativa sin debugger para tabs no adjuntas: `chrome.tabs.update` + `webNavigation.onCompleted`. Tras navegar: `ACTUATOR_READY` (§6.4) y P3.

**`DOM_WATCH` / `DOM_UNWATCH`.** CDP no ofrece un *push* de "apareció el selector". Diseño: plantilla `watch` (MutationObserver) registrada con `Page.addScriptToEvaluateOnNewDocument` en un **mundo aislado con nombre**, que notifica mediante `Runtime.addBinding` acotado a ese mundo; llega como evento `Runtime.bindingCalled` y se traduce a `SIGNAL`. Persiste entre navegaciones. Los datos que llegan por el binding se tratan como **no confiables** (T3). `DOM_UNWATCH` elimina binding y script. *(Acotado a mundo aislado: **[PoC]** en DA-3-13.)*

**`DOM_WATCH_URL`.** Sin parches en `history`: `Page.navigatedWithinDocument` (con sesión) o `chrome.webNavigation.onHistoryStateUpdated` (sin sesión, no requiere attach). El matching de patrones glob conserva la semántica actual (`*` como comodín) y produce `PAGE_CHANGED`.

---

## 9. Observabilidad y auditoría

- **Registro de auditoría** (anillo de N entradas en `chrome.storage.session`, espejado a Brain en lotes `ACTUATOR_AUDIT`): `ts`, `tab_id`, `command`, `decision (ALLOW|DENY)`, `rule_id`, `tier`, `hostname`, `frame_id`, `outcome`, `elapsed_ms`, `policy_version`, `impl (content|debugger)`, `error_code`. **Nunca** `text`, valores leídos ni URL completa.
- **Métricas:** tasa de éxito por comando e implementación, latencia p50/p95, attach/detach por hora, `LOST_FOREIGN`, `REVOKED`, denegaciones por regla, violaciones de presupuesto CDP (debe ser **0**).
- **Alarma de gobierno:** cualquier `CDP_BUDGET_VIOLATION` o un intento de comando sobre Tier A/B en producción genera evento de severidad alta hacia Brain.

## 10. Estrategia de pruebas

| Capa | Qué se prueba | Cómo |
|---|---|---|
| **Unitarias — PolicyEngine** | Tabla de URLs (§7.2): subdominios, punto final, credenciales embebidas, IDN, `blob:`/`data:`/`about:blank`, esquemas no permitidos, `googleLoginWatchers`. | Tests por tabla; fail-closed. |
| **Contrato — CdpGate** | Ningún método fuera de presupuesto; barrido de todos los dominios/métodos denegados. | Test que enumera el catálogo CDP y afirma rechazo; lint de `sendCommand`. |
| **Esquema/fuzz** | Todo comando rechaza payloads mal formados y campos extra; límites de tamaño. | Generado desde el SSoT. |
| **E2E** | Páginas *fixture* locales: formularios React controlados, `contenteditable`, iframes mismo-origen y cross-origin, SPA con `pushState`, overlay/oclusión, slave mode. | Perfil de test con `--silent-debugger-extension-api` (solo CI). |
| **Denegación E2E sin tocar sitios reales** | Servidor local servido bajo nombres denegados mediante `--host-resolver-rules="MAP claude.ai 127.0.0.1"` (HTTP en puerto no estándar). | **Ningún test automatiza los sitios reales** (I-3). |
| **Ciclo de vida** | Cierre de tab, DevTools, service worker detenido y reanudado, re-attach, `LOST_FOREIGN`, navegación a host denegado tras attach. | E2E + checklist manual para el descarte del banner (`canceled_by_user`, no automatizable con el switch silencioso). |
| **Shadow** | Comandos de solo lectura (`READ`, `SNAPSHOT`, `WAIT`) corren en ambas implementaciones y se comparan resultados. | Nunca se ejecutan escrituras en ambas. |
| **Seguridad** | Página hostil: prototipos alterados, spoof del binding, redirecciones encadenadas, iframe de host denegado, `blob:`. | Checklist de revisión (WBS DA-2-07). |

## 11. Rollout y rollback

- **Flag:** `actuator_impl ∈ {content, debugger, shadow}` en `SYNAPSE_CONFIG`, con override por comando. `shadow` solo para lecturas.
- **Orden:** olas 3A → 3B → 3C (WBS), *canary* por perfil interno primero.
- **Regla de oro:** ningún build con `actuator_impl=debugger` habilitado sin P1–P5 y `CdpGate` operativos (WBS: Fase 2 es gate de Fase 3).
- **Rollback:** poner el comando (o perfil) en `content`. `content.js` se registra dinámicamente solo en ese caso (§7.6) para no conservar presencia pasiva.
- **Criterios de retiro de `content.js`** (a definir con QA): paridad de éxito ≥ línea base, p95 de latencia ≤ 1,5× de la línea base, **cero** violaciones de política en auditoría durante dos releases.

## 12. Riesgos y preguntas abiertas

| ID | Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|---|
| R-01 | Slave mode irresoluble con trusted input. | Media | Alto | Matriz S1–S4 en PoC-1; degradación S3. |
| R-02 | Semántica de `onDetach` distinta a la documentada. | Media | Medio | `reason` como string abierto; PoC-3. |
| R-03 | Denylist incompleta (herramientas de IA no enumeradas). | Alta | Alto | Modo `deny_and_allow` en producción; proceso de Gobernanza para Tier C. |
| R-04 | Complejidad de OOPIF/coordenadas. | Media | Medio | PoC-4; `first_match` como puente; alcance inicial `main`. |
| R-05 | El banner degrada la UX o el layout. | Media | Medio | Asentamiento de layout; histéresis; política dev/prod. |
| R-06 | Cambios de Chrome sobre `chrome.debugger` (política, banner, dominios). | Baja | Alto | `minimum_chrome_version`, capabilities, seguimiento de release notes; `ContentActuator` como salvavidas hasta Fase 4. |
| R-07 | Si se publicara en Chrome Web Store, el permiso `debugger` sube la fricción de revisión (`AUTHORITY_BOUNDARY` §6: permisos mínimos). | Baja (hoy `.blx`) | Medio | Documentar justificación; decisión de producto antes de cualquier publicación. |
| R-08 | Perfiles empresariales bloquean `attach` **[V]**. | Media | Medio | Subcódigos de error; comunicar requisito de política. |
| R-09 | Eventos trusted vuelven indistinguible la automatización de un humano (postura ante ToS de terceros). | — | Alto | I-3 y denylist por capa; allowlist por intent; sin evasión como no-objetivo. |
| R-10 | Recetas IonPump dependen del broadcast a iframes. | Media | Bajo | `first_match` + auditoría de recetas. |

**Preguntas abiertas** (necesitan respuesta antes de cerrar la fase indicada):

| ID | Pregunta | Responsable | Bloquea |
|---|---|---|---|
| Q1 | ¿Tiers B y C son correctos y completos? (`PROVIDER-EXECUTION-SPEC.md` §1–2 no revisado). | Gobernanza | Fase 2 |
| Q2 | ¿Cómo se autentica hoy `:5678`? | Brain / Host | Fase 1 |
| Q3 | ¿Algún flujo de Brain depende de `ACTUATOR_READY` para tabs no creadas por él? | Brain | Fase 1 |
| Q4 | ¿Qué recetas `.ion` dependen de iframes o del broadcast? | IonPump | Fase 3A |
| Q5 | ¿Dónde se manejan hoy `SIGNAL`/`PAGE_CHANGED` (¿`background-companion.js`?)? | Extensión | Fase 3C |
| Q6 | ¿"Herramientas de IA" es categoría? Ejemplo `perplexity.ai` de Reference §12. | Gobernanza | Fase 2 |
| Q7 | ¿Hay intención de publicar en Chrome Web Store? | Producto | Antes de Fase 4 |
| Q8 | ¿Metamorph puede fijar Chrome ≥ 125? | Plataforma | Fase 1 |
| Q9 | ¿Algún flujo IonPump actual apunta a sitios de IA? De ser así ya viola I-3, con o sin este RFC. | Gobernanza / IonPump | Fase 2 |

## 13. Registro de decisiones (ADR resumido)

| ADR | Decisión | Alternativas descartadas |
|---|---|---|
| **1** | Mantener Native Messaging; `chrome.debugger` solo reemplaza el último tramo. | Puerto 9222 / CDP remoto (amplía la superficie y elimina el host). |
| **2** | Fachada cerrada; sin `CDP_SEND`/`EVAL` ni en dev. | Passthrough con allowlist de métodos (siguen siendo primitivas demasiado potentes). |
| **3** | Un único `CdpGate` con presupuesto por comando y plantillas pineadas. | Validación dispersa en cada handler. |
| **4** | Denylist embebida y firmada; solo endurecible en runtime. | Política dinámica descargable (permitiría debilitar el control). |
| **5** | Attach perezoso con histéresis; banner visible en producción como kill switch. | Attach permanente; `--silent-debugger-extension-api` en producción. |
| **6** | La extensión no confía en host/Brain; L1 en host es defensa en profundidad. | Validar solo en Brain/host. |
| **7** | UI (ribbon/overlay/shield) en script bajo demanda separado del actuador. | Mantener `content.js` estático completo. |
| **8** | `ACTUATOR_READY` solo para tabs registradas, sin exigir attach. | Emitirlo para toda página (H6) / exigir attach previo (interbloqueo). |
| **9** | Revocación humana (`canceled_by_user`) pegajosa. | Re-attach automático. |
| **10** | Contrato v2 aditivo, con dual-emit temporal y `schema_v`. | Ruptura de contrato con Brain/IonPump. |

## 14. Referencias

- `chrome.debugger` (permisos, dominios disponibles, sesiones planas Chrome 125, `onDetach`, restricciones empresariales): https://developer.chrome.com/docs/extensions/reference/api/debugger
- Lista de permisos y advertencias (`debugger`): https://developer.chrome.com/docs/extensions/reference/permissions-list
- Ciclo de vida del service worker (las sesiones de `chrome.debugger` lo mantienen vivo): https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
- Native Messaging (1 MB host→Chrome, 64 MiB Chrome→host): https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging
- CDP, dominio Input (`dispatchMouseEvent`, `setIgnoreInputEvents`, `insertText`): https://chromedevtools.github.io/devtools-protocol/tot/Input/
- CDP, dominio DOM (`setFileInputFiles` acepta rutas de archivo): https://chromedevtools.github.io/devtools-protocol/tot/DOM/
- CDP, visión general (múltiples clientes desde Chrome 63; `replaced_with_devtools`): https://chromedevtools.github.io/devtools-protocol/
- Documentación archivada de `chrome.debugger` con la razón `replaced_with_devtools`: http://chrome-apps-doc2.appspot.com/trunk/extensions/debugger.html
- Chromium issue sobre el banner y el switch `--silent-debugger-extension-api`: https://issues.chromium.org/issues/40141220
- Internos: `AUTHORITY_BOUNDARY.md` v1.2; `BTIPS-CORTEX-REFERENCE-v1_2.md`; `content.js` v2.3; `background.js`.
