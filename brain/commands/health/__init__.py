"""
Health check commands package.
Contains commands for verifying system health and component status.

Available commands:
- full-stack: Complete stack health verification
- onboarding-status: Onboarding completion status
- websocket-status: WebSocket server connectivity
"""

from .full_stack import HealthFullStackCommand
from .onboarding_status import HealthOnboardingStatusCommand
from .websocket_status import HealthWebSocketStatusCommand

__all__ = [
    'HealthFullStackCommand',
    'HealthOnboardingStatusCommand',
    'HealthWebSocketStatusCommand'
]

# Command metadata for discovery
COMMANDS = [
    HealthFullStackCommand,
    HealthOnboardingStatusCommand,
    HealthWebSocketStatusCommand
]

# Category information
CATEGORY_NAME = "health"
CATEGORY_DESCRIPTION = "System health checks and diagnostics"
COMMAND_COUNT = len(COMMANDS)