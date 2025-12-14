import json
from pathlib import Path
from typing import Dict

class GenesisPlanner:
    """
    Genera el Context Plan específico para la fase de Genesis (Bootstrap).
    No requiere IA router, ya que sabemos exactamente qué necesita la IA para empezar.
    """
    
    def __init__(self, root: Path):
        self.root = root

    def create_initial_plan(self) -> Dict:
        """
        Crea el plan de lectura para el Intent de 'Cognition' (Hidratación de Docs).
        """
        plan = {
            "intent": "genesis_cognition",
            "objective": "Transformar el dump técnico y las semillas en documentación viva.",
            "files": [
                # 1. El Mapa (Crítico)
                {
                    "path": ".project/.tree.bl",
                    "priority": "critical",
                    "reason": "Mapa estructural completo del proyecto"
                },
                # 2. La Verdad Técnica (Crítico) - Lo que acabamos de generar con 'analyze'
                {
                    "path": ".project/.doc.app.architecture.bl",
                    "priority": "critical",
                    "reason": "Dump técnico generado por estrategias automáticas"
                },
                # 3. Las Semillas (High) - Templates a reescribir
                {
                    "path": ".project/.doc.app.workflow.bl",
                    "priority": "high",
                    "reason": "Semilla de flujos a ser hidratada"
                },
                {
                    "path": ".project/.doc.app.implementation.bl",
                    "priority": "high",
                    "reason": "Semilla de implementación a ser hidratada"
                },
                # 4. Reglas (High)
                {
                    "path": ".core/.doc.instructions.bl",
                    "priority": "high",
                    "reason": "Instrucciones de comportamiento para el Arquitecto Documental"
                }
            ]
        }
        
        return plan

    def save_plan(self, output_path: Path):
        plan = self.create_initial_plan()
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(plan, indent=2), encoding='utf-8')
        return output_path