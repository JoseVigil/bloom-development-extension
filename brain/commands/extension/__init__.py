"""
Extension commands package - Chrome extension lifecycle management
"""

# Import all command classes for auto-discovery
from brain.commands.extension.install import InstallCommand
from brain.commands.extension.verify import VerifyCommand
from brain.commands.extension.update import UpdateCommand
from brain.commands.extension.backups import BackupsCommand

# Export for auto-discovery system
__all__ = [
    'InstallCommand',
    'VerifyCommand', 
    'UpdateCommand',
    'BackupsCommand'
]

# List of all command instances for registration
COMMANDS = [
    InstallCommand(),
    VerifyCommand(),
    UpdateCommand(),
    BackupsCommand()
]