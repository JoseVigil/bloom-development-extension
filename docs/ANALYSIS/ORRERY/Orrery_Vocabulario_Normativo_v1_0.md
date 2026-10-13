# Orrery — Vocabulario normativo v1.0

> **Reemplazado por `Orrery_Vocabulario_Normativo_v1_1.md` (2026-10-11).** Este documento se conserva como versión histórica y no se edita.

**Estado:** normativo. Fundamento de vocabulario de ORRERY.
**Fecha:** 2026-10-10.
**Autoridad:** José Vigil.
**Origen:** reconciliación del borrador `Orrery_Vocabulario_Normativo_Minimo_v0_1_BORRADOR` con las decisiones de José sobre V-Q1–V-Q11 (encargo "Consolidación del vocabulario y orden normativo de ORRERY", 2026-10-10).
**Base física contrastada:** repositorio `bloom-development-extension`, `main` en `78bbaad`.
**No hace:** no redacta la Constitución de Orrery, no cierra D-1/D-2/D-3, no autoriza implementación y no modifica contratos físicos.

---

## 0. Principio fundacional

> **El Territorio permanece. El Trabajo ocurre sobre el Territorio. Las Lentes permiten percibir lo que ocurre y aplica sobre él. Las Superficies permiten comprenderlo y actuar.**

Cada término de este documento ocupa un lugar en esa frase o en los mecanismos que la hacen posible (Fuente, Proyección, Anotación, Espacio, Navigation State, Captura, Location). Ningún término puede ocupar dos lugares.

Lectura de la frase:

| Parte | Términos que la sostienen |
|---|---|
| "El Territorio permanece" | Territorio, Entidad, Relación, Fuente |
| "El Trabajo ocurre sobre el Territorio" | Trabajo |
| "lo que … aplica sobre él" | criterio normativo de Gravity (término canónico del sistema; Orrery no lo renombra) |
| "Las Lentes permiten percibir" | Proyección, Lente, Anotación, Espacio |
| "Las Superficies permiten comprenderlo y actuar" | Superficie de Workspace Core |
| Dónde está y desde dónde decide la persona | Contexto, Foco, Anchor, Navigation State, Captura, Location/LocationSnapshot, Procedencia |
| Cómo se dispone la interfaz | Régimen |

---

## 1. Decisiones incorporadas en esta versión

| ID | Decisión de José | Efecto en el vocabulario |
|---|---|---|
| V-Q1 | Lente es estrictamente un mecanismo de lectura/proyección. No es información, fuente, dueña del significado ni persistencia. | §2.7. La "capa consumidora" de septiembre se reclasifica (§4.2, R-1). |
| V-Q2 | Mandate y Session no son Territorio: pertenecen al universo de Trabajo y pueden proyectarse o situarse sobre el Territorio. NUCLEUS tampoco es Territorio. Las referencias o relaciones que Location/GravityGraph admiten hoy con ellos se registran como conflicto contractual, no se usan para convertirlos en territorio. | §2.1, §2.3, §2.6; conflictos F-1 a F-3. |
| V-Q3 | Foco es atención efímera de navegación. Anchor es selección deliberada desde la cual la persona decide o actúa. Location captura anchors y evidencia estructural, no el foco incidental. | §2.10, §2.11; discrepancia con ASM registrada (A-1). |
| V-Q4 | Territorio es el dónde. Espacio es la representación navegable del Territorio. Régimen es el modo de layout de Workspace Core. | §2.1, §2.2, §3.6. |
| V-Q5 | Contexto, para Orrery, es el scope soberano confirmado Organization + Project y su evidencia. No se afirma equivalencia con otros usos históricos de "Context" no contrastados. | §2.9; A-2. |
| V-Q6 | Atención no la decide Orrery. Debe provenir clasificada o señalada por el sistema responsable; Orrery puede proyectarla y una Superficie explicarla. | §3.7. |
| V-Q7 | Evitar colisiones en los nombres de las Lentes, sin cerrar todavía su naming definitivo. | §2.7; A-3. |
| V-Q8 | Usar "Superficie de Workspace Core" como término calificado. | §2.8. |
| V-Q9 | `localLocation` queda documentado como excepción/deuda terminológica; no se modifica ahora el contrato físico. | §2.11; F-6. |
| V-Q10 | Se incorporan formalmente Proyección, Anotación, Navigation State, Captura, Procedencia y Régimen. | §3. |
| V-Q11 | Source Authority Profile V1 queda como dependencia documental pendiente mientras no se localice. No se reconstruye ni se inventa su contenido. | §2.5; A-4. |

Una consecuencia directa de V-Q2 y del principio fundacional obliga a definir **Trabajo** como término (§2.6): sin él, "universo de Trabajo" quedaría huérfano. No es una línea de diseño nueva; es el nombre del lugar que la decisión ya asignó. El nombre "Trabajo" deja de ser candidato a nombre de Lente (que era su uso en el borrador de investigación): designa la información, no el mecanismo que la lee.

---

## 2. Términos normativos

