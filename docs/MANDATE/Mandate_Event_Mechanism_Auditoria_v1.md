# Auditoría — Mecanismo real de evento detrás de la creación de Mandate

**Responde a:** `COWORK_Mandate_Event_Mechanism_Prompt_v1_0.md`. Solo investigación — cero código escrito en esta sesión. No implementar nada hasta validar esto.

**Método:** lectura completa de código real (no del documento de diseño, que se confirma desactualizado/contradictorio entre sus propias revisiones). Se responden los 4 puntos en orden, con archivo/línea, y se cierra con la síntesis que pide el cierre del prompt.

---

## 1. ¿`create-mandate.handler.ts` llama hoy a Temporal?

**No. Cero import, cero llamada.** El archivo completo (`src/api/handlers/create-mandate.handler.ts`, 157 líneas) tiene estos imports: `node:crypto`, `node:fs/promises`, `node:fs`, `node:path`, tipos de Fastify, `Static` de typebox, `CreateMandateBody`, `mandate-paths`, `publishMandateEvent`, `org-resolver`. Ningún import de `temporal/client.ts` ni de ningún cliente de Temporal.

El propio código lo dice explícitamente en su JSDoc (líneas 16-18): *"REESCRITURA: Este handler ya no depende de Temporal. Escribe el artefacto inicial en disco y notifica al bus de eventos para que el watcher de Nucleus (Go) tome el control."*

Lo que hace en su lugar, rama por rama:
- **`standard`** (líneas 78-98): escribe `mandate_draft.json`, llama `publishMandateEvent('mandate:draft:created', ...)`, responde 202.
- **`genesis`/`domain_expansion`** (líneas 101-156): escribe `mandate_state.json` (con flag `'wx'`, falla si ya existe → 409), llama `publishMandateEvent('mandate:genesis:initiated', ...)` (línea 149), responde 202.

**Conclusión punto 1:** el estado actual del código coincide con **RESOLUCIÓN v1.1** del documento de diseño, no con v1.2. La v1.2 (con el árbol `handler → temporal/client.ts → StartMandateGenesisBuildWorkflow`) describe un estado que no existe en el repo hoy — sea porque nunca se llegó a implementar así, o porque el handler se reescribió otra vez después de esa revisión. No se puede saber cuál de las dos sin ver el historial de commits, pero para esta auditoría no importa: lo que corre hoy es la versión sin Temporal.

---

## 2. ¿Cuál `publishMandateEvent` se dispara en el flujo real (`dev-start`)?

**Depende de qué camino de creación se use — y ahí aparece la asimetría central de esta auditoría.**

**Camino 2 (Fastify → Node):** dispara el TS `publishMandateEvent` **siempre**, de forma síncrona, en el mismo proceso que atiende el request — sin depender de Temporal, del watcher, ni de nada externo. Pasa en el instante en que se escribe el archivo en disco (líneas 92 y 149 de `create-mandate.handler.ts`).

**Camino 1 (Electron IPC → CLI Go, `mandate.go:createGenesisMandate`):** **no dispara ningún evento en el momento de la creación.** El propio código lo documenta explícitamente, líneas 407-410:

```go
// El watcher recoge este archivo por fsnotify y dispara el workflow —
// no hace falta notificar nada más desde acá. Si en algún momento se
// necesita feedback inmediato hacia :4124 desde el CLI (hoy solo lo hace
// la API vía publishMandateEvent), es una decisión aparte.
```

La única publicación de evento asociada a este camino vive río abajo, dentro de una Activity de Temporal: `PublishMandateEventActivity` → `publishMandateEvent` (Go, `mandate_genesis_activities.go:280-298`) — que solo se ejecuta si el workflow `MandateGenesisBuildWorkflow` está corriendo. Y el workflow solo arranca si `mandate_watcher.go` lo dispara (ver punto 4). Y `mandate_watcher.go` **nunca arranca bajo `nucleus dev-start`** — ya confirmado con evidencia de código en la auditoría anterior (`Core_Mandate_No_Aparece_Auditoria_v1.md`, punto 2: único call site de `watchers.NewMandateWatcher` es `service.go:2123`, dentro de `createServiceStartCmd`, comando que Electron no usa).

**Conclusión punto 2, con la severidad completa:** en el flujo real que corre hoy la app (`dev-start`), el **Camino 1 no emite ningún evento de mandate, en ningún momento, por ningún canal.** No es un problema de "cuál puerto" — es que la cadena entera que produciría el evento (watcher → workflow → activity → Go `publishMandateEvent`) está muerta desde el primer eslabón. Y Camino 1 es, específicamente, el que el hook `genesisLaunch.ts` (B.4.1, sesión anterior) invoca automáticamente al abrir Core. El único de los dos caminos que sí emite algo hoy es Camino 2 (Fastify), que actualmente no tiene ningún disparador automático desde Onboarding/Core — solo lo alcanza quien llame directamente a `POST /api/v1/mandates`.

