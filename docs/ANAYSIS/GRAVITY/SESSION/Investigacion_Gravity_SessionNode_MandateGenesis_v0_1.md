# Investigación — Diseño de `SessionID`/nodo `SESSION` de Gravity para Mandate Genesis

## Alcance: cómo modelar sesión/turno para que `MandateExecutionWorkflow` pueda invocar `resolveActiveGravityActivity`

**Tipo:** Documento de investigación de diseño — cero código de producción, cero modificación de ningún archivo del repo.
**Estado:** Borrador v0.1 — hallazgos verificados citados `file:línea`; el resto marcado explícitamente como propuesta de este cowork, sin ratificar.
**Fecha:** 2026-09-02
**Repo auditado:** `bloom-development-extension`, vía puente al dispositivo `bell-ubuntu` (working tree del usuario)
**Ratificado por:** control, opción (a) — ver `ORBITAL/GRAVITY/Tablero_Seguimiento_Consolidado_v0_2.md`, §O/§P.

**Convención de evidencia:**
- **[H]** = Hallazgo. Verificado contra código o documento real, citado `file:línea`.
- **[P]** = Propuesta de este cowork, sin ratificar. Nunca se presenta como decisión tomada.
- **[G]** = Gap. Pregunta abierta que este cowork no resuelve, con la razón.

**Directiva permanente respetada:** `Intent Core` (`cor`, `COR_Intent_Spec`, `intent_draft`, `CorNucleusRecord`, `validate_and_sign`, "Mandates v6.0 legacy") es sistema deprecado y no se cita acá como referencia de diseño. **Nota de desambiguación necesaria, porque el nombre es engañoso:** este documento sí cita extensamente `brain/commands/intent/*.py` e `IntentType` (`ing`/`dis`) — ese es un sistema **distinto y vivo**, el motor BSIP de intents (`ING_Intent_Spec_v1_1.md`, `DIS_Intent_Spec_v1_0.md`), confirmado por el propio código como excluyente de `cor`: `brain/core/intent_types.py:38-52` declara `IntentType` con únicamente `ING`/`DIS` como valores orquestados por este runtime, con una nota explícita de que `cor` es uno de los "seis tipos históricos" que este registro **no** incluye. No es Intent Core con otro nombre — es el sistema de intents BSIP que la propia investigación previa (`Investigacion_Cor_Authorization_Nodos_Gravity_v0_2.md`, §2) ya distinguió como vivo, deliberadamente no movido a `_to_delete/`.

---

## 1. Cómo ejecuta un Mandate hoy Mandate Genesis — evidencia real

### 1.1 El pipeline completo, tal como está en código

`MandateGenesisBuildWorkflow` orquesta cinco fases, comentario propio del archivo: *"orquesta: ingest → cluster → validate (Human Sync) → sign → execute (child workflow, Fase 4)"* — `internal/orchestration/temporal/workflows/mandate_genesis_build_workflow.go:106-107`. `GenesisPhaseOrder = []string{"ingest", "cluster", "validate", "signed", "completed"}` (`mandate_genesis_build_workflow.go:102`).

- **Fase 1 (ingest):** `IngestReceptionActivity` crea **un** intent BSIP `ing` por Mandate — invoca `brain --json intent create --type ing ...` y luego `brain --json intent hydrate --id <intentId> ...` como subprocesos (`internal/orchestration/activities/mandate_genesis_activities.go:203-233`). Es una llamada única de creación + hidratación, no un loop de turnos manejado por el Workflow.
- **Fase 2 (cluster, dry_run):** `ScaffoldDomainActivity(Mode: dry_run)` escribe `domain_proposal.json`, sin clustering real de Brain todavía (`mandate_genesis_activities.go:207-241`, comentario explícito: *"no hay clustering real de Brain"*).
- **Fase 3 (validate → sign):** un Human Sync Point recibe la señal `mandate:genesis:validate` (`GenesisValidateSignal{Approved, Domains}`, `mandate_genesis_build_workflow.go:61-65`); si se aprueba, `SignMandateActivity` escribe `mandate.json` firmado e inmutable (R-1).
- **Fase 4 (execute):** el resultado de la firma se pasa a `MandateExecutionWorkflow` como child workflow — comentario propio: *"es ESE workflow quien... debe llamar `ScaffoldDomainActivity(Mode: real)` por cada Action"* (`mandate_genesis_build_workflow.go:39-44`).

