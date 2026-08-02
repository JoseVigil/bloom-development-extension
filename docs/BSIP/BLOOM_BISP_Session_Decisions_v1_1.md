# BLOOM — BISP Session Decisions v1.1

**Bloom Intent Semantic Package — Documento de Sesión**
Fuente de Verdad · Integración Vectorial ChromaDB + Ollama
Sesión base: 23 de mayo de 2026 · Actualización: 29 de junio de 2026
Base: BTIPS v5.0 / BISP v1.1

---

> **Regla de este documento:** Cualquier decisión de implementación que contradiga lo documentado aquí requiere revisión explícita de arquitectura. Este documento no se diluye con el avance de ejecución.

> **Nota de alcance (v1.1):** Este documento es **agnóstico de Companion**. Describe el BISP como protocolo — schema, persistencia, flujo Brain–Ollama–ChromaDB y contratos de Synapse en su forma genérica — y es válido y completo en cualquier etapa del proyecto, exista o no una integración de Companion activa. La integración específica del Companion Cognitivo con el BISP vive en un documento separado: `BLOOM_BISP_Companion_Integration_v2_0.md`, que **depende de** este documento pero no lo modifica ni lo condiciona. Si estás trabajando en Brain, ChromaDB, Ollama, el schema de `index.json` o Mandates, este es el único documento que necesitás.

---

## Registro de cambios

| Versión | Fecha | Cambios |
|---|---|---|
| v1.0 | 2026-05-23 | Decisiones fundacionales: ChromaDB, Ollama, schema BISP, flujo Brain |
| v1.1 | 2026-06-29 | Cierre del pendiente 2.5 (Contrato de Synapse): tres contratos genéricos — Continuar / Evaluar / Decidir compatibilidad. Se retira toda referencia a Companion de este documento; la integración de Companion se documenta aparte (ver Nota de alcance). |

---

## 1. Propósito

Este documento es la fuente de verdad de las decisiones arquitectónicas tomadas en la sesión del 23 de mayo de 2026 y su actualización del 29 de junio de 2026. No es documentación final ni spec de implementación. Es el registro razonado que debe guiar la actualización de:

- **BTIPS v5.0** — incorporar la capa semántica al protocolo de packages
- **BISP v1.1** — agregar los campos nuevos al schema de `index.json` y `context_plan.json`
- **Mandate Domain Spec** — agregar la consolidación semántica al cierre del Mandate
- **Archivos Python existentes** — evaluar compatibilidad con el nuevo framework vectorial

Cualquier consumidor del BISP (Companion Cognitivo u otro) es responsable de su propia documentación de integración; ese consumo no forma parte de las decisiones de este documento.

---

## 2. Decisiones Arquitectónicas

### 2.1 Infraestructura — ChromaDB y Ollama

| Decisión | Fundamento | Estado |
|---|---|---|
| ChromaDB embebido en Brain como librería Python, no como proceso separado | Brain ya es Python. Evita un binario adicional que Metamorph tendría que gestionar. Modelo idéntico a SQLite en Temporal: la base vive en disco, el proceso la abre directamente. | TOMADA |
| Ollama como único generador de embeddings vía `/api/embed`, modelo `nomic-embed-text` | Ollama ya está en el sistema para Alfred. Reutilizar el mismo proceso. 768 dimensiones con excelente relación calidad/velocidad para embeddings de código y documentación técnica. | TOMADA |
| Brain es el único orquestador: Brain llama a Ollama, Brain llama a ChromaDB. Nunca al revés. | Mantiene Brain como punto de control único. El modelo de embeddings es configurable, auditable y reemplazable sin tocar ChromaDB. Sin dependencias cruzadas ocultas. | TOMADA |
| Si Ollama no está disponible, el intent continúa sin vectorización (capa semántica aditiva, no bloqueante) | La vectorización es una mejora sobre el pipeline existente, no un requerimiento crítico del flujo. Degradación graceful obligatoria. | TOMADA |

### 2.2 Persistencia — Dónde vive ChromaDB