Formato de cada término: **Qué es · Función · Recibe o representa · Qué NO es · Verdad (de quién la obtiene) · Ejemplo en Cognituum · Notas de contraste.**

### 2.1 Territorio

- **Qué es:** el dónde de Cognituum: el conjunto de Entidades y Relaciones estructurales en el que una persona puede estar y desde el que puede decidir o actuar.
- **Función:** dar un lugar estable e identificable a todo lo demás. Es lo que permanece.
- **Representa:** Tenant › Organization › Project (› Repository) y, dentro del Project, Domains y Genes con sus Relaciones ratificadas.
- **Qué NO es:** no es su representación (Espacio); no es Trabajo (Mandate, Session, Action, Intent); no es criterio normativo (Postures); no es NUCLEUS; no es un índice semántico; no es un conjunto de rutas reservadas por un Mandate.
- **Verdad:** Authority/Nucleus para la jerarquía soberana (`ProjectBinding`); fuente canónica Nucleus-level para Domain y Gene (`COGNITUUM_GENE_CONCEPT_v3_0.md` §8). GravityGraph aporta sólo proyecciones.
- **Ejemplo:** `‹organización› › ‹proyecto› › Domain "Identidad" › Gene "verificación de sesión"`.
- **Notas:** coincide con "territorio soberano" (UI Contenedora v0.1 §0) y con Domain como "territorio funcional o conceptual" (Gene v3.0 §2.6). El uso de `MANDATE_TERRITORY_OVERLAP` (spec de Colisiones §3.1) designa el alcance operacional de un Mandate (`scope_paths`), no Territorio: deuda terminológica D-T1.

### 2.2 Espacio

- **Qué es:** la representación navegable del Territorio.
- **Función:** permitir orientarse, recorrer, seleccionar y anclar; dar posición relativa a las Anotaciones.
- **Recibe:** un modelo del Territorio (identidades, Relaciones, Procedencia) y Anotaciones producidas por Lentes. Nada más.
- **Qué NO es:** no es fuente de verdad; no crea, reordena ni re-anida la jerarquía; no interpreta propósito; no es un Régimen; cámara, coordenadas y layout no son identidad.
- **Verdad:** ninguna propia. Todo lo que muestra proviene del Territorio o de Anotaciones.
- **Ejemplo:** la escena PlayCanvas de `installer/conductor/workspace/core/orrery` mostrando el Project como región y "Identidad" como territorio dentro de ella.
- **Notas:** el código y los documentos de septiembre llaman "régimen Espacial" a un modo de layout; ese uso pasa a "Régimen" (§3.6).

### 2.3 Entidad

- **Qué es:** un elemento del Territorio con identidad propia `(fuente, tipo, id)`, que puede enfocarse y, si su tipo lo admite, anclarse.
- **Función:** ser la unidad de lugar a la que se refieren Relaciones, Proyecciones, Anotaciones y Anchors.
- **Representa:** Tenant, Organization, Project, Repository, Domain, Gene.
- **Qué NO es:** no es su contenido (`domain_definition.json` no es el Domain); no es un objeto de Trabajo (Mandate, Session, Action, Intent); no es un nodo de Gravity (NUCLEUS, ni los nodos ORGANIZATION/PROJECT en tanto portadores de Postures); no es un candidato semántico ni un `DomainCandidate`; no es un objeto ficticio del prototipo.
- **Verdad:** la fuente autoritativa de su tipo.
- **Ejemplo:** el Project con `projectId` y binding verificado; un Gene identificado por `(projectId, geneId)` con su revisión vigente.
- **Notas:** el sobre `(source, type, id)` es el propuesto por `Orrery_LocationSnapshot_v0.md` §A.2. Repository: Project→Repository 0..N está ratificado y no tiene todavía representación física en Workspace Core. Un nodo Gravity ORGANIZATION o PROJECT es una proyección normativa asociada a la Entidad, no la Entidad misma.

### 2.4 Relación

- **Qué es:** un hecho existente que vincula dos Entidades, con tipo, estado, versión y Fuente.
- **Función:** hacer navegable el Territorio y definir vecindad (un grado) y alcance (reachability).
- **Representa:** pertenencia soberana (respaldada por `ProjectBinding`), `ParentID` observado entre Entidades, Domain↔Gene ratificado (proyectado como `DOMAIN_GENE`).
- **Qué NO es:** no es proximidad visual ni similitud semántica (un `semantic_candidate` es propuesta, no Relación: Gene v3.0 §2.4, §7.8); no es una arista inventada para dibujar; **no es la situación de un objeto de Trabajo sobre una Entidad** (ver §3.8).
- **Verdad:** la fuente del hecho; GravityGraph como proyección reconstruible.
- **Ejemplo:** `domain_gene:dom_identidad:gene-x`, activa, con `canonicalSource.fingerprint`.
- **Notas:** la Agenda (23-09) fija que la reachability requiere Relaciones estructurales explícitas y autorizadas, y deja abierta la "identidad de Relationship" (A-5). `DOMAIN_MANDATE` vincula Territorio con Trabajo: deja de ser Relación en este vocabulario (F-2).

### 2.5 Fuente

