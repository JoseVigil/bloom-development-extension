"""Mirror del repo root: contracts/types.ts — solo la porción AI_PROVIDER TYPES.

Fuente real: contracts/types.ts (AIProvider, AIPromptPayload). El resto de
types.ts (Nucleus, Intent, Profile, GitHub, ErrorCode/API response) no es
responsabilidad de este módulo — se mirroriza cuando se necesite, no antes.

Migrado desde agentic-harness/harness/contracts/types.py sin cambios de
contenido, solo de ubicación (2026-08-09).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

# contracts/types.ts: AIProvider['id']
AIProviderId = Literal["ollama", "gemini"]

# contracts/types.ts: AIProvider['capabilities'][number]
AIProviderCapability = Literal["streaming", "local", "auth-required"]

# contracts/types.ts: AIPromptPayload['context']
PromptContext = Literal["onboarding", "genesis", "dev", "doc", "general"]


@dataclass(frozen=True)
class AIProvider:
    """Mirror de la interface AIProvider (types.ts:13-17)."""

    id: AIProviderId
    capabilities: tuple[AIProviderCapability, ...]
    config: dict[str, Any] | None = None


@dataclass(frozen=True)
class AIPromptPayload:
    """Mirror de la interface AIPromptPayload (types.ts:19-26)."""

    context: PromptContext
    text: str
    intent_id: str | None = None
    profile_id: str | None = None
    provider: AIProviderId | None = None
    metadata: dict[str, Any] | None = None
