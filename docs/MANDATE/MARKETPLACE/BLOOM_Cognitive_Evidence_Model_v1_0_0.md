# BLOOM — Cognitive Evidence Model v1.0.0

**Tipo:** RFC / Design Specification
**Estado:** Línea base — sesión de diseño activa
**Fecha:** 2026-07-01
**Dominio:** Nucleus · Cognitive Ledger · Memoria Estratégica Federada
**Depende de:** `BLOOM_Mandate_Universal_Schema_v1_0_0.md` · `BLOOM_Mandate_Package_Spec_v1_0_0.md`
**Extiende:** El bloque `federatedCognition` introducido como extensión de `cognitive` en el Universal Schema. Formaliza el contenido de `epoch_N.json` referenciado por `ledgerRef`.

---

## Principio rector

> Un Mandate no transporta la solución. Transporta la evidencia de por qué esa solución fue, o no fue, la correcta — condicionada por el contexto en el que cientos de ingenieros ya la probaron.

`cognitive_evidence` es el payload que viaja **fuera** de `mandate.json`, dentro de cada Epoch del Cognitive Ledger. No es una tercera proyección del contrato universal (I-2 no se toca: el contrato sigue teniendo exactamente dos proyecciones, Operacional y Cognitiva). Es un documento de evidencia acumulada, versionado por epoch, que el motor local consulta — nunca un campo que el Mandate firme o congele.

---

## Reglas de invariancia — continúan I-1 a I-12

| # | Invariante |
|---|---|
| I-13 | `cognitive_evidence` nunca existe dentro de `mandate.json`. Vive exclusivamente en `epoch_N.json`, referenciado por `federatedCognition.ledgerRef`. Ningún campo de este documento puede aparecer embebido en el contrato firmado, bajo ninguna circunstancia, ni siquiera como snapshot de solo lectura. |
| I-14 | Todo campo `narrativeDigest` de este schema debe pasar por el **Evidence Linter** antes de salir del Nucleus de origen hacia el agregador. El linter aplica, como mínimo: eliminación de identificadores locales (mismo check que `noLocalIdentifiers` de `compliance.linter.json`), eliminación de secretos/credenciales (`noEmbeddedSecrets`), y **reescritura obligatoria vía paráfrasis** — el texto que sale nunca es una copia ni un recorte del texto original del intent, es una síntesis generada, acotada a un máximo de palabras declarado por campo. Un `narrativeDigest` que falle el linter se descarta completo; el registro estructurado (`conceptTag`, enums cerrados) viaja igual sin el digest. |
| I-15 | `failureClass` y `remediationApplied` en `failures[]` usan **la misma taxonomía cerrada y versionada** que `executionEvent.failureClass` / `executionEvent.remediationApplied` (Cognitive Ledger, capa de telemetría). No existen dos vocabularios paralelos para el mismo concepto — una única `evidenceTaxonomy.json` versionada gobierna ambos. |
| I-16 | Toda estadística agregada (`cognitiveWeights`, clusters de evidencia, `failureGraph`) usa como unidad de k-anonimato el **Nucleus distinto**, no el evento. Umbral mínimo: 20 Nucleus distintos por celda. Ningún Nucleus individual puede aportar más del 20% de los registros que forman una celda — el excedente se satura, no se cuenta. Ambos parámetros son configurables pero nunca inferiores a estos defaults sin revisión explícita. |
| I-17 | El presupuesto de privacidad diferencial (`epsilon`) se administra **por vida del dataset** (`lifetimeEpsilonBudget`, por `mandateSlug` + `contextCell`), no por epoch. Cada epoch consume una porción del presupuesto vía composición avanzada. Cuando el presupuesto se agota, esa celda se congela — no recibe más refinamiento de ruido, y se marca `privacyBudgetExhausted: true`. |
| I-18 | `generalizationLevel` (a qué nivel de la jerarquía de contexto tuvo que subir una celda para satisfacer k-anonimato) **nunca se publica** en el epoch externo. Es un campo interno del agregador, usado solo para auditoría operativa. El motor local recibe el peso ya generalizado, sin metadata sobre cuánto se generalizó. |
| I-19 | `nucleusAttestation` es una clave **derivada por epoch** (HMAC de la clave raíz de instalación + número de epoch), nunca la clave raíz directa. El agregador puede deduplicar contribuciones dentro de un mismo epoch; ningún tercero puede correlacionar la misma instalación entre epoch_N y epoch_N+1 a partir de esta clave. |
| I-20 | Ninguna arista del `failureGraph` puede presentarse como recomendación de ruta sin que su hipótesis de Markov haya sido validada estadísticamente contra los datos disponibles (comparación de `P(éxito | estado actual)` vs. `P(éxito | estado actual, historial)` cuando el sample lo permite). Si la diferencia es significativa, la arista se marca `pathDependencyDetected: true` y el motor local debe tratarla con confianza reducida, nunca como transición markoviana simple. |
| I-21 | Los embeddings de `cognitive_evidence` se computan exclusivamente sobre `conceptTag` + `narrativeDigest` ya linteado. Nunca sobre código fuente, nunca sobre el `originIntentId` u otro identificador local, nunca sobre el texto pre-linter. Viven en una colección ChromaDB separada (`nucleus-evidence`), distinta de `nucleus-mandates` y `nucleus-genes`. |
| I-22 | Ningún resultado de búsqueda o recomendación derivada de `cognitive_evidence` puede mostrarse en el Conductor sin su `globalConfidence` adjunto y visible en el mismo elemento de UI. No existe una vista que muestre el contenido sin el número que dice cuánta evidencia lo respalda. |
| I-23 | El motor Bloom local computa el path-finding sobre el `failureGraph` y la búsqueda semántica sobre `cognitive_evidence` **localmente**, tras descargar el epoch completo. Ninguna consulta por `actionId` individual, por Mandate, ni por dominio de búsqueda viaja como query en tiempo real al agregador — el patrón de consultas del comprador es en sí mismo información sensible. |
| I-24 | `reuseHistory[]` y `evolution[]` son **append-only** dentro de la vida del Cognitive Ledger. Ningún epoch puede reescribir o eliminar un evento de epochs anteriores — solo puede agregar eventos nuevos o registrar una superación (`supersededBy`) explícita, trazable. |

