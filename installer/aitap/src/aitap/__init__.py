"""
AITap - router centralizado de acceso a proveedores de IA para el ecosistema Bloom.

AITap NO es dueno del vault de credenciales: esa responsabilidad es de Nucleus
(installer/nucleus/internal/vault/vault.go), respaldado por el Keyring del SO.
AITap guarda unicamente referencias a keys (key_id) y la politica de
ruteo/failover entre proveedores (Gemini, Claude, OpenAI, xAI).

Ver docs/VAULT/BTIPS-VAULT-MULTIKEY-ANALYSIS.md y la investigacion "Vault - AiTap"
para el mapeo completo de vaults existentes que motivo esta decision.
"""

__version__ = "0.1.0"
