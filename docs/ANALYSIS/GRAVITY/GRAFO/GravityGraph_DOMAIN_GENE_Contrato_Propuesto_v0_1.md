# Contrato propuesto — `DOMAIN` y `GENE` en `GravityGraph`

**Versión:** v0.1  
**Fecha:** 2026-09-02  
**Estado:** propuesta consolidada para ratificación; no implementada  
**Naturaleza:** contrato técnico de coordinación, subordinado a las especificaciones normativas que deberán actualizarse

> **Alineación normativa con Gene v3.0 (2026-09-17):** este contrato consume identidades, Gene Revisions
> y relaciones previamente ratificadas por la fuente canónica rica a nivel Nucleus definida
> conceptualmente en `docs/GENES/COGNITUUM_GENE_CONCEPT_v3_0.md`. GravityGraph produce una proyección
> referencial gobernada y reconstruible. No es autoridad de la identidad funcional, revisión, scope,
> activos, función, Contributions, linaje ni proyección semántica. El layout físico de la fuente canónica
> y la forma definitiva de sus referencias siguen pendientes del encargo de persistencia.

## 1. Invariantes

1. `DOMAIN` y `GENE` son nodos de primer orden del `GravityGraph`.
2. Son nodos estructurales, no portadores de Criterion.
3. `gravityPostures[]` debe estar vacío en ambos tipos.
4. Ninguno participa de `ResolveActive` ni de su spine cacheado.
5. Solo existe una raíz: `NUCLEUS`.
6. Todo `DOMAIN` pertenece a una instancia `.nucleus-{organization}` concreta.
7. Todo `GENE` referencia una identidad Gene canónica y la Gene Revision observada; conserva el Mandate
   y el Intent de origen como provenance, no como ownership permanente.
8. Las relaciones Domain↔Gene y Domain↔Mandate provienen de la fuente canónica ratificada. Durante la
   transición, `.semantic-index.json` conserva su papel de compatibilidad, pero no es la autoridad física
   definitiva de v3.0.
9. Cualquier representación de esas relaciones dentro de Gravity es una proyección reconstruible.
10. Nucleus sigue siendo el único escritor de `.gravity/`.
11. La creación debe permanecer cerrada mientras no exista una operación gobernada específica.
12. La sincronización debe ser idempotente y tolerante a retry.

## 2. Extensiones conceptuales del schema

### 2.1 Tipos

```go
const (
    NodeDomain NodeType = "DOMAIN"
    NodeGene   NodeType = "GENE"
)
```

Esta declaración describe el contrato esperado. No autoriza por sí misma la modificación del enum real.

### 2.2 Referencias

```go
type DomainRef struct {
    SemanticIndexPath string `json:"semanticIndexPath"`
}

type GeneRef struct {
    MandateID string `json:"mandateId"`
    GenePath  string `json:"genePath"`
}
```

`GeneRef` representa el shape implementado en v0.1 y queda como compatibilidad transitoria. El contrato
definitivo deberá identificar como mínimo el Gene, la Gene Revision observada, la referencia canónica y
su digest, sin suponer que la identidad vive permanentemente bajo el Mandate de origen. Este documento no
fija todavía ese schema físico.

Las referencias deben ser relativas a la raíz de la instancia Nucleus y resolverse mediante rutas controladas. No deben aceptar rutas que escapen de esa raíz.

### 2.3 Restricciones por tipo

| Tipo | `parentId` | Referencia obligatoria | Posturas | Spine |
|---|---|---|---|---|
| `DOMAIN` | ID del `MANDATE` de origen (`origin_mandate_id`) | `domainRef` | Prohibidas | Excluido |
| `GENE` | ID de `MANDATE` de origen | `geneRef` | Prohibidas | Excluido |

Para ambos tipos:

- `status` estructural: `active | superseded`;
- `nodeVersion`: monotónico y sujeto a CAS;
- `signedBy`: no debe inferirse hasta que se formalice la autoridad de creación;
- una referencia ausente, inválida o fuera del Nucleus debe causar rechazo.

## 3. Layout propuesto

