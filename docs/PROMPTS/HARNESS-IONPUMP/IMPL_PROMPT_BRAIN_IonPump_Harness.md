# PROMPT DE IMPLEMENTACIÓN — Brain
## IonPump Runtime + Harness Generator
### Referencia: BLOOM_HARNESS_IONPUMP_INTEGRATION_MASTER.md · v1.0

---

## Contexto para el implementador

Estás implementando dos responsabilidades de Brain en el contexto del milestone GitHub Onboarding:

1. **IonPump** — runtime de automatización web (vive en `brain/core/ionpump/`)
2. **Harness Generator** — genera la página de debug en seed (vive en `brain/core/profile/web/`)

IonPump es un runtime interno. No es un módulo CLI de usuario. Se activa cuando IntentExecutor detecta `intent_subtype == "web_automation"`. No modifica Synapse. No modifica content.js. No hace llamadas de red.

**Documentos de referencia que debés leer antes de implementar:**
- `BLOOM_HARNESS_IONPUMP_INTEGRATION_MASTER.md` — arquitectura completa
- `INVESTIGACION_Harness_Protocol_Autodiscovery.md` — fuente de verdad del Harness
- `IONPUMP_IMPLEMENTATION_PROMPT_Complete_Specification.md` — spec técnica de IonPump

---

## Parte 1 — IonPump Runtime

### Estructura de archivos a crear

```
brain/core/ionpump/
├── __init__.py
├── ionpump_manager.py       ← orquestador principal
├── ionpump_loader.py        ← carga y watchdog de recipes
├── ionpump_registry.py      ← registro en memoria
├── ionpump_executor.py      ← Ion steps → Synapse commands
├── ionpump_state.py         ← state machine por (tab_id, domain)
├── ionpump_models.py        ← dataclasses del formato .ion
└── ionpump_validator.py     ← validación de syntax YAML

brain/commands/ionpump/
├── __init__.py
├── ionpump_inspect.py       ← brain ionpump inspect (admin)
├── ionpump_validate.py      ← brain ionpump validate (admin)
├── ionpump_reload.py        ← brain ionpump reload (admin)
└── ionpump_test.py          ← brain ionpump test --dry-run (admin)

ionsites/                    ← ubicación: BloomNucleus/bin/cortex/ionsites/
├── github.com/
│   ├── ion.manifest.json    ← autodescripción del ion
│   └── auth.ion             ← flujo de autenticación GitHub
└── _meta/
    └── versions.json
```

---

### 1.1 ionpump_models.py

Implementar los dataclasses que representan la estructura de un `.ion` file parseado:

```python
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any

@dataclass
class IonParameter:
    name: str
    variable: str
    type: str              # "string", "enum", "auto"
    default: Optional[str] = None
    options: List[str] = field(default_factory=list)
    source: Optional[str] = None

@dataclass
class IonStep:
    action: str            # "wait", "click", "type", "focus", "emit", "transition", "extract"
    params: Dict[str, Any] = field(default_factory=dict)

@dataclass
class IonFlow:
    name: str
    description: str
    steps: List[IonStep] = field(default_factory=list)
    requires: List[str] = field(default_factory=list)  # eventos requeridos antes de ejecutar

@dataclass
class IonErrorHandler:
    trigger: str           # "timeout", "selector_not_found"
    retry: int = 0
    fallback: str = "emit_error"

@dataclass
class IonRecipe:
    version: str
    site: str
    description: str
    entrypoints: Dict[str, str] = field(default_factory=dict)
    variables: Dict[str, str] = field(default_factory=dict)
    flows: Dict[str, IonFlow] = field(default_factory=dict)
    error_handlers: Dict[str, IonErrorHandler] = field(default_factory=dict)

@dataclass
class IonManifest:
    """Representa ion.manifest.json — se carga en brain discovery, no el recipe completo."""
    site: str
    version: str
    description: str
    entrypoint: str
    flows: List[str]
    triggers: Dict[str, str]
    capabilities: List[str] = field(default_factory=list)
    requires_cortex_version: str = ">=1.0.0"
```

---

### 1.2 ionpump_registry.py

