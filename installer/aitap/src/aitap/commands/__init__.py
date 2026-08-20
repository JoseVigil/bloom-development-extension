"""
Registro de comandos de AITap.

v1: registro explicito (sin auto-discovery/importlib walking) dado el numero
chico de comandos. Cuando crezca (rotacion real, cost-based routing, etc.)
migrar a un command_loader.py con auto-discovery, siguiendo el patron de
brain/cli/command_loader.py.
"""
from aitap.cli.registry import CommandRegistry
from aitap.commands.keys.keys_list import KeysListCommand
from aitap.commands.route.route_status import RouteStatusCommand
from aitap.commands.route.route_decide import RouteDecideCommand
from aitap.commands.system.status import StatusCommand
from aitap.commands.system.version import VersionCommand


def discover_commands() -> CommandRegistry:
    registry = CommandRegistry()
    for command_cls in (VersionCommand, StatusCommand, KeysListCommand, RouteStatusCommand, RouteDecideCommand):
        registry.register(command_cls())
    return registry
