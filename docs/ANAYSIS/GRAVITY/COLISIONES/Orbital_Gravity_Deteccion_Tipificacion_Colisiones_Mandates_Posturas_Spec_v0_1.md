# Orbital · Gravity — Detección y Tipificación de Colisiones entre Mandates y Posturas

## Especificación de investigación v0.1 — cierre conceptual previo a cualquier implementación de Eje 4

**Tipo:** Investigación y especificación. Cero código de producción.
**Estado:** Borrador v0.1 para revisión de control; no autoriza implementación.
**Fecha:** 2026-09-01
**Dominio:** Orbital · Gravity · Nucleus · Mandates · Posturas

### Fuentes y abreviaturas

| Abreviatura | Fuente |
|---|---|
| **Fundamentos** | `docs/ANAYSIS/GRAVITY/MODELS/Orbital___Fundamentos_de_Coordinacion_Gravity_e_Interaccion_Gobernada.md` |
| **Impl** | `docs/ORBITAL/GRAVITY/Orbital_Gravity_Implementation_Spec_v0_1.md` |
| **Persistencia** | `docs/ANAYSIS/GRAVITY/GRAFO/Orbital_Gravity_Persistencia_Grafo_Implementation_Spec_v0_1.md` |
| **Boundary** | `docs/ANAYSIS/GRAVITY/GRAFO/Cierre_Boundary_Gravity_GravityGraph_Semantics_Provenance_v0_1.md` |
| **Grammar** | `docs/ANAYSIS/GRAVITY/GRAMMAR/Orbital_Gravity_Expression_Grammar_Parser_Spec_v0_1.md` |
| **Compatibilidad** | `docs/ANAYSIS/BACKEND/GRAVITY/Investigacion_Gravity_Mandate_Compatibility_v0_1.md` |
| **Mandate v1.2.0** | `docs/MANDATE/BLOOM_Mandate_Universal_Schema_v1_2_0.md` |
| **Código Gravity** | `installer/nucleus/internal/gravity/` |

Cada afirmación sustantiva se marca según su fuente:

- **[C] Código:** comportamiento verificable en la implementación actual.
- **[D] Documentación:** contrato, decisión o deuda expresamente documentada.
- **[I] Inferencia:** conclusión propuesta por este cowork a partir de evidencia anterior; no se presenta como decisión ya ratificada.

Las citas usan `ruta:línea` contra el estado del repositorio leído el 2026-09-01. Cuando una fuente histórica fue desplazada por código o por un cierre posterior, se conserva como evidencia de intención, no como descripción del estado real.

---

## 0. Resumen ejecutivo

1. **[D] El corpus sí contiene un caso de colisión, pero no una teoría general de colisiones.** **Impl** define solamente la superposición de territorio entre Mandates activos no relacionados por ancestría directa: `intent_draft.target ∩ scope_paths ≠ ∅` (`docs/ORBITAL/GRAVITY/Orbital_Gravity_Implementation_Spec_v0_1.md:162-174`). No define cuándo dos contenidos de `gravityRules[]` son semánticamente incompatibles.
2. **[D] El documento posterior de persistencia no ratifica un detector.** Reserva `arbitration_events.log.jsonl`, pero excluye expresamente tanto el mecanismo de arbitraje como la detección y tipificación de colisiones (`docs/ANAYSIS/GRAVITY/GRAFO/Orbital_Gravity_Persistencia_Grafo_Implementation_Spec_v0_1.md:101-123`, `:365-371`).
3. **[C] El modelo implementado permite leer posturas, pero no alcanza para detectar colisiones territoriales.** `GravityNode` contiene `nodeId`, tipo, padre, `gravityRules[]`, estado, firma y `nodeVersion`; no contiene `scope_paths`, targets de acciones ni ciclo de vida operacional de un Mandate (`installer/nucleus/internal/gravity/model.go:49-72`).
4. **[C] `nodeVersion` no es una colisión semántica.** `CompareAndSwap` serializa escritores y rechaza una versión esperada obsoleta sobre el mismo nodo (`installer/nucleus/internal/gravity/store.go:91-129`). Ese conflicto de escritura es un mecanismo de consistencia, no evidencia de incompatibilidad entre Mandates o posturas.
5. **[C] La gramática y el parser ya ofrecen estructura aprovechable, pero no un evaluador ni un detector.** El AST distingue `PriorityNode.collisionClass` y `EscalationNode.triggerClass` (`installer/nucleus/internal/gravity/expression_ast.go:44-59`); el contrato `GravityEvaluator` no tiene implementación y excluye expresamente el consumo de arbitraje (`installer/nucleus/internal/gravity/expression_ast.go:73-94`).
6. **[I] Eje 4 necesita distinguir tres familias, no colapsarlas bajo una palabra:** colisión territorial entre Mandates, contradicción jerárquica entre posturas y colisión horizontal entre posturas independientes. Cada familia tiene datos, momento de detección y consecuencia distintos.
7. **[I] La detección debe tener dos fases:** seleccionar candidatos mediante hechos estructurados y confirmar solo aquello que pueda demostrarse con esos hechos. La semejanza semántica puede descubrir candidatos, pero no certificar una colisión: **Boundary** mantiene Semantics como plano probabilístico separado (`docs/ANAYSIS/GRAVITY/GRAFO/Cierre_Boundary_Gravity_GravityGraph_Semantics_Provenance_v0_1.md:21-28`).
8. **[I] Un hallazgo confirmado puede alimentar un `ArbitrationEvent`, pero no entra por ello en `GravityGraph`.** **Boundary** fija que el log de arbitraje queda fuera de su boundary semántico y es evidencia candidata a Provenance, no linaje ratificado (`docs/ANAYSIS/GRAVITY/GRAFO/Cierre_Boundary_Gravity_GravityGraph_Semantics_Provenance_v0_1.md:32-44`).