---

## 1. Taxonomía de la evidencia

Todos los campos marcados como `enum` referencian `evidenceTaxonomy.json`, un vocabulario cerrado, versionado independientemente de este RFC, gobernado por el agregador. Ningún campo de este bloque acepta texto libre salvo `narrativeDigest`, sujeto a I-14.

### 1.1 `decisions[]`

```json
{
  "decisionId":        "string — uuid4",
  "domain":             "string — coincide con cognitive.cognitiveProfile.domain del Mandate origen",
  "decisionCategory":   "enum — 'architecture' | 'data_model' | 'protocol' | 'dependency_choice' | 'security_control' | 'performance_strategy' | 'concurrency_model' | 'error_handling_strategy'",

  "contextTrigger": {
    "originIntentType":       "enum — 'exp' | 'dev' | 'doc' | 'gen' | 'cor'",
    "environmentFingerprint": "object — misma taxonomía cerrada que executionEvent.environmentFingerprint (Cognitive Ledger, telemetría)"
  },

  "chosenApproach": {
    "conceptTag":       "string — de un vocabulario controlado versionado. Ej: 'jwt-stateless-auth', 'optimistic-locking'. NUNCA nombre+versión exacta de librería propietaria; solo tags de un vocabulario público mantenido por el agregador.",
    "narrativeDigest":  "string | null — máx. 40 palabras, post-linter (I-14)"
  },

  "justification": {
    "primaryDriver":    "enum — 'scalability' | 'latency' | 'maintainability' | 'security' | 'team_familiarity' | 'regulatory_constraint' | 'cost_efficiency'",
    "narrativeDigest":  "string | null — máx. 40 palabras, post-linter"
  },

  "confidenceAtDecisionTime": "enum — 'high' | 'medium' | 'low' — autoevaluación del ingeniero que registró la decisión, no una medición",

  "originIntentId":    "string — intentId LOCAL del Nucleus de origen. NUNCA sale del Nucleus emisor. El Evidence Linter lo elimina antes de que el registro llegue al agregador (mismo tratamiento que projectId/organizationId en el Package Spec, I-7).",

  "supersededBy":      "string | null — decisionId que reemplazó a esta decisión, si aplica",
  "recordedAt":         "string — ISO 8601, redondeado al día"
}
```

