# Handoff a Albor — Incorporación de `DOMAIN` y `GENE` al `GravityGraph`

**Versión:** v0.1  
**Fecha:** 2026-09-02  
**Estado:** consolidación arquitectónica para coordinación; no autoriza implementación  
**Destinatario:** Albor / work Gravity

> **Alineación normativa con Gene v3.0 (2026-09-17):** Gene es una identidad funcional durable dentro de
> un Project. Gene Revisions son estados materiales inmutables y Gene Contributions atribuyen sus
> transformaciones a Mandates e Intents. GravityGraph consume únicamente estado canónico ratificado y
> produce una proyección referencial. El Mandate de origen permanece como provenance; no es propietario
> permanente del Gene.

## 1. Mensaje ejecutivo

Se identificó y confirmó un vacío estructural en el alcance vigente de Gravity: el cierre actual de Brain no describe ni gobierna por sí mismo los Genes ni la topología persistida en `.semantic-index.json`, mientras que ambas piezas participan directamente en cómo el sistema organiza, interpreta y opera sobre el conocimiento producido bajo un Mandate.

La decisión de alcance es incorporar `DOMAIN` y `GENE` como entidades de primer orden del `GravityGraph`. Esta incorporación no convierte a Gravity en dueño del contenido semántico ni introduce una copia alternativa de ese contenido. El `GravityGraph` debe representar la identidad, pertenencia estructural y vigencia gobernada de esas entidades; el contenido profundo y la topología semántica canónica continúan en los artefactos que ya les pertenecen.

La formulación resultante del boundary es:

> **`GravityGraph` representa Criterion + estructura gobernada + Provenance ratificada.**

Este cambio es una reapertura explícita del boundary anterior, no una interpretación silenciosa ni una simple ampliación de implementación.

## 2. Qué se verificó contra el repositorio

La investigación fue contrastada con el estado real de Brain, Nucleus, las especificaciones `ing`/`dis` y la implementación existente de Gravity.

### 2.1 Fuente canónica de Genes

El contrato histórico conservaba linaje y contenido en:

```text
.mandates/{mandateId}/.genes/{geneId}/gen.json
```

En v3.0 esa ruta queda como compatibilidad transitoria, no como fuente canónica física definitiva. La
fuente rica debe vivir a nivel Nucleus y conservar identidad Gene, Gene Revisions inmutables, Gene
Contributions y provenance. Su nombre y layout se decidirán en el encargo de persistencia.

El Gene no contiene un Domain singular. Esa ausencia sigue siendo deliberada: la relación Domain↔Gene
es N:M y no puede representarse correctamente como una propiedad única del Gene.

### 2.2 Fuente canónica de Domains y su topología

La superficie transitoria de Domain↔Gene continúa siendo:

```text
.cache/.semantic-index.json
```

La especificación de `dis` confirma que ese índice contiene `domains`, sus `genes[]` y sus `mandates[]`,
y que las operaciones de alta, baja, rename, merge y split se aplican sobre él. Gene v3.0 establece que
`.cache/.semantic-index.json` no es la autoridad definitiva: deberá poder reconstruirse desde identidades
y relaciones ratificadas a nivel Nucleus.

### 2.3 Alcance real de “Nucleus-wide”

El código de `NucleusManager` crea el índice en:

```text
.bloom/.nucleus-{organization}/.cache/.semantic-index.json
```

Por lo tanto, “Nucleus-wide” significa compartido dentro de una instancia Nucleus organizacional. No significa transversal entre organizaciones diferentes.

También se confirmó una deuda real: una parte de `IntentManager` busca provisionalmente `.bloom/.cache/.semantic-index.json` y declara expresamente que la ruta Nucleus-level todavía no está resuelta. Esa implementación no puede utilizarse como fundamento para redefinir el scope del Domain.

### 2.4 Restricciones del modelo Gravity existente — enmendado 2026-09-02

El modelo actual solo admite `NUCLEUS`, `ORGANIZATION`, `PROJECT`, `MANDATE` y `SESSION`. Además, su validación exige que únicamente `NUCLEUS` tenga `parentId: null`.

**Enmienda ratificada por José Vigil (2026-09-02):** `DOMAIN` no se ubica directamente debajo de
Nucleus. Su `parentId` expresa procedencia estructural y apunta al `nodeId` del `MANDATE` dentro del cual
se creó y ratificó la identidad del Domain:

```text
parentId = domains[domainId].origin_mandate_id
```

`origin_mandate_id` es un campo canónico explícito, obligatorio e inmutable. No se deriva de
`first_created_by` —que identifica al Intent creador— ni de la posición dentro de `mandates[]` —que es
una colección acumulativa sin semántica posicional—. La propuesta preliminar de `DOMAIN.parentId: null`
habría creado una segunda raíz; la variante posterior `DOMAIN.parentId = NUCLEUS` queda reemplazada por
esta enmienda.

## 3. Decisión consolidada

### 3.1 `DOMAIN` — enmendado 2026-09-02

`DOMAIN` es un nodo estructural de primer orden, perteneciente a una instancia Nucleus concreta.

- Es hijo estructural del `MANDATE` identificado por `origin_mandate_id`.
- Ese parent expresa procedencia, no ownership ni dependencia de lifecycle: cerrar, pausar o superseder
  el Mandate no mueve ni supersede automáticamente al Domain.
