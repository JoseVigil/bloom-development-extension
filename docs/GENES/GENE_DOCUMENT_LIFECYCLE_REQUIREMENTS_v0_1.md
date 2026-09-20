# Gene ↔ Document Lifecycle — Requerimientos v0.1

**Estado:** documento de requerimientos, listo para implementación en una sesión posterior
**Versión:** 0.1
**Fecha:** 2026-09-20
**Autoridad conceptual:** `COGNITUUM_GENE_CONCEPT_v3_0.md`
**Autoridad física de referencia:** `COGNITUUM_GENE_CANONICAL_PERSISTENCE_MATERIALIZATION_CONTRACT_v0_1.md` (G1)
**Evidencia de gaps actuales:** `GENE_DOC_INVESTIGATION_FINDINGS` (rupturas 1–6, ver §7 de este documento)
**Alcance:** especifica *qué* debe quedar garantizado y *cómo se verifica* que la garantía se cumple. No decide implementación física concreta salvo cuando una decisión es indispensable para que la garantía sea expresable.
**No autoriza:** ningún cambio de código. Este documento es el contrato de entrada para la sesión de implementación.

---

## 1. Propiedad a garantizar

### 1.1 Enunciado canónico

> **GENE KNOWLEDGE CONSISTENCY INVARIANT** — Ningún cambio material sobre un Gene, implique o no un cambio de función declarada, puede alcanzar estado `CURRENT` sin que el sistema haya determinado gobernadamente si su conocimiento constitutivo continúa siendo válido y haya producido evidencia verificable de esa determinación. Si dejó de ser válido, la nueva Revision no puede alcanzar `CURRENT` hasta que el activo `document` correspondiente haya atravesado el lifecycle requerido de producción, provenance, verificación, ratificación y materialización.

### 1.2 Lo que la invariante exige, explícitamente

- Tanto **`document remains valid`** como **`document updated`** son resultados. Ninguno de los dos puede ser un default silencioso ni una ausencia de acción.
- La determinación es un acto gobernado: produce evidencia persistente, verificable independientemente del reporte propio de quien la ejecuta.
- La invariante no exige que todo cambio de código dispare una reescritura de documentación. Exige que todo cambio material dispare una **decisión evaluada** sobre si la documentación sigue siendo cierta, y que esa decisión quede registrada con la misma disciplina que el resto del lifecycle de Gene.
- La ausencia de determinación es, por definición, un estado que bloquea `CURRENT`. No existe un camino donde "nadie decidió" sea equivalente a "sigue siendo válido".

### 1.3 Alcance del término "cambio material"

Un **cambio material** sobre un Gene es toda Gene Contribution cuya materialización (observación post-merge, v3.0 §5.3) altera al menos un activo constitutivo de tipo `file` o `test` respecto de la Revision base — cambie o no la función declarada.

Una Contribution cuyo único activo alterado es `document` **no** constituye por sí misma un nuevo cambio material a efectos de esta invariante: es, precisamente, la respuesta gobernada a una determinación. Esta exclusión es necesaria para evitar una regresión infinita (una actualización de documentación no puede volver a disparar la obligación de evaluar si la documentación sigue siendo válida).

---

## 2. Dónde se inserta la invariante en el lifecycle existente

El lifecycle documental normativo de v3.0 §5 es:

```text
PROPOSED → RATIFIED IDENTITY → MATERIALIZED REVISION → VERIFIED REVISION → CANONICAL COMMIT → CURRENT → SUPERSEDED
```

La invariante introduce un requisito nuevo dentro de **VERIFIED REVISION** (v3.0 §5.4), como condición adicional — no sustitutiva — de lo que esa etapa ya exige (activos ausentes, digests divergentes, referencias no resolubles, conflicto de revisión base):

```text
VERIFIED REVISION
├── activos resueltos y digests coinciden              (ya exigido por v3.0 §5.4)
├── referencias resolubles                              (ya exigido por v3.0 §5.4)
├── base_revision_id vigente                            (ya exigido por v3.0 §5.4)
└── Knowledge Determination resuelta                    ← REQUISITO NUEVO
        ├── outcome = document_remains_valid  → evidencia adjunta, avanza
        └── outcome = document_requires_update → bloqueado hasta que el
                                                    document Contribution asociado
                                                    complete su propio lifecycle
                                                    (producción → provenance →
                                                     verificación → ratificación →
                                                     materialización)
```

