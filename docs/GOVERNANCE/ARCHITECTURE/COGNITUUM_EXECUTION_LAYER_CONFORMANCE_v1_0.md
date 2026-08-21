# Cognituum — Execution Layer y conformidad cross-CLI

**Estado:** forma normativa provisional; bloqueada por reconciliación previa a conformidad  
**Versión:** 1.0  
**Fecha:** 2026-08-20  
**Arquitectura madre:**
[`COGNITUUM_RESPONSIBILITY_BOUNDARIES.md`](./COGNITUUM_RESPONSIBILITY_BOUNDARIES.md)  
**Norma de implementación vigente:**
[`COGNITUUM_EXECUTION_RUNTIME_ADAPTERS_NORM_v1_0.md`](./COGNITUUM_EXECUTION_RUNTIME_ADAPTERS_NORM_v1_0.md)
**Tesis estratégica:**
[`../SURVIVOR/cognituum_tesis_estrategica.md`](../SURVIVOR/cognituum_tesis_estrategica.md)

> **Gate posterior detectado:** los schemas y la batería no se ejecutan ni se
> promocionan a cierre definitivo hasta completar
> [`COGNITUUM_EXECUTION_RECONCILIATION_2026-08-20.md`](./COGNITUUM_EXECUTION_RECONCILIATION_2026-08-20.md).
> La reconciliación fue requerida al detectar posibles diferencias entre estos
> contratos, el árbol canónico y el pipeline implementado; no es una corrección
> silenciosa.
>
> La norma de Runtime Adapters cierra posteriormente servicio persistente,
> execution roots efímeros, adapters bajo `runtimes/` y promoción exclusiva. En
> diferencias de topología o taxonomía, esa norma prevalece; los schemas v1
> siguen provisionales hasta migración versionada.

## 1. Alcance

Este documento cierra, en orden, dos decisiones de la arquitectura madre:

1. dónde vive físicamente Execution Layer;
2. cuál es la forma cerrada de sus cuatro contratos y cómo se prueba la misma
   conformidad funcional con OpenCode first-party y los runtimes externos Codex
   CLI y Claude Code CLI, sin equiparar su ownership.

No redefine Intent, BISP, Mandate, Intelligence Supply ni Contrato D. Tampoco
usa `execution_report.json`: ese artefacto pertenece al ciclo de respuesta y
recuperación de Intelligence Supply y no es estado canónico de Execution.

## 2. Cierre 1 — ownership físico y distribución

La forma provisional se materializó en `installer/execution/`. La decisión
posterior de Executor fija `installer/executor/` como target único; el árbol
siguiente es histórico/provisional y debe migrarse explícitamente:

```text
installer/execution/
├── AGENTS.md
├── README.md
├── contracts/
│   └── v1/
│       ├── execution-package.schema.json
│       ├── execution-event.schema.json
│       ├── execution-result.schema.json
│       └── evidence.schema.json
├── core/
│   ├── lifecycle
│   ├── persistence
│   ├── validation
│   └── provider_port
├── providers/
│   ├── opencode/          # integración del runtime first-party administrado
│   ├── codex_cli/
│   └── claude_code_cli/
└── conformance/
    ├── fixtures/
    ├── expected/
    └── runner/
```

La ubicación bajo `installer/` sigue la decisión ya publicada para la antigua
“Implementation Layer”: componente distribuible separado, cliente de AITAP
cuando una ejecución necesite Intelligence Supply, nunca parte de AITAP.

### 2.1 Dependencias permitidas

- Brain produce `Execution Package` y consume `Execution Event` y
  `Execution Result` a través de un único puerto de Execution Layer.
- Nucleus entrega el `Policy/Grant` referenciado y recibe referencias de
  Evidence para auditoría.
- Execution Layer puede solicitar Supply a AITAP como consumidor, pero AITAP no
  inicia, posee, reanuda ni persiste ejecuciones.
- Cada adapter traduce entre el protocolo nativo de su CLI y los cuatro
  contratos canónicos. Ningún detalle nativo cruza el puerto hacia Brain.
- Installer/Metamorph instala, descubre y reporta health de la capa y sus
  providers; no elige cuál usar para un Intent.

### 2.2 Ownership de estado

Execution Layer es la única dueña de:

- `execution_id` y lifecycle de la sesión;
- secuencia canónica de eventos;
- checkpoint recuperable;
- proyección del resultado nativo;
- índice y referencias inmutables de Evidence.

Los adapters pueden conservar IDs y transcripts nativos como Evidence, pero no
son fuente canónica de recovery. Brain conserva semántica BISP; no persiste
estado interno del CLI.

### 2.3 Prueba que cierra la separación

