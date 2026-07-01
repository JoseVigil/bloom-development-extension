# BLOOM — Mandate Universal Schema v1.0.0

**Tipo:** RFC / Design Specification  
**Estado:** Línea base — sesión de diseño activa  
**Fecha:** 2025-06-30  
**Dominio:** Nucleus · Arquitectura Cognitiva · Modelo Universal de Mandate  
**Depende de:** `BLOOM_Gene_Intent_Gen_Spec_v1_0_0.md` · `The_Mandate_Knowledge_Model.md`

---

## Principio rector

> Un Mandate no es un plan de ejecución. Es una unidad de conocimiento estratégico. Su workflow es solamente una de sus proyecciones.

Todo Mandate — incluyendo el de Genesis — posee exactamente el mismo contrato estructural. No existen tipos de Mandate con anatomía diferente. La variabilidad es de contenido, nunca de forma.

---

## Reglas de invariancia aplicadas a este schema

| # | Invariante |
|---|---|
| I-1 | Un único contrato `mandate.json` + `mandate_state.json` para todo Mandate. |
| I-2 | Las dos proyecciones (Operacional / Cognitiva) son secciones disociadas dentro del mismo objeto. Nunca documentos separados. |
| I-3 | Ningún campo de la proyección Cognitiva puede generarse antes de completar el Pipeline de Firma Cognitiva. |
| I-4 | La firma (`signedAt`) congela simultáneamente ambas proyecciones. Un Mandate con `cognitive.embedding.ref: null` no puede ser firmado. |
| I-5 | La proyección Cognitiva es la única representación que viaja a ChromaDB. Nunca el JSON completo. |
| I-6 | `cognitive.semanticSummary` es el campo que se vectoriza. No `cognitive.cognitiveProfile` ni `operational.objective`. |

---

## 1. `mandate.json` — Contrato universal (inmutable tras firma)

