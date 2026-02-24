# 📋 SECCIÓN A INSERTAR EN `unified_command_prompt.md`
# Ubicación sugerida: después de "CATEGORÍAS DISPONIBLES", antes del "CHECKLIST PRE-ENTREGA"
# También agregar los items marcados con [LOGGING] al checklist existente.

---

## 📝 LOGGING: CUÁNDO Y CÓMO REGISTRAR UN STREAM

> **Referencia completa**: `BLOOM_NUCLEUS_LOGGING_SPEC.md`
> Para todo lo que no esté cubierto aquí, esa spec es la fuente de verdad.

---

### ¿Necesita mi comando un log propio?

**SÍ** — si el comando produce actividad persistente relevante para debugging o monitoreo:
- Genera archivos de output (trace files, reports, análisis)
- Ejecuta operaciones de larga duración con múltiples etapas
- Es invocado repetidamente y su historial importa para correlacionar problemas

**NO** — si el comando es una consulta puntual o lectura:
- Lee y muestra información existente
- Retorna en menos de 1 segundo sin efectos secundarios
- Su output ya queda capturado en otro stream existente

**Ejemplos en este codebase**:
| Comando | ¿Log propio? | Razón |
|---|---|---|
| `brain chrome read-log` | ✅ Sí | Genera `_engine_read.log` por launch |
| `brain nucleus logs --launch` | ✅ Sí | Genera `trace_<launch_id>.log` |
| `brain profile list` | ❌ No | Consulta puntual, sin output persistente |
| `brain context generate` | ✅ Sí | Output que necesita trazabilidad |

---

### Categorías válidas para `--category` en telemetría

⚠️ **IMPORTANTE**: Estas categorías son distintas al `CommandCategory` enum del CLI de Brain.

Las categorías válidas para `nucleus telemetry register --category` son:

```
brain       sentinel    nucleus
synapse     conductor   launcher
build
```

Un stream puede pertenecer a múltiples categorías. Usar `--category` una vez por cada una:
```bash
--category brain --category synapse
```

**Regla práctica**: si el comando vive en `brain/commands/`, la categoría principal es `brain`.
Si su output alimenta directamente un flujo de Synapse o Nucleus, agregar esa categoría también.

---

### Aplicación de origen: campo `--source`

El campo `source` identifica **qué aplicación/binario escribe** el stream. Es opcional y se va migrando de a poco, pero todo stream nuevo debe incluirlo.

**Valores válidos**:
```
nucleus     sentinel    brain
conductor   launcher    host
```

Se pasa como flag al registrar:
```bash
nucleus telemetry register \
  --stream brain_core \
  --source brain \
  ...
```

En el JSON resultante aparece solo si está presente (campo opcional):
```json
"brain_core": {
  "label": "🧠 BRAIN CORE",
  "path": "C:/.../brain_core_20260224.log",
  "source": "brain",
  ...
}
```

**Cuándo incluirlo**: siempre en streams nuevos. Para streams existentes, agregar en la próxima vez que se toque el código de registro.

**Regla de oro**: `source` = el ejecutable que tiene el `open()` del archivo. Si brain.exe abre y escribe el log, `source` es `"brain"`. Si nucleus.exe lo crea via `InitLogger`, es `"nucleus"`.

---

### Convenciones de naming obligatorias

**stream_id** — identificador estable en `telemetry.json`:
```
brain_<modulo>           # ✅ brain_chrome_analyzer
brain_<modulo>_<sub>     # ✅ brain_context_generator
```
- Siempre lowercase
- Siempre snake_case — nunca kebab-case (`brain-chrome` ❌)
- Nunca renombrar una vez publicado

**Filename** del log:
```
brain_<modulo>_YYYYMMDD.log    # ✅ brain_chrome_analyzer_20260222.log
```
- Siempre lowercase
- Separador: underscore `_`
- Extensión obligatoria: `.log`

**Directorio**:
```
logs/brain/<subfolder>/        # ✅ logs/brain/chrome/
```
- Nunca en `logs/` root directamente
- Crear el directorio si no existe antes de escribir

---

### Patrón de implementación completo

#### En el Core Layer (`brain/core/<dominio>/manager.py`)

