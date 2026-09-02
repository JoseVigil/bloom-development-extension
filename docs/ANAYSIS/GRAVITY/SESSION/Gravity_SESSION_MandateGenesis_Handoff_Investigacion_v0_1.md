# Handoff de investigación — Diseño de `SessionID` y nodo `SESSION` de Gravity para Mandate Genesis

**Fecha:** 2026-09-02  
**Repositorio:** `bloom-development-extension`  
**Modo de trabajo:** investigación de solo lectura  
**Cambios realizados:** ninguno  
**Destinatario:** Claude / próximo cowork de diseño o implementación

---

## 1. Resultado ejecutivo

La decisión vigente y ratificada es:

> **Un nodo Gravity `SESSION` representa una invocación completa de `MandateExecutionWorkflow`.**

El Workflow debe reutilizar el mismo `SessionID` durante toda la corrida. Un `DomainAction` no equivale a un turno y no debe generar su propia sesión.

Esta decisión es deliberadamente pragmática: la semántica documental original de `SESSION` describe una conversación viva y turno a turno, mientras que `MandateExecutionWorkflow` ejecuta actualmente un proceso batch sin negociación. La divergencia fue aceptada para permitir la integración actual y debe quedar documentada explícitamente cuando se implemente.

La decisión se encuentra registrada en:

- `docs/ANAYSIS/GRAVITY/SESSION/Investigacion_Gravity_SessionNode_MandateGenesis_v0_1.md:9`
- `docs/ANAYSIS/GRAVITY/SESSION/Investigacion_Gravity_SessionNode_MandateGenesis_v0_1.md:117-128`

La integración todavía no está lista para implementarse mecánicamente. Antes deben resolverse tres contratos:

1. Creación o garantía de la espina Gravity hasta `MANDATE`.
2. Procedencia y semántica de `IntentType`.
3. Semántica de `Turn` durante una ejecución batch.

---

## 2. Fuentes nuevas incorporadas

Se incorporaron dos documentos nuevos:

1. `docs/ANAYSIS/GRAVITY/SESSION/Investigacion_Gravity_SessionNode_MandateGenesis_v0_1.md`
2. `docs/ANAYSIS/GRAVITY/GRAFO/GravityGraph_Domains_Genes_Postures_Provenance_and_Persistence_Audit_v0_1.md`

El primero es la versión durable de la investigación sobre `SESSION`.

El segundo no modifica la elección de `SessionID`, pero agrega una restricción arquitectónica importante:

> GravityGraph, el Índice Semántico Domain/Gene y el estado operacional de Genesis son tres estructuras separadas.

Fuente:

- `docs/ANAYSIS/GRAVITY/GRAFO/GravityGraph_Domains_Genes_Postures_Provenance_and_Persistence_Audit_v0_1.md:494`

---

## 3. Estado verificado del Workflow

### 3.1 `MandateExecutionWorkflow` es batch, no conversacional

`MandateExecutionWorkflow` recibe:

```go
type MandateExecutionInput struct {
    MandateID    string
    Project      string
    MandatesRoot string
    Domains      []DomainAction
}
```

`DomainAction` contiene:

```go
type DomainAction struct {
    DomainName string
    DomainID   string
    ActionID   string
    Files      []string
    DependsOn  []string
}
```

No existen actualmente:

- `SessionID`
- `IntentType`
- `Turn`
- `TurnID`
- referencia a una conversación viva

Fuente:

- `installer/nucleus/internal/orchestration/temporal/workflows/mandate_execution_workflow.go:22-52`

El Workflow:

1. Ordena las Actions en capas topológicas.
2. Programa un `ScaffoldDomainActivity` por Action.
3. Persiste un resultado por `actionId`.
4. Detiene capas dependientes si una Action falla.

Fuentes:

- `installer/nucleus/internal/orchestration/temporal/workflows/mandate_execution_workflow.go:74-126`
- `installer/nucleus/internal/orchestration/temporal/workflows/mandate_execution_workflow.go:164-220`
- `installer/nucleus/internal/orchestration/activities/mandate_execution_activities.go:87-121`

