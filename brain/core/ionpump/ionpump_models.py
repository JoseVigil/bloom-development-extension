# brain/core/ionpump/ionpump_models.py

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
    command: str
    params: Dict[str, Any]
    tab_id: int


@dataclass
class IonExecutionResult:
    success: bool
    site: str
    flow: str
    commands_sent: int
    error: Optional[str] = None