```python
import subprocess
from pathlib import Path
from datetime import datetime


class MiManager:

    def _get_log_path(self, base_logs_dir: Path) -> Path:
        """Determina la ruta del log file para hoy."""
        date_str = datetime.now().strftime("%Y%m%d")
        log_dir = base_logs_dir / "brain" / "mi_modulo"
        log_dir.mkdir(parents=True, exist_ok=True)
        return log_dir / f"brain_mi_modulo_{date_str}.log"

    def _register_log_stream(self, log_path: Path) -> None:
        """
        Registra el log en telemetry.json via nucleus CLI.
        
        NUNCA modificar telemetry.json directamente.
        Nucleus es el único writer autorizado.
        """
        subprocess.run([
            "nucleus", "telemetry", "register",
            "--stream",      "brain_mi_modulo",
            "--label",       "🔧 MI MODULO",
            "--path",        str(log_path).replace("\\", "/"),
            "--priority",    "2",
            "--category",    "brain",
            "--source",      "brain",
            "--description", "Brain mi-modulo log — describe qué captura y quién lo escribe",
        ], check=True)

    def ejecutar(self, base_logs_dir: Path, ...) -> dict:
        log_path = self._get_log_path(base_logs_dir)
        self._register_log_stream(log_path)
        
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(f"[{datetime.utcnow().isoformat()}Z] INFO: Operación iniciada\n")
        
        # ... resto de la lógica
```

#### En el CLI Layer (`brain/commands/<categoria>/mi_comando.py`)

El CLI layer no gestiona logs directamente — delega al Core. Solo necesita pasar `gc.paths.logs_dir`:

```python
from brain.core.mi_dominio.manager import MiManager

manager = MiManager()
data = manager.ejecutar(
    base_logs_dir=Path(gc.paths.logs_dir),
    ...
)
```

---

### Campo `path`: string simple o array

El campo `path` acepta un string o un array de strings. El JSON se adapta automáticamente:

```json
// String simple — un solo archivo (caso más común)
"path": "C:/logs/brain/core/brain_core_20260224.log"

// Array — múltiples archivos asociados al mismo stream
"path": [
  "C:/logs/brain/core/brain_core_20260224.log",
  "C:/logs/brain/core/brain_core_20260223.log"
]
```

**Cuándo usar array**: cuando un stream lógico tiene múltiples archivos físicos (ej: rotación diaria que querés mantener asociada, o un proceso que escribe en dos destinos simultáneamente).

**Cómo registrar múltiples paths via CLI**:
```bash
# Pasar --path una vez por cada archivo
nucleus telemetry register \
  --stream brain_core \
  --label "🧠 BRAIN CORE" \
  --path "C:/logs/brain/core/brain_core_20260224.log" \
  --path "C:/logs/brain/core/brain_core_20260223.log" \
  --priority 2 \
  --category brain \
  --source brain \
  --description "Brain core log — múltiples días"
```

**Cómo leer el path en código Go** (usa `.Primary()` para compatibilidad):
```go
stream := tf.ActiveStreams["brain_core"]

// Leer el path principal (backwards compatible)
mainPath := stream.Path.Primary()

// Iterar todos los paths
for _, p := range stream.Path {
    // procesar cada archivo
}
```

**Desde Python** (via `nucleus telemetry register`):
```python
# Un path
subprocess.run([
    "nucleus", "telemetry", "register",
    "--path", str(log_path).replace("\\", "/"),
    ...
])

# Múltiples paths
cmd = ["nucleus", "telemetry", "register", ...]
for p in log_paths:
    cmd += ["--path", str(p).replace("\\", "/")]
subprocess.run(cmd, check=True)
```

⚠️ **Importante**: cuando un stream tiene un solo path, el JSON lo serializa como string simple para mantener compatibilidad con el JSON existente. Solo se serializa como array cuando hay 2 o más paths.

---

### Streams con múltiples archivos (patrón alternativo)

Si cada archivo es conceptualmente independiente (ej: un trace por launch_id), registrar cada uno por separado. Cada archivo = una llamada a `nucleus telemetry register`.

