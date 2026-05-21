# BLOOM INTENT SEMANTIC PACKAGE (BISP)
### Especificación v1.0 — Bloom Technical Intent Packages

---

## 1. Identidad y Propósito

El **Bloom Intent Semantic Package (BISP)** es la evolución del package de intent de BTIPS. Extiende el formato existente con una capa de inteligencia semántica que convierte cada intent en una unidad de conocimiento consultable, no solo un artefacto de trabajo trazable.

Un BISP no es solo lo que se hizo en un intent. Es **lo que el sistema aprendió** al hacerlo, estructurado de forma que pueda ser recuperado, comparado y reutilizado sin costo de tokens adicional.

### Principios que lo rigen

- **Sin romper lo existente.** El pipeline actual no cambia. Los archivos actuales no cambian. Los vectores son una extensión, no una sustitución.
- **Costo cero en tokens.** La vectorización corre con Ollama local. No hay llamadas a APIs externas para este proceso.
- **Soberanía del conocimiento.** Los vectores viven en ChromaDB local, dentro del Nucleus. Son del proyecto, no de ningún servicio externo.
- **Dos puntos de inserción únicos.** La vectorización entra en exactamente dos lugares del pipeline: el `context_plan` y el `index.json`. Nada más.

---

## 2. Contexto Arquitectónico

### 2.1 Estructura de referencia — Nucleus

```
.bloom/
└── .nucleus-{organization}/
    ├── .intents/
    │   ├── .exp/
    │   │   └── .{intent-name-uuid}/
    │   │       ├── .exp_state.json
    │   │       ├── .inquiry/
    │   │       │   ├── .inquiry.json
    │   │       │   ├── .context_exp_plan.json        ← PUNTO DE VECTORIZACIÓN 1
    │   │       │   └── .files/
    │   │       │       ├── .expbase.json
    │   │       │       ├── .expbase_index.json
    │   │       │       └── [optional files]
    │   │       ├── .discovery/
    │   │       │   └── .turn_X/
    │   │       │       ├── .turn.json
    │   │       │       ├── .context_exp_plan.json    ← PUNTO DE VECTORIZACIÓN 1
    │   │       │       └── .files/
    │   │       │           ├── .expbase.json
    │   │       │           ├── .expbase_index.json
    │   │       │           └── [optional files]
    │   │       ├── .findings/
    │   │       │   ├── .findings.json
    │   │       │   ├── .context_exp_plan.json        ← PUNTO DE VECTORIZACIÓN 1
    │   │       │   └── .files/
    │   │       └── .pipeline/
    │   │           ├── .inquiry/
    │   │           │   ├── .payload.json
    │   │           │   ├── .index.json               ← PUNTO DE VECTORIZACIÓN 2
    │   │           │   └── .response/
    │   │           │       ├── .raw_output.txt
    │   │           │       └── .report.json
    │   │           └── .discovery/
    │   │               └── .turn_X/
    │   │                   ├── .payload.json
    │   │                   ├── .index.json           ← PUNTO DE VECTORIZACIÓN 2
    │   │                   └── .response/
    │   │                       ├── .raw_output.txt
    │   │                       └── .report.json
    │   │
    │   └── .cor/
    │       └── .{intent-name-uuid}/
    │           ├── .semantic_interpretation/
    │           │   ├── .interpretation.json
    │           │   ├── .context_cor_plan.json        ← PUNTO DE VECTORIZACIÓN 1
    │           │   └── .files/
    │           │       ├── .intent_deltas.json
    │           │       ├── .semantic_conflicts.json
    │           │       └── .compatible_changes.json
    │           └── .pipeline/
    │               └── .semantic_interpretation/
    │                   ├── .payload.json
    │                   ├── .index.json               ← PUNTO DE VECTORIZACIÓN 2
    │                   └── .response/
    │
    └── .cache/
        ├── .semantic-index.json
        └── chroma/                                   ← ChromaDB persiste aquí
            └── {collection-per-project}/
```

### 2.2 Estructura de referencia — Project

