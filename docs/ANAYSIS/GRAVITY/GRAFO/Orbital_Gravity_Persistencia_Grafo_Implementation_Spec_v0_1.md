# Orbital · Gravity — Persistencia del Grafo de Gravedad y Algoritmo de Recorrido

## Especificación de Implementación v0.1 — de modelo de datos a sistema real

**Tipo:** Especificación de implementación — lleva `Orbital_Gravity_Implementation_Spec_v0_1.md` §1–§2 a nivel de código y persistencia real
**Estado:** Borrador v0.1 — normativo para implementación, no reabre decisiones ya cerradas fuera de las contradicciones señaladas en §0.2
**Fecha:** 2026-08-29
**Dominio:** Orbital · Gravity · Nucleus · Persistencia
**Fuente que este documento extiende:** `Orbital_Gravity_Implementation_Spec_v0_1.md` (**Impl**), exclusivamente §1 (modelo de persistencia) y §2 (resolución por turno) — **Impl §3–§5 (arbitraje y fuera de alcance) no se tocan**
**Depende de, sin reabrir:** `BLOOM_Mandate_Universal_Schema_v1_0_0`–`v1_2_0.md` (**Mandate**), `BTIPS_Mandates_Agenticos_Spec_Unificada.md` §8 (**BTIPS**), `Orbital — Fundamentos de Coordinación, Gravity e Interacción Gobernada.md` (**Orb**), `Corolario — La persona como fuente de Gravity.md` (**Cor**), `Paladin_UX_Postura_Gravity_Masa_Spec_v0_1.md` §4 (**Paladin-UX**)
**Insumo de auditoría usado como evidencia de estado real:** `NUCLEUS_API_Contracts_Auditoria_vs_Truth_v0_1.md` (**Audit**) y `NUCLEUS_API_Contracts_Consolidado_v0_1.md` (**API**)
**Decisión de gobernanza externa incorporada como dato de entrada, no revisada por este documento:** investigación `AUTH-OWNERSHIP-01` (cerrada) — Master puede firmar `PROJECT` como camino interino contractualmente válido, mientras el rol Architect no esté formalizado en el modelo de autorización vigente.

---

## 0. Encuadre

### 0.1 Qué resuelve este documento y qué no

`Impl` fijó el modelo de datos del Grafo de Gravedad (tipos de nodo, tipos de arista, promoción, algoritmo de resolución) pero dejó explícitamente sin decidir, en su §5: *"la tecnología concreta de persistencia del grafo (...) no se decide aquí — este documento fija el modelo de datos, no la implementación física"* y *"el mecanismo exacto de firma para `PROJECT` (...) no se especifica"*. Este documento cierra exactamente esas dos deudas, más las tres consecuencias de implementación que se derivan directamente de ellas: el algoritmo de inyección turno a turno a nivel de código real (incluyendo caché e invalidación), la separación de artefactos de persistencia, y el cálculo eficiente de Masa.

No reabre: el modelo de nodos y aristas de `Impl §1`, el algoritmo conceptual de `Impl §2.1`, el mecanismo de arbitraje de `Impl §3`, la herencia de `gravityRules[]` de `Mandate v1.2.0`, ni la gramática formal de `gravityRules[].expression`. Donde este documento extiende un schema ya fijado, la extensión se señala explícitamente como tal (§7) — nunca se presenta como si ya hubiera estado ahí.

### 0.2 Confirmación de estado real — esto es diseño desde cero, no migración

