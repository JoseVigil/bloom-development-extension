# brain/core/ionpump/ionpump_models.py
#
# Modelos de datos para IonPump v2.0.
# Alineados con el formato de paquete Ion v2.0 (actions/ + pages/ + shared/)
# y con los tipos Go de Metamorph (metamorph-ionpump-state.md).
#
# CHANGELOG respecto a v4:
#   - IonManifest: elimina entrypoint/flows/triggers, agrega actions/pages/shared/
#     entry_actions/schema_version/author_name/author_contact. "site" → "domain".
#   - IonStep: action → step_type (el campo "action" era ambiguo con el concepto action).
#   - IonFlow: elimina description (no está en el nuevo DSL por archivo).
#   - IonRecipe: reformateado — cada archivo *.ion es UN action o fragment
#     con sus propios steps. Ya no hay flows{} en la raíz.
#   - Nuevos: IonAction, IonElement, IonSignal, IonPageDescriptor,
#             IonSitePackage, IonRecipeStatus.

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional


# ---------------------------------------------------------------------------
# Status values — alineados con Metamorph Go (metamorph-ionpump-state.md §4)
# ---------------------------------------------------------------------------

class IonRecipeStatus:
    """
    Los cuatro únicos valores posibles para el status de un ion site.
    Constantes de string — sin variaciones.
    """
    HEALTHY             = "healthy"
    MISSING_MANIFEST    = "missing_manifest"
    INVALID_MANIFEST    = "invalid_manifest"
    MISSING_ENTRYPOINT  = "missing_entrypoint"


# ---------------------------------------------------------------------------
# Manifest types
# ---------------------------------------------------------------------------

@dataclass
class IonAction:
    """
    Una action declarada en domain.manifest.json.
    Equivalente al tipo Go IonAction en metamorph-ionpump-state.md §3.
    """
    name: str
    file: str       # path relativo al root del paquete (ej: "actions/generate_pat.ion")
    public: bool


@dataclass
class IonManifest:
    """
    Parsea domain.manifest.json (schema_version "2.0").

    CAMBIO RESPECTO A V4:
      - Agrega: schema_version, domain (antes "site"), author_name, author_contact,
                actions, pages, shared, entry_actions.
      - Elimina: entrypoint, flows, triggers.
    """
    schema_version: str                     # debe ser "2.0"
    domain: str                             # antes llamado "site"
    version: str
    description: str
    author_name: str
    author_contact: str
    actions: Dict[str, IonAction]           # clave: nombre, valor: IonAction
    pages: Dict[str, str]                   # clave: nombre, valor: path relativo
    shared: Dict[str, str]                  # clave: nombre, valor: path relativo
    entry_actions: List[str]
    capabilities: List[str] = field(default_factory=list)
    requires_cortex_version: str = ">=1.0.0"


# ---------------------------------------------------------------------------
# Page descriptor types
# ---------------------------------------------------------------------------

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
    """
    Parsea un archivo *.page.ion.
    No ejecuta nada — es un contrato estático.
    Los actions referencian elementos por nombre; el executor resuelve a selector.
    """
    page: str
    url_pattern: str
    ready_when: List[Dict[str, Any]]        # lista de condiciones de ready
    elements: Dict[str, IonElement]         # clave: nombre del elemento
    signals: Dict[str, IonSignal]           # clave: nombre del signal
    transitions: Dict[str, Any]             # on_signal + on_navigate


# ---------------------------------------------------------------------------
# Recipe types (actions y fragments)
# ---------------------------------------------------------------------------

@dataclass
class IonStep:
    """
    Un step dentro de un action o fragment.

    CAMBIO RESPECTO A V4: el campo se llama step_type (no "action") para evitar
    confusión con el concepto "action" del manifest. Valores válidos:
        navigate, wait, click, type, select, focus, scroll, extract,
        emit, wait_signal, check, call, transition
    """
    step_type: str
    params: Dict[str, Any] = field(default_factory=dict)


@dataclass
class IonFlow:
    """
    Un flow dentro de un action o fragment.
    CAMBIO RESPECTO A V4: elimina description (no está en el nuevo DSL por archivo).
    """
    name: str
    steps: List[IonStep] = field(default_factory=list)
    requires: List[str] = field(default_factory=list)   # eventos que deben estar en event_log


@dataclass
class IonErrorHandler:
    trigger: str
    retry: int = 0
    backoff: int = 0
    fallback: str = "emit_error"


@dataclass
class IonRecipe:
    """
    Un action o fragment completo — resultado de parsear un archivo *.ion.

    CAMBIO RESPECTO A V4: ya no hay flows{} en la raíz. Cada archivo *.ion
    es un único action o fragment. El campo "kind" distingue ambos.
    """
    kind: str                                   # "action" | "fragment"
    name: str
    description: str
    requires: List[str] = field(default_factory=list)
    steps: List[IonStep] = field(default_factory=list)
    error_handlers: Dict[str, IonErrorHandler] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Site package — contenedor completo en memoria
# ---------------------------------------------------------------------------

@dataclass
class IonSitePackage:
    """
    Representación completa de un paquete Ion cargado en memoria.
    Reemplaza la _RegistryEntry anterior.

    Invariantes de carga:
      - pages: eager-loaded al registrar el site (son la base para resolver elements).
      - actions: lazy-loaded al primer execute_action().
      - shared: lazy-loaded al primer requires[] que lo referencie.
    """
    manifest: IonManifest
    root_path: Path
    actions: Dict[str, IonRecipe]           # lazy-loaded, clave: nombre de action
    pages: Dict[str, IonPageDescriptor]     # eager-loaded
    shared: Dict[str, IonRecipe]            # lazy-loaded, clave: nombre de fragment


# ---------------------------------------------------------------------------
# Runtime types (sin cambios respecto a v4)
# ---------------------------------------------------------------------------

@dataclass
class SynapseCommand:
    command: str
    params: Dict[str, Any]
    tab_id: int


@dataclass
class IonExecutionResult:
    success: bool
    site: str
    action: str                             # renombrado de "flow" para alinearse con v5
    commands_sent: int
    error: Optional[str] = None