**Resultado de cierre:** hay base suficiente para especificar categorías y contrato de detección, pero no para implementar todavía un detector completo. Permanecen sin ratificar el catálogo controlado de categorías, el origen operacional de Mandates activos y sus territorios, la semántica comparativa de posturas cualitativas, y el boundary exacto entre detección confirmada y arbitraje. Este documento los deja visibles; no los resuelve por omisión.

---

## 1. Qué dicen realmente los dos documentos de nombre parecido

### 1.1 `docs/ORBITAL/.../Orbital_Gravity_Implementation_Spec_v0_1.md`

- **[D]** Declara que aborda el mecanismo de resolución de conflictos dejado abierto por **Fundamentos** (`docs/ORBITAL/GRAVITY/Orbital_Gravity_Implementation_Spec_v0_1.md:14-18`).
- **[D]** Su caso de activación es concreto: dos Mandates activos con territorio superpuesto, medido contra `scope_paths` y el `target` de un `intent_draft` (`:162-174`).
- **[D]** Fija Nucleus como árbitro único, prohíbe la negociación entre pares y declara que el arbitraje no reescribe `gravityRules[]` ya firmadas (`:176-188`).
- **[D]** Propone un orden de resolución y un shape de `ArbitrationEvent` (`:190-214`). Ese contenido pertenece al bosquejo histórico de arbitraje y queda fuera del diseño de este cowork.
- **[D]** Conecta la recurrencia de eventos con evidencia para postular una postura `priority` (`:216-218`).

### 1.2 `docs/ANAYSIS/.../Orbital_Gravity_Persistencia_Grafo_Implementation_Spec_v0_1.md`

- **[D]** Este documento posterior toma el modelo de nodos y el algoritmo de resolución como dato de entrada, pero limita su propio alcance a persistencia, recorrido, separación de artefactos, masa y firma (`docs/ANAYSIS/GRAVITY/GRAFO/Orbital_Gravity_Persistencia_Grafo_Implementation_Spec_v0_1.md:18-34`).
- **[D]** Reserva físicamente `.edges/arbitration_events.log.jsonl` y califica su mecanismo como fuera de alcance (`:101-123`).
- **[D]** Excluye textualmente “el mecanismo de arbitraje”, “la detección y tipificación de colisiones” y, en ese momento histórico, la gramática de `expression` (`:365-371`).

### 1.3 Reconciliación

**[I]** No son dos especificaciones equivalentes ni una contradicción binaria donde una deba descartarse completa. **Impl** aporta un precedente de intención para una sola clase de colisión —territorio de ejecución— y un esqueleto de arbitraje. **Persistencia** decide no convertir ese bosquejo en mecanismo implementable y solo preserva el espacio físico del evento. Por tanto:

