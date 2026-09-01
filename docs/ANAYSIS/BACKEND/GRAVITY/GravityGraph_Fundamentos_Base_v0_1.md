# GravityGraph — Fundamentos de Boundary (documento base v0.1)

**Tipo:** Documento base — formaliza como conocimiento de base de este cowork el cierre de boundary que Jose compartió, para que las investigaciones de frontera que dependen de él (empezando por `Mandate_Server_Compatibilidad_Gravity_Introduccion_v0_1.md`, mismo directorio) no tengan que releer ni reinterpretar la fuente cada vez.
**Estado:** v0.1 — adopción formal, sin contenido nuevo propio.
**Fecha:** 2026-09-01
**Fuente única:** `Cierre_Boundary_Gravity_GravityGraph_Semantics_Provenance_v0_1.md` (`docs/ANAYSIS/GRAVITY/GRAFO/`, cierre del 2026-09-01). Ese documento sigue siendo la fuente de verdad para cualquier revisión futura de este cierre — este documento base no lo reemplaza, lo trae formalizado a la carpeta de análisis de este cowork con el mismo nivel de detalle.
**Criterio de cierre citado en el original:** ratificar solo lo que sería costoso romper después (nomenclatura, alcance de qué representa cada término); diferir todo lo que pueda incorporarse más adelante sin alterar esas invariantes (ontología de Provenance, rol de Alfred/Sensor, tipos de arista nuevos).

> **Nota de terminología en tránsito (2026-09-01):** hay un work específico disparado en Codex para renombrar integralmente `GravityRule` → `GravityPosture` (cambio transversal de nomenclatura, no funcional, con impacto potencial en contratos de backend, Backgate, persistencia y APIs). Jose comunicará el alcance exacto cuando esté validado, y la incorporación se coordinará en cada work/cowork correspondiente. Este documento sigue usando `GravityRule`/`gravityRules[]` — la nomenclatura vigente al cierre citado — hasta esa coordinación; no se adelanta el rename.

---

## 1. Boundary ratificado — invariante desde este cierre en adelante

| Término | Alcance fijado | Qué incluye | Qué NO incluye |
|---|---|---|---|
| **Gravity** | El sistema de gobernanza del criterio, en su totalidad | Lenguaje declarativo, resolución activa por turno, arbitraje, masa, promoción, `cor`, autoridad de firma por nivel — y cualquier plano futuro que gobierne criterio (Semantics, Provenance, lo que Trazabilidad Viva termine formalizando) | No es una estructura de datos — es el sistema. Nunca debe usarse como sinónimo de una persistencia concreta |
| **`GravityGraph`** (Grafo de Gravedad) | La estructura persistida que representa y preserva **Criterion** y su **linaje ya ratificado** | `GravityNode`/`gravityRules[]` (Criterion); la arista `PROMOTED_FROM` y sus denormalizaciones `promotedFrom`/`promotedTo` — porque son, hoy, el único precedente de procedencia que ya tiene diseño cerrado y ejemplos concretos | Cualquier tipo de arista de Provenance todavía no ratificado (`SUPPORTS`, `CONTRADICTS`, `EVIDENCES`, `CONFIRMS`, etc.) — esos no son parte de `GravityGraph` hasta que alguien los ratifique con el mismo nivel de detalle que tiene `PROMOTED_FROM` |
| **Semantics** | Plano probabilístico, separado por diseño | BISP/ChromaDB — descubre relaciones posibles, nunca las certifica | Nunca se funde con `GravityGraph` ni se usa como sustituto de procedencia factual — axioma ya adoptado en la revisión anterior |
| **Provenance** | Exigencia factual futura, sin estructura propia general todavía | **Excepción explícita: los precedentes ya ratificados quedan dentro de `GravityGraph`** (ver fila anterior) — no como una capa aparte pendiente, sino como la porción de Provenance que Gravity ya resolvió sin saberlo, antes de que el concepto tuviera nombre | La ontología completa (Criterion/Semantics/Provenance de la revisión anterior), Alfred, Sensor, cualquier tipo de arista nuevo — todo eso sigue sin diseñarse |

**Consecuencia directa, dicha sin rodeos:** `GravityGraph` deja de ser "solo Criterion" y pasa a ser, con precisión, **"Criterion + la porción de Provenance que ya está ratificada"**. No es una ampliación de alcance nueva — es reconocer que la promoción, que ya existía, siempre fue un caso de Provenance sin que nadie lo hubiera nombrado así hasta esta serie de conversaciones.