```
.project-{name}/
└── .bloom/
    └── .intents/
        ├── .dev/
        │   └── .{intent-name-uuid}/
        │       ├── .briefing/
        │       │   ├── .briefing.json
        │       │   ├── .context_dev_plan.json        ← PUNTO DE VECTORIZACIÓN 1
        │       │   └── .files/
        │       │       ├── .codebase.json
        │       │       ├── .codebase_index.json
        │       │       ├── .docbase.json
        │       │       └── .docbase_index.json
        │       ├── .execution/
        │       │   ├── .context_dev_plan.json        ← PUNTO DE VECTORIZACIÓN 1
        │       │   └── .files/
        │       │       ├── .codebase.json
        │       │       └── .codebase_index.json
        │       ├── .refinement/
        │       │   └── .turn_X/
        │       │       ├── .context_dev_plan.json    ← PUNTO DE VECTORIZACIÓN 1
        │       │       └── .files/
        │       └── .pipeline/
        │           ├── .briefing/
        │           │   ├── .payload.json
        │           │   ├── .index.json               ← PUNTO DE VECTORIZACIÓN 2
        │           │   └── .response/
        │           ├── .execution/
        │           │   ├── .payload.json
        │           │   ├── .index.json               ← PUNTO DE VECTORIZACIÓN 2
        │           │   └── .response/
        │           └── .refinement/
        │               └── .turn_X/
        │                   ├── .payload.json
        │                   ├── .index.json           ← PUNTO DE VECTORIZACIÓN 2
        │                   └── .response/
        │
        └── .doc/
            └── .{intent-name-uuid}/
                ├── .context/
                │   ├── .context_doc_plan.json        ← PUNTO DE VECTORIZACIÓN 1
                │   └── .files/
                │       ├── .docbase.json
                │       └── .docbase_index.json
                ├── .curation/
                │   └── .turn_X/
                │       ├── .context_doc_plan.json    ← PUNTO DE VECTORIZACIÓN 1
                │       └── .files/
                └── .pipeline/
                    ├── .context/
                    │   ├── .index.json               ← PUNTO DE VECTORIZACIÓN 2
                    │   └── .response/
                    └── .curation/
                        └── .turn_X/
                            ├── .index.json           ← PUNTO DE VECTORIZACIÓN 2
                            └── .response/
```

---

## 3. Los Dos Puntos de Vectorización

### 3.1 PUNTO 1 — `context_{type}_plan.json` (Ponderación Semántica)

**Qué es hoy:** Un archivo que define el orden de importancia de los archivos que van al payload. Determina qué lee la LLM primero.

**Qué se agrega:** El ranking de archivos deja de ser estático o manual. Se genera automáticamente por similitud semántica entre el objetivo del intent y el contenido de cada archivo disponible.

**Por qué importa:** Los LLMs degradan atención en contextos largos. Lo que va primero en el contexto importa más. Un ranking semántico correcto significa que la LLM trabaja con el conocimiento más relevante en la posición de máxima atención.

**Cómo funciona:**

```
1. El intent conoce su objetivo → desde {type}_state.json
2. Ollama genera embedding del objetivo
3. ChromaDB consulta todos los archivos disponibles en .files/
4. Retorna ranking por similitud coseno
5. context_{type}_plan.json se genera con ese ranking
6. Brain arma payload.json en ese orden exacto
```

**Schema extendido del `context_dev_plan.json`:**

```json
{
  "intent_uuid": "dev-refactor-auth-a3f9",
  "phase": "briefing",
  "generated_at": "2026-05-21T14:32:00Z",
  "objective_embedding_ref": "chroma://nucleus-org/dev-refactor-auth-a3f9/objective",
  "ranked_files": [
    {
      "file": "codebase.json#auth_controller",
      "similarity_score": 0.94,
      "position": 1,
      "tokens_estimated": 1240,
      "include": true
    },
    {
      "file": "codebase.json#user_model",
      "similarity_score": 0.87,
      "position": 2,
      "tokens_estimated": 890,
      "include": true
    },
    {
      "file": "codebase.json#payment_service",
      "similarity_score": 0.12,
      "position": 8,
      "tokens_estimated": 2100,
      "include": false,
      "exclude_reason": "below_threshold"
    }
  ],
  "token_budget": 8000,
  "token_used": 4320,
  "threshold": 0.40,
  "vector_engine": "ollama/nomic-embed-text",
  "chroma_collection": "project-bloomaut-dev"
}
```

