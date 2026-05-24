# Brain — Estado del Sistema de Intents
> Análisis técnico completo basado en `brain/commands/intent/` · versión del árbol: enero 2026

---

## Tabla de contenidos

1. [Visión general](#1-visión-general)
2. [Estructura de archivos en disco](#2-estructura-de-archivos-en-disco)
3. [Ciclo de vida completo de un intent](#3-ciclo-de-vida-completo-de-un-intent)
4. [Comandos — análisis detallado](#4-comandos--análisis-detallado)
   - 4.1 [create](#41-create)
   - 4.2 [hydrate](#42-hydrate)
   - 4.3 [plan](#43-plan)
   - 4.4 [build-payload](#44-build-payload)
   - 4.5 [lock](#45-lock)
   - 4.6 [submit](#46-submit)
   - 4.7 [download](#47-download)
   - 4.8 [parse](#48-parse)
   - 4.9 [stage](#49-stage)
   - 4.10 [validate](#410-validate)
   - 4.11 [merge](#411-merge)
   - 4.12 [finalize + unlock](#412-finalize--unlock)
   - 4.13 [add-turn](#413-add-turn)
   - 4.14 [recover](#414-recover)
   - 4.15 [update, delete, get, list](#415-update-delete-get-list)
5. [Formatos de compresión del filesystem](#5-formatos-de-compresión-del-filesystem)
6. [El Context Planning Pipeline (Gemini Router)](#6-el-context-planning-pipeline-gemini-router)
7. [El protocolo de submit/download (Native Host Bridge)](#7-el-protocolo-de-submitdownload-native-host-bridge)
8. [Máquina de estados — dev_state.json](#8-máquina-de-estados--dev_statejson)
9. [Sistema de lock y recuperación](#9-sistema-de-lock-y-recuperación)
10. [Dependencias entre módulos del core](#10-dependencias-entre-módulos-del-core)
11. [Gaps y oportunidades de modernización](#11-gaps-y-oportunidades-de-modernización)

---

## 1. Visión general

Un **intent** en Bloom es la unidad de trabajo atómica que encapsula una instrucción de desarrollo (`dev`) o de documentación (`doc`) para ser procesada por un proveedor de AI. El sistema Brain gestiona el ciclo de vida completo: desde la creación de la estructura de directorios hasta la aplicación de los cambios generados al codebase real.

### Tipos de intent

| Tipo | Propósito | Estructura de fases |
|------|-----------|---------------------|
| `dev` | Modificaciones de código | `briefing` → `execution` → `refinement_N` |
| `doc` | Generación/actualización de documentación | `context` → `curation_N` |

### Principios de diseño observados en el código

- **Determinismo (P5):** Solo un intent puede estar activo (locked) a la vez por proyecto.
- **Dual output:** Todos los comandos soportan `--json` y render humano, usando el mismo `gc.output()`.
- **Lazy imports:** Los `from brain.core...` siempre están dentro de la función `execute()`, no en el módulo.
- **IntentManager como fachada:** La mayoría de comandos CLI delegan al `IntentManager` del core. Excepciones: `merge`, `stage`, `validate`, `parse`, `download`, `recover` — que instancian sus propios managers especializados directamente.

---

## 2. Estructura de archivos en disco

### Intent de tipo `dev`

```
.bloom/
└── .intents/
    └── .dev/
        └── .{slug-uuid3}/                     ← carpeta del intent
            │
            ├── .dev_state.json                 ← estado de la máquina (ver §8)
            │
            ├── .briefing/                      ← fase inicial
            │   ├── .briefing.json              ← texto de la instrucción del usuario
            │   ├── .context_dev_plan.json      ← plan generado por Gemini Router
            │   └── .files/
            │       ├── .codebase.json          ← código comprimido (modo codebase)
            │       ├── .codebase_index.json    ← índice estructural del codebase
            │       ├── .docbase.json           ← docs comprimidas (modo docbase)
            │       └── .docbase_index.json     ← índice estructural de los docs
            │
            ├── .execution/                     ← fase de respuesta principal
            │   ├── .answers.json
            │   ├── .context_dev_plan.json
            │   └── .files/  (ídem .briefing)
            │
            ├── .refinement/                    ← fases iterativas (0..N)
            │   └── .turn_X/
            │       ├── .turn.json
            │       ├── .context_dev_plan.json
            │       └── .files/  (ídem .briefing)
            │
            └── .pipeline/                      ← artifacts del pipeline AI
                ├── .briefing/
                │   ├── .payload.json           ← payload optimizado para AI
                │   ├── .index.json             ← índice del payload
                │   └── .response/
                │       ├── .raw_output.txt     ← respuesta cruda del AI
                │       ├── .report.json        ← resultado del parse
                │       └── .staging/           ← archivos listos para merge
                ├── .execution/  (ídem)
                └── .refinement/
                    └── .turn_X/  (ídem)
```

### Intent de tipo `doc`

Misma estructura pero con fases `context` (en lugar de `briefing`) y `curation_N` (en lugar de `refinement_N`), y los planes de contexto se llaman `.context_doc_plan.json`.

### Ubicación en el nucleus

Los intents `dev` y `doc` viven siempre dentro del proyecto (`project/.bloom/.intents/`), no en el nucleus. El nucleus tiene su propia carpeta `.intents/` para intents de exploración (`exp`) y correlación (`cor`), que son un sistema separado.

---

## 3. Ciclo de vida completo de un intent

El flujo principal para un intent `dev` es:

```
CREATE → HYDRATE → PLAN → BUILD-PAYLOAD → LOCK → SUBMIT
                                                      ↓
                                                  DOWNLOAD
                                                      ↓
                                                    PARSE
                                                      ↓
                                                    STAGE
                                                      ↓
                                                  VALIDATE ←─┐
                                                      ↓       │ loop de
                                                  MERGE       │ refinement
                                                      ↓       │ (add-turn)
                                                  FINALIZE ───┘
                                                      ↓
                                                  UNLOCK
```

### Flujo de archivos a través del pipeline

```
[Disco del proyecto]
     │
     ↓ hydrate (code_compressor / files_compressor)
.codebase.json + .codebase_index.json
     │
     ↓ plan (GeminiRouter + EnrichedTreeGenerator)
.context_dev_plan.json
     │
     ↓ build-payload (PayloadBuilder)
.payload.json + .index.json
     │
     ↓ submit (IntentManager → Native Host Bridge TCP:5678)
[AI Provider: Claude / Gemini]
     │
     ↓ download (DownloadManager ← TCP:5679)
.raw_output.txt
     │
     ↓ parse (ResponseParser)
.report.json
     │
     ↓ stage (StagingManager)
.staging/ (espejo del codebase real)
     │
     ↓ validate (ValidationManager + Gemini)
.report.json (validación)
     │
     ↓ merge (MergeManager)
[Archivos aplicados al disco del proyecto]
```

---

## 4. Comandos — análisis detallado

### 4.1 `create`

**Archivo:** `brain/commands/intent/create.py`  
**Core:** `IntentManager.create_intent()`

Primer paso del ciclo. Crea la estructura de directorios completa y el archivo de estado inicial.

**Parámetros:**

| Flag | Alias | Requerido | Descripción |
|------|-------|-----------|-------------|
| `--type` | `-t` | ✅ | `dev` o `doc` |
| `--name` | `-n` | ✅ | Nombre legible. Se slugifica + UUID3 para generar el folder name |
| `--files` | `-f` | ❌ | Archivos iniciales (repetible o comma-separated) |
| `--nucleus-path` | `-p` | ❌ | Auto-detectado desde CWD si se omite |

**Lógica de procesamiento de archivos:**
```python
# Soporta dos formatos:
--files src/auth.py --files src/login.js   # repetido
--files src/auth.py,src/login.js            # comma-separated
```

**Output de éxito (human):**
```
✅ Intent 'Fix login auth' (dev) created successfully
📂 Path: .bloom/.intents/.dev/.fix-login-a1b2c3d4/
📁 Folder: .fix-login-a1b2c3d4
🆔 ID: <uuid>
💡 Next step: brain intent hydrate --intent-id <uuid>
```

**Output de éxito (JSON):**
```json
{
  "status": "success",
  "operation": "intent_create",
  "data": {
    "name": "Fix login auth",
    "type": "dev",
    "intent_id": "<uuid>",
    "intent_path": "...",
    "folder_name": ".fix-login-a1b2c3d4",
    "initial_files": ["src/auth.py"]
  }
}
```

**Nota de diseño:** El `folder_name` se genera como `.{slug}-{uuid3[:8]}`. Cuando se renombra el intent con `update --name`, el folder se renombra también porque se regenera el UUID3 a partir del nuevo nombre.

---

### 4.2 `hydrate`

**Archivo:** `brain/commands/intent/hydrate.py`  
**Core:** `IntentManager.hydrate_intent()`

Paso 2. Comprime los archivos fuente en formato JSON y guarda la instrucción del usuario en `.briefing.json`.

**Parámetros:**

| Flag | Alias | Requerido | Descripción |
|------|-------|-----------|-------------|
| `--id` | `-i` | ✅* | UUID del intent |
| `--folder` | `-f` | ✅* | Nombre de carpeta (alternativo a `--id`) |
| `--briefing` | `-b` | ❌ | Texto de la instrucción directamente |
| `--briefing-file` | `-B` | ❌ | Path a archivo `.md` o `.txt` con la instrucción |
| `--files` | `-F` | ❌ | Archivos a comprimir (comma-separated) |
| `--nucleus-path` | `-p` | ❌ | Auto-detectado |

*Al menos uno de `--id` o `--folder` es requerido.

**Qué produce:**
- `.briefing/.files/.codebase.json` — contenido de los archivos comprimidos
- `.briefing/.files/.codebase_index.json` — árbol estructural del codebase
- `.briefing/.files/.docbase.json` — si hay archivos de documentación
- `.briefing/.briefing.json` — instrucción del usuario

**Output de éxito:**
```
✅ Intent Hydrated Successfully
   ID: <uuid>
   Status: hydrated
   Files Processed: 5
   Context Size: 42.3 KB
   Briefing: Updated
```

**Nota de diseño:** `hydrate` es llamado internamente por el core cuando se necesita re-hidratar en fases de refinement. Los archivos se buscan en el filesystem real del proyecto, no en `.staging/`.

---

### 4.3 `plan`

**Archivo:** `brain/commands/intent/plan.py`  
**Core:** `EnrichedTreeGenerator` + `GeminiRouter` (async)

Genera el plan de contexto que decide qué archivos incluir en el payload y con qué prioridad. Es el único comando del pipeline que usa `asyncio.run()` directamente.

**Parámetros:**

| Flag | Requerido | Descripción |
|------|-----------|-------------|
| `--intent-dir` | ✅ | Path al directorio del intent |
| `--description` | ✅ | Descripción del intent (va al prompt del router) |
| `--type` | ❌ | `dev`, `doc`, o `seed` (default: `dev`) |

**Pipeline interno:**

```
1. Busca .codebase_index.json (briefing → execution → último refinement)
2. EnrichedTreeGenerator.generate() → árbol enriquecido con badges [CORE][LEAF][LARGE][API][ASYNC][DB]
3. GeminiRouter.create_context_plan(enriched_tree, description, type) → JSON con priority_tiers
4. Guarda en .briefing/.context_plan.json
```

**Formato del context plan generado:**
```json
{
  "version": "1.0",
  "intent_type": "dev",
  "priority_tiers": {
    "critical": [{"path": "...", "reason": "..."}],  // máx 10 archivos
    "high":     [{"path": "...", "reason": "..."}],  // máx 20 archivos
    "medium":   [{"path": "...", "reason": "..."}],  // máx 30 archivos
    "low":      ["path/to/file.py"],                  // sin límite
    "excluded": ["path/to/vendor.py"]                 // sin límite
  },
  "metadata": {
    "total_files_analyzed": 150,
    "estimated_tokens": {
      "critical": 8500,
      "high": 12000,
      "medium": 15000,
      "total": 35500                                  // budget: < 40,000
    },
    "reasoning": "...",
    "focus_areas": ["brain/core/filesystem"]
  }
}
```

**Manejo de errores de API:**
```python
except NoAvailableKeysError:
    # Sin keys Gemini disponibles → instrucciones para agregar
except GeminiAPIError as e:
    # Error de la API → mensaje específico
```

**Badges del árbol enriquecido:**

| Badge | Significado | Efecto en priorización |
|-------|-------------|------------------------|
| `[CORE]` | Alta centralidad (muchos archivos dependen de este) | Mayor prioridad si relevante |
| `[LEAF]` | Baja centralidad, aislado | Menor prioridad salvo mención explícita |
| `[LARGE]` | >1000 LOC | Penalizado salvo mención explícita |
| `[API]` | Endpoint/ruta | Priorizado para intents de API |
| `[ASYNC]` | Operaciones async | Priorizado para intents de concurrencia |
| `[DB]` | ORM/Database | Priorizado para intents de datos |

---

### 4.4 `build-payload`

**Archivo:** `brain/commands/intent/build_payload.py`  
**Core:** `PayloadBuilder`

Construye el payload final optimizado para consumo AI a partir del context plan.

**Parámetros:**

| Flag | Requerido | Descripción |
|------|-----------|-------------|
| `--plan` | ✅ | Path al `.context_plan.json` |
| `--output` | ❌ | Path de salida (default: mismo directorio del plan como `.payload.json`) |

**Búsqueda de archivos comprimidos:**

El comando resuelve los archivos `.codebase.json` y `.docbase.json` con esta lógica de fallback:
```
1. intent_dir/.briefing/.files/.codebase.json
2. intent_dir/.execution/.files/.codebase.json
3. intent_dir/.refinement/.turn_N/.files/.codebase.json (último turn)
```

**Estructura del payload generado (`.payload.json`):**
```json
{
  "metadata": {
    "total_files": 25,
    "total_tokens": 35500,
    "breakdown_by_tier": {
      "critical": {"count": 8,  "tokens": 8500},
      "high":     {"count": 12, "tokens": 12000},
      "medium":   {"count": 5,  "tokens": 15000}
    }
  },
  "files": [...]
}
```

**Output de éxito:**
```
✅ Payload built successfully
📦 Output: .pipeline/.briefing/.payload.json

📊 Payload Statistics:
   • Total files:  25
   • Total tokens: 35,500

🎯 Breakdown by Priority:
   • CRITICAL: 8 files (8,500 tokens)
   • HIGH:     12 files (12,000 tokens)
   • MEDIUM:   5 files (15,000 tokens)
```

---

### 4.5 `lock`

**Archivo:** `brain/commands/intent/lock.py`  
**Core:** `IntentManager.lock_intent()`

Implementa el principio de determinismo P5: marca el intent como en uso exclusivo para prevenir modificaciones concurrentes.

**Parámetros:** `--id` / `--folder` / `--nucleus-path`

**Qué escribe en `dev_state.json`:**
```json
{
  "locked": true,
  "locked_by": "<hostname>",
  "locked_at": "<ISO timestamp>",
  "lock_recovery_data": { ... }
}
```

**Nota de diseño:** El campo `lock_recovery_data` es clave para el sistema de recuperación (ver §9). Se persiste junto con el lock para que `recover` pueda retomar el trabajo si el proceso se interrumpe.

---

### 4.6 `submit`

**Archivo:** `brain/commands/intent/submit.py`  
**Core:** `IntentManager.submit_intent()`

Envía el payload al proveedor AI a través del Native Host Bridge (proceso C++ que se comunica con la extensión de Chrome).

**Parámetros:**

| Flag | Alias | Default | Descripción |
|------|-------|---------|-------------|
| `--intent-id` | `-i` | — | UUID del intent |
| `--folder-name` | `-f` | — | Nombre de carpeta |
| `--provider` | — | `claude` | `claude`, `gemini`, `openai`, `custom` |
| `--nucleus-path` | `-p` | auto | Path al nucleus |
| `--profile-path` | — | — | Path al perfil Chrome del proveedor |
| `--host` | — | `127.0.0.1` | IP del host nativo |
| `--port` | — | `5678` | Puerto TCP del host |
| `--timeout` | — | `30` | Timeout de conexión en segundos |

**Flujo de comunicación:**
```
brain intent submit
      │
      ↓ TCP:5678
bloom-host.exe (Native Host C++)
      │
      ↓ Chrome Native Messaging
Chrome Extension (IonPump)
      │
      ↓ DOM injection
AI Provider (claude.ai / gemini.google.com)
```

**Output de éxito:**
```json
{
  "intent_id": "...",
  "intent_name": "Fix login auth",
  "provider": "claude",
  "command_id": "...",
  "host_response": {"status": "ok", "message": "..."},
  "payload_size": 142000,
  "submitted_at": "2026-01-15T..."
}
```

**Validación de providers:**
```python
valid_providers = ["claude", "gemini", "openai", "custom"]
# Si el provider no está en la lista, solo emite warning (no falla)
```

---

### 4.7 `download`

**Archivo:** `brain/commands/intent/download.py`  
**Core:** `brain.core.intent.download_manager.DownloadManager`

Recibe la respuesta del AI provider a través del Native Host Bridge y la persiste en el directorio `.response/`.

**Parámetros:**

| Flag | Default | Descripción |
|------|---------|-------------|
| `--intent-id` / `--folder` | — | Identificador del intent |
| `--socket-mode` | `false` | Escucha en TCP para conexión del Host |
| `--input-file` | — | Lee respuesta desde archivo JSON (modo testing) |
| `--host` | `127.0.0.1` | IP de escucha |
| `--port` | `5679` | Puerto (diferente al de submit: `5678`) |
| `--timeout` | `300` | Timeout en segundos (5 min) |
| `--nucleus-path` | auto | — |

**Modos de operación:**

```
Modo normal:    --socket-mode → escucha TCP:5679 esperando al Host
Modo testing:   --input-file response.json → lee desde archivo
```

Los dos modos son mutuamente excluyentes. Si ninguno se especifica, falla con error.

**Lo que persiste:**
```
.pipeline/{phase}/response/
├── .raw_output.txt     ← respuesta cruda del AI
└── .files/             ← archivos extraídos si el AI los envió directamente
```

**Output de éxito:**
```
✅ Download completed successfully
📋 Intent ID: <id>
🎯 Pipeline Stage: briefing
📄 Raw Output: .pipeline/.briefing/.response/.raw_output.txt
📁 Files Directory: .pipeline/.briefing/.response/.files/
📦 Files Saved: 3
✓ Status: completed

💡 Next: brain intent parse --intent-id <id>
```

**Nota de diseño:** El puerto de download (`5679`) es distinto al de submit (`5678`) por diseño — el Host C++ inicia la conexión de retorno a Brain en un puerto diferente.

---

### 4.8 `parse`

**Archivo:** `brain/commands/intent/parse.py`  
**Core:** `brain.core.intent.response_parser.ResponseParser`

Valida el `.raw_output.txt` contra el protocolo Bloom y genera el `.report.json`.

**Parámetros:**

| Flag | Alias | Default | Descripción |
|------|-------|---------|-------------|
| `--intent-id` | `-i` | requerido | UUID del intent |
| `--stage` | `-s` | auto-detect | `briefing`, `execution`, `refinement_X` |
| `--strict` | — | `false` | Falla ante cualquier violación de protocolo (sin fallback) |
| `--output-report` | — | `true` | Genera `.parse_report.json` |
| `--nucleus-path` | `-n` | CWD | — |

**Qué analiza el ResponseParser:**

```
1. Protocol Validation    → estructura válida del Bloom protocol
2. Files Validation       → archivos referenciados existen en .files/
3. Completion Analysis    → status: complete / partial / failed
4. Questions Analysis     → ¿el AI hizo preguntas? ¿requiere input del usuario?
```

**Estructura del `.report.json` generado:**
```json
{
  "stage": "briefing",
  "protocol_validation": {
    "valid": true,
    "errors": [],
    "warnings": []
  },
  "files_validation": {
    "found": 3,
    "missing": 0
  },
  "completion_analysis": {
    "status": "complete",
    "requires_action": false
  },
  "questions_analysis": {
    "has_questions": false,
    "requires_user_input": false
  },
  "report_path": ".pipeline/.briefing/.response/.parse_report.json"
}
```

**Next step sugerido por el comando según el resultado:**
- Si `requires_action` → revisar manualmente
- Si `requires_user_input` → hay preguntas del AI para responder
- Si todo ok → `brain intent stage --intent-id <id>`

---

### 4.9 `stage`

**Archivo:** `brain/commands/intent/stage.py`  
**Core:** `brain.core.intent.staging_manager.StagingManager`

Lee los archivos del `.response/.files/` y los prepara en un directorio `.staging/` que espeja la estructura real del codebase, listo para aplicar con `merge`.

**Parámetros:**

| Flag | Alias | Default | Descripción |
|------|-------|---------|-------------|
| `--intent-id` | `-i` | — | UUID del intent |
| `--folder` | `-f` | — | Nombre de carpeta |
| `--stage` | `-s` | auto-detect | Fase del pipeline |
| `--dry-run` | — | `false` | Muestra qué se haría sin escribir |
| `--overwrite` | — | `true` | Sobreescribe `.staging/` existente |
| `--nucleus-path` | `-p` | auto | — |

**Qué produce:**
```
.pipeline/{phase}/response/
└── .staging/
    ├── src/
    │   ├── auth.py          ← archivo modificado por el AI
    │   └── login.js
    └── .staging_manifest.json
```

El `.staging/` espeja la estructura de rutas reales del proyecto. Si el AI indicó que `src/auth.py` debe cambiar, en `.staging/src/auth.py` queda la nueva versión lista para ser copiada.

**Output de éxito:**
```
✅ Staged 3 file(s) for intent 'abc12345...'
📁 Stage: briefing
📂 Staging directory: .pipeline/.briefing/.response/.staging/
📋 Manifest: .pipeline/.briefing/.response/.staging/.staging_manifest.json

📦 Staged files:
   ✏️ src/auth.py
   ✏️ src/login.js
   ➕ src/new_feature.py
```

**Iconos de acción:**
- `✏️` = edit (archivo existente modificado)
- `➕` = create (archivo nuevo)

---

### 4.10 `validate`

**Archivo:** `brain/commands/intent/validate.py`  
**Core:** `brain.core.intent.validation_manager.ValidationManager`

Analiza los archivos en `.staging/` usando Gemini AI antes del merge final. Es el único paso del pipeline post-AI que usa otro AI (Gemini) para verificar calidad.

**Parámetros:**

| Flag | Alias | Default | Descripción |
|------|-------|---------|-------------|
| `--intent-id` | `-i` | — | UUID del intent |
| `--folder` | `-f` | — | Nombre de carpeta |
| `--stage` | `-s` | auto | Fase del pipeline |
| `--auto-approve` | — | `false` | Aprueba automáticamente sin revisión manual |
| `--gemini-model` | — | `gemini-2.0-flash-exp` | Modelo de Gemini para análisis |
| `--skip-gemini` | — | `false` | Solo validación básica, sin Gemini |
| `--nucleus-path` | `-p` | auto | — |

**Fases del análisis:**

```
1. Basic Validation
   ├── Archivos presentes en .staging/
   ├── Estructura de directorios válida
   └── Ningún archivo vacío o corrupto

2. Gemini Analysis (si no --skip-gemini)
   ├── Consistency score (0-100)   → coherencia entre archivos
   ├── Quality score (0-100)       → calidad del código generado
   ├── Completeness score (0-100)  → intent completamente implementado
   ├── Risk Assessment             → riesgos potenciales
   └── Recommendation: approve | review_needed | reject
```

**Output del reporte:**
```
======================================================================
📋 VALIDATION REPORT
======================================================================

✓ Basic Validation: PASSED
  Files checked: 3

🤖 Gemini Analysis:
  ✓ Consistency: 92/100
  ✓ Quality: 88/100
  ✓ Completeness: 95/100
  ✅ Recommendation: APPROVE
  📝 Summary: Changes are coherent and implement the intent correctly

======================================================================
✅ Status: APPROVED
✅ Ready for merge: YES
📄 Report saved: .pipeline/.briefing/.response/.report.json
======================================================================
```

---

### 4.11 `merge`

**Archivo:** `brain/commands/intent/merge.py`  
**Core:** `brain.core.intent.merge_manager.MergeManager`

Aplica los archivos de `.staging/` al codebase real del proyecto. Es el paso más crítico — escribe en disco y crea un backup automático antes de hacerlo.

**Parámetros:**

| Flag | Alias | Default | Descripción |
|------|-------|---------|-------------|
| `--intent-id` | `-i` | — | UUID del intent |
| `--folder` | `-f` | — | Nombre de carpeta |
| `--stage` | `-s` | auto-detect | Fase del pipeline |
| `--force` | — | `false` | Salta la verificación de aprobación |
| `--dry-run` | — | `false` | Muestra qué se aplicaría sin escribir |
| `--no-backup` | — | `false` | **PELIGROSO** — deshabilita el backup |
| `--nucleus-path` | `-p` | auto | — |

**Características de seguridad:**
- Backup automático antes de cualquier cambio (salvo `--no-backup`)
- Escritura atómica
- Verificación de `.report.json` aprobado (salvo `--force`)
- Soporte de rollback via backup

**Output modo dry-run:**
```
📋 DRY RUN SUMMARY
   Intent ID: abc-123
   Stage: briefing
   Files that would be merged: 3

💡 Run without --dry-run to apply changes
```

**Output modo real:**
```
✅ Merge completed successfully
   Intent ID: abc-123
   Stage: briefing
   Files merged: 3

💾 Backup created: .bloom/.backups/abc-123-20260115T143022/
   To rollback: brain intent rollback --intent-id abc-123

🎉 Changes applied to codebase
```

**Nota de diseño:** El comando menciona `brain intent rollback` en su output pero ese comando **no existe en el árbol actual** de `brain/commands/intent/`. Es un gap documentado en §11.

---

### 4.12 `finalize` + `unlock`

**Archivos:** `brain/commands/intent/finalize.py` y `brain/commands/intent/unlock.py`  
**Core:** `IntentManager.finalize_intent()` / `IntentManager.unlock_intent()`

`finalize` cierra el intent, actualiza el `dev_state.json` a `status: completed`, y aplica cualquier cambio final pendiente. `unlock` libera el lock del intent.

En práctica, el flujo correcto es `finalize` → `unlock`. El `finalize` puede llamar a `unlock` internamente o pueden ejecutarse por separado.

**Parámetros comunes:** `--id` / `--folder` / `--nucleus-path`

**`unlock` tiene además:**
- `--force`: desbloquea aunque el lock sea de otro host

**Output de finalize:**
```
✅ Intent finalized successfully!
📝 Intent: Fix login auth
🆔 ID: abc-123
📊 Status: completed
🕐 Finalized at: 2026-01-15T14:35:00
📄 Files modified: 3
💡 Changes have been applied to the codebase
🔓 Intent has been unlocked
```

---

### 4.13 `add-turn`

**Archivo:** `brain/commands/intent/add_turn.py`  
**Core:** `IntentManager.add_turn()`

Añade un turno de conversación al intent, creando un nuevo directorio `.refinement/.turn_X/`. Es el punto de entrada del loop iterativo.

**Parámetros:**

| Flag | Alias | Requerido | Descripción |
|------|-------|-----------|-------------|
| `--id` | `-i` | ✅* | UUID del intent |
| `--folder` | `-f` | ✅* | Nombre de carpeta |
| `--actor` | `-a` | ✅ | `user` o `ai` |
| `--content` | `-c` | ✅ | Texto del mensaje |
| `--nucleus-path` | `-p` | ❌ | — |

**Uso típico en el loop de refinement:**
```bash
# El usuario da feedback sobre la respuesta del AI
brain intent add-turn --id abc123 --actor user --content "El fix está bien pero falta el test"

# Esto crea .refinement/.turn_1/
# Luego se vuelve a ejecutar plan → build-payload → submit → download → parse → stage → validate → merge
```

**Output:**
```
💬 Turn added successfully!
📝 Intent: Fix login auth
🔢 Turn ID: turn_1
👤 Actor: user
📂 Path: .refinement/.turn_1/
🕐 Timestamp: 2026-01-15T14:40:00
```

---

### 4.14 `recover`

**Archivo:** `brain/commands/intent/recover.py`  
**Core:** `brain.core.intent.recovery_manager.RecoveryManager`

Sistema de recuperación para intents interrumpidos. Se activa cuando un proceso crashea durante `lock → submit → download`.

**Parámetros:**

| Flag | Descripción |
|------|-------------|
| `--intent-id` / `--folder` | Intent específico a recuperar |
| `--auto-detect` | Escanea todos los intents con locks activos |
| `--force-unlock` | Solo libera el lock sin intentar recuperación |
| `--nucleus-path` | — |

**Modos de recuperación:**

```
1. download_resumed
   → Reabre el browser en la URL guardada en lock_recovery_data
   → La extensión detecta el recovery y continúa el download
   
2. merge_resumed
   → Retoma una operación de merge interrumpida
   
3. force_unlocked
   → Solo libera el lock, sin recuperación
   
4. no_lock
   → El intent no estaba locked, nada que hacer
```

**Escenarios que generan necesidad de recovery:**
- Browser crash durante `submit`/`download`
- Timeout de red
- `kill -9` del proceso brain
- Fallo del sistema

---

### 4.15 `update`, `delete`, `get`, `list`

#### `update`

**Core:** `IntentManager.update_intent()`

Modifica propiedades del intent. Si se cambia el nombre, el folder se renombra automáticamente (regenera UUID3).

**Operaciones de archivos:**

| Flag | Comportamiento |
|------|----------------|
| `--files` | Reemplaza toda la lista |
| `--add-files` | Agrega a la lista existente |
| `--remove-files` | Elimina de la lista existente |

#### `delete`

Elimina el intent completo (estado, turns, pipeline). Pide confirmación interactiva salvo `--force`. Si el intent está locked, lo reporta como warning antes de confirmar.

#### `get`

Retorna el estado completo del intent: metadatos, lock, timestamps, archivos iniciales, steps completados, cantidad de turns. El output humano muestra un panel de estado completo.

#### `list`

Lista todos los intents del proyecto, agrupados por tipo (`dev` / `doc`). Filtra por `--type` si se especifica. La salida muestra: status icon, lock icon, nombre, folder, ID truncado, cantidad de archivos, fecha de creación.

---

## 5. Formatos de compresión del filesystem

El sistema usa tres módulos en `brain/core/filesystem/`:

### `code_compressor.py` — modo `codebase`

Comprime archivos de código fuente en formato JSON optimizado para AI. Produce `.codebase.json` y `.codebase_index.json`.

```json
// .codebase.json — contenido completo
{
  "files": [
    {
      "path": "src/auth.py",
      "content": "...",
      "md5": "abc123",
      "language": "python",
      "size_bytes": 2048
    }
  ]
}

// .codebase_index.json — solo estructura para el plan
{
  "files": [
    {
      "path": "src/auth.py",
      "md5": "abc123",
      "language": "python",
      "linesOfCode": 85,
      "summary": "Authentication handler with JWT validation",
      "keywords": ["auth", "jwt", "login", "session"],
      "badges": ["CORE", "API"]
    }
  ]
}
```

### `files_compressor.py` — modo `docbase`

Comprime archivos de documentación (`.md`, `.txt`, `.rst`, etc.). Produce `.docbase.json` y `.docbase_index.json`. Mismo formato que codebase pero orientado a docs.

### `files_extractor.py`

Extrae archivos desde el formato JSON comprimido de vuelta al filesystem. Usado por `merge_manager` cuando aplica los cambios del AI al codebase real. Soporta verificación de hashes MD5.

### Invocación desde CLI

```bash
# Compresión directa (sin pasar por el pipeline de intents)
brain filesystem compress src/ -m codebase -o output/
brain filesystem compress docs/ -m docbase -o output/

# Extracción
brain filesystem extract .codebase.json -o extracted/

# Árbol
brain filesystem tree src/ --hash --export-json
```

---

## 6. El Context Planning Pipeline (Gemini Router)

### Flujo completo

```
.codebase_index.json
        │
        ↓ EnrichedTreeGenerator
Enriched Tree (texto con badges por archivo)
        │
        ↓ GeminiRouter.create_context_plan()
              │
              └── Prompt del sistema (router_prompt.md)
                        ↓
                  Gemini API (async)
                        ↓
              JSON con priority_tiers
        │
        ↓
.context_dev_plan.json
```

### El system prompt del router (`router_prompt.md`)

El prompt está en `brain/commands/intent/router_prompt.md` y define:

- **Rol:** "Context Planner" — analiza el árbol enriquecido y prioriza archivos
- **Input:** `{enriched_tree}` + `{intent_description}` + `{intent_type}`
- **Token budget:** < 40,000 tokens totales en el payload final
- **Límites de tiers:** CRITICAL ≤ 10, HIGH ≤ 20, MEDIUM ≤ 30
- **Reglas de exclusión:** libs/, node_modules/, `__pycache__/`, build artifacts, configs salvo que el intent sea sobre config
- **Output:** JSON puro (sin markdown, sin texto adicional)

### Escenarios de priorización documentados en el prompt

| Escenario | CRITICAL | HIGH | MEDIUM |
|-----------|----------|------|--------|
| Fix bug en compresión | `files_compressor.py`, `code_compressor.py` | Utils relacionados, tests | CLI commands que usan compresión |
| Add JWT auth a API | Server file, archivos `[API]` | Auth existente, middleware | User models, request handlers |
| Documentar arquitectura | Entry points, orchestrators | Módulos `[CORE]` | Utilities, interfaces |

### Gestión de keys Gemini

El router usa el sistema de keys de Gemini (`brain/shared/credentials/`) con rotación automática por cuota. Los errores están tipificados:
- `NoAvailableKeysError` → sin keys con cuota suficiente
- `GeminiAPIError` → fallo de la API

---

## 7. El protocolo de submit/download (Native Host Bridge)

### Arquitectura de comunicación

```
┌─────────────────┐   TCP:5678   ┌──────────────────────┐
│  brain submit   │ ──────────→  │  bloom-host.exe (C++) │
└─────────────────┘              │  (Native Messaging)   │
                                 └──────────┬───────────┘
                                            │ Chrome Native Messaging
                                            ↓
                               ┌──────────────────────────┐
                               │  Chrome Extension        │
                               │  (IonPump / Bloom Ext)   │
                               └──────────┬───────────────┘
                                          │ DOM automation
                                          ↓
                               ┌──────────────────────────┐
                               │  AI Provider             │
                               │  claude.ai / gemini.ai   │
                               └──────────────────────────┘
                                          │
                                          │ (respuesta del AI)
                                          ↓
                               ┌──────────────────────────┐
                               │  bloom-host.exe (C++)    │
                               └──────────┬───────────────┘
                                          │ TCP:5679
                                          ↓
                               ┌──────────────────────────┐
                               │  brain download          │
                               │  (DownloadManager)       │
                               └──────────────────────────┘
```

### Puertos y timeouts

| Componente | Puerto | Timeout | Dirección |
|------------|--------|---------|-----------|
| submit → host | `5678` | 30s | Brain → Host |
| download ← host | `5679` | 300s (5min) | Host → Brain |

### El `command_id`

El submit genera un `command_id` que identifica la transacción. Este ID se usa para correlacionar el download con el submit correcto cuando hay múltiples intents en vuelo (aunque el sistema de lock previene esto en condiciones normales).

---

## 8. Máquina de estados — `dev_state.json`

### Estados observados en el código

A partir del output de `get.py` y la lógica de `lock`/`finalize`:

```
created → active → completed
```

| Estado | Descripción | Lock |
|--------|-------------|------|
| `created` | Intent recién creado, no hidratado | `false` |
| `active` | En proceso (hidratado, en alguna fase del pipeline) | puede ser `true` |
| `completed` | Finalized exitosamente | `false` |

### Campos del `dev_state.json` (inferidos del código)

```json
{
  "id": "<uuid>",
  "name": "Fix login auth",
  "type": "dev",
  "status": "active",
  "folder_name": ".fix-login-a1b2c3d4",
  "intent_path": "...",
  "initial_files": ["src/auth.py", "src/login.js"],
  "locked": false,
  "locked_by": null,
  "locked_at": null,
  "lock_recovery_data": null,
  "created_at": "2026-01-15T10:00:00",
  "updated_at": "2026-01-15T14:35:00",
  "steps": {
    "hydrated": true,
    "planned": true,
    "payload_built": true,
    "submitted": true,
    "downloaded": true,
    "parsed": true,
    "staged": true,
    "validated": true,
    "merged": true
  },
  "turns_count": 1,
  "project_path": "..."
}
```

Los `steps` permiten saber en qué punto del pipeline está el intent y detectar interrupciones.

---

## 9. Sistema de lock y recuperación

### Flujo del lock

```
brain intent lock
    │
    ↓ IntentManager.lock_intent()
    │   ├── Verifica que no haya otro lock activo
    │   ├── Escribe locked: true en dev_state.json
    │   ├── Guarda locked_by: <hostname>
    │   └── Persiste lock_recovery_data (contexto para recovery)
    │
brain intent submit / download (proceso puede crashear aquí)
    │
    ↓ (si éxito)
brain intent unlock
    │
    ↓ IntentManager.unlock_intent()
        └── Limpia locked, locked_by, locked_at, lock_recovery_data
```

### Cuándo se necesita `recover`

El `RecoveryManager` se activa cuando un intent queda con `locked: true` sin que el proceso haya completado normalmente. Casos típicos:

- El browser crasha durante el `submit`
- El `download` hace timeout (los 300s se agotan)
- `kill -9` del proceso brain durante cualquier operación
- Fallo de red permanente

### Modos del `RecoveryManager`

```python
# Recuperación específica
manager.recover_single(intent_id, folder_name, force_unlock, nucleus_path)

# Escaneo de todos los intents
manager.recover_all(nucleus_path, force_unlock)
```

El modo `download_resumed` reabre el browser en la URL guardada en `lock_recovery_data` (que contiene la URL del chat del AI donde se envió el intent). La extensión de Chrome detecta el estado de recovery y retoma el download.

---

## 10. Dependencias entre módulos del core

### Grafo de dependencias (commands → core)

```
commands/intent/create.py        → core/intent_manager.py
commands/intent/hydrate.py       → core/intent_manager.py
commands/intent/plan.py          → core/context_planning/enriched_tree_generator.py
                                 → core/context_planning/gemini_router.py
commands/intent/build_payload.py → core/context_planning/payload_builder.py
commands/intent/lock.py          → core/intent_manager.py
commands/intent/submit.py        → core/intent_manager.py
commands/intent/download.py      → core/intent/download_manager.py       ← manager propio
commands/intent/parse.py         → core/intent/response_parser.py         ← manager propio
commands/intent/stage.py         → core/intent/staging_manager.py         ← manager propio
commands/intent/validate.py      → core/intent/validation_manager.py      ← manager propio
commands/intent/merge.py         → core/intent/merge_manager.py           ← manager propio
commands/intent/finalize.py      → core/intent_manager.py
commands/intent/unlock.py        → core/intent_manager.py
commands/intent/add_turn.py      → core/intent_manager.py
commands/intent/update.py        → core/intent_manager.py
commands/intent/delete.py        → core/intent_manager.py
commands/intent/get.py           → core/intent_manager.py
commands/intent/list.py          → core/intent_manager.py
commands/intent/recover.py       → core/intent/recovery_manager.py        ← manager propio
```

### Patrón de dos capas

Los comandos se dividen en dos grupos según su delegación:

**Grupo A — delegan al `IntentManager` (fachada):**
`create`, `hydrate`, `lock`, `submit`, `finalize`, `unlock`, `add_turn`, `update`, `delete`, `get`, `list`

**Grupo B — instancian su propio manager especializado:**
`download`, `parse`, `stage`, `validate`, `merge`, `recover`, `plan`, `build_payload`

El Grupo B corresponde a operaciones que tienen lógica de negocio más compleja o independiente, y que el `IntentManager` probablemente llama internamente de todas formas.

---

## 11. Gaps y oportunidades de modernización

### Gaps identificados

#### G1 — `rollback` mencionado pero no implementado
El output de `merge` sugiere `brain intent rollback --intent-id <id>` para deshacer un merge, pero este comando **no existe** en el árbol de `brain/commands/intent/`. El backup se crea pero no hay comando para aplicarlo.

#### G2 — BISP desconectado del pipeline principal
El módulo `brain/commands/bisp/vectorize.py` existe y funciona (`brain bisp vectorize payload`), pero la vectorización de payloads **no está integrada automáticamente** en el pipeline de intents. Después de cada `submit` o `download`, el payload podría vectorizarse automáticamente en ChromaDB para habilitar búsqueda semántica de intents similares.

#### G3 — Gemini Router hardcoded para context planning
`brain/core/context_planning/gemini_router.py` usa Gemini exclusivamente para generar el context plan, aunque `submit` ya es agnóstico de provider (soporta `claude`, `gemini`, `openai`). El router podría abstraerse para usar cualquier provider compatible.

#### G4 — El `plan` y el `hydrate` son comandos separados
En el flujo real, `hydrate` siempre precede a `plan`. El `plan` a su vez siempre precede a `build-payload`. Estos tres pasos podrían encadenarse en un solo comando (`brain intent prepare` o similar) para simplificar el flujo del usuario.

#### G5 — `validate` usa `gemini-2.0-flash-exp` como default
El modelo hardcoded en el default de `--gemini-model` es `gemini-2.0-flash-exp` (modelo experimental). Para producción convendría actualizar al modelo estable más reciente disponible.

#### G6 — Sin soporte de streaming en `download`
El `DownloadManager` espera la respuesta completa antes de persistirla. Para providers que soportan streaming (Claude, Gemini), el download podría empezar a escribir `.raw_output.txt` mientras el AI todavía responde, reduciendo el tiempo de espera percibido.

#### G7 — `add-turn` no rehidrata automáticamente
Después de `add-turn`, el usuario debe volver a ejecutar `plan → build-payload → submit` manualmente. El comando podría tener un flag `--auto-continue` que encadene el ciclo completo de refinement.

### Oportunidades de actualización tecnológica

#### O1 — Claude como router de context planning
Reemplazar o complementar el Gemini Router con Claude Sonnet para el context planning. Ventajas: menor latencia si el provider principal ya es Claude, mejor comprensión de código con Claude 4.x, posibilidad de usar extended thinking para análisis más profundo.

#### O2 — Integración automática de BISP post-submit
Agregar un paso opcional al pipeline que vectorice el payload y el resultado en ChromaDB automáticamente, habilitando:
- `brain bisp semantic similar` para encontrar intents históricos similares
- Reutilización de context plans como punto de partida para nuevos intents

#### O3 — MCP como alternativa al Native Host Bridge
El Native Host Bridge (C++ + Chrome extension) es compleja de mantener. Los MCP servers de Claude Code podrían reemplazar la capa de comunicación para providers que soporten MCP nativamente.

#### O4 — Context plans con modelos de razonamiento
Para intents complejos, el Gemini Router podría usar modelos con extended thinking (Gemini 2.5 Pro / Claude 3.7 Sonnet) que justifiquen más profundamente la priorización de archivos, especialmente para codebases grandes con muchos `[CORE]` files.

#### O5 — Validación post-merge con ejecución de tests
El paso de `validate` actualmente analiza los archivos en staging con Gemini. Una mejora sería agregar validación post-merge que ejecute los tests del proyecto y reporte cobertura, integrándose con el sistema de health de brain.

---

## Apéndice — Comandos de referencia rápida

```bash
# Flujo completo típico (intent dev)
brain intent create -t dev -n "Fix login auth" -f src/auth.py
brain intent hydrate --id <UUID> --briefing "El login falla con OAuth2" --files src/auth.py,src/login.js
brain intent plan --intent-dir .bloom/.intents/.dev/.<slug>/ --description "Fix OAuth2 login"
brain intent build-payload --plan .bloom/.intents/.dev/.<slug>/.briefing/.context_plan.json
brain intent lock --id <UUID>
brain intent submit --intent-id <UUID> --provider claude
brain intent download --intent-id <UUID> --socket-mode
brain intent parse --intent-id <UUID>
brain intent stage --intent-id <UUID>
brain intent validate --intent-id <UUID>
brain intent merge --intent-id <UUID>
brain intent finalize --id <UUID>
brain intent unlock --id <UUID>

# Loop de refinement
brain intent add-turn --id <UUID> --actor user --content "Falta el test para el caso edge"
# → repetir desde plan hasta merge

# Gestión
brain intent list
brain intent list --type dev
brain intent get --id <UUID>
brain intent update --intent-id <UUID> --name "Nuevo nombre"
brain intent update --intent-id <UUID> --add-files src/new_file.py
brain intent delete --id <UUID>

# Recovery
brain intent recover --auto-detect
brain intent recover --intent-id <UUID> --force-unlock

# Utilidades de filesystem
brain filesystem compress src/ -m codebase
brain filesystem tree src/ --hash
brain filesystem extract .codebase.json -o extracted/

# BISP (desconectado del pipeline principal — ver G2)
brain bisp vectorize payload --intent-uuid <UUID> --phase briefing
brain bisp semantic similar --text "OAuth2 authentication bug"
```