### 1.2 `rejected_alternatives[]`

```json
{
  "alternativeId":      "string — uuid4",
  "relatedDecisionId":  "string — decisionId al que este rechazo pertenece",
  "conceptTag":         "string — vocabulario controlado. Ej: 'graphql-federation', 'polling-based-sync', 'shared-session-store'",

  "rejectionReason": {
    "primaryCategory":  "enum — 'performance_insufficient' | 'operational_complexity' | 'ecosystem_immaturity' | 'cost_prohibitive' | 'security_gap' | 'team_skill_gap' | 'vendor_lockin_risk'",
    "narrativeDigest":  "string | null — máx. 40 palabras, post-linter"
  },

  "reconsiderationCondition": "string | null — narrativeDigest opcional. Ej: 'si el throughput objetivo cae por debajo de un umbral menor'",
  "evidenceStrength":   "enum — 'empirically_tested' | 'analytically_reasoned' | 'anecdotal'"
}
```

### 1.3 `tradeoffs[]`

```json
{
  "tradeoffId":        "string — uuid4",
  "relatedDecisionId": "string",

  "gained": {
    "dimension":  "enum — 'throughput' | 'latency_p50' | 'latency_p99' | 'simplicity' | 'cost' | 'security_posture' | 'time_to_market' | 'testability'",
    "direction":  "enum — 'increase' | 'decrease'",
    "magnitude":  "enum — 'marginal' | 'moderate' | 'substantial' — NUNCA una cifra cruda. Un número real filtra la escala del sistema del comprador de origen."
  },
  "sacrificed": {
    "dimension":  "enum — mismo vocabulario que 'gained.dimension'",
    "direction":  "enum — 'increase' | 'decrease'",
    "magnitude":  "enum — 'marginal' | 'moderate' | 'substantial'"
  },

  "narrativeDigest": "string | null — máx. 40 palabras, post-linter"
}
```

### 1.4 `assumptions[]` y `hypotheses[]`

```json
"assumptions": [
  {
    "assumptionId":       "string — uuid4",
    "statementTag":       "string — vocabulario controlado. Ej: 'single_region_deployment', 'read_heavy_workload', 'trusted_internal_network'",
    "criticality":        "enum — 'invalidates_mandate_if_false' | 'degrades_performance_if_false' | 'cosmetic_if_false'",
    "validatedInPractice": "boolean | null — true/false si el Ledger tiene evidencia agregada de ejecuciones donde se puso a prueba; null si no hay evidencia suficiente",
    "narrativeDigest":     "string | null — máx. 30 palabras, post-linter"
  }
],
"hypotheses": [
  {
    "hypothesisId":  "string — uuid4",
    "statementTag":  "string — vocabulario controlado",
    "testMethod":    "enum — 'load_test' | 'canary_deployment' | 'code_review_consensus' | 'production_monitoring' | 'a_b_comparison'",
    "outcome":       "enum — 'confirmed' | 'refuted' | 'inconclusive'",
    "confidence":    "number — 0.0 a 1.0, autoevaluación del emisor al momento del registro"
  }
]
```

### 1.5 `failures[]` — el activo de mayor valor, y el de mayor riesgo de fuga

