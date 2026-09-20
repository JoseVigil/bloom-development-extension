# LocationSnapshot v0.1 — propuesta de contrato físico para Orrery

**Estado:** propuesta contractual completa, pendiente de materialización.  
**Decisión de José:** aprobada la captura inmutable de referencias, relaciones y evidencias de versión observadas. No exige un snapshot global, atómico o históricamente recuperable de toda la ontología.

**Invariante:** Orrery describe dónde está el usuario; no interpreta para qué le servirá estar ahí.

## A. Auditoría contra la arquitectura física

### Fuentes verificadas

Rutas relativas a `C:\repos\bloom-development-extension`:

| Fuente | Evidencia relevante |
|---|---|
| `installer/nucleus/internal/authority/project_claim.go` | `ProjectClaim` y `ProjectBinding`: `tenantId`, `organizationId`, `projectId`, `revision`, `sourceRef`, `evidenceKind`, `claimedAt`; el binding agrega `checkedAt` y `validUntil`. |
| `backend/src/authority/project-claim.ts` | Persistencia y comprobación del claim y del vínculo soberano del Project. |
| `backend/src/authority/tenant-self-route.ts` | Resolución de Tenant asociado a Organization. |
| `installer/nucleus/internal/gravity/model.go` | `GravityNode`, `DomainRef`, `GeneRef`, `StructuralEdge`, `CanonicalSource`. |
| `installer/nucleus/internal/gravity/store.go` | Lectura y actualización de nodos con `NodeVersion` y `CompareAndSwap`. |
| `installer/nucleus/internal/gravity/structural_projection.go` | Relaciones `DOMAIN_GENE` y `DOMAIN_MANDATE`; estructura distinta de una única cadena de padres. |
| `installer/nucleus/internal/authority/snapshot.go` | Snapshot de autoridad; no snapshot de ontología. |
| `installer/conductor/workspace/core/orrery/src/data.ts` | Escena ficticia con identidades y relaciones de demostración. |
| `docs/ANALYSIS/ORRERY/LOCATION/ORRERY_LOCATION_MATERIAL_CLOSURE_v1_1.md` | Antecedente de Location, con resolución por referencia y estados adicionales de incertidumbre. |

La comprobación fue estática. No se ejecutaron servicios, capturas reales ni tests nuevos. No se verificó el estado actual de una instalación operativa.

### Resultado de la reconciliación

1. **Scope soberano:** existen identidades físicas para Tenant, Organization y Project. El antecedente del 15 de septiembre que excluía Tenant no describe todo el código actual.
2. **EntityRef:** no se encontró un contrato genérico reutilizable de Location. Se propone un sobre de referencia que conserva identidades existentes; no crea entidades.
3. **Versionado:** existe por fuente. La revisión del ProjectBinding versiona el vínculo; `NodeVersion` versiona un nodo Gravity; `EdgeVersion` versiona una arista. No son intercambiables.
4. **Relaciones:** `StructuralEdge` ya tiene identidad, tipo, extremos, estado, versión, fecha de materialización y fuente canónica con selector y fingerprint.
5. **Estructura:** `ParentID` no representa por sí solo Domain → Gene. Location necesita referencias y relaciones explícitas, no un único `path`.
6. **Snapshot global:** no se encontró infraestructura que respalde `ontology_snapshot_ref` o `ontology_version`.
7. **Historia:** conocer una versión anterior no garantiza poder recuperar su contenido.
8. **Orrery:** sus objetos de demostración no pueden convertirse automáticamente en referencias canónicas.

## B. Gaps concretos

- Falta el contrato físico de Location y su validación.
- Falta conectar selección real de Orrery con identidades canónicas.
- Faltan productor, persistencia y resolver de Location.
- Falta un adaptador de lectura que compruebe el scope soberano para esta captura.
- Falta integrar identidad humana y autorización de captura/resolución.
- No se demostró un recorrido productivo completo de Domain/Gene canónicos.
- El reconciliador estructural tiene llamadas en tests; no se encontró un caller productivo.
- No se demostró una referencia genérica estable para archivos, documentos o Artifacts que pueda incorporarse sin decidir un contrato adicional.
- No existe una garantía comprobada de lectura atómica entre las fuentes.
- No existe una garantía comprobada de recuperación histórica de todas las referencias.