La prueba `runtime-swap-no-brain-change` usa un fixture único y un mismo
`Execution Package` serializado:

1. producir el package una vez;
2. ejecutarlo con provider A hasta un checkpoint determinístico;
3. cancelar o interrumpir A;
4. reconstruir estado únicamente desde contratos y Evidence de Execution;
5. continuar con provider B;
6. validar `Execution Result`, diff, tests y checksums;
7. repetir invirtiendo A y B;
8. ejecutar la matriz OpenCode first-party ↔ Codex CLI externo ↔ Claude Code
   CLI externo.

El gate pasa únicamente si el swap no requiere modificar:

- schemas o código del modelo Intent/BISP;
- productor de `Execution Package` de Brain;
- consumidor de `Execution Event`/`Execution Result` de Brain;
- fixture o criterios de aceptación.

Solo pueden cambiar selección/configuración del provider y código dentro de
`installer/executor/runtimes/{runtime}` después de la migración. La ubicación
definitiva queda cerrada por `COGNITUUM_EXECUTOR_APPLICATION_DECISION_v1_0.md`.

## 3. Cierre 2 — contratos Execution v1

Los campos conceptuales de §8 de la arquitectura madre se cierran con los
siguientes nombres y obligatoriedad. Todos los schemas usan JSON Schema
2020-12, `additionalProperties: false` en el envelope y versionado
`cognituum.execution/v1`.

Schemas normativos materializados:
[`installer/execution/contracts/v1/`](../../../installer/execution/contracts/v1/).

### 3.1 Execution Package

```json
{
  "schema_version": "cognituum.execution/v1",
  "package_id": "pkg-uuid",
  "objective": "resultado técnico solicitado",
  "prior_state": { "checkpoint_ref": "evidence://...", "summary": "..." },
  "constraints": ["restricción durable"],
  "workspace_ref": { "workspace_id": "...", "root_ref": "workspace://..." },
  "inputs": [{ "ref": "workspace://path", "sha256": "..." }],
  "acceptance_criteria": [{ "id": "ac-1", "statement": "..." }],
  "capabilities": ["filesystem.read", "filesystem.patch", "test.run"],
  "policy_ref": "grant://...",
  "correlation_ids": {
    "mandate_id": "...",
    "intent_id": "...",
    "turn_id": "..."
  }
}
```

Todos los campos mostrados son requeridos. `prior_state` puede contener valores
vacíos para una ejecución inicial, pero no se omite. `workspace_ref` es una
referencia gobernada, no un path libre agregado por el provider. Se excluyen
sintaxis de tools, prompts nativos y secretos.

### 3.2 Execution Event

```json
{
  "schema_version": "cognituum.execution/v1",
  "execution_id": "exec-uuid",
  "session_id": "session-uuid",
  "sequence": 12,
  "type": "checkpoint",
  "timestamp": "2026-08-20T00:00:00Z",
  "summary": "estado observable sin razonamiento privado",
  "evidence_refs": ["evidence://..."]
}
```

Campos requeridos: todos. `sequence` es entero creciente, único por
`execution_id`. Tipos v1: `accepted`, `started`, `tool_started`,
`tool_finished`, `checkpoint`, `paused`, `resumed`, `completed`, `failed` y
`cancelled`. El adapter puede mapear múltiples eventos nativos a uno canónico o
adjuntar el stream nativo como Evidence, sin ampliar esta enumeración.

### 3.3 Execution Result

```json
{
  "schema_version": "cognituum.execution/v1",
  "execution_id": "exec-uuid",
  "status": "completed",
  "outputs": [{ "ref": "workspace://...", "sha256": "..." }],
  "changed_paths": ["src/example.py"],
  "tests": [{ "command_ref": "evidence://...", "status": "passed" }],
  "diff_ref": "evidence://...",
  "evidence_refs": ["evidence://..."],
  "accounting_refs": [],
  "error": null,
  "cancel_reason": null
}
```

Campos requeridos: todos. `status` es `completed`, `failed`, `cancelled` o
`paused`. Un resultado `paused` es terminal para esa sesión, pero recuperable
por otra usando `prior_state.checkpoint_ref`. El resultado informa efectos; no
introduce decisiones semánticas nuevas.

### 3.4 Evidence