- **Qué es:** el origen del que se obtiene un hecho, con su clase de autoridad.
- **Función:** determinar cuánto puede afirmar Orrery sobre lo que muestra.
- **Representa:** una de las clases que distingue la consolidación de Agenda: autoridad canónica, registro, copia, proyección, índice, cache, dato visual.
- **Qué NO es:** no es Procedencia (§3.5); no es una Proyección; no es una Lente ni una Superficie.
- **Verdad:** la clasificación normativa pertenece a Source Authority Profile V1, **dependencia documental pendiente** (A-4). Hasta localizarlo, la lista de clases de la Agenda es la única referencia y no se amplía.
- **Ejemplo:** el binding del Project proviene de autoridad canónica (`nucleus authority context-read`); un nodo DOMAIN de GravityGraph es una proyección; `.cache/.semantic-index.json` es un índice transitorio; `orrery/src/data.ts` es dato visual.
- **Notas:** en código, `StructuralEdge.canonicalSource` es un localizador del hecho (ruta, selector, fingerprint), no una clase de autoridad.

### 2.6 Trabajo

- **Qué es:** el universo de objetos del sistema que ocurren sobre el Territorio: decisiones adoptadas que lo fundan, Mandates, Sessions, Actions, Intents, ejecuciones y sus resultados.
- **Función:** representar lo que pasa, a diferencia de lo que permanece.
- **Representa:** Mandate (contrato, estado, actos humanos), Session, Action, Intent, resultado de ejecución, artefactos producidos; Postulate cuando su objeto quede definido.
- **Qué NO es:** no es Territorio; no es una Lente (el mecanismo que proyecta Trabajo sobre el Territorio tiene nombre pendiente, A-3); no es criterio normativo.
- **Verdad:** Nucleus/Temporal para Mandate, Session y ejecución; Brain para artefactos de Intent; autoridad humana vía Authority para actos.
- **Ejemplo:** el Mandate Genesis cuyo contrato declara el dominio "Identidad" y cuya Action `gen` produjo `domain_definition.json`.
- **Notas:** un objeto de Trabajo puede **situarse** sobre una Entidad (§3.8) sin pasar a formar parte del Territorio.

### 2.7 Lente

- **Qué es:** un mecanismo de lectura que toma una Proyección referida a Entidades del Territorio y la vuelve perceptible en el Espacio como Anotaciones.
- **Función:** permitir percibir una clase de información (lo que ocurre o lo que aplica) sobre el dónde, sin cambiar el dónde.
- **Recibe:** una Proyección cuyas filas se refieren a Entidades. Produce Anotaciones.
- **Qué NO es:** no es información; no es Fuente; no es dueña del significado; no persiste; no decide relevancia ni atención; no agrega Entidades ni Relaciones; no es una Superficie de Workspace Core.
- **Verdad:** ninguna propia; hereda la de la Proyección que lee.
- **Ejemplo:** una Lente lee la Proyección "Mandates situados por Domain" y anota un marcador con estado sobre "Identidad"; otra lee "Postures declaradas por nodo de spine" y anota un halo sobre el Project.
- **Condición de pertenencia:** una información sólo puede tener Lente si cada fila de su Proyección se refiere a una Entidad. Lo que no se refiere a Entidades (por ejemplo, la contabilidad de inteligencia) se presenta sólo en Superficies.
- **Naming:** los nombres de las Lentes no están cerrados (A-3). No deben coincidir con nombres de información (Trabajo), ni con tipos existentes (por ejemplo `nucleus/gravity.Criterion`).

### 2.8 Superficie de Workspace Core

- **Qué es:** la interfaz convencional de Workspace Core donde la persona comprende un sujeto en detalle y/o actúa sobre él.
- **Función:** explicar (por niveles de detalle), recibir decisiones, mostrar listas y secuencias sin sentido espacial, y canalizar actos hacia Nucleus/Authority.
- **Recibe:** read models de un sujeto (una Entidad o un objeto de Trabajo o de Gravity) y contratos de comando.
- **Qué NO es:** no es Fuente; no conserva copias mutables de lo autoritativo; no firma ni autoriza; no es una Lente; no es una aplicación del ecosistema (Conductor, Companion), ni una superficie de comandos CLI ni una superficie administrativa de Nucleus.
- **Verdad:** la de los read models que consume; los actos los verifica y registra la autoridad responsable.
- **Ejemplo:** el inspector de un Mandate con su contrato, digest y "Necesita que apruebes el plan exacto", con el pasaje a Authority.
- **Notas:** el calificativo es obligatorio porque el corpus usa "superficie" para aplicaciones completas (Core UI v0.4 F-07; doctrina "Functional Web Surfaces"), superficies administrativas y superficies de invocación.

### 2.9 Contexto

