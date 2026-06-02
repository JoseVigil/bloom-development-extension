# brain/core/ionpump/ionpump_manager.py
#
# Orquestador central de IonPump v2.0.
#
# CHANGELOG respecto a v4:
#   - execute_flow() → execute_action() con firma v5:
#       execute_action(site, action_name, tab_id, launch_id, context)
#   - get_manifest() preservado, retorna IonManifest.
#   - get_package() nuevo — retorna IonSitePackage completo.
#   - quiesce_site() nuevo — alineado con QuiesceResult de Metamorph Go.
#   - reload_site() nuevo — alineado con ReloadResult de Metamorph Go.
#   - IonExecutor recibe loader para lazy-load de fragments.

import asyncio
import logging
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional

from brain.core.ionpump.ionpump_executor import IonExecutor
from brain.core.ionpump.ionpump_ipc import IonIPCError, IonPumpIPCClient
from brain.core.ionpump.ionpump_loader import IonLoadError, IonLoader, IonNotFoundError
from brain.core.ionpump.ionpump_models import (
    IonExecutionResult,
    IonManifest,
    IonRecipeStatus,
    IonSitePackage,
)
from brain.core.ionpump.ionpump_registry import IonRegistry
from brain.core.ionpump.ionpump_state import IonFlowState, IonStateManager
from brain.core.ionpump.ionpump_validator import IonValidator

logger = logging.getLogger(__name__)


