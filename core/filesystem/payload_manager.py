from pathlib import Path
from core.adapters.legacy_bridge import LegacyAdapter

class PayloadManager:
    def __init__(self, root: Path):
        self.root = root
        self.adapter = LegacyAdapter(root) # Puente a tus scripts de lectura

    async def build_payload(self, context_plan: dict, intent_state: dict) -> dict:
        """
        Construye el objeto final que se enviará a Gemini Pro.
        """
        payload = {
            "meta": intent_state,
            "context": {
                "critical": [],
                "high": []
            }
        }
        
        # Iterar sobre el plan y leer contenido real
        for file_entry in context_plan.get('files', []):
            path = file_entry['path']
            priority = file_entry['priority'] # 'critical' | 'high'
            
            # Usar el adaptador legacy para leer (maneja gzip si es necesario)
            content = self.adapter.read_file_content(path)
            
            if priority.lower() == 'critical':
                payload["context"]["critical"].append({"path": path, "content": content})
            else:
                payload["context"]["high"].append({"path": path, "content": content})
                
        return payload