---

## 3. ¿El canal real es el mismo `:4124` al que se conecta `websocketStore`?

**Sí, en cuanto a puerto — pero eso no alcanza para que el evento llegue, por dos razones distintas según el camino.**

- El puente entre el POST HTTP fire-and-forget de Go (`:48215/internal/mandate-event`) y el broadcaster TS de `:4124` **existe y está bien cableado**: `src/api/routes/internal-mandate-event.routes.ts` registra `POST /internal/mandate-event`, valida que `event` empiece con `'mandate:'`, y llama a la misma función `publishMandateEvent(event, data)` que usa Camino 2 directamente — es decir, ambos terminan en el mismo emisor TS, por el mismo puerto `:4124`. Esta ruta está gateada por la misma variable `BLOOM_NUCLEUS_PATH` que `/api/v1/mandates` en `server.ts`, y esa variable se confirmó corregida (`service.go:1660-1672`, "BUG confirmado 2026-07-28").
- El problema no es que falte el puente — es que, para Camino 1, **nada llega a activar el lado Go del puente**, porque como se estableció en el punto 2, la cadena que llamaría a `publishMandateEvent` (Go) nunca se ejecuta bajo `dev-start`.
- Del lado cliente, el hallazgo de la auditoría anterior sigue vigente sin cambios: `websocketStore` (`webview/app/src/lib/stores/websocket.ts`) solo se conecta desde `routes/debug/+page.svelte`, nunca desde el arranque normal de Core, y `handleMessage()` no tiene ningún caso para `mandate:*`. Aunque el evento se emitiera perfecto por `:4124` — cosa que hoy solo pasa si se usa Camino 2 — no habría nadie escuchando en el arranque normal de la app.

**Conclusión punto 3:** el canal es el correcto y el puente Go→TS existe. El problema tiene dos capas independientes, cualquiera de las dos alcanza para que no llegue nada a la UI hoy: (a) para Camino 1, el evento nunca se emite en primer lugar; (b) para cualquier camino, incluido Camino 2 si se emitiera, el cliente no escucha en el arranque normal.

---

## 4. ¿Camino 1 y Camino 2 terminan en el mismo workflow de Temporal?

**Sí — y este es el hallazgo que más cambia la lectura de la auditoría anterior.**

Confirmé con grep sobre todo `installer/nucleus` y sobre todo `src/` que **`StartMandateGenesisBuildWorkflow` tiene un único call site en todo el repo**: `mandate_watcher.go:295`, dentro de `startGenesisWorkflow` (línea 286). Ni `create-mandate.handler.ts` (Camino 2, confirmado punto 1) ni `mandate.go:createGenesisMandate` (Camino 1, confirmado arriba, comentario propio líneas 407-410) llaman a Temporal directamente. **Ambos caminos hacen exactamente lo mismo en cuanto a orquestación: escriben `mandate_state.json` con el mismo shape y se retiran.** El comentario en `create-mandate.handler.ts:112-116` lo dice explícitamente, citando ambos archivos por nombre: *"el watcher de Nucleus (Go) necesita estos campos embebidos... mandate_watcher.go (MandateState) y mandate.go (createGenesisMandate), que ya escriben este mismo shape desde la unificación CLI/API"* — confirma que la unificación de shape fue deliberada, no casualidad.

Esto significa: **no son dos sistemas paralelos sin coordinar — son dos puertas de entrada al mismo mecanismo, con un único punto de arranque de Temporal (el watcher) actuando de árbitro.** Baja la gravedad del hallazgo "dos caminos no coordinados" de la auditoría anterior, tal como el prompt anticipaba en su punto 4. El problema real no es coordinación entre los dos caminos — es que el árbitro (`mandate_watcher.go`) está apagado bajo `dev-start`, lo cual deja a **ambos** caminos sin workflow real, no solo a uno.

