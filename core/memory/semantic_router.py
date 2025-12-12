import json
from core.intelligence.llm_client import LLMClient
from core.memory.meta_manager import MetaManager

class SemanticRouter:
    def __init__(self, ai: LLMClient, meta: MetaManager):
        self.ai = ai
        self.meta = meta

    async def create_execution_plan(self, intent_id: str, phase: str, user_briefing: str) -> dict:
        """
        Genera el .context_plan.json
        """
        # 1. Cargar metadatos ligeros (Summaries de archivos)
        indices = self.meta.get_light_indices()
        
        # 2. Prompt del Router
        system_instruction = """
        Eres el Estratega de Contexto del sistema Bloom.
        Tu tarea: Seleccionar los archivos mínimos indispensables para cumplir el objetivo.
        Output: JSON con lista de archivos y prioridad (CRITICAL/HIGH).
        """
        
        prompt = f"""
        OBJETIVO: {user_briefing}
        FASE: {phase}
        ARCHIVOS DISPONIBLES:
        {json.dumps(indices, indent=2)}
        """

        # 3. Llamada a Flash
        plan_json_str = await self.ai.request_router(prompt, system_instruction)
        
        # 4. Guardar plan en disco (auditoría)
        # TODO: self.meta.save_plan(intent_id, plan_json_str)
        
        return json.loads(plan_json_str)