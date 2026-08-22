# AITAP — impacto de composición y canal de Mandate Genesis

**Estado:** decisión canónica recibida; impacto AITAP registrado  
**Fecha:** 2026-08-21  
**Implementación:** no autorizada por este documento

## 1. Composición consumida, no orquestada

AITAP acepta como contexto explícito el action graph canónico:

```text
ing → dis → doc → exp/evaluación → [dev condicional]
    → exp/reevaluación → completed
```

AITAP no construye, avanza ni valida ese grafo. Temporal decide la siguiente
Action; Brain interpreta y persiste los resultados; Nucleus autoriza. AITAP
recibe `mandate_ref`, `action_ref`, `intent_ref`, `turn_ref`, intent type/stage
y constraints ya determinados.

En particular:

- `dis=no_changes_required` es semántica durable interpretada por Brain/
  Temporal, no un reason code de routing;
- `exp=remediation_required` no permite a AITAP crear `dev`;
- `exp=ready` no permite a AITAP marcar el Mandate `completed`;
- AITAP no determina cuál `exp` es el último ni si sus findings son accionables;
- el segundo `exp` es otra solicitud/decisión correlacionada, no mutación de la
  decisión usada antes de `dev`.

## 2. Canal primario

El primer vertical usa CLI como superficie controlada:

```text
CLI → Nucleus → Temporal → Brain → AITAP
                               └→ Executor cuando haya actuación autorizada
```

No existe acceso CLI directo a AITAP o Executor que evite Brain, Temporal o
Nucleus. CLI, Synapse, API y Core UI deben converger en los mismos contratos y
estado durable; AITAP no crea schemas específicos por canal.

Synapse y Synapse Simulator no son dependencias del primer vertical. OpenCode
no es runtime obligatorio. El milestone `ing` determinístico no equivale a un
Genesis completo.

## 3. Uso de AITAP por Action

| Intent | Routing de inteligencia | Routing de runtime |
|---|---|---|
| `ing` | cuando Brain requiera razonamiento | sólo si una operación explícita y autorizada requiere Executor |
| `dis` | sí; puede concluir fast-path | normalmente ninguno |
| `doc` | sí | sólo si la materialización documental se separa como ejecución |
| `exp` | sí | ninguno para evaluar; diagnósticos requieren actuación explícita |
| `dev` | razonamiento/planificación | Executor para implementación autorizada |
| `exp` posterior | sí, nueva decisión | ninguno salvo diagnóstico explícito |

AITAP no debe inventar un runtime cuando la Action sólo requiere Intelligence
Supply. Esto obliga a que el contrato futuro permita `runtime.required=false`
o separe una Supply Decision de una Execution Routing Decision.

## 4. Correlación

Toda solicitud y Accounting deben conservar:

```text
mandate_ref → action_ref → intent_ref → turn_ref
                    └→ logical_inference_id (Supply)
                    └→ logical_execution_id (Execution, cuando exista)
```

Las dos evaluaciones `exp` tienen Actions/Intents/turns distinguibles. El
`logical_execution_id` sólo aparece si existe ejecución técnica; no se fabrica
para una evaluación puramente cognitiva.

## 5. Impacto sobre artefactos AITAP actuales

| Artefacto | Estado frente a la decisión | Tratamiento requerido |
|---|---|---|
| `contracts/v2/routing-request.schema.json` | `BROKEN` para Genesis completo | enum omite `exp`; no modificar V2 en sitio |
| `policies/genesis-runtime-intelligence-v2.json` | `BROKEN` para Genesis completo | omite `exp` y presupone runtime para toda Action |
| `examples/genesis-ing-request-v2.json` | `PARCIAL` | válido sólo para milestone `ing` |
| routing engine V2 | `PARCIAL` | puede decidir pares, pero exige runtime+intelligence siempre |
| Accounting/correlation | `PARCIAL` | falta `action_ref` y separación Supply/Execution IDs |
| integración CLI/Temporal/Brain | `TARGET` | no existe vertical durable AITAP integrado |
| Synapse Simulator | fuera de dependencia | no registrarlo como runtime por conveniencia |

La corrección requiere una nueva versión de Request/Decision/Policy y tests; no
se autoriza una ampliación silenciosa de `cognituum.routing/v2` ni de
`genesis-runtime-intelligence/v2`.

## 6. Decisiones abiertas antes de implementar

1. Un contrato combinado con `runtime.required=false` versus contratos
   separados Supply Routing / Execution Routing.
2. Quién materializa escrituras internas BISP de `ing/doc`: Brain o Executor,
   según tipo de artefacto y autorización; no toda escritura es Execution.
3. Contratos durables de `no_changes_required`, `remediation_required`, findings
   accionables y `ready`; pertenecen a Brain/Mandate, no AITAP.
4. Mapeo policy real provider/model por Action sin fijar un provider obligatorio.
5. Activity Temporal que solicita decisión sin hacer health dinámico en replay.
6. Forma definitiva de `action_ref` y relación con `logical_inference_id`/
   `logical_execution_id`.

## 7. Guardrail

AITAP suministra inteligencia para `ing/dis/doc/exp/dev` y selecciona runtime
cuando existe una ejecución ya decidida. Nunca decide el orden, la condición de
`dev`, la satisfacción de findings ni `completed`.

