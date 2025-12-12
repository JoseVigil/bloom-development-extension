import logging
from pathlib import Path
from typing import Dict, Any

# Módulos internos
from core.config import settings
from core.intelligence.llm_client import LLMClient
from core.memory.semantic_router import SemanticRouter
from core.memory.meta_manager import MetaManager
from core.filesystem.payload_manager import PayloadManager
from core.filesystem.staging import StagingArea
from core.orchestrator.state_machine import StateMachine

logger = logging.getLogger("bloom_engine")

class BloomEngine:
    """
    Controlador principal del ciclo de vida cognitivo.
    Orquesta la interacción entre:
    - Memoria (Indices/Metadatos)
    - Inteligencia (Gemini Flash/Pro)
    - Sistema de Archivos (Payloads/Staging)
    """

    def __init__(self, project_root: str, api_key: str):
        self.root = Path(project_root)
        
        # Inicialización de subsistemas
        self.ai = LLMClient(api_key=api_key)
        self.meta = MetaManager(self.root)
        self.state_machine = StateMachine(self.root)
        self.payload_manager = PayloadManager(self.root)
        
        # Agentes especializados
        self.router = SemanticRouter(self.ai, self.meta)
        self.staging = StagingArea(self.root)

    async def execute_phase(self, intent_id: str, phase: str):
        """
        Ejecuta una fase completa (Briefing, Execution, Refinement).
        """
        logger.info(f"🚀 Iniciando Engine | Intent: {intent_id} | Fase: {phase}")

        try:
            # 1. Cargar Estado
            current_state = self.state_machine.load_state(intent_id)
            
            # 2. Planificación Semántica (Router - Gemini Flash)
            # Decidimos qué archivos leer basándonos en el objetivo y los índices
            context_plan = await self.router.create_execution_plan(
                intent_id=intent_id,
                phase=phase,
                user_briefing=current_state.get("briefing_text", "")
            )
            logger.info(f"📋 Plan de contexto generado: {len(context_plan['files'])} archivos seleccionados")

            # 3. Hidratación (Payload Manager)
            # Construimos el JSON gigante con el contenido real de los archivos
            payload = await self.payload_manager.build_payload(
                context_plan=context_plan,
                intent_state=current_state
            )
            logger.info("📦 Payload hidratado y listo para inferencia")

            # 4. Inferencia Cognitiva (Writer/Coder - Gemini Pro)
            # Enviamos todo el contexto para generar la solución
            raw_response = await self.ai.request_completion(
                payload=payload,
                system_instruction=self._get_system_instruction(phase)
            )
            
            # 5. Procesamiento y Staging
            # Parseamos la respuesta, extraemos código/docs y guardamos en zona segura
            changes_summary = await self.staging.process_response(
                intent_id=intent_id,
                phase=phase,
                raw_text=raw_response
            )
            
            logger.info(f"✅ Fase completada. Archivos en Staging: {changes_summary['file_count']}")

        except Exception as e:
            logger.error(f"❌ Error crítico en Engine: {str(e)}", exc_info=True)
            raise e

    def _get_system_instruction(self, phase: str) -> str:
        """
        Selecciona la personalidad de la IA según la fase.
        Esto podría leerse de archivos .core/.instructions.bl
        """
        # TODO: Leer esto dinámicamente de .core/
        if phase == "briefing":
            return "Eres un Arquitecto de Software analizando requerimientos..."
        elif "doc" in phase:
            return "Eres un Redactor Técnico Experto. La verdad está en el código..."
        else:
            return "Eres un Ingeniero Senior (Top 0.1%). Escribe código defensivo y limpio..."