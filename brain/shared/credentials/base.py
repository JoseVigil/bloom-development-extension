"""
Base classes for multi-provider API key management.

This module provides the foundation for managing API keys across different
AI providers (Gemini, Claude, OpenAI, xAI) with unified interfaces.
"""

import hashlib
import keyring
import json
from abc import ABC, abstractmethod
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from enum import Enum


class ProviderType(Enum):
    """Supported AI providers."""
    GEMINI = "gemini"
    CLAUDE = "claude"
    OPENAI = "openai"
    XAI = "xai"


@dataclass
class APIKeyInfo:
    """Base metadata for an API key."""
    provider: str
    profile_name: str
    total_quota: int
    used_quota: int = 0
    quota_unit: str = "tokens"
    last_reset: str = ""
    is_active: bool = True
    priority: int = 0
    consecutive_errors: int = 0
    created_at: str = ""
    last_used: Optional[str] = None
    validation_endpoint: str = ""
    
    def __post_init__(self):
        if not self.last_reset:
            self.last_reset = datetime.now(timezone.utc).isoformat()
        if not self.created_at:
            self.created_at = datetime.now(timezone.utc).isoformat()
    
    @property
    def available_quota(self) -> int:
        """Quota remaining."""
        return max(0, self.total_quota - self.used_quota)
    
    @property
    def usage_percentage(self) -> float:
        """Percentage of quota used."""
        if self.total_quota == 0:
            return 0.0
        return (self.used_quota / self.total_quota) * 100
    
    @property
    def is_exhausted(self) -> bool:
        """Check if quota exhausted."""
        return self.available_quota < 10_000
    
    @property
    def fingerprint(self) -> str:
        """SHA256 hash for ownership tracking."""
        return hashlib.sha256(
            f"{self.provider}:{self.profile_name}".encode()
        ).hexdigest()[:16]
    
    def needs_reset(self) -> bool:
        """Check if needs quota reset (24h cycle)."""
        last_reset_dt = datetime.fromisoformat(self.last_reset)
        now = datetime.now(timezone.utc)
        return (now - last_reset_dt).total_seconds() > 86400