- el solapamiento territorial es un **caso documentado**, no una taxonomía cerrada;
- el shape histórico de `ArbitrationEvent` es un **antecedente**, no prueba de que exista un productor;
- la ausencia de detector en **Persistencia** es deliberada;
- ninguna de las dos fuentes define comparación semántica general entre dos posturas.

Esta lectura coincide con **Compatibilidad**, que distingue expresamente el arbitraje territorial de la comparación de contenido entre posturas de origen independiente (`docs/ANAYSIS/BACKEND/GRAVITY/Investigacion_Gravity_Mandate_Compatibility_v0_1.md:29-39`).

---

## 2. Definición conceptual: qué cuenta como colisión

### 2.1 Definición mínima común

**[I] Una colisión Gravity es una incompatibilidad relevante y situada entre dos o más sujetos gobernados que no pueden satisfacerse conjuntamente en el mismo contexto aplicable sin una decisión autorizada, una excepción explícita o una separación demostrable de territorio, tiempo o alcance.**

La definición exige cinco elementos:

1. **Sujetos identificables:** Mandates, posturas, o ambos.
2. **Contexto compartido:** territorio, intent type, métrica, clase de evento, recurso o alcance sobre el que coinciden.
3. **Aplicabilidad simultánea:** no basta con que dos posturas existan; deben estar activas y ser aplicables al mismo caso.
4. **Incompatibilidad demostrable:** debe existir un hecho estructurado que impida satisfacer ambas, o una determinación autorizada cuando el criterio no sea mecánicamente decidible.
5. **Consecuencia de gobernanza:** la coexistencia exige impedir, elevar, exceptuar, secuenciar o arbitrar. Este documento identifica el handoff, no diseña esa decisión.

**[D]** La necesidad de scope, herencia, precedencia, autoridad, override, exception y conflict ya aparece como fundamento semántico, aunque su sintaxis no estuviera fijada entonces (`docs/ANAYSIS/GRAVITY/MODELS/Orbital___Fundamentos_de_Coordinacion_Gravity_e_Interaccion_Gobernada.md:454-488`).

### 2.2 Lo que no alcanza para declarar una colisión

- **[I] Coincidencia de `appliesTo`.** Solo reduce el conjunto candidato. Dos posturas aplicables a `dev` pueden ser complementarias.
- **[I] Similitud de lenguaje.** Dos textos parecidos pueden reforzarse; dos textos distintos pueden contradecirse. La similitud probabilística nunca es prueba factual.
- **[I] Diferencia de masa.** Masa explica peso; no decide compatibilidad. **Compatibilidad** registra que el corpus descarta elegir “el más importante” sin postura explícita o humano (`docs/ANAYSIS/BACKEND/GRAVITY/Investigacion_Gravity_Mandate_Compatibility_v0_1.md:70-75`).
- **[C] Conflicto de `nodeVersion`.** Es versión de escritura obsoleta sobre un nodo, no colisión de criterio (`installer/nucleus/internal/gravity/store.go:91-129`).
- **[I] Error de parseo.** Una postura inválida individualmente falla su contrato de expresión; todavía no existe un par de sujetos compatibles o incompatibles que comparar.
- **[I] Una `exception` válida.** La excepción explícita y autorizada es el mecanismo que evita tratar una desviación permitida como contradicción encubierta.

---

## 3. Taxonomía propuesta

Las claves en mayúsculas son **[I] identificadores propuestos para discusión**, no enums ratificados ni nombres autorizados para código.

### 3.1 `MANDATE_TERRITORY_OVERLAP` — superposición territorial operacional

**Sujetos:** dos o más Mandates activos.

**Hecho de colisión:** el target de una acción propuesta intersecta el territorio reservado por otro Mandate activo no relacionado por ancestría directa.

**Evidencia existente:** **Impl** formula precisamente `intent_draft.target ∩ scope_paths ≠ ∅` y lo extiende más allá de Mandates hermanos (`docs/ORBITAL/GRAVITY/Orbital_Gravity_Implementation_Spec_v0_1.md:162-174`) **[D]**.

**Datos necesarios:** identidad y estado activo de cada Mandate; relación de ancestría; `scope_paths`; target normalizado de la acción; semántica de intersección por tipo de target **[I]**.

**Boundary:** no es una comparación de `gravityRules[]`. Es coordinación operacional entre unidades de trabajo. Una postura `priority` puede orientar el arbitraje posterior, pero no crea la superposición **[I]**.

