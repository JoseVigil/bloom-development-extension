# Auditoría — Core no muestra el Mandate Genesis recién creado

**Responde a:** `COWORK_Core_Mandate_No_Aparece_Prompt_v1_0.md`. Solo investigación — cero código escrito en esta sesión. No implementar nada hasta validar esto.

**Método:** lectura directa de código real (Go, TS/Fastify, Electron, Svelte webview), con cita de archivo/línea. Se responden los 4 puntos del prompt en orden, y se cierra con la conclusión explícita que pide el punto 4.

---

## 1. Cómo se entera Core hoy de que existe un mandate nuevo

**Respuesta corta: no se entera. No hay ningún mecanismo — ni push, ni pull, ni lectura de disco — que conecte un mandate real con la UI de Core.**

Evidencia, descartando cada mecanismo posible uno por uno:

- **¿Polling a Control Plane (:48215)?** No. `webview/app/src/lib/api.ts` es el único cliente HTTP del webview hacia `:48215/api/v1`. Tiene funciones para `nucleus`, `project`, `intents`, `auth/gemini`, `auth/github`, `health` — **cero funciones relacionadas a mandates** (`listMandates`, `getMandate`, etc. no existen). Nada en el webview hace `fetch` a `/api/v1/mandates`.
- **¿Evento push/WebSocket?** El canal existe del lado servidor, pero está desconectado del lado cliente:
  - `src/server/mandate-event-publisher.ts` (`publishMandateEvent()`) transmite todo evento `mandate:*` por `WebSocketManager.broadcast()` — el mismo puerto `:4124` que `webview/app/src/lib/api.ts` declara como `WS_BASE_URL`.
  - Pero el único store del webview que sabe conectarse a ese WS (`webview/app/src/lib/stores/websocket.ts`, `websocketStore`) **solo se conecta desde `routes/debug/+page.svelte`** (`websocketStore.connect('ws://localhost:4124')`, línea 109 de ese archivo) — un panel de debug, no el arranque normal de la app. `+layout.svelte` y `home/+page.svelte` nunca llaman a `.connect()`.
  - Aunque se conectara: `handleMessage()` (`stores/websocket.ts`, líneas 82-143) solo tiene casos para `btip:updated`, `intents:updated`, `profile:update`, `host_event` y los eventos `bloom.ai.execution.*` — **ningún caso para `mandate:*`**. Un evento de mandate que llegara por ahí se ignora en silencio, sin log.
- **¿Lectura directa de `.mandates/` en disco?** No — el webview corre en un `BrowserWindow`/navegador, sin acceso a filesystem salvo lo que exponga `window.onboarding`/`window.nucleus` (`preload_core.js`), y ninguno de esos dos expone nada de mandates salvo `createMandate`/`complete`/`markStepComplete` (acciones, no lecturas de estado).
- **¿Query a Temporal?** No — ni directamente (el webview no tiene SDK de Temporal ni podría, corre en el navegador) ni indirectamente (no hay ningún endpoint HTTP que la webview llame para esto).

**Lo único que hoy abre un "tab de mandate" en Core es el botón "Nuevo Mandate" de `TabBar.svelte`**, que dispara `handleNewMandate()` en `+layout.svelte` → `mandateStore.createMandate(...)` (`webview/app/src/lib/stores/mandateStore.ts`) — un store **placeholder explícito**, sin ninguna llamada a backend, que genera un `mandateId` local (`mandate-placeholder-${Date.now()}-...`) y datos de ejemplo. Es lo que se construyó en la sesión de consolidación de UI (Paso 4) — nunca tuvo pretensión de ser real, está documentado como tal en el propio archivo.

### Hallazgo adicional no pedido explícitamente, pero crítico para el diagnóstico: hay dos caminos de creación real, no uno

No hay un solo lugar donde se cree un mandate Genesis de verdad — hay dos, construidos en momentos distintos, que no se coordinan entre sí:

1. **Electron IPC → CLI Go.** `onboarding:create-mandate` (`installer/conductor/workspace/onboarding/ipc/onboarding-handlers.js`) ejecuta `nucleus mandate genesis --project --source` como subproceso. Es el camino que mi propio hook de la sesión anterior (`webview/app/src/lib/bootstrap/genesisLaunch.ts`, B.4.1) invoca vía `window.onboarding.createMandate(...)` al bootear Core con el flag `pending_genesis_launch`.
2. **Fastify `POST /api/v1/mandates` → Node.** `src/api/handlers/create-mandate.handler.ts` escribe `mandate_state.json` directamente desde Node (sin pasar por el binario `nucleus`) y llama a `publishMandateEvent('mandate:genesis:initiated', ...)`. Este servidor (`BloomApiServer`, `src/api/server.ts`) corre como `bin/bootstrap/bundle.js`, arrancado por Go mismo: `Supervisor.bootControlPlane()` (`installer/nucleus/internal/supervisor/service.go:1619`), invocado en la Fase 6 ("Control Plane") de `executeBootSequence()` — la función que corre `nucleus dev-start`, el comando que `main_conductor.js` efectivamente usa (confirmado en la auditoría de Fase A de la sesión anterior).

Mi hook de B.4.1 dispara el camino 1. Ninguno de los dos, sin importar cuál corra, termina abriendo nada en la UI — por lo explicado en el punto anterior, no hay ningún listener del lado del webview. Marco esto como discrepancia de mi propio trabajo previo: construí el hook automático contra el camino que confirmé en Fase A (el único que conocía en ese momento), sin saber que existía este segundo camino en `src/api/`, más nuevo y con más comentarios de fixes recientes — no se puede asumir cuál de los dos es "el candidato" sin una decisión explícita de tu lado.

---

## 2. ¿Es el mismo bug de Temporal/MandateWatcher, o algo distinto?

**Es una variante real y confirmada del mismo síntoma de fondo (MandateWatcher no corre), pero por una causa distinta a la documentada — no es una condición de carrera con Temporal caído.**

Evidencia:

- El patrón descrito en el prompt existe tal cual en el código: `installer/nucleus/internal/supervisor/service.go`, líneas 2119-2121:
  ```go
  tc, err := temporal.NewClient(bootCtx, &c.Paths, c.IsJSON)
  if err != nil {
      sup.slog("WARN", "Mandate watcher no arrancó — no pude crear el cliente de Temporal: %v", err)
  } else {
      mandateWatcher, err := watchers.NewMandateWatcher(mandatesRoot, tc, &c.Paths, c.IsJSON)
      ...
  ```
  Si `temporal.NewClient()` falla, el watcher nunca se crea y el único rastro es un `WARN`.

- **Pero ese bloque entero (líneas 2091-2140) vive dentro de `createServiceStartCmd()` (línea 2003 del mismo archivo) — el handler del comando `nucleus service start`.** Confirmé con grep sobre todo `installer/nucleus` que `watchers.NewMandateWatcher(...)` tiene **un único call site en todo el árbol**: exactamente ese, dentro de `service start`.

- `nucleus dev-start` — el comando que `bootServices()` en `main_conductor.js` ejecuta (confirmado en la Fase A anterior) — está implementado en `executeBootSequence()`, `installer/nucleus/internal/supervisor/dev_start.go:152`. Leí la función completa (Fases 0 a 7: Harness, Temporal, Worker Manager, Brain, Ollama, Governance, Vault, Control Plane, Svelte Dev Server) — **no menciona `MandateWatcher` ni `NewMandateWatcher` en ningún punto.**

- Por lo tanto: en el flujo real que corre Electron, **no es que MandateWatcher intente arrancar y falle por Temporal caído — directamente no existe ningún código que intente arrancarlo.** Sea cual sea el estado de Temporal (sano, caído, lento), el resultado es el mismo: sin watcher. Además, en `dev-start`, Temporal sí se espera correctamente antes de seguir (`nucleus temporal ensure`, `dev_start.go:190-224`) — el fix de "Temporal como dependencia bloqueante" que menciona el prompt como ya resuelto se ve reflejado ahí, pero es irrelevante para este síntoma puntual porque el watcher ni siquiera está en la lista de cosas que ese comando intenta levantar.