class BaseKeyManager(ABC):
    """Abstract base class for provider-specific key managers."""
    
    SERVICE_NAME = "bloom-brain"
    
    # Subclasses must define these
    PROVIDER: ProviderType = None
    KEY_PREFIX: str = None
    DEFAULT_QUOTA: int = None
    QUOTA_UNIT: str = "tokens"
    VALIDATION_ENDPOINT: str = None
    
    def __init__(self):
        if not self.PROVIDER or not self.KEY_PREFIX or not self.DEFAULT_QUOTA:
            raise NotImplementedError("Subclass must define PROVIDER, KEY_PREFIX, DEFAULT_QUOTA")
    
    def add_key(self, profile_name: str, api_key: str, priority: int = 0) -> None:
        """Add new API key with profile."""
        # Validate key format
        if not self._validate_key_format(api_key):
            raise ValueError(f"Invalid {self.PROVIDER.value} API key format")
        
        profiles = self._load_profiles()
        
        if profile_name in profiles:
            raise ValueError(f"Profile '{profile_name}' already exists")
        
        # Create profile info
        info = self._create_key_info(profile_name, priority)
        profiles[profile_name] = info
        
        # Save metadata
        self._save_profiles(profiles)
        
        # Save API key to keyring
        key_id = f"{self.KEY_PREFIX}:{profile_name}"
        keyring.set_password(self.SERVICE_NAME, key_id, api_key)
    
    def get_key(self, profile_name: str) -> tuple[str, APIKeyInfo]:
        """Get API key and its metadata."""
        profiles = self._load_profiles()
        
        if profile_name not in profiles:
            raise ValueError(f"Profile '{profile_name}' not found")
        
        info = profiles[profile_name]
        
        if not info.is_active:
            raise ValueError(f"Profile '{profile_name}' is disabled")
        
        # Load API key
        key_id = f"{self.KEY_PREFIX}:{profile_name}"
        api_key = keyring.get_password(self.SERVICE_NAME, key_id)
        
        if not api_key:
            raise ValueError(f"API key not found for profile '{profile_name}'")
        
        return api_key, info
    
    def select_key(self) -> tuple[str, str]:
        """Select best available key based on quota/priority."""
        profiles = self._load_profiles()
        
        if not profiles:
            raise ValueError(f"No {self.PROVIDER.value} keys configured")
        
        # Auto-reset quotas if needed
        self._auto_reset_quotas(profiles)
        
        # Filter active keys with available quota
        valid_keys = [
            (name, info) for name, info in profiles.items()
            if info.is_active and not info.is_exhausted
        ]
        
        if not valid_keys:
            raise ValueError(f"No available {self.PROVIDER.value} keys with quota")
        
        # Select by priority then available quota
        selected_name, selected_info = max(
            valid_keys, 
            key=lambda x: (x[1].priority, x[1].available_quota)
        )
        
        # Load API key
        key_id = f"{self.KEY_PREFIX}:{selected_name}"
        api_key = keyring.get_password(self.SERVICE_NAME, key_id)
        
        if not api_key:
            raise ValueError(f"API key not found for profile '{selected_name}'")
        
        return selected_name, api_key
    
    def report_usage(self, profile_name: str, quota_used: int, success: bool = True):
        """Report quota usage for a key."""
        profiles = self._load_profiles()
        
        if profile_name not in profiles:
            return
        
        info = profiles[profile_name]
        
        if success:
            info.used_quota += quota_used
            info.last_used = datetime.now(timezone.utc).isoformat()
            info.consecutive_errors = 0
        else:
            info.consecutive_errors += 1
            if info.consecutive_errors >= 3:
                info.is_active = False
        
        self._save_profiles(profiles)
    
    def list_keys(self) -> Dict[str, APIKeyInfo]:
        """List all registered keys with metadata."""
        return self._load_profiles()
    
    def delete_key(self, profile_name: str) -> None:
        """Delete a key profile."""
        profiles = self._load_profiles()
        
        if profile_name not in profiles:
            raise ValueError(f"Profile '{profile_name}' not found")
        
        # Delete from profiles
        del profiles[profile_name]
        self._save_profiles(profiles)
        
        # Delete API key from keyring
        key_id = f"{self.KEY_PREFIX}:{profile_name}"
        try:
            keyring.delete_password(self.SERVICE_NAME, key_id)
        except:
            pass
    
    def set_active(self, profile_name: str, active: bool) -> None:
        """Enable or disable a key."""
        profiles = self._load_profiles()
        
        if profile_name not in profiles:
            raise ValueError(f"Profile '{profile_name}' not found")
        
        profiles[profile_name].is_active = active
        self._save_profiles(profiles)
    
    def set_priority(self, profile_name: str, priority: int) -> None:
        """Set key priority."""
        profiles = self._load_profiles()
        
        if profile_name not in profiles:
            raise ValueError(f"Profile '{profile_name}' not found")
        
        profiles[profile_name].priority = priority
        self._save_profiles(profiles)
    
    def get_stats(self) -> Dict[str, Any]:
        """Get provider statistics."""
        profiles = self._load_profiles()
        
        if not profiles:
            return {
                "total_keys": 0,
                "active_keys": 0,
                "total_quota": 0,
                "used_quota": 0,
                "available_quota": 0,
                "usage_percentage": 0.0,
                "provider": self.PROVIDER.value
            }
        
        active_profiles = [p for p in profiles.values() if p.is_active]
        total_quota = sum(p.total_quota for p in profiles.values())
        used_quota = sum(p.used_quota for p in profiles.values())
        
        return {
            "total_keys": len(profiles),
            "active_keys": len(active_profiles),
            "total_quota": total_quota,
            "used_quota": used_quota,
            "available_quota": total_quota - used_quota,
            "usage_percentage": round((used_quota / total_quota) * 100, 1) if total_quota > 0 else 0.0,
            "provider": self.PROVIDER.value
        }
    
    @abstractmethod
    def validate_key(self, profile_name: str) -> Dict[str, Any]:
        """Validate key by making test API call. Must be implemented by subclass."""
        pass
    
    @abstractmethod
    def _validate_key_format(self, api_key: str) -> bool:
        """Validate key format. Must be implemented by subclass."""
        pass
    
    def _create_key_info(self, profile_name: str, priority: int) -> APIKeyInfo:
        """Create APIKeyInfo instance with provider-specific defaults."""
        return APIKeyInfo(
            provider=self.PROVIDER.value,
            profile_name=profile_name,
            total_quota=self.DEFAULT_QUOTA,
            quota_unit=self.QUOTA_UNIT,
            priority=priority,
            validation_endpoint=self.VALIDATION_ENDPOINT or ""
        )
    
    def _load_profiles(self) -> Dict[str, APIKeyInfo]:
        """Load profiles from keyring."""
        metadata_key = f"{self.PROVIDER.value}-profiles"
        
        try:
            data = keyring.get_password(self.SERVICE_NAME, metadata_key)
            if not data:
                return {}
            
            profiles_dict = json.loads(data)
            return {
                name: APIKeyInfo(**info)
                for name, info in profiles_dict.items()
            }
        except Exception:
            return {}
    
    def _save_profiles(self, profiles: Dict[str, APIKeyInfo]):
        """Save profiles to keyring."""
        metadata_key = f"{self.PROVIDER.value}-profiles"
        
        profiles_dict = {
            name: asdict(info)
            for name, info in profiles.items()
        }
        data = json.dumps(profiles_dict)
        keyring.set_password(self.SERVICE_NAME, metadata_key, data)
    
    def _auto_reset_quotas(self, profiles: Dict[str, APIKeyInfo]):
        """Auto-reset quotas after 24h."""
        now = datetime.now(timezone.utc)
        updated = False
        
        for name, info in profiles.items():
            if info.needs_reset():
                info.used_quota = 0
                info.last_reset = now.isoformat()
                info.consecutive_errors = 0
                info.is_active = True
                updated = True
        
        if updated:
            self._save_profiles(profiles)