### 3.2 `POSTURE_HIERARCHICAL_CONTRADICTION` — contradicción vertical de autoridad

**Sujetos:** una postura de nivel inferior y una postura heredada o aplicable de nivel superior.

**Hecho de colisión:** la postura inferior contradice, relaja o introduce una excepción no declarada contra la superior, dentro del mismo contexto aplicable.

**Evidencia existente:** R-18 prohíbe contradicción, relajación y excepción encubierta; R-19 admite una `exception` explícita, nombrada y referida a un `ruleId` heredado (`docs/MANDATE/BLOOM_Mandate_Universal_Schema_v1_2_0.md:72-76`) **[D]**. **Impl** generaliza la no-contradicción a fronteras consecutivas de la jerarquía (`docs/ORBITAL/GRAVITY/Orbital_Gravity_Implementation_Spec_v0_1.md:69-85`) **[D]**.

**Momento natural de detección:** antes de firmar o persistir la postura inferior, no durante arbitraje horizontal entre Mandates ya activos **[I]**.

**Consecuencia conceptual:** es normalmente un rechazo de validez o una solicitud de excepción autorizada, no necesariamente un `ArbitrationEvent` **[I]**.

### 3.3 `POSTURE_HORIZONTAL_INCOMPATIBILITY` — incompatibilidad entre posturas independientes

**Sujetos:** posturas activas de nodos que no forman una relación vertical de herencia suficiente para que R-18 decida el caso.

**Hecho de colisión:** ambas son aplicables al mismo contexto y sus obligaciones, límites u órdenes no pueden satisfacerse conjuntamente.

**Evidencia existente:** el corpus reconoce que comparar conjuntos de posturas de origen independiente no tiene algoritmo (`docs/ANAYSIS/BACKEND/GRAVITY/Investigacion_Gravity_Mandate_Compatibility_v0_1.md:29-39`, `:96-107`) **[D]**.

**Subtipos propuestos:**

| Subtipo propuesto | Confirmación mecánica posible | Ejemplo abstracto |
|---|---|---|
| `THRESHOLD_UNSATISFIABLE` | Sí, si métrica, unidad, comparadores y dominio son compatibles | una postura exige `x <= 5` y otra `x >= 10` para el mismo caso |
| `PRIORITY_CYCLE` | Sí, construyendo el orden dirigido de prioridades aplicables | `A > B`, `B > C`, `C > A` |
| `ESCALATION_TARGET_DIVERGENCE` | Detectable estructuralmente; que sea incompatible requiere política ratificada | el mismo trigger exige elevar a autoridades distintas |
| `QUALITATIVE_CRITERION_CONFLICT` | No por parser solamente | dos constraints cualitativas resultan incompatibles bajo el mismo caso |

Los subtipos no deben tratarse como equivalentes:

- `THRESHOLD_UNSATISFIABLE` y `PRIORITY_CYCLE` pueden producir prueba determinista si sus operandos están normalizados **[I]**.
- `ESCALATION_TARGET_DIVERGENCE` es primero una anomalía candidata: dos elevaciones pueden ser acumulativas o secuenciales; falta una política que diga cuándo son excluyentes **[I]**.
- `QUALITATIVE_CRITERION_CONFLICT` no puede deducirse del AST por sí solo. El parser preserva el criterio natural, y `constraint`, `evidence` y `exception` no son predicados computables (`installer/nucleus/internal/gravity/expression_ast.go:5-20`, `:39-42`, `:61-71`) **[C]**.

### 3.4 `POSTURE_INTERNAL_PRECEDENCE_CONFLICT` — incoherencia dentro del conjunto de precedencia

**Sujetos:** dos o más expresiones `priority`, incluso dentro del mismo nodo.

**Hecho de colisión:** el cierre transitivo de las relaciones `higher → lower` contiene un ciclo o dos órdenes mutuamente inversos para la misma clase de colisión.

**Estado real:** el parser rechaza solo la autoprioridad dentro de un par (`X over X`) y construye pares; no compara una expresión con otras (`installer/nucleus/internal/gravity/expression_parser.go:94-112`) **[C]**. La prueba de ciclo, por tanto, pertenece al futuro evaluador/detector, no al parser **[I]**.

**Boundary:** es una invalidez o incoherencia del criterio de precedencia antes de consumirlo para arbitrar. No es aún el conflicto territorial que esa precedencia pretendía resolver **[I]**.

