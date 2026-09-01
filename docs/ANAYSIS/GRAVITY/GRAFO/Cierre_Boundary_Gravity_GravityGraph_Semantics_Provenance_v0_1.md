# Cierre de Boundary — Gravity / GravityGraph / Semantics / Provenance (v0.1)

**Tipo:** Cierre de arquitectura conceptual. Fija nomenclatura y alcance (invariante), no diseño físico ni ontología de Provenance.
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
| **`GravityGraph`** (Grafo de Gravedad) | La estructura persistida que representa y preserva **Criterion** y su **linaje ya ratificado** | `GravityNode`/`gravityPostures[]` (Criterion); la arista `PROMOTED_FROM` y sus denormalizaciones `promotedFrom`/`promotedTo` — porque son, hoy, el único precedente de procedencia que ya tiene diseño cerrado y ejemplos concretos | Cualquier tipo de arista de Provenance todavía no ratificado (`SUPPORTS`, `CONTRADICTS`, `EVIDENCES`, `CONFIRMS`, etc.) — esos no son parte de `GravityGraph` hasta que alguien los ratifique con el mismo nivel de detalle que tiene `PROMOTED_FROM` |
| **Semantics** | Plano probabilístico, separado por diseño | BISP/ChromaDB — descubre relaciones posibles, nunca las certifica | Nunca se funde con `GravityGraph` ni se usa como sustituto de procedencia factual — axioma ya adoptado en la revisión anterior |
| **Provenance** | Exigencia factual futura, sin estructura propia general todavía | **Excepción explícita: los precedentes ya ratificados quedan dentro de `GravityGraph`** (ver fila anterior) — no como una capa aparte pendiente, sino como la porción de Provenance que Gravity ya resolvió sin saberlo, antes de que el concepto tuviera nombre | La ontología completa (Criterion/Semantics/Provenance de la revisión anterior), Alfred, Sensor, cualquier tipo de arista nuevo — todo eso sigue sin diseñarse, tal como se pidió |

**Consecuencia directa de esta tabla, dicha sin rodeos:** `GravityGraph` deja de ser "solo Criterion" y pasa a ser, con precisión, **"Criterion + la porción de Provenance que ya está ratificada"**. No es una ampliación de alcance nueva — es reconocer que la promoción, que ya existía, siempre fue un caso de Provenance sin que nadie lo hubiera nombrado así hasta esta serie de conversaciones.

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

*Fin del cierre v0.1. Boundary fijado como invariante: Gravity (sistema) / GravityGraph (Criterion + linaje ratificado, incluyendo `PROMOTED_FROM`, excluyendo el log de arbitraje) / Semantics (probabilístico, separado) / Provenance (factual, sin estructura propia salvo lo ya ratificado). No se diseñó ontología de Provenance, ni el rol de Alfred/Sensor, ni nuevos tipos de arista — quedan disponibles para incorporarse después sin romper nada de lo fijado acá.*
