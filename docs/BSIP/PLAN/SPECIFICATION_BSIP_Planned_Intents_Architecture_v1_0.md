# SPECIFICATION: BSIP — Arquitectura de los "Planned Intents"

**Versión:** 1.0
**Estado:** Extracción y estructuración de un análisis técnico de código real ya cerrado, reencuadrado
como especificación de una categoría de intents. No es especificación de contrato de ningún intent
individual ni redefinición de diseño — documenta un **motor de ejecución** verificado contra código, y la
categoría de intents que ese motor sirve.
**Fecha del análisis original:** enero 2026 (árbol de `brain/commands/intent/` de esa fecha).
**Fecha de esta extracción/estructuración:** septiembre 2026.
**Fecha de este reencuadre a "Planned Intents":** septiembre 2026 (mismo día, sesión de clasificación de
intents — ver Anexo).

## Qué es un "Planned Intent"

Un **Planned Intent** es cualquier intent cuya ejecución no es directa, sino que exige una fase
preparatoria donde un motor de *context planning* analiza el estado actual, selecciona qué información es
relevante, y construye un paquete estructurado antes de enviarlo a la IA principal. El criterio completo,
con sus dos ejes, se define formalmente en el **Anexo** de este documento — ahí también se resuelve, con
evidencia, qué intents caen en esta categoría y cuáles no.

**Este documento especifica el motor de ejecución de esa categoría**, no un intent en particular. `dev` y
`doc` son, hoy, los **únicos casos de uso donde ese motor está implementado y confirmado contra código** —
por eso el detalle técnico de las secciones 1–3 y 5 está expresado en términos de sus comandos, sus
archivos de estado y sus rutas de directorio reales. Cualquier intent futuro que se sume a la categoría
"Planned" (evaluado en el Anexo, o uno nuevo que se diseñe después) heredaría este mismo motor — CLI, lock,
Native Host Bridge, Context Planning Pipeline — no uno propio, salvo decisión explícita en contrario.

**Relación con el Documento Único (`BLOOM_BISP_Documento_Unico_v2_0.md`):** Documento complementario — no
lo reemplaza, no lo modifica, no le agrega ni le quita ninguna decisión. El Documento Único cubre el
protocolo BISP (Partes A–C, motor genérico de `ing`/`dis` — la categoría de ejecución directa, ver Anexo)
y el estado diagnóstico de alto nivel de `dev`/`doc`/`exp`/`cor`/`inf` (Parte E). Este documento cubre la
capa que ninguno de los dos cubre: el **motor de ejecución real y verificado contra código** de los
Planned Intents — CLI, locks, protocolo de red, y el pipeline de context planning. Convive en la misma
carpeta que el Documento Único, como referencia técnica de implementación.
**Relación con `DEV_Intent_Spec_v1_0.md` / `DOC_Intent_Spec_v1_0.md`:** Este documento resuelve, total o
parcialmente, varios puntos que esos dos specs marcan como "verificación de código pendiente" — en
particular el comportamiento real de `plan`/`build-payload` (§9 de ambos specs) y el mecanismo de
detección de "stage" (`GAP #4` de `DOC_Intent_Spec_v1_0.md`). Se dejan notas de cruce puntuales donde
aplica. No se tocan los specs formales para incorporar esto — queda como referencia aparte.

**Relación con `CONTEXT_PLAN_MAPA_TECNICO_v1_0.md` e `INV-00X_Interaccion_Vectorial_Topologica_Domains_Genes.md`
(septiembre 2026):** ambos son documentos **experimentales** — hallazgos de investigación y líneas
abiertas, no arquitectura normativa ni implementación aprobada — y se tratan con esa cautela: no se
integran ni se citan como si fueran hechos cerrados. Donde investigan el mismo mecanismo que este
documento describe a nivel de código de enero 2026 (el Gemini Router, §2.2, y los gaps relacionados en
§4), se dejaron notas de reenvío puntuales marcando que ese análisis es más profundo y más vigente, sin
sobrescribir lo que este documento verificó contra código en su momento. Ninguno de los dos archivos se
fusiona a este ni al Documento Único — quedan como documentos propios en la misma carpeta.

