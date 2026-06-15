# IONPUMP IMPLEMENTATION PROMPT — Complete Specification v5.0

> **CHANGELOG v5.0** — Post-auditoría completa del estado real. Mayo 2026.
> Cambios respecto a v4.0:
> (1) Formato de paquete reemplazado: formato monolítico (`flows:`) reemplazado por
>     estructura tripartita (`actions/` + `pages/` + `shared/`) con `domain.manifest.json`.
> (2) Phase 6 reescrita: 6a y 6b implementadas en Go — ya no bloqueadas. Contratos
>     Go de `IonPumpClient` documentados como fuente de verdad que Brain debe satisfacer.
> (3) Phase 7 (build pipeline) agregada: `build-bootstrap-ions.py` y `bootstrap-ions.json`
>     documentados como parte del sistema.
> (4) Corrección crítica: nombre del manifest en Brain era `ion.manifest.json` — debe ser
>     `domain.manifest.json` (alineado con Metamorph Go, que es fuente de verdad).
> (5) Cortex: cuatro nuevos DOM commands requeridos (`DOM_NAVIGATE`, `DOM_WATCH`,
>     `DOM_WATCH_URL`, `DOM_UNWATCH`). Cambio mínimo — solo el array `DOM_COMMANDS`.
> (6) `IonRecipeInfo` actualizado: `flow_count` eliminado, reemplazado por `page_count`
>     y `shared_count` (alineado con output real de Metamorph inspect).
> (7) Status values de inspección actualizados a los cuatro estados reales de Metamorph:
>     `healthy`, `missing_manifest`, `invalid_manifest`, `missing_entrypoint`.
> (8) Nuevos step types documentados: `navigate`, `wait_signal`, `check`, `select`.
> (9) Variables y resolución de contexto extendidas con `$SIGNAL.payload.*`.
>
> Sin cambios a la arquitectura IPC (TCP localhost), al runtime de Brain, ni a los
> contratos de Synapse Protocol existentes.

---

## CONTEXT & BACKGROUND

Este documento es la especificación completa y fuente de verdad para la implementación de
**IonPump** en el ecosistema Bloom BTIPS. Consolida y supersede todos los documentos
anteriores (v1–v4, SDK Developer Guide, Deploy Guide, y los estados técnicos de Brain,
Cortex y Metamorph).

El sistema tiene cuatro componentes con trabajo pendiente en esta iteración:

| Componente | Lenguaje | Estado de trabajo |
|---|---|---|
| Brain (IonPump runtime) | Python | Extensión principal — subdirectorios + nuevos step types |
| Cortex (Chrome Extension) | JS | Cambio mínimo — 4 nuevos DOM commands |
| Metamorph (deploy) | Go | Implementado — documentación de estado real |
| Build pipeline | Python | Implementado — documentación y uso |

---

## REFERENCE DOCUMENTS

Los siguientes documentos son fuente de verdad para sus respectivos dominios. En caso de
conflicto con versiones anteriores del prompt, estos documentos tienen precedencia.

| Documento | Dominio |
|---|---|
| `metamorph-ionpump-state.md` | Tipos Go, filesystem layout, contratos de interfaz, status values |
| `BRAIN_IONPUMP_EXTENSION.md` | Estado actual de Brain — qué existe, qué falta |
| `CORTEX-IONPUMP-EXTENSION.md` | Estado actual de Cortex — líneas de anclaje exactas |
| `ION_SDK_Developer_Guide.md` | Formato de paquete Ion v2.0 — DSL, page descriptors, actions |
| `IONSITE_DEPLOY_GUIDE.md` | Flujo operacional de deploy con Metamorph |
| `tu-primer-ion-github.md` | Ejemplo canónico completo — `github.com` PAT flow |
| `bootstrap-ions.json` | Manifest real de bootstrap — estructura de referencia |
| `build-bootstrap-ions.py` | Script de build — rutas, lógica de hash, output |

---

## WHAT IS IONPUMP?

IonPump es un **web automation runtime** que vive dentro de Brain y ejecuta paquetes `.ion`
— colecciones de archivos YAML declarativos que enseñan a Bloom cómo operar un sitio web
específico. Traduce los flows declarativos en comandos Synapse atómicos que `content.js`
ejecuta en el browser via la extensión Cortex.

**Principio clave:**
> IonPump NO es un CLI standalone.
> IonPump es un RUNTIME invocado por IntentExecutor cuando un intent requiere web automation.

**Separación de responsabilidades dentro de un paquete Ion:**

| Directorio | Contenido | Semántica |
|---|---|---|
| `actions/` | `*.ion` — flows de negocio | Qué tiene que pasar (API pública del paquete) |
| `pages/` | `*.page.ion` — descriptores de página | Contratos estáticos: selectores, ready conditions, signals |
| `shared/` | `*.ion` — fragments reutilizables | Lógica compartida entre actions (auth guards, retry) |
| `domain.manifest.json` | JSON — índice del paquete | Registry: qué actions son públicas, capabilities, versión |

---

## ARCHITECTURAL POSITION

```
┌─────────────────────────────────────────────────────────────┐
│ USER                                                        │
│ Intent: { domain: "github.com", action: "generate_pat" }   │
└────────────┬────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│ BRAIN: IntentExecutor                                       │
│ - Detecta intent_subtype == "web_automation"                │
│ - Extrae: domain, action, context                           │
│ - Invoca: IonPumpManager.execute_action()                   │
└────────────┬────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│ BRAIN: IonPumpManager (RUNTIME)                             │
│ - Lazy-load del paquete desde IonRegistry                   │
│ - Resuelve requires: [] → ejecuta shared fragments primero  │
│ - Resuelve element names via page descriptors               │
│ - Traduce steps Ion → SynapseCommand objects                │
│ - Gestiona state machine por (tab_id, domain)               │
└────────────┬────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│ BRAIN: IonPumpIPCClient                                     │
│ - Lee puerto desde run/ipc_{launch_id}.port                 │
│ - Envía SynapseCommand como JSON via TCP localhost          │
└────────────┬────────────────────────────────────────────────┘
             │ TCP 127.0.0.1
             ▼
┌─────────────────────────────────────────────────────────────┐
│ BRAIN: SynapseIPCServer (en Brain-Host process)             │
│ - Recibe comandos IonPump, los rutea via _action_map        │
│ - Llama protocol.send_message() → Chrome                    │
└────────────┬────────────────────────────────────────────────┘
             │ Native Messaging (existente, sin cambios)
             ▼
┌─────────────────────────────────────────────────────────────┐
│ CORTEX: background.js                                       │
│ - Rutea DOM commands al content script de la tab            │
│ - Reenvía ACK del content script a Brain                    │
└────────────┬────────────────────────────────────────────────┘
             │ chrome.tabs.sendMessage
             ▼
┌─────────────────────────────────────────────────────────────┐
│ CORTEX: content.js                                          │
│ - Ejecuta acciones DOM                                      │
│ - Envía ACK de vuelta                                       │
└─────────────────────────────────────────────────────────────┘
```

