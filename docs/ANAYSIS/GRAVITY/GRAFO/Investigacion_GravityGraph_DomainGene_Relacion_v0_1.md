# Investigación — relación sin fusión entre GravityGraph y el Índice Semántico Domain/Gene

**Tipo:** investigación de diseño, sin implementación  
**Versión:** v0.1  
**Fecha:** 2026-09-02  
**Continuación directa de:** `GravityGraph_Domains_Genes_Postures_Provenance_and_Persistence_Audit_v0_1.md`, punto 8 de cierre

## Resultado ejecutivo

**[H] No existe hoy una necesidad real y concreta de que `GravityPosture` o `GravityNode` conozcan un `domain_id` o un `gene_id`.**

La implementación vigente de Gravity resuelve Posturas por la espina jerárquica `NUCLEUS → ORGANIZATION → PROJECT → MANDATE → SESSION` y las filtra exclusivamente por estado y por coincidencia entre `appliesTo[]` e `IntentType`. No consulta el Índice Semántico, Genes ni propuestas operacionales de Genesis.

El único adaptador Temporal de esa resolución está registrado como Activity, pero no es invocado por ningún Workflow. Los detectores que consumen `ResolvedPosture` sólo existen como funciones testeadas y tampoco combinan Posturas con conocimiento semántico. Paladin define una futura vista separada de grafo completo, pero deja expresamente fuera de alcance su interior. Genesis, por su parte, todavía produce `domain_proposal.json` y un scaffold incompleto: no materializa los Domains/Genes canónicos que una relación transversal tendría que referenciar.

**[P] Recomendación:** no agregar ahora referencias Domain/Gene a Gravity, no crear un índice transversal y no fijar todavía un contrato de join. Diseñar una relación persistida sin consumidor ni datos canónicos conectados sería prematuro. Si aparece un consumidor real que necesite presentar ambos planos —por ejemplo Paladin o Control— la primera alternativa a probar debe ser una resolución en tiempo de lectura, propiedad de ese consumidor, porque permite validar la necesidad sin convertir la proyección en una nueva fuente de verdad.

Este cierre no afirma que Gravity y el Índice Semántico nunca deban proyectarse juntos. Afirma algo más acotado: **el repositorio actual no demuestra una necesidad que justifique diseñar o persistir hoy esa relación.**

---

## 1. Premisas que esta investigación no reabre

**[H] `Intent Cor` (`cor`) está deprecado y fue excluido como fuente arquitectónica.** Gravity es la única autoridad vigente sobre autorización de postulados y Posturas. El motor BSIP de Brain (`ing`/`dis`) y el Índice Semántico Domain/Gene son sistemas vivos distintos y no se interpretan como extensiones de Intent Cor. Nota de terminología: el nombre correcto es `Intent Cor`, nunca "Intent Core" — "Core" colisiona con el paquete Go real y vigente `internal/core` (core.GetUserRole(), RoleMaster), que no tiene relación con el intent `cor` deprecado.

**[H] Se mantienen separados tres planos ya ratificados:**

1. GravityGraph: criterio ratificado y linaje mediante `GravityNode` y `gravityPostures[]`.
2. Índice Semántico Domain/Gene: topología semántica N:M en `.cache/.semantic-index.json` y Genes bajo sus Mandates.
3. Genesis operacional: `domain_proposal.json`, estado del workflow y scaffold.

Pueden ser leídos por una misma superficie, pero no forman una única fuente de verdad. Esta investigación evalúa únicamente si existe hoy una razón verificable para relacionarlos y, de existir, dónde debería vivir esa relación.

---

## 2. Pregunta examinada

La pregunta no es si GravityGraph debería incorporar nuevos tipos de nodo. `DOMAIN`, `GENE` y `POSTULATE` permanecen fuera del modelo vigente y no se propone agregarlos.

La pregunta concreta es:

> ¿Existe hoy algún consumidor real que necesite seleccionar, resolver, mostrar o aplicar una `GravityPosture` o un `GravityNode` en función de un Domain o un Gene canónico?

