# Cognituum Gene — Concepto canónico v3.0

**Estado:** fuente conceptual canónica ratificada  
**Versión:** 3.0  
**Fecha:** 2026-09-17  
**Supersede:** `BTIPS_GENES_CONCEPT_v2_0.md`  
**Alcance:** contrato conceptual V1; no define persistencia física ni autoriza implementación

## 1. Decisión canónica

Un **Gene** es una identidad funcional durable y estable dentro de un Project. Su materialización se conserva mediante **Gene Revisions** inmutables y sus transformaciones se atribuyen a **Gene Contributions** gobernadas.

Un Mandate puede originar, modificar, dividir, fusionar, retirar o consumir un Gene, pero no es su propietario permanente. El Mandate y el Intent de origen permanecen como provenance inmutable.

La identidad funcional, su estado material y la acción gobernada que lo transforma son piezas distintas:

```text
Gene
├── identidad funcional durable
├── current_revision_id → Gene Revision ratificada
└── origin → Mandate + Intent + decisión

Gene Revision
└── estado material inmutable y verificable

Gene Contribution
└── propuesta o transformación atribuible a Mandate + Intent
```

## 2. Glosario canónico

### 2.1 Gene

Identidad funcional durable reconocida por Cognituum dentro de un Project. Representa una función, no una lista mutable de paths, un embedding, un Domain, un módulo, un Mandate ni una arista Gravity.

La identidad de un Gene sobrevive a cambios de Mandate, archivos, layout, modelo de embeddings y proyecciones derivadas, siempre que la continuidad funcional sea ratificada.

### 2.2 Gene Revision

Estado material inmutable y verificable de un Gene. Conserva como una unidad:

- función declarada;
- activos constitutivos;
- relaciones mínimas necesarias;
- digests observados;
- provenance;
- ratificación.

Una corrección o transformación produce una Gene Revision nueva. Una revisión ratificada nunca se modifica.

### 2.3 Gene Contribution

Propuesta o transformación atribuible a un Mandate e Intent. Declara:

- Gene afectado, o intención de crear uno;
- revisión base, cuando exista;
- cambios pretendidos;
- evidencia;
- decisión humana aplicable.

Una Contribution no se convierte automáticamente en Revision. Debe materializarse, verificarse y ratificarse.

### 2.4 Gene Semantic Projection

Representación derivada, descartable y reconstruible de una Gene Revision ratificada. BISP/Chroma puede utilizarla para descubrimiento semántico.

Una coincidencia produce un `semantic_candidate`. No crea identidad, pertenencia, continuidad ni relaciones canónicas.

### 2.5 Gene Gravity Projection

Referencia estructural gobernada de un Gene y de la revisión observada dentro de GravityGraph.

GravityGraph puede conservar referencias, relaciones, fingerprints, versiones de proyección y supersession. No es autoridad del estado rico, scope, función, activos, linaje ni embedding del Gene.

### 2.6 Domain

Identidad durable de un territorio funcional o conceptual dentro del Project. Puede relacionarse N:M con Genes. El Mandate que lo origina aporta provenance; no ownership permanente.

### 2.7 Activo constitutivo

Activo cuya ausencia o sustitución altera materialmente cómo se realiza la función del Gene. En V1 los tipos admitidos son `file`, `document` y `test`.

### 2.8 Revisión vigente y revisión capturada

`current_revision_id` identifica la revisión vigente del Gene. Una Location puede conservar otra revisión como `captured_revision`; reabrirla no reescribe la captura para apuntar automáticamente a la revisión actual.

## 3. Alcance V1

En V1:

- un Gene es estable dentro de un Project;
- puede abarcar varios Repositories del mismo Project;
- puede relacionarse N:M con Domains;
- puede recibir Contributions de múltiples Mandates;
- no cruza Projects ni Organizations;
- admite activos `file`, `document` y `test`;
- Git aporta evidencia material y temporal, no autoridad funcional;
- la fuente canónica rica vive a nivel Nucleus;
- el nombre y layout físico de esa fuente permanecen pendientes;
- `.cache/.semantic-index.json` no es la fuente canónica definitiva;
- BISP y GravityGraph consumen proyecciones derivadas;
- Location puede capturar `Gene + captured_revision`;
- Orrery representa Gene como entidad y usa curvas o enlaces para relaciones.

Quedan fuera de V1:

- Symbols y fragments;
- ADR genérico y notas como tipos de activo;
- commit como activo constitutivo;
- relaciones Gene–Gene;
- cruces cross-Project o cross-Organization;
- ontología completa de activos.

## 4. Invariantes

