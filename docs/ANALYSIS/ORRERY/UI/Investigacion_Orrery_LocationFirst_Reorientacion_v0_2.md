# Investigación — Orrery Location-first: reorientación bajo LocationSnapshot v0.1

**Tipo:** Investigación de arquitectura de UX espacial [R]. No es diseño final de interfaz, no es
wireframe, no autoriza cambios de código.
**Estado:** v0.2 — corrige el encuadre de `Investigacion_Orrery_VisorMandatos_Postulates_GatewayUX_v0_1.md`
a partir de una fuente de verdad que esta investigación no tenía disponible al escribirse.
**Fecha:** 2026-09-20.
**Fuente de verdad vigente:** `docs/ANALYSIS/ORRERY/LOCATION/Orrery_LocationSnapshot_v0.md` — contrato
físico propuesto y aprobado por José para qué es una Location, qué captura y qué excluye.
**Regla de tratamiento del resto del corpus:** todo documento anterior a este — incluido el propio
`Investigacion_Orrery_VisorMandatos_Postulates_GatewayUX_v0_1.md`, `ORRERY_LOCATION_MATERIAL_CLOSURE_v1_1.md`,
los tres `Investigacion_Already_Orrery_Location_Infraestructura_*`, `Investigacion_GravityGraph_
DomainGene_Relacion_v0_1.md`, `GravityGraph_DOMAIN_GENE_Contrato_Propuesto_v0_1.md`, los research de
Constellation/Orbital/Gravity y `COGNITUUM_GENE_CONCEPT_v3_0.md` — se trata **exclusivamente como
antecedente histórico**. Ninguno de ellos contradice, completa ni reinterpreta el contrato vigente de
`LocationSnapshot v0.1`. Donde algo de ese corpus choque con lo que dice `LocationSnapshot`, gana
`LocationSnapshot`, sin excepción.

---

## §0 — La corrección de orientación

`Investigacion_Orrery_VisorMandatos_Postulates_GatewayUX_v0_1.md` asumió que el giro pedido en ese momento
— "Orrery deja de ser navegador de locaciones estáticas y pasa a ser el visor espacial de mandatos en
ejecución" — significaba **redefinir qué es Orrery** alrededor de Mandate/Postulate. Esa lectura era
prematura: el hecho de que un Mandate pueda atravesar Domains, ejecutar Intents o producir estados
dinámicos dentro de una Location no convierte ese proceso en el objeto primario de Orrery.

`LocationSnapshot v0.1` fija la frontera semántica que corrige ese error, de forma literal:

> **"Orrery describe dónde está el usuario; no interpreta para qué le servirá estar ahí."**

La jerarquía correcta es la inversa a la que asumió v0.1 de esta investigación:

```text
primero: Location — estructura soberana, navegable, físicamente referenciable
  (scope, anchors, posición estructural, relaciones, vecinos, procedencia, evidencia de observación)

después: lo que ocurre, habita o se relaciona con ese territorio
  (Mandates, Intents, Gravity, Postulates — consumidores/vistas, nunca la razón de ser de Orrery)
```

Este documento reevalúa el trabajo anterior bajo esa jerarquía y reformula la investigación en curso.

---

## §1 — El contrato vigente, resumido operativamente

`LocationSnapshot v0.1` (aprobado por José, pendiente de materialización) define:

**Qué captura una Location**, de forma inmutable:
- `scope` — exactamente un Tenant, una Organization, un Project, con evidencia de `ProjectBinding`.
- `anchors[]` — uno o más elementos señalados **explícitamente** por el usuario (`origin: user_anchor`),
  referencia a un Project del scope o a un nodo Gravity existente.
- `structural_position.ancestors[]` — sólo los ancestros comprobados necesarios para reconstruir la
  posición (`origin: structural_ancestor`).
- `relations[]` — hechos existentes: una `StructuralEdge` real o una observación de `ParentID`. Nunca una
  arista inventada.
