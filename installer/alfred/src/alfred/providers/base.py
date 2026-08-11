"""Interfaces base de los arms de proveedor.

Dos ABCs separadas, no una — un arm nunca implementa un método fuera de su
rol real (ver DECISION-ollama-role.md, heredado de agentic-harness).
`capabilities` usa el mismo vocabulario que contracts/types.ts
AIProvider['capabilities'].

Migrado desde agentic-harness/harness/providers/base.py sin cambios de
contenido, solo de ubicación (2026-08-09).
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, ClassVar

from alfred.contracts.types import AIPromptPayload, AIProviderCapability, AIProviderId

ProviderHealthStatus = str  # "ok" | "model_missing" | "error"


@dataclass(frozen=True)
class ProviderHealth:
    """Health check result. Forma libre en `detail`, no parte del contrato TS."""

    status: ProviderHealthStatus
    provider: AIProviderId
    detail: dict[str, Any]


class EmbeddingProviderArm(ABC):
    """Arm capaz de generar embeddings vectoriales. Nunca genera texto/razonamiento."""

    id: ClassVar[AIProviderId]
    capabilities: ClassVar[tuple[AIProviderCapability, ...]]

    @abstractmethod
    def generate_embedding(self, text: str) -> list[float]:
        """Vectoriza `text`. Levanta ProviderError si el arm no está disponible."""

    @abstractmethod
    def health(self) -> ProviderHealth:
        """Estado actual del arm, sin levantar excepción."""


class TextGenerationProviderArm(ABC):
    """Arm capaz de generar texto/razonamiento real. Nunca genera embeddings."""

    id: ClassVar[AIProviderId]
    capabilities: ClassVar[tuple[AIProviderCapability, ...]]

    @abstractmethod
    def generate_text(self, payload: AIPromptPayload) -> str:
        """Genera la respuesta final para `payload`. Levanta ProviderError si falla."""

    @abstractmethod
    def health(self) -> ProviderHealth:
        """Estado actual del arm, sin levantar excepción."""
