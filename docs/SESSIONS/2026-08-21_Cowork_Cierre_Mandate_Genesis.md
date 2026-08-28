# Cierre de sesión Cowork — 2026-08-21

## Alcance de esta sesión

Todo el trabajo giró alrededor de un solo hilo: **por qué el Genesis Mandate no aparecía en Core al terminar el onboarding, y cómo dejarlo funcionando de punta a punta** — desde separar cuándo se crea el mandate (onboarding) de cuándo se muestra (Core), hasta confirmar el mecanismo real de eventos y cablear la UI. Al final se abrió, sin llegar a arrancar, un segundo frente: migrar la UI de Core al diseño objetivo (`bloom-conductor-genesis-v1_1.html`) — quedó en pausa esperando un screenshot del estado actual.

---

## 1. Onboarding — separación en dos fases (Fase A / Fase B)

**Problema de partida:** el mandate se creaba en el último paso del stepper de onboarding, mezclando dos cosas que no debían pasar en el mismo momento: crear el mandate y cerrar el onboarding.

**Fase A (auditoría, sin código):** relevamiento de cómo el step `mandate_genesis` disparaba la creación, cómo cerraba onboarding y abría Core, y piezas de contexto secundarias. Encontró que el disparador real de apertura de Core es el handler IPC `onboarding:complete`, no `milestone-reactor.js` como asumía el roadmap original — corrección que quedó incorporada en el roadmap v3.2.

**Fase B (implementación, tras confirmación explícita):**
- El step `mandate_genesis` pasó de crear el mandate a ser una pantalla explicativa que solo confirma que el usuario entendió (`onboarding.mandate_screen_acknowledged`, D-22).
- Se agregó el flag `onboarding.pending_genesis_launch` en `nucleus.json` (D-23): el handler `onboarding:complete` lo escribe antes de abrir la ventana de Core; Core lo consume y borra al bootear vía `genesisLaunch.ts`.
- Quedó registrado D-27 (triplicación de la declaración del step en 3 archivos — `onboarding_steps.json`, `milestone-registry.js`, `navigation.js` — sin bloquear nada, solo para no volver a rastrearlo).

---

## 2. Por qué Core no mostraba el mandate — dos auditorías

**Auditoría 1** (`Core_Mandate_No_Aparece_Auditoria_v1.md`): confirmó que Core no tenía **ningún** mecanismo — ni WS conectado por defecto, ni polling, ni lectura de disco — para enterarse de un mandate real. El único "tab" que abría algo era un placeholder 100% local (`mandateStore.ts`). De regalo, encontró que existen dos caminos de creación real (CLI vía IPC, y Fastify `POST /mandates`) que no se sabía si convergían, y que `mandate_watcher.go` — pieza clave para que Temporal arranque el workflow — solo se instancia bajo `nucleus service start`, nunca bajo `nucleus dev-start` (el comando que usa Electron).

**Auditoría 2** (`Mandate_Event_Mechanism_Auditoria_v1.md`, + su Addendum): resolvió las dudas que quedaron abiertas, con evidencia de archivo/línea:
- Ninguno de los dos caminos de creación llama a Temporal directamente — ambos solo escriben `mandate_state.json`; el único punto real de arranque del workflow es `mandate_watcher.go`. Es decir, **no son dos sistemas paralelos sin coordinar**, convergen en el mismo mecanismo — baja la gravedad de ese hallazgo.
- El camino CLI (usado por el hook automático) no emite ningún evento por sí mismo bajo `dev-start`, porque depende de una cadena (watcher → workflow → activity) confirmada muerta. El camino Fastify sí emite, de forma síncrona, sin depender de nada de eso.
- El puente entre el evento HTTP fire-and-forget de Go (`:48215`) y el WebSocket broadcaster (`:4124`) existe y está bien cableado.
- No existía ningún mecanismo de catch-up (listar mandates preexistentes al abrir Core) en ninguna capa — CLI, HTTP ni webview.
- Timing: Control Plane (`:48215`) está garantizado arriba (con intento de espera de hasta 8s) antes de que exista siquiera la ventana de Core — no hay riesgo de carrera al cambiar de camino de creación.