Registry en memoria. Brain escanea los manifests al arrancar (barato). Los recipes `.ion` se cargan solo cuando se necesitan (lazy).

```python
class IonRegistry:
    """
    In-memory registry de ions disponibles.
    
    Invariantes:
    - Un entry siempre tiene manifest (se cargó al arrancar).
    - Un entry puede no tener recipe (carga lazy).
    - El registry no escribe en filesystem. Solo lee.
    """

    def register(self, site: str, manifest: IonManifest, path: Path) -> None:
        """Registra un ion por su manifest. Recipe se carga después."""

    def get_manifest(self, site: str) -> Optional[IonManifest]:
        """Retorna el manifest de un ion si está registrado."""

    def get_recipe(self, site: str) -> Optional[IonRecipe]:
        """Retorna el recipe si ya fue cargado. None si no está en memoria."""

    def set_recipe(self, site: str, recipe: IonRecipe) -> None:
        """Almacena un recipe cargado."""

    def invalidate(self, site: str) -> None:
        """Marca el recipe como no cargado (usado por watchdog en hot-reload)."""

    def list_sites(self) -> List[str]:
        """Retorna todos los sites registrados."""
```

---

### 1.3 ionpump_loader.py

Responsabilidades: 
1. Scan de `ionsites/*/ion.manifest.json` al arrancar → popula registry
2. Parse de `*.ion` files (YAML) bajo demanda → retorna IonRecipe
3. Watchdog filesystem → detecta cambios → invalida registry → recarga con validación

```python
class IonLoader:
    def __init__(self, ionsites_path: str, registry: IonRegistry):
        self.ionsites_path = Path(ionsites_path)
        self.registry = registry
        self._watcher = None

    def discover_all(self) -> int:
        """
        Escanea ionsites/ y registra todos los manifests.
        Retorna cantidad de ions registrados.
        
        NO carga los .ion files. Solo los manifests JSON.
        """

    def load_recipe(self, site: str) -> IonRecipe:
        """
        Carga el .ion file de un site. Usa cache si ya está en registry.
        Lanza IonNotFoundError si el site no está registrado.
        Lanza IonSyntaxError si el YAML es inválido.
        """

    def start_watchdog(self) -> None:
        """
        Inicia filesystem watcher en ionsites/.
        Cuando detecta cambio en *.ion o ion.manifest.json:
        1. Valida el nuevo archivo con ionpump_validator
        2. Si válido: invalida registry y recarga
        3. Si inválido: mantiene versión anterior, loggea error
        """

    def stop_watchdog(self) -> None:
        """Detiene el filesystem watcher."""
```

**Nota sobre el watchdog:** usar `watchdog` library de Python (`pip install watchdog`). El handler solo invalida el registry — no carga el recipe inmediatamente. La carga sucede la próxima vez que IntentExecutor pide ese site.

---

### 1.4 ionpump_validator.py

Valida syntax de un .ion file antes de cargarlo. Verifica:
- YAML parseable
- Campos requeridos presentes: `version`, `site`, `flows`
- Cada flow tiene al menos un step
- Los `requires` de un flow referencian eventos, no flows (evitar confusión)
- Los `transition.to` apuntan a flows que existen en el mismo recipe
- Variables referenciadas como `${var}` están declaradas en `variables`

```python
@dataclass
class ValidationResult:
    valid: bool
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)

class IonValidator:
    def validate_file(self, path: Path) -> ValidationResult:
        """Valida un archivo .ion. No lanza excepciones — retorna ValidationResult."""

    def validate_recipe(self, recipe: IonRecipe) -> ValidationResult:
        """Valida un recipe ya parseado."""
```

---

### 1.5 ionpump_state.py

State machine por `(tab_id, domain)`. Cada combinación tab+site tiene su propio estado independiente.