**Sobre el riesgo de doble arranque:** el Workflow ID es determinístico por mandate — `fmt.Sprintf("mandate_genesis_%s", mandateID)` (`temporal_client.go:412`) — y cada creación (sea CLI o API) genera un `mandateID` nuevo (`uuid.New()` en Go / `randomUUID()` en TS) en el momento de creación, no reutiliza uno existente. No hay escenario realista donde Camino 1 y Camino 2 intenten arrancar el **mismo** `mandateID` simultáneamente, porque no operan sobre una entidad preexistente compartida — cada llamada crea un mandate distinto. El mecanismo de dedupe que sí existe (`mandate_watcher.go:286-293`, manejo de `IsAlreadyStarted`/`WorkflowExecutionAlreadyStarted` en líneas 308-312) está pensado para un escenario más acotado y real: fsnotify puede emitir el mismo evento de escritura duplicado, y el watcher podría intentar arrancar el mismo workflow dos veces para el mismo mandate — eso sí está cubierto. `StartWorkflowOptions` (`temporal_client.go:414-417`) no fija ningún `WorkflowIDReusePolicy` explícito (solo `ID` y `TaskQueue`), pero es irrelevante para este caso: esa política gobierna qué pasa al re-arrancar un ID cuyo workflow anterior ya **cerró**, no la colisión con uno que sigue **corriendo** — ese caso ya lo cubre el `IsAlreadyStarted` de arriba, sin importar la política de reuse.

---

## Síntesis para la decisión pendiente

Con las cuatro respuestas confirmadas, el cuadro completo queda así:

- **No hay dos sistemas de orquestación compitiendo.** Hay un solo punto real de arranque de Temporal (`mandate_watcher.go`), alimentado por dos escritores de `mandate_state.json` que ya comparten shape de forma deliberada. La pregunta de "cuál camino es el canónico" para *crear* el mandate es, en este sentido, menos crítica de lo que parecía — ambos alimentan al mismo mecanismo corriente abajo.
- **Lo que sí distingue a los dos caminos hoy, de forma importante, es la emisión de eventos**, no la orquestación: Camino 2 emite `publishMandateEvent` (TS, `:4124`) de forma inmediata y síncrona en cada creación, sin depender de nada más. Camino 1 no emite nada por sí mismo — depende enteramente de una cadena (watcher → workflow → activity) que está confirmada muerta bajo `dev-start`.
- El puente Go↔TS (`:48215` → `:4124`) existe y funciona — no es lo que falta.
- Lo que falta, en las dos puntas, es: (a) que `mandate_watcher.go` arranque también bajo `dev-start` (no solo `service start`) para que Camino 1 tenga alguna vía de llegar a emitir algo, y (b) que el webview escuche `:4124` en su arranque normal y tenga un caso para `mandate:*` en `handleMessage()` — ninguna de las dos cosas depende de resolver primero "cuál camino es el canónico", son prerequisitos comunes a cualquier decisión que se tome sobre eso.

**No propongo plan de implementación en este documento** — corresponde recién después de que confirmes esta lectura, tal como pide el cierre del prompt. Quedan fuera de esta auditoría, tal como se pidió explícitamente, la superficie de exposición de `:48215`/`:4124` (loopback vs. más allá) — pendiente para una sesión aparte.

---

## Addendum — Catch-up/sync inicial y timing de `genesisLaunch.ts`

Responde a los dos puntos pendientes planteados después de validar la auditoría de arriba. Mismo criterio: solo investigación, con evidencia de archivo/línea.

### A. Mecanismo de catch-up / sincronización inicial — no existe, en ninguna capa

Confirmado por ausencia total, no por una implementación insuficiente:

- **HTTP:** `src/api/routes/mandates.routes.ts` registra un único método — `fastify.post('/mandates', ...)` (línea 31). No hay ningún `fastify.get` relacionado a mandates en todo `src/api` — grep sobre el directorio completo (`fastify.(get|post)\(|mandates`) solo encuentra el POST de creación, más el schema y el handler ya auditados.
- **CLI Go:** `mandate.go` solo define dos subcomandos relacionados a lectura/escritura: `mandate genesis` (creación, ya auditado) y `mandate status` (`mandateStatusSubcommand`, lee un mandate puntual por `--mandateId`). Grep dirigido (`list|List`) sobre el archivo completo no encuentra ningún subcomando `mandate list` — no existe.
- **Webview:** ya confirmado en la auditoría anterior (`Core_Mandate_No_Aparece_Auditoria_v1.md`, punto 1) — `webview/app/src/lib/api.ts` no tiene ninguna función de mandates, ni de lectura ni de escritura.
- **Lo que sí existe como building block:** `mandatesRoot(fsCtx)` (`src/utils/mandate-paths.ts:15`) sabe construir el path a `.mandates/` dentro del workspace activo — es lo que usan tanto el handler de creación como (del lado Go) `cfg.MandatesRoot()`. Ningún código actual itera ese directorio para listar; el helper solo se usa hoy para construir la ruta de un mandate puntual conocido por ID.

