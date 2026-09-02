# Cierre de Boundary — Gravity / GravityGraph / Semantics / Provenance (v0.1)

**Tipo:** Cierre de arquitectura conceptual, reabierto y ampliado el 2026-09-02. Fija nomenclatura y alcance (invariante), no diseño físico ejecutable ni ontología general de Provenance.
**Fecha:** 2026-09-01
**Criterio de cierre aplicado:** ratificar ahora solo lo que sería costoso romper después (nomenclatura, alcance de qué representa cada término); diferir todo lo que pueda incorporarse más adelante sin alterar esas invariantes (ontología de Provenance, rol de Alfred/Sensor, tipos de arista nuevos).

---

## 0. Ambigüedad puntual investigada — resultado

**Pregunta:** ¿la promoción de criterio debe recorrer obligatoriamente `SESSION → MANDATE → PROJECT → ORGANIZATION`, o puede saltar niveles cuando la autoridad del destino lo permite?

**Resultado de la investigación (no de diseño):** el corpus no lo resuelve. `PARENT_OF` está confirmado como "estructural, entre niveles consecutivos" (`Implementation Spec` §1.4), pero ninguna regla ata `PROMOTED_FROM.toNodeId` a esa adyacencia. El único ejemplo de dato concreto que existe (`fromNodeId: mnd_8f2a1c` → `toNodeId: org_root`) salta `PROJECT` sin marcarse como excepción. El flujo conceptual de §22 usa lenguaje permisivo ("puede") en cada etapa, no imperativo.

**Queda fijado como decisión pendiente, explícita, sin resolver aquí.** No afecta el boundary que sigue: el mecanismo de `PROMOTED_FROM` es el mismo exista o no, a futuro, una regla de validación sobre `toNodeId`. Esa regla, si se agrega, sería aditiva — no requeriría alterar nada de lo que se fija en este documento.

---

## 1. Boundary ratificado — invariante desde este documento en adelante

| Término | Alcance fijado | Qué incluye | Qué NO incluye |
|---|---|---|---|
| **Gravity** | El sistema de gobernanza del criterio, en su totalidad | Lenguaje declarativo, resolución activa por turno, arbitraje, masa, promoción, `cor`, autoridad de firma por nivel — y cualquier plano futuro que gobierne criterio (Semantics, Provenance, lo que Trazabilidad Viva termine formalizando) | No es una estructura de datos — es el sistema. Nunca debe usarse como sinónimo de una persistencia concreta |
| **`GravityGraph`** (Grafo de Gravedad) | La estructura persistida que representa y preserva **Criterion + estructura gobernada + Provenance ratificada** | `GravityNode`/`gravityPostures[]` (Criterion); nodos estructurales `DOMAIN` y `GENE` sin Postures; proyecciones gobernadas de sus relaciones canónicas; la arista `PROMOTED_FROM` y sus denormalizaciones `promotedFrom`/`promotedTo` | Contenido semántico canónico de Domain/Gene; relaciones probabilísticas; cualquier tipo de arista de Provenance todavía no ratificado (`SUPPORTS`, `CONTRADICTS`, `EVIDENCES`, `CONFIRMS`, etc.) |
| **Semantics** | Plano probabilístico, separado por diseño | BISP/ChromaDB — descubre relaciones posibles, nunca las certifica | Nunca se funde con `GravityGraph` ni se usa como sustituto de procedencia factual — axioma ya adoptado en la revisión anterior |
| **Provenance** | Exigencia factual futura, sin estructura propia general todavía | **Excepción explícita: los precedentes ya ratificados quedan dentro de `GravityGraph`** (ver fila anterior) — no como una capa aparte pendiente, sino como la porción de Provenance que Gravity ya resolvió sin saberlo, antes de que el concepto tuviera nombre | La ontología completa (Criterion/Semantics/Provenance de la revisión anterior), Alfred, Sensor, cualquier tipo de arista nuevo — todo eso sigue sin diseñarse, tal como se pidió |