```python
from enum import Enum

class IonFlowState(Enum):
    IDLE = "idle"
    BOOTSTRAPPING = "bootstrapping"
    EXECUTING = "executing"
    WAITING_EVENT = "waiting_event"
    ERROR = "error"
    COMPLETED = "completed"

@dataclass
class IonExecutionContext:
    tab_id: int
    domain: str
    current_flow: Optional[str]
    state: IonFlowState
    received_events: List[str]    # eventos recibidos en esta sesión
    context_vars: Dict[str, Any]  # variables de runtime ($CONTEXT.*)
    created_at: datetime
    updated_at: datetime

class IonStateManager:
    def get_or_create(self, tab_id: int, domain: str) -> IonExecutionContext:
        """Retorna el contexto existente o crea uno nuevo."""

    def transition(self, tab_id: int, domain: str, flow: str, state: IonFlowState) -> None:
        """Registra transición de estado."""

    def receive_event(self, tab_id: int, domain: str, event: str) -> None:
        """Registra que un evento fue recibido en este contexto."""

    def set_var(self, tab_id: int, domain: str, key: str, value: Any) -> None:
        """Almacena una variable de runtime."""

    def get_var(self, tab_id: int, domain: str, key: str) -> Optional[Any]:
        """Lee una variable de runtime."""

    def clear(self, tab_id: int, domain: str) -> None:
        """Limpia el contexto al terminar o al error."""
```

---

### 1.6 ionpump_executor.py

Traduce pasos `.ion` a comandos Synapse. No habla directamente con SynapseServer — retorna comandos que IonPumpManager envía.

```python
# Mapeo Ion step → Synapse command
STEP_TO_COMMAND = {
    "wait":       "DOM_WAIT",
    "click":      "DOM_CLICK",
    "type":       "DOM_TYPE",
    "focus":      "DOM_FOCUS",
    "scroll":     "DOM_SCROLL",
    "extract":    "DOM_EXTRACT",
    "emit":       "EVENT_EMIT",
    "transition": "STATE_TRANSITION",
}

@dataclass
class SynapseCommand:
    command: str
    params: Dict[str, Any]
    tab_id: int

class IonExecutor:
    def __init__(self, state_manager: IonStateManager):
        self.state_manager = state_manager

    def execute_flow(
        self,
        recipe: IonRecipe,
        flow_name: str,
        tab_id: int,
        context: Dict[str, Any]
    ) -> AsyncIterator[SynapseCommand]:
        """
        Genera comandos Synapse para cada step del flow.
        Es un async generator: el caller envía cada comando y espera ACK antes del siguiente.
        
        Resuelve variables en este orden:
        1. Recipe variables (${var_name})
        2. Runtime context ($CONTEXT.key)
        3. Shorthands ($PROMPT)
        """

    def _resolve_variables(self, value: str, recipe: IonRecipe, context: Dict) -> str:
        """Resuelve todas las referencias de variables en un string."""
```

---

### 1.7 ionpump_manager.py

El orquestador. Punto de entrada que llama IntentExecutor.

```python
class IonPumpManager:
    """
    Runtime de IonPump. Singleton dentro de Brain.
    Se inicializa cuando Brain arranca, no cuando llega el primer intent.
    """

    def __init__(self, ionsites_path: str):
        self.registry = IonRegistry()
        self.loader = IonLoader(ionsites_path, self.registry)
        self.state_manager = IonStateManager()
        self.executor = IonExecutor(self.state_manager)

    async def initialize(self) -> None:
        """
        Llamado al arrancar Brain.
        1. Escanea ionsites/ → popula registry con manifests
        2. Inicia watchdog filesystem
        3. Loggea: "IonPump ready. N sites registered."
        """

    async def execute_flow(
        self,
        site: str,
        flow_name: str,
        tab_id: int,
        context: Dict[str, Any]
    ) -> IonExecutionResult:
        """
        Punto de entrada para IntentExecutor.
        1. Lazy-load del recipe si no está en memoria
        2. Valida que el flow existe
        3. Verifica requires (eventos recibidos)
        4. Ejecuta via IonExecutor → envía comandos a SynapseServer
        5. Retorna resultado
        
        Maneja errores según error_handlers del recipe.
        """

    async def handle_event(self, event: str, tab_id: int, domain: str) -> None:
        """
        Llamado cuando brain recibe un evento de la extensión.
        Registra el evento en el state manager del contexto (tab_id, domain).
        Si el contexto está en WAITING_EVENT para este evento, desbloquea la ejecución.
        """

    def list_sites(self) -> List[str]:
        """Admin: lista sites registrados."""

    def get_manifest(self, site: str) -> Optional[IonManifest]:
        """Admin: retorna manifest de un site."""
```