- **Qué es:** el scope soberano confirmado (Organization + Project) y su evidencia.
- **Función:** fijar dentro de qué la persona navega, ancla, declara y actúa; habilitar o bloquear lo que depende de autoridad.
- **Representa:** lo que expone `bloom.confirmed-context/v1`: identidad y membresía, binding del Project, continuidad de `projectId` y demás estados evaluados.
- **Qué NO es:** no es Foco; no es el contexto ensamblado por ASM; no es el contexto de aplicación de una colisión o evaluación (Impact `context`); no es el contexto técnico de un brief del Companion.
- **Verdad:** Nucleus (`nucleus authority context-read`), revalidado.
- **Ejemplo:** "‹organización› › ‹proyecto›, vinculado, verificado 12:03".
- **Notas:** no se afirma equivalencia con el "Context" de los tres estados cognitivos (José 20-09; Agenda 23-09), cuya definición literal no pudo contrastarse (A-2).

### 2.10 Foco

- **Qué es:** la atención efímera de navegación: aquello que la persona mira ahora.
- **Función:** orientar sin comprometer; determina hacia dónde va la cámara del Espacio y de qué habla la Superficie.
- **Representa:** un estado de sesión dentro del Navigation State.
- **Qué NO es:** no es Anchor; no se captura en una Location; no es Contexto; no es el "foco principal" de ASM (A-1).
- **Verdad:** la persona; vive sólo en el cliente.
- **Ejemplo:** la persona hace clic en un Gene para leer su ficha sin intención de decidir sobre él.

### 2.11 Anchor

- **Qué es:** una Entidad seleccionada deliberadamente por la persona como punto desde el cual decide o actúa.
- **Función:** fijar el punto de partida de una declaración o acto; es lo que la Captura incluye con `origin: user_anchor`.
- **Representa:** una referencia a Entidad admisible por el contrato de Location vigente.
- **Qué NO es:** no es Foco ni selección incidental; no es ancestro ni vecino incluido por estructura; no se infiere por relevancia; no es lo último visitado.
- **Verdad:** el acto explícito de la persona, más la verificación de existencia y pertenencia al Contexto.
- **Ejemplo:** "Declarar desde Domain Identidad" fija Identidad como Anchor.
- **Notas:** usos previos de "anchor" como destino de foco por defecto ("anchor raíz del scope", UI Contenedora v0.1 §3.3) o como último visitado (`regimeStore.lastVisitedAnchor`) son deuda (D-T3, F-7).

### 2.12 Location / LocationSnapshot

- **Qué es:** Location es el concepto de *desde dónde decidió actuar una persona* (Closure v1.1 §2). LocationSnapshot es su captura inmutable (contrato candidato v0.1).
- **Función:** conservar como evidencia verificable el punto de partida de una decisión, para que otro proceso la consuma sin reinterpretarla.
- **Representa:** Contexto (Tenant, Organization, Project + binding), Anchors, ancestros comprobados, Relaciones existentes, vecinos de un grado, intervalo de observación no atómico.
- **Qué NO es:** no es Navigation State; no es el Territorio entero; no contiene el Foco; no incluye la declaración humana; no contiene coordenadas, cámara ni contenido de entidades; no evalúa Gravity; no se modifica al resolverse.
- **Verdad:** el productor de Location (encargo A1, inexistente hoy); la resolución posterior genera diagnósticos separados con ocho estados (`resolved`, `changed`, `stale`, `missing`, `unauthorized`, `ambiguous`, `unsupported`, `unverifiable`).
- **Ejemplo:** la captura que se produce cuando la persona declara una decisión anclada en Domain Identidad.
- **Excepción terminológica:** el campo `localLocation` de `bloom.confirmed-context/v1` significa presencia de la carpeta local del Project; **no es Location**. No se modifica ahora (F-6).

---

## 3. Términos de soporte

### 3.1 Proyección

- **Qué es:** una lectura derivada de una Fuente, organizada por Entidad del Territorio.
- **Función:** ser lo que una Lente lee; preparar información de Trabajo o de Gravity en términos de dónde.
- **Qué NO es:** no es la Fuente; no persiste; no es la Lente; no es la "proyección Gravity" de Domain/Gene (Gene v3.0 §2.5), que es una proyección estructural persistida en GravityGraph.
- **Verdad:** la Fuente que proyecta.
- **Ejemplo:** "Mandates situados por Domain"; "Postures declaradas por nodo de spine".
- **Notas:** cuando haya riesgo de confusión se escribe "Proyección de lectura" frente a "proyección Gravity" (D-T4).

### 3.2 Anotación

- **Qué es:** lo que una Lente dibuja en el Espacio: referencia a una Entidad, clase de glifo y estado.
- **Función:** hacer perceptible, en posición, algo que ocurre o aplica sobre una Entidad.
- **Qué NO es:** no es significado ni explicación (eso está en la Proyección y en la Superficie); no es Entidad; no altera el Territorio.
- **Verdad:** la Lente que la produce.
- **Ejemplo:** un marcador de estado sobre "Identidad" indicando que un Mandate allí espera aprobación.
- **Notas:** coincide con el uso de UI Contenedora v0.1 §2.2 y §4.4 ("anotación que una capa consumidora dibuja sobre territorio ajeno"), con la reclasificación de "capa consumidora" (R-1).

### 3.3 Navigation State

