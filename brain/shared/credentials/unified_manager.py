"""
Unified credential manager for all AI providers.
"""

from typing import Dict, Any, Optional
from .base import ProviderType, APIKeyInfo, BaseKeyManager
from .claude_manager import ClaudeKeyManager
from .openai_manager import OpenAIKeyManager
from .xai_manager import XAIKeyManager


class UnifiedCredentialManager:
    """
    Central manager for all AI provider API keys.
    Provides unified interface for multi-provider operations.
    """
    
    def __init__(self):
        self._managers: Dict[ProviderType, BaseKeyManager] = {
            ProviderType.CLAUDE: ClaudeKeyManager(),
            ProviderType.OPENAI: OpenAIKeyManager(),
            ProviderType.XAI: XAIKeyManager()
        }
    
    def get_manager(self, provider: str) -> BaseKeyManager:
        """Get manager for specific provider."""
        try:
            provider_type = ProviderType(provider.lower())
            return self._managers[provider_type]
        except (ValueError, KeyError):
            raise ValueError(f"Unsupported provider: {provider}. Supported: {[p.value for p in ProviderType]}")
    
    def add_key(self, provider: str, profile_name: str, api_key: str, priority: int = 0) -> None:
        """Add API key for any provider."""
        manager = self.get_manager(provider)
        manager.add_key(profile_name, api_key, priority)
    
    def get_key(self, provider: str, profile_name: str) -> tuple[str, APIKeyInfo]:
        """Get API key and metadata for specific profile."""
        manager = self.get_manager(provider)
        return manager.get_key(profile_name)
    
    def select_key(self, provider: str) -> tuple[str, str]:
        """Select best available key for provider."""
        manager = self.get_manager(provider)
        return manager.select_key()
    
    def list_all_keys(self) -> Dict[str, Dict[str, APIKeyInfo]]:
        """
        List all keys from all providers.
        
        Returns:
            {
                "claude": {"Personal": ClaudeKeyInfo, ...},
                "openai": {"Work": OpenAIKeyInfo, ...},
                "xai": {"Grok": XAIKeyInfo, ...}
            }
        """
        result = {}
        
        for provider_type, manager in self._managers.items():
            keys = manager.list_keys()
            if keys:  # Only include providers with keys
                result[provider_type.value] = keys
        
        return result
    
    def get_all_stats(self) -> Dict[str, Any]:
        """
        Get statistics across all providers.
        
        Returns:
            {
                "claude": {...stats...},
                "openai": {...stats...},
                "xai": {...stats...},
                "total": {
                    "providers": 3,
                    "total_keys": 10,
                    "active_keys": 8
                }
            }
        """
        stats = {}
        
        for provider_type, manager in self._managers.items():
            stats[provider_type.value] = manager.get_stats()
        
        # Calculate totals
        stats["total"] = {
            "providers": len([s for s in stats.values() if s.get("total_keys", 0) > 0]),
            "total_keys": sum(s.get("total_keys", 0) for s in stats.values() if isinstance(s, dict)),
            "active_keys": sum(s.get("active_keys", 0) for s in stats.values() if isinstance(s, dict)),
            "total_quota": sum(s.get("total_quota", 0) for s in stats.values() if isinstance(s, dict)),
            "used_quota": sum(s.get("used_quota", 0) for s in stats.values() if isinstance(s, dict))
        }
        
        return stats
    
    def validate_key(self, provider: str, profile_name: str) -> Dict[str, Any]:
        """Validate API key for any provider."""
        manager = self.get_manager(provider)
        return manager.validate_key(profile_name)
    
    def delete_key(self, provider: str, profile_name: str) -> None:
        """Delete API key from any provider."""
        manager = self.get_manager(provider)
        manager.delete_key(profile_name)
    
    def report_usage(self, provider: str, profile_name: str, quota_used: int, success: bool = True):
        """Report usage for any provider."""
        manager = self.get_manager(provider)
        manager.report_usage(profile_name, quota_used, success)
    
    def detect_provider_from_key(self, api_key: str) -> Optional[str]:
        """
        Detect provider from API key format.
        
        Returns:
            Provider name if detected, None otherwise
        """
        for provider_type, manager in self._managers.items():
            if manager._validate_key_format(api_key):
                return provider_type.value
        
        return None


# Convenience function for backward compatibility
def get_provider_manager(provider: str) -> BaseKeyManager:
    """Get manager instance for specific provider."""
    manager = UnifiedCredentialManager()
    return manager.get_manager(provider)