- `neighbors[]` — vecinos de **un solo grado**, cada uno conectado directamente a un anchor por una
  relación incluida. No se expande un segundo grado, no se infiere relevancia.
- `observation` — intervalo de observación (`started_at`/`completed_at`) con `consistency: non_atomic`.
- `provenance` por cada inclusión (`user_anchor` / `structural_ancestor` / `direct_relation`), separada de
  la procedencia del hecho fuente.

**Qué excluye explícitamente v0.1** (Sección H del contrato, textual):
- Interpretación de intención.
- Relevancia, recomendaciones y scope afectado.
- Investigación del Project.
- Embeddings y expansión semántica.
- Neighborhood de más de un grado.
- Contenido completo de entidades o archivos.
- Coordenadas 3D y `view_context`.
- Un único `structural_position.path`.
- `ontology_snapshot_ref` / `ontology_version` globales.
- **Creación de Postulates o Mandates.**
- **Evaluación o modificación de Gravity, Impact o Monitor.**
- Diseño del consumidor de Location.

**Qué queda postergado, con causa explícita** (no descartado, pero no soportado en v0.1):
- Domain/Gene canónicos como contenido — admisibles como *referencia* a un nodo Gravity existente, no
  como contenido canónico resuelto.
- Archivo, documento, Artifact como anchor — "fuera del enum v0.1; no inventar resolución por ruta o
  nombre".
- Atribución humana durable dentro del payload.
- Snapshot atómico global y recuperación histórica.

**Estados de resolución posterior** (nunca modifican la captura original): `resolved`, `changed`, `stale`,
`missing`, `unauthorized`, `ambiguous`, `unsupported`, `unverifiable`.

---

## §2 — Reevaluación de `Investigacion_Orrery_VisorMandatos_Postulates_GatewayUX_v0_1.md`