### 1.2 Qué es exactamente un `DomainAction` y cómo se ejecuta (Fase 4)

`MandateExecutionInput{MandateID, Project, MandatesRoot, Domains []DomainAction}` — sin `SessionID`, sin noción de turno (`internal/orchestration/temporal/workflows/mandate_execution_workflow.go:43-52`). `DomainAction{DomainName, DomainID, ActionID, Files, DependsOn}` (`mandate_execution_workflow.go:22-41`) — es una unidad de trabajo opaca, no un intercambio conversacional.

`MandateExecutionWorkflow` agrupa `Domains` en capas topológicas por dependencia (`topologicalLayers`, `mandate_execution_workflow.go:74-126`) y, por cada `DomainAction`, hace **una sola llamada** a `ScaffoldDomainActivity(Mode: ScaffoldModeReal)` (`mandate_execution_workflow.go:173-180`), seguida de **una sola llamada** a `PersistExecutionResultActivity` que graba el resultado bajo `phases.execute.actions[actionId]` en `mandate_state.json` — un registro por Action, sin campo `turn` (`internal/orchestration/activities/mandate_execution_activities.go:87-121`). No hay reintentos conversacionales, no hay negociación, no hay múltiples intercambios por dominio — es ejecución batch, determinista, de una sola pasada por dominio.

**[H] Punto crítico:** `scaffoldReal` (el modo real de `ScaffoldDomainActivity`) está *"INCOMPLETO A PROPÓSITO: solo crea el directorio y un marker mínimo"* — no llama todavía a Brain (`mandate_genesis_activities.go:243-253`; TODO explícito desde el encabezado del archivo, línea 139-143: *"habla por TCP (puerto 5678) con Brain... TODO original sigue sin resolver: esta función no llama a Brain todavía"*). Es decir: hoy, en código real, **no existe ningún Agent Loop corriendo dentro de Fase 4** que pudiera consumir "Resolved Active Gravity" turno a turno — el consumidor que el diseño de Gravity presupone (`current_turn.intent_type`, inyección al Agent Loop) todavía no existe en esta fase.

---

## 2. Dónde vive "turno" hoy, de verdad, en el sistema real

### 2.1 El motor BSIP de Brain — turno real, vivo, con conversación

`brain/core/intent_types.py` declara, por tipo de intent, qué fases tienen turnos: `PhaseSpec.has_turns` marca fases que iteran en `.turn_X/` *"con negociación humana turno a turno"* (`intent_types.py:61-64`). El comando real `brain intent add-turn` (`brain/commands/intent/add_turn.py:1-20`) agrega *"a conversation turn to an intent's chat (BTIP)"* — con `actor: user|ai`, `content`, y devuelve `turn_number`/`turn_id` (`add_turn.py:34-59, 173-193`). Existen además `commit-turn`, `advance-turn` y el resto de la familia `brain intent *` (`brain/commands/intent/`). Esto es exactamente lo que el propio nombre BTIP describe: *"Briefing → Turno → Iteración → Producción"* (`add_turn.py:99`).

**[H] Este es el único lugar del código real donde "turno" significa lo que el diseño de Gravity asume: un intercambio conversacional, actor por actor, con estado persistido por turno.**

### 2.2 El correlato ya existente (pero desconectado) del lado Go

`internal/orchestration/activities/mandate_genesis_activities.go:127-133` ya declara:

