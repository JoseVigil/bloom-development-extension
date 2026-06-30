# PROMPT DE IMPLEMENTACIÓN — Brain v2.0
## IonPump Runtime + Harness Generator
### Referencia: BLOOM_HARNESS_IONPUMP_INTEGRATION_MASTER.md · v2.0

> **CHANGELOG v2.0**
> - IPC Layer agregado: `ionpump_ipc.py` y `synapse_ipc_server.py`
> - `ionpump_executor.py` corregido: yield SynapseCommand objects, NO envía directamente
> - `ionpump_manager.py` corregido: es quien llama al IPCClient
> - `SynapseManager` corregido: inicia SynapseIPCServer en thread, agrega handlers DOM
> - `HarnessGenerator` corregido: solo copia assets estáticos, SIN config (patrón v3.0)
> - `harness.synapse.config.js` movido a Sentinel launch (ignition_identity.go), NO a Brain seed
> - Phase 3 (IntentExecutor) marcada DEFERRED — archivo no confirmado en codebase

---

## Contexto para el implementador

Estás implementando dos responsabilidades de Brain en el contexto del milestone GitHub Onboarding:

1. **IonPump** — runtime de automatización web (vive en `brain/core/ionpump/`)
2. **Harness Generator** — despliega la página de debug en seed (vive en `brain/core/profile/web/`)

**Principios que no negociamos:**
- IonPump es un runtime interno. No es CLI de usuario.
- IonPump no llama directamente a `SynapseManager` — usa el IPC layer (TCP localhost).
- `SynapseManager` no se modifica para "enviar proactivamente" — se extiende con handlers DOM.
- `HarnessGenerator` sigue el patrón exacto de `discovery_generator.py` v3.0: solo copia assets estáticos.
- Brain no escribe configs de runtime (`harness.synapse.config.js`) — eso lo hace Sentinel en launch.

**Documentos de referencia:**
- `IONPUMP_IMPLEMENTATION_PROMPT_v2.md` — spec técnica completa con IPC layer
- `BLOOM_HARNESS_IONPUMP_INTEGRATION_MASTER.md` — arquitectura completa
- `discovery_generator.py` — patrón exacto que HarnessGenerator debe seguir

---

## Parte 1 — IonPump Runtime

### Estructura de archivos a crear

```
brain/core/ionpump/
├── __init__.py
├── ionpump_models.py        ← dataclasses del formato .ion
├── ionpump_registry.py      ← registro en memoria (manifests + recipes)
├── ionpump_loader.py        ← carga YAML, scan manifests, watchdog
├── ionpump_validator.py     ← validación de syntax
├── ionpump_state.py         ← state machine por (tab_id, domain)
├── ionpump_executor.py      ← Ion steps → SynapseCommand objects (yield, no envía)
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

ionsites/                    ← BloomNucleus/bin/cortex/ionsites/
├── github.com/
│   ├── ion.manifest.json
│   └── auth.ion
└── _meta/
    └── versions.json
```

---

### 1.1 ionpump_models.py

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
    requires: List[str] = field(default_factory=list)

@dataclass
class IonErrorHandler:
    trigger: str
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
    """Representa ion.manifest.json — se carga en discovery, no el recipe completo."""
    site: str
    version: str
    description: str
    entrypoint: str
    flows: List[str]
    triggers: Dict[str, str]
    capabilities: List[str] = field(default_factory=list)
    requires_cortex_version: str = ">=1.0.0"

@dataclass
class SynapseCommand:
    """Comando listo para enviar al SynapseIPCServer."""
    command: str
    params: Dict[str, Any]
    tab_id: int