| Decisión | Fundamento | Estado |
|---|---|---|
| Colecciones ChromaDB por proyecto, dentro del filesystem del proyecto | Autarquía local: el conocimiento vectorial de un proyecto viaja con el proyecto. Sin colección global compartida que cree dependencias entre proyectos. | TOMADA |
| Cache global en `.nucleus-{org}/.cache/chroma/` para queries cross-project | El Nucleus necesita poder hacer búsquedas semánticas a nivel organización (ej: encontrar intents similares en proyectos distintos). Colección separada, gestionada por Nucleus. | TOMADA |
| Mandate consolidado en `.mandates/{id}/.semantic/` al cerrarse el Mandate | La unidad de valor del marketplace es el Mandate completo. Su colección semántica consolida todos los intents ejecutados y es lo que viaja como conocimiento comprado. | TOMADA |

### 2.3 Package (BISP) — Schema de index.json

| Decisión | Fundamento | Estado |
|---|---|---|
| `index.json` tiene tres capas: `operational`, `autarchic`, `marketplace` | Tres audiencias distintas: AI web (operational), runtime Bloom externo (autarchic), marketplace comprador (marketplace). Cada capa es procesable independientemente. | TOMADA |
| Campo `embedding_source_text` obligatorio junto a cada vector | Sin el texto fuente el vector no es verificable ni regenerable. Si se cambia de modelo, el texto fuente permite regenerar el vector sin perder trazabilidad. | TOMADA |
| El vector nunca viaja a la AI web. La AI web consume texto ya ordenado por el trabajo vectorial. | Los espacios vectoriales no son interoperables entre modelos. 768 floats de `nomic-embed-text` son opacos para GPT-4, Claude API o Grok. El valor del vector se materializa antes de que el package salga del runtime Bloom. | TOMADA |
| Nuevos campos en capa `autarchic`: `findings_summary`, `domain_tags`, `resolved`, `reusable_knowledge` | Habilitan consulta autárquica: otro runtime Bloom puede entender qué resolvió este package sin ejecutarlo. Son la base del `semantic_descriptor` del Mandate en el marketplace. | TOMADA |
| Dos puntos de vectorización: `context_plan.json` (antes del payload) y `index.json` (después de la fase) | El `context_plan` usa el vector para ordenar archivos por relevancia antes de armar el payload. El `index.json` registra el embedding del intent completo para consultas futuras. | TOMADA |

### 2.4 Mandate — Agregación semántica

| Decisión | Fundamento | Estado |
|---|---|---|
| El campo `marketplace` en `index.json` es `null` en intents individuales. Lo completa el Mandate al cerrarse. | El intent no sabe si pertenecerá a un Mandate de marketplace. La responsabilidad de esa decisión es del Mandate, no del intent. | TOMADA |
| `mandate_workflow.json` exporta el Temporal workflow history al completarse el Mandate | Auditabilidad completa sin depender del SQLite de Temporal del vendor. El comprador puede verificar el flujo de ejecución completo. | TOMADA |

### 2.5 Contrato de Synapse — CERRADO ✓

**Estado anterior:** PENDIENTE — "Contrato exacto de Synapse: qué hace la AI web cuando recibe el package."

**Resolución (29 de junio de 2026):**

Se definen tres contratos de Synapse según audiencia y modo de uso. Estos contratos son genéricos: describen qué hace *cualquier* consumidor del package al recibirlo, sin asumir un consumidor particular.

| Contrato | Audiencia | Comportamiento |
|---|---|---|
| **A — Continuar** | AI web en flujo activo (Claude, ChatGPT, Grok) | El package llega como contexto de fondo. La AI continúa el flujo sin reconocer explícitamente la recepción. Modo de uso: enriquecimiento silencioso del prompt. |
| **B — Evaluar** | AI web en modo revisión | La AI recibe el package y emite una evaluación estructurada de consistencia con el BISP. El ingeniero solicitó explícitamente esta evaluación. |
| **C — Decidir compatibilidad** | Marketplace / runtime Bloom externo | El runtime destino recibe el package con `semantic_descriptor` completo y decide si el Mandate es compatible con su contexto. Requiere capa `marketplace` completa. |

Cualquier consumidor adicional del BISP (por ejemplo, un panel lateral o un agente de monitoreo) debe declarar explícitamente a cuál de estos tres contratos se acoge y documentar sus propias restricciones en un documento de integración separado. Este documento no prescribe restricciones de ningún consumidor específico.

### 2.6 Pendientes sin resolver