---

## 3. Implementación (autorizada tras las dos auditorías)

Con las auditorías confirmadas, se implementaron 3 frentes:

1. **`genesisLaunch.ts` migrado a Camino 2** (Fastify `POST /api/v1/mandates` en vez de IPC → CLI) — porque es el único que hoy emite evento real bajo `dev-start`.
2. **`GET /api/v1/mandates`** (nuevo `list-mandates.handler.ts`, registrado en `mandates.routes.ts`) — mecanismo de catch-up: escanea `.mandates/` y devuelve lo que ya existe en disco.
3. **Core escucha eventos reales:** `websocketStore` ahora se conecta en el arranque normal de Core (antes solo en `/debug`), `handleMessage()` despacha cualquier evento `mandate:*` por wildcard, `mandateStore.ts` dejó de ser un placeholder puro (`hydrateFromList`, `applyMandateEvent`), y `+layout.svelte` hace el catch-up al montar y abre tab para mandates activos.

Verificado: `tsc --noEmit` limpio, `vite build` sin errores nuevos (el único fallo es preexistente y ajeno, `DevIntentView.svelte`).

**Deliberadamente no implementado:** el arranque de `mandate_watcher.go` bajo `dev-start` (Camino CLI sigue sin emitir eventos ni progresar en Temporal). Quedó registrado como **TD-001** (`docs/tech-debt/TD-001-mandate-cli-watcher-fix.md`) — es la tarea inmediata siguiente, no cerrada en esta sesión a propósito.

---

## 4. Estado al cierre

| Frente | Estado |
|---|---|
| Onboarding separa creación (Camino 2) de confirmación de pantalla | ✅ Implementado |
| Core detecta y muestra mandates vía WS en vivo | ✅ Implementado |
| Core recupera mandates preexistentes al abrir (catch-up) | ✅ Implementado |
| CLI (`nucleus mandate genesis`) emite eventos / progresa en Temporal bajo `dev-start` | ❌ Pendiente — TD-001 |
| QA manual de D-22/D-23 (onboarding completo, cierre/reapertura de Core) | ❌ No corrida todavía, por ninguno de los dos lados |
| Migración de Core al diseño objetivo (`bloom-conductor-genesis-v1_1.html`) | 🟡 Recién arrancada — 3 documentos de contexto leídos, esperando screenshot del estado actual para definir el primer recorte de trabajo |

---

## 5. Para la próxima sesión

1. **TD-001** — instanciar `watchers.NewMandateWatcher` en `dev_start.go`, validar que el camino CLI emita eventos y progrese en Temporal.
2. **QA manual** del flujo completo: onboarding → cierre → apertura de Core → aparición del tab → progreso real vía eventos.
3. **Migración de UI de Core** — retomar donde quedó: pasar el screenshot del estado actual de `/home` para decidir, de a partes, qué se remueve/ajusta primero contra el diseño objetivo. Ojo con la discrepancia ya detectada entre el vocabulario de eventos `mandate:*` que se cableó en esta sesión (~10 eventos, `ws-events.ts`) y los 6 eventos reales que documenta el mock (`mandate:phase:ingest`, `mandate:action:started/completed/failed`, `mandate:genesis:rejected`, `mandate:genesis:all_complete`) — son vocabularios distintos, hay que reconciliarlos antes de dar por buena la implementación de `mandateStore.applyMandateEvent()`.
4. Decisión abierta de diseño: F-05 del manifiesto (`GenesisTab`/`StandardMandateTab` separados) contradice la consolidación en `MandateTab` genérico ya hecha — no resuelto, señalado acá para no perderlo.

## Documentos producidos en esta sesión

- `docs/MANDATE/Core_Mandate_No_Aparece_Auditoria_v1.md`
- `docs/MANDATE/Mandate_Event_Mechanism_Auditoria_v1.md` (incluye Addendum de catch-up/timing)
- `docs/tech-debt/TD-001-mandate-cli-watcher-fix.md`
- Este documento
