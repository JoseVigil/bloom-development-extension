# Handoff a Albor — Incorporación de `DOMAIN` y `GENE` al `GravityGraph`

**Versión:** v0.1  
**Fecha:** 2026-09-02  
**Estado:** consolidación arquitectónica para coordinación; no autoriza implementación  
**Destinatario:** Albor / work Gravity

## 1. Mensaje ejecutivo

Se identificó y confirmó un vacío estructural en el alcance vigente de Gravity: el cierre actual de Brain no describe ni gobierna por sí mismo los Genes ni la topología persistida en `.semantic-index.json`, mientras que ambas piezas participan directamente en cómo el sistema organiza, interpreta y opera sobre el conocimiento producido bajo un Mandate.

La decisión de alcance es incorporar `DOMAIN` y `GENE` como entidades de primer orden del `GravityGraph`. Esta incorporación no convierte a Gravity en dueño del contenido semántico ni introduce una copia alternativa de ese contenido. El `GravityGraph` debe representar la identidad, pertenencia estructural y vigencia gobernada de esas entidades; el contenido profundo y la topología semántica canónica continúan en los artefactos que ya les pertenecen.

La formulación resultante del boundary es:

> **`GravityGraph` representa Criterion + estructura gobernada + Provenance ratificada.**

Este cambio es una reapertura explícita del boundary anterior, no una interpretación silenciosa ni una simple ampliación de implementación.

## 2. Qué se verificó contra el repositorio

La investigación fue contrastada con el estado real de Brain, Nucleus, las especificaciones `ing`/`dis` y la implementación existente de Gravity.

### 2.1 Fuente canónica de Genes

El Gene conserva su linaje y contenido canónico en:

```text
.mandates/{mandateId}/.genes/{geneId}/gen.json
```

`gen.json` no contiene un Domain singular. Esa ausencia es deliberada: la relación Domain↔Gene es N:M y no puede representarse correctamente como una propiedad única del Gene.

### 2.2 Fuente canónica de Domains y su topología

La fuente de verdad de Domain↔Gene continúa siendo:

```text
.cache/.semantic-index.json
```

La especificación de `dis` confirma que ese índice contiene `domains`, sus `genes[]` y sus `mandates[]`, y que las operaciones de alta, baja, rename, merge y split se aplican sobre él.

### 2.3 Alcance real de “Nucleus-wide”

El código de `NucleusManager` crea el índice en:

```text
.bloom/.nucleus-{organization}/.cache/.semantic-index.json
```

Por lo tanto, “Nucleus-wide” significa compartido dentro de una instancia Nucleus organizacional. No significa transversal entre organizaciones diferentes.

También se confirmó una deuda real: una parte de `IntentManager` busca provisionalmente `.bloom/.cache/.semantic-index.json` y declara expresamente que la ruta Nucleus-level todavía no está resuelta. Esa implementación no puede utilizarse como fundamento para redefinir el scope del Domain.

### 2.4 Restricciones del modelo Gravity existente

El modelo actual solo admite `NUCLEUS`, `ORGANIZATION`, `PROJECT`, `MANDATE` y `SESSION`. Además, su validación exige que únicamente `NUCLEUS` tenga `parentId: null`.

En consecuencia, un `DOMAIN` ubicado directamente debajo de Nucleus debe tener:

```text
parentId = nodeId del NUCLEUS propietario
```

La propuesta preliminar de `DOMAIN.parentId: null` habría creado una segunda raíz y contradicho la invariante vigente del Store.

## 3. Decisión consolidada

### 3.1 `DOMAIN`

`DOMAIN` es un nodo estructural de primer orden, perteneciente a una instancia Nucleus concreta.

- Es hijo directo de `NUCLEUS`.
- Tiene referencia al índice semántico canónico.
- No contiene una copia del nombre, centroide, Genes o Mandates del Domain como verdad alternativa.
- No admite `gravityPostures[]` activas.
- No entra en el spine de resolución de Gravity.

### 3.2 `GENE`

`GENE` es un nodo estructural de primer orden que representa un Gene materializado por un Mandate.

- Es hijo estructural de su `MANDATE` de origen.
- Referencia su `gen.json` canónico.
- No replica su función semántica, archivos, embeddings ni historia.
- No admite `gravityPostures[]` activas.
- No entra en el spine de resolución de Gravity.

### 3.3 Relaciones

Las relaciones Domain↔Gene y Domain↔Mandate no caben en `parentId`, porque son N:M y de contribución, no una jerarquía única.

Si se materializan bajo `.gravity/.edges/`, deben tener estatus de **proyección gobernada, auditable y reconstruible**. La autoridad continúa siendo `.semantic-index.json`. Ante discrepancia, Nucleus debe rechazar el uso de la proyección o reconciliarla desde la fuente canónica; nunca declarar ganadora a la copia de Gravity.

## 4. Qué no cambia

- `ResolveActive`, `buildSpine` y `readSpine` mantienen su recorrido actual.
- `DOMAIN` y `GENE` no alteran la precedencia jerárquica de las posturas.
- `appliesTo[]` continúa filtrando por tipo de Intent, no por Domain o Gene.
- `GravityPosture`, su gramática y el cálculo de Masa no cambian.
- `gen.json` continúa siendo la fuente canónica del Gene.
- `.semantic-index.json` continúa siendo la fuente canónica de la topología Domain↔Gene.
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

Los estados semánticos o funcionales propios del Gene —por ejemplo `dormant`, `orphan` o `forked`— siguen perteneciendo a `gen.json`. Gravity registra vigencia estructural, no duplica la máquina de estados del Gene.

## 6. Materialización futura

La futura materialización debe respetar este orden:

1. `ing` o `dis` confirma la escritura de los artefactos canónicos.
2. Una operación gobernada de Nucleus crea o sincroniza los nodos y relaciones de Gravity.
3. La operación es idempotente frente a retries.
4. Una falla en Gravity no puede dejar que una proyección parcial se presente como verdad canónica.
5. La reconciliación posterior siempre parte de `gen.json` y `.semantic-index.json`.

La ubicación del materializador —Brain, Activity de Nucleus u otro seam autorizado— queda pendiente de decisión. Este documento no la adjudica implícitamente.

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