---

## 4. Modelo de detección: candidato no equivale a colisión confirmada

### 4.1 Fase A — selección estructural de candidatos

**[I]** La primera fase reduce comparaciones sin emitir todavía un veredicto. Debe usar únicamente claves observables:

- sujetos activos;
- intersección de `appliesTo`;
- posición relativa en la jerarquía;
- mismo target o territorio normalizado;
- misma métrica y unidad para thresholds;
- misma `collisionClass` para priorities;
- mismo `triggerClass` para escalations;
- referencias `exceptionOf`;
- ventana temporal de coexistencia cuando aplique.

El parser actual ya deriva `collisionClass` y `triggerClass` (`installer/nucleus/internal/gravity/expression_ast.go:49-59`) **[C]**, pero **Grammar** deja libre el vocabulario de categoría, métrica y nivel de escalamiento (`docs/ANAYSIS/GRAVITY/GRAMMAR/Orbital_Gravity_Expression_Grammar_Parser_Spec_v0_1.md:471-481`) **[D]**. Por eso una coincidencia de strings puede seleccionar candidatos, pero la equivalencia entre alias todavía no está definida **[I]**.

### 4.2 Fase B — confirmación

**[I]** Cada candidato debe terminar en uno de tres estados conceptuales:

| Estado | Significado | Puede disparar handoff a arbitraje |
|---|---|---|
| `NO_COLLISION` | coexistencia demostrablemente satisfacible o scopes disjuntos | No |
| `CONFIRMED_COLLISION` | incompatibilidad probada con hechos estructurados o ratificada por autoridad competente | Sí, si la clase corresponde a arbitraje |
| `UNDECIDABLE_CANDIDATE` | hay solapamiento relevante, pero el sistema no puede demostrar compatibilidad ni incompatibilidad | No automáticamente; requiere decisión autorizada |

Reglas de seguridad propuestas:

1. **[I] No elevar incertidumbre a hecho.** Un modelo semántico puede producir `UNDECIDABLE_CANDIDATE`, nunca `CONFIRMED_COLLISION` por similitud solamente.
2. **[I] No ocultar incertidumbre como compatibilidad.** Que el predicado no sea computable tampoco autoriza `NO_COLLISION`.
3. **[I] Adjuntar prueba mínima.** Todo veredicto confirmado debe nombrar sujetos, contexto compartido, predicados o hechos comparados y razón determinista o autoridad que confirmó.
4. **[I] Mantener separado parseo de evaluación.** `Parse(expression)` produce AST (`installer/nucleus/internal/gravity/expression_parser.go:31-45`) **[C]**; no decide relaciones entre ASTs.

### 4.3 Qué podría confirmarse mecánicamente con el modelo actual

- **Territorio:** solo si otro subsistema entrega Mandates activos, ancestry, scopes y target normalizados. Esos datos no están en `GravityNode` **[C]/[I]**.
- **Thresholds:** comparación matemática básica cuando coinciden métrica, unidad, dominio y contexto; la fuente de métricas sigue fuera de contrato del evaluador (`docs/ANAYSIS/GRAVITY/GRAMMAR/Orbital_Gravity_Expression_Grammar_Parser_Spec_v0_1.md:471-477`) **[D]**.
- **Priority:** detección de ciclos sobre pares estructurados y una `collisionClass` común **[C]/[I]**.
- **Escalation:** detección de targets diferentes; incompatibilidad no confirmable sin política de composición **[I]**.
- **Constraint/evidence/exception cualitativas:** no confirmables mecánicamente solo con el AST **[C]/[I]**.

---

## 5. Conexión con el modelo real implementado

### 5.1 Qué aporta hoy `GravityGraph`

- **[C]** Identidad, tipo, padre y estado de cada `GravityNode` (`installer/nucleus/internal/gravity/model.go:63-72`).
- **[C]** Posturas con primitivo, expresión, aplicabilidad, estado, origen, verificabilidad y promoción (`installer/nucleus/internal/gravity/model.go:46-61`).
- **[C]** Recorrido activo por la espina desde Nucleus hasta Session, filtrado por `status` y `appliesTo` (`installer/nucleus/internal/gravity/resolver.go:24-64`).
- **[C]** Lectura fresca de nodos; la caché conserva solo la espina (`installer/nucleus/internal/gravity/resolver.go:28-50`).
- **[C]** Cálculo de masa desde datos ya cargados (`installer/nucleus/internal/gravity/masa.go:3-18`).

