import socket
import json
import struct
import argparse
import sys
import time

def send_message(sock, data_dict):
    """
    Empaqueta el mensaje con protocolo Bloom: 
    4 bytes (Little Endian) de longitud + JSON payload
    """
    json_str = json.dumps(data_dict)
    json_bytes = json_str.encode('utf-8')
    header = struct.pack('<I', len(json_bytes))
    sock.sendall(header + json_bytes)

def receive_message(sock):
    """
    Lee la respuesta del Host respetando el protocolo de longitud.
    """
    try:
        # 1. Leer cabecera (4 bytes)
        header = sock.recv(4)
        if not header:
            return None
        
        msg_length = struct.unpack('<I', header)[0]
        
        # 2. Leer cuerpo del mensaje
        chunks = []
        bytes_recd = 0
        while bytes_recd < msg_length:
            chunk = sock.recv(min(msg_length - bytes_recd, 4096))
            if not chunk:
                break
            chunks.append(chunk)
            bytes_recd += len(chunk)
            
        response_bytes = b''.join(chunks)
        return json.loads(response_bytes.decode('utf-8'))
    except Exception as e:
        print(f"❌ Error decodificando respuesta: {e}")
        return None

def main():
    # --- Configuración de Argumentos (Help) ---
    parser = argparse.ArgumentParser(
        description="📡 Bloom Nucleus Bridge - Herramienta de Diagnóstico",
        epilog="Ejemplo: python test_ping.py --port 5678"
    )
    
    parser.add_argument(
        '-p', '--port', 
        type=int, 
        default=5678, 
        help="Puerto TCP del Host (Por defecto: 5678)"
    )
    
    parser.add_argument(
        '--host', 
        type=str, 
        default='127.0.0.1', 
        help="Dirección IP del Host (Por defecto: 127.0.0.1)"
    )

    args = parser.parse_args()

    print(f"\n🔌 Conectando a Bloom Host en {args.host}:{args.port}...")

    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(3) # Timeout rápido para no bloquear
        s.connect((args.host, args.port))
        
        print("✅ CONEXIÓN TCP EXITOSA (El Host C++ está corriendo)")

        # ---------------------------------------------------------
        # PRUEBA 1: PING AL HOST (C++)
        # ---------------------------------------------------------
        print("\n[1/2] Enviando PING al Host...")
        ping_payload = {
            "id": "ping_cmd_01",
            "command": "ping"
        }
        send_message(s, ping_payload)
        resp = receive_message(s)
        
        if resp and resp.get("ok"):
            print(f"   🟢 Host responde OK (Versión: {resp.get('version')})")
        else:
            print(f"   🔴 Respuesta inesperada del Host: {resp}")

        # ---------------------------------------------------------
        # PRUEBA 2: ESTADO DE CHROME
        # ---------------------------------------------------------
        print("\n[2/2] Verificando enlace con Chrome...")
        # Usamos el comando 'get_status' definido en tu bloom-host.cpp
        status_payload = {
            "id": "status_check_01",
            "command": "get_status"
        }
        send_message(s, status_payload)
        status_resp = receive_message(s)

        if status_resp and status_resp.get("ok"):
            details = status_resp.get("status", {})
            chrome_ok = details.get("chrome_connected", False)
            last_act = details.get("last_activity_seconds_ago", -1)
            
            if chrome_ok:
                print(f"   🟢 CHROME CONECTADO: Sí")
                print(f"   ⏱️  Última actividad: hace {last_act} segundos")
            else:
                print(f"   ⚠️  HOST CONECTADO PERO CHROME NO RESPONDE")
                print("       Sugerencia: Reinicia Chrome o verifica que la extensión no tenga errores.")
        else:
            print(f"   🔴 No se pudo obtener estado detallado.")

    except ConnectionRefusedError:
        print(f"❌ ERROR: No se puede conectar al puerto {args.port}.")
        print("   CAUSA PROBABLE: Chrome está cerrado o 'bloom-host.exe' no arrancó.")
        print("   SOLUCIÓN: Abre Chrome y asegúrate que la extensión esté habilitada.")
    except Exception as e:
        print(f"❌ ERROR GENERAL: {e}")
    finally:
        if 's' in locals():
            s.close()
        print("\n🏁 Test finalizado.")

if __name__ == "__main__":
    main()