"""
brain.core.intent_state_manager
================================

Gestor de Estado y Transiciones — PRIMER módulo del runtime local `brain`.

Responsabilidad única: ser la fuente de verdad determinista de en qué
fase/turno está un intent (`ing/` o `dis/`), y ser el ÚNICO código que
escribe `.ing_state.json` / `.dis_state.json` y los `.turn_X/*.json` de
control de commit. Todo lo demás (payloads BISP, invocación CLI) se
apoya en este motor — no lo duplica.

Decisiones de diseño y su origen en las specs:

1. Motor único para ing/ y dis/, parametrizado por `intent_types.py`.
   No hay `IngStateManager` / `DisStateManager` separados — ver la nota
   de arquitectura en DIS_Intent_Spec_v1_0.md §2 sobre por qué ambos
   intents comparten "el mismo motor de ejecución genérico".

2. Transiciones estrictamente hacia adelante, nunca hacia atrás y nunca
   salteando una fase. Ninguna spec contempla un intent que retroceda de
   fase — .consolidation/ y .ratification/ solo abren un `.turn_{X+1}/`
   *dentro* de la misma fase cuando `committed: false`
   (ING §5, DIS §5), nunca vuelven a una fase anterior.

3. Fases sin turnos (reception/discovery) se cierran con un acto único
   -> avanzan de inmediato. Fases con turnos (classification/mapping,
   consolidation/ratification) solo avanzan cuando el turno vigente
   cierra con su `commit_field` en `true` — ver PhaseSpec.commit_field
   en intent_types.py.

4. Escritura atómica (tmp + os.replace) en cada mutación de estado. Las
   specs no lo piden explícitamente, pero sí piden `resumable: true`
   (ING §1, DIS §1) — un estado resumible que puede quedar corrupto a
   mitad de escritura por un crash no es realmente resumible.

5. Este módulo NO vectoriza, NO arma payload.json/index.json de
   .pipeline/, NO invoca `brain` por CLI. Eso es fs_contracts.py y
   cli/intent_commands.py respectivamente (próximos módulos) — este
   archivo es la base de la que ambos dependen.

Layout de filesystem que este módulo asume (bloom_project_tree.txt,
ING_Intent_Spec_v1_1.md §2, DIS_Intent_Spec_v1_0.md §2):

    .intents/.{ing|dis}/.{intent-name-uuid}/
        ├── .{ing|dis}_state.json     <- este módulo
        ├── .{fase-sin-turnos}/       <- creado por este módulo, poblado por otros
        ├── .{fase-con-turnos}/.turn_1/, .turn_2/, ...
        └── .pipeline/...            <- fuera de alcance de este módulo
"""

from __future__ import annotations

import json
import os
import tempfile
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from brain.core.intent_types import (
    IntentType,
    IntentTypeSpec,
    PhaseSpec,
    get_intent_type_spec,
)

# ---------------------------------------------------------------------------
# Errores propios — evitar que un ValueError genérico oculte de qué regla
# de negocio se trata. Cada uno cita la sección de spec que lo respalda.
# ---------------------------------------------------------------------------


class IntentStateError(Exception):
    """Base de todos los errores de este módulo."""


class InvalidTransitionError(IntentStateError):
    """Se intentó una transición de fase que las specs no permiten
    (retroceder, saltear una fase, o avanzar una fase con turnos que
    todavía no cerró `committed: true`)."""


class PhaseNotActiveError(IntentStateError):
    """Se intentó operar sobre una fase que no es la `phase_active`
    actual del intent — p.ej. abrir un turno de `.consolidation/`
    mientras `phase_active` todavía dice `classification`."""