Esto alcanza para construir el conjunto de posturas candidatas aplicables a un turno, pero no para decidir por sí mismo si dos de ellas colisionan **[I]**.

### 5.2 Qué no aporta `GravityGraph`

- `scope_paths` o reservas territoriales;
- estado operacional completo del Mandate (`running`, `paused`, terminado, etc.);
- target normalizado de la acción propuesta;
- índice de Mandates activos ajenos a la espina actual;
- evaluador de dos o más ASTs;
- catálogo canónico de `collisionClass`/`triggerClass`;
- productor o consumidor de `ArbitrationEvent`.

Los primeros cuatro datos pertenecen a coordinación operacional de Mandates, no al boundary de Criterion + linaje ratificado de `GravityGraph` **[I]**. Incorporarlos como campos de `GravityNode` solo para facilitar el detector mezclaría dominios sin evidencia que lo autorice **[I]**.

### 5.3 Por qué `nodeVersion` queda explícitamente fuera

**[D]** **Persistencia** acota `nodeVersion` a concurrencia segura de escritura, no invalidación de lectura (`docs/ANAYSIS/GRAVITY/GRAFO/Orbital_Gravity_Persistencia_Grafo_Implementation_Spec_v0_1.md:175-191`).

**[C]** El código implementa exactamente esa decisión: obtiene lock, relee el nodo, compara `expected` con `NodeVersion`, muta y aumenta la versión si hubo cambio (`installer/nucleus/internal/gravity/store.go:91-129`).

**[I]** Por lo tanto, `ErrVersionConflict` debe conservarse como nombre técnico de consistencia aunque comparta la palabra “conflict”; no entra en la taxonomía Gravity de este documento y nunca debe generar `ArbitrationEvent`.

---

## 6. Handoff hacia `ArbitrationEvent`, sin diseñar el arbitraje

### 6.1 Boundary obligatorio

**[D]** `ArbitrationEvent` vive físicamente dentro de `.gravity/`, pero **Boundary** lo excluye semánticamente de `GravityGraph`: no es linaje de una postura y solo puede ser evidencia candidata a Provenance (`docs/ANAYSIS/GRAVITY/GRAFO/Cierre_Boundary_Gravity_GravityGraph_Semantics_Provenance_v0_1.md:32-44`).

**[I]** La detección no debe crear aristas `CONTRADICTS`, `EVIDENCES` ni equivalentes dentro de `GravityGraph`. Esos tipos permanecen no ratificados por **Boundary** (`:21-28`). Tampoco debe denormalizar una colisión dentro de `gravityRules[]` como si fuera linaje.

### 6.2 Qué debe entregar la detección

Sin fijar nombres de campos ni un DTO implementable, **[I]** el handoff mínimo necesita representar:

- categoría y subtipo de colisión;
- estado `CONFIRMED_COLLISION` y método de confirmación;
- Mandates involucrados;
- nodos y `ruleId` involucrados cuando la colisión sea de posturas;
- contexto compartido (`scope`, intent type, métrica, clase o trigger);
- evidencia estructurada que demuestra la incompatibilidad;
- instante de detección;
- autoridad que confirmó, cuando la confirmación no fue mecánica.

Esto extiende conceptualmente la parte de entrada del `ArbitrationEvent` histórico, cuyo shape solo nombra `conflictScope` e `involvedMandateIds` porque fue diseñado para paths (`docs/ORBITAL/GRAVITY/Orbital_Gravity_Implementation_Spec_v0_1.md:198-214`) **[D]/[I]**. Este documento no ratifica el shape ampliado: identifica la información que una futura especificación de contrato necesitará cerrar.

### 6.3 Qué no decide este documento

- cuándo el detector se invoca dentro del workflow;
- si todo `CONFIRMED_COLLISION` dispara arbitraje o algunas clases se rechazan antes de persistir;
- quién pausa, continúa, rechaza o notifica;
- el orden `priority → escalation → default`;
- autoridad común, timeouts, reintentos o idempotencia;
- mecanismo push/poll de notificación;
- lifecycle o schema final de `ArbitrationEvent`;
- relación factual posterior entre un evento y una postura postulada a partir de él.