| Decisión | Contexto | Estado |
|---|---|---|
| Formato de parsing de la URI `chroma://nucleus-org/intent-uuid/phase` | La URI es una convención interna. Brain necesita una función que la parsee a `(collection_name, document_id)`. Sin estándar externo a adoptar. | PENDIENTE |
| Threshold de similitud configurable por intent (default sugerido: 0.40) | Intents de dominio muy específico pueden necesitar thresholds más altos. La configuración debe estar en `dev_state.json` o en `nucleus-config.json`. | PENDIENTE |
| Formato de exportación de embeddings en el package: binario vs JSON base64 | El binario es más compacto pero menos debuggeable. El JSON base64 es self-describing y compatible con gzip del package completo. | PENDIENTE |

---

## 3. Por qué agregar vectores al BISP

> **Tesis central:** Los vectores no son para las AI web. Son para Bloom. La AI web consume el resultado del trabajo vectorial — texto ya ordenado, conflictos ya clasificados, contexto ya filtrado. El vector hace su trabajo antes de que el package salga del runtime.

### 3.1 El problema que resuelven

Sin vectores, el sistema BTIPS tiene un problema de escala cognitiva. Cuando un proyecto crece — decenas de intents ejecutados, cientos de archivos en el codebase, múltiples Mandates completados — el sistema no tiene forma de responder preguntas semánticas:

- ¿Qué archivos son más relevantes para este nuevo intent?
- ¿Ya resolvimos algo parecido antes? ¿Podemos reutilizar ese trabajo?
- ¿Este conflicto en el `.cor` es semánticamente grave o solo estructural?
- ¿Qué Mandate del marketplace resuelve mejor mi objetivo?

Sin vectores, la única respuesta es textual o manual. Con vectores, Brain responde en milisegundos con precisión medible.

### 3.2 Valor dentro del sistema Bloom

**Ranking semántico del context_plan**

Antes de armar el payload que va a la AI, Brain vectoriza el objetivo del intent y consulta ChromaDB contra todos los archivos del codebase y docbase disponibles. El resultado es un ranking de relevancia. Los archivos más similares semánticamente al objetivo van primero en el payload.

En proyectos con 200+ archivos, la diferencia entre pasar los 10 más relevantes vs 10 aleatorios es la diferencia entre una respuesta precisa y una respuesta genérica. La AI recibe contexto ya filtrado y ordenado, no un dump desordenado.

**Deduplicación de trabajo en Mandates**

Cuando Brain inicia un nuevo Mandate, vectoriza el objetivo y lo compara contra todos los Mandates completados en el Nucleus. Si la similitud supera el threshold, Brain puede alertar al orquestador que ese problema ya fue resuelto y ofrecer reutilizar los findings. Sin vectores, el conocimiento de cada Mandate queda encapsulado en su directorio y es invisible para futuros Mandates similares.

**Clasificación semántica de conflictos en `.cor`**

Con vectores, Brain puede comparar el `intent_delta` de dos ramas y determinar si el conflicto es semánticamente grave (dos implementaciones distintas del mismo concepto) o solo textual (renaming, reformatting). Eso reduce el trabajo de la AI en la etapa de `proposal_assembly`.

### 3.3 Valor en la autarquía entre núcleos Bloom

La autarquía del package tiene dos dimensiones:

- **Autarquía local:** otra máquina con el mismo runtime Bloom puede reconstruir ChromaDB desde el vector embebido en `index.json`. El campo `embedding_source_text` garantiza que el vector es verificable y regenerable incluso si el modelo cambia de versión.
- **Autarquía semántica:** otro runtime Bloom puede entender qué resolvió un package sin ejecutarlo, usando `findings_summary` y `domain_tags`. Esto habilita búsqueda semántica cross-nucleus sin acceso al codebase original.

Un Mandate comprado en el marketplace lleva adentro el conocimiento vectorizado de su propia ejecución. El runtime destino puede reconstruir ChromaDB desde el package y hacer queries semánticas sobre el trabajo del vendor. Eso no es posible con ningún otro sistema de distribución de conocimiento técnico.

### 3.4 Valor como moat del marketplace