---

## FILESYSTEM STRUCTURE

### Paquetes Ion en disco (runtime)

```
%LOCALAPPDATA%\BloomNucleus\bin\cortex\ionsites\
├── github.com\
│   ├── domain.manifest.json       ← índice del paquete (schema_version: "2.0")
│   ├── actions\
│   │   └── generate_pat.ion       ← flow de negocio público
│   ├── pages\
│   │   ├── tokens_page.page.ion
│   │   └── new_token_page.page.ion
│   └── shared\
│       └── session_guard.ion      ← fragment reutilizable
├── _backup\
│   └── github.com\                ← versión anterior (disponible para rollback)
├── _meta\
│   └── versions.json              ← estado de todas las versiones instaladas
└── _staging\
    └── downloads\
        └── github.com.ion         ← ZIP antes de extracción

macOS (desarrollo):
~/Library/BloomNucleus/bin/cortex/ionsites/
```

> **Regla crítica:** Los directorios con prefijo `_` son ignorados por
> `InspectAllIonRecipes`. IonLoader debe seguir la misma convención.

> **IonLoader behavior:** `discover_all()` debe crear `ionsites/` si no existe —
> no es un error, significa que no hay paquetes desplegados aún.

### IPC Runtime Files

```
%LOCALAPPDATA%\BloomNucleus\run\
└── ipc_{launch_id}.port    ← escrito por SynapseIPCServer al startup
                               contiene: entero plano (puerto TCP)
                               eliminado cuando SynapseManager termina
```

### Build pipeline (repo)

```
installer/
├── ions/
│   └── github.com/                ← fuente de los archivos .ion (editados acá)
│       ├── domain.manifest.json
│       ├── actions/
│       ├── pages/
│       └── shared/
├── metamorph/
│   └── scripts/
│       └── build-bootstrap-ions.py  ← empaqueta ions/ → ZIPs + hashes
└── native/
    └── ionpump/
        ├── github.com.ion.zip       ← ZIP generado por el build script
        └── bootstrap-ions.json      ← manifest con hashes reales (generado)
```

---

## PAQUETE ION — FORMATO COMPLETO (schema_version "2.0")

### domain.manifest.json

Primer archivo que lee IonLoader. Define el contrato del paquete.

```json
{
  "schema_version": "2.0",
  "domain": "github.com",
  "version": "1.0.0",
  "description": "Generate a GitHub Personal Access Token",
  "author": { "name": "Bloom Platform", "contact": "platform@bloom.io" },

  "actions": {
    "generate_pat": {
      "file": "actions/generate_pat.ion",
      "public": true
    }
  },

  "pages": {
    "tokens_page":    "pages/tokens_page.page.ion",
    "new_token_page": "pages/new_token_page.page.ion"
  },

  "shared": {
    "session_guard": "shared/session_guard.ion"
  },

  "entry_actions": ["generate_pat"],

  "capabilities": [
    "dom_navigate", "dom_type", "dom_click",
    "dom_extract", "dom_watch", "clipboard_read"
  ],

  "requires_cortex_version": ">=1.2.0"
}
```

**Reglas de validación (alineadas con Metamorph Go):**

- `schema_version` ausente o distinto de `"2.0"` → rechazar paquete.
- `version == ""` → status `invalid_manifest`.
- Cada nombre en `entry_actions` debe existir como clave en `actions` y el
  archivo referenciado debe existir en disco → status `missing_entrypoint`.
- Tamaño máximo del manifest: 64 KB (`ionManifestMaxSize` en Metamorph Go).

> **Corrección crítica respecto a v4:** Brain usaba `ion.manifest.json`.
> El nombre correcto es `domain.manifest.json` (constante `domainManifestFile`
> en `metamorph-ionpump-state.md`). Metamorph es fuente de verdad.

### Page Descriptors (`pages/*.page.ion`)

Los page descriptors **no ejecutan nada**. Son contratos estáticos. Los actions
referencian elementos por nombre — nunca por selector CSS directo.

```yaml
page: "tokens_page"
url_pattern: "*/settings/tokens"

ready_when:
  - selector: ".listgroup, [data-testid='tokens-list']"
    timeout: 10000
  - selector: "body"
    attribute: "data-loading"
    value: "false"
    timeout: 5000
    optional: true      # la página sigue siendo ready si esta condición no existe

elements:
  generate_button:
    selector: "a[href*='/new'], [data-testid='create-token-btn']"
    type: clickable     # clickable | typeable | selectable | checkable | extractable

signals:
  session_expired:
    detect: ".flash-error, [data-testid='session-modal']"
    once: true
    priority: high      # high interrumpe el action en curso para recovery

transitions:
  on_signal:
    session_expired: "login_page"
  on_navigate:
    "*/settings/tokens/new*": "new_token_page"
    "*/login*":               "login_page"
```

**Razón de la separación:** Cuando un sitio cambia un selector, se actualiza
un page descriptor. Todos los actions que usan ese elemento heredan la corrección
automáticamente. Ningún action contiene un selector CSS.

### Actions (`actions/*.ion`)

Los flows de negocio. Son los únicos archivos marcados `public: true` en el
manifest — son la API surface del paquete.

```yaml
action: "generate_pat"
description: >
  Genera un PAT en GitHub. Navega a /settings/tokens,
  completa el formulario, y emite el token via PAT_GENERATED.

requires:
  - session_guard_passed    # IonPump verifica el event_log; si ausente, lo ejecuta primero

steps:
  - navigate:
      url: "https://github.com/settings/tokens"
      expect_page: "tokens_page"
      fallback:
        on_page: "login_page"
        call: "shared/session_guard"
        then: retry

  - click:
      element: "generate_button"
      on_page: "tokens_page"

  - wait:
      element: "token_name_input"
      on_page: "new_token_page"
      timeout: 8000

  - type:
      element: "token_name_input"
      on_page: "new_token_page"
      text: "$CONTEXT.token_name"

  - select:
      element: "expiration_select"
      on_page: "new_token_page"
      value: "$CONTEXT.expiration"

  - click:
      element: "submit_button"
      on_page: "new_token_page"

  - wait_signal:
      signal: "token_generated"
      on_page: "new_token_page"
      timeout: 15000

  - extract:
      element: "token_value"
      on_page: "new_token_page"
      save_to: "$CONTEXT.generated_pat"

  - emit:
      event: "PAT_GENERATED"
      payload:
        token: "$CONTEXT.generated_pat"
        token_name: "$CONTEXT.token_name"
        provider: "github"

error_handlers:
  timeout:
    retry: 2
    backoff: 1500
    fallback: "emit_error"
  signal_timeout:
    retry: 1
    fallback: "emit_error"
  page_mismatch:
    retry: 0
    fallback: "emit_error"
```