## Nota de procedencia

Este documento es la extracción, reestructuración y posterior reencuadre de `brain_intent_state.md`
("Brain — Estado del Sistema de Intents", análisis técnico basado en `brain/commands/intent/`, enero
2026), que se retiró de la carpeta en la extracción original. Ningún bloque de código, estructura JSON,
sintaxis CLI o nombre de método/clase fue resumido o comprimido — se preservan intactos. Lo que cambió
respecto del original es la organización en secciones, la renumeración de encabezados, y — en esta
versión — el encuadre conceptual: de "documento sobre `dev`/`doc`" a "especificación del motor de los
Planned Intents, confirmado en `dev`/`doc`". `BLOOM_INTENT_SEMANTIC_PACKAGE_v1_0.md`, el otro archivo de
la carpeta `INTENT` vieja, no aporta nada a este documento — su contenido ya vive, superado, en la Parte A
del Documento Único (ver verificación previa) y se retira sin extracción.

## Convención de esta spec

Cada sección está etiquetada explícitamente:

- **🟢 Implementado (confirmado contra código)** — comportamiento verificado directamente contra el árbol
  de `brain/commands/intent/` de enero 2026, en los casos de uso `dev`/`doc` del motor de Planned Intents.
  Puede haber quedado desactualizado si el código cambió desde entonces — este documento no fue
  re-verificado en esta sesión.
- **🟡 Gap / Oportunidad (no implementado)** — ausente del código, o mejora propuesta no construida. Nunca
  se mezcla con comportamiento confirmado dentro de la misma sección.

---

## 0. Resumen ejecutivo

El motor de los **Planned Intents** corre, en la práctica, sobre un pipeline lineal de 12 pasos con
exactamente un intent activo ("locked") por proyecto a la vez — el principio de determinismo P5 observado
en el código. Hoy, `dev` y `doc` son los dos únicos casos de uso confirmados de este motor; comparten el
mismo pipeline, la misma CLI y el mismo mecanismo de lock, y son la evidencia de código sobre la que se
escribe todo el detalle técnico de este documento. El pipeline real tiene tres piezas de infraestructura
que ni el Documento Único ni los specs formales de `dev`/`doc` documentan en este nivel de detalle:

1. **Un sistema de lock y recuperación** (§1) — el eje *Transaccional/Recuperable* de la categoría, ver
   Anexo — que persiste `lock_recovery_data` para poder reanudar un `submit`/`download` interrumpido — sin
   esto, un crash de browser a mitad de pipeline deja el intent inconsistente sin forma de recuperarlo.
2. **Dos canales de comunicación externa independientes** (§2): el *Native Host Bridge* (proceso C++ que
   habla con la extensión de Chrome vía TCP:5678/5679) para el ciclo submit/download con el AI provider, y
   el *Gemini Router* (asíncrono, con su propio prompt de sistema) para generar el `context_plan` — el eje
   *Context Planning* de la categoría (ver Anexo), un mecanismo **distinto y paralelo** al de
   Ollama/ChromaDB que documenta la Parte A del Documento Único.
3. **Una CLI completa de 15 comandos** (§3) que expone cada paso del pipeline como operación independiente,
   con managers especializados propios para las operaciones de mayor lógica de negocio (`download`,
   `parse`, `stage`, `validate`, `merge`, `recover`, `plan`, `build_payload`).

Sobre esa base real, el análisis original identificó 7 gaps de código y 5 oportunidades de modernización
(§4) — ninguno resuelto en este documento, igual que los pendientes de cualquier otro spec de la carpeta.
El Anexo cierra el documento evaluando, con esta misma evidencia, qué otros intents del ecosistema (`ing`,
`dis`, `exp`, `cor`, `inf`) caen o no dentro de la categoría Planned Intent.