Para responderla se revisaron:

- el modelo de `GravityPosture`, `GravityNode` y `ResolvedPosture`;
- `ResolveActive` y la semántica real de `appliesTo[]`;
- la Activity Temporal que expone la resolución;
- sus registros e invocaciones reales en Workflows;
- los detectores que reciben `ResolvedPosture`;
- Mandate Genesis, `domain_proposal.json` y `scaffoldReal`;
- el lector parcial del índice Domain/Gene en Brain;
- los contratos canónicos `ing`/`dis`;
- la especificación de Paladin relativa a Posturas y a la futura vista de grafo.

---

## 3. Evidencia: qué sabe Gravity hoy

### 3.1 `GravityPosture` y `GravityNode` no transportan identidad semántica

**[H]** `GravityPosture` contiene `postureId`, procedencia desde Mandate, primitive, expression, `appliesTo`, estado, origen, verificabilidad, promoción y linaje de promoción. `GravityNode` contiene identidad, tipo, padre, Posturas, estado, firma y versión. Ninguno contiene `domain_id`, `gene_id` ni una referencia genérica a entidades del Índice Semántico.

Fuente implementada: `installer/nucleus/internal/gravity/model.go:49-83`.

El resultado resuelto sólo agrega a la Postura su `NodeType`, `NodeID` y masa. Por lo tanto, tampoco existe una relación implícita en `ResolvedPosture`.

### 3.2 `appliesTo[]` significa tipo de Intent, no Domain ni Gene

**[H]** `ResolveInput` exige `MandateID`, `SessionID` e `IntentType`. El recorrido carga la espina Gravity y la Session, descarta nodos y Posturas inactivas y ejecuta:

```text
applies(posture.AppliesTo, input.IntentType)
```

`applies()` devuelve verdadero sólo cuando algún elemento de `appliesTo[]` coincide exactamente con el tipo de Intent actual o con `*`.

Fuente implementada: `installer/nucleus/internal/gravity/resolver.go:11-64` y `resolver.go:67-74`.

**[H] Conclusión específica:** `appliesTo[]` no es una referencia semántica, no busca Domains ni Genes y no ofrece un hook incompleto que simplemente necesite conectarse. Cambiar su significado para aceptar identificadores Domain/Gene mezclaría dos dimensiones distintas: tipo de operación cognitiva y territorio semántico.

### 3.3 El adaptador Temporal tampoco acepta contexto Domain/Gene

**[H]** `ResolveActiveGravityInput` replica los mismos datos: raíz Nucleus, Mandate, Session, tipo de Intent, turno y cache de resolución. La Activity sólo construye el `Store` y delega a `ResolveActive`.

Fuente implementada: `installer/nucleus/internal/orchestration/activities/resolve_active_gravity_activity.go:9-35`.

No hay parámetros Domain/Gene que estén siendo ignorados o descartados en esta frontera.

---

## 4. Evidencia: consumidores reales de Posturas

### 4.1 `ResolveActiveGravityActivity` está registrada pero no invocada

**[H]** La Activity se registra con el nombre `resolveActiveGravityActivity` en `installer/nucleus/internal/orchestration/temporal/worker.go:89-93` y aparece en el listado operativo del worker.

**[H]** La búsqueda de invocaciones no encuentra ningún `workflow.ExecuteActivity` que la ejecute ni ningún Workflow que construya `ResolveActiveGravityInput`. Fuera de sus tests, la única llamada a `Store.ResolveActive` es el cuerpo de esa misma Activity.

Esto es más fuerte que constatar que no existe un filtro Domain/Gene: **el pipeline productivo visible todavía no consume la resolución de Posturas en absoluto.**

### 4.2 Los detectores de colisiones internas no requieren semántica Domain/Gene

**[H]** `DetectPriorityCycles` y `DetectThresholdUnsatisfiable` reciben `[]ResolvedPosture`. Sus únicas invocaciones encontradas están en tests. Su análisis trabaja con primitive/expression y procedencia Gravity; no lee el Índice Semántico ni Genes.