### Shared Fragments (`shared/*.ion`)

Fragments reutilizables. No son actions — no pueden invocarse desde fuera del paquete.
IonPump los memoiza en el `event_log` de la sesión: si el evento de confirmación ya
fue emitido, no se re-ejecutan.

```yaml
fragment: "session_guard"
description: "Verifica sesión. Hace login si es necesario."

steps:
  - check:
      condition: "page_matches"
      pattern: "*/login*"
      if_true:
        - type:
            element: "username_input"
            on_page: "login_page"
            text: "$CONTEXT.github_username"
        - type:
            element: "password_input"
            on_page: "login_page"
            text: "$CONTEXT.github_password"
        - click:
            element: "submit_button"
            on_page: "login_page"
        - wait_signal:
            signal: "login_success"
            on_page: "login_page"
            timeout: 12000

  - emit:
      event: "session_guard_passed"
```

---

## STEP TYPES — REFERENCIA COMPLETA

### Mapping Ion step → Synapse command

| Step Ion | Synapse command | Parámetros | Estado |
|---|---|---|---|
| `wait` | `DOM_WAIT` | element (resuelto a selector via page), timeout | Existente |
| `click` | `DOM_CLICK` | element → selector | Existente |
| `type` | `DOM_TYPE` | element → selector, text (con resolución de variables) | Existente |
| `focus` | `DOM_FOCUS` | element → selector | Existente |
| `scroll` | `DOM_SCROLL` | element → selector, behavior | Existente |
| `extract` | `DOM_EXTRACT` | element → selector, save_to | Existente |
| `emit` | `EVENT_EMIT` | event, payload | Existente |
| `navigate` | `DOM_NAVIGATE` | url, expect_page | **Nuevo** |
| `wait_signal` | `DOM_WATCH` (registro) + espera interna | signal, on_page, timeout | **Nuevo** |
| `select` | `DOM_SELECT` | element → selector, value | **Nuevo** |
| `check` | (lógica interna — no genera comando Synapse) | condition, if_true, if_false | **Nuevo** |
| `call` | (lógica interna — invoca fragment o action) | target | **Nuevo** |
| `transition` | `STATE_TRANSITION` | to (siguiente estado) | Existente |

> **Nota sobre `check`:** Es una bifurcación condicional que IonPump resuelve
> internamente. No genera ningún comando Synapse — ejecuta la rama `if_true` o
> `if_false` como una sub-lista de steps.

> **Nota sobre `wait_signal`:** Los signals se registran pasivamente via `DOM_WATCH`
> al entrar a una página (paso `navigate`). `wait_signal` solo aguarda a que el
> evento correspondiente llegue del browser — no registra nada nuevo.

### Comandos Synapse nuevos requeridos en `_action_map`

Estos comandos deben agregarse a `SynapseManager._action_map` en Phase 2
**y** al array `DOM_COMMANDS` en Cortex `background.js`:

| Comando | Descripción |
|---|---|
| `DOM_NAVIGATE` | Navega a una URL. IonPump envía luego `DOM_WAIT` (ready_when) y `DOM_WATCH` (signals). |
| `DOM_WATCH` | Registra MutationObserver para un signal declarado en el page descriptor. |
| `DOM_WATCH_URL` | Intercepta `pushState`/`popstate` para detectar navegación SPA. |
| `DOM_UNWATCH` | Desconecta observers al salir de una página. |

---

## VARIABLE RESOLUTION

| Sintaxis | Resuelve a |
|---|---|
| `$CONTEXT.key` | Valor del contexto inyectado por Brain al ejecutar el intent |
| `$CONTEXT.token_name` | Ejemplo: campo específico del contexto |
| `$CONTEXT.github_username` | Credential inyectada por Nucleus Vault |
| `$SIGNAL.payload.field` | Valor extraído del payload del último signal recibido |
| `${variable_name}` | Variable declarada a nivel de recipe o page descriptor |

**Regla de seguridad:** `$CONTEXT` es inyectado por Brain en runtime. El paquete Ion
nunca lee desde disco, localStorage, ni ningún browser storage. Las credenciales
siempre vienen via Nucleus Vault — nunca hardcodeadas en archivos `.ion`.

---

## IMPLEMENTATION FILES

### Brain — Core Runtime

```
brain/core/ionpump/
├── ionpump_manager.py       # Orquestador principal (singleton)
├── ionpump_loader.py        # Cargador de paquetes con watchdog
├── ionpump_registry.py      # Registry en memoria de paquetes cargados
├── ionpump_executor.py      # Executor de flows (Ion → SynapseCommand objects)
├── ionpump_state.py         # State machine por (tab_id, domain)
├── ionpump_models.py        # Dataclasses para la estructura Ion
├── ionpump_validator.py     # Validador de sintaxis
└── ionpump_ipc.py           # IPC client — conecta a SynapseIPCServer
```

### Brain — IPC Layer

```
brain/core/synapse/
├── synapse_ipc_server.py    # TCP server — recibe comandos IonPump, los forwarde a Chrome
└── [archivos existentes sin cambios]
```

### Brain — Admin Commands

```
brain/commands/ionpump/
├── __init__.py
├── ionpump_inspect.py
├── ionpump_validate.py
├── ionpump_reload.py
└── ionpump_test.py
```

### Brain — Integration Points

```
brain/core/synapse/synapse_manager.py
  MODIFICAR: lanzar SynapseIPCServer en thread dentro de run_host_loop()
  MODIFICAR: agregar DOM_NAVIGATE, DOM_WATCH, DOM_WATCH_URL, DOM_UNWATCH a _action_map

brain/core/intent/
  ⚠️  Ver Phase 3 (DEFERRED) — confirmar nombre real del dispatcher antes de tocar
```

### Cortex — background.js

```javascript
// Línea ~626 — DOM_COMMANDS array
// AGREGAR estas cuatro entradas. El dispatch y ACK ya están implementados.
const DOM_COMMANDS = [
  "DOM_CLICK", "DOM_TYPE", "DOM_WAIT",
  "DOM_FOCUS", "DOM_SCROLL", "DOM_EXTRACT",
  // Nuevos:
  "DOM_NAVIGATE",
  "DOM_WATCH",
  "DOM_WATCH_URL",
  "DOM_UNWATCH",
];
```

> **Constraint crítico del v4 mantenido:** No modificar `content.js` ni la lógica
> de dispatch existente. El array `DOM_COMMANDS` es el único punto de cambio en Cortex.

---

## DATA MODELS — PYTHON

### ionpump_models.py — cambios respecto a v4

