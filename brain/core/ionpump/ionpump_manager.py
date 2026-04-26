# brain/core/ionpump/ionpump_manager.py

import logging
from pathlib import Path
from typing import Any, Dict, Optional

from brain.core.ionpump.ionpump_executor import IonExecutor
from brain.core.ionpump.ionpump_ipc import IonIPCError, IonPumpIPCClient
from brain.core.ionpump.ionpump_loader import IonLoader, IonNotFoundError
from brain.core.ionpump.ionpump_models import IonExecutionResult, IonManifest
from brain.core.ionpump.ionpump_registry import IonRegistry
from brain.core.ionpump.ionpump_state import IonFlowState, IonStateManager
from brain.core.ionpump.ionpump_validator import IonValidator

logger = logging.getLogger(__name__)


class IonPumpManager:
    """
    Central orchestrator for IonPump. Singleton within Brain.

    Responsibilities:
    - Bootstrap: scan ionsites/, start watchdog.
    - Execute flows: lazy-load recipes, iterate the executor, send commands.
    - Handle events: register incoming DOM/browser events in state manager.
    """

    def __init__(self, ionsites_path: str, run_dir: Path) -> None:
        self._run_dir = run_dir
        self._registry = IonRegistry()
        self._loader = IonLoader(ionsites_path, self._registry)
        self._validator = IonValidator()
        self._state = IonStateManager()
        self._executor = IonExecutor(self._state)
        # Cache of IPC clients keyed by launch_id
        self._ipc_clients: Dict[str, IonPumpIPCClient] = {}

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def initialize(self) -> None:
        """
        Called at Brain startup.
        1. Scan ionsites/ → populate registry (creates dir if absent).
        2. Start watchdog filesystem watcher.
        3. Log readiness summary.
        """
        count = self._loader.discover_all()
        self._loader.start_watchdog()
        logger.info("IonPump ready. %d sites registered.", count)

    def shutdown(self) -> None:
        """Stop the watchdog gracefully."""
        self._loader.stop_watchdog()

    # ------------------------------------------------------------------
    # Flow execution
    # ------------------------------------------------------------------

    async def execute_flow(
        self,
        site: str,
        flow_name: str,
        tab_id: int,
        launch_id: str,
        context: Dict[str, Any],
    ) -> IonExecutionResult:
        """
        Execute a named flow for a site.

        Steps:
        1. Lazy-load recipe if not in memory.
        2. Validate the flow exists.
        3. Check requires[] against already-received events.
        4. Get or create the IPC client for this launch_id.
        5. Iterate the async generator — send each SynapseCommand, await ACK.
        6. Return IonExecutionResult.
        """
        # 1. Load recipe
        try:
            recipe = self._loader.load_recipe(site)
        except IonNotFoundError as exc:
            return IonExecutionResult(
                success=False, site=site, flow=flow_name,
                commands_sent=0, error=str(exc),
            )

        # 2. Validate flow exists
        if flow_name not in recipe.flows:
            return IonExecutionResult(
                success=False, site=site, flow=flow_name,
                commands_sent=0,
                error=f"Flow '{flow_name}' does not exist in recipe '{site}'.",
            )

        # 3. Check requires[]
        flow = recipe.flows[flow_name]
        domain = context.get("domain", site)
        missing_events = [
            event for event in flow.requires
            if not self._state.has_received_event(tab_id, domain, event)
        ]
        if missing_events:
            return IonExecutionResult(
                success=False, site=site, flow=flow_name,
                commands_sent=0,
                error=f"Flow '{flow_name}' requires events that have not been received: {missing_events}",
            )

        # 4. Get or create IPC client
        ipc_client = self._get_or_create_ipc_client(launch_id)

        # 5. Transition state → EXECUTING
        self._state.transition(tab_id, domain, flow_name, IonFlowState.EXECUTING)

        commands_sent = 0
        try:
            async for synapse_cmd in self._executor.execute_flow(
                recipe, flow_name, tab_id, context
            ):
                cmd_dict = {
                    "type": synapse_cmd.command,
                    "tab_id": synapse_cmd.tab_id,
                    **synapse_cmd.params,
                }
                try:
                    ack = await ipc_client.send_command(cmd_dict)
                except IonIPCError as exc:
                    self._state.transition(tab_id, domain, flow_name, IonFlowState.ERROR)
                    return IonExecutionResult(
                        success=False, site=site, flow=flow_name,
                        commands_sent=commands_sent,
                        error=f"IPC error after {commands_sent} commands: {exc}",
                    )

                commands_sent += 1

                if ack.get("status") == "error":
                    detail = ack.get("detail", "unknown error")
                    self._state.transition(tab_id, domain, flow_name, IonFlowState.ERROR)
                    return IonExecutionResult(
                        success=False, site=site, flow=flow_name,
                        commands_sent=commands_sent,
                        error=f"Synapse rejected command: {detail}",
                    )

        except Exception as exc:
            self._state.transition(tab_id, domain, flow_name, IonFlowState.ERROR)
            logger.exception("IonPump: unexpected error executing '%s/%s'", site, flow_name)
            return IonExecutionResult(
                success=False, site=site, flow=flow_name,
                commands_sent=commands_sent,
                error=f"Unexpected error: {exc}",
            )

        self._state.transition(tab_id, domain, flow_name, IonFlowState.COMPLETED)
        return IonExecutionResult(
            success=True, site=site, flow=flow_name,
            commands_sent=commands_sent,
        )

    # ------------------------------------------------------------------
    # Event handling
    # ------------------------------------------------------------------

    async def handle_event(self, event: str, tab_id: int, domain: str) -> None:
        """
        Register a browser/DOM event in IonStateManager.
        If the context was WAITING_EVENT, transition it back to EXECUTING.
        """
        self._state.receive_event(tab_id, domain, event)

        ctx = self._state.get_or_create(tab_id, domain)
        if ctx.state == IonFlowState.WAITING_EVENT and ctx.current_flow:
            self._state.transition(
                tab_id, domain, ctx.current_flow, IonFlowState.EXECUTING
            )
            logger.debug(
                "IonPump: event '%s' unblocked flow '%s' on tab %d",
                event, ctx.current_flow, tab_id,
            )

    # ------------------------------------------------------------------
    # Registry accessors
    # ------------------------------------------------------------------

    def list_sites(self) -> list[str]:
        return self._registry.list_sites()

    def get_manifest(self, site: str) -> Optional[IonManifest]:
        return self._registry.get_manifest(site)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _get_or_create_ipc_client(self, launch_id: str) -> IonPumpIPCClient:
        if launch_id not in self._ipc_clients:
            self._ipc_clients[launch_id] = IonPumpIPCClient(
                launch_id=launch_id, run_dir=self._run_dir
            )
        return self._ipc_clients[launch_id]