```go
type BSIPTurnRef struct {
    NucleusPath string
    IntentID    string
    IntentType  string
    Stage       string
    TurnID      string
}
```

y tres Activities que operan sobre ella: `MarkBSIPEffectApplied`, `CommitBSIPTurn`, `AdvanceBSIPTurn` (`mandate_genesis_activities.go:670-743`), cada una invocando `brain` como subprocess (mismo patrón que `IngestReceptionActivity`).

**[H] Grep confirmado: ninguna de las tres está registrada en el worker de Temporal (`internal/orchestration/temporal/worker.go`) ni invocada por ningún Workflow.** Las únicas referencias a `MarkBSIPEffectApplied`/`CommitBSIPTurn`/`AdvanceBSIPTurn` en todo el repo Go están en su propio archivo de test (`mandate_genesis_activities_test.go`). Es, literalmente, la misma situación que `resolveActiveGravityActivity`: diseñado, implementado, testeado — y sin ningún caller real. Dos islas paralelas, desconectadas entre sí y del resto del pipeline.

### 2.3 Dónde encaja esto respecto al pipeline de Mandate Genesis

`IngestReceptionActivity` (Fase 1) crea el intent `ing` pero solo hace `create` + `hydrate` — no hace `add-turn` ni ningún avance de fase. La negociación turno a turno de ese intent (`.classification/`, `.mapping/`, `.consolidation/`, `.ratification/` — fases con `has_turns=True` según `intent_types.py`) no está orquestada por `MandateGenesisBuildWorkflow` en ningún punto visible del código: ocurre, si ocurre, por fuera del Workflow (vía CLI directo a `brain`, o eventualmente Paladin), de forma asíncrona. `freeze_to_mandate()` (`brain/core/intent_manager.py:1953`, invocado desde `brain/commands/intent/freeze.py:87`) es el acto que cristaliza ese intent en un Mandate — y solo aplica a intents `ing`/`dis` ya en su fase terminal (`intent_manager.py:2043`: *"freeze_to_mandate() solo aplica a intents 'ing'/'dis'"*).

**[H] Consecuencia directa:** para cuando `MandateExecutionWorkflow` (Fase 4) arranca, el Mandate ya fue firmado — la conversación turno a turno del intent que lo originó, si existió, ya llegó a su fase terminal antes de `freeze_to_mandate()`. No hay una conversación *en curso* durante Fase 4 a la que un `SessionID` pudiera anclarse de forma natural.

---

## 3. Qué dice el propio diseño de Gravity sobre qué es `SESSION`

`Paladin_UX_Postura_Gravity_Masa_Spec_v0_1.md` (§1.3, citando `Impl §1.3` fila `SESSION`): *"Se captura en vivo, durante la conversación, sin firma formal previa."* El mismo documento especifica el breadcrumb "Gravity activa por turno" (§2.1-2.4): `resolve_active_gravity(session_id)` recorre `NUCLEUS → ORGANIZATION → PROJECT → MANDATE → SESSION` y devuelve, **por turno**, solo las reglas relevantes al `intent_type` de ese turno; *"cada turno conserva su propio breadcrumb tal como se resolvió en ese momento"* (§2.4) — es decir, el diseño presupone una secuencia de turnos discretos, cada uno con su propia resolución, dentro de una conversación viva con un ingeniero o un agente.

**[H] Esto es, textualmente, una descripción del motor BSIP de Brain (§2.1 de este documento) — no de la ejecución de `MandateExecutionWorkflow`.** `SESSION` en el diseño no es "una corrida de ejecución batch"; es "una conversación en curso, con turnos, donde alguien puede postular Gravity ad hoc sin fricción de firma."

---

## 4. Las tres opciones, evaluadas

### (a) `SessionID` = una invocación de `MandateExecutionWorkflow`