```json
{
  // ═══════════════════════════════════════════════════════
  // BLOQUE 0 — IDENTIDAD (invariante, pre-firma)
  // ═══════════════════════════════════════════════════════

  "mandateId":      "string  — uuid4, generado al crear el draft",
  "mandateVersion": "string  — semver del mandate (ej. '1.0.0'). PATCH: corrección de payload. MINOR: cambio de scope operacional sin cambio de misión. MAJOR: cambio de misión estratégica.",
  "schemaVersion":  "string  — versión de este schema (ej. '1.0.0'). Permite migración futura.",
  "projectId":      "string  — uuid del proyecto al que pertenece",
  "organizationId": "string  — uuid de la organización en Nucleus",
  "name":           "string  — nombre legible, único dentro del proyecto (ej. 'genesis' | 'implement-jwt-auth')",
  "createdAt":      "string  — ISO 8601, timestamp de creación del draft",
  "signedAt":       "string | null  — ISO 8601. null mientras el Mandate no ha completado el Pipeline de Firma Cognitiva.",

  // ═══════════════════════════════════════════════════════
  // BLOQUE 1 — PROYECCIÓN OPERACIONAL
  // Consumida por Temporal para ejecución.
  // Congelada en firma. No viaja a ChromaDB.
  // ═══════════════════════════════════════════════════════

  "operational": {

    "objective": "string  — descripción técnica concisa del objetivo de ejecución. Una oración. Ej: 'Bootstrap initial project structure and register Genesis gene.'",

    "actions": [
      {
        "actionId":     "string  — uuid4, único dentro del mandate",
        "type":         "string  — tipo de acción (ej. 'run_intent', 'call_service', 'await_mandate')",
        "intentType":   "string | null  — 'dev' | 'doc' | 'gen' | 'cor' | 'exp' | null si no aplica",
        "name":         "string  — nombre legible de la acción",
        "description":  "string  — qué realiza esta acción",
        "dependsOn":    ["string  — actionId de acciones predecesoras. [] si es el primer paso."],
        "payload":      "string  — referencia al key correspondiente en operational.payloads (ej. 'setupGitAction')",
        "onSuccess":    "string | null  — actionId siguiente o null si es terminal",
        "onFailure":    "string  — 'fail_mandate' | actionId de compensación"
      }
    ],

    "payloads": {
      "<<payloadKey>>": {
        "description": "string  — propósito del payload",
        "data":        "object  — estructura específica de la acción. Libre, definida por el tipo de intent."
      }
    },

    "workflow": {
      "type":            "enum  — 'sequential' | 'parallel' | 'conditional'",
      "entryActionId":   "string  — actionId del primer paso del workflow",
      "steps": [
        {
          "stepId":      "string",
          "actionId":    "string  — referencia a operational.actions[].actionId",
          "condition":   "string | null  — expresión booleana evaluable por Temporal. null si no es condicional."
        }
      ]
    },

    "dependencies": {
      "mandates":   ["string  — mandateId de mandates que deben completarse antes de ejecutar este"],
      "genes":      ["string  — geneId de genes que este mandate necesita para ejecutar"]
    },

    "temporalConfig": {
      "taskQueue":       "string  — nombre de la task queue en Temporal",
      "timeoutSeconds":  "number  — timeout total del workflow en segundos",
      "retryPolicy": {
        "maximumAttempts":         "number",
        "initialIntervalSeconds":  "number",
        "backoffCoefficient":      "number",
        "maximumIntervalSeconds":  "number"
      }
    }

  },

  // ═══════════════════════════════════════════════════════
  // BLOQUE 2 — PROYECCIÓN COGNITIVA
  // Generada por el Pipeline de Firma Cognitiva.
  // Solo esta proyección viaja a ChromaDB.
  // Congelada en firma junto al contrato operacional.
  // ═══════════════════════════════════════════════════════

  "cognitive": {

    // ─── 2.1 Perfil Cognitivo ───────────────────────────
    // Generado por Nucleus en la fase 'Generate Cognitive Profile'
    // del pipeline. Representa la anatomía semántica del Mandate.

    "cognitiveProfile": {

      "mission":              "string  — una oración que expresa la misión estratégica. Ej: 'Introduce a stateless authentication subsystem replacing legacy session-based auth.'",

      "domain":               "string  — dominio primario. Ej: 'authentication'. Debe coincidir con o derivar de un Gene existente si aplica.",

      "subdomains":           ["string  — dominios secundarios tocados. Ej: ['authorization', 'middleware', 'token-lifecycle']"],

      "capabilities": [
        {
          "name":             "string  — nombre de la capacidad. Ej: 'JWT token issuance'",
          "action":           "enum  — 'introduces' | 'modifies' | 'deprecates' | 'reuses'",
          "description":      "string  — qué aporta o cambia esta capacidad en el sistema"
        }
      ],

      "concepts":             ["string  — conceptos de dominio involucrados. Ej: ['JWT', 'OAuth2', 'RBAC', 'refresh-token-rotation']"],

      "architecturalImpact":  "string  — descripción del impacto arquitectónico. Ej: 'Replaces session middleware stack. Affects all API routes requiring auth. Introduces token blacklist dependency.'",

      "intentions": [
        {
          "intent":           "string  — intención estratégica. Ej: 'Improve horizontal scalability by eliminating server-side session state.'",
          "priority":         "enum  — 'primary' | 'secondary'"
        }
      ],

      "relations": {
        "dependsOn":  ["string  — mandateId o geneId del que este Mandate depende semánticamente"],
        "enabledBy":  ["string  — geneId de genes cuya madurez hace posible este Mandate"],
        "produces":   ["string  — geneId que este Mandate se espera que cree o evolucione al ejecutar"],
        "blockedBy":  ["string  — mandateId de mandates que deben completarse primero (semántico, no solo operacional)"]
      },

      "keywords":             ["string  — términos para búsqueda semántica. Ej: ['jwt', 'auth', 'stateless', 'oauth', 'token']"]

    },

    // ─── 2.2 Huella Cognitiva ──────────────────────────
    // Texto en lenguaje natural enriquecido que sintetiza
    // el perfil cognitivo completo. ES EL CAMPO QUE SE VECTORIZA.
    // Generado por Nucleus en la fase 'Generate Semantic Summary & Embedding'.
    // Nunca generado manualmente. Nunca el JSON operacional.

    "semanticSummary": "string  — párrafo de 3 a 6 oraciones en inglés, libre de ruido técnico (sin UUIDs, sin paths, sin status codes). Ejemplo: 'This mandate introduces a stateless authentication subsystem for a multi-tenant REST API, replacing legacy session-based authentication with JWT and OAuth2. It affects the authorization layer, request middleware, token lifecycle management and RBAC enforcement, introducing reusable capabilities for API security across the platform. Key architectural impact: elimination of server-side session state enables horizontal scaling. Produces the Authentication gene and refines the Authorization gene.'",

    // ─── 2.3 Embedding ─────────────────────────────────
    // Generado a partir de semanticSummary. Nunca del JSON completo.

    "embedding": {
      "ref":          "string | null  — URI en ChromaDB: 'chroma://{org}/mandates/{mandateId}'. null hasta completar pipeline.",
      "model":        "string  — modelo de embedding usado. Ej: 'nomic-embed-text'",
      "dimensions":   "number  — dimensiones del vector. Ej: 768",
      "embeddedAt":   "string | null  — ISO 8601. null hasta completar pipeline.",
      "sourceText":   "string | null  — copia exacta del semanticSummary que generó el vector. Requerido para reproducibilidad. null hasta completar pipeline."
    },

    // ─── 2.4 Mandates Similares ────────────────────────
    // Resultado de la búsqueda en ChromaDB durante el pipeline.
    // Permite al usuario/Nucleus detectar reutilización antes de firmar.

    "similarMandates": [
      {
        "mandateId":    "string  — mandateId del Mandate similar encontrado",
        "projectId":    "string  — proyecto origen",
        "similarity":   "number  — 0.0 a 1.0",
        "domain":       "string  — dominio del Mandate similar",
        "mission":      "string  — misión del Mandate similar (para lectura humana)"
      }
    ],

    // ─── 2.5 Genes Vinculados ──────────────────────────
    // Genes reusables detectados y vinculados durante el pipeline.
    // ownGenes: genes que nacen de la EJECUCIÓN de este Mandate (se completan post-ejecución).
    // linkedGenes: genes pre-existentes que este Mandate reutiliza o extiende.

    "linkedGenes": [
      {
        "geneId":       "string  — geneId del Gene pre-existente",
        "relation":     "enum  — 'reuses' | 'extends' | 'deprecates'",
        "linkedAt":     "string | null  — ISO 8601. null hasta completar pipeline."
      }
    ],

    "expectedGenes": [
      {
        "domain":          "string  — dominio semántico del Gene que se espera producir. Ej: 'authentication'",
        "semanticIntent":  "string  — descripción de la capacidad que se anticipa. Ej: 'Stateless JWT-based token issuance and validation.'",
        "relation":        "enum  — 'creates' | 'evolves'  — si se espera un Gene nuevo o la evolución de uno existente",
        "targetGeneId":    "string | null  — solo si relation = 'evolves': geneId del Gene que se espera evolucionar. null si relation = 'creates'."
      }
    ]

    // ⚠️ NOTA DE INVARIANCIA:
    // mandate.json NO contiene los geneIds reales generados durante la ejecución.
    // expectedGenes es exclusivamente una declaración de intencionalidad pre-firma.
    // El registro definitivo, indexado y con UUIDs reales, vive en:
    //   mandate_state.json → cognitiveEvolution.geneEvents[]
    // Solo el intent `gen` tiene autoridad para escribir esos registros,
    // de forma append-only, durante la ejecución.

  }

}
```