```python
# ✅ Un registro por archivo cuando cada uno es independiente
for launch_id, log_path in generated_files.items():
    subprocess.run([
        "nucleus", "telemetry", "register",
        "--stream",   f"brain_trace_{launch_id}",
        "--label",    f"🔍 TRACE {launch_id}",
        "--path",     str(log_path).replace("\\", "/"),
        "--priority", "3",
        "--category", "brain",
        "--category", "synapse",
        "--source",   "brain",
        "--description", f"Synapse trace autocontenido para launch {launch_id}",
    ], check=True)
```

**Regla de decisión**:
- ¿Los archivos son del mismo proceso continuo (ej: rotación diaria)? → **array en un solo stream**
- ¿Cada archivo pertenece a una ejecución distinta (ej: por launch_id)? → **stream separado por archivo**

---

### Niveles de prioridad

| Prioridad | Usar cuando... | Ejemplos |
|---|---|---|
| `1` (Critical) | Errores fatales, seguridad, componentes del sistema base | crash logs, auth failures |
| `2` (Important) | Operaciones principales, warnings, eventos significativos | launch traces, análisis Chrome |
| `3` (Informational) | Debug, output de herramientas, info complementaria | mining logs, build info |

---

### Nota sobre `telemetry.json.lock`

El archivo `telemetry.json.lock` que aparece en disco es creado por `supervisor.go` usando `github.com/gofrs/flock`. **Es normal y benigno** — `flock` no lo borra después de liberar el lock porque el archivo es el mecanismo de coordinación entre procesos.

Si ves este archivo en disco: no lo borres manualmente mientras nucleus esté corriendo. Es seguro borrarlo cuando el servicio no está activo.

El supervisor escribe en `telemetry.json` directamente (sin pasar por `nucleus telemetry register`) para registrar el estado del Temporal Server. Eso está siendo migrado para usar la API tipada.

---

### Errores comunes de logging

| ❌ Incorrecto | ✅ Correcto |
|---|---|
| Abrir y modificar `telemetry.json` directamente | Usar `nucleus telemetry register` siempre |
| Un solo `register` para múltiples archivos independientes | Un `register` por archivo cuando cada uno tiene identidad propia |
| `--category BRAIN` o `--category Brain` | `--category brain` — siempre lowercase |
| `--category CHROME` del enum CLI de Brain | `--category brain` — son categorías distintas |
| Proveer `last_update` como parámetro | Nucleus lo genera automáticamente, no pasarlo |
| Log file en `logs/brain_mi_modulo.log` | Log file en `logs/brain/mi_modulo/brain_mi_modulo_YYYYMMDD.log` |
| stream_id `brain-mi-modulo` | stream_id `brain_mi_modulo` — snake_case, no kebab |
| Renombrar un stream_id existente | El stream_id es estable y permanente |
| Omitir `--description` | Siempre requerido — describe quién escribe y qué captura |
| Omitir `--source` en streams nuevos | Agregar `--source` en todo stream nuevo |
| Usar timestamps locales (`time.Now()`) | Siempre UTC: `time.Now().UTC().Format(time.RFC3339)` |

---

## ✅ ITEMS A AGREGAR AL CHECKLIST PRE-ENTREGA

Insertar al final de las secciones **CLI Layer** y **Core Layer** existentes:

```
**Logging (si el comando genera output persistente):**
- [ ] Decidido si el comando necesita log propio (ver criterio arriba)
- [ ] Log file en subcarpeta correcta: logs/brain/<subfolder>/
- [ ] Filename sigue formato: brain_<modulo>_YYYYMMDD.log (todo lowercase)
- [ ] `nucleus telemetry register` invocado al inicio de la operación
- [ ] Un registro separado por cada archivo con identidad propia
- [ ] Array de paths para archivos del mismo proceso continuo (rotación diaria, etc.)
- [ ] stream_id en lowercase snake_case: brain_<modulo>
- [ ] Al menos una --category válida (brain/nucleus/sentinel/synapse/etc.)
- [ ] Categoría de telemetría ≠ CommandCategory del enum CLI
- [ ] Multi-categoría con --category repetido (no coma-separado)
- [ ] --source especifica qué binario escribe el log (brain/nucleus/sentinel/etc.)
- [ ] --description describe quién escribe el log y qué captura
- [ ] Priority level apropiado (1/2/3)
- [ ] NO modificar telemetry.json directamente
- [ ] NO pasar last_update manualmente
- [ ] Timestamps en UTC (time.Now().UTC() en Go, datetime.utcnow() en Python)
```