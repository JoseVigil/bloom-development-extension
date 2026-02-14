"""
Unified credential management system for Bloom.

Supports multiple AI providers with secure system keyring storage.
"""

from .base import (
    ProviderType,
    APIKeyInfo,
    BaseKeyManager
)

from .claude_manager import ClaudeKeyManager
from .openai_manager import OpenAIKeyManager
from .xai_manager import XAIKeyManager

from .unified_manager import (
    UnifiedCredentialManager,
    get_provider_manager
)

# Legacy Gemini support (maintain backward compatibility)
try:
    from .gemini_manager import GeminiKeyManager
except ImportError:
    # If gemini_manager doesn't exist yet, skip
    pass


__all__ = [
    # Core classes
    'ProviderType',
    'APIKeyInfo',
    'BaseKeyManager',
    
    # Provider managers
    'ClaudeKeyManager',
    'OpenAIKeyManager',
    'XAIKeyManager',
    
    # Unified interface
    'UnifiedCredentialManager',
    'get_provider_manager',
]

__version__ = '2.0.0'