---

## 1. Sistema de Lock y Recuperación de Sesión

**🟢 Implementado (confirmado contra código, `IntentManager.lock_intent()` / `RecoveryManager`).**

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

## 2. Componentes de Arquitectura e Integración

**🟢 Implementado (confirmado contra código).** Dos canales de comunicación externa, compartidos por
cualquier caso de uso del motor de Planned Intents, completamente independientes entre sí y con
propósitos distintos: uno mueve el payload/respuesta hacia y desde el AI provider (2.1), el otro decide
qué entra en ese payload y en qué orden — la fase de *context planning* que define a la categoría (2.2).

### 2.1 Native Host Bridge — protocolo de submit/download

#### Arquitectura de comunicación

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

#### Puertos y timeouts

| Componente | Puerto | Timeout | Dirección |
|------------|--------|---------|-----------|
| submit → host | `5678` | 30s | Brain → Host |
| download ← host | `5679` | 300s (5min) | Host → Brain |

#### El `command_id`

El submit genera un `command_id` que identifica la transacción. Este ID se usa para correlacionar el download con el submit correcto cuando hay múltiples intents en vuelo (aunque el sistema de lock previene esto en condiciones normales).

### 2.2 Gemini Router — Context Planning Pipeline

> **Nota de vigencia y corrección puntual (septiembre 2026):** lo que sigue describe el mecanismo tal
> como se verificó contra código en enero 2026 — el flujo y el rol del prompt siguen siendo válidos a ese
> nivel. Una corrección concreta: `CONTEXT_PLAN_MAPA_TECNICO_v1_0.md` confirmó con el equipo que
> `router_prompt.md` **no existe en disco** — el prompt que realmente corre es el fallback embebido dentro
> de `gemini_router.py`, no un archivo separado como sugiere la mención de abajo. Ese mismo documento
> investigó este mecanismo con más profundidad y encontró hallazgos que este análisis no registra: llamada
> directa a Google sin pasar por AITAP (contradice la decisión normativa #23 de
> `COGNITUUM_RESPONSIBILITY_BOUNDARIES`), sampling activo (`temperature=0.2`, `topP=0.8`, `topK=40`) que
> hace el plan no reproducible entre corridas, y ausencia de degradación graceful si el JSON de Gemini no
> cumple el schema esperado. Ese documento es, por su propia declaración, un **hallazgo de investigación,
> no arquitectura normativa** — tratarlo como la referencia más profunda y actual disponible sobre este
> mecanismo, no como una decisión ya cerrada o implementada.

#### Flujo completo

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

#### El system prompt del router (`router_prompt.md`)

El prompt está en `brain/commands/intent/router_prompt.md` y define:

- **Rol:** "Context Planner" — analiza el árbol enriquecido y prioriza archivos
- **Input:** `{enriched_tree}` + `{intent_description}` + `{intent_type}`
- **Token budget:** < 40,000 tokens totales en el payload final
- **Límites de tiers:** CRITICAL ≤ 10, HIGH ≤ 20, MEDIUM ≤ 30
- **Reglas de exclusión:** libs/, node_modules/, `__pycache__/`, build artifacts, configs salvo que el intent sea sobre config
- **Output:** JSON puro (sin markdown, sin texto adicional)

#### Escenarios de priorización documentados en el prompt

| Escenario | CRITICAL | HIGH | MEDIUM |
|-----------|----------|------|--------|
| Fix bug en compresión | `files_compressor.py`, `code_compressor.py` | Utils relacionados, tests | CLI commands que usan compresión |
| Add JWT auth a API | Server file, archivos `[API]` | Auth existente, middleware | User models, request handlers |
| Documentar arquitectura | Entry points, orchestrators | Módulos `[CORE]` | Utilities, interfaces |

#### Gestión de keys Gemini