**Consecuencia directa:** una Revision puede estar completamente verificada en todo lo que v3.0 §5.4 ya exigía y, aun así, no poder avanzar a `CANONICAL COMMIT`/`CURRENT` si la Knowledge Determination no está resuelta. Esto exige que el sistema sea capaz de representar un estado intermedio — una Revision materializada y verificada en todo excepto en la determinación de conocimiento — sin que eso invalide la evidencia ya producida (código ya mergeado, tests ya corridos) ni permita que esa Revision se presente como vigente.

*(La forma física de ese estado intermedio — un nuevo estado de lifecycle, un flag sobre `VERIFIED REVISION`, o un objeto separado que bloquea únicamente el paso a `CANONICAL COMMIT` — queda como decisión abierta explícita para la sesión de implementación; ver §9.)*

---

## 3. Vocabulario nuevo requerido

Este vocabulario es necesario para que la invariante sea expresable con la misma precisión que el resto de v3.0. No prescribe schema físico; define semántica contractual.

### 3.1 Knowledge Determination

Decisión gobernada, tomada durante la verificación de una Revision derivada de un cambio material, con exactamente dos outcomes posibles:

- `document_remains_valid` — el conocimiento constitutivo vigente sigue describiendo correctamente la función del Gene tras el cambio material.
- `document_requires_update` — el conocimiento constitutivo vigente ya no describe correctamente la función del Gene; se requiere una actualización del activo `document` antes de que la Revision pueda alcanzar `CURRENT`.

Una Knowledge Determination debe declarar, como mínimo:

- Gene y Revision evaluados (identidad y digest);
- outcome (uno de los dos valores anteriores, sin estados intermedios ni "no evaluado" como valor válido una vez resuelta);
- actor o proceso gobernado responsable de la determinación, con evidencia de su autoridad para tomarla (humano, o mecanismo automatizado sujeto a auditoría — ver §3.3);
- razón o evidencia mínima que sustenta el outcome;
- referencia al activo `document` evaluado, cuando exista uno vigente.

### 3.2 Knowledge Determination Evidence

Registro persistente e inmutable de una Knowledge Determination, resoluble independientemente del reporte propio de la Contribution que la originó — de la misma manera que una Gene Revision es verificable sin depender de que la Contribution que la propuso "diga la verdad" sobre sí misma. Debe poder auditarse en cualquier momento posterior sin re-derivar la determinación desde el historial de Git o desde texto libre.

### 3.3 Determinación automatizada vs. humana

Esta invariante no exige que toda Knowledge Determination sea tomada por un humano. Exige que, sea cual sea el mecanismo (humano, asistido por IA, o completamente automatizado), el resultado sea:

- trazable a un actor o proceso responsable identificable;
- gobernado — es decir, sujeto a las mismas reglas de autoridad y auditabilidad que ya rigen una ratificación de Contribution (v3.0 §5.2; G1 §11.2);
- nunca un default silencioso ni una ausencia de registro interpretada como "válido".

La decisión de si la determinación inicial requiere obligatoriamente un humano, o puede automatizarse con auditoría posterior, queda explícitamente fuera de este documento — es una decisión de política de gobierno, no de esta invariante. Este documento solo exige que, cualquiera sea la política elegida, produzca evidencia verificable con los campos mínimos de §3.1.

---

## 4. Requisitos contractuales mínimos

Candidatos a incorporarse como invariantes adicionales de `COGNITUUM_GENE_CONCEPT_v3_0.md` tras ratificación. Numerados en continuación de las 15 invariantes existentes (v3.0 §4).

**16.** Una Gene Revision derivada de un cambio material (§1.3) no puede alcanzar `CURRENT` sin una Knowledge Determination resuelta y su Knowledge Determination Evidence correspondiente.

**17.** Una Knowledge Determination con outcome `document_requires_update` bloquea la promoción a `CURRENT` de la Revision evaluada hasta que exista una Gene Contribution de tipo `document`, para ese mismo Gene, que haya completado su propio lifecycle (producción, provenance, verificación, ratificación, materialización) con la misma disciplina que v3.0 exige para cualquier Contribution.

**18.** Una Knowledge Determination con outcome `document_remains_valid` no requiere una nueva Gene Contribution de tipo `document`, pero sí requiere que su Knowledge Determination Evidence quede persistida y sea resoluble junto con la Revision que promovió.