**Aplicación por tipo de intent:**

| Intent | Fase | Objetivo de la consulta vectorial |
|--------|------|-----------------------------------|
| `.dev` | briefing | Objetivo del intent vs codebase + docbase |
| `.dev` | execution | Plan de briefing vs codebase actualizado |
| `.dev` | refinement/turn_X | Delta del turn anterior vs archivos afectados |
| `.doc` | context | Objetivo de documentación vs docbase |
| `.doc` | curation/turn_X | Turn anterior vs secciones del documento |
| `.exp` | inquiry | Pregunta de investigación vs expbase |
| `.exp` | discovery/turn_X | Hallazgos acumulados vs nueva información |
| `.exp` | findings | Síntesis total vs todos los archivos del intent |
| `.cor` | semantic_interpretation | Intent deltas vs historial de intents relacionados |

---

### 3.2 PUNTO 2 — `index.json` del Pipeline (Registro Semántico)

**Qué es hoy:** Un índice del contenido que va en el payload. Referencia qué archivos están incluidos y en qué orden.

**Qué se agrega:** Un campo `embedding_ref` que apunta a la representación vectorial del payload completo en ChromaDB. El índice deja de ser solo una referencia de contenido y se convierte en el punto de entrada semántico al conocimiento de esa fase.

**Por qué importa:** Permite que fases posteriores, otros intents, y el Mandate consulten semánticamente qué se procesó en cada fase sin recargar el contenido completo. Es la memoria del pipeline.

**Schema extendido del `index.json`:**

```json
{
  "intent_uuid": "dev-refactor-auth-a3f9",
  "phase": "briefing",
  "turn": null,
  "payload_hash": "sha256:a3f9e2...",
  "token_count": 4320,
  "files_included": [
    "codebase.json#auth_controller",
    "codebase.json#user_model",
    "docbase.json#auth_docs"
  ],
  "embedding_ref": "chroma://nucleus-org/dev-refactor-auth-a3f9/briefing",
  "embedding_model": "ollama/nomic-embed-text",
  "embedded_at": "2026-05-21T14:33:12Z",
  "chroma_collection": "project-bloomaut-dev",
  "context_plan_ref": ".briefing/.context_dev_plan.json"
}
```

**Qué habilita este campo:**

El Mandate puede preguntar antes de crear un intent nuevo:
```
"¿Existe exploración previa sobre autenticación OAuth2 en este Nucleus?"
→ ChromaDB retorna intents similares con score > 0.85
→ El Mandate reutiliza findings existentes en lugar de crear trabajo duplicado
→ Ahorro real de tokens y tiempo
```

---

## 4. ChromaDB como Motor Semántico del Nucleus

### 4.1 Ubicación y estructura

ChromaDB vive dentro del Nucleus en `.cache/chroma/`. No es un servicio externo. Es una base de datos embebida que persiste en el filesystem del Nucleus, versionable con Git como cualquier otro artefacto.

```
.cache/
├── .semantic-index.json         ← índice legible por humanos (ya existe)
├── .dependency-graph.json       ← ya existe
└── chroma/
    ├── project-{name-uuid}/     ← colección por proyecto
    │   ├── objectives/          ← embeddings de objetivos de intents
    │   ├── payloads/            ← embeddings de payloads por fase
    │   └── findings/            ← embeddings de findings y reports
    └── nucleus-global/          ← embeddings cross-project para el Mandate
```

### 4.2 Colecciones

| Colección | Contenido | Usado por |
|-----------|-----------|-----------|
| `project-{uuid}/objectives` | Embedding del objetivo de cada intent | Mandate para evitar trabajo duplicado |
| `project-{uuid}/payloads` | Embedding del payload de cada fase | context_plan para ranking de archivos |
| `project-{uuid}/findings` | Embedding de findings y reports | `.cor` para semantic_interpretation |
| `nucleus-global` | Embeddings cross-project | Mandate para coordinación entre proyectos |

### 4.3 Relación con `.semantic-index.json` existente

El `.semantic-index.json` que ya está en el tree del Nucleus no desaparece. Pasa a ser el **snapshot legible por humanos** de lo que ChromaDB tiene indexado. Se regenera automáticamente cuando ChromaDB se actualiza. Es la cara visible del índice para inspección y debugging.