El router usa el sistema de keys de Gemini (`brain/shared/credentials/`) con rotación automática por cuota. Los errores están tipificados:
- `NoAvailableKeysError` → sin keys con cuota suficiente
- `GeminiAPIError` → fallo de la API

## 3. Interfaz de Línea de Comandos (CLI) — análisis detallado por comando

**🟢 Implementado (confirmado contra código).** Esta es la CLI del motor de Planned Intents en sí — hoy
solo se ejercita a través de `dev`/`doc` (únicos casos de uso confirmados), pero ningún comando de los
que siguen es exclusivo de esos dos tipos por diseño; el `--type` de `create`/`plan` es un parámetro, no
una bifurcación de motor. Sintaxis, flags y nombres de clase/archivo tal como aparecen en
`brain/commands/intent/`. Cruce con `DOC_Intent_Spec_v1_0.md`: la nota de diseño en 3.11 (`merge`)
confirma en código lo que ese spec marca como `GAP #4` — `_detect_latest_stage()` solo reconoce el
vocabulario nativo de `dev` (`briefing`/`execution`/`refinement_X`), consistente con que este análisis
fue escrito enteramente en términos de `dev`/`doc` sin variantes.


### 3.1 `create`

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

### 3.2 `hydrate`

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

### 3.3 `plan`

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

### 3.4 `build-payload`

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

### 3.5 `lock`

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

### 3.6 `submit`

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

### 3.7 `download`

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

### 3.8 `parse`

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

### 3.9 `stage`

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

### 3.10 `validate`

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

### 3.11 `merge`

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

### 3.12 `finalize` + `unlock`

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

### 3.13 `add-turn`

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

### 3.14 `recover`

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

### 3.15 `update`, `delete`, `get`, `list`

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
## 4. Matriz de Gaps y Oportunidades (G1–G7 / O1–O5)

**🟡 Gap / Oportunidad — nada en esta sección está implementado.** Es exactamente lo que falta o lo que se
propone, no comportamiento verificado.

### Gaps identificados

#### G1 — `rollback` mencionado pero no implementado
El output de `merge` sugiere `brain intent rollback --intent-id <id>` para deshacer un merge, pero este comando **no existe** en el árbol de `brain/commands/intent/`. El backup se crea pero no hay comando para aplicarlo.

#### G2 — BISP desconectado del pipeline principal
El módulo `brain/commands/bisp/vectorize.py` existe y funciona (`brain bisp vectorize payload`), pero la vectorización de payloads **no está integrada automáticamente** en el pipeline de intents. Después de cada `submit` o `download`, el payload podría vectorizarse automáticamente en ChromaDB para habilitar búsqueda semántica de intents similares.

#### G3 — Gemini Router hardcoded para context planning
`brain/core/context_planning/gemini_router.py` usa Gemini exclusivamente para generar el context plan, aunque `submit` ya es agnóstico de provider (soporta `claude`, `gemini`, `openai`). El router podría abstraerse para usar cualquier provider compatible.

> **Nota de vigencia (septiembre 2026):** este gap, tal como está formulado acá, subestima el problema.
> `CONTEXT_PLAN_MAPA_TECNICO_v1_0.md` (hallazgo de investigación, no arquitectura normativa — su propuesta
> tampoco está implementada) encontró que esto no es solo falta de abstracción de provider: la llamada
> directa de `gemini_router.py` al SDK de Google, sin pasar por AITAP, contradice la decisión normativa
> #23 de `COGNITUUM_RESPONSIBILITY_BOUNDARIES` ("AITAP posee la implementación de routing"). Ese documento
> es la referencia a consultar para el diagnóstico completo de este punto, no esta entrada.

#### G4 — El `plan` y el `hydrate` son comandos separados
En el flujo real, `hydrate` siempre precede a `plan`. El `plan` a su vez siempre precede a `build-payload`. Estos tres pasos podrían encadenarse en un solo comando (`brain intent prepare` o similar) para simplificar el flujo del usuario.

