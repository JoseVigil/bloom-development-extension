# Contrato propuesto — `DOMAIN` y `GENE` en `GravityGraph`

**Versión:** v0.1  
**Fecha:** 2026-09-02  
**Estado:** propuesta consolidada para ratificación; no implementada  
**Naturaleza:** contrato técnico de coordinación, subordinado a las especificaciones normativas que deberán actualizarse

## 1. Invariantes

1. `DOMAIN` y `GENE` son nodos de primer orden del `GravityGraph`.
2. Son nodos estructurales, no portadores de Criterion.
3. `gravityPostures[]` debe estar vacío en ambos tipos.
4. Ninguno participa de `ResolveActive` ni de su spine cacheado.
5. Solo existe una raíz: `NUCLEUS`.
6. Todo `DOMAIN` pertenece a una instancia `.nucleus-{organization}` concreta.
7. Todo `GENE` referencia un único `gen.json` canónico y conserva el Mandate que lo originó.
8. `.semantic-index.json` es la única fuente de verdad de Domain↔Gene y Domain↔Mandate.
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

Las referencias deben ser relativas a la raíz de la instancia Nucleus y resolverse mediante rutas controladas. No deben aceptar rutas que escapen de esa raíz.

### 2.3 Restricciones por tipo

| Tipo | `parentId` | Referencia obligatoria | Posturas | Spine |
|---|---|---|---|---|
| `DOMAIN` | ID de `NUCLEUS` | `domainRef` | Prohibidas | Excluido |
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
        ├── .domain/
        │   └── {domainId}/
        │       └── node.json
        ├── .organization/
        │   └── {organizationId}/
        │       └── .project/{projectId}/
        │           └── .mandate/{mandateId}/
        │               ├── node.json
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
  "parentId": "nucleus-node-id",
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

## 5. Relaciones proyectadas

### 5.1 Domain↔Gene

Representa que el `geneId` aparece en `domains[domainId].genes[]` del índice canónico.

### 5.2 Domain↔Mandate

Representa que el `mandateId` aparece en `domains[domainId].mandates[]` del índice canónico.

### 5.3 Propiedades mínimas necesarias

El formato final de archivo no queda ratificado aquí. Cualquier contrato posterior debe poder expresar, como mínimo:

- tipo de relación;
- IDs de ambos extremos;
- estado activo o supersedido;
- versión o huella del estado canónico del que fue proyectada;
- fecha de materialización;
- identificador idempotente estable.

No debe copiar nombres, centroides, funciones semánticas ni listas completas del índice.

## 6. Autoridad y resolución de conflictos

Orden de autoridad:

1. `gen.json` para identidad y linaje del Gene.
2. `.semantic-index.json` para existencia activa de Domains y relaciones Domain↔Gene/Domain↔Mandate.
3. `GravityGraph` para la representación gobernada y su historia estructural.

Si una arista Gravity contradice el índice:

- no se utiliza como fuente semántica;
- se marca la proyección como necesitada de reconciliación;
- se reconstruye desde el artefacto canónico;
- la divergencia debe quedar auditable.

## 7. Operaciones y lifecycle

| Operación canónica | Efecto esperado en Gravity |
|---|---|
| Crear Gene | Crear o confirmar nodo `GENE`; proyectar relaciones confirmadas |
| Crear Domain | Crear o confirmar nodo `DOMAIN` bajo `NUCLEUS` |
| Agregar relación | Crear o reactivar proyección idempotente |
| Quitar relación | Superseder la proyección; no reescribir `gen.json` |
| Renombrar Domain | No cambiar `nodeId`; no es necesario copiar el nombre |
| Merge de Domains | Superseder nodos fuente y sus relaciones; crear/confirmar destino |
| Split de Domain | Superseder nodo fuente y sus relaciones; crear/confirmar destinos |
| Retry sin cambio canónico | No producir duplicados ni incrementar versiones sin mutación efectiva |

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