Existe una ejecución lógica de scaffold por Action. Temporal puede reintentar técnicamente la Activity hasta tres veces, pero esos retries no son turnos conversacionales:

- `installer/nucleus/internal/orchestration/temporal/workflows/mandate_execution_workflow.go:151-156`

### 3.2 No existe todavía un Agent Loop en Fase 4

`scaffoldReal` continúa incompleto: crea el directorio y un marker mínimo, pero no llama a Brain.

Fuente:

- `installer/nucleus/internal/orchestration/activities/mandate_genesis_activities.go:243-267`

Por tanto, aunque `resolveActiveGravityActivity` devolviera Gravity resuelta, todavía no existe un consumidor real al cual inyectarla dentro de Fase 4.

Este gap también está registrado en:

- `docs/ANAYSIS/GRAVITY/SESSION/Investigacion_Gravity_SessionNode_MandateGenesis_v0_1.md:140`

---

## 4. Decisión sobre la granularidad de `SESSION`

### Opción ratificada

```text
MandateExecutionWorkflow Run
└── Gravity SESSION
    ├── DomainAction A
    ├── DomainAction B
    └── DomainAction C
```

Debe existir un solo nodo `SESSION` por corrida de `MandateExecutionWorkflow`.

El mismo `SessionID` se reutiliza durante la ejecución completa.

### Opción descartada: una sesión por `DomainAction`

No debe modelarse cada Action como una sesión o un turno porque:

- `DomainAction` es una unidad opaca de ejecución.
- No existe ida y vuelta con un humano o agente.
- No existe negociación.
- No existe un Agent Loop consumidor.
- La granularidad por Action no tiene fundamento semántico actual.
- Introducirla crearía trazabilidad aparente sin un evento conversacional real detrás.

### Opción diferida: reutilizar una sesión BSIP

Brain tiene turnos conversacionales reales mediante:

- `add-turn`
- `commit-turn`
- `advance-turn`

También existe del lado Go:

```go
type BSIPTurnRef struct {
    NucleusPath string
    IntentID    string
    IntentType  string
    Stage       string
    TurnID      string
}
```

Fuente vigente:

- `installer/nucleus/internal/orchestration/activities/mandate_genesis_activities.go:421-427`

Sin embargo, esos adaptadores no están registrados ni conectados a un Workflow:

- `installer/nucleus/internal/orchestration/activities/mandate_genesis_activities.go:670-743`

La conversación BSIP de origen, si ocurre, pertenece al proceso previo de convergencia y normalmente termina antes de la ejecución post-firma. Reutilizarla mezclaría ciclos de vida diferentes.

Esta opción debe revisitarse cuando Fase 4 contenga un Agent Loop real.

---

## 5. Contratos pendientes

### 5.1 Creación del nodo `MANDATE`

`ResolveActive` no puede resolver solamente con un nodo `SESSION`. Requiere una espina Gravity válida:

```text
NUCLEUS
└── ORGANIZATION
    └── PROJECT
        └── MANDATE
            └── SESSION
```

Actualmente no existe un creador productivo del nodo Gravity `MANDATE` dentro de la orquestación de Genesis.

Fuente:

- `docs/ANAYSIS/GRAVITY/SESSION/Investigacion_Gravity_SessionNode_MandateGenesis_v0_1.md:136`

`Store.CreateNode` permite crear `PROJECT`, `MANDATE` y `SESSION`, pero bloquea la creación directa no gobernada de `ORGANIZATION` y `NUCLEUS`:

- `installer/nucleus/internal/gravity/store.go:59-88`

El próximo diseño debe establecer:

- qué componente garantiza que `PROJECT` exista;
- en qué momento se crea `MANDATE`;
- si la creación ocurre después de la firma o antes de iniciar Fase 4;
- cómo se comporta un retry si el nodo ya existe;
- cómo se valida que el nodo existente corresponde al mismo Project y Mandate.