---

### 1.8 Integración con IntentExecutor

Modificación mínima en `brain/core/intent/intent_executor.py`:

```python
# Agregar al método que procesa intents — NO reescribir el método completo

async def _route_intent(self, intent: Intent) -> IntentResult:
    # ... lógica existente ...

    # NUEVO: detección de web_automation
    if intent.subtype == "web_automation":
        site = intent.context.get("target_site")
        flow = intent.context.get("automation_flow", "send_prompt")
        tab_id = intent.context.get("tab_id")
        
        if not site or not tab_id:
            return IntentResult.error("web_automation requires target_site and tab_id")
        
        result = await self.ionpump_manager.execute_flow(
            site=site,
            flow_name=flow,
            tab_id=tab_id,
            context=intent.context
        )
        return result

    # ... resto de la lógica existente ...
```

---

### 1.9 Recipes para milestone GitHub

**`ionsites/github.com/ion.manifest.json`:**
```json
{
  "site": "github.com",
  "version": "1.0.0",
  "description": "GitHub PAT authentication flow for Bloom onboarding",
  "entrypoint": "auth.ion",
  "flows": ["bootstrap", "handle_pat_detected", "await_confirmation"],
  "triggers": {
    "on_load": "bootstrap",
    "on_pat_clipboard": "handle_pat_detected"
  },
  "capabilities": ["auth", "clipboard_monitor"],
  "requires_cortex_version": ">=1.2.0"
}
```

**`ionsites/github.com/auth.ion`:** ver sección 4.4 del documento maestro.

**`ionsites/_meta/versions.json`:**
```json
{
  "last_updated": "2026-04-01T00:00:00Z",
  "sites": {
    "github.com": "1.0.0"
  }
}
```

---

### 1.10 Comandos admin (brain ionpump ...)

Estos son comandos de debugging, no de usuario final. Implementar en `brain/commands/ionpump/`:

```bash
brain ionpump inspect                    # lista todos los sites registrados
brain ionpump inspect --json             # mismo en JSON
brain ionpump validate github.com/auth.ion   # valida syntax
brain ionpump reload github.com          # fuerza hot-reload manual
brain ionpump reload --all               # recarga todos
brain ionpump test github.com bootstrap  # dry-run de un flow
brain ionpump test github.com send_prompt --context '{"prompt":"test"}' --dry-run
```

Salida de `brain ionpump inspect`:
```
IonPump Registry
────────────────────────────────────────────────────────────
✓ github.com     v1.0.0    3 flows    loaded
✗ claude.ai      v1.2.0    5 flows    not loaded
────────────────────────────────────────────────────────────
Total: 2 sites
```

---

## Parte 2 — Harness Generator

### 2.1 harness_generator.py

Brain genera el Harness en seed. El template vive en `brain/core/profile/web/templates/harness/index.html`.

```python
# brain/core/profile/web/harness_generator.py

class HarnessGenerator:
    def __init__(self, template_dir: Path):
        self.template_dir = template_dir

    def generate(
        self,
        output_dir: Path,
        profile_id: str,
        launch_id: str,
        profile_alias: str,
        dev_mode: bool = False
    ) -> Optional[Path]:
        """
        En dev_mode=True: copia harness/index.html a output_dir/harness/
        En dev_mode=False: no-op. Retorna None.
        
        No modifica el template. Solo copia.
        El template lee SYNAPSE_CONFIG y HARNESS_CONFIG en runtime.
        """
        if not dev_mode:
            return None

        harness_dir = output_dir / "harness"
        harness_dir.mkdir(exist_ok=True)
        
        src = self.template_dir / "harness" / "index.html"
        dst = harness_dir / "index.html"
        shutil.copy2(src, dst)
        
        return dst
```

**Regla de diseño:** el generator no inyecta datos en el HTML. El Harness lee `SYNAPSE_CONFIG` y `HARNESS_CONFIG` en runtime desde `self.*`. Si en el futuro se necesita hidratación, se hace en el generator — no en el template.