**Conclusión A:** no hay nada que auditar como "bug" acá — es una funcionalidad que directamente no fue construida todavía, en ninguna de las tres capas (CLI, HTTP, webview). Para que Core muestre mandates preexistentes al abrir (de una corrida anterior, o creados por cualquiera de los dos caminos antes de que la UI esté escuchando), hace falta diseñar un mecanismo de listado — la opción más directa dado lo que ya existe sería un `GET /api/v1/mandates` que escanee `mandatesRoot()` y lea cada `mandate_state.json`/`mandate_draft.json`, que `genesisLaunch.ts` (u otro hook de arranque de Core) consulte una vez al montar, antes o en paralelo a suscribirse al WS. Esto queda como diseño a decidir, no como algo que ya esté a medio construir.

### B. Timing de `genesisLaunch.ts` — Control Plane sí está garantizado arriba antes del hook

**Confirmado: sí, con un margen amplio.** Cadena completa, en orden:

1. `main_conductor.js:138` (`bootServices`) spawnea `nucleus --json dev-start` y **espera (`await`) su salida completa** — el proceso Electron no continúa hasta que el subproceso Go termina y devuelve su JSON de resultado (líneas 150-209).
2. Dentro de ese subproceso, `executeBootSequence` (`dev_start.go`) corre **Fase 6 (Control Plane) antes que Fase 7 (Svelte)** (líneas 340-357). Fase 6 es bloqueante dentro de la secuencia: si `bootControlPlane` devuelve error, aborta todo el `dev-start` (`FailedStage = "control_plane"`, línea 346-347).
3. `bootControlPlane` (`service.go:1619`) no solo spawnea el proceso Node (`bundle.js`) — **espera explícitamente hasta 8s a que el puerto 48215 esté escuchando** (`s.waitForPort("48215", 8*time.Second)`, línea 1757) antes de retornar. El env var `BLOOM_NUCLEUS_PATH` (necesario para que `server.ts` registre las rutas de mandates) ya viaja seteado correctamente en el `env` que arma esta misma función (línea 1672) — o sea, para cuando el puerto responde, las rutas ya están registradas, no hace falta un paso adicional de espera para eso.
4. `main_conductor.js` recién llama a `createWorkspaceWindow(url)` **después** de que `bootServices()` resuelve (líneas 671/708, ambas detrás del `await bootServices(...)` de la línea 635) — es decir, después de que Fase 6 y Fase 7 completas ya corrieron dentro del subproceso Go.
5. `genesisLaunch.ts` corre recién cuando el webview monta (`onMount` en `+layout.svelte`) — un paso más tarde todavía: la ventana ya existe, Vite ya sirvió la página, React/Svelte ya hidrató.

**Conclusión B, timing:** por construcción, Control Plane tiene su intento de arranque completo (spawneado + hasta 8s de espera de puerto) resuelto antes de que `dev-start` siquiera termine — y `dev-start` termina antes de que exista la ventana de Core, que a su vez existe antes de que `genesisLaunch.ts` corra. No hay ninguna carrera plausible entre el hook y la disponibilidad de `:48215`.

Único riesgo residual, menor y ya heredado del diseño actual (no nuevo): el `waitForPort` de 8s en `bootControlPlane` es **no-fatal** — si el bundle Node tarda más de 8s en bindear el puerto, el boot continúa igual con solo un `WARN` a stderr de Go (línea 1758), que no se propaga al JSON que lee Electron. En ese escenario extremo (raro, pero posible bajo máquina muy cargada), la ventana de Core podría abrir con Control Plane todavía no listo. Esto ya existía antes de cualquier cambio a `genesisLaunch.ts` — no es algo que la elección de camino introduzca o resuelva.

**Sobre el cambio de Camino 1 a Camino 2 en `genesisLaunch.ts`:** dado que Control Plane está confirmado arriba (o al menos con intento completo) antes de que el hook corra, **no hay timing adicional que resolver para habilitar el cambio** — `POST http://localhost:48215/api/v1/mandates` es alcanzable en el mismo punto del ciclo de vida en el que hoy se invoca `window.onboarding.createMandate(...)` (Camino 1, IPC→CLI). El cambio de camino es viable en términos de timing; la ventaja adicional, ya establecida en el cuerpo de esta auditoría (punto 2), es que Camino 2 emite su evento de forma síncrona sin depender de la cadena watcher→workflow→activity que está confirmada muerta bajo `dev-start` — cosa que Camino 1 no puede ofrecer hoy sin resolver primero el arranque del watcher.

**No propongo plan de implementación en este addendum tampoco** — quedan ambos hallazgos (A y B) como confirmación para que decidas el prompt de implementación final.