Estos gaps no se resuelven agregando IDs ficticios, rutas inventadas o versiones globales sintéticas.

## C. Decisiones contractuales

### 1. Significado de snapshot

`LocationSnapshot` conserva de forma inmutable:

- scope soberano observado;
- selección explícita;
- contexto estructural observado;
- relaciones existentes incluidas;
- vecinos inmediatos incluidos;
- procedencia de cada inclusión;
- evidencia de estado por referencia y relación.

No promete un corte transaccional global ni retención del contenido histórico.

Se eliminan `ontology_snapshot_ref` y `ontology_version`. Se incorpora un intervalo de observación y evidencia individual, sin presentar el conjunto como snapshot de otro subsistema.

### 2. Identidad

`location_id` identifica exclusivamente la captura.

Las entidades conservan sus IDs existentes. Un ID local de la escena, un nombre visible o una coordenada no pueden sustituirlos.

La identidad de referencia dentro del contrato es la tupla:

`(source, type, id)`

El scope de la captura contextualiza su resolución. Si una fuente no puede resolver inequívocamente esa tupla dentro del scope, no es admisible como referencia válida de captura.

### 3. Tipos y soporte

| Referencia propuesta | Base física | Admisión en v0.1 |
|---|---|---|
| Tenant / authority | TenantID y vínculo con Organization | Scope obligatorio; no implica un resolver Location ya implementado. |
| Organization / authority | OrganizationID canónico | Scope obligatorio. |
| Project / authority | ProjectID y ProjectBinding | Scope obligatorio; anchor admisible cuando el adaptador compruebe identidad y pertenencia. |
| Nodos / gravity | `NodeID`, `NodeType`, `NodeVersion` | Admisibles como referencias a nodos Gravity existentes, sujetos a autorización y pertenencia comprobadas. |
| Domain/Gene canónicos | Referencias parciales y proyección | No declarados soportados como contenido canónico. Un nodo Gravity DOMAIN/GENE sigue siendo una referencia a esa proyección. |
| Archivo, documento, Artifact | Sin contrato genérico comprobado en esta auditoría | Fuera del enum v0.1; no inventar resolución por ruta o nombre. |

Reconocer físicamente otros nodos Gravity no abre casos de uso ni autoriza modificar sus subsistemas.

### 4. Cardinalidades

| Campo | Obligación |
|---|---|
| `schema_version`, `location_id`, `captured_at` | Exactamente uno. |
| `scope` | Exactamente un Tenant, una Organization, un Project y evidencia de su binding. |
| `anchors` | Uno o más; sin identidades duplicadas. |
| `structural_position.ancestors` | Cero o más; únicamente ancestros comprobados necesarios. |
| `relations` | Cero o más; cada una respaldada por un hecho existente. |
| `neighbors` | Cero o más; cada uno conectado directamente con al menos un anchor. |
| `observation` | Exactamente un intervalo y declaración de consistencia no atómica. |

Las listas vacías deben serializarse. No significan por sí solas que la ontología carezca de otras relaciones.

### 5. Provenance

- Anchor: `user_anchor`.
- Ancestro incluido por estructura: `structural_ancestor`.
- Vecino incluido por una relación directa: `direct_relation`.

Una misma entidad puede aparecer en categorías distintas cuando cumple ambas funciones. Las apariciones deben conservar evidencia compatible. No se cambia un anchor a vecino para simplificar la representación.

La provenance de inclusión no sustituye la provenance del hecho fuente.

### 6. Relaciones

Se admiten dos representaciones:

- **Arista física existente:** reutiliza `StructuralEdge`, sin renombrar su identidad ni recalcular su fingerprint.
- **Vínculo de padre existente:** referencia al `ParentID` del nodo hijo y su `NodeVersion`. No se inventa un `edgeId` para ese campo.