**Consecuencia directa de esta tabla, dicha sin rodeos:** desde la reapertura del 2026-09-02, `GravityGraph` es **"Criterion + estructura gobernada + la porción de Provenance que ya está ratificada"**. La incorporación de estructura gobernada sí es una ampliación deliberada: reconoce que Domain y Gene son entidades de primer orden para las decisiones cognitivas y operacionales basadas en un Mandate. No funde Semantics con GravityGraph: incorpora identidades y relaciones estructurales gobernadas, nunca una copia del contenido semántico.

---

## 2. Aclaración explícita sobre el log de arbitraje — para no repetir el error de "el grafo"

`.edges/arbitration_events.log.jsonl` vive físicamente dentro de `.gravity/` (mismo directorio que el árbol de `node.json`), pero **queda fuera del boundary semántico de `GravityGraph` tal como se fija en este documento.** Razón: un `ArbitrationEvent` no es linaje de una postura — es, en el mejor de los casos, evidencia que *podría* motivar la creación de una nueva postura (`Implementation Spec` §3.5: *"eso es evidencia [...] de que una `gravityPosture` de `priority` debería postularse"*), pero esa motivación nunca queda registrada como arista formal hacia la postura que eventualmente se cree. Es, en el vocabulario ya fijado, un **precedente candidato a Provenance, no un precedente ratificado** — la misma categoría que `SUPPORTS`/`EVIDENCES`, sin el nivel de diseño que sí tiene `PROMOTED_FROM`.

Esto se deja dicho explícitamente para que nadie, en una conversación futura, asuma que "ya está incluido" solo porque comparte carpeta.

---

## 3. Por qué este cierre no bloquea incorporar Trazabilidad Viva después

`PROMOTED_FROM` ya demuestra el patrón que cualquier futura arista de Provenance debería seguir: es una **arista independiente del nodo** (`Implementation Spec` §1.4: *"registra que una regla [...] se originó [...]"* como relación externa, no como campo interno obligatorio), con una denormalización de solo lectura hacia el nodo para performance (`promotedFrom`/`promotedTo`), sin que eso haya requerido tocar el layout físico ya cerrado más que agregando un campo opcional.

Eso significa que agregar `SUPPORTS`, `EVIDENCES`, `CONFIRMS` u otras aristas de Provenance más adelante **no exige romper ninguna invariante fijada en este documento** — se agregarían con la misma forma (arista + denormalización opcional), sin que `Gravity`, `GravityGraph` ni el boundary de esta tabla necesiten redefinirse. El boundary está cerrado de manera que crece por extensión, no por reescritura.

---

## 4. Gaps documentados en esta sesión — ninguno resuelto, todos con evidencia

| Gap | Estado | Evidencia |
|---|---|---|
| Staging obligatorio vs. salto de niveles en promoción | **Pendiente, sin corpus suficiente** | `Implementation Spec` §1.5 (ejemplo salta `PROJECT`) vs. `Fundamentos` §22 (flujo conceptual en etapas, lenguaje permisivo) |
| Shape exacto de `promotedTo` poblado | **Pendiente — nunca aparece con ejemplo no-null en el corpus** | Contraste con `promotedFrom`, que sí tiene shape completo con ejemplo (`Persistencia` §5.3) |
| Quién puede iniciar/proponer una promoción | **Pendiente** | `Fundamentos` §30 solo confirma que la UI debe permitirlo, no quién específicamente |
| Si el `expression` promovido debe ser idéntico al de origen o puede reformularse | **Pendiente — sin evidencia en ningún sentido** | Ausencia total en el corpus |
| Relación entre `RequireMaster()` (stub) y el gate `cor` que autoriza promoción hacia `ORGANIZATION`/`NUCLEUS` | **Inferido con fuerza, no confirmado textualmente** | `cor` es "el único camino" hacia esos niveles (`Implementation Spec` §1.3); que `cor` dependa exactamente de `RequireMaster()` es la lectura más consistente con el resto del corpus, pero ningún documento lo dice en esas palabras exactas |