- Tiene referencia al índice semántico canónico.
- No contiene una copia del nombre, centroide, Genes o Mandates del Domain como verdad alternativa.
- No admite `gravityPostures[]` activas.
- No entra en el spine de resolución de Gravity.

### 3.2 `GENE`

`GENE` es un nodo estructural de primer orden que proyecta un Gene y la Gene Revision canónica observada.

- Conserva su `MANDATE` de origen como procedencia estructural transitoria, no como ownership ni límite
  de lifecycle.
- La referencia implementada a `gen.json` queda como seam de compatibilidad hasta que se ratifique la
  referencia canónica Gene + Revision + digest.
- No replica su función semántica, archivos, embeddings ni historia.
- No admite `gravityPostures[]` activas.
- No entra en el spine de resolución de Gravity.

### 3.3 Relaciones

Las relaciones Domain↔Gene y Domain↔Mandate no caben en `parentId`, porque son N:M y de contribución, no una jerarquía única.

Si se materializan bajo `.gravity/.edges/`, deben tener estatus de **proyección gobernada, auditable y
reconstruible**. Durante la transición, `.semantic-index.json` aporta los hechos operativos de esas
relaciones; la autoridad definitiva v3.0 pertenecerá a la fuente canónica Nucleus-level. Ante discrepancia,
Nucleus debe rechazar el uso de la proyección o reconciliarla desde la fuente canónica aplicable; nunca
declarar ganadora a la copia de Gravity.

## 4. Qué no cambia

- `ResolveActive`, `buildSpine` y `readSpine` mantienen su recorrido actual.
- `DOMAIN` y `GENE` no alteran la precedencia jerárquica de las posturas.
- `appliesTo[]` continúa filtrando por tipo de Intent, no por Domain o Gene.
- `GravityPosture`, su gramática y el cálculo de Masa no cambian.
- La fuente canónica Nucleus-level de Gene y sus revisiones permanece fuera de GravityGraph.
- La fuente canónica Nucleus-level de relaciones Domain↔Gene permanece fuera de GravityGraph.
- `gen.json` y `.semantic-index.json` se conservan como compatibilidad transitoria hasta el encargo de
  persistencia v3.0.
- No se habilita creación genérica de estos nodos por el hecho de documentarlos.
- Este cierre no implementa ningún materializador ni cambia comportamiento productivo.

## 5. Lifecycle y trazabilidad

Cuando `dis` renombra un Domain, su identidad permanece: cambia el contenido canónico del índice, no el `domainId`.

Cuando `dis` fusiona o divide Domains:

- los IDs reemplazados no se reutilizan;
- los nodos Gravity anteriores se conservan como historia y pasan a `superseded`;
- sus relaciones dejan de estar activas;
- los Domains resultantes reciben nuevas identidades cuando así lo exige el contrato de `dis`;
- la proyección se reconstruye a partir del estado canónico confirmado.

Los estados semánticos o funcionales propios del Gene pertenecen a la fuente canónica rica, no a
GravityGraph. Los estados históricos `dormant`, `orphan` o `forked` de `gen.json` deberán homologarse con
el lifecycle v3.0 durante el encargo de persistencia; no se promueven automáticamente al nuevo contrato.
Gravity registra vigencia estructural de su proyección y no duplica la máquina de estados del Gene.

## 6. Materialización futura

La futura materialización debe respetar este orden:

1. La decisión humana ratifica identidad, función y relaciones pretendidas mediante Contributions.
2. La materialización post-merge observa activos y digests reales.
3. La verificación compara el estado material con la decisión ratificada.
4. El commit canónico publica una Gene Revision inmutable y cambia `current_revision_id` de forma atómica.
5. Sólo entonces una operación gobernada de Nucleus crea o sincroniza nodos y relaciones de Gravity.
6. La operación es idempotente frente a retries.
7. Una falla en Gravity no puede dejar que una proyección parcial se presente como verdad canónica.
8. La reconciliación posterior siempre parte de la fuente canónica ratificada; durante la transición puede
   resolver sus seams de compatibilidad.

La ubicación del materializador —Brain, Activity de Nucleus u otro seam autorizado— queda pendiente de decisión. Este documento no la adjudica implícitamente.

Para un Domain creado por merge o split, `origin_mandate_id` es el Mandate que ratificó esa operación; no
se hereda de los Domains fuente ni de la posición de ningún elemento en `mandates[]`.

## 7. Estado que debe registrar el work Gravity

- **Decisión arquitectónica:** adoptada para formalización coordinada.
- **Boundary:** reabierto; requiere actualización normativa explícita.
- **Schema y persistencia:** diseño consolidado, todavía no incorporado al código.
- **Materialización:** pendiente.
- **Autorización de creación:** pendiente de contrato; debe permanecer fail-closed hasta resolverse.
- **`ResolveActive`:** sin cambios.
- **Impacto productivo actual:** ninguno.

## 8. Solicitud concreta a Albor

Se solicita que Albor incorpore esta decisión al status del work Gravity y no trate `DOMAIN`/`GENE` como una extensión menor del enum existente. La implementación futura deberá partir del contrato técnico adjunto, resolver primero las gates y la autoridad de materialización, y presentar una lista exacta de archivos antes de cualquier cambio de código o de las especificaciones normativas.