El nombre discriminador `gravity_parent` identifica la forma de evidencia serializada; no crea una relación ontológica nueva.

Las relaciones del scope se respaldan mediante ProjectBinding, sin convertirlo en una arista Gravity.

### 7. Neighborhood

Un vecino debe ser extremo de una relación incluida cuyo otro extremo sea un anchor.

No se recorren relaciones del vecino para expandir otro grado. No se busca relevancia ni se aplican embeddings.

v0.1 conserva un neighborhood observado, no garantiza inventariar exhaustivamente todas las relaciones existentes. Si una relación requerida para reconstruir la posición no puede verificarse, la captura no debe declararse completa.

### 8. Vista y estructura

`view_context` queda fuera de v0.1: no es necesario para el caso fundacional.

`structural_position.path` se reemplaza por ancestros referenciados y relaciones explícitas. Se preserva estructura no arbórea sin depender del orden visual.

### 9. Inmutabilidad y resolución

La resolución posterior produce un diagnóstico separado. Nunca modifica la captura original.

Un cambio de selección produce otra Location. Una comprobación posterior de la misma captura no cambia `location_id` ni sus evidencias.

## D. Propuesta final de LocationSnapshot v0.1

La forma física es:

```text
LocationSnapshot
  schema_version = "0.1"
  location_id
  captured_at
  scope
    tenant_ref
    organization_ref
    project_ref
    binding_evidence
  anchors[]
    ref
    origin = user_anchor
  structural_position
    ancestors[]
      ref
      origin = structural_ancestor
  relations[]
    StructuralEdge observada
    o ParentID observado
  neighbors[]
    ref
    origin = direct_relation
  observation
    started_at
    completed_at
    consistency = non_atomic
```

Cada `ref` contiene identidad, fuente y evidencia observada. Las referencias Gravity guardan la versión del nodo, no su contenido ni sus Postures.

Para autoridad, la evidencia del scope conserva el ProjectBinding observado. Su revisión no se presenta como versión de Tenant, Organization o contenido del Project.

### Resolución posterior

El resolver debe devolver un resultado por referencia y por relación comprobada, correlacionado con su posición en el documento. El formato físico de ese diagnóstico no forma parte de este schema de captura.

| Estado | Significado y conducta |
|---|---|
| `resolved` | Equivalente a valid/current: identidad y evidencia pertinente comprobadas, sin diferencia detectada. Solo afirma lo verificable en esa fuente. |
| `changed` | Misma identidad; revisión o hecho pertinente diferente. Conservar ambos valores en el diagnóstico, sin sustituir la captura. |
| `stale` | La evidencia disponible está vencida o hay evidencia de que una proyección está atrasada. No equivale a contenido cambiado. |
| `missing` | Fuente autoritativa consultada con permisos suficientes confirma ausencia. |
| `unauthorized` | Denegación de acceso comprobada. No revelar información adicional de la entidad. |
| `ambiguous` | Más de una correspondencia posible o identidad/pertenencia contradictoria. No elegir por similitud. |
| `unsupported` | Versión de contrato o capacidad de resolución no implementada. |
| `unverifiable` | La fuente no permite concluir: indisponibilidad, evidencia insuficiente u otro fallo no clasificable. |

Un fallo de red no es `missing`. Un timeout no es `unauthorized`. Un timestamp antiguo, sin política de vigencia aplicable, no basta para declarar `stale`.

Si se detecta una diferencia y además hay limitaciones de vigencia, el diagnóstico debe conservar ambas evidencias; un resumen no puede ocultarlas.

## E. JSON Schema versionado

Propuesta con JSON Schema Draft 2020-12. No se inventa una URL `$id`: su ubicación autoritativa debe decidirse al materializar el archivo.

