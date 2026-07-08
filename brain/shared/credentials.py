"""
Unified credential management for all API services using system keyring.

summary: Centralized credential storage with system-native security
keywords: credentials, security, api-key, keyring, vault, github, gemini, multi-key
"""

import os
import json
import shutil
import subprocess
import logging
from typing import Optional
from datetime import datetime, timezone
from enum import Enum
from dataclasses import dataclass, asdict

logger = logging.getLogger("brain.credentials.vault")


# ============================================================================
# EXCEPTIONS
# ============================================================================

class NoAvailableKeysError(Exception):
    """No Gemini keys available with sufficient quota."""
    pass


class GeminiAPIError(Exception):
    """Error calling Gemini API."""
    pass


class VaultUnavailableError(RuntimeError):
    """El binario nucleus no está en PATH, no responde, o el proceso falló
    por un motivo que no es autorización (vault locked, binario ausente,
    timeout)."""
    pass


class VaultUnauthorizedError(RuntimeError):
    """Nucleus resolvió el request pero lo denegó: rol no-Master o vault
    bloqueado. Distinto de VaultUnavailableError porque acá sí hubo
    respuesta del gate, solo que fue negativa."""
    pass


# ============================================================================
# VAULT CLIENT (subprocess → nucleus vault, v1.1)
# ============================================================================
#
# Reemplaza el acceso directo a `keyring.*` en este archivo. Brain y Nucleus
# corren en el mismo host/usuario (ver VAULT-GO-V1.1-AUTHORIZE-GATE-SPEC.md
# §"Propuesta concreta" del turno 3): el secreto nunca cruza el socket
# Sentinel↔Brain, mismo patrón que ya usa GITHUB_TOKEN_STORED para no
# emitir el valor real por el Event Bus. `role` lo resuelve Nucleus
# localmente vía core.GetUserRole() — no viaja en ningún payload de acá.
#
# Pendiente de infraestructura (no de arquitectura, ver turno 4): confirmar
# que el binario `nucleus` es alcanzable desde el proceso de Brain. Por
# default se busca en PATH; NUCLEUS_BIN permite overridear la ruta.

class VaultClient:
    """Cliente delgado por subprocess contra `nucleus vault`."""

    DEFAULT_TIMEOUT = 5  # segundos; cachear con TTL corto en el caller si
                          # esto se llama seguido en el hot path (ver nota
                          # de GeminiKeyManager más abajo).

    def __init__(self, binary_path: Optional[str] = None, timeout: int = DEFAULT_TIMEOUT):
        self._binary = binary_path or os.environ.get("NUCLEUS_BIN") or shutil.which("nucleus")
        self._timeout = timeout

    def _run(self, *args: str) -> dict:
        if not self._binary:
            raise VaultUnavailableError(
                "nucleus binary no encontrado. Seteá NUCLEUS_BIN o asegurate "
                "de que 'nucleus' esté en PATH."
            )

        try:
            result = subprocess.run(
                [self._binary, "--json", "vault", *args],
                capture_output=True,
                text=True,
                timeout=self._timeout,
            )
        except subprocess.TimeoutExpired as e:
            raise VaultUnavailableError(
                f"nucleus vault no respondió en {self._timeout}s"
            ) from e
        except OSError as e:
            raise VaultUnavailableError(f"no se pudo invocar nucleus: {e}") from e

        if result.returncode != 0:
            stderr = (result.stderr or result.stdout or "").strip()
            lowered = stderr.lower()
            if "unauthorized" in lowered or "master role" in lowered:
                raise VaultUnauthorizedError(stderr or "vault access denied")
            if "locked" in lowered:
                raise VaultUnauthorizedError("vault is locked")
            raise RuntimeError(f"nucleus vault error: {stderr or 'unknown error'}")

        try:
            return json.loads(result.stdout.strip())
        except json.JSONDecodeError as e:
            raise RuntimeError(
                f"nucleus vault devolvió salida no-JSON: {result.stdout!r}"
            ) from e

    def get(self, key_id: str) -> Optional[str]:
        """Lee una key. Devuelve None si no existe (no levanta excepción por
        key faltante, mismo comportamiento que keyring.get_password)."""
        try:
            data = self._run("request", key_id)
        except RuntimeError as e:
            if "not found" in str(e).lower():
                return None
            raise
        return data.get("key")

    def set(self, key_id: str, value: str) -> None:
        """Escribe/rota una key. Requiere `nucleus vault set` (vault.go v1.1)."""
        self._run("set", key_id, value)

    def delete(self, key_id: str) -> None:
        """Borra una key. Idempotente: no levanta si ya no existía, mismo
        comportamiento que el catch de PasswordDeleteError de antes."""
        try:
            self._run("delete", key_id)
        except RuntimeError as e:
            if "not found" in str(e).lower():
                return
            raise


