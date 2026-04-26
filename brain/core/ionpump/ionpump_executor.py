# brain/core/ionpump/ionpump_executor.py

import re
from typing import AsyncIterator, Dict, Any

from brain.core.ionpump.ionpump_models import IonRecipe, IonStep, SynapseCommand
from brain.core.ionpump.ionpump_state import IonFlowState, IonStateManager

# Mapping from .ion step action names to Synapse command types
STEP_TO_COMMAND: Dict[str, str] = {
    "wait":       "DOM_WAIT",
    "click":      "DOM_CLICK",
    "type":       "DOM_TYPE",
    "focus":      "DOM_FOCUS",
    "scroll":     "DOM_SCROLL",
    "extract":    "DOM_EXTRACT",
    "emit":       "EVENT_EMIT",
    "transition": "STATE_TRANSITION",
}

_VAR_PATTERN = re.compile(r"\$\{([^}]+)\}")

# Shorthand aliases for common context variables
_SHORTHANDS: Dict[str, str] = {
    "$PROMPT":  "$CONTEXT.prompt",
    "$SITE":    "$CONTEXT.site",
    "$TAB":     "$CONTEXT.tab_id",
}


class IonExecutor:
    """
    Translates .ion flow steps into SynapseCommand objects.

    This is a pure async generator — it DOES NOT send anything.
    The caller (IonPumpManager) sends each yielded command via IPC
    and waits for an ACK before requesting the next command.

    STATE_TRANSITION steps do NOT produce SynapseCommands.
    They update IonStateManager directly and continue.
    """

    def __init__(self, state_manager: IonStateManager) -> None:
        self._state = state_manager

    # ------------------------------------------------------------------
    # Main generator
    # ------------------------------------------------------------------

    async def execute_flow(
        self,
        recipe: IonRecipe,
        flow_name: str,
        tab_id: int,
        context: Dict[str, Any],
    ) -> AsyncIterator[SynapseCommand]:
        """
        Async generator. Yields one SynapseCommand per eligible step.

        Variable resolution order:
        1. Recipe variables  ${var_name}  from recipe.variables
        2. Runtime context   $CONTEXT.key  from the context dict
        3. Shorthands        $PROMPT → $CONTEXT.prompt, etc.

        STATE_TRANSITION steps update IonStateManager and yield nothing.
        """
        flow = recipe.flows.get(flow_name)
        if flow is None:
            raise ValueError(f"Flow '{flow_name}' not found in recipe '{recipe.site}'.")

        for step in flow.steps:
            if step.action == "transition":
                self._apply_transition(step, tab_id, recipe.site, context)
                continue

            command_type = STEP_TO_COMMAND.get(step.action)
            if command_type is None:
                # Unknown action — skip with no command; callers may log
                continue

            resolved_params = self._resolve_params(step, recipe, context)

            yield SynapseCommand(
                command=command_type,
                params=resolved_params,
                tab_id=tab_id,
            )

    # ------------------------------------------------------------------
    # Transition handling (no SynapseCommand emitted)
    # ------------------------------------------------------------------

    def _apply_transition(
        self,
        step: IonStep,
        tab_id: int,
        domain: str,
        context: Dict[str, Any],
    ) -> None:
        target_flow = step.params.get("to")
        new_state_str = step.params.get("state", IonFlowState.EXECUTING.value)

        try:
            new_state = IonFlowState(new_state_str)
        except ValueError:
            new_state = IonFlowState.EXECUTING

        if target_flow:
            self._state.transition(tab_id, domain, target_flow, new_state)

    # ------------------------------------------------------------------
    # Variable resolution
    # ------------------------------------------------------------------

    def _resolve_params(
        self,
        step: IonStep,
        recipe: IonRecipe,
        context: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Return step.params with all variable references resolved."""
        resolved: Dict[str, Any] = {}
        for key, value in step.params.items():
            if isinstance(value, str):
                resolved[key] = self._resolve_variables(value, recipe, context)
            else:
                resolved[key] = value
        return resolved

    def _resolve_variables(
        self, value: str, recipe: IonRecipe, context: Dict[str, Any]
    ) -> str:
        """
        Resolve variable references in a string value.

        Order:
        1. Shorthands ($PROMPT etc.) are expanded first.
        2. ${var_name} → recipe.variables[var_name]
        3. $CONTEXT.key → context["key"]
        """
        # Step 1: expand shorthands
        for shorthand, expansion in _SHORTHANDS.items():
            value = value.replace(shorthand, expansion)

        # Step 2: resolve ${var_name} from recipe variables
        def _replace_recipe_var(m: re.Match) -> str:
            var_name = m.group(1)
            return recipe.variables.get(var_name, m.group(0))

        value = _VAR_PATTERN.sub(_replace_recipe_var, value)

        # Step 3: resolve $CONTEXT.key from runtime context
        def _replace_context_var(m: re.Match) -> str:
            key = m.group(1).removeprefix("CONTEXT.")
            result = context.get(key)
            return str(result) if result is not None else m.group(0)

        value = re.sub(r"\$CONTEXT\.(\w+)", lambda m: str(context.get(m.group(1), m.group(0))), value)

        return value