---

## 2. `mandate_state.json` — Estado en tiempo de ejecución (mutable)

```json
{
  // ═══════════════════════════════════════════════════════
  // BLOQUE 0 — REFERENCIA E IDENTIDAD DE ESTADO
  // ═══════════════════════════════════════════════════════

  "mandateId":      "string  — referencia al mandate.json correspondiente",
  "schemaVersion":  "string  — versión del schema de estado (ej. '1.0.0')",

  "currentStatus":  "enum  — estado actual del Mandate. Ver tabla de estados abajo.",

  // ═══════════════════════════════════════════════════════
  // BLOQUE 1 — ESTADO DEL PIPELINE DE FIRMA COGNITIVA
  // Refleja el progreso de las fases pre-firma.
  // Se congela cuando currentStatus pasa a 'signed'.
  // ═══════════════════════════════════════════════════════

  "cognitiveSigningPipeline": {

    "phase":          "enum  — 'idle' | 'analyzing' | 'profiling' | 'embedding' | 'searching' | 'linking' | 'ready_to_sign' | 'completed'",

    "steps": {
      "analyze": {
        "status":      "enum  — 'pending' | 'running' | 'completed' | 'failed'",
        "completedAt": "string | null  — ISO 8601"
      },
      "generateCognitiveProfile": {
        "status":      "enum  — 'pending' | 'running' | 'completed' | 'failed'",
        "completedAt": "string | null"
      },
      "generateSemanticSummaryAndEmbedding": {
        "status":      "enum  — 'pending' | 'running' | 'completed' | 'failed'",
        "completedAt": "string | null"
      },
      "searchSimilarMandates": {
        "status":      "enum  — 'pending' | 'running' | 'completed' | 'failed'",
        "completedAt": "string | null",
        "resultsCount": "number | null  — cantidad de mandates similares encontrados"
      },
      "linkReusableGenes": {
        "status":       "enum  — 'pending' | 'running' | 'completed' | 'failed'",
        "completedAt":  "string | null",
        "linkedCount":  "number | null  — cantidad de genes vinculados"
      }
    },

    "startedAt":      "string | null  — ISO 8601, inicio del pipeline completo",
    "completedAt":    "string | null  — ISO 8601, cuando todos los steps terminaron con 'completed'"

  },

  // ═══════════════════════════════════════════════════════
  // BLOQUE 2 — ESTADO OPERACIONAL
  // Refleja el progreso de la ejecución en Temporal.
  // Solo es relevante cuando currentStatus = 'executing' o posterior.
  // ═══════════════════════════════════════════════════════

  "operationalState": {

    "activeIntents": [
      {
        "intentId":   "string  — intentId del intent en ejecución",
        "intentType": "enum  — 'dev' | 'doc' | 'gen' | 'cor' | 'exp'",
        "actionId":   "string  — actionId del mandate.json al que corresponde",
        "startedAt":  "string  — ISO 8601"
      }
    ],

    "completedIntents": [
      {
        "intentId":      "string",
        "intentType":    "enum  — 'dev' | 'doc' | 'gen' | 'cor' | 'exp'",
        "actionId":      "string",
        "status":        "enum  — 'completed' | 'failed'",
        "completedAt":   "string  — ISO 8601",
        "geneTriggered": "string | null  — geneId si este intent disparó un intent gen posterior"
      }
    ],

    "failedActions": [
      {
        "actionId":      "string  — actionId del mandate.json que falló",
        "intentId":      "string | null",
        "failedAt":      "string  — ISO 8601",
        "reason":        "string  — descripción del fallo",
        "retryCount":    "number"
      }
    ],

    "progress": {
      "totalSteps":      "number  — total de steps del workflow",
      "completedSteps":  "number",
      "percentComplete": "number  — 0 a 100"
    },

    "executionStartedAt":  "string | null  — ISO 8601",
    "executionEndedAt":    "string | null  — ISO 8601. null mientras ejecuta."

  },

  // ═══════════════════════════════════════════════════════
  // BLOQUE 3 — EVOLUCIÓN COGNITIVA EN EJECUCIÓN
  // Registra los eventos semánticos que ocurren DURANTE la ejecución.
  // Estos son los deltas de genes que nacen al cerrar intents episódicos.
  // ═══════════════════════════════════════════════════════

  "cognitiveEvolution": {

    "geneEvents": [
      {
        "eventId":           "string  — uuid4",
        "geneId":            "string  — geneId afectado",
        "decision":          "enum  — 'new_gene' | 'gene_evolution' | 'rejected'",
        "deltaRef":          "string | null  — path al delta.json en .mandates/{uuid}/.genes/{uuid}/.history/",
        "triggeringIntentId": "string  — intentId del gen que produjo este evento",
        "originIntentId":    "string  — intentId del dev/doc/cor que disparó el gen",
        "occurredAt":        "string  — ISO 8601"
      }
    ],

    "resolutionIncreases": [
      {
        "parentGeneId":      "string  — gene que fue dividido (mitosis)",
        "childGeneIds":      ["string  — genes resultantes de la división"],
        "triggeredByGenId":  "string  — intentId del gen que ejecutó la mitosis",
        "occurredAt":        "string  — ISO 8601"
      }
    ],

    "geneMerges": [
      {
        "sourceGeneIds":     ["string  — genes fusionados"],
        "resultingGeneId":   "string  — gene resultante de la fusión",
        "triggeredByGenId":  "string  — intentId del gen que ejecutó la fusión",
        "occurredAt":        "string  — ISO 8601"
      }
    ]

  },

  "updatedAt": "string  — ISO 8601, timestamp de la última mutación de este archivo"

}
```