**Qué se crearía y cuándo:** una Activity nueva (p. ej. `CreateGravitySessionActivity`) al arrancar `MandateExecutionWorkflow`, antes del loop de capas, que hace `Store.CreateNode` de un `SESSION` hijo del `MANDATE` — `CreateNode` ya no bloquea `SESSION` (solo bloquea `ORGANIZATION`/`NUCLEUS`, `internal/gravity/store.go:62-64`), así que mecánicamente es viable hoy. El mismo `SessionID` se reutilizaría para cada llamada a `resolveActiveGravityActivity` dentro de esa ejecución.

**Quién sería responsable:** el propio `MandateExecutionWorkflow`, vía una Activity nueva — no requiere tocar Brain ni el sistema BSIP.

**Qué se rompe o queda mal modelado:** no hay ninguna conversación detrás — es una corrida desatendida, determinista, sin intercambios. Usar `SESSION` acá contradice literalmente la semántica que el propio diseño le da (§3: "se captura en vivo, durante la conversación"). Además, `DomainAction` no tiene ningún campo `IntentType` — sería necesario inventar uno (ver Gap G.1, §6) solo para poder llamar `ResolveActive`, que exige `IntentType` no vacío (`resolver.go:25-27`). El breadcrumb por turno que describe la UX spec (§2.4 de ese documento) no tendría sentido: una sola resolución por corrida, no una por turno.

**A favor:** es el cambio estructural más chico; desbloquea la invocación real de `resolveActiveGravityActivity` sin tocar Brain; da una unidad de auditoría razonable ("qué Gravity gobernó esta corrida de ejecución").

### (b) `SessionID` a nivel de `DomainAction` (cada capa/Action = un turno)

**Qué se crearía y cuándo:** un `SESSION` por `DomainAction` (o uno reusado con un `TurnID` incremental por Action), creado justo antes de cada llamada a `ScaffoldDomainActivity` dentro del loop de `MandateExecutionWorkflow`.

**Quién sería responsable:** el propio `MandateExecutionWorkflow`, dentro del loop — misma Activity nueva que (a), pero invocada N veces por ejecución en vez de una.

**Qué se rompe o queda mal modelado:** empeora el problema de (a) en vez de resolverlo — un `DomainAction` es, hoy, una unidad de scaffold opaca y de una sola pasada (§1.2), no una propuesta que un humano o un Agent Loop negocia en varios intercambios. Forzar semántica de "turno" sobre algo que no tiene ida y vuelta es inventar granularidad que nadie consume: nada lee hoy el resultado de `ResolveActive` para inyectarlo a ningún lado (`scaffoldReal` no llama a Brain — §1.2), así que la resolución por-Action no tiene destinatario. Tampoco resuelve el gap de `IntentType` faltante en `DomainAction` — al contrario, lo vuelve más agudo, porque haría falta un `IntentType` distinto y significativo por cada dominio para que el filtrado de `appliesTo` (`resolver.go:56`) hiciera algo más que pasar todo o nada.

**A favor:** en teoría da trazabilidad más fina por dominio — pero es trazabilidad sin consumidor hoy, y por lo tanto no hay evidencia de que sea la granularidad correcta hasta que exista el Agent Loop real dentro de `scaffoldReal`.

### (c) El concepto pertenece a otro sistema — Mandate Genesis debería consumir un `SessionID` ya existente, no generar uno propio

**Qué existe ya, real, que podría ser la fuente:** el motor BSIP de Brain (§2.1) tiene turno real y vivo (`add-turn`/`commit-turn`/`advance-turn`, `.turn_X/`). El lado Go ya tiene, sin usar, `BSIPTurnRef{IntentID, IntentType, Stage, TurnID}` (§2.2) — que es, conceptualmente, el mismo tipo de identidad que `resolve_active_gravity(session_id)` asume (`current_turn.intent_type` del pseudocódigo fuente).