**19.** Una Gene Contribution cuyo único activo alterado es `document` no constituye, por sí misma, un cambio material a efectos de la invariante 16 (evita regresión infinita — ver §1.3).

**20.** El primer commit canónico de un Gene (Genesis, v3.0 §5.5, sin Domain) debe producir también una Knowledge Determination resuelta. La ausencia de conocimiento previo contra el cual comparar no exime de la determinación: en Genesis, el outcome por defecto verificable es `document_remains_valid` únicamente si existe evidencia explícita de que el primer activo `document` fue evaluado como consistente con la función declarada — nunca por omisión.

**21.** La similitud semántica, la ejecución exitosa de tests, o la existencia previa de contenido documental no constituyen, por sí solas, evidencia de una Knowledge Determination resuelta. (Extiende el principio ya establecido en v3.0 invariante 11 y en G1 §11.2, que rechaza `human_decision` genérico, tests exitosos o existencia previa de contenido como evidencia de ratificación, al caso específico de esta invariante.)

---

## 5. Requisitos físicos mínimos

Formulados como **capacidades que el sistema debe tener**, no como diseño de implementación. Cada uno es indispensable para que la invariante sea verificable; ninguno prescribe qué componente concreto lo resuelve.

**F1 — Capacidad de bloqueo de promoción.** El sistema debe poder impedir que una Revision materializada y verificada en todo lo demás alcance `CANONICAL COMMIT`/`CURRENT` mientras su Knowledge Determination no esté resuelta. Esta capacidad es indispensable: sin ella, la invariante no puede cumplirse bajo ninguna implementación.

**F2 — Capacidad de registrar una determinación gobernada.** El sistema debe poder producir y persistir un registro de Knowledge Determination con los campos mínimos de §3.1, de forma content-addressed o equivalente en verificabilidad, independiente de la Contribution que la originó. Indispensable.

**F3 — Capacidad de producir y gobernar un activo `document`.** El sistema debe tener, para al menos un canal, la capacidad de llevar una Gene Contribution de tipo `document` a través de producción, provenance, verificación, ratificación y materialización, con paridad de disciplina respecto de `file`/`test`. Indispensable como capacidad; **no** se prescribe aquí si ese canal es `doc/` reparado, un intent nuevo, o un mecanismo distinto — es decisión de implementación.

**F4 — Capacidad de ejecución end-to-end (caller productivo).** El sistema debe tener un caller real que lleve una Contribution ratificada, junto con su Knowledge Determination, hasta Revision `CURRENT`, incluyendo el caso `document_requires_update`. G1 §11.1 ya documenta que este caller no existe hoy para ningún tipo de activo — esta invariante no crea esa ausencia, la hereda, y exige que su resolución (alcance de G2) contemple el nuevo gate de determinación desde el diseño, no como añadido posterior.

**F5 — Capacidad de determinación en Genesis.** El punto donde nace un Gene (hoy, la obligación declarada `knowledge_baseline_materialized` en el effect ledger de `ing`, confirmada pero no materializada) debe poder producir una Knowledge Determination resuelta como parte de su primer commit canónico, no como paso separado y opcional.

**F6 — Capacidad de auditoría independiente.** Debe ser posible, para cualquier Gene y cualquier punto de su historia (`CURRENT` o `SUPERSEDED`), reconstruir: si existió una Knowledge Determination, su outcome, su evidencia, y — cuando el outcome fue `document_requires_update` — la Contribution de tipo `document` que la resolvió. Esta capacidad es la que permite verificar que la invariante se cumple (ver §6).

---

## 6. Verificación — cómo se comprueba que la garantía se cumple

La invariante no está satisfecha por declaración; debe ser auditable. Criterios de verificación:

**V1.** Para toda Gene Revision en estado `CURRENT`, debe existir exactamente una Knowledge Determination Evidence resoluble, con outcome explícito.

**V2.** No debe existir ninguna Gene Revision en estado `CURRENT` cuya Knowledge Determination esté ausente, sea ambigua, o cuyo outcome no pueda distinguirse de "no evaluado".

