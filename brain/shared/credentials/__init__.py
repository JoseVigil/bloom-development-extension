"""
Unified credential management system for Bloom.

Supports multiple AI providers with secure system keyring storage, más
GitHub y Gemini vía nucleus vault (subprocess), migrados desde el antiguo
brain/shared/credentials.py (archivo suelto, eliminado por colisión de
nombre con este paquete — un paquete siempre gana sobre un módulo del
mismo nombre en el mismo directorio padre).
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

# Vault-based credential system (nucleus vault vía subprocess, sin keyring
# directo). Migrado desde el credentials.py suelto.
from .vault import (
    VaultClient,
    CredentialManager,
    VaultUnavailableError,
    VaultUnauthorizedError,
)

from .github_manager import GitHubCredentials

# Legacy Gemini support (maintain backward compatibility)
try:
    from .gemini_manager import (
        GeminiKeyManager,
        NoAvailableKeysError,
        GeminiAPIError,
    )
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

    # Vault-based system
    'VaultClient',
    'CredentialManager',
    'VaultUnavailableError',
    'VaultUnauthorizedError',
    'GitHubCredentials',
    'GeminiKeyManager',
    'NoAvailableKeysError',
    'GeminiAPIError',
]

__version__ = '2.1.0'