```text
.bloom/
└── .nucleus-{organization}/
    └── .gravity/
        ├── nucleus.node.json
        ├── .organization/
        │   └── {organizationId}/
        │       └── .project/{projectId}/
        │           └── .mandate/{mandateId}/
        │               ├── node.json
        │               ├── .domain/{domainId}/
        │               │   └── node.json
        │               └── .gene/{geneId}/
        │                   └── node.json
        └── .edges/
            ├── domain_gene/
            └── domain_mandate/
```

El nesting de `GENE` expresa origen. No implica que el Gene forme parte de la cadena de precedencia de posturas.

## 4. Forma propuesta de nodos

### 4.1 `DOMAIN`

```json
{
  "nodeId": "dom_auth_a1b2",
  "nodeType": "DOMAIN",
  "parentId": "origin-mandate-node-id",
  "domainRef": {
    "semanticIndexPath": ".cache/.semantic-index.json"
  },
  "gravityPostures": [],
  "status": "active",
  "createdAt": "ISO-8601",
  "nodeVersion": 1
}
```

### 4.2 `GENE`

```json
{
  "nodeId": "gene-uuid-1",
  "nodeType": "GENE",
  "parentId": "mandate-node-id",
  "geneRef": {
    "mandateId": "mandate-uuid",
    "genePath": ".mandates/mandate-uuid/.genes/gene-uuid-1/gen.json"
  },
  "gravityPostures": [],
  "status": "active",
  "createdAt": "ISO-8601",
  "nodeVersion": 1
}
```

Los ejemplos son shapes contractuales propuestos. La convención exacta de directorios ocultos para IDs de Mandate deberá homologarse con el layout canónico antes de implementar.

**Enmienda ratificada por José Vigil (2026-09-02):** `DOMAIN.parentId` debe coincidir con
`domains[domainId].origin_mandate_id`. Este campo canónico identifica el Mandate donde nació y se ratificó
la identidad; es distinto de `first_created_by` (Intent creador) y de `mandates[]` (colección acumulativa
sin semántica posicional). En merge/split, el Domain resultante usa como origen el Mandate que ratificó la
operación. El parent expresa procedencia estructural, no ownership ni acoplamiento de lifecycle.

## 5. Relaciones proyectadas

### 5.1 Domain↔Gene

Representa que el `geneId` aparece en `domains[domainId].genes[]` del índice canónico.

### 5.2 Domain↔Mandate

Representa que el `mandateId` aparece en `domains[domainId].mandates[]` del índice canónico.

### 5.3 Formato ratificado de arista

```json
{
  "edgeId": "domain_gene:dom_auth_a1b2:gene-uuid-1",
  "edgeType": "DOMAIN_GENE",
  "fromNodeId": "dom_auth_a1b2",
  "toNodeId": "gene-uuid-1",
  "status": "active",
  "canonicalSource": {
    "path": ".cache/.semantic-index.json",
    "selector": "domains/dom_auth_a1b2/genes/gene-uuid-1",
    "fingerprint": "sha256:..."
  },
  "materializedAt": "ISO-8601",
  "edgeVersion": 1
}
```

`edgeId` es determinista: `domain_gene:{domainId}:{geneId}` o
`domain_mandate:{domainId}:{mandateId}`. El selector lógico estable es
`domains/{domainId}/genes/{geneId}` o `domains/{domainId}/mandates/{mandateId}`; no es un JSON Pointer
posicional.

El fingerprint es SHA-256 de la serialización JSON canónica del hecho puntual proyectado, nunca del
archivo completo ni de la entrada completa del Domain:

```text
DOMAIN_GENE:    {edgeType, domainId, geneId, present}
DOMAIN_MANDATE: {edgeType, domainId, mandateId, present}
```

`present` es `true` para `active` y `false` para una baja canónica proyectada como `superseded`. Un retry
con el mismo hecho no cambia `materializedAt` ni `edgeVersion`; solo una mutación efectiva, protegida por
CAS, incrementa la versión.

En v3.0, `edgeVersion` y `nodeVersion` versionan la **proyección Gravity**. No son una Gene Revision ni
una revisión de Domain. Cuando la futura relación canónica tenga identidad y versión propias, la arista
debe conservar su referencia y fingerprint sin apropiarse de esa autoridad.