```python
@dataclass
class IonAction:
    """Una action declarada en domain.manifest.json."""
    name: str
    file: str           # path relativo al root del paquete
    public: bool

@dataclass
class IonManifest:
    """
    Parsea domain.manifest.json.
    CAMBIO RESPECTO A V4: agrega actions, pages, shared.
    ELIMINA: entrypoint (monolítico), flows, triggers.
    """
    schema_version: str          # debe ser "2.0"
    domain: str                  # antes: site
    version: str
    description: str
    author_name: str
    author_contact: str
    actions: Dict[str, IonAction]         # clave: nombre, valor: IonAction
    pages: Dict[str, str]                 # clave: nombre, valor: path relativo
    shared: Dict[str, str]                # clave: nombre, valor: path relativo
    entry_actions: List[str]
    capabilities: List[str]
    requires_cortex_version: str

@dataclass
class IonElement:
    """Un elemento interactivo declarado en un page descriptor."""
    name: str
    selector: str
    element_type: str   # clickable | typeable | selectable | checkable | extractable

@dataclass
class IonSignal:
    """Un signal pasivo declarado en un page descriptor."""
    name: str
    detect: str         # selector CSS que activa el signal
    once: bool
    priority: str       # "normal" | "high"

@dataclass
class IonPageDescriptor:
    """Parsea un archivo *.page.ion."""
    page: str
    url_pattern: str
    ready_when: List[Dict]          # lista de condiciones de ready
    elements: Dict[str, IonElement]
    signals: Dict[str, IonSignal]
    transitions: Dict               # on_signal + on_navigate

@dataclass
class IonStep:
    """Un step dentro de un flow."""
    step_type: str      # navigate | wait | click | type | select | focus |
                        # scroll | extract | emit | wait_signal | check | call | transition
    params: Dict[str, Any]

@dataclass
class IonFlow:
    """Un flow dentro de un action o fragment."""
    name: str
    steps: List[IonStep]
    requires: List[str]          # eventos que deben estar en event_log

@dataclass
class IonRecipe:
    """
    Un action o fragment completo — resultado de parsear un archivo *.ion.
    CAMBIO RESPECTO A V4: ya no hay flows{} en la raíz. Cada archivo *.ion
    es un único action o fragment con sus propios steps.
    """
    kind: str           # "action" | "fragment"
    name: str
    description: str
    requires: List[str]
    steps: List[IonStep]
    error_handlers: Dict[str, Dict]

@dataclass
class IonSitePackage:
    """
    Representación completa de un paquete Ion cargado en memoria.
    Reemplaza la _RegistryEntry anterior que solo tenía manifest + un recipe.
    """
    manifest: IonManifest
    root_path: Path
    actions: Dict[str, IonRecipe]           # lazy-loaded, clave: nombre de action
    pages: Dict[str, IonPageDescriptor]     # eager-loaded al registrar el site
    shared: Dict[str, IonRecipe]            # lazy-loaded, clave: nombre de fragment

class IonRecipeStatus:
    """Alineado con los status values reales de Metamorph Go."""
    HEALTHY = "healthy"
    MISSING_MANIFEST = "missing_manifest"
    INVALID_MANIFEST = "invalid_manifest"
    MISSING_ENTRYPOINT = "missing_entrypoint"
```

---

## IONLOADER — CAMBIOS REQUERIDOS

### Correcciones críticas

```python
# ANTES (incorrecto):
MANIFEST_FILENAME = "ion.manifest.json"

# DESPUÉS (correcto — alineado con Metamorph Go):
MANIFEST_FILENAME = "domain.manifest.json"
```

### Nuevo flujo de carga al registrar un site

```python
def load_site(self, site_dir: Path) -> IonSitePackage:
    """
    Carga un paquete Ion completo desde su directorio.
    Reemplaza el load_recipe() anterior que solo cargaba un .ion de la raíz.
    """

    # 1. Leer y validar domain.manifest.json
    manifest_path = site_dir / "domain.manifest.json"
    if not manifest_path.exists():
        raise IonLoadError(site_dir.name, IonRecipeStatus.MISSING_MANIFEST)

    manifest = self._parse_manifest(manifest_path)

    # 2. Validar schema_version
    if manifest.schema_version != "2.0":
        raise IonLoadError(site_dir.name, IonRecipeStatus.INVALID_MANIFEST,
                           f"schema_version '{manifest.schema_version}' not supported")

    # 3. Cargar TODOS los page descriptors (eager — son pequeños y son la base
    #    para resolver element names en tiempo de ejecución)
    pages = {}
    for page_name, page_path in manifest.pages.items():
        full_path = site_dir / page_path
        pages[page_name] = self._parse_page_descriptor(full_path)

    # 4. Actions y shared: lazy — se parsean al primer uso
    #    El registry guarda los paths, no los objetos parseados.

    # 5. Verificar entry_actions (igual que Metamorph Go)
    for entry_name in manifest.entry_actions:
        if entry_name not in manifest.actions:
            raise IonLoadError(site_dir.name, IonRecipeStatus.MISSING_ENTRYPOINT,
                               f"entry_action '{entry_name}' not in actions")
        action_path = site_dir / manifest.actions[entry_name].file
        if not action_path.exists():
            raise IonLoadError(site_dir.name, IonRecipeStatus.MISSING_ENTRYPOINT,
                               f"action file missing: {action_path}")

    return IonSitePackage(
        manifest=manifest,
        root_path=site_dir,
        actions={},     # poblado lazy
        pages=pages,    # eager-loaded
        shared={},      # poblado lazy
    )

def _load_action(self, package: IonSitePackage, action_name: str) -> IonRecipe:
    """Lazy-load de un action específico."""
    if action_name in package.actions:
        return package.actions[action_name]

    action_meta = package.manifest.actions.get(action_name)
    if not action_meta:
        raise IonActionNotFound(package.manifest.domain, action_name)

    recipe = self._parse_ion_file(package.root_path / action_meta.file)
    package.actions[action_name] = recipe
    return recipe

def _load_shared(self, package: IonSitePackage, fragment_name: str) -> IonRecipe:
    """Lazy-load de un fragment shared."""
    if fragment_name in package.shared:
        return package.shared[fragment_name]

    fragment_path_rel = package.manifest.shared.get(fragment_name)
    if not fragment_path_rel:
        raise IonFragmentNotFound(package.manifest.domain, fragment_name)

    recipe = self._parse_ion_file(package.root_path / fragment_path_rel)
    package.shared[fragment_name] = recipe
    return recipe
```

---

## IONEXECUTOR — CAMBIOS REQUERIDOS

### Resolución de element names

El `IonExecutor` actual usa selectores CSS directos en los steps. En el nuevo
modelo, los steps usan `element: "generate_button"` + `on_page: "tokens_page"`.
El executor debe resolver el nombre al selector usando el page descriptor.

