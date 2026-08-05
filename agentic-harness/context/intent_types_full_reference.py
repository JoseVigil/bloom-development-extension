"""
context.intent_types_full_reference
====================================

NO ES EL ARCHIVO REAL. Esto es una extensión de referencia, construida el
2026-08-05 a pedido de Jose para "contar con todos los recursos" de los 7
tipos de intent en un solo lugar, con el mismo estilo declarativo
(PhaseSpec/IntentTypeSpec) que usa el `brain/core/intent_types.py` real
(accesible en vivo en `../../brain/core/intent_types.py` desde acá).

El `intent_types.py` real SOLO registra `ing` y `dis` — por diseño, no por
desactualización (ver su docstring). Este archivo cubre los 5 tipos
restantes (`dev`, `doc`, `exp`, `cor`, `inf`) reconstruyendo su gramática de
fases desde las fuentes reales disponibles hoy — NO desde el motor, que no
los implementa.

Cada spec de acá tiene un campo `source` y un nivel de `confidence`
explícito. No hay relleno: donde no hay evidencia real, se dice
explícitamente que no la hay, en vez de inventar una fase plausible.

Niveles de confianza:
  CONFIRMED_CLI     — hay comando brain CLI real que lo crea/opera
                       (brain help-full.txt, leído 2026-08-05).
  CONFIRMED_TREE    — la estructura de fases aparece completa en
                       bloom_project_tree.txt / bloom_nucleus_tree.txt,
                       pero no se encontró comando CLI que la accione.
  UNCONFIRMED       — solo el nombre existe (BTIPS v6.0), cero estructura
                       de fases, cero comando CLI encontrado. No inventar.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class IntentTypeFull(str, Enum):
    """Los 7 tipos que el ecosistema documenta, no solo los que un
    runtime particular implementa hoy."""

    DEV = "dev"
    DOC = "doc"
    EXP = "exp"
    ING = "ing"
    DIS = "dis"
    COR = "cor"
    INF = "inf"


@dataclass(frozen=True)
class PhaseSpec:
    name: str
    has_turns: bool
    commit_field: str | None = None


@dataclass(frozen=True)
class IntentTypeSpecFull:
    intent_type: IntentTypeFull
    phases: tuple[PhaseSpec, ...]
    confidence: str  # CONFIRMED_CLI | CONFIRMED_TREE | UNCONFIRMED
    source: str
    cli_commands: tuple[str, ...] = ()
    notes: str = ""

    def phase_names(self) -> tuple[str, ...]:
        return tuple(p.name for p in self.phases)


# ---------------------------------------------------------------------------
# ING / DIS — copiados del registro real (brain/core/intent_types.py).
# La fuente de verdad sigue siendo el archivo real, accesible en vivo en
# ../../brain/core/intent_types.py desde esta carpeta.
# ---------------------------------------------------------------------------

_ING_SPEC = IntentTypeSpecFull(
    intent_type=IntentTypeFull.ING,
    phases=(
        PhaseSpec(name="reception", has_turns=False),
        PhaseSpec(name="classification", has_turns=True, commit_field=None),
        PhaseSpec(name="consolidation", has_turns=True, commit_field="committed"),
    ),
    confidence="CONFIRMED_CLI",
    source="brain/core/intent_types.py (motor real) + brain intent create --type ing "
           "+ brain intent add-turn --committed",
    cli_commands=("brain intent create --type ing --domain-baseline <empty|existing>",
                  "brain intent add-turn -C/--committed (solo en .consolidation/)"),
)

_DIS_SPEC = IntentTypeSpecFull(
    intent_type=IntentTypeFull.DIS,
    phases=(
        PhaseSpec(name="discovery", has_turns=False),
        PhaseSpec(name="mapping", has_turns=True, commit_field=None),
        PhaseSpec(name="ratification", has_turns=True, commit_field="committed"),
    ),
    confidence="CONFIRMED_CLI",
    source="brain/core/intent_types.py (motor real) + brain intent create --type dis "
           "+ brain intent add-turn --committed",
    cli_commands=("brain intent create --type dis",
                  "brain intent add-turn -C/--committed (solo en .ratification/)"),
)

# ---------------------------------------------------------------------------
# DEV — confirmado por CLI (create --type dev, merge --stage, add-turn) +
# bloom_project_tree.txt. Implementado, pero NO a través del motor
# declarativo de intent_types.py (es código más viejo/directo).
# ---------------------------------------------------------------------------

_DEV_SPEC = IntentTypeSpecFull(
    intent_type=IntentTypeFull.DEV,
    phases=(
        PhaseSpec(name="briefing", has_turns=False),
        PhaseSpec(name="execution", has_turns=False),
        PhaseSpec(name="refinement", has_turns=True, commit_field=None),
    ),
    confidence="CONFIRMED_CLI",
    source="bloom_project_tree.txt (.dev/.briefing/, .execution/, .refinement/.turn_X/) "
           "+ brain intent merge --stage (briefing, execution, refinement_X) "
           "+ brain intent create --type dev + brain intent add-turn "
           "(explícitamente 'Ignored for dev/doc' en --committed/--close-phase, "
           "confirmando que dev NO usa el mecanismo de commit de ing/dis).",
    cli_commands=("brain intent create --type dev",
                  "brain intent hydrate (fase briefing)",
                  "brain intent merge --stage briefing|execution|refinement_N",
                  "brain intent finalize"),
    notes="No tiene commit_field porque el CLI confirma que dev no usa "
          "--committed/--close-phase — el cierre de fase es otro mecanismo "
          "(brain intent finalize), no un campo de turno.",
)

_DOC_SPEC = IntentTypeSpecFull(
    intent_type=IntentTypeFull.DOC,
    phases=(
        PhaseSpec(name="context", has_turns=False),
        PhaseSpec(name="curation", has_turns=True, commit_field=None),
    ),
    confidence="CONFIRMED_CLI",
    source="bloom_project_tree.txt (.doc/.context/, .curation/.turn_X/) "
           "+ brain intent create --type doc + brain intent add-turn "
           "('Ignored for dev/doc').",
    cli_commands=("brain intent create --type doc",
                  "brain intent add-turn (sin --committed)"),
)

_EXP_SPEC = IntentTypeSpecFull(
    intent_type=IntentTypeFull.EXP,
    phases=(
        PhaseSpec(name="inquiry", has_turns=False),
        PhaseSpec(name="discovery", has_turns=True, commit_field=None),
        PhaseSpec(name="findings", has_turns=False),
    ),
    confidence="CONFIRMED_CLI",
    source="bloom_nucleus_tree.txt (.exp/.inquiry/, .discovery/.turn_X/, .findings/) "
           "+ brain nucleus create-exp-intent + brain nucleus exp-discovery-turn "
           "+ brain nucleus exp-export-findings.",
    cli_commands=("brain nucleus create-exp-intent --inquiry <pregunta>",
                  "brain nucleus exp-discovery-turn --notes --analysis",
                  "brain nucleus exp-export-findings --format markdown|json"),
    notes="'findings' no tiene entrada en .pipeline/ dentro de la tree — "
          "consistente con que exp-export-findings es una operación de "
          "export, no una fase conversacional con AI. Tratarla como fase "
          "terminal de solo-lectura.",
)

_COR_SPEC = IntentTypeSpecFull(
    intent_type=IntentTypeFull.COR,
    phases=(
        PhaseSpec(name="freeze_snapshot", has_turns=False),
        PhaseSpec(name="structural_analysis", has_turns=False),
        PhaseSpec(name="semantic_interpretation", has_turns=False),
        PhaseSpec(name="dual_path_synthesis", has_turns=False),
        PhaseSpec(name="proposal_assembly", has_turns=False),
        PhaseSpec(name="governed_submission", has_turns=False),
    ),
    confidence="CONFIRMED_TREE",
    source="bloom_nucleus_tree.txt (.cor/.{intent}/... 6 subcarpetas, cada una "
           "con .payload.json/.index.json/.response/ en .pipeline/). "
           "Sin turnos en ninguna fase.",
    cli_commands=(),
    notes="Ningún comando en brain help-full.txt (129 comandos, 22 "
          "categorías) crea, avanza u opera un intent 'cor' explícitamente. "
          "Candidato a confirmar: 'brain intent freeze' cristaliza estado "
          "convergido y sintetiza mandate.json — el nombre y resultado "
          "encajan conceptualmente con 'cor' pero no lo menciona "
          "explícitamente. No asumir la conexión sin confirmarla leyendo el "
          "código de ese comando.",
)

_INF_SPEC = IntentTypeSpecFull(
    intent_type=IntentTypeFull.INF,
    phases=(),
    confidence="UNCONFIRMED",
    source="Ningún archivo real revisado hasta el 2026-08-05 lo menciona con "
           "estructura. Nombrado en BTIPS v6.0 §4/§6 como 'Information "
           "Intent — recopila información factual sin transformarla ni "
           "decidir' pero sin especificación de fases.",
    cli_commands=(),
    notes="No inventar fases. Si el harness necesita manejar 'inf' en algún "
          "momento, releer BTIPS_Bloom_Technical_Intent_Package_v6_0.md §4 y "
          "§6 (ya disponible en ../../docs/) y buscar comandos CLI "
          "asociados antes de derivar una spec por analogía con los otros 6.",
)


FULL_REGISTRY: dict[IntentTypeFull, IntentTypeSpecFull] = {
    IntentTypeFull.DEV: _DEV_SPEC,
    IntentTypeFull.DOC: _DOC_SPEC,
    IntentTypeFull.EXP: _EXP_SPEC,
    IntentTypeFull.ING: _ING_SPEC,
    IntentTypeFull.DIS: _DIS_SPEC,
    IntentTypeFull.COR: _COR_SPEC,
    IntentTypeFull.INF: _INF_SPEC,
}


def summary_table() -> str:
    lines = [f"{'tipo':<5} {'confianza':<16} {'fases'}"]
    for t, spec in FULL_REGISTRY.items():
        phases = " → ".join(spec.phase_names()) or "(sin datos)"
        lines.append(f"{t.value:<5} {spec.confidence:<16} {phases}")
    return "\n".join(lines)