Fuentes implementadas:

- `installer/nucleus/internal/gravity/priority_cycle_detector.go:80-84`;
- `installer/nucleus/internal/gravity/threshold_unsatisfiable_detector.go:135-139`.

Por lo tanto, estos detectores no constituyen un consumidor transversal existente ni justifican agregar identidad Domain/Gene a la Postura.

### 4.3 Mandate Execution tampoco ofrece el punto de integración

**[H]** `MandateExecutionInput` sólo transporta `MandateID`, `Project`, `MandatesRoot` y `Domains []DomainAction`. `DomainAction` representa unidades operacionales de scaffold por `DomainName`, `ActionID`, archivos y dependencias. El Workflow ordena esas Actions y ejecuta `ScaffoldDomainActivity`; no resuelve Gravity y no consulta el índice canónico.

Fuente implementada: `installer/nucleus/internal/orchestration/temporal/workflows/mandate_execution_workflow.go:27-52` y `:158-180`.

La palabra “Domain” en este Workflow no demuestra identidad con `domains[domain_id]` del Índice Semántico: el contrato operacional trabaja por nombre y no transporta el `domain_id` canónico.

### 4.4 Paladin no es todavía un consumidor conjunto

**[H]** La especificación de Paladin diseña captura, visualización y conflicto de Posturas. Menciona una vista separada de “grafo completo”, pero deja expresamente fuera de alcance el diseño de su interior.

Fuente documental: `docs/ANAYSIS/GRAVITY/PALADIN/Paladin_UX_Postura_Gravity_Masa_Spec_v0_1.md:216-223`.

No se encontró implementación de Paladin/Control que lea simultáneamente `.gravity/**/node.json` y `.cache/.semantic-index.json`. Una futura necesidad de visualización es plausible, pero no equivale a un consumidor real con queries, casos de uso y ciclo de actualización definidos.

---

## 5. Evidencia: el plano Domain/Gene aún no ofrece datos E2E para esa relación

### 5.1 El índice canónico está definido, pero Genesis no lo materializa

**[H]** El contrato `ing` define `.cache/.semantic-index.json` como un mapa keyeado por `domain_id`, con `genes[]` como única fuente de verdad de la relación N:M Domain↔Gene. El nombre del Domain es mutable; `domain_id` es estable y nunca se reutiliza.

Fuente documental: `docs/BSIP/TYPES/ING_Intent_Spec_v1_1.md:511-552`.

**[H]** `dis` puede reorganizar la topología, retirar Domains por merge/split y dejar referencias antiguas apuntando a un ID que ya no existe. No hay tombstone ni redirección automática.

Fuente documental: `docs/BSIP/TYPES/DIS_Intent_Spec_v1_0.md:347-380`.

Esta mutabilidad importa para cualquier referencia persistida fuera del índice: aunque el identificador nunca cambie de significado, puede dejar de resolver.

### 5.2 Genesis produce otra estructura

**[H]** `scaffoldDryRun` produce un `domain_proposal.json` con un único Domain derivado de la entrada, cohesión placeholder y una Action sugerida porque todavía no existe clustering real de Brain. `scaffoldReal` crea una carpeta operacional y `_INCOMPLETE_SCAFFOLD.json`; declara explícitamente que la materialización real permanece incompleta.

Fuente implementada: `installer/nucleus/internal/orchestration/activities/mandate_genesis_activities.go:207-272`.

**[H]** Por lo tanto, un hipotético `domainId` tomado hoy de `domain_proposal.json` no debe grabarse como si fuera una referencia al Domain lógico canónico. Son objetos de planos diferentes y la equivalencia no está conectada.

### 5.3 El lector de Brain también explicita el gap de ubicación

**[H]** El flujo `dis` de Brain intenta construir `.genebase.json` y `.domain_graph_snapshot.json`, pero declara que las rutas Nucleus-level reales no están confirmadas en esa implementación. Si no encuentra Genes o índice, degrada a snapshots vacíos y registra warnings en vez de fabricar datos.