```python
def _resolve_element(
    self,
    element_name: str,
    page_name: str,
    package: IonSitePackage
) -> str:
    """
    Resuelve un element name a su selector CSS via el page descriptor.
    Lanza IonElementNotFound si el elemento no está declarado en la página.
    """
    page = package.pages.get(page_name)
    if not page:
        raise IonPageNotFound(package.manifest.domain, page_name)

    element = page.elements.get(element_name)
    if not element:
        raise IonElementNotFound(page_name, element_name)

    return element.selector
```

### Nuevos step types en STEP_TO_COMMAND

```python
STEP_TO_COMMAND = {
    # Existentes:
    "wait":       "DOM_WAIT",
    "click":      "DOM_CLICK",
    "type":       "DOM_TYPE",
    "focus":      "DOM_FOCUS",
    "scroll":     "DOM_SCROLL",
    "extract":    "DOM_EXTRACT",
    "emit":       "EVENT_EMIT",
    "transition": "STATE_TRANSITION",
    # Nuevos:
    "navigate":   "DOM_NAVIGATE",
    "select":     "DOM_SELECT",
    # Internos (no generan comando Synapse):
    # "wait_signal" → espera evento; signals pre-registrados via DOM_WATCH en navigate
    # "check"       → bifurcación interna
    # "call"        → invocación de fragment o action
}
```

### Ejecución de requires[] antes de un action

```python
def execute_action(
    self,
    package: IonSitePackage,
    action_name: str,
    tab_id: str,
    context: Dict
) -> IonExecutionResult:
    """
    Ejecuta un action, resolviendo requires[] primero.
    """
    action = self.loader._load_action(package, action_name)

    # Verificar y ejecutar requires[] en orden
    for required_event in action.requires:
        if required_event not in self.state.event_log:
            # Encontrar qué fragment emite este evento
            fragment = self._find_fragment_for_event(package, required_event)
            if fragment:
                self._execute_fragment(package, fragment, tab_id, context)
            # Si no se encuentra, el action continúa (el evento puede venir de Brain)

    # Ejecutar los steps del action
    return self._execute_steps(package, action.steps, tab_id, context)
```

---

## IPC LAYER — SIN CAMBIOS RESPECTO A V4

La arquitectura IPC (TCP localhost, `SynapseIPCServer`, `IonPumpIPCClient`) está
definida en el v4 y no cambia. Se reproduce aquí por completitud.

### SynapseIPCServer (`brain/core/synapse/synapse_ipc_server.py`)

```python
class SynapseIPCServer:
    def __init__(self, protocol: SynapseProtocol, launch_id: str, run_dir: Path): ...
    def start(self) -> int: ...          # bind, escribe port file, inicia thread
    def stop(self) -> None: ...          # detiene thread, elimina port file
    def _handle_connection(self, conn): ...
    def _dispatch_ion_command(self, command): ...
```

### Integración en SynapseManager.run_host_loop()

```python
def run_host_loop(self) -> None:
    ipc_server = SynapseIPCServer(
        protocol=self.protocol,
        launch_id=self._launch_id,
        run_dir=self._run_dir
    )
    ipc_server.start()
    try:
        while True:
            message = self.protocol.read_message()
            if not message:
                break
            self._dispatch_message(message)
    finally:
        ipc_server.stop()
```

### _action_map extendido

```python
self._action_map = {
    # Existentes (sin cambios):
    "SYSTEM_HELLO":    self._handle_handshake,
    "HEARTBEAT":       self._handle_heartbeat,
    "LOG_ENTRY":       self._handle_log_entry,
    # Existentes de IonPump (Phase 2):
    "DOM_FOCUS":       self._handle_dom_passthrough,
    "DOM_TYPE":        self._handle_dom_passthrough,
    "DOM_CLICK":       self._handle_dom_passthrough,
    "DOM_WAIT":        self._handle_dom_passthrough,
    "DOM_SCROLL":      self._handle_dom_passthrough,
    "DOM_EXTRACT":     self._handle_dom_passthrough,
    "EVENT_EMIT":      self._handle_dom_passthrough,
    "STATE_TRANSITION": self._handle_state_transition,
    # Nuevos (v5):
    "DOM_NAVIGATE":    self._handle_dom_passthrough,
    "DOM_WATCH":       self._handle_dom_passthrough,
    "DOM_WATCH_URL":   self._handle_dom_passthrough,
    "DOM_UNWATCH":     self._handle_dom_passthrough,
    "DOM_SELECT":      self._handle_dom_passthrough,
}
```

---

## HOT-RELOAD MECHANISM

```python
# brain/core/ionpump/ionpump_loader.py

class IonRecipeWatcher(FileSystemEventHandler):
    def __init__(self, registry: IonRegistry, loader: IonLoader):
        self.registry = registry
        self.loader = loader

    def on_modified(self, event):
        if event.src_path.endswith('.ion') or \
           event.src_path.endswith('.json'):
            domain = self._extract_domain(event.src_path)
            try:
                new_package = self.loader.load_site(Path(event.src_path).parent)
                self.registry.update(domain, new_package)
                logger.info(f"Hot-reloaded: {domain}")
            except IonLoadError as e:
                logger.error(f"Invalid package, keeping previous: {domain} — {e}")
                # Emitir ION_RELOAD_FAILED (Cortex lo forwardea a páginas internas)
```

> **Prerequisito:** Verificar que `watchdog` está declarado como dependencia en
> `requirements.txt` o `pyproject.toml` antes de implementar Phase 4.

**Rollback en hot-reload inválido:**
1. Log del error con detalles de validación.
2. Mantener el paquete anterior en memoria.
3. Emitir `ION_RELOAD_FAILED` (ya definido en `IONPUMP_EVENTS` de Cortex).
4. Continuar usando el paquete anterior hasta que se corrija.

---

## METAMORPH — ESTADO REAL (Phase 6)

Phase 6a y 6b están **completamente implementadas** en Go. Este documento describe
el estado real — no hay trabajo de código pendiente en Metamorph para esta iteración.

### Archivos

| Archivo | Responsabilidad |
|---|---|
| `types.go` | Todos los tipos del paquete inspection |
| `inspect.go` | Comando inspect, config, resolución de paths |
| `ionrecipes.go` | Inspección, staging, swap, reconciliación, crash recovery |

### Comando inspect

```powershell
metamorph inspect --ion-recipes
metamorph inspect --ion-recipes --show-pending
metamorph inspect --ion-recipes --show-backups
metamorph --json inspect --ion-recipes
```

**Output JSON** — envuelto como objeto separado (no dentro de InspectionResult de binarios):
```json
{ "ion_recipes": { ...IonRecipesResult... } }
```