---

## 3. Tabla de estados del Mandate

| Status | Descripción | Quién lo setea |
|---|---|---|
| `draft` | Mandate creado. Sin perfil cognitivo. | Nucleus al crear el draft |
| `pending_cognitive` | Pipeline de firma cognitiva en curso | Nucleus al iniciar el pipeline |
| `ready_to_sign` | Pipeline completado. Embedding disponible. Esperando firma. | Nucleus al completar el pipeline |
| `signed` | Ambas proyecciones congeladas. Listo para ejecutar. | Nucleus al recibir confirmación de firma |
| `executing` | Workflow activo en Temporal | Temporal al iniciar el primer step |
| `completed` | Todos los steps terminaron con éxito | Temporal al cerrar el workflow |
| `failed` | Al menos un step falló y no hay compensación posible | Temporal o Nucleus |
| `cancelled` | Revocado manualmente antes o durante ejecución | Operator |

---

## 4. Pipeline de Firma Cognitiva — Flujo de estados

```
CREATE DRAFT
  mandate.json creado
  cognitive.embedding.ref = null
  currentStatus = 'draft'
         │
         ▼
ANALYZE
  Nucleus lee operational.objective + operational.actions
  Identifica dominios candidatos
  cognitiveSigningPipeline.steps.analyze → 'completed'
  currentStatus = 'pending_cognitive'
         │
         ▼
GENERATE COGNITIVE PROFILE
  Nucleus produce cognitive.cognitiveProfile completo
  (mission, domain, capabilities, concepts, architecturalImpact, intentions, relations, keywords)
  cognitiveSigningPipeline.steps.generateCognitiveProfile → 'completed'
         │
         ▼
GENERATE SEMANTIC SUMMARY & EMBEDDING
  Nucleus genera cognitive.semanticSummary (lenguaje natural, sin ruido técnico)
  Brain vectoriza semanticSummary vía Ollama (nomic-embed-text, 768 dim)
  cognitive.embedding.ref ← URI en ChromaDB
  cognitive.embedding.sourceText ← copia exacta del semanticSummary
  cognitiveSigningPipeline.steps.generateSemanticSummaryAndEmbedding → 'completed'
         │
         ▼
SEARCH SIMILAR MANDATES
  Brain consulta ChromaDB colección 'nucleus-mandates'
  cognitive.similarMandates[] ← resultados con similarity > threshold
  cognitiveSigningPipeline.steps.searchSimilarMandates → 'completed'
         │
         ▼
LINK REUSABLE GENES
  Brain consulta ChromaDB colección 'nucleus-genes'
  cognitive.linkedGenes[] ← genes pre-existentes con relation 'reuses' | 'extends'
  cognitiveSigningPipeline.steps.linkReusableGenes → 'completed'
  currentStatus = 'ready_to_sign'
         │
         ▼
SIGN
  Nucleus congela mandate.json (inmutable a partir de aquí)
  mandate.json.signedAt ← timestamp
  currentStatus = 'signed'
         │
         ▼
EXECUTE
  Temporal inicia workflow
  currentStatus = 'executing'
```

