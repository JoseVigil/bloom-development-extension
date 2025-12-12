import google.generativeai as genai
from core.config import settings
import logging

logger = logging.getLogger("bloom_ai")

class LLMClient:
    def __init__(self, api_key: str):
        genai.configure(api_key=api_key)
        
    async def request_router(self, prompt: str, system_instruction: str) -> str:
        """
        Usa Gemini Flash para tareas de organización y JSON.
        """
        return await self._call_model(
            model_name=settings.ROUTER_MODEL, # "gemini-1.5-flash"
            prompt=prompt,
            system_instruction=system_instruction,
            json_mode=True
        )

    async def request_completion(self, payload: dict, system_instruction: str) -> str:
        """
        Usa Gemini Pro para generación de contenido de alta calidad.
        Recibe el payload hidratado (dict) y lo convierte a string/tokens.
        """
        # Convertimos el dict a string JSON o formato legible para el prompt
        prompt_content = str(payload) 
        
        return await self._call_model(
            model_name=settings.WRITER_MODEL, # "gemini-1.5-pro"
            prompt=prompt_content,
            system_instruction=system_instruction,
            json_mode=False
        )

    async def _call_model(self, model_name: str, prompt: str, system_instruction: str, json_mode: bool) -> str:
        generation_config = {
            "temperature": 0.2,
            "max_output_tokens": 8192
        }
        if json_mode:
            generation_config["response_mime_type"] = "application/json"

        model = genai.GenerativeModel(
            model_name=model_name,
            system_instruction=system_instruction,
            generation_config=generation_config
        )

        try:
            # TODO: Aquí implementar lógica de reintentos/backoff
            response = model.generate_content(prompt)
            return response.text
        except Exception as e:
            logger.error(f"Error llamando a Gemini ({model_name}): {e}")
            raise e