# ============================================================================
# BASE CREDENTIAL MANAGER
# ============================================================================

class CredentialManager:
    """
    Base credential manager. Ya no habla con el system keyring directo —
    todo pasa por `nucleus vault` (VaultClient), que aplica Authorize()
    antes de tocar el Keyring real. Ver VAULT-GO-V1.1-AUTHORIZE-GATE-SPEC.md.

    Storage priority:
    1. Environment variable
    2. Nucleus vault (que a su vez resuelve contra el Keyring del SO)
    """

    # Se mantiene como referencia documental del namespace que ya usa
    # vault.go (vaultServiceNameConst = "bloom-brain") — pero Python ya no
    # lo pasa a ningún lado; el SERVICE_NAME lo fija Nucleus del lado Go.
    SERVICE_NAME = "bloom-brain"

    def __init__(self, vault: Optional[VaultClient] = None):
        self._vault = vault or VaultClient()

    def get_credential(self, key_name: str, env_var: str) -> str:
        """
        Retrieve credential with fallback chain.

        Args:
            key_name: Vault key id
            env_var: Environment variable name

        Returns:
            Credential string

        Raises:
            ValueError: If no credential found
            VaultUnauthorizedError: If nucleus denied the request
            VaultUnavailableError: If nucleus couldn't be reached
        """
        # Priority 1: Environment variable (for CI/CD, development)
        env_value = os.environ.get(env_var)
        if env_value:
            return env_value

        # Priority 2: Nucleus vault
        vault_value = self._vault.get(key_name)
        if vault_value:
            return vault_value

        raise ValueError(
            f"No credential found for '{key_name}'. "
            f"Set {env_var} environment variable or configure via CLI."
        )

    def save_credential(self, key_name: str, value: str) -> None:
        """Store credential via the Nucleus vault."""
        if not value or not isinstance(value, str):
            raise ValueError("Credential must be a non-empty string")

        try:
            self._vault.set(key_name, value)
        except (VaultUnauthorizedError, VaultUnavailableError):
            raise
        except Exception as e:
            raise RuntimeError(f"Failed to store credential via vault: {e}")

    def delete_credential(self, key_name: str) -> None:
        """Remove credential via the Nucleus vault."""
        try:
            self._vault.delete(key_name)
        except (VaultUnauthorizedError, VaultUnavailableError):
            raise
        except Exception as e:
            raise RuntimeError(f"Failed to delete credential: {e}")

    def has_credential(self, key_name: str, env_var: str) -> bool:
        """Check if credential exists."""
        if os.environ.get(env_var):
            return True
        try:
            return self._vault.get(key_name) is not None
        except Exception:
            return False

    def get_source(self, key_name: str, env_var: str) -> str:
        """Returns: 'environment', 'vault', or 'none'"""
        if os.environ.get(env_var):
            return "environment"
        try:
            if self._vault.get(key_name):
                return "vault"
        except Exception:
            pass
        return "none"


# ============================================================================
# GITHUB CREDENTIALS
# ============================================================================

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


# ============================================================================
# GEMINI MULTI-KEY SYSTEM
# ============================================================================

class KeySelectionStrategy(Enum):
    """Strategies for selecting Gemini keys."""
    
    GREEDY = "greedy"
    """Always use the key with most available tokens."""
    
    ROUND_ROBIN = "round_robin"
    """Distribute load evenly across active keys."""
    
    PRIORITY_FIRST = "priority_first"
    """Respect priority field, then availability."""
    
    RESERVE_LAST = "reserve_last"
    """Use priority=-1 keys only when others exhausted."""


@dataclass
class GeminiKeyInfo:
    """Metadata for a Gemini API key."""
    profile_name: str
    total_tokens: int = 1_500_000
    used_tokens: int = 0
    last_reset: str = ""  # ISO format
    is_active: bool = True
    priority: int = 0
    consecutive_errors: int = 0
    created_at: str = ""
    last_used: Optional[str] = None
    
    def __post_init__(self):
        if not self.last_reset:
            self.last_reset = datetime.now(timezone.utc).isoformat()
        if not self.created_at:
            self.created_at = datetime.now(timezone.utc).isoformat()
    
    @property
    def available_tokens(self) -> int:
        """Tokens remaining."""
        return self.total_tokens - self.used_tokens
    
    @property
    def usage_percentage(self) -> float:
        """Percentage of quota used."""
        return (self.used_tokens / self.total_tokens) * 100
    
    @property
    def is_exhausted(self) -> bool:
        """Check if quota exhausted."""
        return self.available_tokens < 10_000
    
    def needs_reset(self) -> bool:
        """Check if needs quota reset."""
        last_reset_dt = datetime.fromisoformat(self.last_reset)
        now = datetime.now(timezone.utc)
        return (now - last_reset_dt).total_seconds() > 86400


