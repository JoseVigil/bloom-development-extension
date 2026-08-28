"""
PASO 3 — Validación End-to-End.

Ejecuta el ciclo completo de un intent 'ing' contra el Core real:

    create -> hydrate (.reception/, acto único, avanza sola a
    .classification/) -> add_turn en .classification/ con
    close_phase=True (fuerza advance_after_proposal -> .consolidation/)
    -> add_turn en .consolidation/ con close_phase=True (solicita commit
    y crea ledger) -> verificar efectos -> commit -> advance
    -> finalize_intent() -> freeze_to_mandate()

y verifica en disco que mandate.json fue escrito.

Correr desde cualquier directorio del proyecto:
    python3 tests/brain/e2e_ing_pipeline.py
"""
import sys
from pathlib import Path

# Inyección dinámica de la raíz del repositorio en PYTHONPATH
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

# Asegurar que exista la carpeta .bloom en el repositorio para la prueba
bloom_dir = REPO_ROOT / ".bloom"
bloom_dir.mkdir(parents=True, exist_ok=True)

from brain.core.intent_manager import IntentManager

# Instanciamos indicando explícitamente el nucleus_path como la raíz del repo
manager = IntentManager()


def step(label, fn):
    print(f"\n--- {label} ---")
    result = fn()
    for k, v in result.items():
        print(f"  {k}: {v}")
    return result


# 1. CREATE — mandate_id obligatorio para 'ing' (ING §0 regla 2)
created = step("1. CREATE", lambda: manager.create_intent(
    intent_type="ing",
    name="Validación E2E pipeline ing",
    mandate_id="MND-E2E-001",
    domain_baseline="empty",
))
intent_id = created["intent_id"]

# 2. HYDRATE — fase .reception/, acto único sin turnos.
#    Avanza sola a .classification/.
hydrated = step("2. HYDRATE", lambda: manager.hydrate_intent(intent_id=intent_id))
assert hydrated["phase_active"] == "classification", (
    f"Se esperaba phase_active='classification', llegó '{hydrated['phase_active']}'"
)

# 3. ADD_TURN en .classification/ (fase propositiva, commit_field=None).
#    close_phase=True fuerza advance_after_proposal() -> .consolidation/
turn1 = step("3. ADD_TURN (classification, close_phase=True)", lambda: manager.add_turn(
    intent_id=intent_id,
    actor="ai",
    content="Propuesta de clasificación lista",
    proposal=[{"cluster_id": "c1", "operation": "create_domain"}],
    close_phase=True,
))
assert turn1["advanced_by_proposal_close"] is True
assert turn1["phase_active"] == "consolidation", (
    f"Se esperaba phase_active='consolidation', llegó '{turn1['phase_active']}'"
)

# 4. ADD_TURN en .consolidation/: persiste la solicitud y el ledger,
#    sin avanzar phase_active.
turn2 = step("4. ADD_TURN (consolidation, close_phase=True)", lambda: manager.add_turn(
    intent_id=intent_id,
    actor="user",
    content="Ratifico la consolidación",
    proposal=[{"change_id": "c1", "human_decision": "approved", "content": {}}],
    close_phase=True,
))
assert turn2["commit_requested"] is True
assert turn2["phase_active"] == "consolidation"

# 4b. El aplicador externo materializa cada obligación y entrega evidencia.
from brain.core.intent.effect_ledger import EffectLedgerManager
ledger = EffectLedgerManager(Path(turn2["turn_path"]))
for effect in ledger.load()["effects"]:
    manager.mark_bsip_effect_applied(
        intent_id=intent_id,
        phase_name="consolidation",
        turn_number=turn2["turn_number"],
        effect_id=effect["effect_id"],
        evidence={"e2e_verified": effect["obligation"]},
    )

# 4c. Control final y avance son checkpoints independientes.
committed = step("4c. COMMIT CONTROL", lambda: manager.commit_bsip_turn(
    intent_id=intent_id,
    phase_name="consolidation",
    turn_number=turn2["turn_number"],
))
assert committed["phase_active"] == "consolidation"

advanced = step("4d. ADVANCE STATE", lambda: manager.advance_bsip_turn(
    intent_id=intent_id,
    phase_name="consolidation",
    turn_number=turn2["turn_number"],
))
assert advanced["is_terminated"] is True

# 5. FINALIZE — exige phase_active == terminal (ya lo confirmamos arriba).
finalized = step("5. FINALIZE", lambda: manager.finalize_intent(intent_id=intent_id))

# 6. FREEZE — sin output_path: usa la ruta candidata del Core
#    (.bloom/.mandates/<mandate_id>/mandate.json). También probamos el
#    override para confirmar el nuevo parámetro end-to-end.
frozen = step("6. FREEZE (ruta por defecto del Core)", lambda: manager.freeze_to_mandate(
    intent_id=intent_id,
))

mandate_file = Path(frozen["mandate_path"])
assert mandate_file.exists(), "mandate.json no fue escrito a disco"
print(f"\n✅ mandate.json confirmado en disco: {mandate_file}")

# 6b. Ejemplo de uso de output_path (requiere --force porque el intent
#     ya quedó frozen en el paso anterior).
frozen_override = step(
    "6b. FREEZE con --output override (force=True)",
    lambda: manager.freeze_to_mandate(
        intent_id=intent_id,
        force=True,
        output_path=Path("./mandates_custom"),
    ),
)
mandate_file_override = Path(frozen_override["mandate_path"])
assert mandate_file_override.exists(), "mandate.json (override) no fue escrito a disco"
print(f"✅ mandate.json (override) confirmado en disco: {mandate_file_override}")

print("\n✅ Ciclo E2E desacoplado completo: create -> hydrate -> ledger -> commit -> advance -> finalize -> freeze OK")