**Qué se crearía y cuándo, si se siguiera esta opción:** o bien Brain (Python) crea el nodo `SESSION` de Gravity él mismo cuando arranca la negociación del intent `ing`/`dis` (llamando a Nucleus, o escribiendo directo bajo `.gravity/` si comparte filesystem), o bien una Activity nueva en Fase 1 (`IngestReceptionActivity` o una hermana) crea el `SESSION` atado al `intent_id` recién creado — y `MandateExecutionWorkflow`, en Fase 4, nunca crea nada: solo reutilizaría el `SessionID` que ya existe desde la ingesta.

**Qué se rompe o queda mal modelado:** la conversación del intent BSIP normalmente ya llegó a fase terminal *antes* de `freeze_to_mandate()` (§2.3) — para cuando Fase 4 ejecuta, esa sesión conversacional, si el diseño la trata como "viva", ya debería estar cerrada. Anclar el `SessionID` de ejecución a una conversación que ya terminó es, en el mejor caso, reutilizar un contenedor vacío; en el peor, mezclar dos regímenes de vida distintos (negociación pre-firma vs. ejecución post-firma) bajo un mismo nodo, lo cual el propio principio de inmutabilidad de `mandate.json` tras la firma (R-1) sugiere que deberían mantenerse separados. Además, la negociación turno a turno de la Fase 1 no está hoy orquestada por `MandateGenesisBuildWorkflow` en ningún punto verificable — ocurre, si ocurre, fuera del Workflow — así que "consumir" ese `SessionID` requeriría primero resolver un problema de integración más grande (cómo el Workflow se entera de qué `IntentID`/turno le corresponde) que hoy no está ni parcialmente resuelto en código: ni `GenesisBuildInput` ni `MandateExecutionInput` tienen un campo `IntentID` o `SessionID` (`mandate_genesis_build_workflow.go:79-86`, `mandate_execution_workflow.go:43-52`).

**A favor:** es la opción más fiel a lo que el propio diseño de `SESSION` dice que es (§3) — y es la única que no inventa semántica de turno donde no la hay, porque reutiliza un motor de turnos que ya existe y ya está vivo en producción (Brain/BSIP), en vez de simular uno dentro de un Workflow que ejecuta en batch.

---

## 5. Recomendación (ratificada por control: opción a)

**[P] Recomendación de este cowork:** adoptar la **opción (a)** para destrabar la invocación de `resolveActiveGravityActivity` en `MandateExecutionWorkflow` — pero **de forma deliberada y con la salvedad explícita registrada, no como default por simplicidad**.

Justificación honesta de por qué, a pesar de que (c) es la más fiel al diseño documental de `SESSION`:

1. **Hoy no hay nada que consumir en (c).** La negociación turno a turno de Brain (§2.1) no está orquestada por ningún Workflow de Mandate Genesis — integrarla requeriría primero resolver cómo `MandateGenesisBuildWorkflow` se entera de qué `IntentID`/turno de Brain corresponde a un Mandate en curso (hoy `GenesisBuildInput` no tiene ese campo), lo cual es un problema de diseño más grande que "dónde vive `SessionID`" y no fue el que este cowork tenía mandato de resolver.
2. **La conversación de origen (si existió) ya cerró antes de Fase 4.** Anclar la sesión de ejecución a una conversación de negociación ya terminada (§2.3, §4-c) es, como mínimo, una reinterpretación del ciclo de vida que ninguna fuente confirma.
3. **(a) no requiere tocar Brain ni ningún archivo Python** — se mantiene enteramente del lado Go/Gravity, coherente con el alcance de "Gravity es la única autoridad sobre autorización de postulados" sin forzar una integración cross-sistema todavía no diseñada.
4. **(b) no aporta nada que (a) no tenga hoy**, porque no existe ningún consumidor de resolución por-Action (§1.2, `scaffoldReal` no llama a Brain) — la granularidad fina de (b) es especulativa hasta que ese TODO se resuelva.

