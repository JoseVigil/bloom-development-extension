import argparse
import json
import datetime
import os

def main():
    parser = argparse.ArgumentParser(description="Update telemetry.json with a new build entry.")
    parser.add_argument("key", help="The key for the entry (e.g., brain_build or sentinel_build)")
    parser.add_argument("label", help="The label for the entry (e.g., 📦 BRAIN BUILD)")
    parser.add_argument("path", help="The path to the log file (e.g., C:\\Users\\josev\\AppData\\Local\\BloomNucleus\\logs\\build\\brain.build.log)")
    args = parser.parse_args()

    # Determine the path to telemetry.json (usando LOCALAPPDATA para ruta dinámica)
    local_appdata = os.environ.get('LOCALAPPDATA')
    if not local_appdata:
        raise EnvironmentError("LOCALAPPDATA environment variable not found.")
    
    # Ruta correcta: dentro de logs/
    logs_dir = os.path.join(local_appdata, 'BloomNucleus', 'logs')
    os.makedirs(logs_dir, exist_ok=True)  # Crea la carpeta si no existe
    
    telemetry_path = os.path.join(logs_dir, 'telemetry.json')

    # Normalize the provided path to use forward slashes
    normalized_path = args.path.replace('\\', '/')

    # Create the new entry
    new_entry = {
        "label": args.label,
        "path": normalized_path,
        "priority": 3,
        "last_update": datetime.datetime.now().isoformat()
    }

    # Load existing data or initialize if file doesn't exist
    if os.path.exists(telemetry_path):
        with open(telemetry_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    else:
        data = {"active_streams": {}}

    # Add or update the entry
    data['active_streams'][args.key] = new_entry

    # Write back to file con encoding UTF-8 y sin escaping de emojis
    with open(telemetry_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

if __name__ == "__main__":
    main()