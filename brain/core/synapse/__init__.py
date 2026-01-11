"""
Synapse Core Package.
Native Messaging Protocol & Logic.
"""

from .synapse_protocol import SynapseProtocol
from .synapse_manager import SynapseManager
from .synapse_exceptions import SynapseError, SynapseConnectionError

__all__ = [
    "SynapseProtocol",
    "SynapseManager",
    "SynapseError",
    "SynapseConnectionError"
]