**Salvedad ratificada por control, no asumida:** adoptar (a) significa que, durante un tiempo, `SESSION` en código va a significar "una corrida de `MandateExecutionWorkflow`" y no "una conversación viva" — una divergencia deliberada del texto de `Impl §1.3` que debe documentarse como tal en el propio código (comentario explícito) para que quien lea `CreateGravitySessionActivity` en el futuro no asuma que ahí vive negociación turno a turno. Si más adelante Brain gana su propia integración con Gravity (cuando `scaffoldReal` empiece a hablar con Brain de verdad, §1.2), **(c) debería revisitarse** — en ese momento sí habrá una conversación viva dentro de Fase 4 a la que anclar `SESSION` con fidelidad al diseño original.

---

## 6. Gaps nuevos encontrados en el camino

**[G.1] `DomainAction`/`ScaffoldDomainInput` no tienen ningún campo `IntentType`.** `ResolveActive` exige `IntentType` no vacío (`resolver.go:25-27`) y lo usa para filtrar `appliesTo` (`resolver.go:56`, `applies()`). Sin importar qué opción se elija, hace falta decidir de dónde sale ese valor por dominio — hoy no existe en ningún struct de Fase 4. No resuelto por este cowork porque es una decisión de diseño propia, no una consecuencia mecánica de elegir (a)/(b)/(c). **Resolución asignada:** cowork de implementación de `MANDATE`+`SESSION`, ver Tablero §P.

**[G.2] Ningún nodo `MANDATE` de Gravity se crea hoy en ningún punto de la orquestación.** Grep confirmado: la única referencia al paquete `gravity` dentro de `internal/orchestration/` es `resolve_active_gravity_activity.go` (puramente de lectura). `Store.buildSpine` (`resolver.go:76-120`) falla duro si no existe un nodo `MANDATE` real bajo `.gravity/` — así que, sin importar qué opción de `SESSION` se elija, **falta también decidir quién crea el `MANDATE` de Gravity y cuándo** (¿al firmar, en `SignMandateActivity`? ¿en Fase 1, junto con `IngestReceptionActivity`?). Este es un bloqueo tan real como el de `SESSION`, y ninguna de las tres opciones evaluadas lo resuelve por sí sola. **Resolución asignada:** mismo cowork de implementación, ver Tablero §P.

**[G.3] `MarkBSIPEffectApplied`/`CommitBSIPTurn`/`AdvanceBSIPTurn` son una segunda isla desconectada, paralela a `resolveActiveGravityActivity`.** Implementadas, testeadas, con un `BSIPTurnRef` que ya modela `(IntentID, IntentType, Stage, TurnID)` — pero sin registrar en el worker ni invocadas por ningún Workflow (§2.2). No es el foco de este cowork. Registrado para priorización futura.

**[G.4] `scaffoldReal` no llama a Brain — el consumidor real de "Resolved Active Gravity" (un Agent Loop) no existe todavía en Fase 4.** Esto no bloquea el diseño del nodo `SESSION` en sí, pero sí significa que, aun resolviendo `SessionID`, el resultado de `resolveActiveGravityActivity` no tendría, hoy, ningún lugar real donde inyectarse — el propio propósito original de la función (filtrar contexto para un Agent Loop, `NUCLEUS_API_Contracts_Consolidado_v0_1.md` §2.4) queda sin destinatario hasta que ese TODO se resuelva.

---

## 7. Cierre

El bloqueo real no es sintáctico (`Store.CreateNode` ya permite crear `SESSION` sin gate especial) sino de diseño: qué es una "sesión" en un pipeline que, en su Fase 4, es batch y no conversacional. La evidencia real del repo muestra que el concepto de turno vivo existe — pero en Brain/BSIP, no en `MandateExecutionWorkflow`, y esa conversación (si ocurre) ya cerró para cuando Fase 4 arranca. Este documento recomendó (a), ratificada por control, con la salvedad explícita de que es una reinterpretación de `SESSION` que debe quedar documentada como tal en el código — y dos gaps nuevos (`G.1`, `G.2`) asignados al cowork de implementación en curso (Tablero §P).