#### G5 — `validate` usa `gemini-2.0-flash-exp` como default
El modelo hardcoded en el default de `--gemini-model` es `gemini-2.0-flash-exp` (modelo experimental). Para producción convendría actualizar al modelo estable más reciente disponible.

> **Distinción, no duplicado:** este gap es sobre `validate` (post-merge). Es un hallazgo *relacionado* pero
> *distinto* al que reporta `CONTEXT_PLAN_MAPA_TECNICO_v1_0.md` §6.5 sobre `plan`/`gemini_router.py`, que
> usa `gemini-1.5-flash` para la decisión de qué archivos entran al payload — un comando distinto, el mismo
> patrón de fondo (modelo económico para una decisión de peso). No se fusionan porque son dos puntos de
> código distintos; ambos quedan como gaps abiertos por separado.

#### G6 — Sin soporte de streaming en `download`
El `DownloadManager` espera la respuesta completa antes de persistirla. Para providers que soportan streaming (Claude, Gemini), el download podría empezar a escribir `.raw_output.txt` mientras el AI todavía responde, reduciendo el tiempo de espera percibido.

#### G7 — `add-turn` no rehidrata automáticamente
Después de `add-turn`, el usuario debe volver a ejecutar `plan → build-payload → submit` manualmente. El comando podría tener un flag `--auto-continue` que encadene el ciclo completo de refinement.

### Oportunidades de actualización tecnológica

#### O1 — Claude como router de context planning
Reemplazar o complementar el Gemini Router con Claude Sonnet para el context planning. Ventajas: menor latencia si el provider principal ya es Claude, mejor comprensión de código con Claude 4.x, posibilidad de usar extended thinking para análisis más profundo.

> **Nota de vigencia (septiembre 2026):** `CONTEXT_PLAN_MAPA_TECNICO_v1_0.md` §7 propone algo más preciso
> que "cambiar de proveedor" — enrutar cualquier llamada de inteligencia restante a través de AITAP (no un
> SDK directo), e implementar primero el ranking por similitud vectorial ya decidido (§A.5.1 del
> Documento Único, con infraestructura `OllamaManager`/`BISPChromaClient` que ya existe para otro
> propósito), dejando a cualquier LLM — sea Gemini, Claude, u otro vía AITAP — el rol de justificar en
> lenguaje natural una selección ya calculada por reglas, no de decidirla. Es un hallazgo de investigación
> con propuesta todavía no implementada, pero más específico que esta entrada O1; tratarlo como la
> propuesta vigente sobre este punto.

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
## 5. Contexto Adicional Rescatado del Análisis Original

**🟢 Implementado (confirmado contra código).** No estaba explícitamente pedido en la guía de esta
extracción, pero se conserva porque es la base sobre la que se entienden las secciones 1–4: la forma real
del filesystem, el orden real del pipeline, y el schema real del archivo de estado.

### 5.1 Visión general y tipos de intent

> Esta sección describe el modelo conceptual tal como está escrito en el análisis original de código —en
> términos de `dev`/`doc`, porque son los únicos casos de uso que existían para verificar contra código.
> Léase como "el motor de Planned Intents, ejercitado hoy por estos dos tipos", no como una limitación de
> diseño a esos dos tipos — ver Anexo.

Un **intent** en Bloom es la unidad de trabajo atómica que encapsula una instrucción de desarrollo (`dev`) o de documentación (`doc`) para ser procesada por un proveedor de AI. El sistema Brain gestiona el ciclo de vida completo: desde la creación de la estructura de directorios hasta la aplicación de los cambios generados al codebase real.

#### Tipos de intent

| Tipo | Propósito | Estructura de fases |
|------|-----------|---------------------|
| `dev` | Modificaciones de código | `briefing` → `execution` → `refinement_N` |
| `doc` | Generación/actualización de documentación | `context` → `curation_N` |

#### Principios de diseño observados en el código

