Este archivo JSON contiene un codebase comprimido con gzip+base64.

Los archivos tienen el campo "c" (content). Si el contenido inicia con "gz:", 
está comprimido y debes descomprimirlo así:

import gzip
import base64

# Para leer un archivo comprimido:
compressed_data = file["c"][3:]  # Quitar prefijo "gz:"
decoded = base64.b64decode(compressed_data)
content = gzip.decompress(decoded).decode("utf-8")

Por favor confirma que puedes leer el codebase mostrándome:
1. Cuántos archivos hay
2. El base path del proyecto