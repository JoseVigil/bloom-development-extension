"""
Health category commands.
System health checks and diagnostics.
"""

from brain.cli.base import BaseCommand
from .full_stack import HealthFullStackCommand
from .websocket_status import HealthWebSocketStatusCommand
from .onboarding_status import HealthOnboardingStatusCommand
from .dev_check import HealthDevCheckCommand
from .native_ping import HealthNativePingCommand  

__all__ = [
    'HealthFullStackCommand',
    'HealthWebSocketStatusCommand',
    'HealthOnboardingStatusCommand',
    'HealthDevCheckCommand',
    'HealthNativePingCommand',  
]


def get_health_commands() -> list[BaseCommand]:
    """
    Returns all health category commands.
    
    Returns:
        List of instantiated health command objects
    """
    return [
        HealthFullStackCommand(),
        HealthWebSocketStatusCommand(),
        HealthOnboardingStatusCommand(),
        HealthDevCheckCommand(),
        HealthNativePingCommand(),  
    ]