No debe copiar nombres, centroides, funciones semánticas ni listas completas del índice.

## 6. Autoridad y resolución de conflictos

Orden de autoridad v3.0:

1. Fuente canónica Nucleus-level para identidad Gene, Gene Revisions y Contributions.
2. Fuente canónica Nucleus-level para identidad Domain y relaciones ratificadas Domain↔Gene/Domain↔Mandate.
3. `GravityGraph` para la representación gobernada y su historia estructural.

Hasta que la persistencia v3.0 sea ratificada, `gen.json` y `.semantic-index.json` funcionan como seams
transitorios de compatibilidad; no fijan el destino físico final.

Si una arista Gravity contradice el índice:

- no se utiliza como fuente semántica;
- se marca la proyección como necesitada de reconciliación;
- se reconstruye desde el artefacto canónico;
- la divergencia debe quedar auditable.

## 7. Operaciones y lifecycle

| Operación canónica | Efecto esperado en Gravity |
|---|---|
| Crear Gene | Crear o confirmar nodo `GENE`; proyectar relaciones confirmadas |
| Crear Domain | Crear o confirmar nodo `DOMAIN` bajo su `MANDATE` de origen |
| Agregar relación | Crear o reactivar proyección idempotente |
| Quitar relación | Superseder la proyección; no reescribir `gen.json` |
| Renombrar Domain | No cambiar `nodeId`; no es necesario copiar el nombre |
| Merge de Domains | Superseder nodos fuente y sus relaciones; crear/confirmar destino |
| Split de Domain | Superseder nodo fuente y sus relaciones; crear/confirmar destinos |
| Retry sin cambio canónico | No producir duplicados ni incrementar versiones sin mutación efectiva |

La creación o actualización del nodo `GENE` ocurre sólo después de `CANONICAL COMMIT`. Una identidad
ratificada sin revisión material verificada todavía no puede presentarse como Gene Gravity Projection
vigente. Un fallo de Gravity no revierte ni invalida el commit canónico; queda como divergencia pendiente
de reconciliación desde la fuente.

## 8. Exclusión explícita de la resolución de posturas

`ResolveActive` debe aceptar únicamente nodos pertenecientes al spine de Criterion. Encontrar un `DOMAIN` o `GENE` dentro de una spine de sesión debe considerarse una violación de integridad, no una rama válida del recorrido.

La introducción de estos tipos no modifica:

- precedencia jerárquica;
- cálculo de Masa;
- filtrado por `appliesTo`;
- caché de spine;
- lectura fresca de `gravityPostures[]`;
- contrato de `resolveActiveGravityActivity`.

## 9. Creación fail-closed

No debe ampliarse `Store.CreateNode` para aceptar libremente `DOMAIN` o `GENE` como si fueran `PROJECT`, `MANDATE` o `SESSION`.

Antes de habilitarlos deben definirse:

- operación específica de materialización;
- actor autorizado;
- evidencia canónica requerida;
- validación de pertenencia al Nucleus;
- semántica de CAS y retry;
- atomicidad o reconciliación ante escritura parcial;
- `reason_code` proveniente del módulo de Authorization, si corresponde.

Hasta entonces, cualquier intento de creación debe rechazarse por diseño.

## 10. Condiciones mínimas para pasar a implementación

1. Actualizar y ratificar el boundary normativo de GravityGraph.
2. Actualizar la spec de persistencia de Gravity.
3. Alinear `ing` y `dis` con el efecto de materialización.
4. Resolver la ruta canónica de Nucleus usada por `IntentManager`.
5. Ratificar el schema final de nodos y aristas.
6. Ratificar la gate de autorización y el dueño del materializador.
7. Definir estrategia de concurrencia sobre `.semantic-index.json`.
8. Definir pruebas de idempotencia, divergencia, merge, split y referencias inválidas.
9. Presentar y aprobar la lista exacta de archivos de implementación.

Hasta cumplir estas condiciones, el estado correcto es **arquitectura consolidada, implementación no autorizada**.