```json
{
  "failureId":     "string — uuid4",
  "failureClass":  "string — MISMA taxonomía cerrada que executionEvent.failureClass (I-15)",

  "rootCause": {
    "category":         "enum — 'race_condition' | 'resource_exhaustion' | 'misconfigured_dependency' | 'version_incompatibility' | 'incorrect_assumption' | 'edge_case_unhandled' | 'external_service_contract_violation'",
    "narrativeDigest":  "string | null — máx. 40 palabras, post-linter"
  },

  "involvedDependencyTags": ["string — conceptTag de vocabulario controlado, ej: 'connection-pooling-layer', 'message-queue-consumer'. NUNCA nombre de paquete + versión exacta salvo que sea open source ampliamente público y el tag por sí solo no revele topología interna del comprador."],

  "resolvingIntentType":  "enum — típicamente 'exp', puede ser 'dev' o 'cor'",
  "remediationApplied":   "string — MISMA taxonomía cerrada que executionEvent.remediationApplied (I-15)",
  "detectionMethod":      "enum — 'automated_test' | 'manual_review' | 'production_incident' | 'staging_validation'",
  "severityAtDiscovery":  "enum — 'blocking' | 'degraded' | 'cosmetic'",

  "timeToResolutionBucket": "enum — '<1h' | '1-4h' | '4-24h' | '>24h' — bucket, nunca duración exacta (una duración precisa combinada con severidad puede filtrar tamaño/velocidad del equipo emisor)"
}
```

### 1.6 `reuseHistory[]` y `evolution[]`

```json
"reuseHistory": [
  {
    "reuseEventId":       "string — uuid4",
    "occurredAtEpoch":    "number — epoch en que se registró. NUNCA timestamp exacto del comprador.",
    "contextCell":        "object — misma taxonomía cerrada de environmentFingerprint",
    "adaptationRequired": "enum — 'none' | 'minor_payload_adjustment' | 'gene_blueprint_mismatch' | 'major_rework'",
    "outcome":            "enum — 'success' | 'failure' | 'abandoned'"
  }
],
"evolution": [
  {
    "evolutionEventId":     "string — uuid4",
    "fromMandateVersion":   "string — semver",
    "toMandateVersion":     "string — semver",
    "triggeredBy":          "enum — 'aggregated_failure_pattern' | 'publisher_manual_revision' | 'deprecated_dependency_tag'",
    "changeSummaryTag":     "string — vocabulario controlado. Ej: 'replaced_remediation_path', 'tightened_assumption', 'added_capability'",
    "epochRangeAffected":   { "from": "number", "to": "number" }
  }
]
```

(Regla I-24: ambos arrays son append-only. `supersededBy`/`evolutionEventId` referencian, nunca sobrescriben.)

---

## 2. Vectorización de la experiencia

### 2.1 Por qué no puede ser una extensión trivial del Pipeline de Firma Cognitiva existente

El Pipeline de Firma Cognitiva del Universal Schema (§4) vectoriza `semanticSummary` de **un solo** Mandate, en **un solo** Nucleus, en el momento de la firma. `cognitive_evidence` es estructuralmente distinto: es contenido que llega de **muchos** Nucleus, en **momentos distintos**, y se agrega en el tiempo. No corre en el Nucleus del comprador ni del vendedor — corre en el agregador, sobre el epoch.

Dos niveles de embedding, no uno:

**Nivel 1 — Embedding de registro individual (interno al agregador, nunca expuesto directamente).**
Cada `decision`, `rejected_alternative`, `tradeoff` o `failure` que llega ya linteado (I-14) se vectoriza individualmente sobre `conceptTag + narrativeDigest`, usando el mismo modelo de embedding que el Pipeline de Firma Cognitiva (`nomic-embed-text` u otro declarado). Este vector se usa **solo para clustering interno** — nunca se indexa en una colección consultable por Nucleus externos. Motivo: un embedding individual, aunque generado sobre texto ya sanitizado, sigue siendo vulnerable a ataques de vecino-más-cercano que permiten inferir membership (si alguien sospecha que la organización X contribuyó cierta evidencia, puede intentar reconstruir aproximaciones comparando contra textos candidatos). Exponer vectores 1:1 reintroduce exactamente el problema de re-identificación que k-anonimato en `cognitiveWeights` ya evita para las estadísticas numéricas.

