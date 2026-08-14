"""Empaquetador del lado Emisión — Alfred hacia AITAP.

Implementa el paso "Lado Emisión" de `Alfred_Integracion_AITAP_Disparo2_v1_0.md`
§2: Alfred empaqueta sus intenciones siguiendo el mismo protocolo BISP que
usa Brain — no un formato propio ni una variante simplificada. Estructura y
campos tomados de `docs/BSIP/BLOOM_BISP_Fuente_de_Verdad_v1_0.md` Parte A
(A.4, schema de `index.json`; A.2.5, Contratos de Synapse).

Qué NO hace este módulo, a propósito:

- No vectoriza nada. La capa `autarchic.vector` es aditiva (Invariante 3,
  A.7 del documento fuente) — Alfred no tiene hoy acceso al pipeline
  Ollama /api/embed + ChromaDB que usa Brain, así que el payload se arma
  sin vector. "Un intent sin vectorizar es un intent válido."
- No decide el lado Recepción. Cómo se interpreta la respuesta que
  eventualmente devuelva AITAP está bloqueado (ver
  `Alfred_Integracion_AITAP_Disparo2_v1_0.md` §4) hasta que
  `BSIP_Response_Spec_PoC_Disparo1_v1_0.md` cierre el schema del
  Contrato D. Este módulo arma únicamente lo que Alfred manda.
- No inventa un cuarto Contrato de Synapse. Si un uso de Alfred no
  encaja en A/B/C, eso se documenta como propuesta de contrato nuevo —
  no se fuerza acá (ver AGENTS.md).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

SynapseContract = Literal["A", "B", "C"]

_CONTRACT_DESCRIPTIONS: dict[SynapseContract, str] = {
    "A": (
        "Continuar — el package llega como contexto de fondo, la AI "
        "continúa el flujo sin reconocer explícitamente la recepción. "
        "Enriquecimiento silencioso del prompt."
    ),
    "B": (
        "Evaluar — la AI recibe el package y emite una evaluación "
        "estructurada de consistencia, solicitada explícitamente."
    ),
    "C": (
        "Decidir compatibilidad — el runtime destino recibe el package "
        "con semantic_descriptor completo y decide compatibilidad. "
        "Requiere capa marketplace completa."
    ),
}


@dataclass(frozen=True)
class BispPayload:
    """Mirror mínimo de `index.json` (A.4) para el caso de uso de Alfred.

    `marketplace` siempre `None` acá: Alfred conversa, no genera un
    intent que un Mandate vaya a agregar y firmar como package de
    marketplace (Invariante 4, A.7 del documento fuente).
    """

    intent_type: str
    objective: str
    payload_summary: str
    phase: str
    contract: SynapseContract
    findings_summary: str | None = None
    domain_tags: list[str] = field(default_factory=list)
    resolved: bool | None = None
    reusable_knowledge: bool | None = None

    def to_index_json(self) -> dict:
        """Serializa al shape de `index.json` documentado en A.4.

        Se agrega `synapse_contract` como campo extra explícito (no está
        en el schema base de A.4, que es agnóstico de contrato) porque
        A.2.5 exige que "cualquier consumidor adicional... debe declarar
        explícitamente a cuál de estos tres contratos se acoge" — este
        campo es esa declaración, no una libertad tomada sobre el schema.
        """
        return {
            "operational": {
                "intent_type": self.intent_type,
                "objective": self.objective,
                "payload_summary": self.payload_summary,
                "phase": self.phase,
            },
            "autarchic": {
                "findings_summary": self.findings_summary,
                "domain_tags": self.domain_tags,
                "resolved": self.resolved,
                "reusable_knowledge": self.reusable_knowledge,
                # Sin "vector": capa aditiva, ver Invariante 3 (A.7).
            },
            "marketplace": None,
            "synapse_contract": {
                "id": self.contract,
                "description": _CONTRACT_DESCRIPTIONS[self.contract],
            },
        }


def build_chat_turn_payload(
    objective: str,
    prompt_text: str,
    *,
    phase: str = "conversation",
    contract: SynapseContract = "A",
) -> BispPayload:
    """Arma el BISP-Payload de un turno de chat de Alfred.

    Contrato A por default: un turno conversacional calza literal con su
    descripción en A.2.5 — "el package llega como contexto de fondo, la
    AI continúa el flujo". Si Alfred alguna vez necesita pedir una
    evaluación estructurada en vez de continuar la charla, el caller
    debe pasar contract="B" de forma explícita; no es el default.
    """
    if not prompt_text.strip():
        raise ValueError(
            "prompt_text no puede estar vacío — no hay nada que empaquetar."
        )
    return BispPayload(
        intent_type="alfred_chat",
        objective=objective,
        payload_summary=prompt_text,
        phase=phase,
        contract=contract,
    )