El schema valida forma y tipos. Las comprobaciones de pertenencia, conexión, identidad y autorización indicadas después son obligatorias y no pueden resolverse solo con JSON Schema.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "LocationSnapshot v0.1",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schema_version",
    "location_id",
    "captured_at",
    "scope",
    "anchors",
    "structural_position",
    "relations",
    "neighbors",
    "observation"
  ],
  "properties": {
    "schema_version": { "const": "0.1" },
    "location_id": { "$ref": "#/$defs/text" },
    "captured_at": { "type": "string", "format": "date-time" },
    "scope": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "tenant_ref",
        "organization_ref",
        "project_ref",
        "binding_evidence"
      ],
      "properties": {
        "tenant_ref": {
          "allOf": [
            { "$ref": "#/$defs/authorityRef" },
            { "properties": { "type": { "const": "TENANT" } } }
          ]
        },
        "organization_ref": {
          "allOf": [
            { "$ref": "#/$defs/authorityRef" },
            { "properties": { "type": { "const": "ORGANIZATION" } } }
          ]
        },
        "project_ref": {
          "allOf": [
            { "$ref": "#/$defs/authorityRef" },
            { "properties": { "type": { "const": "PROJECT" } } }
          ]
        },
        "binding_evidence": { "$ref": "#/$defs/projectBinding" }
      }
    },
    "anchors": {
      "type": "array",
      "minItems": 1,
      "uniqueItems": true,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["ref", "origin"],
        "properties": {
          "ref": {
            "oneOf": [
              { "$ref": "#/$defs/gravityRef" },
              {
                "allOf": [
                  { "$ref": "#/$defs/authorityRef" },
                  { "properties": { "type": { "const": "PROJECT" } } }
                ]
              }
            ]
          },
          "origin": { "const": "user_anchor" }
        }
      }
    },
    "structural_position": {
      "type": "object",
      "additionalProperties": false,
      "required": ["ancestors"],
      "properties": {
        "ancestors": {
          "type": "array",
          "uniqueItems": true,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["ref", "origin"],
            "properties": {
              "ref": { "$ref": "#/$defs/gravityRef" },
              "origin": { "const": "structural_ancestor" }
            }
          }
        }
      }
    },
    "relations": {
      "type": "array",
      "uniqueItems": true,
      "items": {
        "oneOf": [
          { "$ref": "#/$defs/edgeObservation" },
          { "$ref": "#/$defs/parentObservation" }
        ]
      }
    },
    "neighbors": {
      "type": "array",
      "uniqueItems": true,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["ref", "origin"],
        "properties": {
          "ref": { "$ref": "#/$defs/gravityRef" },
          "origin": { "const": "direct_relation" }
        }
      }
    },
    "observation": {
      "type": "object",
      "additionalProperties": false,
      "required": ["started_at", "completed_at", "consistency"],
      "properties": {
        "started_at": { "type": "string", "format": "date-time" },
        "completed_at": { "type": "string", "format": "date-time" },
        "consistency": { "const": "non_atomic" }
      }
    }
  },
  "$defs": {
    "text": {
      "type": "string",
      "minLength": 1
    },
    "nodeType": {
      "enum": [
        "NUCLEUS",
        "ORGANIZATION",
        "PROJECT",
        "MANDATE",
        "SESSION",
        "DOMAIN",
        "GENE"
      ]
    },
    "nodeKey": {
      "type": "object",
      "additionalProperties": false,
      "required": ["source", "type", "id"],
      "properties": {
        "source": { "const": "gravity" },
        "type": { "$ref": "#/$defs/nodeType" },
        "id": { "$ref": "#/$defs/text" }
      }
    },
    "authorityRef": {
      "type": "object",
      "additionalProperties": false,
      "required": ["source", "type", "id", "evidence"],
      "properties": {
        "source": { "const": "authority" },
        "type": { "enum": ["TENANT", "ORGANIZATION", "PROJECT"] },
        "id": { "$ref": "#/$defs/text" },
        "evidence": {
          "type": "object",
          "additionalProperties": false,
          "required": ["kind"],
          "properties": {
            "kind": { "const": "scope_project_binding" }
          }
        }
      }
    },
    "gravityRef": {
      "type": "object",
      "additionalProperties": false,
      "required": ["source", "type", "id", "evidence"],
      "properties": {
        "source": { "const": "gravity" },
        "type": { "$ref": "#/$defs/nodeType" },
        "id": { "$ref": "#/$defs/text" },
        "evidence": {
          "type": "object",
          "additionalProperties": false,
          "required": ["kind", "node_version", "observed_at"],
          "properties": {
            "kind": { "const": "gravity_node" },
            "node_version": {
              "type": "integer",
              "minimum": 1,
              "maximum": 9007199254740991
            },
            "observed_at": {
              "type": "string",
              "format": "date-time"
            }
          }
        }
      }
    },
    "projectBinding": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "status",
        "organizationId",
        "tenantId",
        "projectId",
        "revision",
        "sourceRef",
        "evidenceKind",
        "claimedAt",
        "validUntil",
        "checkedAt"
      ],
      "properties": {
        "status": { "const": "bound" },
        "organizationId": { "$ref": "#/$defs/text" },
        "tenantId": { "$ref": "#/$defs/text" },
        "projectId": { "$ref": "#/$defs/text" },
        "revision": { "const": "1" },
        "sourceRef": {
          "type": "string",
          "pattern": "^installation:.+$"
        },
        "evidenceKind": { "const": "canonical" },
        "claimedAt": { "type": "string", "format": "date-time" },
        "validUntil": { "type": "string", "format": "date-time" },
        "checkedAt": { "type": "string", "format": "date-time" }
      }
    },
    "canonicalSource": {
      "type": "object",
      "additionalProperties": false,
      "required": ["path", "selector", "fingerprint"],
      "properties": {
        "path": { "$ref": "#/$defs/text" },
        "selector": { "$ref": "#/$defs/text" },
        "fingerprint": { "$ref": "#/$defs/text" }
      }
    },
    "structuralEdge": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "edgeId",
        "edgeType",
        "fromNodeId",
        "toNodeId",
        "status",
        "canonicalSource",
        "materializedAt",
        "edgeVersion"
      ],
      "properties": {
        "edgeId": { "$ref": "#/$defs/text" },
        "edgeType": { "enum": ["DOMAIN_GENE", "DOMAIN_MANDATE"] },
        "fromNodeId": { "$ref": "#/$defs/text" },
        "toNodeId": { "$ref": "#/$defs/text" },
        "status": { "const": "active" },
        "canonicalSource": { "$ref": "#/$defs/canonicalSource" },
        "materializedAt": {
          "type": "string",
          "format": "date-time"
        },
        "edgeVersion": {
          "type": "integer",
          "minimum": 1,
          "maximum": 9007199254740991
        }
      }
    },
    "edgeObservation": {
      "type": "object",
      "additionalProperties": false,
      "required": ["kind", "edge", "observed_at"],
      "properties": {
        "kind": { "const": "gravity_structural_edge" },
        "edge": { "$ref": "#/$defs/structuralEdge" },
        "observed_at": { "type": "string", "format": "date-time" }
      }
    },
    "parentObservation": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "kind",
        "child",
        "parent",
        "child_node_version",
        "observed_at"
      ],
      "properties": {
        "kind": { "const": "gravity_parent" },
        "child": { "$ref": "#/$defs/nodeKey" },
        "parent": { "$ref": "#/$defs/nodeKey" },
        "child_node_version": {
          "type": "integer",
          "minimum": 1,
          "maximum": 9007199254740991
        },
        "observed_at": { "type": "string", "format": "date-time" }
      }
    }
  }
}
```

### Validaciones semánticas obligatorias

1. Los tres IDs del binding deben coincidir exactamente con `scope`.
2. El binding debe haber sido comprobado por el adaptador autorizado; copiar un JSON no demuestra autenticidad.
3. `claimedAt ≤ checkedAt ≤ captured_at < validUntil` para una captura nueva aceptada.
4. `started_at ≤ completed_at ≤ captured_at`; las observaciones individuales deben estar dentro del intervalo.
5. Toda referencia autoridad usada como anchor debe ser exactamente el Project del scope.
6. Toda referencia Gravity debe resolver a su tipo e identidad declarados.
7. Debe comprobarse pertenencia al Project o condición de ancestro soberano. No inferirla por nombres.
8. Los extremos de cada relación deben estar presentes entre anchors, ancestros o vecinos.
9. `DOMAIN_GENE` debe conectar DOMAIN con GENE; `DOMAIN_MANDATE`, DOMAIN con MANDATE.
10. El `ParentID` leído debe coincidir con `parent.id`; la versión del hijo debe coincidir con la evidencia capturada.
11. Cada vecino debe tener relación directa con un anchor.
12. Cada ancestro debe estar respaldado por una cadena estructural comprobada hacia un anchor; no admitir elementos desconectados.
13. No puede haber duplicados por identidad dentro de una categoría, aunque sus timestamps sean distintos.
14. Una misma entidad repetida entre categorías no puede tener versiones contradictorias en una captura aceptada.
15. Una relación se incluye porque reconstruye estructura o conecta directamente un anchor; no por relevancia inferida.
16. Los números de versión deben conservarse sin pérdida. El límite numérico del schema asegura interoperabilidad JSON con JavaScript; un valor mayor debe rechazarse, nunca redondearse.
17. El validador debe activar comprobación efectiva de `format: date-time`.
18. Las rutas de fuente son localizadores subordinados al resolver, no autorización para leer cualquier archivo. Deben comprobarse contra la raíz autorizada.

Estas reglas no garantizan atomicidad. Si durante la captura se detecta una contradicción, se rechaza o reinicia la captura; no se entrega como coherente.

## F. Recorrido E2E del caso fundacional

Este es el recorrido que deberá implementarse y comprobarse; no se afirma que hoy funcione de extremo a extremo.

### 1. Navegación

El usuario abre un Project. El adaptador obtiene su identidad canónica y comprueba el vínculo Tenant–Organization–Project.

Un nombre visible o una ruta no bastan. Si el vínculo no puede comprobarse, se informa el impedimento y no se fabrica una Location válida.

### 2. Selección

Orrery conserva uno o más elementos señalados explícitamente.

Cada elemento debe estar asociado a una referencia física admisible. Los objetos ficticios del prototipo no pasan esta frontera.

### 3. Captura

- Fijar la selección que se capturará.
- Registrar inicio de observación.
- Comprobar acceso a las fuentes.
- Leer referencias y evidencias de los anchors.
- Obtener únicamente ancestros necesarios y relaciones existentes pertinentes.
- Incorporar vecinos de primer grado respaldados por esas relaciones.
- Registrar fin de observación.
- Validar forma y reglas semánticas.
- Asignar identidad de captura y `captured_at`.

Si cambia la selección durante el proceso, no mezclar ambas selecciones en una Location.

Si falta evidencia necesaria para reconstruir la posición, devolver un error de captura con causa; no una captura incompleta presentada como válida.

### 4. Serialización

Serializar como JSON UTF-8 conforme a v0.1.

No incluir contenido de archivos, documentos, Artifacts, Postures ni respuestas de modelos. No incluir coordenadas o cámara.

### 5. Persistencia/transmisión

El mismo JSON puede persistirse o transmitirse sin depender de memoria de la UI.

La implementación deberá garantizar escritura completa, recuperación por identidad y rechazo de colisiones de `location_id` con contenido distinto.

El directorio, propietario y mecanismo concreto de persistencia todavía no se han decidido. No usar Gravity como store de Location por conveniencia.

### 6. Resolución

- Leer y validar la captura.
- Comprobar autorización actual.
- Resolver scope, referencias y relaciones con sus fuentes.
- Comparar las evidencias disponibles con las capturadas.
- Producir diagnósticos separados.
- Preservar siempre la captura original.

No recuperar contenido histórico por suposición. Si solo se dispone del estado actual, declararlo.

La reconstrucción de posición utiliza identidades y relaciones, por lo que otro layout puede representar la misma captura.

## G. Tests contractuales mínimos

| Test | Resultado esperado |
|---|---|
| Project como único anchor, scope válido, listas vacías | Válido; no presupone ausencia de relaciones fuera de la captura. |
| Dos anchors válidos con una relación compartida | Conserva ambos sin duplicar identidades o perder provenance. |
| Cero anchors | Rechazo por schema. |
| Tenant/Organization/Project discordantes con binding | Rechazo semántico. |
| Binding vencido al capturar | Rechazo de captura nueva. |
| ID ficticio de Orrery sin correspondencia física | Rechazo; no promoción automática. |
| Domain y Gene conectados por arista, con padres de origen | Preservación de ambas formas estructurales; no reducción a un path. |
| Vecino conectado solo con otro vecino | Rechazo: expansión de segundo grado. |
| Ancestro sin cadena comprobable hacia un anchor | Rechazo. |
| Relación con extremos ausentes o tipos incorrectos | Rechazo. |
| Versiones contradictorias de una entidad durante la captura | Rechazo o reinicio; nunca éxito silencioso. |
| Campos de contenido completo, coordenadas o `view_context` | Rechazo por campos no admitidos. |
| Round-trip JSON | Mismas identidades, evidencias, relaciones y provenance. |
| Reinicio y lectura durable | Recuperación de la misma captura, cuando se implemente el store. |
| Escritura interrumpida o colisión de ID con contenido distinto | No devolver éxito ni sustituir una captura previa. |
| Misma versión y comprobación vigente | `resolved`. |
| Misma identidad con versión distinta | `changed`, captura intacta. |
| Evidencia vencida o proyección comprobablemente atrasada | `stale`. |
| Ausencia confirmada por fuente autorizada | `missing`. |
| Denegación comprobada | `unauthorized`, sin filtración adicional. |
| Fuente caída | `unverifiable`, nunca `missing`. |
| Correspondencias contradictorias | `ambiguous`, sin elección automática. |
| Capacidad de resolución no implementada | `unsupported`. |
| Schema desconocido | Rechazo explícito de versión; no reinterpretación como v0.1. |
| Layout o coordenadas diferentes | La identidad y posición estructural reconstruidas no cambian. |

No se ejecutaron estos tests. Son los criterios de aceptación de la implementación posterior.

## H. Elementos descartados o postergados

### Descartados de v0.1

- Interpretación de intención.
- Relevancia, recomendaciones y scope afectado.
- Investigación del Project.
- Embeddings y expansión semántica.
- Neighborhood de más de un grado.
- Contenido completo de entidades o archivos.
- Coordenadas 3D y `view_context`.
- Un único `structural_position.path`.
- `ontology_snapshot_ref` sin infraestructura resoluble.
- `ontology_version` global inventada.
- Uso del snapshot de autoridad como snapshot ontológico.
- Creación de Postulates o Mandates.
- Evaluación o modificación de Gravity, Impact o Monitor.
- Diseño del consumidor de Location.

### Postergados con causa

- Domain/Gene canónicos: falta demostrar la cadena productiva y resoluble.
- Archivos, documentos y Artifacts como anchors: falta ratificar sus referencias estables.
- Snapshot atómico global y recuperación histórica: fuera de la garantía aprobada.
- Formato físico del diagnóstico de resolución: contrato separado; los estados quedan definidos aquí.
- Atribución humana durable dentro del payload: requiere elegir e integrar el canal de identidad; no sustituirlo por installation ID.
- Ubicación y propietario de schema, capturador, store y resolver: decisión pendiente antes de escribir archivos.

## Entrega a Cowork

Continuar desde esta propuesta y la interpretación de snapshot aprobada por José.

Antes de implementar:

1. Verificar las fuentes citadas y conservar la distinción entre capacidades existentes y adaptadores pendientes.
2. Revisar el schema y las reglas semánticas como una sola unidad contractual.
3. Presentar la lista exacta de archivos a crear o modificar para aprobación, conforme al `AGENTS.md`.
4. No introducir ontología, identidades, infraestructura histórica ni casos de uso adicionales.
5. No declarar soporte E2E hasta ejecutar el recorrido con referencias reales.

**Resultado de esta entrega:** el contrato candidato de captura queda especificado; la implementación y el soporte operativo siguen pendientes. Su garantía es conservar referencias, relaciones y evidencias observadas, con resolución posterior explícita y sin prometer un estado histórico global.