```json
{
  "schema_version": "cognituum.execution/v1",
  "evidence_id": "evidence-uuid",
  "execution_id": "exec-uuid",
  "actor": { "subject_ref": "identity://...", "adapter": "codex_cli" },
  "runtime": { "provider": "codex_cli", "version": "..." },
  "started_at": "2026-08-20T00:00:00Z",
  "ended_at": "2026-08-20T00:01:00Z",
  "hashes": [{ "ref": "workspace://...", "before": "...", "after": "..." }],
  "tool_events": [{ "sequence": 1, "tool_class": "filesystem.patch", "outcome": "succeeded" }],
  "tests": [{ "command": "...", "exit_code": 0, "stdout_ref": "evidence://...", "stderr_ref": "evidence://..." }],
  "diff": { "format": "unified", "ref": "evidence://...", "sha256": "..." },
  "outputs": [{ "ref": "evidence://...", "sha256": "..." }]
}
```

Campos requeridos: todos; las colecciones pueden estar vacías cuando no
apliquen. Evidence es inmutable y content-addressed. Se excluyen secretos y
razonamiento privado. El transcript nativo puede ser un output referenciado,
pero nunca reemplaza hashes, diff, tests o tool events canónicos.

## 4. Regla de adaptación de providers

Los tres providers reciben exactamente el mismo `Execution Package` validado.
El adapter puede construir instrucciones nativas, invocar el proceso y parsear
su stream, pero debe devolver exclusivamente contratos v1.

| Provider | Entrada nativa | Salida nativa esperable | Responsabilidad exclusiva del adapter |
|---|---|---|---|
| OpenCode (`first_party_runtime`) | servicio/API/sesión headless administrados por Cognituum | eventos JSON y tool use | integrar lifecycle first-party, traducir eventos y capturar patch/tests; preservar provider/model efectivo |
| Codex CLI (`external_runtime`) | ejecución local gobernada vía Executor | eventos/tool results/diff según superficie disponible | proyectar lifecycle y preservar IDs nativos solo como Evidence |
| Claude Code CLI (`external_runtime`) | ejecución local gobernada vía Executor | stream/resultados de tools según superficie disponible | proyectar lifecycle y preservar IDs nativos solo como Evidence |

Una capacidad nativa ausente no habilita campos vendor-specific. El adapter la
materializa externamente —por ejemplo, checksum del workspace antes/después— o
declara el provider `NON_CONFORMANT` para esa prueba.

## 5. Batería única de conformidad

Cada caso se ejecuta sin modificar package, schemas ni aceptación entre
providers:

| ID | Caso | Aserción obligatoria |
|---|---|---|
| EXC-001 | Structured output | Event, Result y Evidence validan contra v1; stdout extra no altera el parseo |
| EXC-002 | Patch | Solo cambia el path autorizado y el patch aplica sobre el hash inicial |
| EXC-003 | Diff | El unified diff canónico reproduce exactamente el workspace final |
| EXC-004 | Checksum | Hashes before/after coinciden con archivos reales y outputs |
| EXC-005 | Acceptance | Tests y criterios quedan correlacionados con Evidence |
| EXC-006 | Scope denial | Intento fuera de capabilities/workspace no produce cambio y queda evidenciado |
| EXC-007 | Interruption | Se emite checkpoint y Result `paused` sin depender de memoria nativa |
| EXC-008 | Cross-provider recovery | Otro adapter continúa desde `checkpoint_ref` sin reinterpretar Intent/BISP |
| EXC-009 | Idempotency | Repetir recovery no duplica efectos ya confirmados |
| EXC-010 | Provider disappearance | El estado recuperable no requiere reinstanciar el runtime original |

### 5.1 Estados de conformidad

- `CONFORMANT`: pasa EXC-001 a EXC-010 en tres corridas consecutivas.
- `PARTIAL`: los contratos validan, pero falla recovery, idempotencia o scope.
- `NON_CONFORMANT`: requiere modificar un contrato/Intent o no puede producir
  Evidence verificable.
- `NOT_RUN`: no hay corrida reproducible; nunca equivale a conformidad.

“Cumplimiento estable” significa tres corridas consecutivas por provider y por
par de swap. “Recuperación determinista” significa mismo estado final, diff,
checksums y criterios de aceptación al repetir desde el mismo checkpoint.

## 6. Estado de evidencia al cierre documental

| Provider | Disponibilidad observada en esta sesión | Batería v1 | Estado |
|---|---|---|---|
| OpenCode first-party | Binario y servicio incorporados por Setup/Installer; rollout/health implementados en Metamorph; adapter neutral no integrado | No ejecutada | `NOT_RUN` |
| Codex CLI | Binario detectado, ejecución bloqueada por sandbox de la sesión | No ejecutada | `NOT_RUN` |
| Claude Code CLI | Comando no detectado | No ejecutada | `NOT_RUN` |

Las dos decisiones arquitectónicas quedan cerradas por esta especificación. El
criterio empírico de supervivencia de la tesis permanece abierto hasta obtener
la matriz de corridas. Ningún estado `NOT_RUN` se promociona por inferencia.