- **Qué es:** el estado de sesión que contiene Contexto activo, Foco y Anchors.
- **Función:** sostener la navegación sin convertirla en captura.
- **Qué NO es:** no es Location; no es autoritativo (salvo el Contexto, que viene de Nucleus).
- **Verdad:** el cliente, y Nucleus para el Contexto.
- **Ejemplo:** Contexto = ‹proyecto›; Foco = Gene X; Anchors = {Domain Identidad}.
- **Notas:** nombrado en la Agenda (23-09): "Navigation State es mutable y de sesión; LocationSnapshot es una captura verificable".

### 3.4 Captura

- **Qué es:** el acto que convierte Contexto + Anchors + evidencia estructural del Territorio en una LocationSnapshot.
- **Función:** separar navegar de decidir.
- **Qué NO es:** no es navegar, enfocar ni seleccionar; no ocurre en cada paso de navegación.
- **Verdad:** el productor de Location.
- **Ejemplo:** al confirmar "Declarar desde Domain Identidad", se captura una Location con ese Anchor.

### 3.5 Procedencia

- **Qué es:** por qué algo aparece y de qué clase de Fuente proviene.
- **Función:** permitir que la persona distinga lo verificado de lo declarado o propuesto.
- **Qué NO es:** no es la Fuente; no es un juicio de relevancia.
- **Verdad:** la Fuente más la regla que lo incluyó.
- **Ejemplo:** *verificado* (binding), *declarado por un Mandate* (dominio del contrato), *propuesto* (`DomainCandidate`), *proyección* (nodo Gravity), *no verificable*.
- **Notas:** LocationSnapshot §C.5 distingue procedencia de inclusión (`user_anchor`, `structural_ancestor`, `direct_relation`) de procedencia del hecho. Ambas son Procedencia; se nombran por separado cuando hace falta.

### 3.6 Régimen

- **Qué es:** el modo de layout de Workspace Core.
- **Función:** disponer Espacio y Superficies de Workspace Core en pantalla.
- **Qué NO es:** no es el Espacio; no tiene contenido propio.
- **Verdad:** decisión de interfaz.
- **Ejemplo:** hoy existen dos: Panel y Espacial (`regimeStore.ts`). Cómo conviven es materia de D-2, que este documento no cierra.

### 3.7 Atención

- **Qué es:** información de que algo requiere a la persona, **clasificada y señalada por el sistema responsable** (Nucleus, Authority, Monitor, el workflow del Mandate).
- **Función:** convocar a la persona por excepción.
- **Qué NO es:** no la decide Orrery; no la decide una Lente; no es una Superficie.
- **Verdad:** el sistema que la emite.
- **Ejemplo:** el workflow del Mandate espera la señal de aprobación; ese estado, expuesto por su fuente, es Atención. Una Lente puede anotarlo sobre el Domain; una Superficie lo explica.
- **Notas:** sustituye el uso del borrador de investigación, que la trataba a la vez como lente y como región derivada en el cliente.

### 3.8 Situar

- **Qué es:** asociar un objeto de Trabajo (o de Gravity) a una Entidad del Territorio a efectos de proyección, sin que pase a formar parte del Territorio.
- **Función:** dar posición a lo que ocurre o aplica, sin convertirlo en dónde.
- **Qué NO es:** no es una Relación del Territorio; no crea Entidades.
- **Verdad:** la Fuente del objeto (por ejemplo, el dominio declarado en el contrato del Mandate).
- **Ejemplo:** el Mandate Genesis se sitúa sobre Domain "Identidad" porque su contrato firmado lo declara.
- **Notas:** término mínimo exigido por V-Q2 ("pueden proyectarse/situarse"); sin él, Trabajo no tendría forma de referirse al Territorio.

---

## 4. Segunda prueba de coherencia

### 4.1 Las cuatro cadenas, separadas

```text
(1) Fuente ──► Territorio (Entidades + Relaciones) ──► Espacio

(2) Fuente ──► Proyección (situada por Entidad) ──► Lente ──► Anotación ──► Espacio

(3) Navigation State (Contexto + Foco + Anchors) ──► Captura ──► LocationSnapshot

(4) Read model de un sujeto ──► Superficie de Workspace Core ──► (acto) ──► Nucleus / Authority
```

| Verificación | Resultado |
|---|---|
| ¿Algo entra al Espacio por otra vía que (1) o (2)? | No. |
| ¿Una Lente produce Entidades o Relaciones? | No (§2.7). |
| ¿El Foco llega a una LocationSnapshot? | No (§2.10, §3.4). |
| ¿Una Superficie escribe estado autoritativo? | No; canaliza actos (§2.8). |
| ¿Trabajo o Gravity entran al Territorio? | No; se sitúan (§3.8) y se proyectan por (2). |
| ¿Atención nace en Orrery? | No; viene de su fuente y viaja por (2) y (4) (§3.7). |

### 4.2 Lugar de cada objeto

