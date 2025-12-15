"""
BTIP Core - ai.submit command (Native Bridge Version)
Generates submission commands for the Native Host/Extension system.
NO PLAYWRIGHT. NO BROWSERS.
"""
import sys
import json
import logging
import uuid
import time
from pathlib import Path
from typing import Dict, Any, Optional
from dataclasses import dataclass, asdict

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - [CORE] - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuración de IPC (Ajusta esta ruta si tu Host espera los comandos en otro lado)
IPC_DIR = Path(".intent_pipeline/ipc")
IPC_INPUT_FILE = IPC_DIR / "host_input.json"
IPC_OUTPUT_FILE = IPC_DIR / "host_response.json"

@dataclass
class SubmitCommand:
    """Structure of the command sent to the Host/Extension"""
    id: str
    command: str  # "claude.submit"
    payload: Dict[str, Any]
    timestamp: float

def parse_arguments() -> tuple[Path, Path]:
    """Parse CLI arguments (keeps compatibility with existing calls)"""
    args = {}
    i = 1
    while i < len(sys.argv):
        if sys.argv[i].startswith('--'):
            key = sys.argv[i][2:]
            val = sys.argv[i + 1] if i + 1 < len(sys.argv) else ""
            args[key] = val
            i += 2
        else:
            i += 1
    
    if 'index' not in args or 'payload' not in args:
        raise ValueError("Usage: --index <path> --payload <path>")
    
    return Path(args['index']), Path(args['payload'])

def main() -> int:
    try:
        # 1. Preparación
        index_path, payload_path = parse_arguments()
        
        # Leer Index (Metadata)
        with open(index_path, 'r', encoding='utf-8') as f:
            index_data = json.load(f)
            
        # Leer Payload (Contenido)
        with open(payload_path, 'r', encoding='utf-8') as f:
            payload_data = json.load(f)

        # 2. Construcción del Mensaje (Protocolo Host-Extension)
        command_id = str(uuid.uuid4())
        
        # Este es el objeto que la Extensión recibirá en handleHostMessage
        message = SubmitCommand(
            id=command_id,
            command="claude.submit", # Nuevo comando para la extensión
            payload={
                "provider": index_data.get("provider", "claude"),
                "text": payload_data.get("content", ""),
                "context_files": payload_data.get("context_files", []),
                "parameters": payload_data.get("parameters", {})
            },
            timestamp=time.time()
        )
        
        # 3. Despacho (IPC)
        IPC_DIR.mkdir(parents=True, exist_ok=True)
        
        logger.info(f"Generated Command ID: {command_id}")
        logger.info(f"Target: {index_data.get('profile_path')} (via Extension)")
        
        # Escribir el comando para que el Host lo procese
        with open(IPC_INPUT_FILE, 'w', encoding='utf-8') as f:
            json.dump(asdict(message), f, indent=2)
            
        logger.info(f"✅ COMMAND SENT to {IPC_INPUT_FILE}")
        logger.info("Waiting for Host/Extension to execute...")
        
        # NOTA: Aquí el script podría quedarse esperando 'host_response.json'
        # o simplemente terminar y dejar que el orquestador maneje la async.
        # Por ahora, terminamos con éxito de envío.
        
        # Generar reporte preliminar
        report = {
            "status": "dispatched",
            "command_id": command_id,
            "timestamp": time.time()
        }
        print(json.dumps(report, indent=2))
        return 0

    except Exception as e:
        logger.exception("Dispatcher failed")
        print(json.dumps({"status": "error", "message": str(e)}))
        return 1

if __name__ == '__main__':
    sys.exit(main())