class IntentAlreadyTerminatedError(IntentStateError):
    """Se intentó mutar un intent cuyo `phase_active` ya es la fase
    terminal (`"done"`, ver IntentTypeSpec.terminal_phase_name)."""


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _atomic_write_json(path: Path, payload: dict) -> None:
    """Escritura atómica: tmp en el mismo directorio + os.replace.
    Evita estado truncado/corrupto si el proceso muere a mitad de
    escritura — condición necesaria para que `resumable: true`
    (ING §1 / DIS §1) sea una garantía real, no solo un campo declarado."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(
        dir=str(path.parent), prefix=f".{path.name}.", suffix=".tmp"
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, ensure_ascii=False)
            f.write("\n")
        os.replace(tmp_path, path)  # atómico en POSIX y en Windows (mismo volumen)
    except BaseException:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


@dataclass
class TurnHandle:
    """Referencia liviana a un `.turn_X/` abierto — la devuelve
    `open_turn()` para que el caller (fs_contracts.py, cli/) sepa dónde
    escribir sin tener que recalcular rutas."""

    phase_name: str
    turn_number: int
    turn_dir: Path
    control_file: Path  # .turn.json / .consolidation.json / .ratification.json


class IntentStateManager:
    """Motor de estado para un intent individual ya materializado en
    filesystem bajo `intent_root`.

    Uso típico:

        mgr = IntentStateManager.create(
            intent_root=Path(".../.ing/.{uuid}/"),
            intent_type="ing",
            mandate_id="...",
            extra_overrides={"domain_baseline": "empty"},
        )
        turn = mgr.open_turn("classification")
        ...
        mgr.close_turn(turn, committed_fields={})   # classification no comitea
        mgr.close_phase_without_turns_effect(...)    # ver nota fase sin commit_field

    El manager es intencionalmente delgado: no sabe qué va DENTRO de
    `.domain_resolution.json` ni de `.mapping_proposal.json` — eso es
    contenido de negocio de fs_contracts.py. Solo sabe si la fase/turno
    puede abrirse, y cuándo corresponde avanzar `phase_active`.
    """

    def __init__(self, intent_root: Path, spec: IntentTypeSpec, state: dict[str, Any]):
        self.intent_root = intent_root
        self.spec = spec
        self._state = state

    # ------------------------------------------------------------------
    # Construcción / carga
    # ------------------------------------------------------------------

    @classmethod
    def create(
        cls,
        intent_root: Path,
        intent_type: str | IntentType,
        mandate_id: str,
        extra_overrides: dict[str, Any] | None = None,
        intent_id: str | None = None,
    ) -> "IntentStateManager":
        """Crea un intent nuevo desde cero: escribe el `_state.json`
        inicial en `phase_active` = primera fase declarada en el
        registro, y crea el directorio de esa primera fase.

        `extra_overrides` permite pasar valores concretos para los
        campos propios del tipo (p.ej. `domain_baseline` es obligatorio
        de fijar para `ing/`; ver ING §1 nota de campos — no tiene
        default razonable, a diferencia de `thresholds`, que sí lo
        tiene y no requiere override salvo calibración explícita).
        """
        spec = get_intent_type_spec(intent_type)

        if intent_root.exists() and any(intent_root.iterdir()):
            raise IntentStateError(
                f"'{intent_root}' ya existe y no está vacío — create() es "
                "solo para intents nuevos. Usar IntentStateManager.load() "
                "para reabrir uno existente (ciclo `resumable: true`)."
            )

        first_phase = spec.phases[0].name
        now = _now_iso()

        state: dict[str, Any] = {
            "intent_id": intent_id or str(uuid.uuid4()),
            "intent_type": spec.intent_type.value,
            "mandate_id": mandate_id,
            "phase_active": first_phase,
            "resumable": True,
            "created_at": now,
            "updated_at": now,
        }

        # Campos propios del tipo (ver intent_types.py extra_state_fields)
        for field_name, default_factory in spec.extra_state_fields.items():
            state[field_name] = default_factory()
        if extra_overrides:
            unknown = set(extra_overrides) - set(spec.extra_state_fields)
            if unknown:
                raise IntentStateError(
                    f"extra_overrides trae campos no declarados para "
                    f"intent_type='{spec.intent_type.value}': {unknown}. "
                    f"Campos válidos: {list(spec.extra_state_fields)}"
                )
            state.update(extra_overrides)

        mgr = cls(intent_root=intent_root, spec=spec, state=state)
        mgr._persist()
        (intent_root / f".{first_phase}").mkdir(parents=True, exist_ok=True)
        return mgr

    @classmethod
    def load(cls, intent_root: Path) -> "IntentStateManager":
        """Reabre un intent existente leyendo su `_state.json` — soporta
        el ciclo `resumable: true` que ambas specs declaran (ING §1,
        DIS §1): el runtime puede caerse y retomar exactamente donde
        `phase_active` quedó escrito."""
        # No asumimos el nombre del archivo de antemano: probamos los
        # dos nombres conocidos del registro en vez de hardcodear uno.
        for spec in {  # dedup por si en el futuro dos tipos comparten filename
            candidate.state_filename: candidate
            for candidate in _all_registered_specs()
        }.values():
            candidate_path = intent_root / spec.state_filename
            if candidate_path.exists():
                state = json.loads(candidate_path.read_text(encoding="utf-8"))
                resolved_spec = get_intent_type_spec(state["intent_type"])
                return cls(intent_root=intent_root, spec=resolved_spec, state=state)
        raise IntentStateError(
            f"No se encontró archivo de estado conocido en '{intent_root}' "
            f"(se buscaron: {[s.state_filename for s in _all_registered_specs()]})"
        )

    def _persist(self) -> None:
        self._state["updated_at"] = _now_iso()
        _atomic_write_json(self.intent_root / self.spec.state_filename, self._state)

    # ------------------------------------------------------------------
    # Lectura de estado
    # ------------------------------------------------------------------

    @property
    def intent_id(self) -> str:
        return self._state["intent_id"]

    @property
    def phase_active(self) -> str:
        return self._state["phase_active"]

    @property
    def is_terminated(self) -> bool:
        return self.phase_active == self.spec.terminal_phase_name

    def current_phase_spec(self) -> PhaseSpec:
        if self.is_terminated:
            raise IntentAlreadyTerminatedError(
                f"Intent '{self.intent_id}' ya está en fase terminal "
                f"('{self.spec.terminal_phase_name}')."
            )
        return self.spec.phase_spec(self.phase_active)

    def snapshot(self) -> dict[str, Any]:
        """Copia defensiva del estado — para loguear o inspeccionar sin
        riesgo de que el caller mute el dict interno por error."""
        return json.loads(json.dumps(self._state))

    # ------------------------------------------------------------------
    # Fases sin turnos (reception/discovery)
    # ------------------------------------------------------------------

    def close_phaseless_act(self) -> None:
        """Cierra la fase actual cuando esa fase NO tiene turnos (acto
        único, p.ej. .reception/ o .discovery/ — ING §3, DIS §3) y
        avanza a la siguiente fase, creando su directorio.

        No recibe contenido de negocio: el caller ya debe haber escrito
        `.{fase}.json` y `.files/*` antes de llamar a esto (eso es
        trabajo de fs_contracts.py, no de este motor)."""
        phase = self.current_phase_spec()
        if phase.has_turns:
            raise InvalidTransitionError(
                f"'{phase.name}' tiene turnos — no se cierra con "
                "close_phaseless_act(), usar open_turn()/close_turn()."
            )
        self._advance()

    # ------------------------------------------------------------------
    # Fases con turnos (classification/mapping, consolidation/ratification)
    # ------------------------------------------------------------------

    def open_turn(self, phase_name: str) -> TurnHandle:
        """Abre el siguiente `.turn_X/` de `phase_name`.

        Valida:
          - que `phase_name` sea, efectivamente, la `phase_active` de
            este intent (PhaseNotActiveError si no) — no se puede negociar
            un turno de una fase que todavía no llegó su momento, ni de
            una que ya cerró.
          - que la fase declare `has_turns=True`.

        El número de turno se calcula por escaneo de `.turn_*` ya
        existentes — determinista y no requiere contador separado que
        pueda desincronizarse del filesystem real."""
        if phase_name != self.phase_active:
            raise PhaseNotActiveError(
                f"Fase '{phase_name}' no es la activa (activa: "
                f"'{self.phase_active}') — intent_id='{self.intent_id}'."
            )
        phase = self.spec.phase_spec(phase_name)
        if not phase.has_turns:
            raise InvalidTransitionError(
                f"'{phase_name}' no tiene turnos — usar close_phaseless_act()."
            )

        phase_dir = self.intent_root / f".{phase_name}"
        phase_dir.mkdir(parents=True, exist_ok=True)
        existing = sorted(
            int(p.name.split("_")[1])
            for p in phase_dir.glob(".turn_*")
            if p.is_dir() and p.name.split("_")[1].isdigit()
        )
        next_turn = (existing[-1] + 1) if existing else 1
        turn_dir = phase_dir / f".turn_{next_turn}"
        turn_dir.mkdir(parents=True, exist_ok=False)
        (turn_dir / ".files").mkdir(exist_ok=True)

        control_filename = _CONTROL_FILENAME_BY_PHASE.get(phase_name, ".turn.json")
        return TurnHandle(
            phase_name=phase_name,
            turn_number=next_turn,
            turn_dir=turn_dir,
            control_file=turn_dir / control_filename,
        )

    def close_turn(
        self,
        turn: TurnHandle,
        control_payload: dict[str, Any],
    ) -> bool:
        """Escribe el JSON de control del turno (`.turn.json` /
        `.consolidation.json` / `.ratification.json`) y, si
        corresponde, avanza `phase_active`.

        `control_payload` debe ser el contenido completo tal como lo
        definen las specs (p.ej. `.consolidation.json` de ING §5, o
        `.mapping_proposal.json`-driven `.turn.json` de DIS §4) — este
        método no valida su schema de negocio (eso es fs_contracts.py),
        solo lee el campo de commit declarado en PhaseSpec.commit_field
        para decidir la transición.

        Devuelve True si la fase avanzó como resultado de este cierre,
        False si el turno quedó abierto (`committed: false`, o la fase
        no tiene noción de commit — p.ej. `classification`/`mapping`,
        que solo proponen — ver ING §4 y DIS §4)."""
        if turn.phase_name != self.phase_active:
            raise PhaseNotActiveError(
                f"Fase '{turn.phase_name}' ya no es la activa (activa: "
                f"'{self.phase_active}') — ¿turno obsoleto?"
            )
        phase = self.spec.phase_spec(turn.phase_name)
        _atomic_write_json(turn.control_file, control_payload)

        if phase.commit_field is None:
            # Fase propositiva (classification/mapping): nunca avanza
            # por sí sola — el commit real ocurre en la fase siguiente
            # (consolidation/ratification). Ver ING §4 "es la
            # PROPUESTA; la confirmación humana ocurre en .consolidation/".
            return False

        committed = bool(control_payload.get(phase.commit_field, False))
        if committed:
            self._advance()
            return True
        return False

    def advance_after_proposal(self) -> None:
        """Fuerza el avance de una fase propositiva (`classification` /
        `mapping`, `commit_field=None`) hacia su fase de cierre
        (`consolidation` / `ratification`) sin pasar por `commit_field`.

        Por qué existe este método aparte de `close_turn()`: las fases
        propositivas nunca comitean (ING §4, DIS §4 — "es la PROPUESTA;
        la confirmación humana ocurre en .consolidation/" / ".ratification/"),
        así que `close_turn()` jamás las avanza por sí solo (ver su
        docstring: devuelve `False` cuando `phase.commit_field is None`).
        Alguien tiene que poder decidir, sin embargo, que la propuesta ya
        está lista para pasar a revisión humana — esa decisión es del
        orquestador (CLI / IntentManager, vía el flag `close_phase`), no
        del motor de estado, que por diseño no juzga contenido de negocio
        (ver docstring de clase). Este método es exactamente ese punto de
        entrada explícito.

        Validaciones:
          - La fase activa debe tener turnos (`has_turns=True`) y no debe
            declarar `commit_field` (si lo declara, ya es una fase de
            cierre como consolidation/ratification, que se avanza vía
            `close_turn()` con `committed: true`, no acá).
          - Debe existir al menos un `.turn_X/` abierto en la fase — no
            tiene sentido "cerrar la propuesta" de una fase que todavía
            no propuso nada.

        Raises:
            InvalidTransitionError: si la fase activa no es una fase
                propositiva intermedia válida, o si no hay ningún turno
                abierto todavía.
            IntentAlreadyTerminatedError: si el intent ya está en fase
                terminal.
        """
        phase = self.current_phase_spec()
        if not phase.has_turns or phase.commit_field is not None:
            raise InvalidTransitionError(
                f"'{phase.name}' no es una fase propositiva intermedia "
                "(se requiere has_turns=True y commit_field=None) — "
                "advance_after_proposal() solo aplica a fases tipo "
                f"classification/mapping. Fase actual: has_turns="
                f"{phase.has_turns}, commit_field={phase.commit_field!r}."
            )

        phase_dir = self.intent_root / f".{phase.name}"
        has_any_turn = any(
            p.is_dir() and p.name.split("_")[1].isdigit()
            for p in phase_dir.glob(".turn_*")
        )
        if not has_any_turn:
            raise InvalidTransitionError(
                f"No se puede avanzar '{phase.name}' sin al menos un "
                "turno abierto — no hay ninguna propuesta registrada "
                "todavía (usar open_turn()/close_turn() primero)."
            )

        self._advance()

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _advance(self) -> None:
        current = self.phase_active
        nxt = self.spec.next_phase_name(current)
        self._state["phase_active"] = nxt
        if nxt != self.spec.terminal_phase_name:
            (self.intent_root / f".{nxt}").mkdir(parents=True, exist_ok=True)
        self._persist()


# Nombres de archivo de control por fase — únicos casos donde el nombre
# no es simplemente ".turn.json" (ver árboles de directorio en ambas
# specs, §2 y §5): las fases de commit tienen su propio nombre semántico.
_CONTROL_FILENAME_BY_PHASE: dict[str, str] = {
    "consolidation": ".consolidation.json",
    "ratification": ".ratification.json",
}


def _all_registered_specs() -> list[IntentTypeSpec]:
    from brain.core.intent_types import INTENT_TYPE_REGISTRY

    return list(INTENT_TYPE_REGISTRY.values())