---

## 5. Contrato de Genesis bajo este schema universal

El Mandate de Genesis no tiene anatomía diferente. Es simplemente un Mandate cuyo contenido refleja su naturaleza de bootstrap:

```json
{
  "name": "genesis",
  "operational": {
    "objective": "Bootstrap initial project structure and register Genesis gene.",
    "actions": [
      { "actionId": "...", "type": "run_intent", "intentType": "dev", "name": "scaffold-project-structure", ... },
      { "actionId": "...", "type": "run_intent", "intentType": "gen", "name": "register-genesis-gene", ... }
    ]
  },
  "cognitive": {
    "cognitiveProfile": {
      "mission": "Establish the foundational architecture and initial knowledge graph of the project.",
      "domain": "genesis",
      "capabilities": [{ "name": "project-scaffolding", "action": "introduces" }],
      ...
    },
    "semanticSummary": "This mandate bootstraps the project by establishing its foundational directory structure, core configuration, and initial gene registry. It is expected to produce the Genesis gene — the lowest-resolution semantic unit — which serves as the root node of the project's cognitive graph.",
    "expectedGenes": [
      {
        "domain": "genesis",
        "semanticIntent": "Foundational project structure and initial cognitive graph root node.",
        "relation": "creates",
        "targetGeneId": null
      }
    ]
  }
}
```