---

## 5. Nota de continuidad (agregada 2026-09-01, sesión de Génesis Control)

Los cinco gaps de §4 fueron revisados contra el código real de `internal/gravity/` en la sesión de
continuidad que siguió a este cierre — ninguno bloquea el próximo incremento del GravityGraph. En
particular, el gap de `RequireMaster()`/`cor` (última fila) dejó de ser inferencia: `store.go` declara
textualmente, en su propio mensaje de error, que la creación de `ORGANIZATION`/`NUCLEUS` está a la espera
de "cor + Authorization module" — ninguno de los dos implementado todavía, rechazo intencional. El detalle
completo de esa reconciliación (qué está implementado, qué depende de qué, y el próximo paso concreto)
queda en el tablero de seguimiento de Gravity/Orbital/Posture, no se repite acá para no duplicar la fuente
de verdad de este documento, que sigue siendo el cierre de boundary en sí.

---

## 6. Reapertura ratificada — `DOMAIN` y `GENE` como estructura gobernada (2026-09-02)

La exclusión de Domain y Gene del boundary anterior deja sin representación gobernada dos entidades que
inciden directamente en cómo un Mandate organiza e interpreta código. Se reabre por ello el cierre de §1
con estas invariantes:

1. `DOMAIN` y `GENE` son tipos de nodo de primer orden del `GravityGraph`, pero son **nodos estructurales
   sin Postures**. `gravityPostures[]` debe permanecer vacío y no se usa para autorización, precedencia,
   promoción ni Masa.
2. Un nodo `DOMAIN` pertenece a una instancia Nucleus organizacional concreta. Su `parentId` referencia
   el `nodeId` de ese `NUCLEUS` y nunca es `null`. “Nucleus-wide” significa dentro de
   `.bloom/.nucleus-{organization}/`, no entre organizaciones distintas.
3. Un nodo `GENE` depende estructuralmente del nodo `MANDATE` que corresponde al `mandate_id` de su
   `gen.json` canónico.
4. Estos nodos no se insertan en el spine de Postures. `ResolveActive`, precedencia y Masa continúan
   operando únicamente sobre los niveles portadores de Criterion.
5. `.mandates/{mandateId}/.genes/{geneId}/gen.json` conserva la autoridad sobre identidad y contenido del
   Gene; `.cache/.semantic-index.json` conserva la autoridad sobre Domain y la relación N:M Domain↔Gene.
6. Toda relación alojada bajo `.gravity/` que refleje esos artefactos es una **proyección gobernada,
   auditable, idempotente y reconstruible**. Nunca compite con las fuentes canónicas: ante discrepancia,
   gana la fuente canónica y la proyección debe reconciliarse.
7. Si `dis/` retira un Domain activo por merge o split, Gravity preserva su identidad histórica mediante
   supersesión y deja inactivas sus proyecciones relacionales; los dominios resultantes usan IDs nuevos o
   el `target_domain_id` ratificado por `dis/`, sin reutilizar IDs retirados.

Esta ratificación es contractual. No habilita por sí sola tipos ejecutables, `Store.CreateNode`, Activities,
materializadores ni cambios de comportamiento productivo; todos requieren un diseño de implementación y
una autorización posterior.

---

*Fin del cierre v0.1 reabierto. Boundary fijado como invariante: Gravity (sistema) / GravityGraph (Criterion + estructura gobernada de `DOMAIN`/`GENE` + Provenance ratificada, incluyendo `PROMOTED_FROM`, excluyendo el log de arbitraje) / Semantics (probabilístico y canónico en sus propios artefactos) / Provenance (factual, sin estructura general salvo lo ratificado). Esta reapertura no implementa schema ni runtime.*