- **Determinismo (P5):** Solo un intent puede estar activo (locked) a la vez por proyecto.
- **Dual output:** Todos los comandos soportan `--json` y render humano, usando el mismo `gc.output()`.
- **Lazy imports:** Los `from brain.core...` siempre están dentro de la función `execute()`, no en el módulo.
- **IntentManager como fachada:** La mayoría de comandos CLI delegan al `IntentManager` del core. Excepciones: `merge`, `stage`, `validate`, `parse`, `download`, `recover` — que instancian sus propios managers especializados directamente.

---
### 5.2 Estructura de archivos en disco

#### Intent de tipo `dev`

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

#### Intent de tipo `doc`

Misma estructura pero con fases `context` (en lugar de `briefing`) y `curation_N` (en lugar de `refinement_N`), y los planes de contexto se llaman `.context_doc_plan.json`.

#### Ubicación en el nucleus

Los intents `dev` y `doc` viven siempre dentro del proyecto (`project/.bloom/.intents/`), no en el nucleus. El nucleus tiene su propia carpeta `.intents/` para intents de exploración (`exp`) y correlación (`cor`), que son un sistema separado.
### 5.3 Ciclo de vida completo del pipeline

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

#### Flujo de archivos a través del pipeline

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
### 5.4 Máquina de estados — `dev_state.json`

#### Estados observados en el código

A partir del output de `get.py` y la lógica de `lock`/`finalize`:

```
created → active → completed
```

| Estado | Descripción | Lock |
|--------|-------------|------|
| `created` | Intent recién creado, no hidratado | `false` |
| `active` | En proceso (hidratado, en alguna fase del pipeline) | puede ser `true` |
| `completed` | Finalized exitosamente | `false` |

#### Campos del `dev_state.json` (inferidos del código)

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
### 5.5 Formatos de compresión del filesystem

El sistema usa tres módulos en `brain/core/filesystem/`:

#### `code_compressor.py` — modo `codebase`

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

#### `files_compressor.py` — modo `docbase`

Comprime archivos de documentación (`.md`, `.txt`, `.rst`, etc.). Produce `.docbase.json` y `.docbase_index.json`. Mismo formato que codebase pero orientado a docs.

#### `files_extractor.py`

Extrae archivos desde el formato JSON comprimido de vuelta al filesystem. Usado por `merge_manager` cuando aplica los cambios del AI al codebase real. Soporta verificación de hashes MD5.

#### Invocación desde CLI

```bash
# Compresión directa (sin pasar por el pipeline de intents)
brain filesystem compress src/ -m codebase -o output/
brain filesystem compress docs/ -m docbase -o output/

# Extracción
brain filesystem extract .codebase.json -o extracted/

# Árbol
brain filesystem tree src/ --hash --export-json
```
### 5.6 Dependencias entre módulos del core

#### Grafo de dependencias (commands → core)

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

#### Patrón de dos capas

Los comandos se dividen en dos grupos según su delegación:

**Grupo A — delegan al `IntentManager` (fachada):**
`create`, `hydrate`, `lock`, `submit`, `finalize`, `unlock`, `add_turn`, `update`, `delete`, `get`, `list`

**Grupo B — instancian su propio manager especializado:**
`download`, `parse`, `stage`, `validate`, `merge`, `recover`, `plan`, `build_payload`

El Grupo B corresponde a operaciones que tienen lógica de negocio más compleja o independiente, y que el `IntentManager` probablemente llama internamente de todas formas.

> **Nota, solo para no perder el hilo (septiembre 2026):** `core/context_planning/enriched_tree_generator.py`
> — arriba, como dependencia de `plan.py` — es también el punto de partida de una línea de investigación
> abierta y sin código propio todavía, `INV-00X_Interaccion_Vectorial_Topologica_Domains_Genes.md`, que
> explora si Domain/Gene deberían representarse como clusters vectoriales en vez de manifiesto declarado a
> mano. Es una hipótesis en evaluación, no un cambio de diseño de este módulo — se deja la referencia acá
> únicamente para que quien toque `enriched_tree_generator.py` sepa que existe esa exploración en paralelo.