class GeminiKeyManager:
    """
    Multi-key Gemini credential manager with intelligent rotation.
    
    Storage:
    - Profiles metadata: keyring("bloom-brain", "gemini-profiles") → JSON
    - Individual keys: keyring("bloom-brain", "gemini-key:profile-name") → API key
    """
    
    def __init__(self, strategy: KeySelectionStrategy = KeySelectionStrategy.PRIORITY_FIRST):
        self._manager = CredentialManager()
        # Referencia directa al mismo VaultClient del manager — evita crear
        # una segunda instancia (y un segundo shutil.which lookup) para los
        # puntos de este archivo que antes bypaseaban CredentialManager.
        self._vault = self._manager._vault
        self.strategy = strategy
        self._last_used_index = 0
    
    def add_key(self, profile_name: str, api_key: str, priority: int = 0) -> None:
        """
        Add new Gemini API key.
        
        Args:
            profile_name: Profile identifier (e.g., "Personal Chrome")
            api_key: Gemini API key
            priority: Priority (1=preferred, 0=normal, -1=backup)
        """
        if not api_key or len(api_key) < 20:
            raise ValueError("Invalid API key format")
        
        # Load existing profiles
        profiles = self._load_profiles()
        
        # Check if profile already exists
        if profile_name in profiles:
            raise ValueError(f"Profile '{profile_name}' already exists")
        
        # Create new profile
        profiles[profile_name] = GeminiKeyInfo(
            profile_name=profile_name,
            priority=priority
        )
        
        # Save profile metadata
        self._save_profiles(profiles)
        
        # Save API key separately
        key_id = f"gemini-key:{profile_name}"
        self._manager.save_credential(key_id, api_key)
    
    def get_available_key(self, estimated_tokens: int = 10_000) -> tuple[str, str]:
        """
        Get available key for use.
        
        Args:
            estimated_tokens: Estimated tokens for request
        
        Returns:
            Tuple (profile_name, api_key)
        
        Raises:
            NoAvailableKeysError: If no key has sufficient quota
        """
        profiles = self._load_profiles()
        
        # Auto-reset quotas if needed
        self._auto_reset_quotas(profiles)
        
        # Filter valid keys
        valid_keys = [
            (name, info) for name, info in profiles.items()
            if info.is_active 
            and info.available_tokens >= estimated_tokens
            and info.consecutive_errors < 3
        ]
        
        if not valid_keys:
            raise NoAvailableKeysError(
                f"No Gemini keys available. Needed {estimated_tokens} tokens. "
                "Add more keys or wait for quota reset."
            )
        
        # Select by strategy
        selected_name, selected_info = self._select_by_strategy(valid_keys)
        
        # Load API key — vía nucleus vault, ya no keyring directo.
        # Nota de performance (señalada en el turno 3): cada llamada acá
        # lanza un proceso `nucleus` nuevo. Si esto termina siendo el hot
        # path de requests a Gemini, cachear con TTL corto en el caller.
        key_id = f"gemini-key:{selected_name}"
        api_key = self._vault.get(key_id)

        if not api_key:
            raise ValueError(f"API key not found for profile '{selected_name}'")
        
        return selected_name, api_key
    
    def report_usage(self, profile_name: str, tokens_used: int, success: bool = True):
        """
        Report token usage for a key.
        
        Args:
            profile_name: Profile that was used
            tokens_used: Tokens consumed
            success: Whether request succeeded
        """
        profiles = self._load_profiles()
        
        if profile_name not in profiles:
            return
        
        info = profiles[profile_name]
        
        if success:
            info.used_tokens += tokens_used
            info.last_used = datetime.now(timezone.utc).isoformat()
            info.consecutive_errors = 0
        else:
            info.consecutive_errors += 1
            if info.consecutive_errors >= 3:
                info.is_active = False
        
        self._save_profiles(profiles)
    
    def list_keys(self) -> dict[str, GeminiKeyInfo]:
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
        
        # Delete API key
        key_id = f"gemini-key:{profile_name}"
        self._manager.delete_credential(key_id)
    
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
    
    def reset_quota(self, profile_name: str) -> None:
        """Manually reset quota (for testing)."""
        profiles = self._load_profiles()
        
        if profile_name not in profiles:
            raise ValueError(f"Profile '{profile_name}' not found")
        
        info = profiles[profile_name]
        info.used_tokens = 0
        info.last_reset = datetime.now(timezone.utc).isoformat()
        info.consecutive_errors = 0
        info.is_active = True
        
        self._save_profiles(profiles)
    
    def validate_key(self, profile_name: str) -> dict:
        """
        Validate key by making test API call.
        
        Returns:
            dict with validation results
        """
        profiles = self._load_profiles()
        
        if profile_name not in profiles:
            raise ValueError(f"Profile '{profile_name}' not found")
        
        key_id = f"gemini-key:{profile_name}"
        api_key = self._vault.get(key_id)

        if not api_key:
            return {"valid": False, "error": "API key not found"}
        
        try:
            # Test call to Gemini API
            import requests
            response = requests.get(
                "https://generativelanguage.googleapis.com/v1beta/models",
                params={"key": api_key},
                timeout=10
            )
            
            if response.status_code == 200:
                info = profiles[profile_name]
                return {
                    "valid": True,
                    "profile": profile_name,
                    "quota_used": info.used_tokens,
                    "quota_total": info.total_tokens,
                    "quota_available": info.available_tokens,
                    "usage_percentage": round(info.usage_percentage, 1)
                }
            else:
                return {"valid": False, "error": f"API error: {response.status_code}"}
        
        except Exception as e:
            return {"valid": False, "error": str(e)}
    
    def get_stats(self) -> dict:
        """Get global statistics."""
        profiles = self._load_profiles()
        
        if not profiles:
            return {
                "total_keys": 0,
                "active_keys": 0,
                "total_quota": 0,
                "used_tokens": 0,
                "available_tokens": 0,
                "usage_percentage": 0.0
            }
        
        active_profiles = [p for p in profiles.values() if p.is_active]
        total_quota = sum(p.total_tokens for p in profiles.values())
        used_tokens = sum(p.used_tokens for p in profiles.values())
        
        return {
            "total_keys": len(profiles),
            "active_keys": len(active_profiles),
            "total_quota": total_quota,
            "used_tokens": used_tokens,
            "available_tokens": total_quota - used_tokens,
            "usage_percentage": round((used_tokens / total_quota) * 100, 1) if total_quota > 0 else 0.0,
            "strategy": self.strategy.value
        }
    
    def _select_by_strategy(self, valid_keys: list) -> tuple[str, GeminiKeyInfo]:
        """Select key by configured strategy."""
        
        if self.strategy == KeySelectionStrategy.GREEDY:
            return max(valid_keys, key=lambda x: x[1].available_tokens)
        
        elif self.strategy == KeySelectionStrategy.PRIORITY_FIRST:
            return max(valid_keys, key=lambda x: (x[1].priority, x[1].available_tokens))
        
        elif self.strategy == KeySelectionStrategy.RESERVE_LAST:
            non_reserve = [(n, i) for n, i in valid_keys if i.priority >= 0]
            if non_reserve:
                return max(non_reserve, key=lambda x: (x[1].priority, x[1].available_tokens))
            return max(valid_keys, key=lambda x: x[1].available_tokens)
        
        elif self.strategy == KeySelectionStrategy.ROUND_ROBIN:
            self._last_used_index = (self._last_used_index + 1) % len(valid_keys)
            return valid_keys[self._last_used_index]
        
        return valid_keys[0]
    
    def _auto_reset_quotas(self, profiles: dict[str, GeminiKeyInfo]):
        """Auto-reset quotas after 24h."""
        now = datetime.now(timezone.utc)
        updated = False
        
        for name, info in profiles.items():
            if info.needs_reset():
                info.used_tokens = 0
                info.last_reset = now.isoformat()
                info.consecutive_errors = 0
                info.is_active = True
                updated = True
        
        if updated:
            self._save_profiles(profiles)
    
    def _load_profiles(self) -> dict[str, GeminiKeyInfo]:
        """Load profiles from the Nucleus vault."""
        try:
            data = self._vault.get("gemini-profiles")
            if not data:
                return {}

            profiles_dict = json.loads(data)
            return {
                name: GeminiKeyInfo(**info)
                for name, info in profiles_dict.items()
            }
        except Exception:
            return {}

    def _save_profiles(self, profiles: dict[str, GeminiKeyInfo]):
        """Save profiles to the Nucleus vault."""
        profiles_dict = {
            name: asdict(info)
            for name, info in profiles.items()
        }
        data = json.dumps(profiles_dict)
        self._vault.set("gemini-profiles", data)