**IonRecipeInfo — campos reales:**
```go
type IonRecipeInfo struct {
    Site                  string   `json:"site"`
    Version               string   `json:"version"`
    Description           string   `json:"description"`
    SchemaVersion         string   `json:"schema_version"`
    EntryActions          []string `json:"entry_actions"`
    PublicActions         []string `json:"public_actions"`
    PageCount             int      `json:"page_count"`    // NO flow_count
    SharedCount           int      `json:"shared_count"`
    Capabilities          []string `json:"capabilities"`
    RequiresCortexVersion string   `json:"requires_cortex_version"`
    SizeBytes             int64    `json:"size_bytes"`
    Status                string   `json:"status"`
}
```

**Status values reales:**

| Valor | Condición |
|---|---|
| `healthy` | Manifest válido, todos los entry_actions existen en disco |
| `missing_manifest` | `domain.manifest.json` no existe |
| `invalid_manifest` | JSON inválido o `version == ""` |
| `missing_entrypoint` | Un entry_action no existe en actions o el archivo no está |

### Reconciliación — 7 fases

| Fase | Acción | Falla si... |
|---|---|---|
| 1. Skip check | Compara version + SHA-256 con lo instalado | — retorna `skipped` |
| 2. Stage | Extrae ZIP de `_staging/downloads/` a `_staging/<domain>/` | ZIP no existe o corrupto |
| 3. Verify | SHA-256 por archivo según `files[]` del manifest | Cualquier hash no coincide |
| 4. Signal pre | `QuiesceSite()` a Brain (10s timeout) | Timeout → `failed` (salteado con `--force-swap`) |
| 5. Swap | `atomicSwap`: live→backup + staging→live | Rename falla → reversión automática |
| 6. Signal post | `ReloadSite()` a Brain | Error → activa fase 7 |
| 7. Rollback | Restaura desde `_backup/` | — si también falla: `failed` |

### Contrato IonPumpClient — Brain debe implementar el receptor

```go
type IonPumpClient interface {
    QuiesceSite(site string, timeoutMs int) (QuiesceResult, error)
    ReloadSite(site string, version string) (ReloadResult, error)
}

type QuiesceResult struct {
    Status      string `json:"status"`       // "quiesced" | "timeout"
    ActiveFlows int    `json:"active_flows"`
}

type ReloadResult struct {
    Status  string `json:"status"` // "reloaded" | "error"
    Version string `json:"version"`
    Error   string `json:"error,omitempty"`
}
```

Brain debe exponer un endpoint (HTTP o socket) que Metamorph llame durante el deploy.
Cuando Metamorph llama `ReloadSite()`, Brain debe:
1. Llamar a `IonLoader.load_site()` para recargar el paquete desde disco.
2. Actualizar el `IonRegistry` con el nuevo `IonSitePackage`.
3. Responder `{"status": "reloaded", "version": "..."}`.

Cuando Metamorph llama `QuiesceSite()`, Brain debe:
1. Detener la aceptación de nuevos flows para ese dominio.
2. Esperar a que los flows activos completen (o timeout).
3. Responder `{"status": "quiesced", "active_flows": 0}`.

### Comando de deploy

```powershell
# Deploy completo
metamorph reconcile-ion-recipes --manifest manifest.json

# Dry-run (recomendado primero)
metamorph reconcile-ion-recipes --manifest manifest.json --dry-run

# Sin señalizar a Brain (solo para testing sin Brain corriendo)
metamorph reconcile-ion-recipes --manifest manifest.json --force-swap

# Con output JSON para diagnóstico
metamorph --json reconcile-ion-recipes --manifest manifest.json
```

---

## BUILD PIPELINE

### Estructura de fuentes en el repo

```
installer/ions/
└── github.com/
    ├── domain.manifest.json
    ├── actions/
    │   └── generate_pat.ion
    ├── pages/
    │   ├── tokens_page.page.ion
    │   └── new_token_page.page.ion
    └── shared/
        └── session_guard.ion
```

Los archivos `.ion` se editan en `installer/ions/`. **Nunca editar directamente**
los archivos en AppData — son gestionados exclusivamente por Metamorph.

### Script de build

```
installer/metamorph/scripts/build-bootstrap-ions.py
```

**Qué hace:**
1. Lee cada site desde `installer/ions/<domain>/`.
2. Empaqueta en `installer/native/ionpump/<domain>.ion.zip` (ZIP deflate, paths POSIX).
3. Calcula SHA-256 del ZIP completo y de cada archivo individual.
4. Actualiza `installer/native/ionpump/bootstrap-ions.json` con los hashes reales.

**Cuándo ejecutarlo:** Como parte del build del installer, antes de empaquetar
`installer/native/ionpump/` para distribución. No es necesario ejecutarlo para
desarrollo local (se puede hacer deploy manual con `--force-swap`).

```bash
python installer/metamorph/scripts/build-bootstrap-ions.py
```

### bootstrap-ions.json — estructura real

```json
{
  "manifest_version": "1.0",
  "type": "ion_recipes",
  "release_channel": "bootstrap",
  "ions": [
    {
      "domain": "github.com",
      "version": "1.0.0",
      "zip_path": "installer/native/ionpump/github.com.ion.zip",
      "download_url": "",
      "sha256": "<hash del ZIP completo>",
      "files": [
        { "path": "actions/generate_pat.ion", "sha256": "<hash>" },
        { "path": "domain.manifest.json",     "sha256": "<hash>" },
        { "path": "pages/new_token_page.page.ion", "sha256": "<hash>" },
        { "path": "pages/tokens_page.page.ion",    "sha256": "<hash>" },
        { "path": "shared/session_guard.ion",      "sha256": "<hash>" }
      ]
    }
  ]
}
```

> **Nota sobre campo `download_url`:** Presente pero vacío en el bootstrap.
> Metamorph soporta `zip_path` (local) para bootstrap y `download_url` (Batcave)
> para actualizaciones automáticas futuras. El campo `recipes[]` del v4 spec
> fue reemplazado por `ions[]` en el manifest real.

---

## ADMIN COMMANDS (Brain)

### brain ionpump inspect

```bash
brain ionpump inspect
brain ionpump inspect --domain github.com
brain ionpump inspect --json
```

```
IonPump — Sites cargados
────────────────────────────────────────────────────────────
github.com    v1.0.0    1 actions    2 pages    1 shared    ✅ healthy
────────────────────────────────────────────────────────────
Total: 1 site
```

### brain ionpump validate

```bash
brain ionpump validate ./installer/ions/github.com/
```

```
✓ domain.manifest.json       schema válido, schema_version 2.0
✓ actions/generate_pat.ion   9 steps, sin errores
✓ pages/tokens_page.page.ion 2 elementos, 1 signal
✓ pages/new_token_page.page.ion 5 elementos, 1 signal
✓ shared/session_guard.ion   fragment válido
```

### brain ionpump test

```bash
brain ionpump test github.com generate_pat --dry-run \
  --context '{"token_name":"test","expiration":"30"}'
```

### brain ionpump reload