1. `gene_id` es estable y nunca se reutiliza.
2. El Project forma parte del boundary de identidad V1.
3. El origen del Gene es inmutable.
4. El origen identifica Mandate, Intent y decisión ratificadora; no implica ownership permanente.
5. `current_revision_id` sólo puede señalar una Gene Revision ratificada.
6. Una Gene Revision ratificada es inmutable.
7. Una Gene Contribution declara `base_revision_id` cuando modifica un Gene existente.
8. Si la revisión vigente ya no coincide con `base_revision_id`, la Contribution queda en conflicto y no se aplica automáticamente.
9. Cambiar `current_revision_id` es una operación atómica protegida mediante revisión observada o compare-and-swap.
10. La pérdida o corrupción de BISP, Chroma, GravityGraph, Location u Orrery no elimina ni invalida el Gene canónico.
11. La similitud semántica nunca prueba pertenencia.
12. Git nunca decide qué constituye un Gene.
13. Domain↔Gene es N:M y requiere ratificación y provenance propios.
14. Un Mandate cerrado no vuelve huérfano automáticamente a un Gene vivo.
15. Las proyecciones derivadas siempre se reconcilian desde la fuente canónica, nunca al revés.

## 5. Lifecycle

El recorrido documental normativo es:

```text
PROPOSED
→ RATIFIED IDENTITY
→ MATERIALIZED REVISION
→ VERIFIED REVISION
→ CANONICAL COMMIT
→ CURRENT
→ SUPERSEDED
```

### 5.1 Propuesta

ING, DIS u otro productor autorizado puede proponer crear un Gene o transformar uno existente. La propuesta identifica la función pretendida, la revisión base y la evidencia disponible.

### 5.2 Ratificación de identidad

La decisión humana autoriza la identidad, función y relaciones pretendidas. No prueba que los activos existan ni publica una revisión como vigente.

### 5.3 Materialización post-merge

Después de aplicar cambios materiales, el sistema observa los activos reales, sus referencias y digests. El merge aporta evidencia del resultado; no decide por sí solo qué función representa.

### 5.4 Verificación

La verificación compara la decisión ratificada con el estado material observado. Debe detectar al menos activos ausentes, digests divergentes, referencias no resolubles y conflicto de revisión base.

### 5.5 Commit canónico

Una revisión verificada se publica como unidad inmutable. El cambio de `current_revision_id` ocurre de manera atómica. Un fallo anterior a este punto no puede dejar una revisión parcial presentada como vigente.

### 5.6 Current y supersession

La nueva revisión pasa a `CURRENT`; la anterior queda `SUPERSEDED`. Supersession conserva historia y resolución. No implica borrar la revisión anterior.

### 5.7 Cambios posteriores

Todo cambio posterior comienza con una Gene Contribution nueva y declara la revisión base. No se edita una revisión ratificada.

## 6. Identidad, concurrencia y continuidad

Una Contribution concurrente sólo puede publicarse si su `base_revision_id` sigue siendo vigente. Si no coincide:

```text
contribution.base_revision_id != gene.current_revision_id
→ conflict
→ no auto-apply
→ nueva evaluación o ratificación humana
```

Dividir o fusionar funcionalidad no se resuelve copiando archivos ni por similitud:

- un split requiere decidir si continúan una, varias o ninguna identidad previa;
- un merge requiere decidir si sobrevive una identidad o nace una nueva;
- las revisiones y Contributions conservan el provenance de esa decisión;
- ningún ID retirado se reutiliza.

## 7. Fronteras

### 7.1 Project y Repository

El Project delimita la identidad V1. Un Gene puede materializarse en varios Repositories del mismo Project. Toda referencia repository-scoped debe identificar explícitamente el Repository; Project no implica un único Repository.

### 7.2 Mandate

Mandate gobierna una Contribution y puede originar o consumir un Gene. No contiene ni posee permanentemente su identidad. El origen histórico no cambia cuando Mandates posteriores producen revisiones nuevas.

### 7.3 Intent

Intent aporta la unidad de trabajo y evidencia que produce una Contribution. Una finalización de Intent no publica por sí sola una Revision: deben completarse materialización, verificación y commit canónico.

### 7.4 Domain

Domain y Gene tienen identidad independiente. Su vínculo N:M es una relación ratificada con provenance y vigencia propias. Domain no se almacena como campo singular dentro del Gene.

### 7.5 GravityGraph

GravityGraph consume estado canónico ratificado y produce Gene Gravity Projections. Su versión registra la proyección, no sustituye la Gene Revision. Ante divergencia, la fuente canónica gana y Gravity queda pendiente de reconciliación.

DOMAIN y GENE siguen excluidos de Postures, spine, precedencia y Masa.

### 7.6 BISP y Chroma