Fuente implementada: `brain/core/intent_manager.py:472-550`.

No existe, entonces, una capa semántica operacional completa que ya esté pidiendo contexto Gravity para funcionar.

---

## 6. Respuesta a la pregunta de necesidad actual

**[H] No se encontró ningún consumidor real que hoy necesite que una Postura o un nodo Gravity “sepa” sobre un Domain o un Gene.**

La evidencia converge:

| Superficie | ¿Consume Gravity? | ¿Consume Domain/Gene canónico? | ¿Necesita relación transversal hoy? |
|---|---:|---:|---:|
| `ResolveActive` | Sí | No | No; filtra por `IntentType` |
| Activity Temporal Gravity | Sí, como adaptador | No | No; ni siquiera tiene invocador Workflow |
| Detectores de prioridad/threshold | Sí | No | No; sólo tests y análisis interno de Posturas |
| Mandate Execution | No | No; usa Actions operacionales por nombre | No |
| Genesis scaffold | No | No; produce propuesta/scaffold | No |
| Brain `dis` parcial | No | Sí, con rutas/materialización pendientes | No |
| Paladin/Control | Diseño de Gravity, sin lector conjunto encontrado | Sin lector conjunto encontrado | No demostrada |

**[P]** La ausencia de consumidor no debe rellenarse inventando uno. Antes de diseñar una relación hace falta, como mínimo, un caso de lectura concreto que establezca:

- qué pregunta debe responder la proyección;
- si el punto de partida es Posture, Node, Domain o Gene;
- si la relación es declarada por un humano o inferida;
- qué significa una relación ante merge/split de Domains;
- si se requiere consistencia fuerte, eventual o sólo visual;
- quién muestra y quién mantiene el resultado.

Ninguna de esas decisiones puede derivarse honestamente del código actual.

---

## 7. Alternativas contingentes si aparece una necesidad real

Las siguientes alternativas no son propuestas para implementar ahora. Se conservan para hacer explícitos sus costos y evitar que una futura urgencia convierta una proyección en fusión accidental.

### 7.1 Opción A — referencia opcional dentro de `GravityPosture`

Shape ilustrativo, no ratificado:

```json
{
  "relatesTo": {
    "domainIds": ["dom_auth_a1b2"],
    "geneIds": ["gene-uuid-1"]
  }
}
```

**Qué gana:**

- lectura directa Posture→Domain/Gene sin join externo;
- la intención explícita de quien postula puede viajar con la Postura;
- una UI puede presentar la relación con una sola lectura de Gravity.

**Qué se rompe o degrada:**

- Gravity pasa a persistir referencias a identidades cuyo ciclo de vida no gobierna;
- un `domain_id` puede retirarse por merge/split sin tombstone ni redirección;
- la lectura de Gravity sola no puede distinguir referencia válida, retirada o aún no materializada sin consultar el índice;
- duplicaría dentro de Gravity una relación que podría ser únicamente de presentación;
- obliga a definir si la relación forma parte del criterio firmado, de metadata mutable o de ambos, una decisión de autoridad que hoy no existe;
- incluir una relación inferida semánticamente dentro de una Postura ratificada podría hacerla parecer autorizada por Gravity cuando sólo fue calculada por otro sistema.

**Responsable de actualización:** tendría que existir un componente externo a Gravity que observe cambios `dis`, encuentre todas las Posturas afectadas y las migre o marque. Si Gravity “no valida” los IDs, las referencias obsoletas serían esperables; si las valida, Gravity queda acoplado al Índice Semántico. En ambos casos el supuesto bajo costo del campo desaparece.

**Evaluación:** no recomendable sin un caso donde la relación sea parte inequívoca y firmada del significado de la Postura, no sólo una conveniencia de consulta.

### 7.2 Opción B — tabla o índice de relación independiente

Shape ilustrativo, no ratificado:

```text
posture_id ↔ domain_id
posture_id ↔ gene_id
gravity_node_id ↔ domain_id
```