**V3.** Para toda Knowledge Determination con outcome `document_requires_update`, debe existir una Gene Contribution de tipo `document`, para el mismo Gene, ratificada y materializada, cuya evidencia de ratificación sea resoluble de forma independiente (mismos criterios mínimos que G1 §11.2: actor verificable, autoridad y scope efectivos, outcome exacto `RATIFIED`, cadena de provenance completa).

**V4.** Debe ser posible, mediante una auditoría automatizable (no manual, no dependiente de inspección de código fuente), producir para cualquier Project la lista de Genes cuya última Revision `CURRENT` carece de Knowledge Determination Evidence resoluble — esa lista debe estar vacía en un sistema que cumple la invariante.

**V5.** El primer commit canónico de todo Gene (Genesis) debe poder auditarse con el mismo criterio V1–V2, sin excepción por tratarse de creación en vez de modificación.

Estos cinco criterios son la definición de aceptación de esta invariante. Una implementación que no pueda responder afirmativamente a V1–V5 no satisface el requerimiento, independientemente de qué mecanismo interno use.

---

## 7. Relación con las rupturas 1–6 (evidencia de gap actual, no diseño obligatorio)

Las rupturas encontradas en la investigación previa se usan aquí exclusivamente como **evidencia de que ninguno de los requisitos F1–F6 está satisfecho hoy** — no como lista de reparaciones a ejecutar. La sesión de implementación puede resolver cada capacidad por un camino distinto al que hoy está roto.

| Ruptura (evidencia) | Requisito físico que hoy no puede cumplirse por esta causa | ¿Reparación específica obligatoria? |
|---|---|---|
| 1 — No hay disparador `dev/`→`doc/` | F1 (nada evalúa si corresponde una determinación) | No — cualquier mecanismo de disparo es válido, no necesariamente el hook `dev/`→`doc/` |
| 2 — `doc/` nunca genera `.docbase*.json` | F3 (no hay contenido documental distinguible que evaluar) | No — `.docbase` es un candidato de implementación, no un requisito de esta invariante |
| 3 — pipeline de `doc/` no reconoce sus propias fases | F3, F4 (el canal documental no puede completar su propio lifecycle) | No — reparar `submit_intent()`/`_detect_latest_stage()` es un camino posible, no el único |
| 4 — `doc/` no cristaliza a Mandate / no ratifica | F2, F3 (no hay Contribution de tipo `document` gobernada) | Parcialmente — **la capacidad de ratificar `document` con paridad de disciplina sí es indispensable** (F3); el mecanismo concreto no lo es |
| 5 — no existe caller productivo (G1 §11.1, admitido en el propio contrato) | F4 (no hay ejecución end-to-end para ningún tipo de activo) | No — la cadena `RatificationEnvelope → ... → mark-effect-applied` es un diseño candidato ya esbozado en G1, no mandatorio en su forma exacta |
| 6 — `knowledge_baseline_materialized` declarado pero no materializado (`mandate_state_integration: not_wired`) | F5 (Genesis no produce determinación resuelta) | No — wirear ese punto exacto es un camino posible; el requisito es que *algún* punto de Genesis produzca la determinación |

---

## 8. Fuera de alcance explícito

- **DomainRevision** y cualquier extensión de Domain para portar explicación/provenance propia. Sigue congelada como hipótesis crítica pendiente de otra investigación (Q2 del research original).
- **Orrery**, Location, GravityGraph, Alfred, ASM, Postulates y cualquier consumidor posterior de conocimiento resuelto. Esta invariante gobierna la fuente canónica; no gobierna cómo se navega o se presenta.
- **`StructuralFinding`** (el mecanismo por el cual DOC reportaría una inconsistencia estructural a DIS sin corregirla). Permanece como contrato pendiente: no hay evidencia primaria suficiente en el corpus disponible (solo referencia indirecta vía un resumen del research, no el texto primario). No se especifica aquí; no debe inferirse ni implementarse a partir de este documento.
- **Mandates productivos reales, Authority real, RatificationEnvelope físico.** Este documento asume, igual que G1, que esas piezas siguen siendo alcance de G2. No las redefine.
- **Symbols, fragments, relaciones Gene–Gene, ontología completa de activos.** Sin cambios respecto de v3.0 §3.

---

## 9. Decisiones explícitamente abiertas para la sesión de implementación

Este documento fija la propiedad y los criterios de verificación, no la forma física. Quedan deliberadamente sin resolver:

- Si el estado intermedio descrito en §2 (Revision verificada salvo determinación) es un estado de lifecycle nuevo, un flag, o un objeto separado que bloquea únicamente `CANONICAL COMMIT`.
- Qué canal físico produce Contributions de tipo `document` (reparar `doc/`, un intent nuevo, u otro mecanismo) — F3 exige la capacidad, no el canal.
- Si la Knowledge Determination inicial es siempre humana, siempre automatizada con auditoría, o mixta según política del Project — §3.3 deja esto abierto deliberadamente.
- Cómo se comporta el sistema mientras una Revision está bloqueada por `document_requires_update` — en particular, qué ocurre con el código ya mergeado que produjo esa Revision mientras no es `CURRENT` (¿queda visible como pendiente?, ¿bloquea nuevas Contributions sobre el mismo Gene?). Este documento no resuelve esa pregunta operativa; solo exige que la Revision no se presente como vigente mientras tanto (invariante 16).
- Retroactividad: si Genes ya `CURRENT` sin Knowledge Determination previa requieren backfill, y con qué outcome por defecto — no decidido aquí.
- Forma física exacta de la Knowledge Determination Evidence (objeto propio content-addressed, campo embebido en el canonical commit, u otro) — la única exigencia es que cumpla F2 y V1–V5.

---

## 10. Fase obligatoria previa a la implementación

La sesión que reciba este documento **no está autorizada a modificar código ni contratos físicos directamente**. Antes de tocar nada, debe completar una fase de diseño y justificación, con salida propia, verificable contra el código real:

1. **Diseño físico de F1–F6.** Para cada capacidad de §5, proponer una solución concreta, contrastada contra el código real (no contra la documentación de este corpus, que ya se demostró desactualizada respecto del código en varios puntos — ver rupturas 1–6). El diseño debe indicar explícitamente qué archivo, componente o mecanismo implementa cada capacidad.
2. **Resolución de las decisiones abiertas de §9.** Cada punto de §9 debe cerrarse con una decisión explícita y su justificación — no puede quedar implícito en el código propuesto.
3. **Demostración de no regresión sobre G1 y v3.0.** Para cada invariante existente de `COGNITUUM_GENE_CONCEPT_v3_0.md` (§4, invariantes 1–15) y para cada garantía del protocolo de publicación de G1 (§6–§7: atomicidad, CAS, recovery, idempotencia, canonical JSON, boundary Project/Repository), el diseño debe mostrar explícitamente que el mecanismo propuesto para F1–F6 no la debilita ni la vuelve inconsistente. Una afirmación genérica de "no debería romper nada" no es evidencia suficiente — se exige el mismo nivel de trazabilidad que G1 exige de sus propios fallos mínimos (§8 de G1).
4. **Entregable de esta fase.** Un documento de diseño físico (`GENE_DOCUMENT_LIFECYCLE_PHYSICAL_DESIGN_v0_1.md` o equivalente) que cubra los puntos 1–3, clasificando cada afirmación sobre el código actual con la misma disciplina `DOCUMENTED / CODE-CLAIMED / PROPOSED ONLY / evidencia no disponible` usada en la investigación previa.

**Solo después de que ese entregable exista y sea aprobado** queda autorizada la implementación. Este documento (`GENE_DOCUMENT_LIFECYCLE_REQUIREMENTS_v0_1.md`) fija la propiedad y los criterios de aceptación; no autoriza, por sí solo, empezar a escribir código.

---

## 11. Definition of Done de este documento

Este documento se considera suficientemente cerrado cuando la sesión de implementación puede, sin reinterpretar el research previo ni volver a decidir cuál es la propiedad buscada:

1. tomar la invariante de §1.1 como dato de entrada fijo;
2. completar la fase obligatoria de §10 antes de modificar nada;
3. diseñar la forma física del estado intermedio de §2 sobre las opciones abiertas en §9, como parte de esa fase;
4. implementar F1–F6 por el camino que elija y haya justificado en §10, sin obligación de reparar las rupturas 1–6 en su forma original;
5. validar su implementación contra V1–V5 como criterios de aceptación obligatorios de la GENE KNOWLEDGE CONSISTENCY INVARIANT, sin degradar las invariantes preexistentes de Gene v3.0 ni las garantías de persistencia, atomicidad, provenance, autoridad y recovery establecidas por G1.