```

---

### 1.2 ionpump_registry.py

Registry en memoria. Invariantes:
- Un entry siempre tiene manifest (cargado al arrancar Brain).
- Un entry puede no tener recipe (carga lazy — solo cuando IntentExecutor lo pide).
- El registry no escribe en filesystem. Solo lee.

```python
class IonRegistry:
    def register(self, site: str, manifest: IonManifest, path: Path) -> None:
        """Registra un ion por su manifest. Recipe se carga después."""

    def get_manifest(self, site: str) -> Optional[IonManifest]:
        """Retorna el manifest si está registrado."""

    def get_recipe(self, site: str) -> Optional[IonRecipe]:
        """Retorna el recipe si ya fue cargado. None si no está en memoria."""

    def set_recipe(self, site: str, recipe: IonRecipe) -> None:
        """Almacena un recipe cargado."""

    def invalidate(self, site: str) -> None:
        """Marca el recipe como no cargado. Usado por watchdog en hot-reload."""

    def list_sites(self) -> List[str]:
        """Retorna todos los sites registrados."""
```

---

### 1.3 ionpump_loader.py

Responsabilidades:
1. Scan de `ionsites/*/ion.manifest.json` al arrancar → popula registry
2. Parse de `*.ion` files (YAML) bajo demanda → retorna IonRecipe
3. Watchdog filesystem → detecta cambios → invalida registry → recarga con validación

**Importante sobre el directorio `ionsites/`:**
Si `ionsites/` no existe al arrancar, `discover_all()` debe **crearlo silenciosamente** y retornar 0.
No es un error — significa que no hay recipes desplegados aún.

```python
class IonLoader:
    def __init__(self, ionsites_path: str, registry: IonRegistry):
        self.ionsites_path = Path(ionsites_path)
        self.registry = registry
        self._watcher = None

    def discover_all(self) -> int:
        """
        Crea ionsites/ si no existe (no es error).
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
        ⚠️ Prerequisito: 'watchdog' debe estar en requirements.txt antes de implementar.
        
        Inicia filesystem watcher en ionsites/.
        Cuando detecta cambio en *.ion o ion.manifest.json:
        1. Valida el nuevo archivo con ionpump_validator
        2. Si válido: invalida registry y recarga
        3. Si inválido: mantiene versión anterior, loggea error, emite ION_RELOAD_FAILED
        """

    def stop_watchdog(self) -> None:
        """Detiene el filesystem watcher."""
```

---

### 1.4 ionpump_validator.py

```python
@dataclass
class ValidationResult:
    valid: bool
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)

class IonValidator:
    def validate_file(self, path: Path) -> ValidationResult:
        """Valida un .ion file. No lanza excepciones — retorna ValidationResult."""

    def validate_recipe(self, recipe: IonRecipe) -> ValidationResult:
        """
        Valida un recipe ya parseado. Verifica:
        - Campos requeridos: version, site, flows
        - Cada flow tiene al menos un step
        - transition.to apunta a flows que existen en el mismo recipe
        - Variables ${var} declaradas en variables{}
        - requires[] referencia eventos, no flows
        """
```

---

### 1.5 ionpump_state.py

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
    received_events: List[str]
    context_vars: Dict[str, Any]
    created_at: datetime
    updated_at: datetime

class IonStateManager:
    def get_or_create(self, tab_id: int, domain: str) -> IonExecutionContext:
        """Retorna el contexto existente o crea uno nuevo."""

    def transition(self, tab_id: int, domain: str, flow: str, state: IonFlowState) -> None:
        """Registra transición de estado."""

    def receive_event(self, tab_id: int, domain: str, event: str) -> None:
        """Registra que un evento fue recibido."""

    def set_var(self, tab_id: int, domain: str, key: str, value: Any) -> None:
        """Almacena variable de runtime."""

    def get_var(self, tab_id: int, domain: str, key: str) -> Optional[Any]:
        """Lee variable de runtime."""

    def clear(self, tab_id: int, domain: str) -> None:
        """Limpia el contexto al terminar o al error."""
```

---

### 1.6 ionpump_executor.py

**Rol exacto:** Traduce pasos `.ion` a `SynapseCommand` objects.
**NO envía nada.** Es un generador puro — yielding commands para que `IonPumpManager` los envíe.

```python
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

class IonExecutor:
    def __init__(self, state_manager: IonStateManager):
        self.state_manager = state_manager

    async def execute_flow(
        self,
        recipe: IonRecipe,
        flow_name: str,
        tab_id: int,
        context: Dict[str, Any]
    ) -> AsyncIterator[SynapseCommand]:
        """
        Genera SynapseCommand objects para cada step del flow.
        Es un async generator.
        
        El caller (IonPumpManager) envía cada comando via IPC y espera ACK antes de continuar.
        
        Resuelve variables:
        1. Recipe variables (${var_name})
        2. Runtime context ($CONTEXT.key)
        3. Shorthands ($PROMPT → $CONTEXT.prompt)
        
        STATE_TRANSITION no genera un SynapseCommand — actualiza IonStateManager directamente.
        """

    def _resolve_variables(self, value: str, recipe: IonRecipe, context: Dict) -> str:
        """Resuelve todas las referencias de variables en un string."""
```

---

### 1.7 ionpump_ipc.py

Cliente TCP que conecta al `SynapseIPCServer` activo en el proceso Brain-Host.

```python
class IonIPCError(Exception):
    pass

class IonPumpIPCClient:
    """
    TCP client para enviar comandos DOM al proceso Brain-Host activo.
    
    Lee el puerto de: BloomNucleus/run/ipc_{launch_id}.port
    Falla con IonIPCError si el archivo no existe (Brain-Host no está corriendo).
    """

    def __init__(self, launch_id: str, run_dir: Path):
        self.launch_id = launch_id
        self.run_dir = run_dir
        self._port: Optional[int] = None

    def _resolve_port(self) -> int:
        """
        Lee BloomNucleus/run/ipc_{launch_id}.port.
        Lanza IonIPCError si no existe.
        """

    async def send_command(self, command: Dict[str, Any]) -> Dict[str, Any]:
        """
        Envía un JSON command a SynapseIPCServer.
        Retorna el ACK dict: {"status": "ok"} o {"status": "error", "detail": "..."}.
        Lanza IonIPCError en fallo de conexión o timeout.
        """
```

---

### 1.8 ionpump_manager.py

El orquestador. Singleton dentro de Brain. Punto de entrada que llama IntentExecutor.

```python
class IonPumpManager:
    """
    Runtime de IonPump. Singleton dentro de Brain.
    Se inicializa cuando Brain arranca, no cuando llega el primer intent.
    """

    def __init__(self, ionsites_path: str, run_dir: Path):
        self.registry = IonRegistry()
        self.loader = IonLoader(ionsites_path, self.registry)
        self.state_manager = IonStateManager()
        self.executor = IonExecutor(self.state_manager)
        self._run_dir = run_dir
        # IPC clients keyed by launch_id — created on demand
        self._ipc_clients: Dict[str, IonPumpIPCClient] = {}

    async def initialize(self) -> None:
        """
        Llamado al arrancar Brain.
        1. Escanea ionsites/ → popula registry con manifests (crea dir si no existe)
        2. Inicia watchdog filesystem (si watchdog está disponible)
        3. Loggea: "IonPump ready. N sites registered."
        """

    async def execute_flow(
        self,
        site: str,
        flow_name: str,
        tab_id: int,
        launch_id: str,
        context: Dict[str, Any]
    ) -> IonExecutionResult:
        """
        Punto de entrada para IntentExecutor.
        1. Lazy-load del recipe si no está en memoria
        2. Valida que el flow existe en el recipe
        3. Verifica requires (eventos recibidos en state manager)
        4. Obtiene/crea IonPumpIPCClient para este launch_id
        5. Itera sobre IonExecutor.execute_flow() (async generator)
        6. Por cada SynapseCommand: llama ipc_client.send_command(), espera ACK
        7. Retorna IonExecutionResult
        
        Maneja errores según error_handlers del recipe.
        """

    async def handle_event(self, event: str, tab_id: int, domain: str) -> None:
        """
        Llamado cuando Brain recibe un evento de la extensión.
        Registra el evento en IonStateManager.
        Si el contexto está en WAITING_EVENT para este evento, desbloquea la ejecución.
        """

    def list_sites(self) -> List[str]:
        """Admin: lista sites registrados."""

    def get_manifest(self, site: str) -> Optional[IonManifest]:
        """Admin: retorna manifest de un site."""
```

---

### 1.9 synapse_ipc_server.py

Servidor TCP que corre en el proceso Brain-Host. Recibe comandos de IonPump y los reenvía a Chrome.

```python
class SynapseIPCServer:
    """
    TCP server en Brain-Host process.
    
    Lifecycle:
    - Creado por SynapseManager al inicio de run_host_loop()
    - Bind a 127.0.0.1 en puerto efímero
    - Escribe puerto en BloomNucleus/run/ipc_{launch_id}.port
    - Corre en daemon thread — muere cuando el proceso host muere
    - Borra el port file en shutdown (try/finally)
    """

    def __init__(self, protocol: SynapseProtocol, launch_id: str, run_dir: Path):
        self.protocol = protocol
        self.launch_id = launch_id
        self.run_dir = run_dir

    def start(self) -> int:
        """
        Crea BloomNucleus/run/ si no existe.
        Bind a puerto efímero.
        Escribe puerto en ipc_{launch_id}.port.
        Inicia listener thread (daemon=True).
        Retorna el puerto.
        """

    def stop(self) -> None:
        """Para listener thread y borra port file."""

    def _handle_connection(self, conn: socket.socket) -> None:
        """Lee JSON, llama _dispatch_ion_command(), envía ACK."""

    def _dispatch_ion_command(self, command: Dict[str, Any]) -> Dict[str, Any]:
        """
        Valida que command['type'] es un comando DOM conocido.
        Llama self.protocol.send_message(command).
        Retorna {"status": "ok"} o {"status": "error", "detail": "..."}.
        """
```

**Modificación en SynapseManager** (mínima, no reescribir):

```python
# En __init__, agregar parámetros:
def __init__(self, launch_id: str, run_dir: Path):
    # ... existente ...
    self._launch_id = launch_id
    self._run_dir = run_dir

# En run_host_loop(), agregar al inicio:
def run_host_loop(self) -> None:
    from brain.core.synapse.synapse_ipc_server import SynapseIPCServer
    ipc_server = SynapseIPCServer(self.protocol, self._launch_id, self._run_dir)
    ipc_server.start()

    try:
        while True:
            message = self.protocol.read_message()
            if not message:
                break
            self._dispatch_message(message)
    finally:
        ipc_server.stop()

# En _action_map, agregar handlers DOM:
self._action_map = {
    # Existentes (NO modificar):
    "SYSTEM_HELLO":  self._handle_handshake,
    "HEARTBEAT":     self._handle_heartbeat,
    "LOG_ENTRY":     self._handle_log_entry,
    # NUEVOS para IonPump:
    "DOM_FOCUS":          self._handle_dom_passthrough,
    "DOM_TYPE":           self._handle_dom_passthrough,
    "DOM_CLICK":          self._handle_dom_passthrough,
    "DOM_WAIT":           self._handle_dom_passthrough,
    "DOM_SCROLL":         self._handle_dom_passthrough,
    "DOM_EXTRACT":        self._handle_dom_passthrough,
    "EVENT_EMIT":         self._handle_dom_passthrough,
    "STATE_TRANSITION":   self._handle_state_transition,
}

def _handle_dom_passthrough(self, message: Dict[str, Any]) -> None:
    """Reenvía comandos DOM de IonPump a Chrome. No modifica el mensaje."""
    self.protocol.send_message(message)

def _handle_state_transition(self, message: Dict[str, Any]) -> None:
    """STATE_TRANSITION no va a Chrome — actualiza estado interno."""
    # IonStateManager.transition() — no send_message
    pass  # implementar con referencia al state manager
```

---

### 1.10 Integración con IntentExecutor — ⚠️ DEFERRED

> **NO implementar hasta confirmar el archivo dispatcher en `brain/core/intent/`.**
> El archivo `intent_executor.py` referenciado en la spec no fue confirmado en el codebase.
> Explorar `brain/core/intent/` primero e identificar qué archivo despacha la ejecución.

Cuando se desbloquee, el patrón es:

```python
# Agregar al método que procesa intents — NO reescribir el método completo
if intent.subtype == "web_automation":
    site = intent.context.get("target_site")
    flow = intent.context.get("automation_flow", "send_prompt")
    tab_id = intent.context.get("tab_id")
    launch_id = intent.context.get("launch_id")

    if not site or not tab_id or not launch_id:
        return IntentResult.error("web_automation requires target_site, tab_id, and launch_id")

    result = await self.ionpump_manager.execute_flow(
        site=site,
        flow_name=flow,
        tab_id=tab_id,
        launch_id=launch_id,
        context=intent.context
    )
    return result
```

---

### 1.11 Recipes para milestone GitHub

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

### 1.12 Comandos admin

```bash
brain ionpump inspect                        # lista sites registrados
brain ionpump inspect --json
brain ionpump validate github.com/auth.ion   # valida syntax
brain ionpump reload github.com              # fuerza hot-reload manual
brain ionpump reload --all
brain ionpump test github.com bootstrap      # dry-run de un flow
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

Sigue el **patrón exacto** de `discovery_generator.py` v3.0:
- Solo copia assets estáticos
- No inyecta datos en el HTML
- No genera configs (`harness.synapse.config.js` lo escribe Sentinel en launch)
- En `dev_mode=False` es no-op completo

```python
# brain/core/profile/web/harness_generator.py

import shutil
from pathlib import Path
from typing import Dict, Any
from brain.shared.logger import get_logger

logger = get_logger(__name__)


def generate_harness_page(target_ext_dir: Path, profile_data: Dict[str, Any], dev_mode: bool = False) -> None:
    """
    Genera assets estáticos del Harness dentro del directorio de extensión.
    
    En dev_mode=False: no-op completo. No crea ningún archivo.
    En dev_mode=True: copia harness/index.html al extensionDir/harness/
    
    Patrón: idéntico a generate_discovery_page() — solo copia assets estáticos.
    La configuración (harness.synapse.config.js) es responsabilidad de Sentinel
    en el launch sequence (ignition_identity.go::prepareSessionFiles()).
    
    Args:
        target_ext_dir: Path a profiles/[UUID]/extension/
        profile_data: Dict con metadata del perfil (solo para logging)
        dev_mode: Si False, es no-op. Si True, despliega assets.
    """
    if not dev_mode:
        logger.debug("⏭️  Harness generator skipped (dev_mode=False)")
        return

    logger.info(f"🔧 Desplegando assets estáticos del Harness para: {profile_data.get('alias')}")

    harness_dir = target_ext_dir / "harness"
    harness_dir.mkdir(parents=True, exist_ok=True)

    _copy_static_assets(harness_dir)

    logger.info(f"  ✅ Assets del Harness desplegados en: {harness_dir}")
    logger.info(f"  ℹ️  harness.synapse.config.js será generado por Sentinel en launch")


def _copy_static_assets(harness_dir: Path) -> None:
    """
    Copia archivos estáticos desde templates/harness/ SIN modificaciones.
    No incluye archivos de configuración — son responsabilidad de Sentinel.
    """
    logger.debug("  📋 Copiando assets estáticos del Harness...")

    template_dir = Path(__file__).parent / "templates" / "harness"

    files_to_copy = [
        "index.html",
    ]

    copied = 0
    for file_name in files_to_copy:
        source = template_dir / file_name
        if source.exists():
            shutil.copy2(source, harness_dir / file_name)
            copied += 1
            logger.debug(f"    ✓ {file_name}")
        else:
            logger.warning(f"    ⚠️ Template no encontrado: {source}")

    logger.debug(f"  ✓ {copied}/{len(files_to_copy)} assets copiados")
```

---

### 2.2 Modificación en profile_create.py

Agregar llamada a `generate_harness_page()` en `_generate_profile_pages()`.

```python
# brain/core/profile/profile_create.py
# Modificación mínima — NO reescribir el método

def _generate_profile_pages(self, profile_id: str, profile_name: str, dev_mode: bool = False) -> None:
    """
    Genera discovery, landing y (en dev) harness pages para el perfil.
    """
    try:
        from brain.core.profile.web.discovery_generator import generate_discovery_page
        from brain.core.profile.web.landing_generator import generate_profile_landing
        from brain.core.profile.web.harness_generator import generate_harness_page
    except ImportError as e:
        logger.error(f"❌ Page generators not available: {e}")
        raise

    profile_dir = self.paths.profiles_dir / profile_id
    extension_dir = profile_dir / "extension"

    if not extension_dir.exists():
        raise FileNotFoundError(f"Extension directory not found: {extension_dir}")

    profile_data = {
        'id': profile_id,
        'alias': profile_name,
        'email': None,
        'register': True
    }

    # Existente: discovery page
    generate_discovery_page(extension_dir, profile_data)
    logger.info(f"✅ Discovery page generated")

    # Existente: landing page
    generate_profile_landing(extension_dir, profile_data)
    logger.info(f"✅ Landing page generated")

    # NUEVO: harness page (solo en dev_mode)
    generate_harness_page(extension_dir, profile_data, dev_mode=dev_mode)
    if dev_mode:
        logger.info(f"✅ Harness page generated (dev mode)")
```

También actualizar `create_profile()` para recibir y pasar `dev_mode`:

```python
def create_profile(
    self,
    profile_id: Optional[str] = None,
    name: Optional[str] = None,
    master: bool = False,
    dev_mode: bool = False    # NUEVO
) -> Dict[str, Any]:
    # ...
    self._generate_profile_pages(profile_id, profile_name, dev_mode=dev_mode)
```

---

### 2.3 harnessProtocol.js — archivo en templates de Cortex

Este archivo vive en `brain/core/profile/web/templates/discovery/harnessProtocol.js`.
Es copiado por `discovery_generator.py` al directorio de la extensión junto con los otros
assets estáticos, exactamente igual que `discoveryProtocol.js`.

**Agregar a `discovery_generator.py`** en la lista `files_to_copy`:
```python
files_to_copy = [
    "index.html",
    "discovery.js",
    "script.js",
    "discoveryProtocol.js",
    "harnessProtocol.js",   # ← NUEVO
    "content-aistudio.js",
    "onboarding.js",
    "styles.css"
]
```

**Contenido de `templates/discovery/harnessProtocol.js`:** ver `IMPL_PROMPT_BRAIN_IonPump_Harness.md` v1.0 sección 2.2 — el contenido del manifest no cambia.

---

### 2.4 discoveryProtocol.js — agregar manifest al final

Agregar `DISCOVERY_PROTOCOL_MANIFEST` al **final** del archivo `templates/discovery/discoveryProtocol.js`. No modificar nada de la lógica existente. Ver contenido completo en `IMPL_PROMPT_CORTEX_SENTINEL_Harness.md` sección 1.1.

---

## Constraintas de implementación — checklist Brain

- [ ] IonPump no hace eager loading de recipes `.ion`
- [ ] IonPump no llama a `chrome.runtime` directamente — todo vía IPC
- [ ] IonPump no modifica ningún archivo en `ionsites/` — solo Metamorph escribe
- [ ] `IonLoader.discover_all()` crea `ionsites/` si no existe — no lanza error
- [ ] `ionpump_executor.py` es un async generator — NO envía comandos, solo los yielda
- [ ] `ionpump_manager.py` es quien envía via `IonPumpIPCClient`
- [ ] `SynapseIPCServer` borra el port file en shutdown, incluso si hay excepción (try/finally)
- [ ] `SynapseIPCServer` solo escucha en 127.0.0.1 — nunca en 0.0.0.0
- [ ] El watchdog valida antes de aplicar un recipe nuevo
- [ ] Si la validación falla, la versión anterior sigue activa (rollback implícito)
- [ ] `generate_harness_page()` es no-op completo cuando `dev_mode=False`
- [ ] `HarnessGenerator` NO genera `harness.synapse.config.js` — eso lo hace Sentinel en launch
- [ ] Los handlers DOM en `SynapseManager._action_map` no modifican los handlers existentes
- [ ] `ionpump_manager.py` es un singleton — no se crean múltiples instancias
- [ ] La modificación a `_generate_profile_pages()` no rompe el path sin `dev_mode`
- [ ] El scan de manifests al arrancar no bloquea el start de Brain

---

*Implementar en orden: models → registry → loader → validator → state → executor → ipc_client → ipc_server → manager → synapse_manager (modificación) → harness_generator → profile_create (modificación)*