| Sección de v0.1 | Clasificación | Por qué |
|---|---|---|
| §0 — "Orrery pasa a ser el visor espacial de mandatos en ejecución" | **Hipótesis descartada por orientación incorrecta** | Contradice directamente el invariante de `LocationSnapshot`: Orrery describe dónde, no para qué. Mandate/Postulate no pueden ser la razón de ser de Orrery. |
| §1 — Corpus de respaldo (Location Closure, Gene v3.0, GravityGraph, Roles) | **Compatible como antecedente**, no como contrato | Sigue siendo lectura de contexto útil, pero ninguno de esos documentos es hoy la fuente de verdad de Location — lo es `LocationSnapshot v0.1`, posterior y más específico |
| §2.1 — MandateTab/mandateStore como fuente de verdad de Mandate en el cliente | **Compatible, sin cambios** | Esto no depende de la orientación de Orrery; sigue siendo cierto y sigue siendo el store correcto si algún día un consumidor de Location necesita mostrar Mandate |
| §2.2 — "este cowork podría ser el consumidor real que faltaba" para relacionar Gravity con Domain/Gene | **Compatible, y ahora resuelto de forma más concreta** | `LocationSnapshot` ya instancia ese consumidor, pero de una forma mucho más acotada de lo que v0.1 imaginaba: no propone tocar `GravityPosture` en absoluto. Propone que una Location **observe** (lea, no persista como arista nueva de Gravity) una `StructuralEdge` `DOMAIN_GENE`/`DOMAIN_MANDATE` o un `ParentID` ya existentes, y los incluya como evidencia dentro de la propia captura. Esto es, literalmente, la Opción C ("resolución en tiempo de lectura por el consumidor") que `Investigacion_GravityGraph_DomainGene_Relacion_v0_1.md` §7.3 dejaba como la vía preferible si aparecía un consumidor real — con la ventaja de que ahora hay contrato físico y JSON Schema para esa lectura, no sólo una recomendación |
| §2.3 — Ambigüedad Postura vs. Postulate | **Pregunta que cambia de forma, no se resuelve** | `LocationSnapshot` no define Postulate y excluye explícitamente su creación de v0.1. Esto confirma que Postulate, sea lo que sea, **no es parte del contrato de Location** — es, en el mejor de los casos, algo que ocurre en relación a una Location ya capturada, nunca algo que Location produce o interpreta. Ver §5 |
| §3 — Conciliación de ontología (Tenant, Domain, Gene, Artifact, Anchor) | **Parcialmente resuelto por el propio contrato** | `LocationSnapshot` §A.1 corrige explícitamente el antecedente del 15 de septiembre que excluía Tenant: "existen identidades físicas para Tenant, Organization y Project". Tenant queda confirmado como scope soberano real, no como hipótesis. Domain/Gene: confirmado postergado (admisible como referencia, no como contenido canónico) — coincide con lo que v0.1 ya señalaba, ahora con contrato explícito en vez de inferencia. Artifact: confirmado **fuera del enum v0.1** — la pregunta abierta de v0.1 ("¿es lo mismo que activo constitutivo de Gene?") queda respondida en la práctica: por ahora no es nada, no es admisible como anchor. Anchor: `LocationSnapshot` formaliza `origin: user_anchor` como selección explícita del usuario — coincide con lo que v0.1 sospechaba (`explicit_anchors` de la Location Closure de septiembre), y ahora es contrato vigente, no coincidencia de nombre a confirmar |
| §4 — Gramática espacial para Mandates/Postulates vivos (el `marker` recorriendo `route` sobre Domains) | **Hipótesis descartada del contrato de Location; reclasificada como consumidor futuro, no verificado** | Visualizar un Mandate en movimiento es, en términos del contrato, "evaluación de Gravity" e implica intención/proceso — ambos explícitamente fuera de v0.1. Esto no significa que la idea sea inválida como *vista futura sobre una Location ya capturada* (ver §5), pero no puede presentarse como lo que Orrery "es" ni como parte de lo que Location resuelve |
| §4.3 — "el mundo permanece, el criterio lo alcanza, el trabajo lo recorre" (tagline del prototipo) | **Compatible, reinterpretado** | La frase en sí describe bien la relación correcta: el territorio (Location) es estable y navegable; lo que ocurre sobre él (Mandate, Intent) es un proceso separado. El error de v0.1 no fue citar la frase, fue concluir de ella que Orrery debía redefinirse alrededor del proceso en vez del territorio |
| §5 — Umbral de Transición (Gateway UX) | **Compatible con ajuste del disparador** | El mecanismo (invocación contextual, aterrizaje con foco, retorno simétrico) no depende de si el objeto mostrado es un Mandate o un territorio — sigue siendo válido. Lo que cambia es la condición de aparición: no debe dispararse por "incidencia activa de Mandates" (eso es interpretar para qué sirve estar ahí), sino por un acto de navegación/selección explícita sobre un scope u objeto ya admisible como anchor. Ver §7 |
| §6/§7 — Fuera de alcance y preguntas para José | **Reemplazadas por §6/§8 de este documento** | Varias de esas preguntas ya están resueltas por `LocationSnapshot` (Anchor, Tenant); las que quedan cambian de forma |

---

## §3 — Qué es Orrery, ahora, bajo Location-first

Orrery es, ante todo, **un navegador espacial de Locations**. Su función primaria es permitir que el
usuario:

1. Navegue el scope soberano (Tenant → Organization → Project, con `ProjectBinding` comprobado).
2. Señale explícitamente uno o más elementos como `anchors` — un Project o un nodo Gravity existente
   (`NUCLEUS`, `ORGANIZATION`, `PROJECT`, `MANDATE`, `SESSION`, `DOMAIN`, `GENE`).
3. Vea la posición estructural de esos anchors: sus ancestros comprobados, sus relaciones existentes
   (`StructuralEdge` o `ParentID`), y sus vecinos de un solo grado.
4. Capture ese estado como una `LocationSnapshot` — evidencia inmutable de dónde estaba parado, con qué
   provenance, en qué momento.

