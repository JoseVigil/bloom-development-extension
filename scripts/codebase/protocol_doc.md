# Files Compression Protocol v2.0

Este documento describe el formato estándar para archivos `.codebase.json` y `.docbase.json` comprimidos para consumo de AI.

## 🎯 Propósito

Crear paquetes compactos de código o documentación que:
- Minimicen el uso de tokens en contextos de AI
- Preserven la legibilidad y estructura del código
- Permitan extracción selectiva de archivos
- Mantengan integridad mediante hashes

---

## 📦 Estructura de Archivos

Cada compresión genera **2 archivos**:

### 1. Archivo Principal (`.codebase.json` / `.docbase.json`)

Contiene el contenido completo comprimido:

```json
{
  "_protocol": {
    "version": "2.0",
    "format": "codebase_compressed",
    "compression": "gzip+base64",
    "encoding": "utf-8"
  },
  "meta": {
    "source_directory": "/path/to/source",
    "generated_at": "2024-01-15T10:30:00Z",
    "mode": "codebase",
    "total_files": 42,
    "compression_stats": {
      "original_size_bytes": 524288,
      "compressed_size_bytes": 131072,
      "compression_ratio_percent": 75.0
    },
    "languages": {
      "typescript": 15,
      "python": 10,
      "javascript": 8
    }
  },
  "files": [
    {
      "p": "src/index.ts",
      "l": "typescript",
      "h": "a1b2c3d4e5f6...",
      "c": "gz:H4sIAAAAAAAA/..."
    }
  ],
  "usage": {
    "decompression": "Use files_extractor.py to decompress",
    "command": "python files_extractor.py --input .codebase.json",
    "protocol_doc": "See PROTOCOL.md for format specification"
  }
}
```

### 2. Archivo Índice (`.codebase_index.json` / `.docbase_index.json`)

Índice ligero para navegación rápida sin descomprimir:

```json
{
  "_index_version": "2.0",
  "mode": "codebase",
  "summary": {
    "total_files": 42,
    "total_size_bytes": 524288,
    "total_compressed_bytes": 131072,
    "average_compression_ratio": 75.0,
    "languages": {
      "typescript": 15,
      "python": 10
    }
  },
  "by_directory": {
    "src": {
      "file_count": 15,
      "files": [
        {
          "p": "src/index.ts",
          "l": "typescript",
          "h": "a1b2c3d4e5f6...",
          "s": 1024,
          "cs": 256,
          "loc": 45,
          "ratio": 75.0
        }
      ]
    }
  },
  "all_files": [...]
}
```

---

## 🔑 Campos Clave

### Archivo Principal

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `_protocol.version` | string | Versión del protocolo (actual: "2.0") |
| `_protocol.compression` | string | Método de compresión ("gzip+base64") |
| `meta.mode` | string | "codebase" o "docbase" |
| `meta.generated_at` | string | Timestamp ISO 8601 UTC |
| `files[].p` | string | Path relativo del archivo |
| `files[].l` | string | Lenguaje detectado |
| `files[].h` | string | Hash MD5 del contenido original |
| `files[].c` | string | Contenido comprimido (formato: `gz:base64data`) |

### Archivo Índice

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `_index_version` | string | Versión del índice |
| `summary` | object | Estadísticas agregadas |
| `by_directory` | object | Archivos agrupados por directorio |
| `all_files[].s` | int | Tamaño original en bytes |
| `all_files[].cs` | int | Tamaño comprimido en bytes |
| `all_files[].loc` | int | Líneas de código (sin blanks) |
| `all_files[].ratio` | float | Ratio de compresión (%) |

---

## 🗜️ Formato de Compresión

### Método: gzip + base64

Cada archivo se comprime en 3 pasos:

1. **Normalización**: Whitespace optimizado (mantiene estructura)
2. **Compresión gzip**: Algoritmo estándar de compresión
3. **Codificación base64**: Para transporte seguro en JSON

### Formato del campo `c`:

```
gz:H4sIAAAAAAAA/3WPQQ7CMAxE7z6F5QUI...
│  └─────────────────────────────────┘
│              base64 data
└─ Prefijo identificador
```

### Descompresión (Python):

```python
import gzip
import base64

def decompress(compressed_content: str) -> str:
    # Remover prefijo 'gz:'
    encoded = compressed_content[3:]
    
    # Decodificar base64
    compressed_bytes = base64.b64decode(encoded.encode('ascii'))
    
    # Descomprimir gzip
    decompressed_bytes = gzip.decompress(compressed_bytes)
    
    # Decodificar UTF-8
    return decompressed_bytes.decode('utf-8')
```

### Descompresión (JavaScript/TypeScript):

```typescript
import pako from 'pako';

function decompress(compressedContent: string): string {
    // Remover prefijo 'gz:'
    const encoded = compressedContent.slice(3);
    
    // Decodificar base64
    const compressed = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
    
    // Descomprimir gzip
    const decompressed = pako.inflate(compressed);
    
    // Decodificar UTF-8
    return new TextDecoder().decode(decompressed);
}
```

---

## 🔍 Lenguajes Soportados

### Codebase (código fuente)

