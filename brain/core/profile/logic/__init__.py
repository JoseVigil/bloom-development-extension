"""
Logic layer for profile management.
Synapse handlers, Chrome resolution, and profile storage.
"""

from brain.core.profile.logic.synapse_handler import SynapseHandler
from brain.core.profile.logic.chrome_resolver import ChromeResolver
from brain.core.profile.logic.profile_store import ProfileStore

__all__ = ['SynapseHandler', 'ChromeResolver', 'ProfileStore']