Nada de esto requiere saber qué Mandate está en ejecución, qué Intent se está proponiendo, ni qué Postura
de Gravity gobierna esa selección. El territorio (Domains, Genes, la jerarquía soberana) es lo que Orrery
representa; el trabajo que ocurre sobre ese territorio es un plano distinto.

Esto es compatible con el prototipo ya validado (`installer/conductor/workspace/core/orrery/src/main.ts`):
la capa de **interacción** (cámara orbital, selección por raycasting, panel inspector, labels) sigue siendo
reutilizable tal cual — es exactamente el mecanismo de señalar `anchors` y navegar `structural_position`
que pide el contrato. Lo que **no** debe sobrevivir de ese prototipo, bajo el nuevo encuadre, es el
`marker` que recorre una `route` narrando el avance de un Intent: eso pertenece a un consumidor eventual
(ver §5), no al núcleo de lo que Orrery captura.

---

## §4 — Qué excluye este encuadre (reforzado, no reinterpretado)

Se transcribe sin modificar la Sección H de `LocationSnapshot v0.1`, porque cualquier paráfrasis corre el
riesgo de reinterpretar el contrato — algo que este documento tiene instrucción explícita de no hacer:

- Interpretación de intención.
- Relevancia, recomendaciones y scope afectado.
- Investigación del Project.
- Embeddings y expansión semántica.
- Neighborhood de más de un grado.
- Contenido completo de entidades o archivos.
- Coordenadas 3D y `view_context`.
- Un único `structural_position.path`.
- `ontology_snapshot_ref` sin infraestructura resoluble; `ontology_version` global inventada.
- Uso del snapshot de autoridad como snapshot ontológico.
- Creación de Postulates o Mandates.
- Evaluación o modificación de Gravity, Impact o Monitor.
- Diseño del consumidor de Location.

Toda propuesta de esta investigación que roce alguno de estos puntos debe marcarse como fuera del alcance
de v0.1, no como una extensión implícita del contrato.

---

## §5 — Qué puede existir "sobre" una Location, sin alterar su naturaleza

El propio contrato deja la puerta abierta, con una condición estricta: **"Diseño del consumidor de
Location"** está fuera de v0.1 — es decir, no se decide acá, pero se reconoce como una capa futura y
separada. Bajo esa condición, se puede formular — sin resolver — qué relación tendrían Mandate, Intent,
Gravity y Postulate con una Location ya capturada:

- **Mandate/Intent** — un consumidor podría, en el futuro, anotar o correlacionar una `LocationSnapshot`
  con un Mandate en ejecución (por ejemplo: "este Mandate opera sobre el territorio de esta Location"). Eso
  es una relación *externa* a la captura: la Location no sabe ni necesita saber que existe ese Mandate. El
  `mandateStore.ts` ya real (auditoría de UI, §2.1 de la investigación anterior) seguiría siendo la fuente
  de verdad del Mandate; Location seguiría siendo la fuente de verdad de dónde.
- **Gravity** — una Location puede *observar* referencias a nodos Gravity (incluyendo Posturas indirectamente,
  vía el nodo al que pertenecen) como evidencia de posición estructural, pero el contrato es explícito:
  "las referencias Gravity guardan la versión del nodo, no su contenido ni sus Postures" (Sección D). Una
  Location nunca evalúa si una Postura aplica o no — eso sigue siendo trabajo exclusivo de `ResolveActive`
  en Gravity, un sistema aparte.
- **Postulate** — sigue sin definirse en ningún documento del corpus, viejo o nuevo. Lo único que
  `LocationSnapshot` aporta es una restricción negativa: sea lo que sea Postulate, **no lo crea ni lo
  interpreta Location**. Si Postulate resulta ser la "declaración humana" de qué se quiere lograr en un
  lugar (como sugería el antecedente de ASM, tratado aquí como histórico), sería, en el mejor de los casos,
  un objeto que *referencia* una Location ya existente — nunca al revés.

**Ninguna de estas relaciones se diseña en este documento.** Se dejan enunciadas para que la próxima ronda
de investigación (si José la autoriza) tenga un punto de partida que no repita el error de v0.1: empezar
por el consumidor en vez de empezar por Location.