La estructura viviría fuera de `.gravity/**` y fuera de `.cache/.semantic-index.json`.

**Qué gana:**

- preserva el ownership de ambos sistemas;
- admite relaciones N:M, metadata de procedencia y distintos métodos de asociación;
- puede reconstruirse sin reescribir Posturas ni el índice canónico;
- hace visible que la relación es una tercera proyección, no parte constitutiva de ninguno de los dos grafos.

**Qué se rompe o degrada:**

- crea una cuarta estructura durable además de GravityGraph, Índice Semántico y Genesis operacional;
- introduce consistencia, versionado, locking, recuperación y garbage collection propios;
- requiere política ante renames, merges, splits, promoción/supersession de Posturas y retiro de nodos;
- puede convertirse por inercia en otra “fuente de verdad” si no se define su carácter derivado;
- aumenta el costo operacional antes de que exista una query real que lo justifique.

**Responsable de actualización:** el dueño natural sería el consumidor que necesita cruzar ambos planos o un servicio de proyección explícitamente designado. No debería ser Gravity ni `ing`/`dis` por defecto. Tendría que escuchar o reconciliar cambios de ambos lados y conservar procedencia suficiente para reconstruirse.

**Evaluación:** válida si aparecen varios consumidores, queries frecuentes, relaciones humanas durables o necesidad de auditar cómo se estableció cada vínculo. Prematura hoy.

### 7.3 Opción C — resolución en tiempo de lectura por el consumidor

El consumidor carga por separado:

```text
GravityGraph                         Índice Semántico
.gravity/**/node.json               .cache/.semantic-index.json
        │                                      │
        └──────── proyección de lectura ───────┘
                         │
                   Paladin / Control
```

No se escribe ninguna arista transversal. La UI o servicio compone una vista usando claves que ya existan en el contexto, por ejemplo el `MandateID` de un nodo Gravity y `mandates[]` del Domain, y sólo muestra Genes después de resolverlos desde el índice y sus fuentes canónicas.

**Qué gana:**

- cero acoplamiento durable entre los dos sistemas;
- no convierte una inferencia o agrupación visual en criterio ratificado;
- los cambios Domain por `dis` se reflejan en la siguiente lectura;
- permite experimentar con queries reales antes de diseñar un contrato persistente;
- el consumidor puede etiquetar claramente la procedencia de cada elemento y mantener separados los planos visuales.

**Qué se rompe o degrada:**

- la proyección no constituye historia durable por sí misma;
- puede ser costosa si los datasets crecen y no hay cache derivado;
- distintos consumidores podrían producir vistas distintas si no comparten reglas de composición;
- sólo permite joins respaldados por datos existentes. Por ejemplo, `mandates[]` puede acercar Domain↔Mandate, pero no prueba que una Postura específica “trate sobre” ese Domain;
- si se infiere relación por similitud semántica, debe presentarse como inferencia con score/procedencia, nunca como autorización de Gravity.

**Responsable de actualización:** el consumidor. No mantiene una copia canónica; relee, cachea de forma descartable y vuelve a resolver cuando cambian las versiones/fuentes.

**Evaluación:** primera opción a probar cuando exista un consumidor concreto, porque pospone decisiones durables hasta observar queries y fallos reales. No debe implementarse por anticipado.

---

## 8. Comparación resumida

| Criterio | A. Campo en Posture | B. Índice independiente | C. Join en lectura |
|---|---|---|---|
| Modifica Gravity | Sí | No | No |
| Modifica Índice Semántico | No | No | No |
| Nueva persistencia transversal | Dentro de Gravity | Sí, explícita | No |
| Riesgo de referencia obsoleta | Alto ante merge/split | Gestionable, pero exige reconciliación | Bajo; relee estado actual |
| Preserva separación de autoridades | Parcial | Sí, si se declara derivado | Sí |
| Sirve sin consumidor actual | No | No | No |
| Costo inicial | Aparentemente bajo, realmente contractual | Alto | Bajo cuando exista la UI/query |
| Cuándo tendría sentido | Relación firmada e intrínseca a la Postura | Varios consumidores o auditoría durable | Primera necesidad concreta de proyección |