| Objeto | Territorio | Trabajo | Criterio normativo (Gravity) | Proyectable por Lente | Superficie | Resultado |
|---|---|---|---|---|---|---|
| Tenant, Organization, Project | Entidad | — | — | — | Sí | Inequívoco |
| Repository | Entidad (sin dato físico aún) | — | — | — | Sí | Inequívoco |
| Domain, Gene | Entidad | — | — | — | Sí | Inequívoco |
| `domain_definition.json`, documentación de un Gene | — | Resultado de Trabajo (contenido sobre una Entidad) | — | Sí, situado en su Domain | Sí | Inequívoco |
| `DomainCandidate` | — | Propuesta dentro de un Mandate | — | Sí, situado en el Project | Sí | Inequívoco |
| `semantic_candidate` | — | — | — | Sí, como propuesta (nunca como Relación) | Sí | Inequívoco |
| Mandate, Session | — | Sí | — | Sí, situados | Sí | Inequívoco en el vocabulario; **conflicto contractual F-1/F-2** |
| Action, Intent | — | Sí | — | No (sin sentido espacial propio) | Sí, dentro del Mandate | Inequívoco |
| Postulate (adoptado) | — | Sí (funda Trabajo) | — | Sí, situado en sus Anchors | Sí | Inequívoco; objeto aún no definido físicamente |
| Decisión en curso (PostulateProposal) | — | Pre-Trabajo | — | No | Sí | Inequívoco |
| NUCLEUS (nodo Gravity) | — | — | Raíz del spine normativo | Sus Postures, sí | Sí | Inequívoco en el vocabulario; **conflicto contractual F-1** |
| Nodos Gravity ORGANIZATION/PROJECT | — (proyección asociada a la Entidad) | — | Portan Postures | Sí | Sí | Inequívoco |
| Posture, Masa | — | — | Sí | Sí, situadas en nodos de spine | Sí | Inequívoco |
| Colisión | — | Según familia (territorial = Trabajo) | Según familia (jerárquica/horizontal) | Sí, sobre sus sujetos | Sí | Inequívoco |
| Assessment de Impact | — | Evidencia sobre Trabajo o criterio | — | Sí, si su sujeto se sitúa | Sí | Inequívoco |
| Señal de atención | — | Emitida por el sistema responsable | — | Sí | Sí | Inequívoco |
| Contabilidad de inteligencia | — | Evidencia operativa | — | No | Sí | Inequívoco |
| Ledger | — | Registro (Fuente) de eventos | — | Parcial (si los eventos se sitúan) | Sí | Inequívoco tras R-1 |

### 4.3 Contradicciones resueltas por este vocabulario

| ID | Contradicción | Resolución |
|---|---|---|
| R-1 | "Capa consumidora" (UI Contenedora v0.1, Ledger Panel v0.1) mezclaba dueña de significado, persistencia y dibujo. | Se descompone: lo que persiste es Fuente; lo que se organiza por Entidad es Proyección; lo que dibuja es Lente → Anotación; lo que explica es Superficie de Workspace Core. El término "capa consumidora" no forma parte del vocabulario. |
| R-2 | "Espacio" como el dónde y como modo de pantalla. | Territorio / Espacio / Régimen. |
| R-3 | "Atención" como lente y como región derivada en el cliente (borrador de investigación §6.2, §7.1). | Atención viene clasificada por su fuente (§3.7). |
| R-4 | Lente "Conocimiento" cubría Genes, que son Entidades. | Genes son Territorio; sólo el contenido sobre Entidades se proyecta. |
| R-5 | "Contexto" con cuatro usos. | En Orrery, sólo el scope soberano confirmado. Los otros usos conservan sus nombres en sus dominios. |
| R-6 | "Superficie" como aplicación. | Término calificado "Superficie de Workspace Core". |
| R-7 | "Trabajo" como nombre de información y de lente a la vez. | Trabajo designa la información; el nombre de la Lente queda abierto (A-3). |

### 4.4 Contradicciones abiertas (documentales; requieren reconciliación, no cambian contratos por sí mismas)

| ID | Contradicción | Fuentes | Qué debe ocurrir |
|---|---|---|---|
| A-1 | ASM usa "foco principal" como parte obligatoria de la Location y lo distingue de "anchors adicionales"; aquí Foco es efímero y Location captura sólo Anchors. | `ASM_Location_Research_v0_2.md`; `ASM_Intent_Spec_v1_0.md` §4.1 | Reconciliar el contrato Location–ASM: el "foco principal" de ASM corresponde, en este vocabulario, a un Anchor principal. Decisión de José al reabrir ASM. |
| A-2 | El "Context" de los tres estados cognitivos (Context / Focus / Anchor) no pudo contrastarse; su definición vive en la tarea ORRERY consolidada `01a0a6d5-…`, no accesible. | Agenda 23-09; investigación v0.1 de septiembre | Contrastar cuando la tarea sea accesible; hasta entonces, no afirmar equivalencia. |
| A-3 | Nombres de Lentes no cerrados. | Decisión V-Q7 | Cerrar en la Constitución o en la arquitectura UI/UX, sin colisión con nombres de información ni tipos existentes. |
| A-4 | Source Authority Profile V1 no localizado. | ADR ASM §2; Agenda | Localizar. La clasificación de Fuente queda provisional. |
| A-5 | "Identidad de Relationship" abierta: el binding no es arista Gravity; `ParentID` no tiene `edgeId`. | Agenda 23-09 | Definir identidad uniforme de Relación (encargo de Location/Domain-Gene). |
| A-6 | La regla "el árbol de escena es proyección 1:1 de una LocationSnapshot recibida" contradice la separación Navigation State → Captura → LocationSnapshot. | UI Contenedora v0.2 §2.2 | Se resuelve con D-3, que este documento no cierra. |
| A-7 | Ledger Panel v0.1 describe la navegación como "cadena de Locations visitadas derivada de LocationSnapshots", lo que implica capturar en cada paso. | Ledger Panel v0.1 §3.1 | Revisar ese documento: el rastro de navegación es Navigation State histórico, no Locations. |
| A-8 | El borrador `Investigacion_Propuesta_Arquitectura_UIUX_Orrery_WorkspaceCore_v0_1.md` usa "Lente Trabajo", "Lente Criterio", "Atención" como lente y "capas consumidoras". | Ese documento §6.2, §7.1, §12, §13 | Se lee a través de este vocabulario; deberá actualizarse antes de cualquier decisión que se apoye en él. |

