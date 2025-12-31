"""
Health check commands package.
Contains commands for verifying system health and component status.

Available commands:
- full-stack: Complete stack health verification
- onboarding-check: Onboarding completion status check (aggregated)
- websocket-status: WebSocket server connectivity
"""

from .full_stack import HealthFullStackCommand
from .onboarding_check import HealthOnboardingCheckCommand  
from .websocket_status import HealthWebSocketStatusCommand

__all__ = [
    'HealthFullStackCommand',
    'HealthOnboardingCheckCommand',  # ✅ Y aquí
    'HealthWebSocketStatusCommand'
]

# Command metadata for discovery
COMMANDS = [
    HealthFullStackCommand,
    HealthOnboardingCheckCommand,  # ✅ Y aquí
    HealthWebSocketStatusCommand
]

# Category information
CATEGORY_NAME = "health"
CATEGORY_DESCRIPTION = "System health checks and diagnostics"
COMMAND_COUNT = len(COMMANDS)