**Nivel 2 — Embedding de clúster (lo único que se publica y se busca).**
El agregador agrupa los vectores de Nivel 1 por similitud (ej. HDBSCAN sobre el espacio de embeddings) dentro de cada `contextCell`. Cada clúster resultante:

```json
{
  "clusterId":         "string",
  "contextCell":        "object — taxonomía cerrada, con fallback jerárquico igual que cognitiveWeights",
  "centroidEmbedding":  "number[] — el vector que efectivamente se indexa en ChromaDB, colección 'nucleus-evidence'",
  "representativeConceptTags": ["string — los conceptTags más frecuentes del clúster"],
  "aggregatedNarrative": "string — SÍNTESIS generada por el agregador sobre el conjunto del clúster, nunca copia de un narrativeDigest individual",
  "sampleSize":          "number — Nucleus distintos que contribuyeron al clúster, sujeto a I-16",
  "dominantOutcome":     "enum — 'success' | 'failure' | 'mixed'"
}
```

Solo `centroidEmbedding` es consultable. Ningún vector individual de Nivel 1 sale de la memoria de trabajo del agregador una vez que contribuyó a un centroide — se descarta tras el cierre del epoch, salvo el `merkleRoot` de `inputCommitment` para auditoría de procedencia (ver Universal/Package Spec, patrón ya establecido).

### 2.2 Flujo de búsqueda del comprador

```
Nucleus comprador busca: "problemas de concurrencia"
  │
  ├─→ 1. Embeber la query con el mismo modelo que 'nucleus-evidence'
  ├─→ 2. Query contra colección 'nucleus-evidence' → top-K clusterId
  ├─→ 3. Filtrar por contextCell compatible con el entorno local
  │      (fallback jerárquico si no hay match a nivel específico)
  ├─→ 4. Retornar, por cada cluster: representativeConceptTags,
  │      aggregatedNarrative, sampleSize, dominantOutcome
  └─→ 5. NUNCA retornar decisionId/failureId individuales ni
         narrativeDigest de un solo registro — el comprador ve
         el consenso del clúster, no la contribución de un
         Nucleus específico (mismo principio de I-16 aplicado
         a búsqueda semántica, no solo a estadística numérica)
```

No busca "archivos" porque nunca hubo archivos en la cadena — busca contra la matriz de decisiones y trade-offs condensados de la población, exactamente como pediste, con la salvedad técnica de que lo hace contra centroides de clúster, no contra registros crudos, por la razón de privacidad de 2.1.

---

## 3. Síntesis estadística y `globalConfidence`

### 3.1 Componentes

`globalConfidence` no es un número inventado por conveniencia de UI — se define como combinación explícita de cuatro factores medibles, cada uno auditable por separado:

```
globalConfidence(cluster | edge | cell) =

  IF sampleSize < kAnonymityThreshold:
      → RETORNA null  (estado "evidencia insuficiente", nunca un
        número bajo que se confunda con "medido pero malo")

  ELSE:
      clamp(0, 1,
          w1 · normalizedSampleSize(sampleSize, kThreshold)
        + w2 · (1 − normalizedVariance(successRate entre sub-celdas))
        + w3 · recencyFactor(epochAge, recommendedRefreshAfterDays)
        − w4 · privacyBudgetPenalty(remainingEpsilonBudget)
        − w5 · pathDependencyPenalty(si failureGraph edge marcado
               'pathDependencyDetected' por I-20)
      )
```

Con pesos `w1..w5` versionados en `evidenceTaxonomy.json` (no hardcodeados por Mandate individual, para que `globalConfidence` sea comparable entre Mandates distintos del mismo marketplace).

### 3.2 Reglas de exposición (cierre de I-22)

```json
"confidenceReport": {
  "globalConfidence":     "number | null",
  "sampleSize":            "number",
  "epochAsOf":             "number",
  "insufficientEvidence":  "boolean — true si globalConfidence es null",
  "pathDependencyFlag":    "boolean — hereda de I-20 si aplica al elemento consultado"
}
```

