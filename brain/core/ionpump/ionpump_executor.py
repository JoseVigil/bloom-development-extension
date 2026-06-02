# brain/core/ionpump/ionpump_executor.py
#
# Traduce steps Ion v2.0 en SynapseCommand objects.
#
# CHANGELOG respecto a v4:
#   - _resolve_element(): resuelve element names a selectores via page descriptors.
#     Nunca se pasan selectores CSS directos desde los steps.
#   - STEP_TO_COMMAND: agrega "navigate" → DOM_NAVIGATE, "select" → DOM_SELECT.
#   - Manejo interno (sin SynapseCommand):
#       wait_signal → espera evento registrado via DOM_WATCH en navigate
#       check       → bifurcación condicional, ejecuta if_true o if_false
#       call        → invoca fragment o action via loader
#   - execute_action(): verifica y ejecuta requires[] antes del action.
#   - _find_fragment_for_event(): busca qué fragment emite un evento dado.
#   - navigate: genera DOM_NAVIGATE + DOM_WAIT (ready_when) + DOM_WATCH (signals)
#     + DOM_WATCH_URL (transitions) desde el page descriptor.

from __future__ import annotations

import logging
import re
from typing import TYPE_CHECKING, Any, AsyncIterator, Dict, List, Optional

from brain.core.ionpump.ionpump_models import (
    IonPageDescriptor,
    IonRecipe,
    IonSitePackage,
    IonStep,
    SynapseCommand,
)
from brain.core.ionpump.ionpump_state import IonFlowState, IonStateManager

if TYPE_CHECKING:
    from brain.core.ionpump.ionpump_loader import IonLoader

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Mapping Ion step type → Synapse command
# ---------------------------------------------------------------------------
# Tipos que generan un SynapseCommand directo.
# Los tipos internos (wait_signal, check, call, transition) NO están aquí.
STEP_TO_COMMAND: Dict[str, str] = {
    # Existentes
    "wait":         "DOM_WAIT",
    "click":        "DOM_CLICK",
    "type":         "DOM_TYPE",
    "focus":        "DOM_FOCUS",
    "scroll":       "DOM_SCROLL",
    "extract":      "DOM_EXTRACT",
    "emit":         "EVENT_EMIT",
    "transition":   "STATE_TRANSITION",
    # Nuevos v5
    "navigate":     "DOM_NAVIGATE",
    "select":       "DOM_SELECT",
    # Internos — no generan SynapseCommand:
    #   wait_signal, check, call
}

_VAR_PATTERN    = re.compile(r"\$\{([^}]+)\}")
_CONTEXT_PATTERN = re.compile(r"\$CONTEXT\.(\w+)")
_SIGNAL_PATTERN  = re.compile(r"\$SIGNAL\.(\w+)")

_SHORTHANDS: Dict[str, str] = {
    "$PROMPT": "$CONTEXT.prompt",
    "$SITE":   "$CONTEXT.site",
    "$TAB":    "$CONTEXT.tab_id",
}


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class IonPageNotFound(Exception):
    def __init__(self, domain: str, page_name: str) -> None:
        super().__init__(f"Page '{page_name}' not found in package '{domain}'.")

class IonElementNotFound(Exception):
    def __init__(self, page_name: str, element_name: str) -> None:
        super().__init__(f"Element '{element_name}' not declared in page '{page_name}'.")


# ---------------------------------------------------------------------------
# Executor
# ---------------------------------------------------------------------------