Genesis cumple exactamente el mismo contrato. Su Gene es simplemente el de menor resolución cognitiva del sistema.

---

## 6. Reglas de escritura en `mandate_state.json`

| Regla | Descripción |
|---|---|
| R-1 | `mandate.json` es **inmutable tras firma**. Toda mutación post-firma ocurre exclusivamente en `mandate_state.json`. |
| R-2 | `failedActions` en `operationalState` es un array **append-only**. Ninguna entrada se elimina ni sobreescribe. |
| R-3 | `cognitiveEvolution.geneEvents` es **append-only**. El historial de eventos semánticos no se destruye. |
| R-4 | `mandate.json.cognitive.expectedGenes[]` es una **declaración de intencionalidad pre-firma**, inmutable tras la firma. Los geneIds reales generados durante la ejecución se registran exclusivamente en `mandate_state.json.cognitiveEvolution.geneEvents[]` por el intent `gen`. Ningún otro intent puede escribir en ese registro. |
| R-5 | La transición `ready_to_sign → signed` requiere que `cognitive.embedding.ref !== null` y `cognitive.embedding.sourceText !== null`. Nucleus debe rechazar la firma si alguno de los dos es `null`. |
| R-6 | `updatedAt` en `mandate_state.json` se actualiza en cada mutación del archivo. Es el timestamp de trazabilidad. |

---

*Fin del documento — v1.0.0 — Base para sesión de diseño en curso.*