---

## 5. Modelo de Embeddings

### Motor: Ollama con `nomic-embed-text`

**Por qué `nomic-embed-text`:**
- Especializado en embeddings de texto técnico y código
- Liviano: corre en cualquier Mac, Linux, Windows sin GPU
- Dimensión de vector: 768 — balance entre precisión y performance
- Licencia Apache 2.0 — sin restricciones de uso comercial
- Ya incluido en el ecosistema Ollama que BTIPS instala nativamente

**Llamada directa desde Brain (Python):**

```python
import requests
import json

def generate_embedding(text: str, nucleus_url: str = "http://localhost:11434") -> list[float]:
    response = requests.post(
        f"{nucleus_url}/api/embeddings",
        json={
            "model": "nomic-embed-text",
            "prompt": text
        }
    )
    return response.json()["embedding"]
```

**Sin LangChain. Sin dependencias adicionales. Brain ya habla Python y Ollama ya está instalado.**

---

## 6. Dependencias de Instalación

### 6.1 Stack completo del BISP

```
Ollama (ya instalado por BTIPS)
    └── modelo: nomic-embed-text   → pull automático en bootstrap

ChromaDB                           → pip install chromadb
    └── cliente Python: chromadb   → incluido en requirements.txt de Brain
```

### 6.2 Instalación de ChromaDB

```bash
# En el entorno de Brain (Python)
pip install chromadb

# Verificación
python -c "import chromadb; print(chromadb.__version__)"
```

ChromaDB en modo embebido no requiere servidor separado. Se inicializa con una ruta de filesystem:

```python
import chromadb

client = chromadb.PersistentClient(
    path=".bloom/.nucleus-{org}/.cache/chroma"
)
```

### 6.3 Pull del modelo Ollama

```bash
ollama pull nomic-embed-text
```

Este pull debe agregarse al script de bootstrap del Nucleus. Una vez descargado, el modelo persiste localmente y no requiere conexión para operar.

### 6.4 Requirements completos para el feature BISP

```
# requirements-bisp.txt
chromadb>=0.4.0
requests>=2.28.0     # ya existe en Brain
```

Solo una dependencia nueva: `chromadb`. Todo lo demás ya está.

---

## 7. Flujo Completo de un Intent con BISP

Tomando `.dev` como referencia canónica:

```
MANDATE crea intent .dev
    │
    ├── 1. Brain lee objetivo desde dev_state.json
    │
    ├── 2. Ollama genera embedding del objetivo
    │       model: nomic-embed-text
    │
    ├── 3. ChromaDB consulta colección del proyecto
    │       query: embedding del objetivo
    │       contra: todos los archivos en .files/
    │       retorna: ranking por similitud coseno
    │
    ├── 4. Brain genera .context_dev_plan.json
    │       con el ranking semántico
    │       incluye: embedding_ref del objetivo
    │       excluye: archivos bajo threshold (0.40)
    │
    ├── 5. Brain arma .payload.json
    │       orden: exactamente el de context_dev_plan
    │       token_budget: respetado estrictamente
    │
    ├── 6. Brain llama a la LLM con payload ordenado
    │
    ├── 7. Brain persiste .raw_output.txt y .report.json
    │
    ├── 8. Ollama genera embedding del payload completo
    │
    ├── 9. ChromaDB almacena embedding en colección
    │       key: intent_uuid/phase
    │
    └── 10. Brain actualiza .index.json
            agrega: embedding_ref apuntando a ChromaDB
            agrega: embedded_at timestamp
```

En refinement, el paso 3 consulta ChromaDB contra el delta del turn anterior, no contra el objetivo original. El sistema se afina a medida que avanza.

---

## 8. Aplicación en `.cor` — El Caso Más Potente

El intent `.cor` es donde el BISP tiene mayor impacto porque ya tiene `semantic_interpretation` como fase explícita.

### Sin BISP

La fase `semantic_interpretation` le pide a la LLM que interprete semánticamente los deltas entre dos versiones. La LLM trabaja desde cero, con todo el contexto cargado en el prompt.

### Con BISP