> Cualquiera puede copiar un prompt. Cualquiera puede copiar un workflow de n8n o LangGraph. Nadie puede copiar un Mandate que lleva adentro el conocimiento vectorizado de su propia ejecución, estructurado en el filesystem BTIPS, con trazabilidad Temporal, dentro del runtime Bloom. Para ejecutarlo necesitás el runtime completo. Sin él, los archivos son texto inerte.

La analogía correcta es Unity: el marketplace de assets vive dentro del engine. Sin el engine, el asset no corre. Con embeddings en el package, el Mandate además lleva la inteligencia de la ejecución consigo. El comprador no solo obtiene el workflow — obtiene el conocimiento semántico de lo que ese workflow aprendió.

---

## 4. Schema del BISP — index.json con capas

```json
{
  "operational": {
    "intent_type": "dev",
    "objective": "Refactorizar módulo JWT para RS256",
    "payload_summary": "Contexto técnico ordenado semánticamente para consumo por AI web",
    "phase": "implementation"
  },
  "autarchic": {
    "findings_summary": "Se migró JWT de HS256 a RS256. Impacto en auth_controller y user_model.",
    "domain_tags": ["jwt", "rsa", "authentication", "security"],
    "resolved": true,
    "reusable_knowledge": true,
    "vector": {
      "model": "nomic-embed-text",
      "version": "1.5",
      "dimensions": 768,
      "embedding_ref": "chroma://nucleus-org/intent-uuid/implementation",
      "embedding_source_text": "Refactorizar módulo JWT para RS256, afecta auth_controller y user_model",
      "embedded_at": "2026-05-23T14:33:12Z"
    }
  },
  "marketplace": null
}
```

### 4.1 Campo marketplace a nivel Mandate

```json
"marketplace": {
  "mandate_uuid": "mandate-auth-hardening-x7k2",
  "domain": "security/authentication",
  "value_proposition": "Migración completa JWT HS256→RS256 con zero downtime",
  "intent_count": 4,
  "knowledge_coverage": ["jwt", "rsa", "token_rotation", "backwards_compat"],
  "requires_runtime": "bloom/1.0"
}
```

---

## 5. Flujo Operativo Brain–Ollama–ChromaDB

### 5.1 Generación del context_plan (antes del payload)

```
Brain tiene: objetivo del intent (dev_state.json)
Brain tiene: lista de archivos disponibles en .files/

1. Brain → Ollama /api/embed: vectoriza el objetivo
   Ollama → Brain: [vector_objetivo — 768 floats]

2. Brain → ChromaDB: almacena vector_objetivo
   key: intent_uuid/phase/objective

3. Para cada archivo en .files/:
   Brain → Ollama /api/embed: vectoriza el archivo
   Brain → ChromaDB: almacena con key intent_uuid/phase/file/{nombre}

4. Brain → ChromaDB.query(vector_objetivo, n_results=10, threshold=0.40)
   ChromaDB → Brain: [(archivo_1, 0.94), (archivo_2, 0.87), ...]

5. Brain escribe context_plan.json con ese ranking
6. Brain arma payload.json con los archivos en ese orden

La AI web recibe texto ordenado semánticamente. Nunca ve el vector.
```

### 5.2 Registro en index.json (después de la fase)

```
Brain acaba de ejecutar la fase y tiene el payload completo

1. Brain → Ollama /api/embed: vectoriza el payload completo
   Ollama → Brain: [vector_payload — 768 floats]

2. Brain → ChromaDB: almacena con key intent_uuid/phase
   metadata: { intent_type, phase, objective, timestamp }

3. Brain actualiza index.json:
   vector.embedding_ref         = "chroma://nucleus-org/intent_uuid/phase"
   vector.embedding_source_text = texto_que_fue_vectorizado
   vector.embedded_at           = timestamp
```

### 5.3 Deduplicación de Mandates (query cross-intent)

```
Brain inicia un nuevo Mandate con objetivo X

1. Brain → Ollama /api/embed: vectoriza objetivo X
2. Brain → ChromaDB (colección nucleus global).query(vector_X, n=5, threshold=0.85)
3. Si hay resultados:
   Brain recupera los findings_summary de esos intents
   Brain alerta al orquestador: "Problema similar resuelto en mandate-Y"
   Orquestador decide si reutilizar o ejecutar nuevo Mandate
4. Si no hay resultados:
   Brain continúa el Mandate normalmente
```