---

## 9. Recomendación

**[P] No implementar ni ratificar ninguna relación transversal ahora.**

En particular:

- no agregar `relatesTo`, `domainId` ni `geneId` a `GravityPosture`;
- no cambiar la semántica de `appliesTo[]`;
- no agregar `DOMAIN`, `GENE` ni `POSTULATE` como `NodeType`;
- no crear una tabla de enlaces preventivamente;
- no tratar IDs de `domain_proposal.json` como Domains canónicos;
- no presentar una coincidencia semántica inferida como Postura autorizada por Gravity.

**[P] Criterio para reabrir:** reabrir esta decisión sólo cuando exista al menos un consumidor identificable con una query imposible de resolver adecuadamente manteniendo las fuentes separadas. Ese consumidor debe aportar ejemplos de entrada/salida y requerimientos de frescura, historial y autoridad.

**[P] Secuencia recomendada cuando ocurra:**

1. Implementar conceptualmente la composición como lectura del consumidor, sin persistencia transversal.
2. Medir qué relaciones necesita realmente y cuáles pueden derivarse de `MandateID`, `domains[].mandates[]`, `genes[]` y la procedencia Gravity existente.
3. Etiquetar toda inferencia con fuente y naturaleza no autoritativa.
4. Sólo si la recomputación pierde historia necesaria o varios consumidores requieren el mismo vínculo durable, evaluar un índice externo derivado.
5. Considerar un campo en Posture únicamente si José decide que esa relación forma parte del contenido autorizado y firmado de la Postura.

La opción C es, por lo tanto, una **preferencia contingente para el primer consumidor**, no una tarea pendiente ni una autorización para implementarla ahora.

---

## 10. Gaps registrados

**[G.1] No existe consumidor productivo de `ResolveActiveGravityActivity`.** Está registrada y testeada, pero ningún Workflow la ejecuta. Antes de agregarle contexto semántico debe existir el Agent Loop o consumidor de Posturas al que sirve.

**[G.2] Genesis no materializa todavía Domains/Genes canónicos.** Sus IDs y scaffolds operacionales no deben utilizarse como sustitutos de `.cache/.semantic-index.json` y `.mandates/{mandate}/.genes/{gene}/`.

**[G.3] Brain `dis` no tiene resuelta la ubicación Nucleus-level E2E.** Puede producir snapshots vacíos con warnings; no demuestra una integración semántica lista para ser cruzada con Gravity.

**[G.4] La futura vista de grafo de Paladin carece de contrato de datos.** La documentación reconoce la vista, pero no define su interior, queries, ownership ni si debe mostrar el Índice Semántico junto con GravityGraph.

**[G.5] No hay semántica ratificada de vínculo Posture↔Domain/Gene.** “Relacionada con” podría significar territorio del Mandate, contenido textual de la Postura, evidencia que la originó, alcance de aplicación o simple agrupación visual. Esas relaciones no son equivalentes y no deben comprimirse en un campo genérico.

Estos gaps no bloquean ningún consumidor actual encontrado y no constituyen por sí mismos un mandato de implementación.

---

## 11. Cierre

La investigación confirma el boundary del audit anterior y resuelve su pregunta pendiente para el estado actual del repositorio:

> GravityGraph no necesita hoy conocer Domains ni Genes. No hay un consumidor real que lo exija, `appliesTo[]` tiene otra semántica, la resolución Gravity aún no está invocada por Workflows y el plano Domain/Gene canónico tampoco está materializado E2E por Genesis.

La decisión prudente no es escoger preventivamente una estructura de enlace, sino **no crearla todavía**. Cuando una superficie real necesite mostrar ambos planos, debe empezar componiéndolos en lectura y preservando procedencia y autoridad separadas. Sólo la evidencia de uso podrá justificar después una proyección durable.

Esta investigación no implementa cambios de modelo, índice, workflow ni UI.
