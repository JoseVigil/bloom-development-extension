"""
Synapse Core Package.
Native Messaging Protocol & Logic.
"""

from .synapse_protocol import SynapseProtocol
from .synapse_manager import SynapseManager
from .synapse_exceptions import SynapseError, ConnectionError as SynapseConnectionError
from .synapse_host_init_manager import SynapseHostInitManager

__all__ = [
    "SynapseProtocol",
    "SynapseManager",
    "SynapseError",
    "SynapseConnectionError",
    "SynapseHostInitManager",
]