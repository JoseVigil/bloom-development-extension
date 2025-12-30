"""
Extension commands package - Chrome extension lifecycle management
"""

import typer
from brain.commands.extension.install import InstallCommand
from brain.commands.extension.verify import VerifyCommand
from brain.commands.extension.update import UpdateCommand
from brain.commands.extension.backups import BackupsCommand


def register_commands(app: typer.Typer) -> None:
    """
    Register all extension commands with the app.
    
    Args:
        app: Typer application instance
    """
    # Create extension subapp
    extension_app = typer.Typer(
        help="Chrome extension lifecycle management",
        no_args_is_help=True
    )
    
    # Register individual commands
    InstallCommand().register(extension_app)
    VerifyCommand().register(extension_app)
    UpdateCommand().register(extension_app)
    BackupsCommand().register(extension_app)
    
    # Add to main app
    app.add_typer(extension_app, name="extension")