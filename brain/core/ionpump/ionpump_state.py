# brain/core/ionpump/ionpump_state.py

import threading
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional


class IonFlowState(Enum):
    IDLE = "idle"
    BOOTSTRAPPING = "bootstrapping"
    EXECUTING = "executing"
    WAITING_EVENT = "waiting_event"
    ERROR = "error"
    COMPLETED = "completed"


class IonExecutionContext:
    """Mutable execution context for a single (tab_id, domain) pair."""

    __slots__ = (
        "tab_id",
        "domain",
        "current_flow",
        "state",
        "received_events",
        "context_vars",
        "created_at",
        "updated_at",
    )

    def __init__(self, tab_id: int, domain: str) -> None:
        now = datetime.utcnow()
        self.tab_id: int = tab_id
        self.domain: str = domain
        self.current_flow: Optional[str] = None
        self.state: IonFlowState = IonFlowState.IDLE
        self.received_events: List[str] = []
        self.context_vars: Dict[str, Any] = {}
        self.created_at: datetime = now
        self.updated_at: datetime = now

    def _touch(self) -> None:
        self.updated_at = datetime.utcnow()


def _key(tab_id: int, domain: str) -> str:
    return f"{tab_id}::{domain}"


class IonStateManager:
    """
    Thread-safe in-memory state store for IonPump execution contexts.
    Each context is keyed by (tab_id, domain).
    """

    def __init__(self) -> None:
        self._contexts: Dict[str, IonExecutionContext] = {}
        self._lock = threading.Lock()

    # ------------------------------------------------------------------
    # Context lifecycle
    # ------------------------------------------------------------------

    def get_or_create(self, tab_id: int, domain: str) -> IonExecutionContext:
        """Return the existing context or create a fresh one."""
        k = _key(tab_id, domain)
        with self._lock:
            if k not in self._contexts:
                self._contexts[k] = IonExecutionContext(tab_id, domain)
            return self._contexts[k]

    def clear(self, tab_id: int, domain: str) -> None:
        """Remove the context entirely. No-op if it does not exist."""
        k = _key(tab_id, domain)
        with self._lock:
            self._contexts.pop(k, None)

    # ------------------------------------------------------------------
    # State transitions
    # ------------------------------------------------------------------

    def transition(
        self, tab_id: int, domain: str, flow: str, state: IonFlowState
    ) -> None:
        """Update the current flow and state for the given context."""
        ctx = self.get_or_create(tab_id, domain)
        with self._lock:
            ctx.current_flow = flow
            ctx.state = state
            ctx._touch()

    # ------------------------------------------------------------------
    # Event handling
    # ------------------------------------------------------------------

    def receive_event(self, tab_id: int, domain: str, event: str) -> None:
        """Record a received event in the context's event log."""
        ctx = self.get_or_create(tab_id, domain)
        with self._lock:
            ctx.received_events.append(event)
            ctx._touch()

    def has_received_event(self, tab_id: int, domain: str, event: str) -> bool:
        """Return True if the event was previously received in this context."""
        ctx = self.get_or_create(tab_id, domain)
        with self._lock:
            return event in ctx.received_events

    # ------------------------------------------------------------------
    # Context variables
    # ------------------------------------------------------------------

    def set_var(self, tab_id: int, domain: str, key: str, value: Any) -> None:
        """Set a context variable."""
        ctx = self.get_or_create(tab_id, domain)
        with self._lock:
            ctx.context_vars[key] = value
            ctx._touch()

    def get_var(self, tab_id: int, domain: str, key: str) -> Optional[Any]:
        """Get a context variable. Returns None if not set."""
        ctx = self.get_or_create(tab_id, domain)
        with self._lock:
            return ctx.context_vars.get(key)