---

## §6 — El Umbral de Transición (Gateway UX), revisado

El problema que planteaba `Investigacion_Orrery_VisorMandatos_Postulates_GatewayUX_v0_1.md` §5 — cómo pasa
el usuario de la Core UI plana al visor volumétrico sin shock cognitivo ni pérdida de contexto — sigue
siendo un problema real y no depende de si Orrery muestra Mandates o Locations. Lo que cambia es la
condición de aparición del gesto:

- **Antes (v0.1, descartado):** el gesto se ofrecía cuando el sistema detectaba "una incidencia activa de
  mandatos" — es decir, el trigger interpretaba para qué le serviría al usuario estar ahí. Eso es
  exactamente lo que el invariante de `LocationSnapshot` prohíbe que Orrery haga.
- **Ahora:** el gesto de "elevar perspectiva" se ofrece sobre un acto de navegación/selección ya admisible
  como anchor — el usuario abre un Project, o señala un nodo Gravity existente, y desde ahí puede elevar la
  vista a Orrery para ver su posición estructural (ancestros, relaciones, vecinos de un grado). El disparo
  es sobre **dónde está parado**, no sobre **qué está pasando ahí**.

El resto del mecanismo propuesto en v0.1 §5.3 sigue siendo válido sin cambios: invocación contextual (no
tab/modal genérico), aterrizaje con foco sobre el anchor de origen (reutilizando `select()`/`desired`/
`desiredDistance` del prototipo), retorno simétrico y no destructivo.

---

## §7 — Preguntas para José (reemplazan las de v0.1)

Varias preguntas de la investigación anterior quedaron resueltas por `LocationSnapshot` (Tenant como scope
físico real; Anchor = `user_anchor`). Las que siguen abiertas, y las nuevas que aparecen bajo este
encuadre:

1. **Postulate:** sigue sin definirse en ningún documento, y `LocationSnapshot` confirma que no es parte
   del contrato de Location. ¿Existe una definición de Postulate en curso en otro cowork, o es un término
   que este cowork está por acuñar? Antes de diseñar cualquier consumidor, hace falta saber qué es.
2. **Consumidor de Location:** `LocationSnapshot` deja "diseño del consumidor" explícitamente fuera de
   v0.1. ¿Este cowork está autorizado a empezar a esbozar ese consumidor (por ejemplo, cómo se vería una
   Location capturada dentro de Orrery), o eso corresponde a una ronda posterior una vez que el contrato de
   captura esté materializado?
3. **Relación Mandate↔Location:** si en el futuro un Mandate necesita referenciar una Location (para saber
   "sobre qué territorio opera"), ¿esa referencia vive en el Mandate, en un objeto intermedio, o se decide
   recién cuando exista el primer consumidor real? (Ver §5 — no se resuelve acá.)
4. **Alcance de esta investigación de aquí en más:** dado que `LocationSnapshot v0.1` ya es un contrato
   contractual completo con JSON Schema, tests contractuales y recorrido E2E propuesto (Secciones E, F, G),
   ¿qué le queda a esta línea de investigación de UX que no esté ya resuelto por ese documento? La hipótesis
   de este documento es que lo que queda es exclusivamente **cómo se navega y se visualiza** una Location ya
   definida por el contrato — nunca qué captura o qué excluye, eso ya está cerrado.

### Secuencia recomendada

1. Confirmar con José que el encuadre de este documento (§0-§4) es el correcto antes de invertir más
   trabajo de diseño.
2. Si se confirma, la investigación de UX debe limitarse a: cómo se navega el scope soberano, cómo se
   señalan anchors, cómo se visualizan ancestros/relaciones/vecinos de un grado — sin tocar Mandate,
   Postulate o Gravity como objetos de primera clase en Orrery.
3. El diseño de cualquier consumidor (Mandate, Postulate) que quiera apoyarse en una Location capturada es
   una investigación separada, posterior, y depende de que el contrato de captura esté materializado
   primero.