```bash
brain ionpump reload github.com
brain ionpump reload --all
```

---

## EXECUTION FLOW — EJEMPLO COMPLETO

### Intent de entrada

```json
{
  "intent_type": "dev",
  "intent_subtype": "web_automation",
  "domain": "github.com",
  "action": "generate_pat",
  "context": {
    "token_name": "bloom-terminal",
    "expiration": "30",
    "github_username": "bloom-worker-01",
    "github_password": "<vault>"
  }
}
```

### Trace de ejecución

```
1. IntentExecutor detecta intent_subtype == "web_automation"
   → extrae domain="github.com", action="generate_pat", context, launch_id

2. IonPumpManager.execute_action("github.com", "generate_pat", ...)
   → IonRegistry: ¿paquete cargado? NO
   → IonLoader.load_site(ionsites/github.com/)
     → parsea domain.manifest.json
     → carga eager: pages/tokens_page.page.ion, pages/new_token_page.page.ion
     → registra IonSitePackage en registry

3. IonExecutor: resolver requires: ["session_guard_passed"]
   → no está en event_log
   → IonLoader._load_shared("session_guard")
   → ejecuta fragment session_guard
     → check: page_matches "*/login*" → FALSE (asumimos sesión activa)
     → emit: "session_guard_passed" → agrega al event_log

4. IonExecutor: ejecutar steps de generate_pat
   Step navigate:
     → DOM_NAVIGATE { url: "https://github.com/settings/tokens" }
     → IonPumpIPCClient → SynapseIPCServer → Chrome
     → DOM_WAIT (ready_when de tokens_page)
     → DOM_WATCH × N (signals de tokens_page: session_expired)
     → DOM_WATCH_URL (transitions de tokens_page)

   Step click (generate_button en tokens_page):
     → _resolve_element("generate_button", "tokens_page") → selector
     → DOM_CLICK { selector: "a[href*='/new']" }

   Step wait (token_name_input en new_token_page):
     → DOM_WAIT { selector: "input#token_description" }

   Step type:
     → resuelve $CONTEXT.token_name → "bloom-terminal"
     → DOM_TYPE { selector: "...", text: "bloom-terminal" }

   Step select:
     → resuelve $CONTEXT.expiration → "30"
     → DOM_SELECT { selector: "select#token_expiration", value: "30" }

   Step click (submit_button):
     → DOM_CLICK { selector: "button[type='submit']" }

   Step wait_signal (token_generated):
     → signal ya registrado via DOM_WATCH al entrar a new_token_page
     → espera evento "token_generated" del browser
     → timeout: 15000ms

   Step extract (token_value):
     → DOM_EXTRACT { selector: "#new-oauth-token" }
     → save_to: $CONTEXT.generated_pat

   Step emit (PAT_GENERATED):
     → EVENT_EMIT { event: "PAT_GENERATED", payload: { token: "ghp_...", ... } }

5. IonStateMachine: EXECUTING → COMPLETED
6. IntentExecutor: guarda resultado en .pipeline/.execution/.response/
7. ✓ Intent completado
```

---

## IMPLEMENTATION PHASES

> **Leyenda:**
> `[ ]` No iniciado · `[~]` En progreso · `[x]` Completado · `[!]` Bloqueado
>
> Última actualización: **v5.0 — Mayo 2026**

---

### Phase 1: Core Runtime — Brain
**Estado:** `[ ]` No iniciado

- [ ] Corregir `MANIFEST_FILENAME`: `ion.manifest.json` → `domain.manifest.json`
- [ ] Implementar nuevos dataclasses en `ionpump_models.py`:
  `IonAction`, `IonElement`, `IonSignal`, `IonPageDescriptor`, `IonSitePackage`
- [ ] Actualizar `IonManifest` con campos `actions`, `pages`, `shared` (eliminar
  `entrypoint`, `flows`, `triggers`)
- [ ] Agregar `IonRecipeStatus` con los cuatro valores alineados con Metamorph Go
- [ ] Refactorizar `IonLoader.load_site()`: carga subdirectorios, validaciones
- [ ] Implementar `IonLoader._parse_page_descriptor()` para `*.page.ion`
- [ ] Implementar `IonLoader._load_action()` y `IonLoader._load_shared()` (lazy)
- [ ] Actualizar `_RegistryEntry` → `IonSitePackage` en `ionpump_registry.py`
- [ ] Implementar `IonExecutor._resolve_element()` via page descriptors
- [ ] Agregar nuevos step types a `STEP_TO_COMMAND`: `navigate`, `select`
- [ ] Implementar manejo interno de `wait_signal`, `check`, `call`
- [ ] Implementar resolución de `requires[]` antes de ejecutar un action
- [ ] Crear ejemplo de paquete: `ionsites/github.com/` con estructura completa

---

### Phase 2: IPC Layer + Execution Engine — Brain
**Estado:** `[ ]` No iniciado — crítico para harness Test 2

- [ ] Implementar `brain/core/synapse/synapse_ipc_server.py`
- [ ] Crear directorio `BloomNucleus/run/` si no existe en `SynapseIPCServer.start()`
- [ ] Modificar `SynapseManager.__init__()` para aceptar `launch_id` y `run_dir`
- [ ] Modificar `SynapseManager.run_host_loop()` para iniciar/detener `SynapseIPCServer`
- [ ] Agregar handlers DOM nuevos a `_action_map`:
  `DOM_NAVIGATE`, `DOM_WATCH`, `DOM_WATCH_URL`, `DOM_UNWATCH`, `DOM_SELECT`
- [ ] Implementar `ionpump_ipc.py` (`IonPumpIPCClient`)
- [ ] Implementar `ionpump_executor.py` — yields `SynapseCommand` objects, no envía
- [ ] Implementar `ionpump_manager.py` — recibe commands del executor, envía via IPCClient
- [ ] Test end-to-end: cargar paquete → ejecutar flow → verificar commands en Chrome

---

### Phase 3: Intent Integration — Brain
**Estado:** `[!]` Bloqueado — gate de exploración requerido

> **Gate:** Antes de iniciar, explorar `brain/core/intent/` y confirmar el
> archivo dispatcher real. Reemplazar `intent_executor.py` si difiere.
> Esta phase no bloquea Phases 1, 2, 4, ni 5.

- [ ] Explorar `brain/core/intent/` — identificar dispatcher real
- [ ] Integrar `IonPumpManager.execute_action()` como handler de
  `intent_subtype == "web_automation"`
- [ ] Pasar `launch_id` desde el intent al `IonPumpIPCClient`
- [ ] Test end-to-end: intent JSON → IonPump → Chrome → ACK → intent completado

---

### Phase 4: Hot-Reload + IonPumpClient receptor — Brain
**Estado:** `[ ]` No iniciado

