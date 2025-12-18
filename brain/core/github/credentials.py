"""
GitHub Credentials Management
Handles secure token storage using system keyring.
"""

import os
from typing import Optional
import keyring


class GitHubCredentials:
    """
    Manages GitHub authentication tokens using system keyring.
    
    Storage priority:
    1. Environment variable (BRAIN_GITHUB_TOKEN) - for CI/CD
    2. System keyring (Windows Credential Manager, macOS Keychain, etc.)
    """
    
    SERVICE_NAME = "bloom-brain"
    USERNAME = "github-token"
    ENV_VAR = "BRAIN_GITHUB_TOKEN"
    
    def get_token(self) -> str:
        """
        Retrieve GitHub token.
        
        Returns:
            Token string
            
        Raises:
            ValueError: If no token found
        """
        # Priority 1: Environment variable (for CI/CD)
        env_token = os.environ.get(self.ENV_VAR)
        if env_token:
            return env_token
        
        # Priority 2: System keyring
        keyring_token = keyring.get_password(self.SERVICE_NAME, self.USERNAME)
        if keyring_token:
            return keyring_token
        
        raise ValueError(
            f"No GitHub token found. Set {self.ENV_VAR} environment variable "
            "or run: brain github auth login --token <your_token>"
        )
    
    def save_token(self, token: str) -> None:
        """
        Store GitHub token in system keyring.
        
        Args:
            token: GitHub personal access token
            
        Raises:
            ValueError: If token format is invalid
        """
        if not token or not isinstance(token, str):
            raise ValueError("Token must be a non-empty string")
        
        # Basic validation (GitHub tokens start with ghp_, gho_, etc.)
        if not any(token.startswith(prefix) for prefix in ["ghp_", "gho_", "ghs_", "ghu_"]):
            raise ValueError(
                "Invalid token format. GitHub tokens should start with ghp_, gho_, ghs_, or ghu_"
            )
        
        try:
            keyring.set_password(self.SERVICE_NAME, self.USERNAME, token)
        except Exception as e:
            raise RuntimeError(f"Failed to store token in keyring: {e}")
    
    def delete_token(self) -> None:
        """Remove token from system keyring."""
        try:
            keyring.delete_password(self.SERVICE_NAME, self.USERNAME)
        except keyring.errors.PasswordDeleteError:
            # Token doesn't exist - that's fine
            pass
        except Exception as e:
            raise RuntimeError(f"Failed to delete token: {e}")
    
    def has_token(self) -> bool:
        """Check if token exists (without retrieving it)."""
        # Check env var first
        if os.environ.get(self.ENV_VAR):
            return True
        
        # Check keyring
        try:
            token = keyring.get_password(self.SERVICE_NAME, self.USERNAME)
            return token is not None
        except Exception:
            return False
    
    def get_token_source(self) -> str:
        """
        Get the source of the current token.
        
        Returns:
            "environment", "keyring", or "none"
        """
        if os.environ.get(self.ENV_VAR):
            return "environment"
        
        try:
            if keyring.get_password(self.SERVICE_NAME, self.USERNAME):
                return "keyring"
        except Exception:
            pass
        
        return "none"