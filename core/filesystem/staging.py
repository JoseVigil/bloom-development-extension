from pathlib import Path
from core.intelligence.response_parser import ResponseParser

class StagingArea:
    def __init__(self, root: Path):
        self.root = root
        self.parser = ResponseParser()

    async def process_response(self, intent_id: str, phase: str, raw_text: str) -> dict:
        """
        1. Guarda el Raw Output.
        2. Extrae bloques de código.
        3. Escribe en .staging/
        """
        base_path = self.root / ".bloom" / ".intents" / ".dev" / intent_id / ".pipeline" / phase
        response_path = base_path / ".response"
        response_path.mkdir(parents=True, exist_ok=True)
        
        # 1. Guardar Raw
        (response_path / ".raw_output.txt").write_text(raw_text, encoding="utf-8")
        
        # 2. Parsear
        extracted_files = self.parser.extract_code_blocks(raw_text)
        
        # 3. Escribe en Staging
        staging_dir = response_path / ".staging"
        staging_dir.mkdir(exist_ok=True)
        
        count = 0
        for file_data in extracted_files:
            # Replicar estructura de directorios dentro de staging
            # ej: staging/src/host/main.cpp
            target_path = staging_dir / file_data['path']
            target_path.parent.mkdir(parents=True, exist_ok=True)
            target_path.write_text(file_data['content'], encoding="utf-8")
            count += 1
            
        return {"file_count": count, "files": [f['path'] for f in extracted_files]}