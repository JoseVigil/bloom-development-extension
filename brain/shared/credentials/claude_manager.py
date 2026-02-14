"""
Claude API key manager with Anthropic API integration.
"""

import re
import requests
from typing import Dict, Any
from .base import BaseKeyManager, ProviderType


class ClaudeKeyManager(BaseKeyManager):
    """Manager for Claude (Anthropic) API keys."""
    
    PROVIDER = ProviderType.CLAUDE
    KEY_PREFIX = "claude-key"
    DEFAULT_QUOTA = 100_000  # Tokens per day (depends on plan)
    QUOTA_UNIT = "tokens"
    VALIDATION_ENDPOINT = "https://api.anthropic.com/v1/messages"
    
    # Claude key format: sk-ant-api03-[base64-like string]
    KEY_PATTERN = re.compile(r'^sk-ant-api\d{2}-[A-Za-z0-9_-]{95,}$')
    
    def _validate_key_format(self, api_key: str) -> bool:
        """Validate Claude API key format."""
        return bool(self.KEY_PATTERN.match(api_key))
    
    def validate_key(self, profile_name: str) -> Dict[str, Any]:
        """
        Validate key by making test API call to Anthropic.
        
        Returns:
            dict with validation results
        """
        profiles = self._load_profiles()
        
        if profile_name not in profiles:
            raise ValueError(f"Profile '{profile_name}' not found")
        
        api_key, info = self.get_key(profile_name)
        
        try:
            # Test call to Claude API
            response = requests.post(
                self.VALIDATION_ENDPOINT,
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json"
                },
                json={
                    "model": "claude-sonnet-4-20250514",
                    "max_tokens": 10,
                    "messages": [
                        {"role": "user", "content": "ping"}
                    ]
                },
                timeout=10
            )
            
            if response.status_code == 200:
                return {
                    "valid": True,
                    "provider": "claude",
                    "profile": profile_name,
                    "model": "claude-sonnet-4-20250514",
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
