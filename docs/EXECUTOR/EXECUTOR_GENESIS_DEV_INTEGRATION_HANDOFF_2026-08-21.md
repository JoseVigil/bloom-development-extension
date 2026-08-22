# AGENDA FOLLOWUP — integración Executor con `dev` condicional de Genesis

**Fecha de corte:** 2026-08-21  
**Estado:** HANDOFF BASADO EN CÓDIGO REAL  
**Executor:** `NOT_RUN`  
**Integración Genesis → Executor:** `NOT_RUN`

## 1. Capacidad disponible

### 1.1 Executor y staging

- `installer/executor/` no existe. No hay módulo Go, binario, CLI, servicio,
  IPC, brokers, runtime port, adapters, Evidence Store ni Promotion Engine.
- `installer/execution/` contiene únicamente `AGENTS.md`, `README.md`, handoffs,
  el pedido `CAF-032` y cuatro schemas v1 provisionales.
- No existe productor ni consumidor integrado de esos schemas.
- Los contratos v1 no contienen `action_id`, `evaluation_id`, findings de
  origen, attempt/routing/fencing suficientes y Evidence v1 mezcla runtime con
  provider de inteligencia.

Clasificación: staging `PARCIAL` documental; aplicación Executor `NOT_RUN`.

### 1.2 Superficie CLI

No existe ningún comando `executor` implementado. La superficie propuesta E0
es:

```text
executor --help | --json-help
executor version | status | health | serve
executor service install|uninstall|start|stop|restart|status
executor runtimes discover|list|inspect|approve|revoke|probe
executor execution submit|status|pause|cancel
executor evidence get|collect
executor conformance run|matrix|report
```

`service install/uninstall` se delega a Setup. `execution submit` es una
superficie para Temporal/caller autorizado, no un atajo humano hacia Genesis.
La entrada primaria del primer vertical es CLI Nucleus/Brain.

### 1.3 Estado real de Genesis/Intents

- `IntentManager.create_intent()` acepta solamente `dev`, `doc`, `ing` y `dis`
  (`brain/core/intent_manager.py:84-114`).
- El registro declarativo BSIP contiene sólo `ing` y `dis`; documenta que
  `dev/doc/exp/inf/cor` no están registrados
  (`brain/core/intent_types.py:38-52,183-200`).
- No hay implementación productiva encontrada de `evaluation_id`,
  `remediation_required` o `latest_exp.result`.
- Genesis ejecuta hoy recepción `ing`, un scaffold `cluster` dry-run, Human
  Sync y firma (`mandate_genesis_build_workflow.go:101-220`).
- El child `MandateExecutionWorkflow` es un placeholder que ignora input y
  retorna `Success: true` con dominios vacíos
  (`mandate_execution_workflow.go:8-47`). Ese éxito no demuestra ejecución.
- El workflow vigente publica `mandate:genesis:all_complete` después de ese
  placeholder (`mandate_genesis_build_workflow.go:251-281`), incompatible con
  el action graph canónico nuevo hasta su reconciliación.

## 2. Contrato mínimo de integración — entrada

Estado: `TARGET`, no materializado. Productor lógico: Brain/Temporal después de
que `exp` haya originado una Action `dev`; Executor no evalúa esa condición.

```json
{
  "schema_version": "cognituum.execution/dev-dispatch/v1",
  "mandate_id": "mandate-id",
  "action_id": "action-dev-id",
  "intent_id": "dev-intent-id",
  "evaluation_id": "exp-evaluation-id",
  "correlation_id": "correlation-id",
  "logical_execution_id": "logical-execution-id",
  "attempt_id": "attempt-id",
  "idempotency_key": "opaque-idempotency-key",
  "routing_decision_ref": "routing-decision://id",
  "grant_ref": "grant://id",
  "objective": "remediación técnica ya definida",
  "origin_findings": [
    {
      "finding_id": "finding-id",
      "source_evaluation_ref": "evaluation://id",
      "statement": "hallazgo estructurado",
      "severity": "...",
      "required_outcome": "..."
    }
  ],
  "scope": {
    "workspace_ref": "workspace://id",
    "allowed_paths": [],
    "forbidden_paths": [],
    "input_hashes": []
  },
  "permissions": {
    "capabilities": [],
    "network": "deny",
    "expiry": "RFC3339"
  },
  "runtime": {
    "runtime_id": "opencode",
    "runtime_kind": "first_party_runtime",
    "installation_ref": "runtime-installation://opaque"
  },
  "acceptance_criteria": [],
  "authorized_commands": [],
  "authorized_capabilities": [
    "filesystem.read",
    "filesystem.patch",
    "test.run"
  ]
}
```

Reglas:

- `evaluation_id` y findings son causalidad de origen, no autorización.
- `grant_ref` es la autorización efectiva.
- AITAP selecciona `runtime_id`; Executor sólo resuelve una instalación
  registrada, confiable y compatible.
