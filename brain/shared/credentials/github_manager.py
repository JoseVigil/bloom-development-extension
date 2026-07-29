"""
GitHub credential management for Bloom.

Migrado desde brain/shared/credentials.py (archivo suelto, ahora eliminado
por colisión de nombre con este paquete) hacia brain/shared/credentials/
como parte del merge de packages. Contenido sin cambios funcionales.
"""

from .vault import CredentialManager


class GitHubCredentials:
    """GitHub token management."""

    def __init__(self):
        self._manager = CredentialManager()
        self.key_name = "github-token"
        self.env_var = "BLOOM_GITHUB_TOKEN"

    def get_token(self) -> str:
        """Get GitHub token."""
        token = self._manager.get_credential(self.key_name, self.env_var)
        # Validate GitHub token format
        if not any(token.startswith(p) for p in ["ghp_", "gho_", "ghs_", "ghu_"]):
            raise ValueError("Invalid GitHub token format")
        return token

    def save_token(self, token: str) -> None:
        """Save GitHub token."""
        if not any(token.startswith(p) for p in ["ghp_", "gho_", "ghs_", "ghu_"]):
            raise ValueError("Invalid token format. GitHub tokens start with ghp_, gho_, ghs_, or ghu_")
        self._manager.save_credential(self.key_name, token)

    def delete_token(self) -> None:
        """Delete GitHub token."""
        self._manager.delete_credential(self.key_name)

    def has_token(self) -> bool:
        """Check if token exists."""
        return self._manager.has_credential(self.key_name, self.env_var)

    def get_token_source(self) -> str:
        """Get token source."""
        return self._manager.get_source(self.key_name, self.env_var)
