# IONPUMP MASTER SPEC — Fuente de verdad absoluta

**Versión:** 1.0 · Junio 2026 · Bloom Platform Engineering  
**Supersede:** `IONPUMP_IMPLEMENTATION_PROMPT_v5.md`, `IONSITE_DEPLOY_GUIDE.md`, `ION_SDK_Developer_Guide.md`  
**Documentos externos referenciados (no absorbidos):** `BLOOM_ONBOARDING_WORKFLOW_SPEC_v2_0.md`, `ONBOARDING_CORTEX_INTEGRATION.md`

---

## ÍNDICE

1. [Qué es IonPump](#1-qué-es-ionpump)
2. [Principios arquitecturales](#2-principios-arquitecturales)
3. [Arquitectura del sistema](#3-arquitectura-del-sistema)
4. [Filesystem layout](#4-filesystem-layout)
5. [Formato del paquete Ion (schema_version 2.0)](#5-formato-del-paquete-ion)
6. [Step types — referencia completa](#6-step-types--referencia-completa)
7. [Reglas de navegación](#7-reglas-de-navegación)
8. [Variable resolution](#8-variable-resolution)
9. [Data models — Python](#9-data-models--python)
10. [IonLoader — implementación](#10-ionloader--implementación)
11. [IonExecutor — implementación](#11-ionexecutor--implementación)
12. [IPC layer](#12-ipc-layer)
13. [Hot-reload mechanism](#13-hot-reload-mechanism)
14. [Metamorph — deploy](#14-metamorph--deploy)
15. [Build pipeline](#15-build-pipeline)
16. [Admin commands (Brain)](#16-admin-commands-brain)
17. [Cortex — DOM commands](#17-cortex--dom-commands)
18. [Ejemplo completo de ejecución](#18-ejemplo-completo-de-ejecución)
19. [Constraints absolutos](#19-constraints-absolutos)

---

## 1. Qué es IonPump

IonPump es un **web automation runtime** que vive dentro de Brain y ejecuta paquetes `.ion` — colecciones de archivos YAML declarativos que enseñan a Bloom cómo operar un sitio web específico. Traduce los flows declarativos en comandos Synapse atómicos que `content.js` ejecuta en el browser vía la extensión Cortex.

**IonPump NO es un CLI standalone. IonPump es un RUNTIME invocado por IntentExecutor cuando un intent tiene `intent_subtype == "web_automation"`.**

---

## 2. Principios arquitecturales

### 2.1 Separación de responsabilidades

| Directorio | Contenido | Semántica |
|---|---|---|
| `actions/` | `*.ion` — flows de negocio | Qué tiene que pasar (API pública del paquete) |
| `pages/` | `*.page.ion` — descriptores de página | Contratos estáticos: selectores, ready conditions, signals |
| `shared/` | `*.ion` — fragments reutilizables | Lógica compartida entre actions (auth guards, retry) |
| `domain.manifest.json` | JSON — índice del paquete | Registry: qué actions son públicas, capabilities, versión |

### 2.2 Regla de URLs — CRÍTICA

> **Ningún componente fuera del ion de un dominio debe contener URLs de ese dominio.**

Brain, Conductor, Sentinel y cualquier código Python del sistema solo conocen el `domain` y el `action`. Todo lo que está dentro de esa URL — path, query params, fragmentos — es responsabilidad exclusiva del ion correspondiente.

**Incorrecto** (hardcodear URL en Python):
```python
# profile_launcher.py — PROHIBIDO
GITHUB_TOKEN_URL = "https://github.com/settings/tokens/new?scopes=repo,read:org"
```

**Correcto** (la URL vive en el ion):
```yaml
# actions/generate_pat.ion
- navigate:
    url: "https://github.com/settings/tokens/new?scopes=repo,read:org&description=$CONTEXT.token_description"
    expect_page: "new_token_page"
```

Cada ion es la fuente de verdad completa para operar su dominio: no solo los selectores e interacciones, sino también los puntos de entrada y sus parámetros.

### 2.3 Regla de selectores

Ningún action contiene selectores CSS directos. Los actions referencian elementos por nombre (`element: "generate_button"`). Los selectores viven exclusivamente en los page descriptors (`*.page.ion`). Cuando un sitio cambia un selector, se actualiza el page descriptor y todos los actions heredan la corrección automáticamente.

### 2.4 Regla de credenciales

Ningún archivo `.ion` contiene credenciales. Las credenciales siempre llegan vía `$CONTEXT`, inyectado por Brain desde Nucleus Vault en runtime.

---

## 3. Arquitectura del sistema

```
Intent: { domain: "github.com", action: "generate_pat", context: {...} }
              │
              ▼
      IntentExecutor (Brain)
      detecta intent_subtype == "web_automation"
              │
              ▼
      IonPumpManager.execute_action()
      - Lazy-load del paquete desde IonRegistry
      - Resuelve requires[] → ejecuta shared fragments primero
      - Resuelve element names via page descriptors
      - Traduce steps Ion → SynapseCommand objects
      - Gestiona state machine por (tab_id, domain)
              │
              ▼
      IonPumpIPCClient
      - Lee puerto desde run/ipc_{launch_id}.port
      - Envía SynapseCommand como JSON vía TCP localhost
              │
              ▼ TCP 127.0.0.1
      SynapseIPCServer (Brain-Host process)
      - Recibe comandos IonPump, los rutea vía _action_map
      - Llama protocol.send_message() → Chrome
              │
              ▼ Native Messaging
      background.js (Cortex)
      - Rutea DOM commands al content script de la tab
              │
              ▼ chrome.tabs.sendMessage
      content.js (Cortex)
      - Ejecuta acciones DOM
      - Envía ACK de vuelta
```

---

## 4. Filesystem layout

### Paquetes en runtime (AppData)

```
%LOCALAPPDATA%\BloomNucleus\bin\cortex\ionsites\
├── github.com\
│   ├── domain.manifest.json       ← índice del paquete (schema_version: "2.0")
│   ├── actions\
│   │   └── generate_pat.ion
│   ├── pages\
│   │   ├── tokens_page.page.ion
│   │   └── new_token_page.page.ion
│   └── shared\
│       └── session_guard.ion
├── _backup\
│   └── github.com\                ← versión anterior (rollback disponible)
├── _meta\
│   └── versions.json              ← estado de todas las versiones instaladas
└── _staging\
    ├── downloads\
    │   └── github.com.ion         ← ZIP antes de extracción
    └── github.com\                ← extracción temporal pre-swap
```

macOS (desarrollo): `~/Library/BloomNucleus/bin/cortex/ionsites/`

**Regla crítica:** Los directorios con prefijo `_` son ignorados por `InspectAllIonRecipes`. IonLoader debe seguir la misma convención. `discover_all()` debe crear `ionsites/` si no existe — no es un error, significa que no hay paquetes desplegados.

### IPC runtime files

```
%LOCALAPPDATA%\BloomNucleus\run\
└── ipc_{launch_id}.port    ← entero plano (puerto TCP)
                               escrito por SynapseIPCServer al startup
                               eliminado cuando SynapseManager termina
```

### Fuentes en el repo

```
installer/
├── ions/
│   └── github.com/                ← fuente de los archivos .ion (editar acá)
│       ├── domain.manifest.json
│       ├── actions/
│       ├── pages/
│       └── shared/
├── metamorph/
│   └── scripts/
│       └── build-bootstrap-ions.py
└── native/
    └── ionpump/
        ├── github.com.ion.zip     ← generado por el build script
        └── bootstrap-ions.json    ← manifest con hashes reales (generado)
```

**Nunca editar archivos directamente en AppData. Solo Metamorph escribe en ionsites/.**

---

## 5. Formato del paquete Ion

### 5.1 domain.manifest.json

Primer archivo que lee IonLoader. Nombre exacto: `domain.manifest.json` (constante `domainManifestFile` en Metamorph Go — fuente de verdad).

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

**Reglas de validación:**

- `schema_version` ausente o distinto de `"2.0"` → rechazar paquete (`invalid_manifest`).
- `version == ""` → `invalid_manifest`.
- Cada nombre en `entry_actions` debe existir como clave en `actions` y el archivo referenciado debe existir en disco → `missing_entrypoint`.
- Tamaño máximo del manifest: 64 KB.

### 5.2 Page Descriptors (`pages/*.page.ion`)

Los page descriptors **no ejecutan nada**. Son contratos estáticos. Los actions referencian elementos por nombre — nunca por selector CSS directo.

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

  token_name_input:
    selector: "input#token_description, input[name='token[description]']"
    type: typeable

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

### 5.3 Actions (`actions/*.ion`)

Los flows de negocio. Únicos archivos marcados `public: true` en el manifest.

```yaml
action: "generate_pat"
description: >
  Genera un PAT en GitHub. Navega a /settings/tokens/new con scopes
  configurables, completa el formulario, y emite el token via PAT_GENERATED.

requires:
  - session_guard_passed

steps:
  - navigate:
      url: "https://github.com/settings/tokens/new?scopes=$CONTEXT.required_scopes&description=$CONTEXT.token_description"
      expect_page: "new_token_page"
      fallback:
        on_page: "login_page"
        call: "shared/session_guard"
        then: retry

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

### 5.4 Shared Fragments (`shared/*.ion`)

Fragments reutilizables. No son actions — no pueden invocarse desde fuera del paquete. IonPump los memoiza en el `event_log` de la sesión.

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

## 6. Step types — referencia completa

### Mapping Ion step → Synapse command

| Step Ion | Synapse command | Estado | Genera comando |
|---|---|---|---|
| `wait` | `DOM_WAIT` | Existente | Sí |
| `click` | `DOM_CLICK` | Existente | Sí |
| `type` | `DOM_TYPE` | Existente | Sí |
| `focus` | `DOM_FOCUS` | Existente | Sí |
| `scroll` | `DOM_SCROLL` | Existente | Sí |
| `extract` | `DOM_EXTRACT` | Existente | Sí |
| `emit` | `EVENT_EMIT` | Existente | Sí |
| `transition` | `STATE_TRANSITION` | Existente | Sí |
| `navigate` | `DOM_NAVIGATE` | Nuevo | Sí |
| `select` | `DOM_SELECT` | Nuevo | Sí |
| `wait_signal` | `DOM_WATCH` (registro) + espera interna | Nuevo | No directo |
| `check` | (lógica interna) | Nuevo | No |
| `call` | (lógica interna) | Nuevo | No |

**`check`:** Bifurcación condicional interna. No genera ningún comando Synapse — ejecuta la rama `if_true` o `if_false` como sub-lista de steps.

**`wait_signal`:** Los signals se registran pasivamente vía `DOM_WATCH` al entrar a una página (paso `navigate`). `wait_signal` solo aguarda a que el evento correspondiente llegue del browser — no registra nada nuevo.

**`call`:** Invoca un fragment o action. Pushes un nuevo frame al action stack; reanuda el caller cuando el callee completa.

### Nuevos comandos Synapse en `_action_map`

| Comando | Descripción |
|---|---|
| `DOM_NAVIGATE` | Navega a una URL. IonPump envía luego `DOM_WAIT` (ready_when) y `DOM_WATCH` (signals). |
| `DOM_WATCH` | Registra MutationObserver para un signal declarado en el page descriptor. |
| `DOM_WATCH_URL` | Intercepta `pushState`/`popstate` para detectar navegación SPA. |
| `DOM_UNWATCH` | Desconecta observers al salir de una página. |
| `DOM_SELECT` | Selecciona una opción en un elemento `<select>`. |

---

## 7. Reglas de navegación

Esta sección define el contrato completo del step `navigate`. Es la especificación que reemplaza cualquier lógica de navegación hardcodeada en componentes externos.

### 7.1 Sintaxis completa

```yaml
- navigate:
    url: "<url con soporte de variable resolution>"
    expect_page: "<nombre del page descriptor esperado>"
    fallback:
      on_page: "<nombre de página alternativa>"
      call: "<action o fragment a ejecutar>"
      then: retry    # retry | abort
```

### 7.2 Variable resolution en URLs

El campo `url` dentro de un step `navigate` soporta interpolación de variables con la misma sintaxis que `text` en el step `type`. Toda variable `$CONTEXT.*` se resuelve en runtime antes de enviar `DOM_NAVIGATE`.

**Formas válidas:**

```yaml
# URL estática
url: "https://github.com/settings/tokens"

# URL con query params estáticos
url: "https://github.com/settings/tokens/new?scopes=repo,read:org&description=Bloom+Conductor"

# URL con query params dinámicos desde contexto
url: "https://github.com/settings/tokens/new?scopes=$CONTEXT.required_scopes&description=$CONTEXT.token_description"

# URL con path dinámico
url: "https://github.com/$CONTEXT.github_username/settings/tokens"
```

**Regla:** Si la URL contiene una referencia `$CONTEXT.*` que no está definida en el contexto del intent, IonExecutor lanza `IonContextError` antes de enviar el comando. Nunca se navega a una URL con variables sin resolver.

### 7.3 Qué hace IonPump al procesar un `navigate`

Al ejecutar un step `navigate`, IonPump ejecuta siempre esta secuencia en orden:

1. Resuelve variables en `url` → URL final.
2. Envía `DOM_NAVIGATE { url: "<url_final>" }` a Cortex.
3. Lee el page descriptor de `expect_page`.
4. Por cada condición en `ready_when`: envía `DOM_WAIT { selector: "...", timeout: N }`.
5. Por cada signal en `signals`: envía `DOM_WATCH { selector: "...", signal_name: "...", once: bool }`.
6. Envía `DOM_WATCH_URL { transitions: {...} }` con las transiciones declaradas en el page descriptor.
7. Si la página al aterrizar coincide con `fallback.on_page` en lugar de `expect_page`: ejecuta `fallback.call`, luego `retry` o `abort` según `then`.

### 7.4 Qué componentes están prohibidos de contener URLs de dominio externo

| Componente | Prohibición |
|---|---|
| `profile_launcher.py` y cualquier Python en Brain | No puede contener URLs de dominios externos (github.com, google.com, openai.com, etc.) |
| Conductor (Go) | No puede contener URLs de sitios que tengan un ion |
| Sentinel | Ídem |
| `discovery.synapse.config.js` | No puede contener URLs de destino de negocio |
| Cualquier otro componente no-ion | Ídem |

La única excepción permitida es una URL a una API interna de Bloom o a un endpoint propio del sistema.

### 7.5 Migración de URLs hardcodeadas existentes

Cuando se encuentre una URL de dominio externo hardcodeada en un componente no-ion:

1. Verificar si existe un ion para ese dominio en `installer/ions/`.
2. Si existe: mover la URL al step `navigate` correspondiente del action correcto. Los parámetros que eran constantes van inline en la URL del ion. Los que varían por sesión se convierten en `$CONTEXT.*` y se inyectan desde el caller.
3. Si no existe: documentar como Phase 8 (ion pendiente de crear) y marcar la URL como deuda técnica en el código con un comentario `# TODO: mover a ion/<domain>`.
4. Reemplazar el código que usaba la URL hardcodeada por un intent `web_automation` con el `domain` y `action` correctos.

---

## 8. Variable resolution

| Sintaxis | Resuelve a |
|---|---|
| `$CONTEXT.key` | Valor del contexto inyectado por Brain al ejecutar el intent |
| `$CONTEXT.token_name` | Ejemplo: campo específico del contexto |
| `$CONTEXT.github_username` | Credential inyectada por Nucleus Vault |
| `$SIGNAL.payload.field` | Valor extraído del payload del último signal recibido |
| `${variable_name}` | Variable declarada a nivel de recipe o page descriptor |

**Regla de seguridad:** `$CONTEXT` es inyectado por Brain en runtime. El paquete Ion nunca lee desde disco, localStorage, ni ningún browser storage. Las credenciales siempre vienen vía Nucleus Vault — nunca hardcodeadas en archivos `.ion`.

**Contexto mínimo requerido para `generate_pat`:**

```json
{
  "token_name": "bloom-terminal",
  "token_description": "Bloom Conductor",
  "required_scopes": "repo,read:org",
  "expiration": "30",
  "github_username": "<desde Vault>",
  "github_password": "<desde Vault>"
}
```

---

## 9. Data models — Python

Archivo: `brain/core/ionpump/ionpump_models.py`

```python
@dataclass
class IonAction:
    name: str
    file: str       # path relativo al root del paquete
    public: bool

@dataclass
class IonManifest:
    schema_version: str          # debe ser "2.0"
    domain: str
    version: str
    description: str
    author_name: str
    author_contact: str
    actions: Dict[str, IonAction]
    pages: Dict[str, str]        # clave: nombre, valor: path relativo
    shared: Dict[str, str]       # clave: nombre, valor: path relativo
    entry_actions: List[str]
    capabilities: List[str]
    requires_cortex_version: str

@dataclass
class IonElement:
    name: str
    selector: str
    element_type: str   # clickable | typeable | selectable | checkable | extractable

@dataclass
class IonSignal:
    name: str
    detect: str         # selector CSS que activa el signal
    once: bool
    priority: str       # "normal" | "high"

@dataclass
class IonPageDescriptor:
    page: str
    url_pattern: str
    ready_when: List[Dict]
    elements: Dict[str, IonElement]
    signals: Dict[str, IonSignal]
    transitions: Dict

@dataclass
class IonStep:
    step_type: str      # navigate | wait | click | type | select | focus |
                        # scroll | extract | emit | wait_signal | check | call | transition
    params: Dict[str, Any]

@dataclass
class IonFlow:
    name: str
    steps: List[IonStep]
    requires: List[str]

@dataclass
class IonRecipe:
    kind: str           # "action" | "fragment"
    name: str
    description: str
    requires: List[str]
    steps: List[IonStep]
    error_handlers: Dict[str, Dict]

@dataclass
class IonSitePackage:
    manifest: IonManifest
    root_path: Path
    actions: Dict[str, IonRecipe]       # lazy-loaded
    pages: Dict[str, IonPageDescriptor] # eager-loaded
    shared: Dict[str, IonRecipe]        # lazy-loaded

class IonRecipeStatus:
    """Alineado con los status values reales de Metamorph Go."""
    HEALTHY             = "healthy"
    MISSING_MANIFEST    = "missing_manifest"
    INVALID_MANIFEST    = "invalid_manifest"
    MISSING_ENTRYPOINT  = "missing_entrypoint"
```

---

## 10. IonLoader — implementación

Archivo: `brain/core/ionpump/ionpump_loader.py`

### Corrección crítica de nombre de archivo

```python
# INCORRECTO (versiones anteriores):
MANIFEST_FILENAME = "ion.manifest.json"

# CORRECTO (alineado con Metamorph Go — fuente de verdad):
MANIFEST_FILENAME = "domain.manifest.json"
```

### Flujo de carga de site

```python
def load_site(self, site_dir: Path) -> IonSitePackage:
    # 1. Leer y validar domain.manifest.json
    manifest_path = site_dir / "domain.manifest.json"
    if not manifest_path.exists():
        raise IonLoadError(site_dir.name, IonRecipeStatus.MISSING_MANIFEST)

    manifest = self._parse_manifest(manifest_path)

    # 2. Validar schema_version
    if manifest.schema_version != "2.0":
        raise IonLoadError(site_dir.name, IonRecipeStatus.INVALID_MANIFEST,
                           f"schema_version '{manifest.schema_version}' not supported")

    # 3. Cargar TODOS los page descriptors (eager)
    pages = {}
    for page_name, page_path in manifest.pages.items():
        full_path = site_dir / page_path
        pages[page_name] = self._parse_page_descriptor(full_path)

    # 4. Actions y shared: lazy (paths guardados, objetos parseados al primer uso)

    # 5. Verificar entry_actions
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
        actions={},
        pages=pages,
        shared={},
    )

def _load_action(self, package: IonSitePackage, action_name: str) -> IonRecipe:
    if action_name in package.actions:
        return package.actions[action_name]
    action_meta = package.manifest.actions.get(action_name)
    if not action_meta:
        raise IonActionNotFound(package.manifest.domain, action_name)
    recipe = self._parse_ion_file(package.root_path / action_meta.file)
    package.actions[action_name] = recipe
    return recipe

def _load_shared(self, package: IonSitePackage, fragment_name: str) -> IonRecipe:
    if fragment_name in package.shared:
        return package.shared[fragment_name]
    fragment_path_rel = package.manifest.shared.get(fragment_name)
    if not fragment_path_rel:
        raise IonFragmentNotFound(package.manifest.domain, fragment_name)
    recipe = self._parse_ion_file(package.root_path / fragment_path_rel)
    package.shared[fragment_name] = recipe
    return recipe
```

### Descubrimiento de sites

```python
def discover_all(self, ionsites_dir: Path) -> List[IonSitePackage]:
    """
    Escanea ionsites_dir y carga todos los paquetes válidos.
    Ignora directorios con prefijo '_' (staging, backup, meta).
    Crea ionsites_dir si no existe — no es un error.
    """
    ionsites_dir.mkdir(parents=True, exist_ok=True)
    packages = []
    for site_dir in ionsites_dir.iterdir():
        if site_dir.is_dir() and not site_dir.name.startswith('_'):
            try:
                packages.append(self.load_site(site_dir))
            except IonLoadError as e:
                logger.error(f"Skipping {site_dir.name}: {e}")
    return packages
```

---

## 11. IonExecutor — implementación

Archivo: `brain/core/ionpump/ionpump_executor.py`

### Resolución de element names

```python
def _resolve_element(
    self,
    element_name: str,
    page_name: str,
    package: IonSitePackage
) -> str:
    page = package.pages.get(page_name)
    if not page:
        raise IonPageNotFound(package.manifest.domain, page_name)
    element = page.elements.get(element_name)
    if not element:
        raise IonElementNotFound(page_name, element_name)
    return element.selector
```

### Resolución de variables en URLs

```python
def _resolve_url(self, url_template: str, context: Dict) -> str:
    """
    Resuelve referencias $CONTEXT.* en una URL template.
    Lanza IonContextError si alguna variable no está definida.
    """
    import re
    pattern = re.compile(r'\$CONTEXT\.([a-zA-Z_][a-zA-Z0-9_]*)')
    
    def replacer(match):
        key = match.group(1)
        if key not in context:
            raise IonContextError(
                f"Variable $CONTEXT.{key} referenciada en navigate URL no está en el contexto"
            )
        return str(context[key])
    
    return pattern.sub(replacer, url_template)
```

### Resolución de variables en strings genéricos

```python
def _resolve_variables(self, value: str, context: Dict) -> str:
    """
    Resuelve $CONTEXT.* y $SIGNAL.payload.* en cualquier string.
    Usado en type.text, navigate.url, y cualquier campo con variables.
    """
    # $CONTEXT.*
    result = re.sub(
        r'\$CONTEXT\.([a-zA-Z_][a-zA-Z0-9_]*)',
        lambda m: str(context.get(m.group(1), m.group(0))),
        value
    )
    # $SIGNAL.payload.*
    signal_payload = context.get('__signal_payload__', {})
    result = re.sub(
        r'\$SIGNAL\.payload\.([a-zA-Z_][a-zA-Z0-9_]*)',
        lambda m: str(signal_payload.get(m.group(1), m.group(0))),
        result
    )
    return result
```

### STEP_TO_COMMAND

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
    # "wait_signal" → espera evento (signals pre-registrados via DOM_WATCH en navigate)
    # "check"       → bifurcación interna
    # "call"        → invocación de fragment o action
}
```

### Ejecución de requires[]

```python
def execute_action(
    self,
    package: IonSitePackage,
    action_name: str,
    tab_id: str,
    context: Dict
) -> IonExecutionResult:
    action = self.loader._load_action(package, action_name)

    for required_event in action.requires:
        if required_event not in self.state.event_log:
            fragment = self._find_fragment_for_event(package, required_event)
            if fragment:
                self._execute_fragment(package, fragment, tab_id, context)

    return self._execute_steps(package, action.steps, tab_id, context)
```

### Ejecución del step navigate

```python
def _execute_navigate(self, step: IonStep, package: IonSitePackage, 
                      tab_id: str, context: Dict) -> None:
    # 1. Resolver variables en la URL
    raw_url = step.params["url"]
    resolved_url = self._resolve_url(raw_url, context)
    
    # 2. DOM_NAVIGATE
    self.ipc_client.send(SynapseCommand(
        command="DOM_NAVIGATE",
        tab_id=tab_id,
        params={"url": resolved_url}
    ))
    
    # 3. Cargar page descriptor de expect_page
    page_name = step.params.get("expect_page")
    page = package.pages.get(page_name) if page_name else None
    
    if page:
        # 4. DOM_WAIT por cada ready_when
        for condition in page.ready_when:
            self.ipc_client.send(SynapseCommand(
                command="DOM_WAIT",
                tab_id=tab_id,
                params=condition
            ))
        
        # 5. DOM_WATCH por cada signal
        for signal_name, signal in page.signals.items():
            self.ipc_client.send(SynapseCommand(
                command="DOM_WATCH",
                tab_id=tab_id,
                params={
                    "selector": signal.detect,
                    "signal_name": signal_name,
                    "once": signal.once,
                    "priority": signal.priority
                }
            ))
        
        # 6. DOM_WATCH_URL con transitions
        if page.transitions:
            self.ipc_client.send(SynapseCommand(
                command="DOM_WATCH_URL",
                tab_id=tab_id,
                params={"transitions": page.transitions}
            ))
```

---

## 12. IPC layer

### SynapseIPCServer

Archivo: `brain/core/synapse/synapse_ipc_server.py`

```python
class SynapseIPCServer:
    def __init__(self, protocol: SynapseProtocol, launch_id: str, run_dir: Path): ...
    def start(self) -> int: ...      # bind, escribe port file, inicia thread
    def stop(self) -> None: ...      # detiene thread, elimina port file
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

### _action_map completo

```python
self._action_map = {
    # Existentes sin cambios:
    "SYSTEM_HELLO":     self._handle_handshake,
    "HEARTBEAT":        self._handle_heartbeat,
    "LOG_ENTRY":        self._handle_log_entry,
    # DOM commands existentes:
    "DOM_FOCUS":        self._handle_dom_passthrough,
    "DOM_TYPE":         self._handle_dom_passthrough,
    "DOM_CLICK":        self._handle_dom_passthrough,
    "DOM_WAIT":         self._handle_dom_passthrough,
    "DOM_SCROLL":       self._handle_dom_passthrough,
    "DOM_EXTRACT":      self._handle_dom_passthrough,
    "EVENT_EMIT":       self._handle_dom_passthrough,
    "STATE_TRANSITION": self._handle_state_transition,
    # Nuevos (IonPump v5):
    "DOM_NAVIGATE":     self._handle_dom_passthrough,
    "DOM_WATCH":        self._handle_dom_passthrough,
    "DOM_WATCH_URL":    self._handle_dom_passthrough,
    "DOM_UNWATCH":      self._handle_dom_passthrough,
    "DOM_SELECT":       self._handle_dom_passthrough,
}
```

### IonPumpIPCClient

Archivo: `brain/core/ionpump/ionpump_ipc.py`

```python
class IonPumpIPCClient:
    def __init__(self, launch_id: str, run_dir: Path):
        self._launch_id = launch_id
        self._run_dir = run_dir
        self._port: Optional[int] = None

    def _get_port(self) -> int:
        if self._port is None:
            port_file = self._run_dir / f"ipc_{self._launch_id}.port"
            self._port = int(port_file.read_text().strip())
        return self._port

    def send(self, command: SynapseCommand) -> Dict:
        port = self._get_port()
        with socket.create_connection(("127.0.0.1", port), timeout=5) as sock:
            sock.sendall(json.dumps(command.to_dict()).encode() + b"\n")
            response = sock.recv(4096)
            return json.loads(response)
```

---

## 13. Hot-reload mechanism

Archivo: `brain/core/ionpump/ionpump_loader.py`

```python
class IonRecipeWatcher(FileSystemEventHandler):
    def __init__(self, registry: IonRegistry, loader: IonLoader):
        self.registry = registry
        self.loader = loader

    def on_modified(self, event):
        if event.src_path.endswith('.ion') or event.src_path.endswith('.json'):
            domain = self._extract_domain(event.src_path)
            try:
                new_package = self.loader.load_site(Path(event.src_path).parent)
                self.registry.update(domain, new_package)
                logger.info(f"Hot-reloaded: {domain}")
            except IonLoadError as e:
                logger.error(f"Invalid package, keeping previous: {domain} — {e}")
```

**Prerequisito:** `watchdog` debe estar declarado en `requirements.txt` o `pyproject.toml`.

**Rollback en hot-reload inválido:**
1. Log del error con detalles de validación.
2. Mantener el paquete anterior en memoria.
3. Emitir `ION_RELOAD_FAILED`.
4. Continuar usando el paquete anterior hasta que se corrija.

### Contrato IonPumpClient — receptor en Brain

Metamorph llama a Brain durante el deploy. Brain debe exponer un endpoint (HTTP o socket) que implemente:

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

Cuando Metamorph llama `ReloadSite()`, Brain debe:
1. Llamar a `IonLoader.load_site()` para recargar el paquete desde disco.
2. Actualizar el `IonRegistry` con el nuevo `IonSitePackage`.
3. Responder `{"status": "reloaded", "version": "..."}`.

Cuando Metamorph llama `QuiesceSite()`, Brain debe:
1. Detener la aceptación de nuevos flows para ese dominio.
2. Esperar a que los flows activos completen (o timeout).
3. Responder `{"status": "quiesced", "active_flows": 0}`.

---

## 14. Metamorph — deploy

Metamorph Phase 6a y 6b están **completamente implementadas** en Go. No hay trabajo de código pendiente en Metamorph.

### Filesystem durante deploy

```
ionsites/
├── github.com/              ← site activo
├── _backup/github.com/      ← versión anterior
├── _meta/versions.json      ← estado de todas las versiones
└── _staging/
    ├── downloads/
    │   └── github.com.ion   ← ZIP antes de extracción
    └── github.com/          ← extracción temporal pre-swap
```

### 7 fases de reconciliación

| Fase | Acción | Falla si... |
|---|---|---|
| 1. Skip check | Compara version + SHA-256 con lo instalado | — retorna `skipped` |
| 2. Stage | Extrae ZIP de `_staging/downloads/` a `_staging/<domain>/` | ZIP no existe o corrupto |
| 3. Verify | SHA-256 por archivo según `files[]` del manifest | Cualquier hash no coincide |
| 4. Signal pre | `QuiesceSite()` a Brain (10s timeout) | Timeout → `failed` (bypass con `--force-swap`) |
| 5. Swap | `atomicSwap`: live→backup + staging→live | Rename falla → reversión automática |
| 6. Signal post | `ReloadSite()` a Brain | Error → activa fase 7 |
| 7. Rollback | Restaura desde `_backup/` | — si también falla: `failed` |

`versions.json` se actualiza solo después del swap exitoso y la confirmación de Brain. Si Brain falla el reload, el swap se revierte — nunca queda estado inconsistente.

### Status values (alineados con Metamorph Go)

| Valor | Condición |
|---|---|
| `healthy` | Manifest válido, todos los entry_actions existen en disco |
| `missing_manifest` | `domain.manifest.json` no existe |
| `invalid_manifest` | JSON inválido o `version == ""` |
| `missing_entrypoint` | Un entry_action no existe en actions o el archivo falta |

### IonRecipeInfo (tipos Go reales)

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

### Comandos Metamorph

```powershell
# Inspección
metamorph inspect --ion-recipes
metamorph inspect --ion-recipes --show-pending
metamorph inspect --ion-recipes --show-backups
metamorph --json inspect --ion-recipes

# Deploy
metamorph reconcile-ion-recipes --manifest manifest.json
metamorph reconcile-ion-recipes --manifest manifest.json --dry-run
metamorph reconcile-ion-recipes --manifest manifest.json --force-swap
metamorph --json reconcile-ion-recipes --manifest manifest.json

# Desde stdin
Get-Content manifest.json | metamorph reconcile-ion-recipes
```

### Manifest de reconciliación

```json
{
  "ion_recipes": [
    {
      "site": "github.com",
      "version": "1.0.0",
      "download_url": "",
      "sha256": "HASH_DEL_ZIP_COMPLETO",
      "files": [
        { "path": "domain.manifest.json",           "sha256": "HASH" },
        { "path": "actions/generate_pat.ion",        "sha256": "HASH" },
        { "path": "pages/tokens_page.page.ion",      "sha256": "HASH" },
        { "path": "pages/new_token_page.page.ion",   "sha256": "HASH" },
        { "path": "shared/session_guard.ion",        "sha256": "HASH" }
      ]
    }
  ]
}
```

### Cómo empaquetar para deploy manual

**Windows:**
```powershell
# Desde el directorio que CONTIENE la carpeta github.com/
Compress-Archive -Path .\github.com\* -DestinationPath .\github.com.ion.zip
Get-FileHash .\github.com.ion.zip -Algorithm SHA256

# Hashes de archivos individuales (desde dentro de github.com/)
Get-ChildItem -Recurse -File | ForEach-Object {
    $hash = (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower()
    $rel  = $_.FullName.Replace((Get-Location).Path + "\", "").Replace("\", "/")
    Write-Output "  { `"path`": `"$rel`", `"sha256`": `"$hash`" },"
}
```

**macOS / Linux:**
```bash
cd github.com && zip -r ../github.com.ion.zip . && cd ..
shasum -a 256 github.com.ion.zip
```

### versions.json esperado tras deploy exitoso

```json
{
  "schema_version": "1.0",
  "sites": {
    "github.com": {
      "version": "1.0.0",
      "installed_at": "2026-05-02T12:00:00Z",
      "sha256": "HASH_DEL_ZIP_COMPLETO",
      "swap_count": 1,
      "status": "active"
    }
  },
  "last_updated": "2026-05-02T12:00:00Z"
}
```

### Troubleshooting

**Site aparece como `missing_manifest`:**
```powershell
Test-Path "$env:LOCALAPPDATA\BloomNucleus\bin\cortex\ionsites\github.com\domain.manifest.json"
# Si False: el ZIP se extrajo incompleto. Re-deployar.
```

**Deploy falla en fase `verify`:**
```powershell
Get-FileHash .\github.com.ion.zip -Algorithm SHA256
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\BloomNucleus\bin\cortex\ionsites\_staging\github.com"
```

**Deploy falla en fase `signal_pre` (Brain no responde):**
```powershell
brain --status
metamorph reconcile-ion-recipes --manifest .\manifest.json --force-swap
```

**Site en estado `pending`:**
Indica que Metamorph crasheó durante un swap anterior. Se resuelve automáticamente al próximo arranque (crash recovery). Para forzarlo: reiniciar Metamorph.

---

## 15. Build pipeline

### Script de build

```
installer/metamorph/scripts/build-bootstrap-ions.py
```

**Qué hace:**
1. Lee cada site desde `installer/ions/<domain>/`.
2. Empaqueta en `installer/native/ionpump/<domain>.ion.zip` (ZIP deflate, paths POSIX).
3. Calcula SHA-256 del ZIP completo y de cada archivo individual.
4. Actualiza `installer/native/ionpump/bootstrap-ions.json` con los hashes reales.

```bash
python installer/metamorph/scripts/build-bootstrap-ions.py
```

### bootstrap-ions.json

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
        { "path": "actions/generate_pat.ion",      "sha256": "<hash>" },
        { "path": "domain.manifest.json",          "sha256": "<hash>" },
        { "path": "pages/new_token_page.page.ion", "sha256": "<hash>" },
        { "path": "pages/tokens_page.page.ion",    "sha256": "<hash>" },
        { "path": "shared/session_guard.ion",      "sha256": "<hash>" }
      ]
    }
  ]
}
```

**Nota:** `ions[]` es el campo real (el `recipes[]` de versiones anteriores fue reemplazado). `download_url` vacío en bootstrap — Metamorph usa `zip_path` para bootstrap y `download_url` (Batcave) para actualizaciones automáticas futuras.

---

## 16. Admin commands (Brain)

Archivos: `brain/commands/ionpump/`

### brain ionpump inspect

```
brain ionpump inspect
brain ionpump inspect --domain github.com
brain ionpump inspect --json
```

Output:
```
IonPump — Sites cargados
────────────────────────────────────────────────────────────
github.com    v1.0.0    1 actions    2 pages    1 shared    ✅ healthy
────────────────────────────────────────────────────────────
Total: 1 site
```

Campos en output: `page_count` y `shared_count` — **NO `flow_count`** (campo eliminado en v5).

### brain ionpump validate

```
brain ionpump validate ./installer/ions/github.com/
```

Output:
```
✓ domain.manifest.json        schema válido, schema_version 2.0
✓ actions/generate_pat.ion    9 steps, sin errores
✓ pages/tokens_page.page.ion  2 elementos, 1 signal
✓ pages/new_token_page.page.ion  5 elementos, 1 signal
✓ shared/session_guard.ion    fragment válido
```

### brain ionpump test

```
brain ionpump test github.com generate_pat --dry-run \
  --context '{"token_name":"test","expiration":"30","required_scopes":"repo,read:org","token_description":"test"}'
```

### brain ionpump reload

```
brain ionpump reload github.com
brain ionpump reload --all
```

---

## 17. Cortex — DOM commands

Archivo: `background.js`, línea ~626.

Agregar exactamente estas cuatro entradas al array `DOM_COMMANDS`. El dispatch y ACK ya están implementados — el único cambio en Cortex es este array.

```javascript
const DOM_COMMANDS = [
  "DOM_CLICK", "DOM_TYPE", "DOM_WAIT",
  "DOM_FOCUS", "DOM_SCROLL", "DOM_EXTRACT",
  // Nuevos (IonPump v5):
  "DOM_NAVIGATE",
  "DOM_WATCH",
  "DOM_WATCH_URL",
  "DOM_UNWATCH",
  // Verificar si DOM_SELECT también es necesario
];
```

**No hay otros cambios en Cortex para IonPump. No modificar `content.js`.**

---

## 18. Ejemplo completo de ejecución

### Intent de entrada

```json
{
  "intent_type": "dev",
  "intent_subtype": "web_automation",
  "domain": "github.com",
  "action": "generate_pat",
  "context": {
    "token_name": "bloom-terminal",
    "token_description": "Bloom Conductor",
    "required_scopes": "repo,read:org",
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
   → IonRegistry: paquete no cargado
   → IonLoader.load_site(ionsites/github.com/)
     → parsea domain.manifest.json
     → carga eager: pages/tokens_page.page.ion, pages/new_token_page.page.ion
     → registra IonSitePackage en registry

3. IonExecutor: resolver requires: ["session_guard_passed"]
   → no está en event_log
   → IonLoader._load_shared("session_guard")
   → ejecuta fragment session_guard
     → check: page_matches "*/login*" → FALSE (sesión activa)
     → emit: "session_guard_passed" → agrega al event_log

4. IonExecutor: ejecutar steps de generate_pat

   Step navigate:
     → _resolve_url("https://github.com/settings/tokens/new?scopes=$CONTEXT.required_scopes&description=$CONTEXT.token_description")
     → URL resuelta: "https://github.com/settings/tokens/new?scopes=repo,read:org&description=Bloom+Conductor"
     → DOM_NAVIGATE { url: "https://github.com/settings/tokens/new?scopes=repo,read:org&description=Bloom+Conductor" }
     → DOM_WAIT (ready_when de new_token_page)
     → DOM_WATCH (signal: token_generated)
     → DOM_WATCH_URL (transitions de new_token_page)

   Step wait (token_name_input):
     → DOM_WAIT { selector: "input#token_description" }

   Step type (token_name_input):
     → _resolve_variables("$CONTEXT.token_name") → "bloom-terminal"
     → DOM_TYPE { selector: "input#token_description", text: "bloom-terminal" }

   Step select (expiration_select):
     → _resolve_variables("$CONTEXT.expiration") → "30"
     → DOM_SELECT { selector: "select#expiration", value: "30" }

   Step click (submit_button):
     → DOM_CLICK { selector: "button[type='submit']" }

   Step wait_signal (token_generated):
     → signal ya registrado via DOM_WATCH al entrar a new_token_page
     → espera evento "token_generated" del browser (timeout: 15000ms)

   Step extract (token_value):
     → DOM_EXTRACT { selector: "#new-oauth-token" }
     → save_to: $CONTEXT.generated_pat

   Step emit (PAT_GENERATED):
     → EVENT_EMIT { event: "PAT_GENERATED", payload: { token: "ghp_...", ... } }

5. IonStateMachine: EXECUTING → COMPLETED
6. IntentExecutor: guarda resultado en .pipeline/.execution/.response/
7. Intent completado ✓
```

### Intent mínimo para llamar generate_pat desde cualquier componente

```python
intent = {
    "intent_type": "dev",
    "intent_subtype": "web_automation",
    "domain": "github.com",
    "action": "generate_pat",
    "context": {
        "token_name": "bloom-terminal",         # nombre del token en GitHub
        "token_description": "Bloom Conductor", # descripción (aparece en la URL)
        "required_scopes": "repo,read:org",     # scopes del PAT
        "expiration": "30",                     # días
        # github_username y github_password los inyecta Brain desde Vault
    }
}
```

---

## 19. Constraints absolutos

1. ❌ **NO URLs de dominio externo fuera del ion** — ningún componente externo puede contener URLs de sitios que tengan un ion.
2. ❌ **NO standalone CLI usage** — IonPump es un runtime, no un CLI de usuario.
3. ❌ **NO eager loading de actions y shared** — solo pages se cargan eager.
4. ❌ **NO acceso DOM directo** — todo vía IPC → SynapseIPCServer → Chrome.
5. ❌ **NO selectores CSS en actions** — siempre `element:` + `on_page:`.
6. ❌ **NO modificar SynapseProtocol** — IonPump lo usa indirectamente vía IPC.
7. ❌ **NO modificar content.js** — la extensión es un ejecutor pasivo.
8. ❌ **NO network calls** — todos los paquetes desde filesystem local.
9. ❌ **NO IPC en non-localhost** — SynapseIPCServer binds a 127.0.0.1 only.
10. ❌ **NO `send_command()` en SynapseManager** — IPC es el único canal proactivo.
11. ❌ **NO editar archivos en AppData directamente** — solo vía Metamorph deploy.
12. ❌ **NO credenciales en archivos .ion** — siempre vía `$CONTEXT` + Nucleus Vault.
13. ❌ **NO schema_version distinto de "2.0"** — IonLoader rechaza versiones anteriores.
14. ❌ **NO variables `$CONTEXT.*` sin resolver en URLs** — IonExecutor lanza `IonContextError` antes de navegar.
15. ❌ **NO `flow_count` en outputs de inspect** — el campo correcto es `page_count` + `shared_count`.

---

## Checklist de deploy

Antes de ejecutar el deploy de un paquete:

- [ ] `domain.manifest.json` tiene `schema_version: "2.0"`
- [ ] `domain` en el manifest coincide con el nombre del directorio
- [ ] Todos los archivos declarados en `actions`, `pages`, `shared` existen en el ZIP
- [ ] El ZIP fue creado desde **dentro** de la carpeta del site
- [ ] Los hashes en el manifest de reconciliación fueron generados desde el ZIP ya comprimido
- [ ] Brain está corriendo (o se usa `--force-swap` para testing)
- [ ] Se ejecutó `--dry-run` primero sin errores
- [ ] Después del deploy: `metamorph inspect --ion-recipes` muestra `✅ healthy`
- [ ] Ninguna URL del dominio desplegado existe hardcodeada fuera de los archivos `.ion`

---

*IONPUMP MASTER SPEC v1.0 · Junio 2026 · Bloom Platform Engineering*  
*Supersede: IONPUMP_IMPLEMENTATION_PROMPT_v5.md · IONSITE_DEPLOY_GUIDE.md · ION_SDK_Developer_Guide.md*