- Los comandos deben ser referencias gobernadas o allowlist estructurada, no
  shell arbitrario libre.
- Findings y aceptación no pueden ser modificados por Executor.
- Secrets, paths canónicos, prompts y credenciales no viajan en el package.

## 3. Contrato mínimo de integración — salida

Estado: `TARGET`, no materializado.

```json
{
  "schema_version": "cognituum.execution/dev-result/v1",
  "mandate_id": "mandate-id",
  "action_id": "action-dev-id",
  "intent_id": "dev-intent-id",
  "evaluation_id": "exp-evaluation-id",
  "correlation_id": "correlation-id",
  "logical_execution_id": "logical-execution-id",
  "attempt_id": "attempt-id",
  "execution_id": "execution-id",
  "status": "completed|failed|cancelled|paused|orphaned",
  "operations": [],
  "affected_files": [],
  "diff_ref": "evidence://diff-id",
  "verifications": [],
  "stdout_ref": "evidence://stdout-id",
  "stderr_ref": "evidence://stderr-id",
  "tests": [],
  "evidence_refs": [],
  "error": null,
  "retry": {
    "allowed": false,
    "reason": null,
    "checkpoint_ref": null
  },
  "audit_ref": "audit://id",
  "promotion_ref": "promotion://id",
  "accounting_refs": []
}
```

`completed` significa ejecución técnica y promoción verificadas; no significa
que el finding esté satisfecho. Brain/Temporal consumen el resultado y la
reevaluación `exp` determina la remediación.

## 4. Dependencia de Nucleus

### Implementado

Nucleus posee roles básicos `RoleMaster`/`RoleSpecialist`; la detección actual
incluso retorna Master por defecto si no encuentra marcadores
(`internal/core/metadata.go:30-37,63-96`). Vault implementa un gate concreto que
autoriza sólo `RoleMaster` y cinco scopes fijos
(`internal/vault/vault.go:37-61`).

### Gap bloqueante

No existe un contrato productor/verificador de Execution Grant con subject,
workspace, paths, capabilities, commands, network, expiry, consent, audit ID y
firma. El gate Vault no sirve como Grant de ejecución y no debe reutilizarse
implícitamente.

Para el primer `dev`, Nucleus debe:

1. autenticar usuario/dispositivo/caller Temporal;
2. comprobar autoridad sobre Mandate/Action/workspace;
3. emitir o resolver un Grant firmado/revocable y acotado;
4. autorizar capabilities, paths, commands, network y expiry;
5. entregar referencias de credenciales, nunca plaintext;
6. permitir reverificación antes de promotion;
7. registrar denial/consent/override y devolver `audit_ref`.

Executor valida el Grant al recibir, antes de iniciar runtime y nuevamente antes
de promover. No crea ni amplía el Grant.

## 5. Runtime utilizable hoy

Por Executor: **ninguno**.

- OpenCode es el único candidato first-party materialmente instalado por Setup,
  y Metamorph contiene rollout parcial.
- El servicio global `127.0.0.1:4096` no tiene las garantías de auth,
  least-privilege, root por attempt ni adapter neutral exigidas; no puede usarse
  para ejecución gobernada.
- No existe worker OpenCode por slot ni adapter Executor.
- Codex CLI no está registrado, trusted ni integrado mediante adapter.
- Claude Code CLI no fue detectado en la investigación previa y tampoco tiene
  adapter.

OpenCode puede existir como binario/servicio standalone, pero eso no constituye
capacidad Executor.

## 6. Implementado, parcial, roto y target

| Pieza | Estado | Evidencia/impacto |
|---|---|---|
| Executor source/binario/servicio/CLI | `NOT_RUN` | target ausente |
| Execution schemas v1 | `PARCIAL` | materializados, provisionales, sin integration |
| Contratos dev input/output anteriores | `TARGET` | este handoff |
| Brain `dev` legacy | `PARCIAL` | create/lifecycle legacy y staging/merge existen |
| Brain `exp` para Genesis | `NOT_RUN` | no soportado por create ni registry actual |
| Conditional Action `dev` | `NOT_RUN` | no productor desde `exp` real |
| Genesis child execution | `BROKEN` funcionalmente | placeholder retorna éxito vacío |
| Nucleus Execution Grant | `NOT_RUN` | sólo existe gate Vault no equivalente |
| OpenCode instalación | `PARCIAL` | binario/servicio global, no worker gobernado |
| OpenCode Metamorph source | `BROKEN` documentado | path source inconsistente |
| Codex/Claude adapters | `NOT_RUN` | inexistentes |
| Promotion/Evidence/fencing | `NOT_RUN` | diseño E0 únicamente |

## 7. Primer punto de integración viable

El primer punto no es `exp → Executor`. Es:

```text
Temporal posee una Action dev ya creada
  → Brain produce dev intent + package causal
  → Nucleus emite Grant mínimo verificable
  → AITAP entrega Routing Decision persistida
  → Temporal llama Executor por IPC autenticado
```

El vertical mínimo requiere, en orden:

1. implementar `exp` durable y su resultado estructurado fuera de Executor;
2. materializar la transición Temporal que crea Action/Intent `dev` con
   `evaluation_id` y findings, sin pedir a Executor que decida;
3. cerrar el mapping `CAF-032` para `dev` y el límite staging/merge;
4. aprobar contratos Package/Dispatch/Result/Evidence mínimos;
5. implementar Nucleus Execution Grant y verificación;
6. crear Executor shell, IPC auth, journal/idempotencia/fence;
7. implementar workspace/sandbox/snapshot/diff/Evidence/promotion mínimos;
8. integrar un worker OpenCode aislado por slot, no el global;
9. ejecutar todo sólo sobre fixture hasta containment/promotion gates;
10. conectar el resultado técnico a Brain/Temporal para disparar una nueva
    `exp`, nunca para declarar satisfacción.

## 8. Elementos anteriores a `dev` que no requieren Executor

Definitivamente no requieren Executor:

- decisión y recorrido del action graph;
- creación/continuación del workflow Temporal;
- Intelligence Supply de `ing`, `dis`, `doc` y `exp` por AITAP;
- parsing, validación y persistencia BISP por Brain;
- evaluación técnica `exp` y emisión de `remediation_required`;
- decisión de crear o no Action `dev`;
- Human Sync, firma y governance de Nucleus;
- estados, eventos y consultas de Mandate/Action/Intent;
- fast-path `dis:no_changes_required`;
- persistencia de artefactos internos propios del lifecycle Brain.

Una escritura externa de `ing` o `doc`, o un check diagnóstico de `exp`, sólo
usaría Executor si se modela expresamente como actuación separada bajo Grant.
No se presume esa delegación.

## 9. Pruebas E2E requeridas

### 9.1 Antes de runtime real

1. `exp` fixture produce `evaluation_id`, findings accionables y
   `remediation_required` válido.
2. Temporal crea exactamente una Action/Intent `dev` por idempotency key.
3. Resultado `ready` no crea `dev`.
4. Nucleus deniega Grant por caller, path, capability, command o expiry.
5. Retry de dispatch devuelve el mismo execution logical/attempt estable según
   contrato y no duplica efectos.
6. Fake Runtime Port produce Events/Result/Evidence correlacionados por
   mandate/action/intent/evaluation/execution.

### 9.2 Containment y promoción

7. Runtime no puede leer/escribir workspace canónico, `.git`, HOME/TEMP o paths
   fuera de scope.
8. Symlink/junction/hardlink/traversal y child-process escapes son rechazados.
9. Network default deny y secret leakage por argv/env/stdout/stderr/Evidence.
10. Scope violation invalida todo el attempt, sin promoción parcial.
11. Stale fence/late result no promueve.
12. Canonical precondition conflict falla sin overwrite.
13. Promotion exitosa reproduce diff/hashes, post-checks y audit ref.
14. Crash/restart recupera journal/checkpoint sin session memory.

### 9.3 Runtime y ciclo Genesis

15. Worker OpenCode aislado con auth efímera, versión compatible y cleanup.
16. Cancel/pause termina process tree y produce checkpoint portable.
17. Executor devuelve `completed` técnico sin alterar findings/aceptación.
18. Temporal dispara nueva `exp` con Evidence del `dev`.
19. Reevaluación `ready` permite que el dominio Genesis continúe; una nueva
   `remediation_required` no queda falsamente satisfecha.
20. Reinicio de Nucleus/Temporal/Brain/Executor no duplica Action, Intent,
   execution ni promotion.

Después se ejecuta EXC-001..EXC-010 según gates; ninguna prueba anterior permite
declarar por sí sola un runtime `CONFORMANT`.

## 10. Resumen para AGENDA FOLLOWUP

- **Capacidad disponible:** diseño E0, schemas v1 provisionales, Brain legacy
  dev y OpenCode instalado standalone. No existe capacidad Executor ejecutable.
- **Gaps:** `exp`, productor de Action dev, Grant, contracts finales, servicio,
  brokers, adapter, Evidence, fencing y promotion.
- **Contrato de integración:** §§2-3; causalidad por `evaluation_id`, autoridad
  por `grant_ref`, runtime por Routing Decision y resultado no semántico.
- **Dependencia Nucleus:** Grant firmado/revocable y audit ref; Vault gate actual
  no alcanza.
- **Primer punto viable:** dispatch Temporal de una Action `dev` ya decidida,
  después de implementar `exp` y antes de cualquier runtime, inicialmente contra
  fake Runtime Port/fixture; OpenCode real sólo tras gates.

Executor no decide si crear `dev`, no modifica findings y no declara satisfecha
la remediación.
