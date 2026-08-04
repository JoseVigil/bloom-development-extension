"""
brain.core.intent_types
========================

Registro DECLARATIVO de la gramática BSIP por tipo de intent.

Por qué existe este archivo separado (y no fases hardcodeadas dentro del
State Manager):

  ING_Intent_Spec_v1_1.md §0, regla 1: "ing/ sigue el mismo principio BSIP
  que dev/doc: fases de trabajo humano-gobernado + .pipeline/ espejo por
  fase (el número de fases es propio de cada tipo)".

  DIS_Intent_Spec_v1_0.md §2, nota de arquitectura: la separación de
  fases existe en parte para "simplificar el motor de ejecución genérico
  que ya gobierna ambos intents".

Ambas specs dejan explícito que el motor de estado NO debe conocer los
nombres concretos de fase de un intent particular — debe leerlos de una
tabla. Este módulo es esa tabla. Agregar un octavo tipo de intent el día
de mañana (o reincorporar algo con la forma de dev/doc a este mismo motor)
debería ser: agregar una entrada acá, cero cambios en intent_state_manager.py.

No incluye lógica de negocio (qué hace cada fase) — eso vive en los
processors de cada fase (fs_contracts.py y los handlers específicos).
Este archivo solo responde dos preguntas por intent_type:
  1. ¿Qué fases hay y en qué orden?
  2. ¿Cuáles de esas fases tienen turnos (.turn_X/) y cuáles son actos
     únicos (como .reception/ de ing o .discovery/ de dis)?
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class IntentType(str, Enum):
    """Tipos de intent BSIP conocidos por este runtime.

    Nota de alcance: el ecosistema define seis tipos históricos
    (dev, doc, exp, inf, cor, ing) más dis/ como séptimo
    (ING_Intent_Spec_v1_1.md §0; DIS_Intent_Spec_v1_0.md §0). Este
    registro solo declara los que este runtime local va a orquestar
    en esta etapa del roadmap — ver Roadmap Maestro v3 §7 punto 5.
    Agregar 'dev'/'doc'/etc. acá es trivial pero está fuera de alcance
    hasta que haya un mandato explícito para hacerlo.
    """

    ING = "ing"
    DIS = "dis"


@dataclass(frozen=True)
class PhaseSpec:
    """Definición de una fase dentro del ciclo de un intent type.

    Attributes:
        name: nombre de la fase tal como aparece en el filesystem
            (p.ej. "reception", "classification", "mapping").
        has_turns: True si la fase itera en `.turn_X/` (con negociación
            humana turno a turno); False si es un acto único sin
            subcarpeta de turno (p.ej. .reception/ de ing, .discovery/
            de dis — ver ING §3 y DIS §3).
        commit_field: nombre del campo booleano dentro del JSON de turno
            que marca el cierre de la fase (p.ej. "committed" en
            .consolidation.json / .ratification.json). None en fases
            sin turnos, donde no hay noción de commit — la fase se
            considera cerrada al completar su acto único.
    """

    name: str
    has_turns: bool
    commit_field: str | None = None


@dataclass(frozen=True)
class IntentTypeSpec:
    """Gramática BSIP completa de un tipo de intent.

    Attributes:
        intent_type: el IntentType que describe.
        phases: fases en orden estricto de ejecución. El motor de
            estado nunca permite saltar una fase ni retroceder — ver
            intent_state_manager.py:IntentStateManager.advance_phase().
        state_filename: nombre del archivo de estado a nivel intent
            (".ing_state.json", ".dis_state.json").
        terminal_phase_name: valor de phase_active cuando el intent
            terminó — ambas specs usan literalmente "done"
            (ING_Intent_Spec_v1_1.md §1, DIS_Intent_Spec_v1_0.md §1).
        extra_state_fields: fábricas de campos propios de cada tipo que
            no son parte del envelope común (ver
            IntentStateManager._COMMON_ENVELOPE_FIELDS). Ejemplo: `ing`
            trae domain_baseline/thresholds/classification_summary;
            `dis` trae scope/mapping_summary. Se materializan al crear
            el estado inicial (ver create_intent_state()).
    """

    intent_type: IntentType
    phases: tuple[PhaseSpec, ...]
    state_filename: str
    terminal_phase_name: str = "done"
    extra_state_fields: dict = field(default_factory=dict)

    def phase_names(self) -> tuple[str, ...]:
        return tuple(p.name for p in self.phases)

    def phase_spec(self, name: str) -> PhaseSpec:
        for p in self.phases:
            if p.name == name:
                return p
        raise KeyError(
            f"'{name}' no es una fase válida de intent_type="
            f"'{self.intent_type.value}'. Fases válidas: {self.phase_names()}"
        )

    def next_phase_name(self, current: str) -> str:
        """Fase siguiente en orden estricto, o terminal_phase_name si
        `current` era la última fase real."""
        names = self.phase_names()
        idx = names.index(current)  # KeyError-like: ValueError si no existe
        if idx == len(names) - 1:
            return self.terminal_phase_name
        return names[idx + 1]


# ---------------------------------------------------------------------------
# Registro concreto — fuente: ING_Intent_Spec_v1_1.md §1/§2, DIS_Intent_Spec
# _v1_0.md §1/§2. Cualquier cambio de fases en una spec futura se refleja
# ACÁ primero, nunca directamente en el motor.
# ---------------------------------------------------------------------------

_ING_SPEC = IntentTypeSpec(
    intent_type=IntentType.ING,
    state_filename=".ing_state.json",
    phases=(
        PhaseSpec(name="reception", has_turns=False),
        PhaseSpec(name="classification", has_turns=True, commit_field=None),
        # classification no comitea per-se (ING §4: produce una PROPUESTA,
        # .domain_resolution.json); el commit real ocurre en consolidation.
        PhaseSpec(name="consolidation", has_turns=True, commit_field="committed"),
    ),
    extra_state_fields={
        "domain_baseline": lambda: None,       # "empty" | "existing" — obligatorio en create()
        "baseline_scope": lambda: [],
        "thresholds": lambda: {"domain": 0.45, "gene": 0.40},
        "classification_summary": lambda: {
            "clusters_total": 0,
            "domains_matched": 0,
            "domains_created": 0,
            "genes_extended": 0,
            "genes_created": 0,
            "unresolved_no_vectorization": 0,
        },
    },
)

_DIS_SPEC = IntentTypeSpec(
    intent_type=IntentType.DIS,
    state_filename=".dis_state.json",
    phases=(
        PhaseSpec(name="discovery", has_turns=False),
        PhaseSpec(name="mapping", has_turns=True, commit_field=None),
        # mismo motivo que classification: mapping propone, ratification comitea.
        PhaseSpec(name="ratification", has_turns=True, commit_field="committed"),
    ),
    extra_state_fields={
        "scope": lambda: {"mode": "nucleus_wide", "mandate_ids": []},
        "thresholds": lambda: {"domain_centroid_similarity": 0.45},
        "mapping_summary": lambda: {
            "domains_created": 0,
            "domains_merged": 0,
            "domains_split": 0,
            "domains_renamed": 0,
            "edges_added": 0,
            "edges_removed": 0,
            "genes_cross_domain": 0,
            "unresolved_no_vectorization": 0,
        },
    },
)

INTENT_TYPE_REGISTRY: dict[IntentType, IntentTypeSpec] = {
    IntentType.ING: _ING_SPEC,
    IntentType.DIS: _DIS_SPEC,
}


def get_intent_type_spec(intent_type: str | IntentType) -> IntentTypeSpec:
    """Punto único de acceso al registro — valida el tipo y da un error
    legible en vez de un KeyError crudo si alguien pasa un tipo no
    soportado por este runtime todavía (dev/doc/exp/inf/cor)."""
    it = IntentType(intent_type) if not isinstance(intent_type, IntentType) else intent_type
    try:
        return INTENT_TYPE_REGISTRY[it]
    except KeyError as exc:
        raise ValueError(
            f"intent_type '{it.value}' no está registrado en este runtime. "
            f"Tipos soportados actualmente: {[t.value for t in INTENT_TYPE_REGISTRY]}. "
            "Ver brain/core/intent_types.py para agregar uno nuevo."
        ) from exc