BISP puede generar y consultar Gene Semantic Projections. La proyección debe conservar como mínimo Gene, revisión, digest canónico, modelo y provenance de indexación. Cambiar o perder el índice no cambia la identidad del Gene.

### 7.7 Location

Location puede capturar un Gene y una `captured_revision`. Al reabrir, compara esa revisión con la vigente y reporta resolución o cambio sin alterar retrospectivamente la captura.

### 7.8 Orrery

Orrery consume proyecciones read-only. Gene se representa como entidad. Curvas, enlaces o trayectorias representan relaciones o navegación, no al Gene mismo. Un candidato semántico debe distinguirse de una relación ratificada.

## 8. Fuente canónica y proyecciones

La fuente rica canónica debe residir a nivel Nucleus y preservar:

- identidad Gene;
- revisiones inmutables;
- Contributions gobernadas;
- identidad Domain;
- relaciones Domain↔Gene ratificadas;
- provenance y control de concurrencia.

Este documento no decide su ruta, layout, schema JSON, store ni writer físico.

`.cache/.semantic-index.json` puede operar transitoriamente como estructura de compatibilidad para Domain↔Gene, pero no es la fuente canónica definitiva de v3.0. Debe poder convertirse en una vista reconstruible.

## 9. Compatibilidad con documentación anterior

| Fuente anterior | Compatibilidad v3.0 |
|---|---|
| `BTIPS_GENES_CONCEPT_v2_0.md` | Histórico. Se conservan función, scope y linaje como preocupaciones válidas, pero el Gene deja de ser propiedad vitalicia del Mandate y su estado se separa en revisiones y Contributions. |
| `ING_Intent_Spec_v1_1.md` | Sus fases siguen vigentes. La decisión humana autoriza una Contribution; la revisión se materializa y verifica después del merge antes del commit canónico. |
| `DIS_Intent_Spec_v1_0.md` | Conserva operaciones Domain. Los cambios funcionales sobre Genes se expresan como Contributions; DIS no muta revisiones ratificadas. |
| Contrato GravityGraph Domain/Gene | Se conserva el carácter referencial, idempotente y reconstruible. Las referencias deben evolucionar para observar Gene y revisión canónicas, no una propiedad permanente del Mandate. |
| `.cache/.semantic-index.json` | Compatibilidad transitoria. Deja de ser destino canónico definitivo. |
| BISP/Chroma | Infraestructura reutilizable para descubrimiento. Nunca autoridad Gene. |

## 10. Contradicciones resueltas

1. **Gene del Mandate vs. función durable:** el Mandate origina o contribuye; no posee permanentemente.
2. **Ratificación vs. materialización:** la ratificación autoriza; post-merge observa; verificación compara; commit publica.
3. **Merge como fuente de verdad funcional:** merge prueba qué cambió materialmente, no qué función constituye.
4. **`gen.json` mutable vs. historia:** la identidad apunta a revisiones inmutables; las correcciones crean revisiones nuevas.
5. **Embedding como identidad:** el vector es una proyección descartable de una revisión.
6. **Gravity como Gene rico:** Gravity conserva referencias y estado de proyección, no el contenido canónico.
7. **Mandate cerrado como Gene huérfano:** el cierre del Mandate no determina el lifecycle funcional.
8. **Domain en el Gene:** la pertenencia vive como relación N:M ratificada.

## 11. Decisiones físicas pendientes

Quedan expresamente pendientes:

- nombre y ruta física de la fuente canónica Nucleus-level;
- schemas persistidos;
- store y locking;
- identidad física de Gene Revision y Gene Contribution;
- protocolo CAS y recuperación ante crash;
- comandos, endpoints y Activities;
- materializador mínimo;
- migración desde `.mandates/{id}/.genes/`;
- transición de `.cache/.semantic-index.json` a vista derivada;
- invalidación y garbage collection de proyecciones;
- schemas de Location;
- integración de Orrery;
- política posterior a V1 para symbols, fragments y relaciones Gene–Gene.

## 12. Roadmap documental hacia el materializador mínimo

1. Ratificar vocabulario, estados e invariantes de v3.0.
2. Definir el contrato lógico de persistencia sin escoger todavía implementación.
3. Definir identidad de activos `file`, `document` y `test` con Project y Repository explícitos.
4. Definir atomicidad Contribution→Revision→current y recuperación.
5. Definir el seam de proyección hacia GravityGraph.
6. Definir el seam semántico hacia BISP/Chroma.
7. Especificar un vertical real con función, activos, tests, documentación, digests y provenance.
8. Sólo después presentar archivos, pruebas y autorización para el materializador mínimo.

El vertical de referencia recomendado es la proyección estructural Domain/Gene de Gravity, porque ya posee función delimitada, implementación, tests, documentación y provenance Git verificables.