Todos esos puntos pertenecen al mecanismo de arbitraje o a Provenance futura y permanecen fuera del alcance autorizado.

---

## 7. Flujo conceptual de detección

```text
hecho operativo o conjunto de posturas aplicables
                    │
                    ▼
        normalizar sujetos y contexto
                    │
                    ▼
      seleccionar pares/grupos candidatos
                    │
                    ▼
     ¿hay prueba estructurada suficiente?
           │                    │
          no                   sí
           │                    │
           ▼                    ▼
 UNDECIDABLE_CANDIDATE   evaluar satisfacibilidad,
  (sin arbitraje auto.)   precedencia o territorio
                                │
                      ┌─────────┴─────────┐
                      ▼                   ▼
                 NO_COLLISION     CONFIRMED_COLLISION
                                          │
                                          ▼
                              handoff al boundary de
                              arbitraje, si corresponde
```

**[I]** El flujo no define una trayectoria de resolución. Solo evita tres errores: comparar todo contra todo, confundir candidato con hecho y persistir una inferencia probabilística como linaje ratificado.

---

## 8. Matriz de verdad consolidada

| Hallazgo | Estado | Evidencia |
|---|---|---|
| Existe un precedente de colisión territorial entre Mandates | **[D] Confirmado** | **Impl** `:162-174` |
| Existe taxonomía ratificada de colisiones | **[D] No existe** | **Persistencia** `:365-371`; **Grammar** `:477-481` |
| Existe detector de colisiones en `internal/gravity` | **[C] No existe** | `model.go`, `resolver.go`, `expression_ast.go:90-94`; ausencia de consumidor/evaluador concreto |
| `GravityGraph` contiene `scope_paths` | **[C] Falso** | `model.go:63-72` |
| `ResolveActive` compara posturas entre sí | **[C] Falso** | `resolver.go:51-64` solo filtra y colecta |
| `nodeVersion` detecta colisión semántica | **[C/D] Falso** | `store.go:91-129`; **Persistencia** `:185-191` |
| El parser expone claves candidatas para arbitraje | **[C] Confirmado** | `expression_ast.go:44-59` |
| El parser implementa evaluación o arbitraje | **[C] Falso** | `expression_ast.go:90-94` |
| R-18/R-19 cubren contradicción vertical y excepción explícita | **[D] Confirmado** | **Mandate v1.2.0** `:72-76` |
| R-18/R-19 resuelven compatibilidad horizontal cross-origen | **[D] Falso** | **Compatibilidad** `:19-39` |
| Masa puede desempatar automáticamente | **[D] Rechazado por el corpus** | **Compatibilidad** `:70-75` |
| `ArbitrationEvent` pertenece a `GravityGraph` | **[D] Falso** | **Boundary** `:32-44` |
| Semantics puede certificar una colisión factual | **[D/I] Falso** | **Boundary** `:21-28`; inferencia de aplicación a este caso |
| Comparar posturas cualitativas tiene algoritmo ratificado | **[D/C] No** | **Compatibilidad** `:29-39`; `expression_ast.go:90-94` |

---

## 9. Gaps abiertos y condición de avance

### 9.1 Gaps que bloquean una implementación completa de Eje 4

| ID propuesto | Gap | Por qué bloquea | Evidencia |
|---|---|---|---|
| `COLLISION-CATALOG-01` | Catálogo canónico de categorías, alias y versión | `collisionClass`/`triggerClass` aceptan `IDENT` libre; comparar strings no resuelve equivalencia semántica | **Grammar** `:477-481`; `expression_ast.go:49-59` |
| `ACTIVE-MANDATE-SOURCE-01` | Fuente autoritativa de Mandates activos, ancestry y lifecycle | La colisión territorial exige conocer coexistencia; `GravityNode.status` no equivale al estado operacional completo del Mandate | `model.go:63-72`; **Impl** `:162-174` |
| `TERRITORY-NORMALIZATION-01` | Semántica de intersección entre `target` y `scope_paths` | Paths, directorios, globs, símbolos y recursos no necesariamente se intersectan con una sola operación de strings | **Impl** solo da pseudocondición `:166-172` |
| `POSTURE-EVALUATOR-01` | Evaluador concreto y semántica de comparación multi-AST | El repositorio solo define interfaz; sin evaluador no hay confirmación mecánica | `expression_ast.go:73-94` |
| `QUALITATIVE-CONFIRMATION-01` | Autoridad y procedimiento para confirmar criterio cualitativo | Semantics puede proponer candidatos, pero no ratificar hechos; `constraint/evidence/exception` no son predicados computables | **Boundary** `:21-28`; `expression_ast.go:5-20`, `:39-42`, `:61-71` |
| `DETECTION-ARBITRATION-BOUNDARY-01` | Qué clases se rechazan al validar y cuáles producen evento | Contradicción vertical, incoherencia interna y colisión horizontal no necesariamente comparten consecuencia | R-18/R-19; **Impl** §3; inferencia de este documento |
| `ARBITRATION-EVENT-INPUT-01` | Shape de evidencia para colisiones de posturas | El evento histórico solo modela `conflictScope` de paths y Mandate IDs | **Impl** `:198-214`; **Boundary** `:32-44` |