## 6. Apéndice — Comandos de Referencia Rápida

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

---

## Anexo: Taxonomía y Criterios de Clasificación de Intents

**🟢/🟡 Mixto — el criterio es analítico, la clasificación por intent respeta el estado real de evidencia
de cada uno (implementado, diseñado sin código, o sin evidencia).**

Este Anexo documenta el análisis que dio origen al reencuadre de este documento: qué hace a un intent un
"Planned Intent", y dónde cae cada tipo del ecosistema con la evidencia disponible hoy.

### A.1 Definición

Un **Planned Intent** es cualquier intent cuya ejecución no es directa, sino que exige una fase
preparatoria donde un motor de *context planning* analiza el estado actual, selecciona qué información es
relevante, y construye un paquete estructurado antes de enviarlo a la IA principal.

La definición se evalúa en **dos ejes independientes**, no en una lista plana de cuatro requisitos
igualmente necesarios:

**Eje 1 — Context Planning (el eje que define la categoría).** Un intent es Planned si:
1. Tiene un **paso explícito de planificación** (`plan`): genera un archivo de instrucciones o manifiesto
   intermedio (como `.context_dev_plan.json`) que prioriza archivos en categorías (CRITICAL/HIGH/MEDIUM)
   con un presupuesto de tokens.
2. Tiene una **fase de `build-payload`** dedicada a ensamblar el contexto físico (juntar los archivos
   priorizados por el plan) antes de ejecutar el envío.
3. Consume el **Context Planning Pipeline** — hoy, en la práctica, esto significa `EnrichedTreeGenerator`
   (señal estructural real). El consumo de **índices vectoriales previos** es parte de la visión de este
   eje pero **no evidencia disponible todavía**: §A.5.1 del Documento Único (ranking semántico
   pre-payload) está decidido pero sin una línea de código (ver `CONTEXT_PLAN_MAPA_TECNICO_v1_0.md`). Se
   separa explícitamente de (3) porque hoy ningún intent lo cumple, y fusionarlo con "consume
   `EnrichedTreeGenerator`" ocultaría esa brecha.

**Eje 2 — Transaccional/Recuperable (acompaña a la categoría, no la define por sí solo).** Un intent usa
`RecoveryManager` (`locked: true`, `lock_recovery_data`) cuando sus transacciones a través del Native Host
Bridge (submit/download) son largas y corren riesgo real de interrupción. En `dev`/`doc` este eje coincide
con el Eje 1 porque comparten motor — pero conceptualmente son ejes distintos: un intent podría construir
contexto sin necesitar este lock (round-trip corto, o sin pasar por ese canal), o viceversa. No se trata
como un quinto criterio del mismo tipo que 1–3, sino como una propiedad transaccional que coincide con
Planned Intent en los casos de uso confirmados, sin ser parte de su definición estructural.

**Regla de decisión:** cualquier intent que requiera construir su propio contexto y enrutarlo antes de
ejecutar su acción principal (Eje 1, criterios 1–2 confirmados en código) es un Planned Intent. Si un
intent solo lee de un estado local y ejecuta una acción sin construir un payload priorizado por tiers ni
invocar este pipeline, pertenece a una categoría de **ejecución directa o genérica**.

### A.2 Clasificación de los intents del ecosistema

