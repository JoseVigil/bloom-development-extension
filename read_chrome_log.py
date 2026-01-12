import sys
from collections import deque
import os

if len(sys.argv) < 2:
    print("Uso: python read_chrome_log.py <profile_id>")
    sys.exit(1)

profile_id = sys.argv[1]

# Ruta base de profiles
base_dir = r"C:\Users\josev\AppData\Local\BloomNucleus"

# Archivo de log original
path = fr"{base_dir}\profiles\{profile_id}\chrome_debug.log"

# Carpeta "logs_chrome" al mismo nivel que "profiles"
logs_dir = fr"{base_dir}\logs_chrome"
os.makedirs(logs_dir, exist_ok=True)

# Archivo de salida
output_file = fr"{logs_dir}\chrome_log_{profile_id}.txt"

keyword = "bloom"
before = 5
after = 5

if not os.path.exists(path):
    print(f"ERROR: No existe el archivo:\n{path}")
    sys.exit(1)

buffer = deque(maxlen=before)
after_count = 0

with open(path, "r", errors="ignore") as f, open(output_file, "w", encoding="utf-8") as out:
    for line in f:
        if after_count > 0:
            out.write(line)
            after_count -= 1
            continue

        if keyword.lower() in line.lower():
            out.write("----- CONTEXTO -----\n")
            for l in buffer:
                out.write(l)
            out.write(line)
            after_count = after
            out.write("--------------------\n")

        buffer.append(line)

print(f"Resultado guardado en: {output_file}")
