"""
BTIP Core - ai.submit command (Native Bridge Version / TCP Mode)
Generates submission commands for the Native Host/Extension system.
"""
import sys
import json
import logging
import uuid
import time
import socket
import struct
from pathlib import Path
from typing import Dict, Any, Optional

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - [CORE] - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuración del Host Bloom (Debe coincidir con bloom-host.cpp)
HOST_IP = '127.0.0.1'
HOST_PORT = 5678

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
    
    # Soporte para rutas relativas o absolutas
    if 'index' not in args or 'payload' not in args:
        raise ValueError("Usage: --index <path> --payload <path>")
    
    return Path(args['index']), Path(args['payload'])

def send_to_host(message_dict: Dict[str, Any]) -> Dict[str, Any]:
    """
    Envía el mensaje al Host C++ vía TCP usando el protocolo de 4-bytes header.
    """
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(5) # 5 segundos de timeout
            s.connect((HOST_IP, HOST_PORT))
            
            # 1. Serializar JSON
            json_str = json.dumps(message_dict)
            json_bytes = json_str.encode('utf-8')
            
            # 2. Crear Header (4 bytes, Little Endian) con el tamaño
            header = struct.pack('<I', len(json_bytes))
            
            # 3. Enviar
            s.sendall(header + json_bytes)
            logger.info(f"📡 Enviado payload ({len(json_bytes)} bytes) al puerto {HOST_PORT}")
            
            # 4. Esperar Respuesta
            resp_header = s.recv(4)
            if not resp_header:
                return {"status": "error", "message": "No response header from Host"}
            
            resp_len = struct.unpack('<I', resp_header)[0]
            
            chunks = []
            bytes_recd = 0
            while bytes_recd < resp_len:
                chunk = s.recv(min(resp_len - bytes_recd, 4096))
                if not chunk: break
                chunks.append(chunk)
                bytes_recd += len(chunk)
            
            resp_data = b''.join(chunks).decode('utf-8')
            return json.loads(resp_data)

    except ConnectionRefusedError:
        logger.error(f"❌ No se pudo conectar a {HOST_IP}:{HOST_PORT}. ¿Está corriendo bloom-host.exe?")
        raise
    except Exception as e:
        logger.error(f"❌ Error de comunicación: {e}")
        raise

def main() -> int:
    try:
        # 1. Preparación de Archivos
        index_path, payload_path = parse_arguments()
        
        if not index_path.exists() or not payload_path.exists():
            logger.error(f"Files not found: {index_path} or {payload_path}")
            return 1

        # Leer Index (Metadata)
        with open(index_path, 'r', encoding='utf-8') as f:
            index_data = json.load(f)
            
        # Leer Payload (Contenido)
        with open(payload_path, 'r', encoding='utf-8') as f:
            payload_data = json.load(f)

        command_id = index_data.get("intent_id", str(uuid.uuid4()))
        
        # 2. Construcción del Mensaje (Protocolo Host-Extension)
        message = {
            "id": command_id,
            "command": "claude.submit",
            "payload": {
                "provider": index_data.get("provider", "claude"),
                "text": payload_data.get("content", ""),
                "context_files": payload_data.get("context_files", []), # Array vacío en tu ejemplo
                "parameters": payload_data.get("parameters", {}),
                "profile": index_data.get("profile_path", "")
            },
            "timestamp": time.time()
        }
        
        logger.info(f"Generated Command ID: {command_id}")
        
        # 3. Despacho Vía TCP (Directo al Host)
        response = send_to_host(message)
        
        logger.info(f"✅ Host Response: {json.dumps(response)}")
        
        # Generar reporte standard out (para que el orquestador lo lea)
        print(json.dumps({
            "status": "dispatched",
            "host_response": response,
            "timestamp": time.time()
        }, indent=2))
        
        return 0

    except Exception as e:
        logger.exception("Dispatcher failed")
        print(json.dumps({"status": "error", "message": str(e)}))
        return 1

if __name__ == '__main__':
    sys.exit(main())