class IonPumpManager:
    """
    Orquestador central de IonPump. Singleton dentro de Brain.

    Responsabilidades:
    - Bootstrap: escanear ionsites/, iniciar watchdog.
    - Ejecutar actions: lazy-load, resolver requires[], enviar comandos via IPC.
    - Manejar eventos: registrar eventos DOM/browser en IonStateManager.
    - quiesce_site() / reload_site(): contratos Metamorph Go (§9).
    """

    def __init__(self, ionsites_path: str, run_dir: Path) -> None:
        self._run_dir   = run_dir
        self._registry  = IonRegistry()
        self._loader    = IonLoader(ionsites_path, self._registry)
        self._validator = IonValidator()
        self._state     = IonStateManager()
        self._executor  = IonExecutor(self._state, loader=self._loader)

        # IPC clients por launch_id
        self._ipc_clients: Dict[str, IonPumpIPCClient] = {}

        # Quiesce state: sites pausados + tracking de flows activos
        self._quiesced_sites: set  = set()
        self._active_flows_lock    = threading.Lock()
        self._active_flows: Dict[str, int] = {}  # site → count de flows activos

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def initialize(self) -> None:
        """
        Llamado al startup de Brain.
        1. Escanea ionsites/ → popula el registry (crea el dir si no existe).
        2. Inicia el watchdog de filesystem.
        3. Loguea el resumen de readiness.
        """
        count = self._loader.discover_all()
        self._loader.start_watchdog()
        logger.info("IonPump ready. %d sites registered.", count)

    def shutdown(self) -> None:
        """Detiene el watchdog de forma graceful."""
        self._loader.stop_watchdog()

    # ------------------------------------------------------------------
    # Action execution (nueva API v5)
    # ------------------------------------------------------------------

    async def execute_action(
        self,
        site: str,
        action_name: str,
        tab_id: int,
        launch_id: str,
        context: Dict[str, Any],
    ) -> IonExecutionResult:
        """
        Ejecuta un action named para un site.

        Pasos:
        1. Verificar que el site está registrado; lazy-load si no.
        2. Verificar que el site no está quiesced.
        3. Verificar que el action existe en el manifest.
        4. Obtener o crear el IPC client para este launch_id.
        5. Iterar el async generator del executor — enviar cada SynapseCommand, esperar ACK.
        6. Retornar IonExecutionResult.
        """
        domain = site

        # 1. Obtener paquete (cargar si no está en registry)
        package = self._registry.get_package(site)
        if package is None:
            # Intentar cargar bajo demanda
            from pathlib import Path as _Path
            site_dir = _Path(self._loader._ionsites) / site
            if site_dir.exists():
                try:
                    package = self._loader.load_site(site_dir)
                    self._registry.register_package(site, package)
                except IonLoadError as exc:
                    return IonExecutionResult(
                        success=False, site=site, action=action_name,
                        commands_sent=0,
                        error=f"Failed to load site '{site}': {exc.status} — {exc.detail}",
                    )
            else:
                return IonExecutionResult(
                    success=False, site=site, action=action_name,
                    commands_sent=0,
                    error=f"Site '{site}' is not registered and directory not found.",
                )

        # 2. Verificar quiesce
        if site in self._quiesced_sites:
            return IonExecutionResult(
                success=False, site=site, action=action_name,
                commands_sent=0,
                error=f"Site '{site}' is quiesced — rejecting new actions.",
            )

        # 3. Verificar que el action existe en el manifest
        if action_name not in package.manifest.actions:
            return IonExecutionResult(
                success=False, site=site, action=action_name,
                commands_sent=0,
                error=f"Action '{action_name}' not declared in manifest for '{site}'.",
            )

        # 4. IPC client
        ipc_client = self._get_or_create_ipc_client(launch_id)

        # 5. Transición de estado + tracking de flows activos
        self._state.transition(tab_id, domain, action_name, IonFlowState.EXECUTING)
        self._increment_active_flows(site)

        commands_sent = 0
        try:
            async for synapse_cmd in self._executor.execute_action(
                package, action_name, tab_id, launch_id, context
            ):
                cmd_dict = {
                    "type":   synapse_cmd.command,
                    "tab_id": synapse_cmd.tab_id,
                    **synapse_cmd.params,
                }
                try:
                    ack = await ipc_client.send_command(cmd_dict)
                except IonIPCError as exc:
                    self._state.transition(tab_id, domain, action_name, IonFlowState.ERROR)
                    return IonExecutionResult(
                        success=False, site=site, action=action_name,
                        commands_sent=commands_sent,
                        error=f"IPC error after {commands_sent} commands: {exc}",
                    )

                commands_sent += 1

                if ack.get("status") == "error":
                    detail = ack.get("detail", "unknown error")
                    self._state.transition(tab_id, domain, action_name, IonFlowState.ERROR)
                    return IonExecutionResult(
                        success=False, site=site, action=action_name,
                        commands_sent=commands_sent,
                        error=f"Synapse rejected command: {detail}",
                    )

                # Registrar evento si el comando fue EVENT_EMIT
                if synapse_cmd.command == "EVENT_EMIT":
                    event_name = synapse_cmd.params.get("event", "")
                    if event_name:
                        self._state.receive_event(tab_id, domain, event_name)

        except Exception as exc:
            self._state.transition(tab_id, domain, action_name, IonFlowState.ERROR)
            logger.exception(
                "IonPump: unexpected error executing '%s/%s'", site, action_name
            )
            return IonExecutionResult(
                success=False, site=site, action=action_name,
                commands_sent=commands_sent,
                error=f"Unexpected error: {exc}",
            )
        finally:
            self._decrement_active_flows(site)

        self._state.transition(tab_id, domain, action_name, IonFlowState.COMPLETED)
        return IonExecutionResult(
            success=True, site=site, action=action_name,
            commands_sent=commands_sent,
        )

    # ------------------------------------------------------------------
    # Metamorph IonPumpClient contract (§9 de metamorph-ionpump-state.md)
    # ------------------------------------------------------------------

    async def quiesce_site(self, site: str, timeout_ms: int = 10_000) -> Dict[str, Any]:
        """
        Detiene la aceptación de nuevos actions para un site.
        Espera a que los flows activos completen (o timeout).

        Respuesta alineada con QuiesceResult de Metamorph Go:
          {"status": "quiesced" | "timeout", "active_flows": N}
        """
        self._quiesced_sites.add(site)
        logger.info("IonPump: quiescing site '%s' (timeout=%dms)", site, timeout_ms)

        # Esperar a que active_flows llegue a 0
        deadline = asyncio.get_event_loop().time() + timeout_ms / 1000.0
        while True:
            active = self._active_flows.get(site, 0)
            if active <= 0:
                logger.info("IonPump: site '%s' quiesced (0 active flows)", site)
                return {"status": "quiesced", "active_flows": 0}

            remaining = deadline - asyncio.get_event_loop().time()
            if remaining <= 0:
                logger.warning(
                    "IonPump: quiesce timeout for '%s' — %d active flows remaining",
                    site, active,
                )
                return {"status": "timeout", "active_flows": active}

            await asyncio.sleep(0.1)

    async def reload_site(self, site: str, version: str) -> Dict[str, Any]:
        """
        Recarga el paquete Ion desde disco (llamado por Metamorph post-swap).
        Desquiesce el site después de recargar exitosamente.

        Respuesta alineada con ReloadResult de Metamorph Go:
          {"status": "reloaded" | "error", "version": "...", "error": "..."}
        """
        from pathlib import Path as _Path
        site_dir = _Path(self._loader._ionsites) / site

        try:
            package = self._loader.load_site(site_dir)
            self._registry.register_package(site, package)
            # Desquiesce — el site vuelve a aceptar actions
            self._quiesced_sites.discard(site)
            logger.info(
                "IonPump: reloaded site '%s' v%s", site, package.manifest.version
            )
            return {
                "status":  "reloaded",
                "version": package.manifest.version,
            }
        except IonLoadError as exc:
            logger.error(
                "IonPump: failed to reload site '%s': %s — %s", site, exc.status, exc.detail
            )
            return {
                "status":  "error",
                "version": version,
                "error":   f"{exc.status}: {exc.detail}",
            }
        except Exception as exc:
            logger.exception("IonPump: unexpected error reloading site '%s'", site)
            return {
                "status":  "error",
                "version": version,
                "error":   str(exc),
            }

    # ------------------------------------------------------------------
    # Event handling
    # ------------------------------------------------------------------

    async def handle_event(self, event: str, tab_id: int, domain: str) -> None:
        """
        Registra un evento de browser/DOM en IonStateManager.
        Si el contexto estaba WAITING_EVENT, lo transiciona de vuelta a EXECUTING.
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

    def list_sites(self) -> List[str]:
        return self._registry.list_sites()

    def get_manifest(self, site: str) -> Optional[IonManifest]:
        return self._registry.get_manifest(site)

    def get_package(self, site: str) -> Optional[IonSitePackage]:
        return self._registry.get_package(site)

    # ------------------------------------------------------------------
    # Active flow tracking (para quiesce)
    # ------------------------------------------------------------------

    def _increment_active_flows(self, site: str) -> None:
        with self._active_flows_lock:
            self._active_flows[site] = self._active_flows.get(site, 0) + 1

    def _decrement_active_flows(self, site: str) -> None:
        with self._active_flows_lock:
            current = self._active_flows.get(site, 0)
            self._active_flows[site] = max(0, current - 1)

    # ------------------------------------------------------------------
    # IPC client cache
    # ------------------------------------------------------------------

    def _get_or_create_ipc_client(self, launch_id: str) -> IonPumpIPCClient:
        if launch_id not in self._ipc_clients:
            self._ipc_clients[launch_id] = IonPumpIPCClient(
                launch_id=launch_id, run_dir=self._run_dir
            )
        return self._ipc_clients[launch_id]