class IonExecutor:
    """
    Traduce steps Ion en SynapseCommand objects.

    Es un async generator — NO envía nada.
    El caller (IonPumpManager) envía cada comando via IPC y espera el ACK.

    Principio clave: nunca pasa selectores CSS directamente desde los steps.
    Siempre resuelve element names via _resolve_element() usando page descriptors.
    """

    def __init__(self, state_manager: IonStateManager, loader: Optional["IonLoader"] = None) -> None:
        self._state  = state_manager
        self._loader = loader   # inyectado por manager para lazy-load de fragments

    # ------------------------------------------------------------------
    # Entry point principal — ejecuta un action resolviendo requires[]
    # ------------------------------------------------------------------

    async def execute_action(
        self,
        package: IonSitePackage,
        action_name: str,
        tab_id: int,
        launch_id: str,
        context: Dict[str, Any],
    ) -> AsyncIterator[SynapseCommand]:
        """
        Async generator principal.
        1. Lazy-load del action.
        2. Verificar y ejecutar requires[] en orden.
        3. Ejecutar los steps del action.
        """
        if self._loader is None:
            raise RuntimeError("IonExecutor requires a loader for execute_action()")

        action = self._loader._load_action(package, action_name)
        domain = package.manifest.domain

        # Resolver requires[] — ejecutar fragments si el evento no está en el log
        for required_event in action.requires:
            if not self._state.has_received_event(tab_id, domain, required_event):
                fragment = self._find_fragment_for_event(package, required_event)
                if fragment:
                    logger.debug(
                        "IonExecutor: executing required fragment '%s' for event '%s'",
                        fragment.name, required_event,
                    )
                    async for cmd in self._execute_steps(
                        package, fragment.steps, tab_id, context
                    ):
                        yield cmd
                else:
                    logger.debug(
                        "IonExecutor: no fragment found for required event '%s' — continuing",
                        required_event,
                    )

        # Ejecutar steps del action
        async for cmd in self._execute_steps(package, action.steps, tab_id, context):
            yield cmd

    # ------------------------------------------------------------------
    # Ejecución de steps (generador recursivo)
    # ------------------------------------------------------------------

    async def _execute_steps(
        self,
        package: IonSitePackage,
        steps: List[IonStep],
        tab_id: int,
        context: Dict[str, Any],
    ) -> AsyncIterator[SynapseCommand]:
        """
        Ejecuta una lista de steps, yieldeando SynapseCommands.
        Maneja internamente: transition, wait_signal, check, call.
        """
        for step in steps:
            st = step.step_type

            # ---- Tipos internos ----------------------------------------

            if st == "transition":
                self._apply_transition(step, tab_id, package.manifest.domain, context)
                continue

            if st == "wait_signal":
                # El signal ya fue registrado via DOM_WATCH al navegar a la página.
                # Aquí solo esperamos a que el evento llegue del browser.
                # IonPumpManager gestiona el esperar (poll del state).
                # El executor emite DOM_WATCH aquí como instrucción al browser de
                # observar el selector del signal correspondiente.
                async for cmd in self._handle_wait_signal(step, package, tab_id, context):
                    yield cmd
                continue

            if st == "check":
                async for cmd in self._handle_check(step, package, tab_id, context):
                    yield cmd
                continue

            if st == "call":
                async for cmd in self._handle_call(step, package, tab_id, context):
                    yield cmd
                continue

            # ---- navigate: genera múltiples comandos ---------------------

            if st == "navigate":
                async for cmd in self._handle_navigate(step, package, tab_id, context):
                    yield cmd
                continue

            # ---- Steps que generan un SynapseCommand directo -------------

            command_type = STEP_TO_COMMAND.get(st)
            if command_type is None:
                logger.warning("IonExecutor: unknown step type '%s' — skipping", st)
                continue

            if command_type == "STATE_TRANSITION":
                # transition sin step_type=transition explícito — raro pero posible
                self._apply_transition(step, tab_id, package.manifest.domain, context)
                continue

            resolved_params = self._resolve_step_params(step, package, context)
            yield SynapseCommand(command=command_type, params=resolved_params, tab_id=tab_id)

    # ------------------------------------------------------------------
    # Handlers para step types internos / compuestos
    # ------------------------------------------------------------------

    async def _handle_navigate(
        self,
        step: IonStep,
        package: IonSitePackage,
        tab_id: int,
        context: Dict[str, Any],
    ) -> AsyncIterator[SynapseCommand]:
        """
        navigate genera:
          1. DOM_NAVIGATE {url}
          2. DOM_WAIT × len(ready_when) — ready conditions de la página destino
          3. DOM_WATCH × len(signals)   — signals pasivos de la página
          4. DOM_WATCH_URL              — transitions on_navigate
        """
        params = step.params
        url     = self._resolve_value(params.get("url", ""), {}, context)
        page_name = params.get("expect_page", "")

        # 1. DOM_NAVIGATE
        yield SynapseCommand(
            command="DOM_NAVIGATE",
            params={"url": url, "expect_page": page_name},
            tab_id=tab_id,
        )

        # Intentar cargar el page descriptor para registrar ready/signals/transitions
        page: Optional[IonPageDescriptor] = package.pages.get(page_name)
        if page is None:
            logger.debug(
                "IonExecutor: navigate to '%s' — no page descriptor for '%s'",
                url, page_name,
            )
            return

        # 2. DOM_WAIT por cada ready_when condition
        for condition in page.ready_when:
            selector = condition.get("selector", "")
            timeout  = condition.get("timeout", 10000)
            optional = condition.get("optional", False)
            yield SynapseCommand(
                command="DOM_WAIT",
                params={"selector": selector, "timeout": timeout, "optional": optional},
                tab_id=tab_id,
            )

        # 3. DOM_WATCH por cada signal pasivo
        for signal_name, signal in page.signals.items():
            yield SynapseCommand(
                command="DOM_WATCH",
                params={
                    "selector": signal.detect,
                    "signal":   signal_name,
                    "once":     signal.once,
                    "priority": signal.priority,
                },
                tab_id=tab_id,
            )

        # 4. DOM_WATCH_URL por transitions on_navigate
        on_navigate = page.transitions.get("on_navigate", {})
        if on_navigate:
            yield SynapseCommand(
                command="DOM_WATCH_URL",
                params={"patterns": on_navigate},
                tab_id=tab_id,
            )

    async def _handle_wait_signal(
        self,
        step: IonStep,
        package: IonSitePackage,
        tab_id: int,
        context: Dict[str, Any],
    ) -> AsyncIterator[SynapseCommand]:
        """
        wait_signal: el signal ya debería estar registrado via DOM_WATCH.
        Emitimos DOM_WATCH con el selector del signal para asegurar el registro,
        luego el manager espera el evento en el state.
        """
        params    = step.params
        sig_name  = params.get("signal", "")
        page_name = params.get("on_page", "")
        timeout   = params.get("timeout", 10000)

        page = package.pages.get(page_name)
        if page and sig_name in page.signals:
            signal = page.signals[sig_name]
            yield SynapseCommand(
                command="DOM_WATCH",
                params={
                    "selector": signal.detect,
                    "signal":   sig_name,
                    "once":     signal.once,
                    "priority": signal.priority,
                    "timeout":  timeout,
                },
                tab_id=tab_id,
            )
        else:
            logger.warning(
                "IonExecutor: wait_signal '%s' — signal not found in page '%s'",
                sig_name, page_name,
            )

    async def _handle_check(
        self,
        step: IonStep,
        package: IonSitePackage,
        tab_id: int,
        context: Dict[str, Any],
    ) -> AsyncIterator[SynapseCommand]:
        """
        check: bifurcación condicional interna.
        Condiciones soportadas:
          - page_matches: evalúa si el pattern matchea la URL actual (browser-side)
          - if_unchecked / if_true / if_false: sub-listas de steps
        """
        params    = step.params
        condition = params.get("condition", "")

        # El check con condition="page_matches" emite un DOM_SELECT para que
        # el browser evalúe la condición y retorne true/false.
        # Por ahora, el executor ejecuta ambas ramas (if_true/if_false) de forma
        # declarativa — el manager puede implementar la lógica de cortocircuito
        # cuando el IPC layer retorne el resultado de la condición.
        # Si el step tiene if_true/if_false como sub-listas de steps, los ejecutamos.

        # Rama if_unchecked (check de checkbox)
        if_unchecked = params.get("if_unchecked", [])
        if if_unchecked:
            # En este caso el check es sobre el estado del elemento (checkbox)
            # El browser-side lo evalúa; aquí preparamos los steps del if_unchecked
            parsed_sub = [self._coerce_step(s) for s in if_unchecked]
            async for cmd in self._execute_steps(package, parsed_sub, tab_id, context):
                yield cmd
            return

        # Rama if_true / if_false (condición de página u otra)
        if_true  = params.get("if_true", [])
        if_false = params.get("if_false", [])

        if condition == "page_matches":
            # Emitir un comando especial para que el browser evalúe
            # (la ejecución de if_true o if_false la decide el manager
            # basándose en el ACK del browser — por ahora ejecutamos if_true
            # si existe, el runtime real cortocircuitará)
            pattern = params.get("pattern", "")
            yield SynapseCommand(
                command="DOM_NAVIGATE",
                params={"check_pattern": pattern},
                tab_id=tab_id,
            )
            if if_true:
                parsed_true = [self._coerce_step(s) for s in if_true]
                async for cmd in self._execute_steps(package, parsed_true, tab_id, context):
                    yield cmd

        else:
            # Condición genérica — ejecutar if_true por defecto
            if if_true:
                parsed_true = [self._coerce_step(s) for s in if_true]
                async for cmd in self._execute_steps(package, parsed_true, tab_id, context):
                    yield cmd

    async def _handle_call(
        self,
        step: IonStep,
        package: IonSitePackage,
        tab_id: int,
        context: Dict[str, Any],
    ) -> AsyncIterator[SynapseCommand]:
        """
        call: invoca un fragment o action del mismo paquete.
        Formato: call: {target: "shared/session_guard"}
        """
        if self._loader is None:
            logger.error("IonExecutor: 'call' step requires loader — skipping")
            return

        target = step.params.get("target", "")
        if not target:
            logger.warning("IonExecutor: 'call' step with no target — skipping")
            return

        # Determinar si es shared o action por el prefijo
        if target.startswith("shared/"):
            fragment_name = target.removeprefix("shared/")
            try:
                fragment = self._loader._load_shared(package, fragment_name)
            except Exception as exc:
                logger.error("IonExecutor: cannot load fragment '%s': %s", fragment_name, exc)
                return
            async for cmd in self._execute_steps(package, fragment.steps, tab_id, context):
                yield cmd

        elif target.startswith("actions/"):
            action_name = target.removeprefix("actions/")
            try:
                action = self._loader._load_action(package, action_name)
            except Exception as exc:
                logger.error("IonExecutor: cannot load action '%s': %s", action_name, exc)
                return
            async for cmd in self._execute_steps(package, action.steps, tab_id, context):
                yield cmd

        else:
            # Asumir shared si no hay prefijo
            try:
                fragment = self._loader._load_shared(package, target)
                async for cmd in self._execute_steps(package, fragment.steps, tab_id, context):
                    yield cmd
            except Exception as exc:
                logger.error("IonExecutor: cannot resolve call target '%s': %s", target, exc)

    # ------------------------------------------------------------------
    # Resolución de element names → selectores CSS
    # ------------------------------------------------------------------

    def _resolve_element(
        self,
        element_name: str,
        page_name: str,
        package: IonSitePackage,
    ) -> str:
        """
        Resuelve un element name a su selector CSS via el page descriptor.
        Lanza IonPageNotFound o IonElementNotFound si no existen.
        """
        page = package.pages.get(page_name)
        if not page:
            raise IonPageNotFound(package.manifest.domain, page_name)

        element = page.elements.get(element_name)
        if not element:
            raise IonElementNotFound(page_name, element_name)

        return element.selector

    # ------------------------------------------------------------------
    # Resolución de parámetros de step
    # ------------------------------------------------------------------

    def _resolve_step_params(
        self,
        step: IonStep,
        package: IonSitePackage,
        context: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Resuelve los parámetros de un step:
        - Sustituye element + on_page por selector (via page descriptor).
        - Resuelve variables $CONTEXT.* y ${var}.
        - Nunca pasa selectores CSS directos — siempre via page descriptor.
        """
        params = step.params
        resolved: Dict[str, Any] = {}

        element_name = params.get("element")
        page_name    = params.get("on_page")

        if element_name and page_name:
            try:
                selector = self._resolve_element(element_name, page_name, package)
                resolved["selector"] = selector
            except (IonPageNotFound, IonElementNotFound) as exc:
                logger.error("IonExecutor: element resolution failed — %s", exc)
                resolved["selector"] = ""

        for key, value in params.items():
            if key in ("element", "on_page"):
                continue  # ya procesados arriba
            if isinstance(value, str):
                resolved[key] = self._resolve_value(value, package.manifest.actions, context)
            else:
                resolved[key] = value

        return resolved

    def _resolve_value(
        self,
        value: str,
        recipe_vars: Dict[str, Any],
        context: Dict[str, Any],
    ) -> str:
        """
        Resuelve referencias de variables en un string:
        1. Shorthands ($PROMPT, $SITE, $TAB) → expandidos.
        2. ${var_name} → recipe_vars[var_name].
        3. $CONTEXT.key → context[key].
        """
        for shorthand, expansion in _SHORTHANDS.items():
            value = value.replace(shorthand, expansion)

        def _replace_recipe_var(m: re.Match) -> str:
            var_name = m.group(1)
            v = recipe_vars.get(var_name)
            return str(v) if v is not None else m.group(0)

        value = _VAR_PATTERN.sub(_replace_recipe_var, value)

        def _replace_context_var(m: re.Match) -> str:
            key = m.group(1)
            v = context.get(key)
            return str(v) if v is not None else m.group(0)

        value = _CONTEXT_PATTERN.sub(_replace_context_var, value)
        return value

    # ------------------------------------------------------------------
    # Helpers internos
    # ------------------------------------------------------------------

    def _apply_transition(
        self,
        step: IonStep,
        tab_id: int,
        domain: str,
        context: Dict[str, Any],
    ) -> None:
        target_flow   = step.params.get("to")
        new_state_str = step.params.get("state", IonFlowState.EXECUTING.value)
        try:
            new_state = IonFlowState(new_state_str)
        except ValueError:
            new_state = IonFlowState.EXECUTING
        if target_flow:
            self._state.transition(tab_id, domain, target_flow, new_state)

    def _find_fragment_for_event(
        self,
        package: IonSitePackage,
        event_name: str,
    ) -> Optional[IonRecipe]:
        """
        Busca qué fragment shared emite un evento dado.
        Hace lazy-load de todos los shared del paquete para inspeccionarlos.
        Retorna el primer fragment que emite el evento, o None.
        """
        if self._loader is None:
            return None

        for fragment_name in package.manifest.shared:
            try:
                fragment = self._loader._load_shared(package, fragment_name)
            except Exception:
                continue

            for step in fragment.steps:
                if step.step_type == "emit":
                    if step.params.get("event") == event_name:
                        return fragment

        return None

    def _coerce_step(self, raw: Any) -> IonStep:
        """Convierte un dict crudo (de if_true / if_false) en IonStep."""
        if isinstance(raw, IonStep):
            return raw
        if not isinstance(raw, dict):
            return IonStep(step_type="unknown", params={"_raw": raw})

        STEP_TYPES = {
            "navigate", "click", "type", "select", "wait", "wait_signal",
            "check", "call", "emit", "extract", "focus", "scroll", "transition",
        }
        for key in raw:
            if key in STEP_TYPES:
                params = raw[key]
                if params is None:
                    params = {}
                elif not isinstance(params, dict):
                    params = {"value": params}
                return IonStep(step_type=key, params=params)

        keys = list(raw.keys())
        step_type = keys[0] if keys else "unknown"
        params = raw.get(step_type, {}) or {}
        return IonStep(step_type=step_type, params=params if isinstance(params, dict) else {"value": params})