**Conclusión del punto 2:** no es "el mismo bug reapareciendo" en el sentido de una carrera de arranque — es un caso más simple de confirmar y más determinístico: el comando equivocado. Vale la pena resolverlo (afecta si el mandate progresa de Fase 1 a 4 alguna vez), pero no es la causa de que no aparezca el tab — eso pasa igual aunque el watcher corriera perfecto, por el punto 1.

---

## 3. ¿Condición de carrera de arranque en Core?

**No aplica, en el sentido que plantea el prompt.**

Una condición de carrera de "evento único que se pierde si el listener llega tarde" requiere que exista al menos un listener que, según el timing, a veces alcance a suscribirse a tiempo y a veces no. Acá no hay ningún listener en el camino normal de arranque de Core (ver punto 1) — no es que llegue tarde, es que nunca se suscribe. No hay nada que investigar sobre timing porque no hay ninguna suscripción activa que timing pudiera afectar.

---

## 4. ¿Hay algún indicio silencioso del fallo?

Depende de la capa:

- **Bajo `nucleus dev-start` (el comando real):** ni siquiera hay un `WARN` — el código que lo emitiría (`service.go:2113`/`2121`/`2125`) pertenece a `service start`, nunca se ejecuta bajo `dev-start`. Silencio total, sin ningún log de que "se decidió no arrancar el watcher" — porque nadie decidió nada, la rama de código no existe en ese comando.
- **Del lado Control Plane (`bootControlPlane`, `service.go:1619`):** si `BLOOM_NUCLEUS_PATH` no resolviera, `src/api/server.ts` (líneas 273-282) sí emite un `console.warn` explícito de tres líneas ("Las rutas /api/v1/mandates y /api/internal/mandate-event NO se van a registrar"). Pero ese bug puntual (env var vacía por reenvío crudo) está marcado como corregido en el propio código (`service.go:1660-1672`, comentario "BUG confirmado 2026-07-28" + fix vía `getWorkspacePath()`). No pude confirmar en runtime si hoy resuelve bien en tu entorno — esto es lectura estática del código, no una corrida real; dejarlo marcado como pendiente de confirmar con logs reales si se decide investigar por acá.
- **Del lado del webview (Core, la UI):** cero indicios. Ni un `console.warn`, ni un placeholder de "hay un mandate pero no hay UI para mostrarlo", ni un estado de error visible. Un mandate que se creó correctamente en disco (por cualquiera de los dos caminos del punto 1) es, para cualquiera mirando la pantalla de Core, exactamente indistinguible de que nunca se haya creado nada.

---

## Conclusión (punto 4 del prompt: causa real, con evidencia)

**No es (únicamente) el bug de Temporal/MandateWatcher tal como estaba documentado**, y **no es una condición de carrera de arranque en Core**. Es, en lo esencial, **algo tercero**: Core no tiene hoy ningún código — ni WS conectado por defecto, ni polling, ni lectura de estado — que muestre un mandate real. Esto alcanza por sí solo para explicar el síntoma exacto que reportás, con total independencia de si el mandate se creó bien, de qué camino de creación se usó, o de si Temporal/MandateWatcher están sanos. Aunque today mismo arrancara el watcher perfecto y el mandate progresara de Fase 1 a 4 sin errores, Core seguiría sin mostrar nada, porque nadie mira.

Junto a eso, sí hay una variante real y distinta del bug de MandateWatcher ya documentado — confirmada con evidencia de código, no es el mismo mecanismo (no es Temporal caído, es que `dev-start` nunca invoca el arranque del watcher) — que vale la pena resolver aparte, porque determina si el trabajo de un mandate avanza alguna vez del lado del backend, con independencia de que la UI lo muestre o no.

Por último, encontré (sin que el prompt lo pidiera) que hay dos caminos de creación real de mandate no coordinados entre sí (IPC→CLI Go vs. Fastify→Node), y que mi propio hook de la sesión anterior (`genesisLaunch.ts`) quedó apuntando a uno de los dos sin saber que el otro existía. Ninguna decisión de cuál camino es "el correcto" está tomada — la dejo explícita para que se resuelva antes de proponer cualquier fix, no la asumo acá.

**No propongo plan de implementación en este documento** — corresponde recién después de que confirmes esta lectura, tal como pide el prompt.
