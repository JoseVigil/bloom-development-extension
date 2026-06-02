# brain/core/ionpump/ionpump_state.py
#
# State machine de IonPump v2.0.
#
# CHANGELOG respecto a v4:
#   - IonExecutionContext: received_events (List[str]) → event_log (Set[str]).
#     El cambio es semántico: event_log es un set porque los eventos son únicos
#     por sesión (memoization de requires[]). El nombre alineado con la spec v5.
#   - has_received_event() sigue funcionando igual (membership check en el set).
#   - receive_event() ahora hace set.add() en lugar de list.append().
#   - El resto de la state machine no cambia.

import threading
from datetime import datetime
from enum import Enum
from typing import Any, Dict, Optional, Set


class IonFlowState(Enum):
    IDLE          = "idle"
    BOOTSTRAPPING = "bootstrapping"
    EXECUTING     = "executing"
    WAITING_EVENT = "waiting_event"
    ERROR         = "error"
    COMPLETED     = "completed"


class IonExecutionContext:
    """Contexto de ejecución mutable para un par (tab_id, domain)."""

    __slots__ = (
        "tab_id",
        "domain",
        "current_flow",
        "state",
        "event_log",        # Set[str] — CAMBIO: era received_events: List[str]
        "context_vars",
        "created_at",
        "updated_at",
    )

    def __init__(self, tab_id: int, domain: str) -> None:
        now = datetime.utcnow()
        self.tab_id:        int               = tab_id
        self.domain:        str               = domain
        self.current_flow:  Optional[str]     = None
        self.state:         IonFlowState      = IonFlowState.IDLE
        self.event_log:     Set[str]          = set()   # memoización de eventos emitidos/recibidos
        self.context_vars:  Dict[str, Any]    = {}
        self.created_at:    datetime          = now
        self.updated_at:    datetime          = now

    def _touch(self) -> None:
        self.updated_at = datetime.utcnow()


def _key(tab_id: int, domain: str) -> str:
    return f"{tab_id}::{domain}"


class IonStateManager:
    """
    Almacén de estado thread-safe para contextos de ejecución IonPump.
    Cada contexto se identifica por (tab_id, domain).
    """

    def __init__(self) -> None:
        self._contexts: Dict[str, IonExecutionContext] = {}
        self._lock = threading.Lock()

    # ------------------------------------------------------------------
    # Context lifecycle
    # ------------------------------------------------------------------

    def get_or_create(self, tab_id: int, domain: str) -> IonExecutionContext:
        k = _key(tab_id, domain)
        with self._lock:
            if k not in self._contexts:
                self._contexts[k] = IonExecutionContext(tab_id, domain)
            return self._contexts[k]

    def clear(self, tab_id: int, domain: str) -> None:
        k = _key(tab_id, domain)
        with self._lock:
            self._contexts.pop(k, None)

    # ------------------------------------------------------------------
    # State transitions
    # ------------------------------------------------------------------

    def transition(
        self, tab_id: int, domain: str, flow: str, state: IonFlowState
    ) -> None:
        ctx = self.get_or_create(tab_id, domain)
        with self._lock:
            ctx.current_flow = flow
            ctx.state = state
            ctx._touch()

    # ------------------------------------------------------------------
    # Event log (Set[str] — memoización de requires[])
    # ------------------------------------------------------------------

    def receive_event(self, tab_id: int, domain: str, event: str) -> None:
        """
        Registra un evento en el event_log del contexto.
        Idempotente — el mismo evento registrado varias veces no duplica.
        """
        ctx = self.get_or_create(tab_id, domain)
        with self._lock:
            ctx.event_log.add(event)
            ctx._touch()

    def has_received_event(self, tab_id: int, domain: str, event: str) -> bool:
        """Retorna True si el evento está en el event_log de este contexto."""
        ctx = self.get_or_create(tab_id, domain)
        with self._lock:
            return event in ctx.event_log

    # ------------------------------------------------------------------
    # Context variables
    # ------------------------------------------------------------------

    def set_var(self, tab_id: int, domain: str, key: str, value: Any) -> None:
        ctx = self.get_or_create(tab_id, domain)
        with self._lock:
            ctx.context_vars[key] = value
            ctx._touch()

    def get_var(self, tab_id: int, domain: str, key: str) -> Optional[Any]:
        ctx = self.get_or_create(tab_id, domain)
        with self._lock:
            return ctx.context_vars.get(key)
