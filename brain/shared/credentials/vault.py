"""
Vault client and base credential manager for Bloom.

summary: Centralized credential storage via nucleus vault (subprocess),
    con fallback a variable de entorno. No habla con el system keyring
    directo — ver VAULT-GO-V1.1-AUTHORIZE-GATE-SPEC.md.
keywords: credentials, security, api-key, vault, nucleus

Migrado desde brain/shared/credentials.py (archivo suelto, ahora eliminado
por colisión de nombre con este paquete) hacia brain/shared/credentials/
como parte del merge de packages. Contenido sin cambios funcionales.
"""

import os
import json
import shutil
import subprocess
import logging
from typing import Optional

logger = logging.getLogger("brain.credentials.vault")


# ============================================================================
# EXCEPTIONS
# ============================================================================

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
                          # de GeminiKeyManager en gemini_manager.py).

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