| Extensión | Lenguaje |
|-----------|----------|
| `.py` | python |
| `.ts`, `.tsx` | typescript |
| `.js`, `.jsx` | javascript |
| `.java` | java |
| `.cpp`, `.c` | cpp, c |
| `.go` | go |
| `.rs` | rust |
| `.rb` | ruby |
| `.php` | php |
| `.html`, `.css` | html, css |
| `.json`, `.yaml` | json, yaml |
| `.sh`, `.bat` | bash, batch |

### Docbase (documentación)

| Extensión | Lenguaje |
|-----------|----------|
| `.md` | markdown |
| `.bl` | markdown (BloomLang) |
| `.txt` | text |
| `.rst` | restructuredtext |

---

## 📊 Integridad de Datos

### Hash MD5

Cada archivo incluye un hash MD5 del contenido **original** (no comprimido):

```python
import hashlib

def calculate_hash(content: str) -> str:
    return hashlib.md5(content.encode('utf-8')).hexdigest()
```

### Verificación

Al extraer, el sistema puede verificar integridad:

```python
original_content = decompress(file['c'])
actual_hash = calculate_hash(original_content)

if actual_hash != file['h']:
    print(f"⚠️ Hash mismatch: {file['p']}")
```

---

## 🚀 Uso con AI

### Para Claude/GPT

1. **Subir archivo índice primero** (`.codebase_index.json`)
   - Permite al AI explorar estructura sin cargar todo
   - Identifica archivos relevantes por nombre/directorio

2. **Subir archivo principal** (`.codebase.json`)
   - Contiene el código comprimido
   - AI puede solicitar archivos específicos

3. **Instrucciones al AI**:

```markdown
He subido un codebase comprimido en formato v2.0. 

Archivos disponibles:
- .codebase_index.json (índice, revisar primero)
- .codebase.json (contenido comprimido)

Para descomprimir usa:
```python
import gzip, base64
content = gzip.decompress(base64.b64decode(file['c'][3:])).decode('utf-8')
```

Analiza el índice y dime qué archivos quieres que descomprima.
```

### Ventajas para AI

- ✅ **Tokens reducidos**: 60-80% menos espacio
- ✅ **Navegación eficiente**: Índice separado
- ✅ **Extracción selectiva**: No cargar todo en memoria
- ✅ **Estructura preservada**: Código sigue siendo legible
- ✅ **Comentarios preservados**: Contexto mantenido

---

## 🔧 Herramientas

### Compresión

```bash
# Generar codebase
python files_compressor.py --mode codebase --input ./src

# Generar docbase  
python files_compressor.py --mode docbase --input ./docs

# Con exclusiones
python files_compressor.py --mode codebase --input . --exclude tests,node_modules
```

### Extracción

```bash
# Extraer todo
python files_extractor.py --input .codebase.json

# Ver índice
python files_extractor.py --input .codebase_index.json --show-index --detailed

# Extraer archivo específico
python files_extractor.py --input .codebase.json --file src/app.ts
```

---

## 🔄 Migración desde v1.0

Si tienes archivos en formato anterior (texto plano):

1. El extractor v2.0 detecta automáticamente formato legacy
2. Para regenerar en v2.0: usar `files_compressor.py`
3. Backward compatibility: archivos v1.0 siguen funcionando

---

## 📝 Mejores Prácticas

### Para Desarrollo

- ✅ Mantener comentarios (importante para AI)
- ✅ Excluir `node_modules`, `.git`, tests si no son necesarios
- ✅ Generar índice siempre (navegación rápida)
- ✅ Verificar hashes en producción

### Para AI Consumption

- ✅ Subir índice primero, luego contenido
- ✅ Usar extracción selectiva para archivos grandes
- ✅ Documentar estructura en prompt inicial
- ✅ Mencionar protocolo v2.0 al AI

### Para Almacenamiento

- ✅ Comprimir codebases >100KB siempre
- ✅ Separar codebase de docbase si es mixto
- ✅ Versionar archivos: `.codebase.v1.json`, `.codebase.v2.json`

---

## 🐛 Troubleshooting

### Error: "Formato de compresión no reconocido"

**Causa**: Archivo sin prefijo `gz:` o formato corrupto  
**Solución**: Verificar que `file['c']` empiece con `gz:`

### Error: "Hash mismatch"

**Causa**: Archivo modificado o corrupción en transmisión  
**Solución**: Regenerar con `files_compressor.py` o usar `--no-verify`

### Error: "UnicodeDecodeError"

**Causa**: Archivo con encoding no UTF-8  
**Solución**: Convertir archivos a UTF-8 antes de comprimir

---

## 📄 Licencia y Versioning

- **Versión actual**: 2.0
- **Retrocompatibilidad**: v1.0 soportado
- **Próximas versiones**: Mantendrán compatibilidad con v2.0

---

## 🔗 Referencias

- [gzip - RFC 1952](https://www.ietf.org/rfc/rfc1952.txt)
- [Base64 - RFC 4648](https://www.ietf.org/rfc/rfc4648.txt)
- [MD5 - RFC 1321](https://www.ietf.org/rfc/rfc1321.txt)

---

**Generado por**: files_compressor.py v2.0  
**Fecha**: 2024-12-11  
**Formato**: Protocol v2.0