No debe crearse `SESSION` antes de comprobar que su `MANDATE` padre existe y pertenece a la espina correcta.

### 5.2 Procedencia de `IntentType`

`ResolveActive` exige:

```go
MandateID
SessionID
IntentType
```

Fuente:

- `installer/nucleus/internal/gravity/resolver.go:24-27`

`IntentType` se utiliza para filtrar `GravityPosture.appliesTo`.

No debe derivarse de:

- `DomainName`
- `DomainID`
- `ActionID`
- un Gene
- la posición de la Action en el grafo
- el número de capa topológica

El audit nuevo confirma que `appliesTo[]` filtra tipos de Intent, no Domains ni Genes:

- `docs/ANAYSIS/GRAVITY/GRAFO/GravityGraph_Domains_Genes_Postures_Provenance_and_Persistence_Audit_v0_1.md:99`
- `docs/ANAYSIS/GRAVITY/GRAFO/GravityGraph_Domains_Genes_Postures_Provenance_and_Persistence_Audit_v0_1.md:441`

Por tanto, el gap correcto es:

> Debe definirse qué clase de intención representa la operación gobernada de Fase 4 y qué componente es autoridad para asignarla.

No corresponde agregar un `IntentType` distinto por Domain salvo que una decisión futura establezca que cada Action constituye una intención independiente.

### 5.3 Semántica de `Turn`

`ResolveInput` también contiene un campo `Turn`.

En el diseño original, `Turn` representa un turno conversacional y permite conservar un snapshot de Gravity por turno.

En `MandateExecutionWorkflow` no existe actualmente esa unidad.

Antes de implementar debe decidirse si:

- la corrida completa se considera un único turno lógico;
- `Turn` adopta un valor fijo para ejecuciones batch;
- `Turn` representa un ordinal de resolución técnica;
- o el campo debe quedar reservado hasta que exista un Agent Loop real.

No debe asignarse un ordinal por `DomainAction` sin ratificación, porque eso equivaldría a declarar que cada Action es un turno.

---

## 6. Separación entre Gravity, Domains y Genes

El audit nuevo confirma:

```text
GravityGraph
└── .gravity/**/node.json
    └── gravityPostures[]

Índice Semántico
└── .cache/.semantic-index.json
    └── domains[domain_id]
        └── genes[]

Linaje funcional
└── .mandates/{mandate_id}/.genes/{gene_id}/

Estado operacional de Genesis
└── mandate_state.json
└── domain_proposal.json
└── scaffold/domain_{name}/
```

Fuentes:

- `docs/ANAYSIS/GRAVITY/GRAFO/GravityGraph_Domains_Genes_Postures_Provenance_and_Persistence_Audit_v0_1.md:7-13`
- `docs/ANAYSIS/GRAVITY/GRAFO/GravityGraph_Domains_Genes_Postures_Provenance_and_Persistence_Audit_v0_1.md:494`

Consecuencias para `SESSION`:

- Un nodo `SESSION` no debe contener Domains o Genes.
- `DomainAction` no debe convertirse en un tipo de nodo Gravity.
- No debe agregarse una referencia Posture→Domain o Posture→Gene sin una decisión nueva.
- `appliesTo[]` no debe reutilizarse para expresar pertenencia a Domains.
- La UI puede proyectar los tres planos juntos, pero no debe presentarlos como una única fuente de verdad.

---

## 7. Shape conceptual mínimo

El siguiente shape es solamente una representación de los datos que la implementación necesitará; no constituye autorización para crear nombres o contratos definitivos:

```text
Create/Ensure Gravity Execution Context
├── nucleusRoot
├── organizationId
├── projectId
├── mandateId
├── sessionId
├── intentType
└── turn
```

Orden lógico esperado:

```text
Mandate firmado
    ↓
Garantizar espina Gravity existente
    ↓
Crear o recuperar nodo MANDATE
    ↓
Crear SESSION para la corrida
    ↓
Resolver Gravity activa
    ↓
Ejecutar Actions
    ↓
Persistir evidencia de la Gravity utilizada
    ↓
Cerrar o dejar recolectable la SESSION
```

Los detalles de identificación, idempotencia, estado y persistencia del resultado requieren ratificación específica.

---

## 8. Correcciones necesarias en la investigación durable

El contenido conceptual es válido, pero el documento presenta referencias desactualizadas:

### Rutas incompletas

Las rutas Go deben comenzar en:

```text
installer/nucleus/
```

Por ejemplo:

```text
installer/nucleus/internal/orchestration/...
installer/nucleus/internal/gravity/...
```

### Línea desactualizada de `BSIPTurnRef`

El documento cita `mandate_genesis_activities.go:127-133`.

La ubicación vigente es:

```text
installer/nucleus/internal/orchestration/activities/mandate_genesis_activities.go:421-427
```

### Comentario obsoleto en el código

`mandate_genesis_build_workflow.go:352-359` todavía afirma que `MandateExecutionWorkflow` es un placeholder puro.

Eso contradice el comportamiento implementado en:

```text
installer/nucleus/internal/orchestration/temporal/workflows/mandate_execution_workflow.go:144-220
```

La investigación interpreta correctamente el comportamiento actual; el comentario del código es el elemento desactualizado.

### Etiqueta de la recomendación

El documento marca la recomendación como `[P]`, pero simultáneamente declara que la opción (a) fue ratificada por Control.

Debe distinguirse:

- **Decisión ratificada:** `SESSION = una corrida de MandateExecutionWorkflow`.
- **Propuestas pendientes:** nombres de Activities, generación de IDs, momento exacto de creación, `IntentType`, `Turn`, cierre y persistencia del snapshot.

---

## 9. Alcance sugerido para el próximo cowork

El próximo cowork no debería comenzar escribiendo código. Primero debe producir una propuesta explícita que cierre:

1. Fuente de `organizationId` y `projectId`.
2. Momento exacto de creación del nodo `MANDATE`.
3. Momento exacto de creación del nodo `SESSION`.
4. Algoritmo o fuente de `SessionID`.
5. Política de idempotencia frente a retries de Temporal.
6. `IntentType` aplicable a Fase 4 y autoridad que lo asigna.
7. Semántica de `Turn`.
8. Lugar donde se conserva la Gravity efectivamente resuelta.
9. Ciclo de vida y cierre de la sesión.
10. Comportamiento cuando la espina existe parcialmente o es inconsistente.
11. Consumidor provisional de `ResolveResult` mientras `scaffoldReal` no invoque un Agent Loop.
12. Lista exacta de archivos que sería necesario modificar.

Conforme a `AGENTS.md`, esa lista de archivos y cambios debe presentarse a José Vigil y recibir aprobación explícita antes de cualquier escritura.

---

## 10. Conclusión final

La investigación queda consolidada así:

- La opción (a) está ratificada.
- Habrá una `SESSION` por corrida de `MandateExecutionWorkflow`.
- Un `DomainAction` no es un turno.
- La `SESSION` de ejecución es una reinterpretación temporal y deliberada de la semántica conversacional original.
- La espina Gravity hasta `MANDATE` debe existir antes de crear `SESSION`.
- `IntentType` no puede inferirse de Domains o Genes.
- `Turn` todavía no tiene semántica ratificada en la ejecución batch.
- `resolveActiveGravityActivity` está registrada, pero no conectada.
- `scaffoldReal` todavía no contiene el Agent Loop que consumiría la Gravity resuelta.
- GravityGraph, Domains/Genes y el estado operacional de Genesis deben permanecer como fuentes separadas.
- No existe autorización para implementar hasta cerrar los contratos pendientes y aprobar una lista exacta de archivos.

**Estado del handoff:** investigación consolidada; diseño de implementación todavía bloqueado por decisiones explícitas, no por limitaciones mecánicas del Store.