- [ ] Verificar que `watchdog` está en las dependencias declaradas
- [ ] Implementar `IonRecipeWatcher` en `ionpump_loader.py`
- [ ] Implementar `start_watchdog()` / `stop_watchdog()`
- [ ] Validación antes de aplicar + rollback en paquete inválido
- [ ] **Implementar receptor de `IonPumpClient`** — endpoint que Metamorph llama:
  - `QuiesceSite(site, timeoutMs)` → detiene nuevos flows, espera activos
  - `ReloadSite(site, version)` → llama `IonLoader.load_site()`, actualiza registry
  - Respuestas alineadas con tipos Go (`QuiesceResult`, `ReloadResult`)
- [ ] Test hot-reload cycle end-to-end

---

### Phase 5: Admin Commands — Brain
**Estado:** `[ ]` No iniciado — crítico para harness Test 3

- [ ] `brain/commands/ionpump/ionpump_inspect.py`
  - Output con `page_count` y `shared_count` (no `flow_count`)
  - Status values: `healthy` / `missing_manifest` / `invalid_manifest` / `missing_entrypoint`
- [ ] `brain/commands/ionpump/ionpump_validate.py`
- [ ] `brain/commands/ionpump/ionpump_reload.py`
- [ ] `brain/commands/ionpump/ionpump_test.py`
- [ ] Actualizar `help-full.txt`

---

### Phase 6: Cortex — DOM Commands
**Estado:** `[ ]` No iniciado — cambio mínimo

- [ ] En `background.js`, línea ~626, agregar al array `DOM_COMMANDS`:
  `"DOM_NAVIGATE"`, `"DOM_WATCH"`, `"DOM_WATCH_URL"`, `"DOM_UNWATCH"`
- [ ] Verificar que `DOM_SELECT` también debe estar (si se implementa en Phase 2)
- [ ] No hay otros cambios en Cortex para esta iteración

---

### Phase 7: Metamorph — Documentación de estado
**Estado:** `[x]` Implementado — sin trabajo de código

Metamorph tiene Phase 6a y 6b completamente implementadas. No hay trabajo de código
en esta iteración. El documento `metamorph-ionpump-state.md` es la fuente de verdad.

---

### Phase 8: Additional Ion Packages
**Estado:** `[ ]` No iniciado — depende de Phases 1 y 2 completadas

- [ ] `installer/ions/chatgpt.com/`
- [ ] `installer/ions/perplexity.ai/`
- [ ] `installer/ions/gemini.google.com/` (esqueleto ya en `BOOTSTRAP_SITES`)

---

### Phase 9: Testing & Validation
**Estado:** `[ ]` No iniciado — depende de Phases 1–5

- [ ] Unit tests para `IonLoader.load_site()` con paquetes válidos e inválidos
- [ ] Unit tests para `IonExecutor._resolve_element()`
- [ ] Unit tests para resolución de `requires[]`
- [ ] Integration tests para IPC layer (mock `SynapseIPCServer`)
- [ ] End-to-end con browser real
- [ ] Verificar harness Tests 1–5 del `SYNAPSE_PROTOCOL_MASTER`

---

## CRITICAL CONSTRAINTS

1. ❌ **NO standalone CLI usage** — IonPump es un runtime, no un CLI de usuario
2. ❌ **NO eager loading de actions y shared** — solo pages se cargan eager
3. ❌ **NO acceso DOM directo** — todo via IPC → SynapseIPCServer → Chrome
4. ❌ **NO selectores CSS en actions** — siempre `element:` + `on_page:`
5. ❌ **NO modificar SynapseProtocol** — IonPump lo usa indirectamente via IPC
6. ❌ **NO modificar content.js** — la extensión es un ejecutor pasivo
7. ❌ **NO network calls** — todos los paquetes desde filesystem local
8. ❌ **NO IPC en non-localhost** — SynapseIPCServer binds a 127.0.0.1 only
9. ❌ **NO `send_command()` en SynapseManager** — IPC es el único canal proactivo
10. ❌ **NO editar archivos en AppData directamente** — solo via Metamorph deploy
11. ❌ **NO credenciales en archivos .ion** — siempre via `$CONTEXT` + Nucleus Vault
12. ❌ **NO schema_version distinto de "2.0"** — IonLoader rechaza versiones anteriores

---

## SUCCESS CRITERIA

### Funcionales
- [ ] Paquete github.com cargado correctamente desde subdirectorios
- [ ] Element names resueltos a selectores via page descriptors
- [ ] `requires[]` ejecutados antes del action principal
- [ ] Flow `generate_pat` ejecutado end-to-end con ACK de Chrome
- [ ] Hot-reload actualiza el paquete sin reiniciar Brain
- [ ] Paquete inválido no reemplaza el anterior (rollback en hot-reload)
- [ ] `QuiesceSite()` y `ReloadSite()` responden correctamente a Metamorph

### Performance
- [ ] Carga de paquete (incluye pages eager): <200ms
- [ ] Resolución de element name: <1ms
- [ ] Latencia IPC round-trip (localhost): <5ms
- [ ] Detección de hot-reload: <1s
- [ ] Uso de memoria: <10MB por paquete cargado

### Integración
- [ ] `metamorph inspect --ion-recipes` reporta `healthy` para github.com
- [ ] Status values en Brain alineados con Metamorph (4 estados)
- [ ] Output de `brain ionpump inspect` tiene `page_count` y `shared_count`
- [ ] `DOM_NAVIGATE`, `DOM_WATCH`, `DOM_WATCH_URL`, `DOM_UNWATCH` llegan a Chrome
- [ ] Harness Tests 1–5 pasan

---

## CHECKLIST DE DEPLOY (para referencia del desarrollador)

Antes de entregar el ZIP a Metamorph para deploy manual:

- [ ] `domain.manifest.json` tiene `schema_version: "2.0"`
- [ ] `domain` en el manifest coincide con el nombre del directorio
- [ ] Todos los archivos declarados en `actions`, `pages`, `shared` existen
- [ ] El ZIP fue creado desde **dentro** del directorio del site (no desde afuera)
- [ ] Los hashes en el manifest de deploy fueron generados desde el ZIP ya comprimido
- [ ] Brain está corriendo (o se usa `--force-swap` para testing)
- [ ] `--dry-run` ejecutado primero sin errores
- [ ] Después del deploy: `metamorph inspect --ion-recipes` muestra `✅ healthy`

---

*Document version: 5.0 — Consolidación post-auditoría · Mayo 2026*
*Supersede: IONPUMP_IMPLEMENTATION_PROMPT v1.0–v4.0, ION_SDK_Developer_Guide v1.0,*
*IONSITE_DEPLOY_GUIDE Phase 6a, metamorph-ionpump-state.md (absorbido),*
*BRAIN_IONPUMP_EXTENSION.md (absorbido), CORTEX-IONPUMP-EXTENSION.md (absorbido)*
