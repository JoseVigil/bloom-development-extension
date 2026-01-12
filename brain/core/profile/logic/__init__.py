"""
Logic layer for profile management.
Synapse handlers, Chrome launching, and profile storage.
"""

from brain.core.profile.logic.synapse_handler import SynapseHandler
from brain.core.profile.logic.chrome_launcher import ChromeLauncher
from brain.core.profile.logic.profile_store import ProfileStore

__all__ = ['SynapseHandler', 'ChromeLauncher', 'ProfileStore']