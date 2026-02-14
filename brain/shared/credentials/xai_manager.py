"""
xAI (Grok) API key manager.
"""

import re
import requests
from typing import Dict, Any
from .base import BaseKeyManager, ProviderType


class XAIKeyManager(BaseKeyManager):
    """Manager for xAI (Grok) API keys."""
    
    PROVIDER = ProviderType.XAI
    KEY_PREFIX = "xai-key"
    DEFAULT_QUOTA = 50_000  # Tokens per day (depends on plan)
    QUOTA_UNIT = "tokens"
    VALIDATION_ENDPOINT = "https://api.x.ai/v1/models"
    
    # xAI key format: xai-[alphanumeric and hyphens]
    KEY_PATTERN = re.compile(r'^xai-[A-Za-z0-9_-]{32,}$')
    
    def _validate_key_format(self, api_key: str) -> bool:
        """Validate xAI API key format."""
        return bool(self.KEY_PATTERN.match(api_key))
    
    def validate_key(self, profile_name: str) -> Dict[str, Any]:
        """
        Validate key by making test API call to xAI.
        
        Returns:
            dict with validation results
        """
        profiles = self._load_profiles()
        
        if profile_name not in profiles:
            raise ValueError(f"Profile '{profile_name}' not found")
        
        api_key, info = self.get_key(profile_name)
        
        try:
            # Test call to xAI API - list models
            response = requests.get(
                self.VALIDATION_ENDPOINT,
                headers={
                    "Authorization": f"Bearer {api_key}"
                },
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                models = data.get('data', [])
                
                return {
                    "valid": True,
                    "provider": "xai",
                    "profile": profile_name,
                    "models_available": len(models),
                    "quota_used": info.used_quota,
                    "quota_total": info.total_quota,
                    "quota_available": info.available_quota,
                    "usage_percentage": round(info.usage_percentage, 1)
                }
            else:
                error_data = response.json() if response.headers.get('content-type', '').startswith('application/json') else {}
                error_msg = error_data.get('error', {}).get('message', f"HTTP {response.status_code}")
                
                return {
                    "valid": False,
                    "error": error_msg,
                    "status_code": response.status_code
                }
        
        except requests.exceptions.Timeout:
            return {"valid": False, "error": "Request timeout"}
        except requests.exceptions.RequestException as e:
            return {"valid": False, "error": f"Network error: {str(e)}"}
        except Exception as e:
            return {"valid": False, "error": str(e)}