Regla dura: el Conductor **no puede renderizar** una recomendación derivada de `cognitive_evidence` o del `failureGraph` sin este objeto adjunto en el mismo componente visual. Si `insufficientEvidence == true`, el Conductor debe mostrar el contenido del clúster (si existe) etiquetado explícitamente como no accionable estadísticamente — visible como contexto, no como recomendación con peso.

### 3.3 Consumo por el motor Bloom local — extensión de la secuencia ya definida

Esto formaliza el paso 6 del flujo de consumo local descrito en la discusión previa: la fusión bayesiana entre evidencia poblacional y evidencia local del propio proyecto ahora tiene una regla de corte explícita, no implícita:

```
SI globalConfidence(elemento) == null:
    → el motor local NO reordena ni sustituye ninguna acción de
      operational.actions[] en base a este elemento.
    → el elemento puede mostrarse como referencia narrativa
      (aggregatedNarrative) en el Conductor, sin afectar ejecución.

SI globalConfidence(elemento) != null:
    → el motor pondera este prior contra evidencia LOCAL directa
      (mandate_state.json del propio proyecto) si existe.
    → si hay evidencia local directa para el mismo actionId en
      este proyecto: evidencia local pesa más que el prior
      poblacional para ESTA ejecución puntual.
    → si no hay evidencia local: se usa el prior poblacional,
      siempre mostrando globalConfidence junto a la decisión
      tomada, nunca de forma silenciosa.
```

---

## 4. Qué NO entra en `cognitive_evidence` — límite explícito

| Artefacto | Razón de exclusión |
|---|---|
| Código fuente, diffs, o fragmentos de archivos | Prohibido por diseño. Ningún campo de este schema acepta contenido de archivo. |
| `originIntentId`, `projectId`, `organizationId` en cualquier nivel | Eliminados por el Evidence Linter (I-14) antes de salir del Nucleus emisor. |
| Texto crudo del intent original (razonamiento sin parafrasear) | Prohibido. Solo `narrativeDigest` post-linter, generado, nunca copiado. |
| Nombres de librerías propietarias o internas, versiones exactas | Solo `conceptTag` de vocabulario público controlado. |
| Duraciones exactas, cifras de magnitud cruda, timestamps precisos del comprador | Reemplazadas por buckets/enums en todos los campos sensibles a escala. |
| Vectores de embedding individuales por registro | Nunca indexados ni expuestos fuera del agregador — solo centroides de clúster (§2.1). |

---

## 5. Pendientes abiertos

| # | Pendiente | Bloqueante para |
|---|---|---|
| P-1 | Definir el algoritmo de clustering exacto (HDBSCAN vs. alternativas) y sus hiperparámetros por defecto en `evidenceTaxonomy.json` | Cierre de §2.1 |
| P-2 | Mecanismo de gobierno de `evidenceTaxonomy.json` — quién propone nuevas categorías cerradas (`decisionCategory`, `rootCause.category`, etc.) sin fragmentar el vocabulario entre versiones | Escalabilidad del linter (I-14) a dominios nuevos |
| P-3 | Definir el proceso de auditoría externa del Evidence Linter mismo — quién verifica que la paráfrasis obligatoria realmente elimina información identificable y no solo la reformula de forma reconocible | Cierre real de I-14, no solo declarativo |
| P-4 | Umbral y fórmula exacta de `pathDependencyPenalty` (w5) — actualmente cualitativo, requiere validación empírica contra datos reales antes de fijar peso numérico | Cierre de §3.1 |
| P-5 | Confirmar si `aggregatedNarrative` de un clúster requiere su propio paso de linting (síntesis generada por el agregador, no por el Nucleus emisor) antes de publicarse, dado que agrega contenido de múltiples fuentes ya linteadas individualmente | Cierre de §2.1 |

---

*Fin del documento — v1.0.0 — Esqueleto fundacional. Extiende el bloque `federatedCognition` del Universal Schema como contenido de `epoch_N.json`.*
