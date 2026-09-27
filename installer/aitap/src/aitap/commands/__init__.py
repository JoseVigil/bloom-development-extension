"""
Registro de comandos de AITap.

Registro explicito (sin auto-discovery). Un comando que no figure en
discover_commands() no existe para el CLI ni para la ayuda generada.
El orden define la presentacion de la ayuda dentro de cada categoria.
"""
from aitap.cli.registry import CommandRegistry
from aitap.commands.accounting.usage import AccountingUsageCommand
from aitap.commands.health.check import HealthCheckCommand
from aitap.commands.keys.keys_list import KeysListCommand
from aitap.commands.local.preflight import LocalPreflightCommand
from aitap.commands.route.intelligence_supply import IntelligenceSupplyCommand
from aitap.commands.route.policy import RoutePolicyCommand
from aitap.commands.route.route_decide import RouteDecideCommand
from aitap.commands.system.info import InfoCommand
from aitap.commands.system.status import StatusCommand
from aitap.commands.system.version import VersionCommand

COMMAND_CLASSES = (
    # SYSTEM
    VersionCommand, InfoCommand, StatusCommand,
    # HEALTH
    HealthCheckCommand,
    # KEYS
    KeysListCommand,
    # ROUTE
    RouteDecideCommand, IntelligenceSupplyCommand, RoutePolicyCommand,
    # ACCOUNTING
    AccountingUsageCommand,
    # LOCAL
    LocalPreflightCommand,
)


def discover_commands() -> CommandRegistry:
    registry = CommandRegistry()
    for command_cls in COMMAND_CLASSES:
        registry.register(command_cls())
    return registry