| Intent | ¿Planned Intent? | Evidencia |
|---|---|---|
| `dev` | ✅ Sí, confirmado en Eje 1 completo + Eje 2 | `plan.py` genera `.context_dev_plan.json` con tiers CRITICAL/HIGH/MEDIUM y budget de tokens (§3.3); `build-payload` ensambla el payload físico (§3.4); consume `EnrichedTreeGenerator` (§2.2); usa lock (`dev_state.json.locked` + `RecoveryManager`, §1) por el riesgo de interrupción en submit/download. |
| `doc` | ✅ Sí, mismo motor | Mismos comandos (`plan.py --type doc` genera `.context_doc_plan.json`), misma estructura `.pipeline/`, mismo lock. Comparte el 100% del motor descrito en este documento — no tiene infraestructura propia. |
| `ing` | ❌ No — motor distinto, no "sin contexto" | Corre sobre `IntentStateManager` (BSIP genérico, Parte B del Documento Único), no sobre el Context Planning Pipeline. Construye algo antes de actuar (fases con turnos + vectorización post-hoc vía Ollama/ChromaDB para reutilización semántica, §A.5.2 del Documento Único), pero no genera `context_plan.json` con tiers/budget ni pasa por `build-payload`. Ejecución directa con un mecanismo de preparación propio y más simple — no encaja en "lee y ejecuta síncrono sin construir contexto" de forma literal, pero tampoco es Planned Intent bajo el Eje 1. |
| `dis` | ❌ No — mismo caso que `ing` | Motor BSIP genérico a nivel Nucleus (Parte C del Documento Único); no pasa por `plan.py`, que solo acepta `--type dev/doc/seed`. |
| `exp` | ⚠️ Sin evidencia suficiente para clasificar — no es "no" | Motor ad-hoc propio (`nucleus_manager.py`), sin rastro de ninguno de los criterios del Eje 1 en el código revisado — pero tampoco hay evidencia de que carezca de ellos; simplemente no se documentó. Además está roto en su punto de creación (`create_exp_intent()` no existe, `EXP_Intent_Spec_v1_0.md §6`). Clasificarlo como "ejecución directa" sería inventar donde el propio spec dice explícitamente que no hay evidencia. |
| `inf` | ⚠️ No aplica | Cero código, cero estructura de directorios en cualquier árbol revisado (`BLOOM_Intent_Types_Gap_Analysis_v1_0.md §7`, Parte E del Documento Único). No hay nada que evaluar contra ningún eje. |
| `cor` | 🚫 Excluido de la clasificación, no "ejecución directa" | Nunca tuvo motor de ejecución propio — fue descartado por diseño y reemplazado por Gravity (BTIPS v7.2 §8) antes de que existiera código que evaluar. Incluirlo como "ejecución directa" sugeriría erróneamente que tuvo un motor liviano; no tuvo ninguno. |

### A.3 Nota abierta, sin resolver en este documento

`plan.py` acepta `--type dev`, `doc`, o **`seed`** (default `dev`) — un tercer valor que no aparece en
ningún lugar de BTIPS ni del Documento Único como intent type reconocido (§3.3). No se sabe si es un
alias interno, un tipo en desarrollo, o vestigio de código. Queda marcado como GAP para una futura
sesión — no se resuelve por inferencia acá.

---

*`SPECIFICATION_BSIP_Planned_Intents_Architecture_v1_0.md` · extracción, reestructuración y reencuadre de
`brain_intent_state.md` (análisis de código real, `brain/commands/intent/`, enero 2026), retirado en la
extracción original. Convive con `BLOOM_BISP_Documento_Unico_v2_0.md` sin modificarlo. Complementa
`DEV_Intent_Spec_v1_0.md` y `DOC_Intent_Spec_v1_0.md` con el nivel de detalle de implementación que esos
specs marcan como pendiente de verificar. Incluye notas de reenvío puntuales hacia
`CONTEXT_PLAN_MAPA_TECNICO_v1_0.md` e `INV-00X_Interaccion_Vectorial_Topologica_Domains_Genes.md` — ambos
documentos experimentales, tratados como tales, no fusionados. El Anexo formaliza la categoría "Planned
Intent" y su clasificación de `dev`/`doc`/`ing`/`dis`/`exp`/`inf`/`cor`, producto de una consulta puntual
resuelta en esta misma sesión. Ningún GAP de la sección 4 ni pregunta abierta del Anexo se resuelve en
este documento.*