### 4.5 Contradicciones que requieren modificar en el futuro un contrato físico

No se modifica ninguno ahora. Se registran para que ningún documento posterior las trate como excepción silenciosa.

| ID | Contrato físico | Conflicto con el vocabulario | Naturaleza |
|---|---|---|---|
| F-1 | `LocationSnapshot v0.1` (contrato candidato, JSON Schema en `Orrery_LocationSnapshot_v0.md` §E; no materializado) | `nodeType` admite `NUCLEUS`, `MANDATE` y `SESSION` como anchor, ancestro o vecino; ninguno es Territorio. | Cambio de schema antes de materializar (A1). Bajo costo hoy porque no hay productor. |
| F-2 | `StructuralEdge` con `EdgeDomainMandate` (`installer/nucleus/internal/gravity/model.go`) y su uso en `LocationSnapshot` `relations[]` | `DOMAIN_MANDATE` vincula Territorio con Trabajo; en este vocabulario es una situación (§3.8), no una Relación del Territorio. | Implementado en código (sin caller productivo). Requiere decidir si se conserva como proyección de situación o se reclasifica. |
| F-3 | Layout y modelo de GravityGraph para DOMAIN/GENE (`parentId` = MANDATE de origen; nesting `.mandate/{id}/.domain`, `.gene`) | Entidades del Territorio quedan anidadas bajo un objeto de Trabajo en la proyección Gravity. El contrato aclara que el padre expresa procedencia, no ownership; aun así, la forma física contradice "el Territorio no cuelga del Trabajo". | Implementado en código (sin caller productivo). Requiere decisión del dueño de Gravity/Genes. |
| F-4 | `GeneRef {mandateId, genePath}` bajo `.mandates/{id}/.genes/` | Identidad de una Entidad atada a un objeto de Trabajo. Gene v3.0 ya la declara transitoria. | Implementado; transición ya prevista por Gene v3.0. |
| F-5 | Paquete `orrery` (`locationTree.ts`, `adapters/fromSimulatedData.ts`, `regimeStore.ts`, `data.ts`) | `OrreryNodeType` incluye `NUCLEUS/MANDATE/SESSION`; el adaptador simulado marca todo como `user_anchor`; la escena contiene Mandate, Posture y Artifact como ítems del mundo. | Código de prototipo integrado; se corrige al implementar, no antes. |
| F-6 | `bloom.confirmed-context/v1` campo `localLocation` (`internal/governance/authority_command.go`, `webview/app/src/lib/confirmedContext.ts`) | "Location" con otro significado. | Excepción terminológica documentada (V-Q9). Cambio de nombre sólo con encargo propio. |
| F-7 | `regimeStore.lastVisitedAnchor` | Llama Anchor a lo último visitado (Foco). | Código; se corrige al implementar. |

### 4.6 Deudas terminológicas en documentos (sin cambio de contrato)

| ID | Documento | Término | Lectura correcta |
|---|---|---|---|
| D-T1 | Spec de Colisiones §3.1 | `MANDATE_TERRITORY_OVERLAP` ("territorio") | Superposición de alcance operacional entre Mandates; no Territorio. |
| D-T2 | UI Contenedora v0.1 §2.1 | "régimen Espacial" | Régimen (modo); el Espacio es la representación. |
| D-T3 | UI Contenedora v0.1 §3.3 | "anchor raíz del scope" | Foco inicial por defecto. |
| D-T4 | Gene v3.0 §2.5 vs §3.1 de este documento | "proyección" | "Proyección Gravity" (persistida) vs "Proyección de lectura" (Orrery). |
| D-T5 | `ws-events.ts` (comentario de `mandate:action:completed`) | "el gene existe en disco" | El resultado es un artefacto de Trabajo; no es un Gene. |

### 4.7 Resultado