## 2. El log de arbitraje queda explícitamente fuera de `GravityGraph`

`.edges/arbitration_events.log.jsonl` vive físicamente dentro de `.gravity/` (mismo directorio que el árbol de `node.json`), pero **queda fuera del boundary semántico de `GravityGraph`**. Un `ArbitrationEvent` no es linaje de una postura — es, en el mejor de los casos, evidencia que *podría* motivar la creación de una nueva postura, pero esa motivación nunca queda registrada como arista formal hacia la postura que eventualmente se cree. Es un **precedente candidato a Provenance, no un precedente ratificado** — misma categoría que `SUPPORTS`/`EVIDENCES`, sin el nivel de diseño que sí tiene `PROMOTED_FROM`. Compartir carpeta física no implica pertenecer al mismo boundary semántico.

## 3. Por qué este cierre no bloquea incorporar Trazabilidad Viva después

`PROMOTED_FROM` ya demuestra el patrón que cualquier futura arista de Provenance debería seguir: es una **arista independiente del nodo**, con una denormalización de solo lectura hacia el nodo para performance (`promotedFrom`/`promotedTo`), sin que eso haya requerido tocar el layout físico ya cerrado más que agregando un campo opcional. Agregar `SUPPORTS`, `EVIDENCES`, `CONFIRMS` u otras aristas de Provenance más adelante **no exige romper ninguna invariante fijada acá** — se agregarían con la misma forma (arista + denormalización opcional). El boundary está cerrado de manera que crece por extensión, no por reescritura.

## 4. Gaps documentados — ninguno resuelto, todos con evidencia

| Gap | Estado | Evidencia |
|---|---|---|
| Staging obligatorio vs. salto de niveles en promoción (¿`SESSION → MANDATE → PROJECT → ORGANIZATION` es obligatorio, o puede saltar niveles?) | Pendiente, sin corpus suficiente | `Implementation Spec` §1.5 (ejemplo salta `PROJECT`) vs. `Fundamentos` §22 (flujo conceptual en etapas, lenguaje permisivo) |
| Shape exacto de `promotedTo` poblado | Pendiente — nunca aparece con ejemplo no-null en el corpus | Contraste con `promotedFrom`, que sí tiene shape completo con ejemplo (`Persistencia` §5.3) |
| Quién puede iniciar/proponer una promoción | Pendiente | `Fundamentos` §30 solo confirma que la UI debe permitirlo, no quién específicamente |
| Si el `expression` promovido debe ser idéntico al de origen o puede reformularse | Pendiente — sin evidencia en ningún sentido | Ausencia total en el corpus |
| Relación entre `RequireMaster()` (stub) y el gate `cor` que autoriza promoción hacia `ORGANIZATION`/`NUCLEUS` | Confirmado en la nota de continuidad (§5 del original) — ya no es inferencia | `store.go` declara textualmente, en su propio mensaje de error, que la creación de `ORGANIZATION`/`NUCLEUS` espera "cor + Authorization module", ninguno de los dos implementado — rechazo intencional |

Ninguno de estos cinco gaps bloquea el próximo incremento del `GravityGraph`, según la nota de continuidad del original (sesión de Génesis Control, 2026-09-01). El detalle completo de esa reconciliación contra código real queda en el tablero de seguimiento de Gravity/Orbital/Posture — no se duplica acá.

## 5. Por qué este cowork lo necesita como base

El trabajo de frontera abierto en `Mandate_Server_Compatibilidad_Gravity_Introduccion_v0_1.md` depende directamente de la fila 2 de la tabla del §1: si lo que un Mandate transporta para comparación cross-organizacional no puede ser el `GravityGraph` completo (porque `GravityGraph` es, por diseño, local y preserva linaje que no tiene sentido fuera de su Nucleus de origen), entonces la "representación mínima de Gravity" que ese documento deja como primera pregunta abierta tiene que construirse a partir de **Criterion puro** (`GravityNode`/`gravityRules[]`), no de Criterion+linaje. Este documento base es lo que permite afirmar eso con precisión, en vez de por intuición.

---

*Documento base v0.1. No agrega diseño nuevo — formaliza, para consulta directa de este cowork, el cierre de boundary ya ratificado en `docs/ANAYSIS/GRAVITY/GRAFO/Cierre_Boundary_Gravity_GravityGraph_Semantics_Provenance_v0_1.md`. Cualquier actualización de ese cierre debe reflejarse primero en el original y después, si corresponde, acá.*