```
.cor semantic_interpretation
    │
    ├── ChromaDB compara embeddings de:
    │     intent_deltas.json (left)  vs  intent_deltas.json (right)
    │
    ├── Identifica automáticamente:
    │     semantic_conflicts  → similitud < 0.3 en zonas divergentes
    │     compatible_changes  → similitud > 0.8 con diferencias menores
    │
    ├── El context_cor_plan.json rankea los conflictos
    │     por severidad semántica, no por tamaño de diff
    │
    └── La LLM recibe SOLO los conflictos reales ordenados por impacto
          Sin ruido. Sin contexto irrelevante.
```

El resultado en `semantic_conflicts.json` y `compatible_changes.json` tiene base vectorial real, no solo interpretación textual.

---

## 9. Impacto en el Marketplace de Mandates

Cada BISP que viaja en un Mandate package lleva consigo:

**Capa 1 — Contenido** (ya existe): el gzip con el filesystem del intent.

**Capa 2 — Conocimiento** (nuevo): los embeddings del intent en ChromaDB, exportados como snapshot portátil.

Esto significa que cuando un Mandate se comparte en el marketplace:

- El consumer puede consultar semánticamente qué hace el Mandate antes de ejecutarlo
- El runtime Bloom puede verificar compatibilidad semántica con el Nucleus destino
- El Mandate lleva su propio conocimiento, no solo sus instrucciones
- La ejecución en otro Nucleus puede aprovechar el conocimiento previo sin recomputar

**El package no es ejecutable fuera del runtime Bloom** porque ChromaDB + Ollama + el filesystem del Nucleus son el runtime. Esto crea el moat técnico del marketplace.

---

## 10. Decisiones de Diseño Pendientes

Estas decisiones deben tomarse antes de implementar:

| Decisión | Opciones | Recomendación |
|----------|----------|---------------|
| Threshold de similitud | 0.30 / 0.40 / 0.50 | 0.40 como default, configurable por intent |
| Token budget por fase | Fijo / dinámico | Configurable en nucleus-config.json |
| Exportación de embeddings en package | Binario / JSON | Binario para tamaño, JSON para debugging |
| Frecuencia de actualización de semantic-index.json | Por intent / por mandate / scheduled | Por intent completado |
| Colección nucleus-global | Opt-in / siempre activa | Opt-in para privacidad por defecto |

---

## 11. Lo Que NO Cambia

Para claridad explícita:

- El formato del pipeline no cambia
- Los archivos existentes no cambian su schema base — solo se agregan campos opcionales
- El gzip del package no cambia
- Brain sigue siendo Python nativo
- El Mandate sigue rigiendo los intents exactamente igual
- La gobernanza, firma y autoridad del Nucleus no cambian
- Los intents sin BISP siguen siendo válidos — la capa semántica es aditiva

---

## 12. Roadmap de Implementación

```
Fase 0 — Prerequisitos (ya disponibles)
    ✓ Ollama instalado nativamente
    □ ollama pull nomic-embed-text  → agregar a bootstrap

Fase 1 — ChromaDB en Nucleus
    □ pip install chromadb en entorno Brain
    □ Inicialización de client en .cache/chroma/
    □ Creación de colecciones por proyecto en Genesis

Fase 2 — PUNTO 2: index.json con embedding_ref
    □ Brain genera embedding del payload después de cada fase
    □ ChromaDB almacena con key intent_uuid/phase
    □ index.json se actualiza con embedding_ref

Fase 3 — PUNTO 1: context_plan generado semánticamente
    □ Brain genera embedding del objetivo del intent
    □ ChromaDB consulta archivos disponibles
    □ context_{type}_plan.json generado con ranking automático

Fase 4 — Mandate consulta semántica
    □ Antes de crear intent, Mandate consulta ChromaDB
    □ Reutilización de findings existentes
    □ nucleus-global como índice cross-project

Fase 5 — Package con capa semántica
    □ Exportación de embeddings en Mandate package
    □ Importación en Nucleus destino
    □ Compatibilidad semántica pre-ejecución
```

---

*BLOOM INTENT SEMANTIC PACKAGE — Especificación v1.0*
*Bloom Technical Intent Packages — BTIPS*
*Documento vivo — iterar con cada implementación*