No se encontró una contradicción bloqueante **para el vocabulario**: todos los objetos relevantes tienen un lugar inequívoco y las cuatro cadenas no comparten eslabones. Los conflictos F-1 a F-3 son reales y afectan contratos, pero son conflictos entre el vocabulario y contratos todavía no materializados (F-1) o implementados sin caller productivo (F-2, F-3); quedan registrados y deberán resolverse antes de materializar Location o conectar la proyección estructural de Gravity.

---

## 5. Fuentes contrastadas

- **Orrery:** `docs/ANALYSIS/ORRERY/LOCATION/{ORRERY_LOCATION_MATERIAL_CLOSURE_v1_1, Orrery_LocationSnapshot_v0}.md`; `docs/ANALYSIS/ORRERY/UI/*`; `Spec_Implementacion_Integracion_Core_Orrery_v1_0.md` y `Cierre_Implementacion_IntegracionFormal_Core_Orrery_v1_0.md` (Project BTIPS); `docs/ANALYSIS/GRAVITY/ORBITAL/{Orrery_Research_Brief_Interfaz_Principal_v0_1, Orrery_Research_Resultados_v0_1, Glosario_Contexto_Cognituum_para_Cowork}.md`; `Investigacion_Propuesta_Arquitectura_UIUX_Orrery_WorkspaceCore_v0_1.md` (borrador).
- **Territorio y Genes:** `docs/GENES/COGNITUUM_GENE_CONCEPT_v3_0.md`; `docs/ANALYSIS/GRAVITY/GRAFO/GravityGraph_DOMAIN_GENE_Contrato_Propuesto_v0_1.md`.
- **Gravity:** `docs/ANALYSIS/GRAVITY/PALADIN/Paladin_UX_Postura_Gravity_Masa_Spec_v0_1.md`; `docs/ANALYSIS/GRAVITY/MODELS/Paladin_Client_Object_Model_v0_1.md`; `docs/ANALYSIS/GRAVITY/COLISIONES/Orbital_Gravity_Deteccion_Tipificacion_Colisiones_Mandates_Posturas_Spec_v0_1.md`; `installer/impact/README.md`.
- **ASM:** `docs/ANALYSIS/BSIP/ASM/{ASM_Location_Research_v0_2, ASM_PRE_MANDATE_EXECUTION_ADR_v0_1}.md`; `docs/BSIP/TYPES/ASM_Intent_Spec_v1_0.md`.
- **Workspace Core:** `docs/CONDUCTOR/WORKSPACE/Bloom_Conductor_Workspace_Core_UI_01.md`; `docs/DESIGN/# BTIPS Foundational UX-UI Design Doctrine Prompt v0.1.md`.
- **Control:** `docs/CONTROL/AGENDA_MAESTRA.md` (Estado coordinado ORRERY / Location); `docs/CONTROL/AGENDA_FOLLOWUP.md`; `docs/MANDATE/MANDATE_PROGRAM_CANONICAL_SOURCE_v0_1.md`.
- **Código:** `installer/nucleus/internal/gravity/model.go`; `installer/nucleus/gravity/portable.go` (`Criterion`); `installer/nucleus/internal/governance/authority_command.go`; `webview/app/src/lib/{confirmedContext.ts, stores/regimeStore.ts}`; `installer/conductor/workspace/core/orrery/src/{locationTree.ts, data.ts, adapters/fromSimulatedData.ts}`; `src/types/ws-events.ts`.
- **No localizadas (no reconstruidas):** Source Authority Profile V1; tarea ORRERY consolidada `01a0a6d5-…`; investigación "Orrery Postures / Orrery Postulates".

---

## 6. Precedencia documental

1. Este vocabulario es la fuente normativa de los términos de §2 y §3 **dentro de ORRERY**.
2. No redefine términos canónicos de otros sistemas (Gene, Mandate, Posture, Gravity, Location como concepto de Closure v1.1). Cuando el uso de Orrery diverge de un contrato de otro sistema, la divergencia queda registrada (§4.4–§4.5) y se resuelve en el dueño de ese contrato.
3. Los documentos de ORRERY anteriores a esta fecha (`docs/ANALYSIS/ORRERY/**`, research Orrery en `docs/ANALYSIS/GRAVITY/ORBITAL/`) se leen a través de este vocabulario. Donde usen un término con otro significado, prevalece este documento y se registra como deuda.
4. Las decisiones del §1 no reabren decisiones previas de Orrery salvo donde este documento lo indica expresamente (R-1 a R-7) y salvo D-3 (A-6), que permanece abierta.

---

## 7. Orden normativo de ORRERY

```text
Vocabulario normativo  →  Constitución de Orrery  →  Decisiones arquitectónicas D-1 / D-2 / D-3
                       →  Arquitectura UI/UX       →  Vertical slices  →  Implementación
```

- Cada nivel se apoya en el anterior y no puede contradecirlo.
- **Ningún documento posterior puede redefinir silenciosamente un término de este vocabulario.** Si una investigación demuestra que una definición debe cambiar, debe proponerlo explícitamente, obtener aprobación de José, publicar una nueva versión de este documento y registrar qué documentos y contratos quedan afectados.
- El siguiente paso es la Constitución de Orrery, construida sobre esta versión.