---

### 2.2 harnessProtocol.js — nuevo archivo en Cortex

Este archivo es generado por Brain en seed y copiado al directorio de la extensión. Expone `HARNESS_PROTOCOL_MANIFEST` en `self.*` para que el Harness lo lea.

```javascript
// harnessProtocol.js
// Generado por Brain en seed. No editar manualmente.
// Actualizar HARNESS_PROTOCOL_MANIFEST cuando cambien los comandos Synapse
// soportados por IonPump.

self.HARNESS_PROTOCOL_MANIFEST = {
  version: "1.0.0",
  protocol: "harness",
  description: "Web automation runtime — ion site control and DOM commands",

  messages: [
    // Mensajes que viajan por chrome.runtime (content → background)
    {
      id: "site_ready",
      type: "event",
      direction: "content_to_background",
      channel: "runtime",
      description: "Content script signals site is loaded and ready for automation",
      payload_template: {
        event: "SITE_READY",
        site: "$SITE",
        tab_id: "$TAB_ID"
      },
      parameters: [
        {
          name: "site",
          type: "enum",
          variable: "$SITE",
          options: ["github.com", "claude.ai", "chatgpt.com", "grok.com"]
        },
        {
          name: "tab_id",
          type: "auto",
          variable: "$TAB_ID",
          source: "selectedTabId"
        }
      ]
    },
    {
      id: "response_ready",
      type: "event",
      direction: "content_to_background",
      channel: "runtime",
      description: "Content script signals AI response is complete",
      payload_template: {
        event: "RESPONSE_READY",
        site: "$SITE",
        tab_id: "$TAB_ID"
      },
      parameters: [
        {
          name: "site",
          type: "enum",
          variable: "$SITE",
          options: ["github.com", "claude.ai", "chatgpt.com", "grok.com"]
        },
        {
          name: "tab_id",
          type: "auto",
          variable: "$TAB_ID",
          source: "selectedTabId"
        }
      ]
    },

    // Mensajes que viajan por chrome.tabs.sendMessage (background → content)
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
        {
          name: "selector",
          type: "string",
          variable: "$SELECTOR",
          default: "#login_field"
        }
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
        {
          name: "selector",
          type: "string",
          variable: "$SELECTOR",
          default: "#login_field"
        },
        {
          name: "text",
          type: "string",
          variable: "$TEXT",
          default: "Test input from Harness"
        }
      ]
    },
    {
      id: "dom_click",
      type: "command",
      direction: "background_to_content",
      channel: "tabs",
      description: "Click a DOM element",
      payload_template: {
        command: "DOM_CLICK",
        selector: "$SELECTOR"
      },
      parameters: [
        {
          name: "selector",
          type: "string",
          variable: "$SELECTOR",
          default: "button[type='submit']"
        }
      ]
    }
  ],

  sites: ["github.com", "claude.ai", "chatgpt.com", "grok.com"]
};
```

---

## Constraintas de implementación — checklist Brain

Antes de considerar completa cualquier PR de IonPump o Harness Generator, verificar:

- [ ] IonPump no hace eager loading de recipes `.ion`
- [ ] IonPump no llama a `chrome.runtime` directamente — solo SynapseServer
- [ ] IonPump no modifica ningún archivo en `ionsites/` — solo Metamorph escribe
- [ ] El watchdog valida antes de aplicar un recipe nuevo
- [ ] Si la validación falla, la versión anterior sigue activa (rollback implícito)
- [ ] `HarnessGenerator.generate()` es no-op cuando `dev_mode=False`
- [ ] Los comandos admin `brain ionpump *` no están disponibles en prod
- [ ] `ionpump_manager.py` es un singleton — no se crean múltiples instancias
- [ ] La modificación a `intent_executor.py` no rompe ningún intent type existente
- [ ] El scan de manifests al arrancar no bloquea el start de Brain

---

*Este prompt referencia: BLOOM_HARNESS_IONPUMP_INTEGRATION_MASTER.md*
*Implementar en orden: models → registry → loader → validator → state → executor → manager → integración*