**No existe hoy ningún Grafo de Gravedad real que preservar, migrar o respetar como estado previo.** `Audit` (Hallazgo mayor #1) confirma, por lectura completa de `bloom_nucleus_truth.txt` y `bloom_project_truth.txt` — la fuente de verdad homologada contra la primera iteración real de Mandate Genesis — que la estructura que `Impl §1`–`§2` describe **no aparece en ningún lugar de ninguno de los dos árboles**: ni como directorio placeholder, ni como campo de `mandate_state.json`, ni mencionada en ninguna nota de alcance. Es, en palabras de `Audit`: *"diseño, no código"*.

Esto cambia el tipo de pregunta que este documento responde. No es *"¿cómo evoluciono un formato en producción sin romper a sus consumidores?"* — no hay consumidores, no hay formato en producción, no hay compatibilidad hacia atrás que preservar. Es *"¿qué tecnología de persistencia es la correcta para este patrón de acceso, decidiendo desde cero?"*. Cada decisión de §2 y cada extensión de schema de §7 se toma bajo esa libertad — y se señala explícitamente cuando esa libertad es la que hace posible una decisión que, en presencia de estado real, habría exigido una migración.

Esta libertad tiene un límite: no aplica al resto del sistema. `mandate_state.json` sí tiene estado real (`Audit` Hallazgo #2), y el modelo de autorización vigente sí tiene un comportamiento real que este documento debe respetar, no redefinir (§6).

### 0.3 Contradicción encontrada — y por qué no es una reapertura de decisión cerrada

`Impl §1.3` asume, para la firma del nivel `PROJECT`: *"Humano con autoridad de proyecto (Architect/Master, según roles ya definidos en BTIPS)"*. `Audit` (Hallazgo mayor #3) confirma contra la fuente de verdad real que **Architect no existe en el modelo de autorización vigente** (`bloom_nucleus_truth.txt`: *"Architect y Grant no existen en el modelo vigente"*), y que esto ya estaba registrado como contradicción abierta en `CONTROL/AGENDA_MAESTRA.md`. `Impl §5` ya admitía que este mecanismo *"no se especifica"* — no es una decisión cerrada, es un hueco declarado. Este documento lo cierra (§6) usando el camino interino ya resuelto por `AUTH-OWNERSHIP-01`: Master firma `PROJECT` hoy, con el schema preparado para que Architect entre sin migración si se formaliza. Esto no reabre nada — completa exactamente el hueco que `Impl` dejó nombrado y sin resolver.

---

## 1. Cierre de vocabulario — tres estructuras, un nombre cada una

### 1.1 El problema, tal como lo confirma `Audit`

`Audit` (Hallazgo mayor #1) identifica que, hoy, conviven bajo vocabulario compartido ("grafo", "topología", "árbol") tres estructuras sin relación de diseño entre sí:

| | Estructura A | Estructura B (este documento) | Estructura C |
|---|---|---|---|
| **Qué modela** | Topología semántica del código: qué Dominios y Genes existen y cómo se relacionan | Criterio de gobierno heredado en 5 niveles: `NUCLEUS→ORGANIZATION→PROJECT→MANDATE→SESSION` | Jerarquía padre/hijo de Mandates delegados (`max_depth: 2`) |
| **Persistencia real hoy** | `.cache/.semantic-index.json` — `[IMPLEMENTADO vacío]`, wiring de Genesis pendiente; copias locales `.domain_graph_snapshot.json`/`.domain_graph_delta.json` por intent `dis` | **Ninguna** (§0.2) | **Ninguna** |
| **Quién lo produce** | Intents `ing`/`dis` (Brain) | Nadie — es diseño | Nadie — es diseño |
| **Origen documental** | `Mandate_Domain_Spec_v1.0.0.md`, `BTIPS_GENES_CONCEPT_v2_0.md` | `Impl §1`, este documento | `Mandate v1.2.0`, `BTIPS §8.2.3` patrón 3 |

`Audit` ya señala la corrección mínima: *"`GravityNode`/`GravityGraph` ya evita colisión de nombre de tipo, pero la prosa (...) dice 'el grafo' a secas en varios lugares"*. Este documento extiende esa corrección a las tres estructuras, no solo a dos, porque "árbol" tiene la misma colisión que "grafo": la Estructura C también se describe habitualmente como "árbol de delegación" sin calificar, y ese término compite por el mismo espacio semántico que cualquier prosa nueva sobre el Grafo de Gravedad (que, estructuralmente, también es mayormente un árbol — `Impl §1.2`: *"esto es un árbol, no un grafo arbitrario, con una única excepción funcional"*).

### 1.2 Convención adoptada — aplicada de forma consistente en todo este documento

| Estructura | Nombre canónico obligatorio en prosa | Nombre de tipo (sin cambios) | Nunca se escribe |
|---|---|---|---|
| A | **Índice Semántico de Dominios/Genes** | — (no tiene tipos formales todavía) | "el grafo", "el índice", "la topología" a secas |
| B | **Grafo de Gravedad** | `GravityNode` / `GravityGraph` (ya fijados en `Impl §1.2`, sin cambio) | "el grafo", "la jerarquía Gravity" sin calificar |
| C | **Árbol de Delegación de Sub-Mandates** | — (`DELEGATES_TO`, ya fijado) | "el árbol", "la delegación" a secas |

Regla de aplicación: cualquier mención a cualquiera de las tres estructuras en este documento —y, se recomienda, en todo documento futuro de la familia Gravity— usa el nombre canónico completo la primera vez que aparece en cada sección, y puede abreviarse dentro de esa misma sección solo si no hay otra estructura mencionada en el mismo párrafo. Este documento se autoaplica esta regla de aquí en adelante: toda referencia a la Estructura B se escribe "Grafo de Gravedad", nunca "el grafo".

Esta convención no renombra ningún campo ya fijado (`GravityNode`, `gravityRules[]`, `DELEGATES_TO` permanecen sin cambio) — es una disciplina de prosa, no una decisión de schema, exactamente como la nota de terminología "posture"/"postular" que `API §0` ya adoptó para el mismo tipo de problema (vocabulario ambiguo sobre un campo ya fijado, sin tocar el campo).

---

## 2. Modelo de persistencia del Grafo de Gravedad

### 2.1 El patrón de acceso real que gobierna esta decisión

Antes de comparar tecnologías, el patrón de acceso concreto que domina el diseño:

1. **La operación caliente es `resolve_active_gravity(session_id)`** (`Impl §2.1`), invocada en el punto de verificación de cada intent propuesto (`validate_and_sign`, `BTIPS §8.3`) — es decir, **una vez por turno**, y un Mandate agéntico puede correr miles de turnos a lo largo de su ciclo de vida (`BTIPS §8.0`: un Mandate agéntico "puede proponer cientos de turnos"; con sub-Mandates y reanudaciones, la cuenta agregada por Mandate raíz escala más allá de eso).
2. **La forma de esa operación es un recorrido ascendente de profundidad acotada**, no un recorrido de grafo general: `SESSION → MANDATE → [SUB-MANDATE]×{0,2} → PROJECT → ORGANIZATION → NUCLEUS`. Con `max_depth: 2` ya fijado para la Estructura C (`Mandate v1.2.0 §2.1` R-20), el camino más largo posible tiene **7 nodos / 6 aristas** — nunca crece, porque `max_depth` es un límite infranqueable ya cerrado, no una decisión de este documento.
3. **No hay necesidad de análisis de grafo general** — ni caminos más cortos, ni detección de comunidades, ni queries de patrón multi-salto. `Impl §2.1` ya lo confirma: el recorrido es un `walk_up` de un solo sentido. El único otro acceso no trivial es la resolución de la autoridad común más cercana para arbitraje (`INVARIANT-ARB-002`), y ese mecanismo queda fuera de alcance de este documento (§8).
4. **El patrón es extremadamente asimétrico en lectura/escritura.** Las escrituras (postular una postura, firmar un nodo, promover una regla, superseder un nodo) son actos humanos deliberados y explícitos (`Orb` Principio XI: *"la persistencia debe ser deliberada"*) — órdenes de magnitud menos frecuentes que los miles de turnos que solo leen.
5. **La lectura ocurre dentro del límite de latencia de un turno agéntico** — cualquier I/O de red no trivial en este punto se paga miles de veces por Mandate.
6. **Cualquier lectura debe ejecutarse dentro de una Activity de Temporal**, nunca directamente en código de Workflow (§3.4) — esto es una restricción dura, independiente de qué motor de persistencia se elija.
7. **La consistencia de una sola fuente de verdad por artefacto ya es un principio rector explícito del sistema**, no una preferencia de este documento: una de las `gravityRules[]` de ejemplo citadas en `Orb §15` es literalmente *"no introducir segunda fuente de verdad"*, y todo el resto de Nucleus (`.bloom/`, `mandate_state.json`, `.core/*.bl`) persiste como filesystem local, auditable y diffable.

### 2.2 Evaluación de las tres alternativas

| Criterio | Motor de grafo dedicado (ej. engine tipo Neo4j) | Modelado relacional (tablas `nodes`/`edges`, embebido o servidor) | Filesystem extendido (línea de `.bloom/`) |
|---|---|---|---|
| Ajuste a la forma real del acceso (§2.1.2–3) | Sobredimensionado — resuelve queries de grafo general que este patrón nunca necesita | Ajuste razonable — un `walk_up` acotado es trivial con `parentId` indexado o una CTE recursiva | Ajuste natural — una jerarquía acotada en profundidad se recorre por nesting de directorios sin motor de consulta |
| Footprint operativo nuevo | Alto — un servicio nuevo, con su propio ciclo de vida, backup y observabilidad | Medio-alto si es servidor; bajo si es embebido (ej. SQLite) | Ninguno — es exactamente el mismo modelo operativo que ya sostiene `mandate_state.json` y `.core/*.bl` |
| Consistencia con "no introducir segunda fuente de verdad" (§2.1.7) | Viola el principio — un motor de grafo separado es, por definición, una segunda fuente de verdad de infraestructura junto a `.bloom/` | Igual violación si es servidor externo; se atenúa si es embebido, pero sigue siendo un formato de almacenamiento distinto al resto de Nucleus | Cumple exactamente — mismo formato (JSON en filesystem), mismo mecanismo de sustitución atómica que ya usa `mandate_state.json` (`Audit` Hallazgo #2: `stateVersion` monotónica, "misma sustitución atómica") |
| Auditabilidad / trazabilidad como valor de diseño (`Orb` Principio XV) | Requiere exportar para diffear o auditar fuera del motor | Requiere una consulta o dump para inspección humana directa | Diffable y greppable directamente, sin herramienta adicional — coherente con cómo ya se audita el resto de `.bloom/` |
| Complejidad de la frontera con determinismo de Temporal (§3.4) | Alta — cliente de red dentro de una Activity, con sus propios timeouts y reintentos a modelar | Media — cliente de DB dentro de una Activity | Baja — lectura de archivo local dentro de una Activity, sin dependencia de red |
| Soporte para la única excepción estructural (Estructura C, DAG acotado) | Nativo, pero no aporta ventaja real dado que la profundidad ya está acotada en 2 | Modelable con una tabla de aristas adicional | Modelable con un subdirectorio adicional por nivel de delegación — mismo mecanismo que el resto del árbol de directorios físico |
| Costo de la capa de caché necesaria (§3) | Igual en las tres — la caché vive por encima del motor de persistencia, no la resuelve el motor | Igual | Igual |

### 2.3 Decisión: filesystem extendido, en la línea de `.bloom/`

Se descarta un motor de grafo dedicado: el patrón de acceso real (§2.1) nunca ejercita las capacidades que justifican ese tipo de motor — no hay queries de patrón, no hay análisis de conectividad, la profundidad ya está acotada por decisiones ya cerradas (`max_depth: 2`). Elegirlo introduciría exactamente la segunda fuente de verdad de infraestructura que `Orb §15` ya cita como regla de ejemplo a evitar, y una superficie operativa nueva (backup, disponibilidad, observabilidad de un servicio adicional) sin una necesidad real que la justifique.

Se descarta también el modelado relacional, aunque con menos margen: un motor relacional embebido resolvería el `walk_up` con eficiencia sobrada. Pero el patrón de acceso no se beneficia de ninguna de las ventajas específicas de lo relacional (transacciones multi-fila complejas, joins arbitrarios, consultas ad-hoc) — la única consulta caliente es un recorrido de padres acotado a 6 saltos, que un filesystem con `parentId` embebido resuelve igual de rápido sin introducir un segundo formato de persistencia junto al resto de Nucleus.

**Se decide: filesystem extendido**, exactamente en la línea que `Impl §5` ya señalaba como opción ("en la línea de cómo ya vive `.bloom/`") y que el resto de Nucleus ya usa sin excepción para su propio estado real (`mandate_state.json`, `.core/*.bl`, `.intents/`). Esto es consistente con el principio de una sola fuente de verdad por artefacto, no introduce infraestructura nueva, y es directamente auditable con las mismas herramientas (`grep`, `diff`, control de versiones) que ya se usan sobre el resto del árbol de Nucleus.

### 2.4 Layout físico

```text
.bloom/
└── .nucleus-{organization}/
    └── .gravity/
        ├── nucleus.node.json                              # singleton, sin parentId
        ├── .organization/{orgId}/
        │   ├── node.json
        │   └── .project/{projectId}/
        │       ├── node.json
        │       └── .mandate/{mandateId}/
        │           ├── node.json
        │           ├── .submandate/{subMandateId}/        # Estructura C — max_depth: 2
        │           │   ├── node.json
        │           │   └── .submandate/{subSubMandateId}/
        │           │       └── node.json
        │           └── .session/{sessionId}/
        │               └── node.json                      # efímero — ver nota abajo
        ├── .edges/
        │   └── arbitration_events.log.jsonl               # append-only — persistencia de Impl §3.4,
        │                                                   #   layout de referencia, mecanismo fuera de alcance (§8)
        └── .index/                                         # deliberadamente vacío en v0.1 — ver nota
```

**Por qué no hay un archivo de aristas `PROMOTED_FROM`:** la arista de promoción se denormaliza directamente en la posture de destino (§5.3) en vez de vivir como log separado — la justificación completa está en §5, porque es al mismo tiempo una decisión de persistencia y una decisión de cómputo eficiente de Masa.

**`PARENT_OF` no se persiste como arista aparte:** el nesting de directorios ya lo codifica físicamente. `parentId` se mantiene en `node.json` como en `Impl §1.2`, de forma redundante mas no contradictoria con la ruta física — sirve como chequeo de integridad defensivo (Nucleus puede validar `node.json.parentId == id del directorio padre` al leer) y como valor portable si algún día un nodo se referencia sin su ruta completa.

**Nota sobre `.session/`:** los nodos `SESSION` son efímeros por diseño (`Impl §1.2`). Su archivo físico puede recolectarse (garbage-collect) una vez que el Mandate al que pertenecen cierra (`status: completed | aborted | exhausted`) sin pérdida de trazabilidad: el efecto histórico de cada Session Gravity que participó de un turno ya quedó preservado, inmutable, en el snapshot por turno de `gravity_context_injected` dentro de `orbital_agentic_state.json` (§4), que es justamente el mecanismo que `Paladin-UX §2.4` cita para el mismo propósito del lado de interfaz (*"Cada turno conserva su propio breadcrumb tal como se resolvió en ese momento"*). El nodo físico es el estado vivo; el turno persistido es la evidencia histórica — perder el primero después de cerrado el Mandate no borra la segunda.

**Nota sobre `.index/`:** se declara la carpeta como reservada, deliberadamente vacía. `Mandate v1.2.0 §6` ya difirió explícitamente una herramienta de auditoría inversa análoga ("dado un `sourceMandateId`, listar todos los sub-Mandates que heredaron una regla específica") calificándola de *"tooling, no schema"*. Este documento aplica el mismo criterio a cualquier índice secundario sobre el Grafo de Gravedad completo: la única indexación que este documento sí especifica es la necesaria para el patrón de acceso caliente de §2.1 (la caché de §3), no un índice general de consulta.

**Consistencia de escritura:** toda escritura de `node.json` sigue el mismo mecanismo de sustitución atómica (escribir a temporal, `rename` atómico) que ya usa `mandate_state.json` real para su campo `stateVersion` monotónico (`Audit` Hallazgo #2) — no se inventa un modelo de consistencia nuevo donde ya existe uno probado en este mismo sistema. Nucleus permanece como único escritor de cualquier `node.json` bajo `.gravity/`, consistente con la invariante rectora ya fijada ("la autoridad nunca se distribuye, aunque el acceso sí", `BTIPS §8.0`) — ningún Agent Loop escribe directamente bajo `.gravity/`, exactamente como ya ocurre con `forbidden_paths` y el resto de la infraestructura de Nucleus (`BTIPS §8.2`).

---

## 3. Algoritmo de inyección turno a turno — nivel de implementación

### 3.1 Extensión del pseudocódigo de `Impl §2.1`

`Impl §2.1` fija el algoritmo conceptual. Llevado a nivel de implementación real, con la frontera de Activity de Temporal explícita:

```text
# Ejecuta DENTRO de una Activity de Temporal — nunca en código de Workflow (§3.4)
ACTIVITY resolveActiveGravityActivity(mandate_id, session_id, current_turn_intent_type, cache):

    # Paso 1 — resolver la espina estructural (NUCLEUS..MANDATE, incl. Estructura C si aplica)
    IF cache.spine IS valid_for(mandate_id):
        spine ← cache.spine                              # sin I/O — ver §3.2
    ELSE:
        spine ← build_spine(mandate_id)                   # lee node.json subiendo por parentId,
        cache.spine ← spine                                #   máximo 5 lecturas (NUCLEUS..MANDATE + sub-Mandates)
        cache.spine_node_versions ← { nodeId: read_version(nodeId) for nodeId in spine }

    # Paso 2 — SESSION nunca se cachea entre turnos (ver §3.2, motivo)
    session_node ← read_node(session_id)                   # siempre lectura fresca, 1 archivo pequeño

    path ← spine + [session_node]                          # orden NUCLEUS primero, SESSION último — Impl §2.1

    # Paso 3 — lectura de contenido: siempre fresca, nunca cacheada entre turnos (ver §3.2)
    collected ← []
    for node_ref in path:
        node ← read_node(node_ref.nodeId)     # lectura local pequeña — nunca servida desde cache entre turnos

        for posture in node.gravityRules where posture.status == "active":
            if posture.appliesTo matches current_turn_intent_type:
                collected.append(posture tagged with node.nodeType, node.nodeId)

    return collected, cache   # cache solo actualiza/preserva cache.spine — ver §3.4
```

Este es el mismo contrato conceptual de `Impl §2.1` (mismo orden de recorrido, mismo criterio de filtrado por `appliesTo`), extendido únicamente con la mecánica de caché necesaria para que miles de turnos por Mandate no impliquen miles de recorridos completos del Grafo de Gravedad.

### 3.2 Qué se cachea, y qué deliberadamente no

> **Nota de corrección (2026-08-29):** la versión inicial de este documento proponía cachear también el *contenido* de `gravityRules[]` de cada nodo de la espina, con invalidación por versión. La implementación (ver §3.3) encontró que esa capa no tenía dónde persistir de forma coherente con §3.4.4 sin duplicar posturas dentro de `orbital_agentic_state.json` — exactamente la segunda fuente de verdad que `Orb §15` ya cita como error a evitar. Se retira esa capa de caché; el contenido se lee siempre fresco, y la justificación de por qué eso no tiene costo real queda en la fila siguiente.

| Elemento | ¿Se cachea entre turnos del mismo Mandate? | Motivo |
|---|---|---|
| **Espina estructural** (lista ordenada de `nodeId` desde `NUCLEUS` hasta `MANDATE`, incluyendo Estructura C si el Mandate es un sub-Mandate) | **Sí — una sola vez por Mandate, sin invalidación** | La cadena de ancestros de un Mandate es fija durante toda su ejecución: un Mandate no cambia de Project padre, un Project no cambia de Organization, en ningún punto de `Mandate v1.0.0`–`v1.2.0` ni de `Impl`. No es una caché que pueda quedar obsoleta — es un hecho estructural que no cambia mientras el Mandate existe. Recalcularla en cada turno sería trabajo repetido sin ningún cambio posible de resultado. |
| **Contenido de `gravityRules[]` de cada nodo de la espina** (`ORGANIZATION`, `PROJECT`, `MANDATE`, sub-Mandates) | **No — se relee siempre, ver §3.3** | La lectura es de un archivo local pequeño (§2.3 ya justifica la elección de filesystem exactamente por esto: sin motor de grafo dedicado ni red de por medio, leer 4–6 archivos `node.json` por turno es órdenes de magnitud más barato que la propia llamada al modelo dentro de `propose_next_action`). Cachear este contenido exigiría persistirlo en algún artefacto para sobrevivir un replay (§3.4.4) — y persistirlo en `orbital_agentic_state.json` crearía una copia de las posturas paralela a `.bloom/.gravity/`, la segunda fuente de verdad que el propio sistema ya prohíbe (`Orb §15`, regla de ejemplo *"no introducir segunda fuente de verdad"*). El costo de no cachearlo es, en la práctica, nulo; el costo de cachearlo mal sería una inconsistencia real. |
| **Contenido de `gravityRules[]` del nodo `SESSION`** | **Nunca — siempre lectura fresca** | Session Gravity se captura en vivo, durante la conversación, sin firma formal previa (`Impl §1.3`, `Paladin-UX §1.3`) — es, por diseño, el único nivel donde una nueva postura puede aparecer en cualquier turno sin ningún evento de mutación formal que dispare una invalidación. Mismo tratamiento que el resto del contenido (fila anterior), reforzado acá porque cachear Session Gravity sí sería un error activo, no solo una optimización innecesaria: serviría Gravity de sesión obsoleta al agente en el mismo turno en que el ingeniero acaba de postular algo nuevo. |

### 3.3 Por qué `nodeVersion` no gatilla una relectura selectiva — y para qué sirve en cambio

Con la corrección de §3.2, `nodeVersion` (extensión de schema, §7) deja de ser el mecanismo de invalidación de una caché de contenido que ya no existe. Su función en este diseño se acota a lo que realmente necesita, sin sobre-especificar un mecanismo que el patrón de acceso no justifica:

1. **Concurrencia segura en escritura, no invalidación en lectura.** `nodeVersion` sigue existiendo como entero monotónico, incrementado por Nucleus en cada escritura efectiva a `gravityRules[]` o a `status` — mismo patrón que `stateVersion` de `mandate_state.json` real (`Audit` Hallazgo #2). Su uso es en la escritura: Nucleus, como único escritor de cualquier `node.json` (§2.4), puede leer-verificar-escribir (`compare-and-swap` sobre `nodeVersion`) para detectar una colisión si dos operaciones de escritura sobre el mismo nodo (p. ej. una promoción y una supersesión) se solapan — no para decidir si el lector de un turno agéntico debe o no releer contenido, porque ese lector siempre relee (§3.2).
2. **La espina, en cambio, nunca necesita comprobación de versión** — no porque se verifique y coincida, sino porque no hay nada que verificar: la identidad de los nodos ancestros (§3.2, fila 1) no es información que pueda quedar desactualizada durante la vida del Mandate.
3. Esto simplifica también la garantía de replay (§3.4): lo único que la caché persistida necesita conservar entre turnos es la espina (una lista de `nodeId`, inmutable por diseño), no un contenido que podría requerir reconciliación en cada recuperación tras un crash.

### 3.4 Garantía de replay determinista de Temporal

La consulta al Grafo de Gravedad es I/O (lectura de filesystem) y por lo tanto no determinista desde la perspectiva de un Workflow de Temporal. La garantía no depende de la tecnología de persistencia elegida en §2 — depende exclusivamente de dónde se ejecuta esa I/O:

1. **`resolveActiveGravityActivity` (§3.1) se ejecuta siempre como Activity, nunca como código de Workflow.** Esta es la misma disciplina ya fijada para el resto del sistema — el propio `BTIPS §9.2.2` punto 3 ya estableció, para `resolveNextAction`, que debe ser una función pura para no mezclar una llamada no determinista con mutación de estado en el mismo punto: *"si esa misma función tuviera además efectos secundarios de escritura de estado, se mezclaría una llamada no-determinista con mutación de estado en el mismo punto, lo cual rompe la garantía de replay determinista que exige Temporal"*. Este documento aplica el mismo principio a la lectura del Grafo de Gravedad, no inventa uno nuevo.
2. **El resultado de la Activity, una vez ejecutada, queda grabado en el historial de eventos del Workflow de Temporal** (esto es semántica estándar de Activity de Temporal, no un mecanismo adicional que este documento deba diseñar). Durante un replay, Temporal no vuelve a ejecutar la Activity — reutiliza el resultado ya grabado en el historial. Esto es lo que hace segura la I/O no determinista dentro de un Workflow: la no determinismo ocurre una sola vez, en la ejecución original, y el replay es determinista porque re-lee un resultado fijo, no porque la lectura de filesystem en sí sea determinista.
3. **Secuencia dentro del turno, preservando la pureza ya fijada para `resolveNextAction` (`BTIPS §9.2.2` punto 3):** `resolveActiveGravityActivity` se invoca *antes* de `propose_next_action`, como parte de ensamblar el contexto (`orbital_agentic_state`, seam, `last_result`) que ya recibe el agente según el diagrama de `BTIPS §8.3`. `propose_next_action` sigue siendo una función pura que solo lee ese contexto ya ensamblado — no adquiere una responsabilidad nueva de leer el Grafo de Gravedad por su cuenta. El avance de estado (incluyendo la actualización de la caché de §3.2–§3.3) ocurre en `persistTurn`, exactamente el mismo punto donde ya ocurre el avance de `cursor` (`BTIPS §9.2.2` punto 3) — no se introduce un segundo punto de mutación de estado.
4. **La caché de §3.2 no compromete esta garantía porque vive en datos de Workflow/estado persistido (`orbital_agentic_state.json`, §4), no en memoria de proceso.** Si el Workflow se recupera tras un crash (la misma garantía de recovery granular por turno que ya tiene cualquier Mandate, `BTIPS §8.3` punto 3), la caché se reconstruye leyendo el último `orbital_agentic_state.json` persistido — nunca de un estado en memoria que el replay no podría reproducir.

---

## 4. Separación de artefactos

Tres artefactos de persistencia distintos participan en la inyección de Gravity, y **no comparten archivo, schema ni ciclo de vida** — la misma disciplina que `Mandate v1.2.0 §3` y `Audit` (Hallazgo #2) ya fijaron para `mandate_state.json` vs. `orbital_agentic_state.json`, extendida ahora a un tercer artefacto:

| Artefacto | Qué contiene | Quién lo consume | Estado de implementación |
|---|---|---|---|
| **`mandate_state.json`** (real, sin cambios) | `stateVersion`, `signature.status`, `reconciliation` — el estado operacional real del Mandate declarativo (`Audit` Hallazgo #2) | `MandateGenesisBuildWorkflow`, watcher de reconciliación | Implementado. **Este documento no le agrega ni le quita ningún campo.** |
| **`orbital_agentic_state.json`** (contrato documental, extendido aquí) | `turns[]`, `budget_consumed`, `gravity_context_injected` por turno (ya fijados por `BTIPS §8.5` / `Mandate v1.2.0 §3` / `Impl §2.3`) **+ `gravity_resolution_cache`** (nuevo, ver abajo) | El propio Workflow de Temporal del Mandate, entre turnos | Sin implementación en código todavía (`Audit`); este documento no cambia ese estado, solo extiende su schema documental |
| **Grafo de Gravedad** (`.bloom/.gravity/`, nuevo — este documento) | `node.json` por nodo (`GravityNode`, extendido §7), `arbitration_events.log.jsonl` | `resolveActiveGravityActivity` (lectura); Nucleus como único escritor | No existe (§0.2) — este documento lo especifica por primera vez |

### 4.1 Extensión de `orbital_agentic_state.json` — campo `gravity_resolution_cache`

Único campo nuevo que este documento agrega a `orbital_agentic_state.json`, señalado explícitamente como extensión sobre lo ya fijado por `BTIPS §8.5` y `Mandate v1.2.0 §3`:

```jsonc
{
  "mandate_id": "mnd_8f2a1c",
  "status": "running",
  "turn_count": 431,
  "turns": [ /* ... sin cambios, Impl §2.3 / BTIPS §8.5 ... */ ],
  "budget_consumed": { /* ... sin cambios ... */ },

  // NUEVO — extensión de este documento, no existía en BTIPS §8.5 ni en Mandate v1.2.0 §3.
  // Contiene únicamente la espina (lista de nodeId, §3.2) — nunca contenido de gravityRules[],
  // ver nota de corrección en §3.2 sobre por qué esa segunda capa de caché se retiró.
  "gravity_resolution_cache": {
    "spine": ["nucleus_root", "org_9a1", "proj_44c", "mnd_8f2a1c"],
    "cached_at_turn": 1
  }
}
```

Este campo es una **aceleración, no una fuente de verdad**: si se pierde o se descarta, `resolveActiveGravityActivity` simplemente reconstruye la espina desde `.bloom/.gravity/` en la siguiente invocación (mismo costo que el primer turno). Nunca se lee como si fuera autoritativo sobre el estado real de ningún `GravityNode` — es exactamente el mismo estatus que `Paladin_Client_Object_Model_v0_1.md` ya define para las proyecciones read-only del lado de cliente: una copia que acelera, nunca una segunda fuente de verdad que compita con el Grafo de Gravedad real. A diferencia de la versión inicial de este documento, este campo no necesita ningún mecanismo de invalidación: una vez escrito, permanece válido durante toda la vida del Mandate (§3.2, §3.3).

**Por qué vive acá y no en `mandate_state.json`:** la pregunta que resuelve (§3.2, "qué se cachea entre turnos de un mismo Mandate") es, por construcción, una pregunta sobre la ejecución turno a turno del modo agéntico — el mismo dominio que ya justifica que `turns[]` y `budget_consumed` vivan en `orbital_agentic_state.json` y no en el estado operacional real. Agregarlo a `mandate_state.json` mezclaría un campo de aceleración de ejecución agéntica dentro de un artefacto orientado a firma y reconciliación (`Audit` Hallazgo #2) — exactamente la mezcla que la separación de artefactos ya aprobada existe para evitar.

---

## 5. Trazabilidad de Masa — cálculo eficiente con los tres factores cerrados

### 5.1 Los tres factores, tal como quedaron operacionalizados

`Paladin-UX §4.1` fija, sin inventar los otros cuatro del Corolario (autoridad, alcance, persistencia más allá de la promoción, contexto — explícitamente dejados sin campo computable):

| Factor de Cor | Campo ya definido | Fórmula (`Paladin-UX §4.2`) |
|---|---|---|
| Jerarquía del nivel de origen | `origin` (`Impl §2.2`) | `nivel_base(origin)`: sesión/mandate → 1, project → 2, organization/nucleus → 3 |
| Evidencia | `verifiable` | `+1` (tope 3) si `rule.verifiable == true` |
| Precedencia | arista `PROMOTED_FROM` con `toRuleId == rule.ruleId` | `+1` (tope 3) si existe |

Este documento no toca la fórmula — la implementa de forma eficiente.

### 5.2 El problema: calcular el tercer factor sin recorrer el grafo completo

Tal como está descrita en `Impl §1.5`, `PROMOTED_FROM` es una arista independiente del nodo. Calcular *"¿existe una arista `PROMOTED_FROM` con `toRuleId == rule.ruleId`?"* de forma ingenua exigiría, para cada postura devuelta por `resolve_active_gravity` en cada turno, una búsqueda sobre el conjunto completo de aristas de promoción del sistema — exactamente el recorrido completo del Grafo de Gravedad que el requerimiento del usuario prohíbe explícitamente ("sin recorrer el grafo completo en cada turno"), y que además contradice la misma disciplina de exposición mínima que ya rige el resto de la inyección (`Impl §2.4`, `API §3.1`: nunca se expone ni se recorre el grafo completo, solo lo resuelto para el turno).

### 5.3 Solución: denormalizar la arista en la propia postura

Se extiende cada elemento de `gravityRules[]` (cada postura) con un campo `promotedFrom` que refleja, en el propio objeto, si esa postura nació de una promoción — ver justificación de extensión en §7. La arista `PROMOTED_FROM` (`Impl §1.4–§1.5`) sigue existiendo como registro canónico de linaje completo (queda persistida en el layout de §2.4 con el mismo propósito de auditoría con el que `Impl §1.5` la definió); el campo nuevo es una copia de solo lectura, escrita por Nucleus en la misma operación atómica que crea la arista — nunca puede quedar desincronizada porque no hay dos actores que la escriban por separado.

```jsonc
// Elemento de governance.gravityRules[] en un node.json de nivel ORGANIZATION,
// para una regla que se originó como postura postulada en un Mandate y fue promovida
{
  "ruleId": "grv_org_0091",
  "primitive": "priority",
  "expression": "...",
  "appliesTo": ["mrg"],
  "status": "active",
  "verifiable": true,
  "promotable": false,
  "promotedTo": null,

  // NUEVO — extensión de este documento (§7). Denormalización de la arista
  // PROMOTED_FROM de Impl §1.5, escrita por Nucleus en el mismo acto que crea la arista.
  "promotedFrom": {
    "fromRuleId": "grv_0af4",
    "fromNodeId": "mnd_8f2a1c",
    "promotedVia": "cor",
    "occurredAt": "2026-09-15T10:00:00Z"
  }  // | null si la postura nunca se originó como promoción
}
```

Nótese que este campo es distinto de `promotedTo` (ya existente desde `Mandate v1.2.0`, R-21): `promotedTo` registra que *esta* postura fue promovida *hacia arriba*; `promotedFrom` registra que *esta* postura *nació* de una promoción desde abajo. Son las dos puntas de la misma arista, cada una denormalizada en el nodo que le corresponde — ninguna reemplaza a la otra.

### 5.4 Cómputo de Masa como función pura del objeto ya cargado

Con la denormalización de §5.3, el cálculo de Masa no requiere ningún acceso adicional al Grafo de Gravedad más allá de lo que `resolveActiveGravityActivity` (§3.1) ya cargó para resolver la Gravity activa de ese turno:

```text
FUNCTION compute_masa(posture):          # función pura — sin I/O, sin parámetros de grafo
    masa ← nivel_base(posture.origin)     # Paladin-UX §4.2, sin cambios
    if posture.verifiable == true:
        masa ← min(masa + 1, 3)
    if posture.promotedFrom != null:      # antes: recorrido de aristas — ahora: campo ya cargado
        masa ← min(masa + 1, 3)
    return masa
```

Esta función se invoca sobre cada elemento de `collected` que ya devuelve `resolveActiveGravityActivity` (§3.1) — cero lecturas adicionales, cero costo por encima de lo que la inyección de Gravity ya paga cada turno. Satisface exactamente la restricción de eficiencia pedida: los tres factores de Masa son computables sin recorrer el Grafo de Gravedad completo, porque los tres ya viajan embebidos en la postura que la resolución por turno carga de todas formas.

---

## 6. Firma del nivel `PROJECT` — Master hoy, Architect reservado en el schema

### 6.1 El vacío heredado

`Impl §1.3` asume, sin especificar mecanismo (`Impl §5` lo admite explícitamente), que `PROJECT` lo firma un *"Humano con autoridad de proyecto (Architect/Master, según roles ya definidos en BTIPS)"*. `Audit` (Hallazgo #3) confirma contra la fuente de verdad real que Architect no existe en el modelo de autorización vigente, y que la investigación `AUTH-OWNERSHIP-01` (cerrada, dato de entrada de este documento — no una decisión que este documento tome) resolvió el camino interino: **Master puede firmar `PROJECT`** mientras Architect no esté formalizado. Este documento diseña la firma de `PROJECT` sobre esa base, dejando el punto de entrada de Architect explícito en el schema sin bloquear el diseño a la espera de esa formalización futura — que es, en sí misma, una decisión de gobernanza fuera del alcance de este cowork (§8).

### 6.2 Diseño — `signedBy` pasa de string a objeto estructurado

`Impl §1.2` define `signedBy` como `"string — autoridad que firmó este nodo"`. Un string plano no puede expresar *bajo qué rol* se firmó ni *si ese rol es definitivo o interino para ese nivel* — exactamente la distinción que `AUTH-OWNERSHIP-01` introduce. Se extiende (ver justificación consolidada en §7):

```jsonc
"signedBy": {
  "actorId":   "string — identidad del humano u operador que firmó",
  "role":      "enum — master | specialist | architect",
  "roleBasis": "enum — role_native | role_interim"
  // role_interim: este rol firma este nivel como camino provisorio válido (AUTH-OWNERSHIP-01),
  //               no porque el modelo de autorización lo asigne nativamente a este nivel.
  // role_native:  el rol firma este nivel porque el modelo de autorización vigente lo asigna así.
}
```

Como no existe hoy ningún `GravityNode` real persistido (§0.2), este cambio de forma no requiere ninguna migración — es la ventaja concreta de diseñar sobre una pizarra en blanco que §0.2 señala.

### 6.3 Tabla de roles aceptados por nivel

| `nodeType` | Rol(es) aceptados hoy | `roleBasis` estampado hoy | Rol(es) aceptados si Architect se formaliza | `roleBasis` tras formalización |
|---|---|---|---|---|
| `NUCLEUS` | N/A — constitutivo, no se firma (`Impl §1.3`) | N/A | Sin cambio | N/A |
| `ORGANIZATION` | Operador humano vía `cor` (`Impl §1.3` — sin cambio, fuera de esta tabla) | `role_native` | Sin cambio | `role_native` |
| **`PROJECT`** | **`master`** (único aceptado hoy) | **`role_interim`** | `architect` pasa a aceptarse; `master` permanece como aceptado si ningún Architect está asignado a ese Proyecto | `architect` firma con `role_native`; `master` (si se usa) sigue estampando `role_interim` únicamente si sustituye a un Architect ausente |
| `MANDATE` | Quien firma el Mandate (`Mandate v1.1.0 §2`, sin cambio) | `role_native` | Sin cambio | `role_native` |
| `SESSION` | N/A — sin firma formal (`Impl §1.3`) | N/A | Sin cambio | N/A |

### 6.4 Regla de validación en Nucleus al firmar

Al firmar un nodo `PROJECT`, Nucleus valida `signedBy.role ∈ {"master"}` hoy (rechaza cualquier otro valor, incluido `"architect"`, con un `reason_code` nuevo del mismo estilo que la familia ya definida en `NUCLEUS_AUTHORIZATION_MODULE_DRAFT_v0_2.md §5` — p. ej. `ROLE_INSUFFICIENT_FOR_NODE_LEVEL`, consistente con `ROLE_INSUFFICIENT` ya registrado ahí para el mismo tipo de rechazo) y estampa `roleBasis: "role_interim"` automáticamente, sin que el firmante deba declararlo — el sistema, no el humano, es responsable de marcar que esa firma es un camino provisorio. Esto seguirla misma disciplina que ya cierra `AUTH-OWNERSHIP-01`: el módulo de autorización, no cada punto de firma individual, es la única fuente que decide qué roles son válidos para qué acción (`NUCLEUS_AUTHORIZATION_MODULE_DRAFT_v0_2.md §1`: *"Ningún componente implementa su propia lógica de autorización. Toda decisión pasa por un único punto en Nucleus"*).

### 6.5 Por qué no hace falta migración cuando Architect se formalice

Si en el futuro el modelo de autorización vigente incorpora Architect (decisión de gobernanza fuera de este cowork, §8), la validación de §6.4 simplemente amplía su conjunto aceptado a `{"master", "architect"}`, con `roleBasis` calculado según cuál de los dos firmó — ningún `node.json` ya firmado necesita reescribirse, porque `role` y `roleBasis` ya son campos explícitos desde el primer nodo `PROJECT` que se firme bajo este diseño. La formalización de Architect es un cambio en la regla de validación de Nucleus, no un cambio de schema ni una migración de datos.

---

## 7. Extensiones al schema `GravityNode` — resumen consolidado

Toda extensión sobre el schema ya fijado en `Impl §1.2` se señala aquí explícitamente, con la razón concreta por la que ese schema no alcanzaba:

| Campo nuevo | Dónde | Por qué `Impl §1.2` no alcanzaba |
|---|---|---|
| `nodeVersion: integer` | Nivel raíz de `GravityNode` | `Impl §1.2` no tenía ningún campo de versión monotónica. Sin él, Nucleus no tiene forma de detectar una colisión de escritura concurrente sobre el mismo nodo (p. ej. una promoción y una supersesión solapadas) antes de aplicar una sustitución atómica — mismo propósito de concurrencia segura que ya cumple `stateVersion` en `mandate_state.json` real (`Audit` Hallazgo #2). No gatilla ninguna invalidación de caché de lectura — esa capa se evaluó y se descartó, ver §3.2–§3.3. |
| `signedBy` — de `string` a objeto `{actorId, role, roleBasis}` | Nivel raíz de `GravityNode` | El `string` plano de `Impl §1.2` no puede expresar bajo qué rol se firmó un nodo ni si ese rol es definitivo o interino para ese nivel — exactamente la distinción que la resolución de `AUTH-OWNERSHIP-01` sobre `PROJECT` (§6) necesita para no bloquear el diseño a la espera de que Architect se formalice. |
| `promotedFrom: {fromRuleId, fromNodeId, promotedVia, occurredAt} \| null` | Cada elemento de `gravityRules[]` (dentro de cada `GravityNode`, no en la raíz) | `Impl §1.4–§1.5` modela la promoción exclusivamente como arista externa (`PROMOTED_FROM`). Calcular el tercer factor de Masa (`Paladin-UX §4.2`) contra una arista externa exige, en el caso ingenuo, recorrer el conjunto completo de aristas de promoción del sistema en cada turno — la denormalización en la propia postura reduce ese costo a una lectura de campo ya cargada (§5). |

Ningún campo ya existente (`nodeId`, `nodeType`, `parentId`, `gravityRules[]` como arreglo, `status`, `createdAt`) cambia de forma o de significado. Las tres extensiones son aditivas y, por §0.2, no requieren ninguna migración porque no existe ningún `GravityNode` real persistido hoy sobre el cual migrar.

---

## 8. Fuera de alcance de este documento

Siguiendo la misma disciplina que `Impl §5` y `Orb §34` aplican sobre sí mismos, y respetando exactamente los límites que el pedido de este cowork fijó:

- **El mecanismo de arbitraje entre Mandates en colisión** (`Impl §3` completo) — este documento solo reserva el espacio de persistencia de `ArbitrationEvent` en el layout de §2.4, por consistencia física del árbol de `.gravity/`, sin rediseñar cuándo se dispara, cómo se resuelve, ni su mecanismo de notificación (ya marcado como propuesta 🆕 sin resolver en `API §4.3`).
- **La detección y tipificación de colisiones** — mismo motivo.
- **La gramática formal de `gravityRules[].expression`** — sigue exactamente donde `Impl §5` la dejó; ninguna decisión de este documento depende de fijarla.
- **Si Architect existe como rol real en el modelo de autorización** — es una decisión de gobernanza de `AUTH-OWNERSHIP-01` y de trabajo futuro de Authorization, no de este cowork. §6 diseña *alrededor* de esa pregunta sin responderla.
- **Herramienta de auditoría inversa sobre el Grafo de Gravedad completo** (ej. "listar todos los sub-Mandates que heredaron una postura dada") — ya diferida como *tooling, no schema* por `Mandate v1.2.0 §6`; este documento mantiene esa misma frontera.
- **Un endpoint standalone de consulta de Gravity activa para Paladin UI o herramientas de auditoría humana** — ya señalado como propuesta nueva sin resolver por `API §3.2`; la Activity de §3.1 sirve exclusivamente al loop agéntico interno, no define una superficie de API pública.
- **Reconciliación de ciclo de vida si el Mandate padre se pausa o aborta mientras un sub-Mandate depende de sus posturas heredadas** — ya diferido explícitamente por `Mandate v1.2.0 §6` como decisión de runtime de Temporal fuera de alcance de ese addendum, y sigue fuera de alcance de este.

---

*Fin de la especificación de implementación v0.1. Toda extensión de schema sobre `Impl §1.2` está señalada en §7; toda decisión de tecnología está justificada contra el patrón de acceso real de §2.1; ninguna decisión ya cerrada de `Mandate v1.0.0`–`v1.2.0`, `Impl §1`–`§2` o `BTIPS §8` fue reabierta salvo la contradicción documentada en §0.3, resuelta usando `AUTH-OWNERSHIP-01` como dato de entrada ya cerrado.*