---

## 6. Impacto en Archivos Existentes

| Archivo / Componente | Estado | Acción requerida |
|---|---|---|
| BTIPS v5.0 (doc) | Actualizar | Agregar sección de capa vectorial. Documentar los tres contratos de Synapse. Actualizar schema de `index.json`. |
| BISP v1.1 (doc) | Actualizar | Agregar campos: `embedding_source_text`, `findings_summary`, `domain_tags`, `resolved`, `reusable_knowledge`. Formalizar las tres capas del `index.json`. |
| Mandate Domain Spec | Extender | Agregar etapa de consolidación semántica al cierre del Mandate. Documentar `mandate_workflow.json` y `.semantic/`. |
| `chroma_client.py` (NUEVO) | Implementar | Inicializa `PersistentClient`, expone `get_or_create_collection`, `add`, `query`. Sin lógica de negocio. |
| `vectorize.py` (NUEVO) | Implementar | Llama a Ollama `/api/embed`, devuelve vector. Manejo graceful si Ollama no está disponible. |
| `chroma_rebuild.py` (NUEVO) | Implementar | Lee `index.json`, extrae `embedding_source_text`, regenera vector vía `vectorize.py`, reconstruye la colección ChromaDB local. |
| `semantic_query.py` (NUEVO) | Implementar | Expone `query_similar(text, collection, n, threshold)`. Brain llama esto para armar el ranking del `context_plan`. |
| Archivos Python viejos (packages gzip) | Auditar | Evaluar compatibilidad con el nuevo pipeline vectorial. Los que crean intents necesitan agregar vectorización al persistir. Los que arman payloads necesitan ordenar por ranking semántico. |

> Los archivos específicos de consumidores del BISP (por ejemplo `background.js` / `panel.js` del Companion Cognitivo) **no** figuran en esta tabla — su impacto se documenta en el documento de integración correspondiente de cada consumidor.

---

## 7. Invariantes de Diseño

Estas propiedades no pueden ser violadas por ninguna decisión de implementación posterior sin revisión explícita de arquitectura.

**Invariante 1 — Texto fuente siempre presente**
Todo vector en el package va acompañado de: modelo exacto, versión, dimensiones, y el texto original que lo generó. Sin estos cuatro campos, el vector no es parte del BISP.

**Invariante 2 — Brain como único orquestador**
Brain llama a Ollama, Brain llama a ChromaDB. Ningún otro componente del sistema tiene acceso directo a ChromaDB. Ningún componente llama a Ollama excepto Brain.

**Invariante 3 — La capa vectorial es aditiva**
Un intent sin vectorizar es un intent válido. La capa semántica mejora el sistema pero no lo bloquea. Si Ollama no está disponible, el pipeline continúa sin vectorización y lo documenta en el `index.json`.

**Invariante 4 — El marketplace es responsabilidad del Mandate**
El campo `marketplace` en `index.json` es `null` en intents individuales. Ningún intent se autocompleta ese campo. Es el Mandate quien agrega, consolida y firma el `semantic_descriptor` del package de marketplace.

**Invariante 5 — Separación de audiencias en el package**
La capa `operational` es para AI web (texto). La capa `autarchic` es para runtime Bloom (texto + vector). La capa `marketplace` es para buyers del marketplace (metadata estructurada). Nunca se mezclan ni se usan fuera de su audiencia.

---

## 8. Estructura de directorios de referencia

```
.bloom/
├── .nucleus-{org}/
│   ├── .cache/
│   │   └── chroma/              ← colección global cross-project
│   └── .mandates/
│       └── {mandate-id}/
│           ├── mandate_workflow.json
│           └── .semantic/       ← consolidación semántica del Mandate
└── .project-{name}/
    └── {intent-uuid}/
        ├── index.json           ← tres capas: operational, autarchic, marketplace
        ├── context_plan.json    ← ranking semántico de archivos
        ├── payload.json
        └── dev_state.json
```

---

*BLOOM — BISP Session Document · v1.1 · Junio 2026*
*Este documento es la fuente de verdad del BISP como protocolo. No modificar sin revisión arquitectónica. No contiene decisiones de integración de consumidores específicos (ver documentos de integración aparte).*
