"""
Logic layer for profile management.
Synapse handlers, Chrome resolution, and profile storage.
"""

from .profile_store import ProfileStore
from .chrome_resolver import ChromeResolver
from .synapse_handler import SynapseHandler

__all__ = ['ProfileStore', 'ChromeResolver', 'SynapseHandler']