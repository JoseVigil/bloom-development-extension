"""
Script de verificación end-to-end — usa las firmas REALES del Core tal
como están hoy en brain/core/intent_manager.py, confirmadas por
inspección directa (no por el enunciado del prompt).

Ciclo: create -> hydrate (.reception/, phaseless) -> add_turn en
.classification/ con close_phase=True (fuerza advance_after_proposal)
-> add_turn en .consolidation/ con close_phase=True (cierra el commit)
-> freeze_to_mandate() -> mandate.json en disco.
"""
from pathlib import Path
from brain.core.intent_manager import IntentManager

manager = IntentManager()

# 1. CREATE — mandate_id es obligatorio para 'ing' (ING §0 regla 2)
created = manager.create_intent(
    intent_type="ing",
    name="Verificación pipeline ing",
    mandate_id="MND-VERIFY-001",
    domain_baseline="empty",
)
intent_id = created["intent_id"]
print("CREATE ->", created["intent_id"], created["folder_name"])

# 2. HYDRATE — fase .reception/, sin turnos, acto único.
#    Avanza sola a .classification/ vía close_phaseless_act().
hydrated = manager.hydrate_intent(intent_id=intent_id)
print("HYDRATE ->", hydrated["phase_active"])  # esperado: classification

# 3. ADD_TURN en .classification/ (fase propositiva, commit_field=None).
#    close_phase=True fuerza advance_after_proposal() -> .consolidation/
turn1 = manager.add_turn(
    intent_id=intent_id,
    actor="ai",
    content="Propuesta de clasificación lista",
    proposal=[{"cluster_id": "c1", "operation": "create_domain"}],
    close_phase=True,
)
print(
    "ADD_TURN #1 ->",
    "phase_active:", turn1["phase_active"],   # esperado: consolidation
    "| advanced_by_proposal_close:", turn1["advanced_by_proposal_close"],
)

# 4. ADD_TURN en .consolidation/ (fase de commit, commit_field != None).
#    close_phase=True setea el commit_field en true y cierra el turno,
#    avanzando a la fase terminal.
turn2 = manager.add_turn(
    intent_id=intent_id,
    actor="user",
    content="Ratifico la consolidación",
    proposal=[{"change_id": "c1", "human_decision": "approved", "content": {}}],
    close_phase=True,
)
print(
    "ADD_TURN #2 ->",
    "phase_active:", turn2["phase_active"],
    "| is_terminated:", turn2["is_terminated"],
)

# 5. FREEZE — sin output_path: el Core decide la ruta
#    (.bloom/.mandates/<mandate_id>/mandate.json), no se pasa por argumento.
frozen = manager.freeze_to_mandate(intent_id=intent_id)
print("FREEZE ->", frozen["status"], frozen["mandate_path"])

mandate_file = Path(frozen["mandate_path"])
assert mandate_file.exists(), "mandate.json no fue escrito a disco"
print("\n✅ mandate.json confirmado en disco:", mandate_file)
