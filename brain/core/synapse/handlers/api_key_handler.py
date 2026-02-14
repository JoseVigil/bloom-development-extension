"""
Synapse protocol handler for API key registration.
Captures API keys from Discovery UI and stores them in Vault.
"""

import json
import hashlib
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, Optional


class APIKeyHandler:
    """
    Handles API_KEY_DETECTED events from Synapse protocol.
    Validates, stores, and tracks API keys across providers.
    """
    
    def __init__(self, synapse_protocol):
        """
        Args:
            synapse_protocol: Reference to SynapseProtocol instance
        """
        self.protocol = synapse_protocol
        self.logger = synapse_protocol.logger if hasattr(synapse_protocol, 'logger') else None
    
    def handle_api_key_detected(self, message: Dict[str, Any]) -> None:
        """
        Process API_KEY_DETECTED event from extension.
        
        Message format:
        {
            "event": "API_KEY_DETECTED",
            "provider": "claude",
            "key": "sk-ant-...",
            "timestamp": 1234567890
        }
        """
        provider = message.get('provider')
        api_key = message.get('key')
        
        if not provider or not api_key:
            self._send_error("Missing provider or key", message)
            return
        
        if self.logger:
            self.logger.info(f"[APIKeyHandler] Detected {provider} key")
        
        # 1. Validate key format and API
        validation = self._validate_key(provider, api_key)
        
        if not validation['valid']:
            self._send_error(validation['error'], message, provider)
            return
        
        # 2. Generate profile name
        profile_name = self._generate_profile_name(provider)
        
        # 3. Store in credential manager
        try:
            from brain.shared.credentials.unified_manager import UnifiedCredentialManager
            
            manager = UnifiedCredentialManager()
            manager.add_key(
                provider=provider,
                profile_name=profile_name,
                api_key=api_key,
                priority=0  # Default priority
            )
            
            if self.logger:
                self.logger.info(f"[APIKeyHandler] Key stored: {provider}:{profile_name}")
        
        except Exception as e:
            self._send_error(f"Failed to store key: {str(e)}", message, provider)
            return
        
        # 4. Register ownership fingerprint
        try:
            self._register_ownership(provider, profile_name)
        except Exception as e:
            if self.logger:
                self.logger.warning(f"[APIKeyHandler] Ownership registration failed: {e}")
        
        # 5. Notify extension of success
        self._send_success(provider, profile_name)
    
    def _validate_key(self, provider: str, api_key: str) -> Dict[str, Any]:
        """
        Validate API key format and make test API call.
        
        Returns:
            {"valid": True/False, "error": "..."}
        """
        try:
            from brain.shared.credentials.unified_manager import UnifiedCredentialManager
            
            manager = UnifiedCredentialManager()
            provider_manager = manager.get_manager(provider)
            
            # 1. Validate format
            if not provider_manager._validate_key_format(api_key):
                return {
                    "valid": False,
                    "error": f"Invalid {provider} API key format"
                }
            
            # 2. Test API call (we need to temporarily store it)
            # Create temp profile for validation
            temp_profile = f"_temp_validation_{datetime.now().timestamp()}"
            
            try:
                provider_manager.add_key(temp_profile, api_key, priority=-100)
                validation_result = provider_manager.validate_key(temp_profile)
                provider_manager.delete_key(temp_profile)
                
                return validation_result
            
            except Exception as e:
                # Clean up temp profile if it was created
                try:
                    provider_manager.delete_key(temp_profile)
                except:
                    pass
                
                return {
                    "valid": False,
                    "error": f"Validation failed: {str(e)}"
                }
        
        except Exception as e:
            return {
                "valid": False,
                "error": f"Manager error: {str(e)}"
            }
    
    def _generate_profile_name(self, provider: str) -> str:
        """
        Generate unique profile name.
        
        Format: "{Provider} - {Timestamp}"
        Example: "Claude - 2026-02-13"
        """
        now = datetime.now()
        date_str = now.strftime("%Y-%m-%d")
        time_str = now.strftime("%H:%M")
        
        return f"{provider.title()} - {date_str} {time_str}"
    
    def _register_ownership(self, provider: str, profile_name: str) -> None:
        """
        Register API key fingerprint in .ownership.json
        WITHOUT revealing the actual key.
        """
        fingerprint = hashlib.sha256(
            f"{provider}:{profile_name}".encode()
        ).hexdigest()[:16]
        
        ownership_path = Path.home() / ".bloom" / ".nucleus" / ".ownership.json"
        
        # Ensure directory exists
        ownership_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Load existing ownership
        if ownership_path.exists():
            with open(ownership_path, 'r') as f:
                ownership = json.load(f)
        else:
            ownership = {
                "version": "1.0",
                "api_keys": {}
            }
        
        # Add new entry
        ownership["api_keys"][fingerprint] = {
            "provider": provider,
            "profile_name": profile_name,
            "registered_at": datetime.utcnow().isoformat(),
            "registered_by": "master"  # TODO: Get actual role from Nucleus
        }
        
        # Save
        with open(ownership_path, 'w') as f:
            json.dump(ownership, f, indent=2)
        
        if self.logger:
            self.logger.info(f"[APIKeyHandler] Ownership registered: {fingerprint}")
    
    def _send_success(self, provider: str, profile_name: str) -> None:
        """Send success notification to extension."""
        from brain.shared.credentials.unified_manager import UnifiedCredentialManager
        
        manager = UnifiedCredentialManager()
        provider_manager = manager.get_manager(provider)
        profiles = provider_manager.list_keys()
        
        info = profiles.get(profile_name)
        
        self.protocol.send_message({
            "event": "API_KEY_REGISTERED",
            "provider": provider,
            "profile_name": profile_name,
            "fingerprint": info.fingerprint if info else "",
            "status": "success"
        })
    
    def _send_error(self, error: str, original_message: Dict[str, Any], provider: str = None) -> None:
        """Send error notification to extension."""
        self.protocol.send_message({
            "event": "API_KEY_REGISTRATION_FAILED",
            "provider": provider or original_message.get('provider'),
            "error": error,
            "status": "error"
        })


def register_handler(synapse_protocol):
    """
    Register API key handler with synapse protocol.
    Called during SynapseProtocol initialization.
    """
    handler = APIKeyHandler(synapse_protocol)
    
    # Register event handler
    synapse_protocol.register_event_handler('API_KEY_DETECTED', handler.handle_api_key_detected)
    
    return handler