### 9.2 Gaps preservados por referencia cruzada — no resueltos aquí

Los cinco gaps del cierre de boundary permanecen intactos (`docs/ANAYSIS/GRAVITY/GRAFO/Cierre_Boundary_Gravity_GravityGraph_Semantics_Provenance_v0_1.md:48-56`) **[D]**:

1. staging obligatorio versus salto de niveles en promoción;
2. shape exacto de `promotedTo`;
3. autoridad para iniciar promoción;
4. identidad o reformulación de `expression` al promover;
5. relación `RequireMaster()`/`cor`.

Una colisión puede motivar una postulación futura, pero este documento no decide cómo esa postura se promueve, quién la inicia ni cómo se reformula **[I]**.

### 9.3 Otros límites preservados

- No se amplía la ontología general de Provenance.
- No se diseña Trazabilidad Viva.
- No se agrega ningún tipo de arista a `GravityGraph`.
- No se reabre el boundary Gravity / `GravityGraph` / Semantics / Provenance.
- No se diseña UI ni notificación.
- No se propone código, endpoint, package, comando ni workflow.
- No se mezcla este trabajo con Mandate Genesis ni con compatibilidad de instalación de Mandates.

### 9.4 Condición de avance recomendada

**[I]** Antes de abrir un cowork de implementación completo de Eje 4 deben ratificarse, como mínimo:

1. la taxonomía o un subconjunto implementable de ella;
2. la fuente autoritativa para sujetos operacionales y territorio;
3. el límite exacto entre rechazo de validación y handoff a arbitraje;
4. el contrato de confirmación para casos mecánicos;
5. el tratamiento explícito de `UNDECIDABLE_CANDIDATE`;
6. los campos de entrada que `ArbitrationEvent` necesita sin incorporarlo a `GravityGraph`.

Es posible abrir primero un cowork más acotado —por ejemplo, solo `PRIORITY_CYCLE` sobre ASTs o solo territorio operacional— si la sesión de control ratifica explícitamente ese recorte. Este documento no presume que tal recorte deba implementarse.

---

## 10. Cierre

El nombre “colisión” estaba cubriendo fenómenos distintos:

- una carrera de escritura sobre el mismo `node.json`, ya resuelta por CAS y fuera de Gravity semántica;
- una superposición territorial de Mandates, bosquejada documentalmente pero sin datos ni detector dentro de `GravityGraph`;
- una contradicción vertical, parcialmente gobernada por R-18/R-19;
- una incompatibilidad horizontal entre posturas, todavía sin algoritmo general;
- una incoherencia interna de precedencia, representable con el AST actual pero no evaluada.

La contribución de esta especificación es separar esos fenómenos, fijar qué evidencia mínima permite hablar de colisión y preservar la diferencia entre **candidato**, **hecho confirmado** y **arbitraje**. No convierte una inferencia semántica en verdad factual, no introduce `ArbitrationEvent` dentro de `GravityGraph`, no redefine Provenance y no diseña cómo se resuelve ninguna colisión.

**Regla de cierre:** la sesión de control debe contrastar esta taxonomía y sus gaps contra lo implementado. Solo después puede decidir si abre un cowork de implementación de Eje 4, si ratifica primero contratos faltantes o si limita el próximo incremento a una categoría determinista. Ninguna implementación se deriva automáticamente de este documento.

---

*Fin de la especificación de investigación v0.1. Único entregable del cowork: documento de evidencia, tipificación y boundary de detección; cero código de producción.*
