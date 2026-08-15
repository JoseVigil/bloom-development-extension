# Fase A — Relevamiento: `mandate_genesis` (Onboarding → Core)

**Responde a:** `Directivas_Cowork_Onboarding_Mandate_v1.md` (v3.1). Fase A únicamente — investigación, cero código escrito. No pasar a Fase B hasta validar esto.

**Método:** lectura directa de los archivos reales listados en A.1/A.2/A.3, con cita de función/línea. Donde el código real contradice el roadmap/directiva, se marca explícito — no se corrigió nada en silencio.

---

## A.1 — El step y qué dispara hoy

### `onboarding/renderer/steps/step-mandate.js`
Confirma: el step **no** dispara IPC al completarse solo — dispara al click de "Create Mandate →" (`createGenesisMandate()`, línea 80). Llama `window.onboarding.createMandate({ project, projectPath })` → canal `onboarding:create-mandate`, síncrono (`await`, espera la respuesta). Si `result.success`, navega directo a `navigateTo('__onboarding_complete__')` (línea 113) — **sin pasar por Brain ni por MilestoneReactor**. El comentario de cabecera ya lo documenta: `mandate_genesis` tiene `cortex_events: []`, confirmado también en `milestone-registry.js`.

También registra `registerMilestoneHandler('mandate_genesis', onMilestoneMandateGenesis)` como "red de seguridad", pero es código muerto en el camino normal — nada dispara ese milestone en el flujo real (ver hallazgo bajo `milestone-reactor.js`).

Esto es exactamente lo que B.1 pide convertir en "pantalla explicativa sin ejecutar negocio".

### `onboarding/ipc/onboarding-handlers.js`
Confirma el handler completo, `ipcMain.handle('onboarding:create-mandate', ...)` (línea 643): síncrono, no fire-and-forget. Lo que hace, en orden:
1. Lee `nucleus.json`, resuelve `workspace_path` de la org activa (para el `cwd` del subproceso — sin esto `nucleus mandate genesis` no encuentra `.bloom/`).
2. Ejecuta `nucleus --json mandate genesis --project <project> --source <projectPath>` (línea 661).
3. Extrae `mandateId` del resultado (varios nombres de campo probados, fallback `local-${Date.now()}` — comentario propio marca esto como no confirmado contra el binario real).
4. Persiste `genesis_mandate_id` en el **proyecto activo dentro de `organizations[]/projects[]`** de `nucleus.json` (no un `mandate_state.json` aparte — eso lo escribe el binario Go, fuera del alcance de esta sesión).
5. Empuja `'mandate_genesis'` a `completed_steps[]` directamente, sin pasar por `reactor.handleMilestone()`.

**Discrepancia vs. la directiva:** el documento pregunta "¿escribe `mandate_state.json` él mismo, o delega?" — ninguna de las dos exactamente: escribe `genesis_mandate_id` en `nucleus.json` (proyecto activo), y delega la creación real del mandate al binario `nucleus` vía CLI. `mandate_state.json` es responsabilidad del lado Go, no auditado acá (correcto, fuera de alcance por B.5).

Esta es la función a "retirar (no necesariamente borrar)" según B.2.

### `onboarding/step-verifiers.js`
Confirma el mecanismo `verify: 'json_field'` (línea 43): `!!getField(nucleusData, field)`, genérico y trivial de reusar. También existen `json_field_any` y `fs_marker`. Para B.1 (nuevo verificador "usuario reconoció la pantalla"), el patrón más simple y consistente es un `json_field` nuevo (ej. `onboarding.mandate_screen_acknowledged`) — no hace falta un tipo de verify nuevo.

### `onboarding/renderer/core/ui-stepper.js`
Confirma que este archivo es puramente presentacional (clases CSS `.step-node`, `active`/`established`/`pending`) — no decide si un step "pasó". Esa decisión vive en `resolution-engine.js` (Main, vía `resolveEntryPoint()`) + `navigation.js` (Renderer, vía `navigateTo()`/`STEP_NODE`), confirmado leyendo ambos. `ui-stepper.js` solo pinta lo que `navigation.js` le indica.

---

## A.2 — Cierre de Onboarding y apertura de Core (D-23)

**Este es el hallazgo más importante de la sesión — corrige una asunción central del roadmap v3.1.**

### La cadena real confirmada (no la asumida)

```
step-mandate.js (click "Create Mandate →")
  → IPC onboarding:create-mandate (síncrono)
  → nucleus mandate genesis (CLI)
  → persiste genesis_mandate_id + completed_steps en nucleus.json
  → navigateTo('__onboarding_complete__')          [renderer, directo, sin Brain]

step-milestone.js (screen "milestone")
  → runMilestoneSequence() (animación)
  → usuario click "Enter System" → enterSystem() → runLaunchSequence()
  → completeOnboarding() → IPC onboarding:complete  [única llamada que importa acá]

onboarding-handlers.js → ipcMain.handle('onboarding:complete', ...)
  → escribe onboarding.completed:true en nucleus.json
  → createWorkspaceWindow(workspaceUrl)             [pasado como parámetro, main_conductor.js]
  → cierra la ventana de Onboarding vieja
```

### `onboarding/milestone-reactor.js`
Confirma que `mandate_genesis` SÍ tiene `_onMandateGenesisComplete()` registrado, con `conductor_reaction: 'onOnboardingSuccess'` en el SSOT (`milestone-registry.js`), y que ese handler sí llama a `_onOnboardingSuccess()` si `allBlockingDone`.

**Pero — discrepancia confirmada:** `_onOnboardingSuccess()` (línea 533) **no abre ninguna ventana ni cierra la de Onboarding**. Solo hace dos cosas: emite `milestone:reached` con `__onboarding_complete__` al renderer (payload IPC, no acción), y llama `nucleus synapse onboarding <profileId> --step success` (le avisa a Discovery/Chrome, no a Electron). El cierre real de ventana vive en `onboarding:complete` (`onboarding-handlers.js`), un IPC completamente distinto.

Más aún: `_onMandateGenesisComplete()` en la práctica **nunca se ejecuta** en el camino normal, porque nada llama a `reactor.handleMilestone('mandate_genesis', ...)` — `onboarding:create-mandate` persiste todo directo a `nucleus.json` sin pasar por el reactor (ver A.1). Es código correcto pero muerto salvo que algo lo dispare manualmente (synapse-simulator, o un futuro evento real de Brain que hoy no existe para este step).

**Conclusión para B.3:** el roadmap asumía que `conductor_reaction: onOnboardingSuccess` es "lo que dispara el cierre de ventana". No es así. El disparador real es la secuencia de UI en `step-milestone.js` (con un click humano intermedio, "Enter System") terminando en el IPC `onboarding:complete`. Cualquier rediseño de B.1-B.4 tiene que enganchar acá, no en `milestone-reactor.js`.

### `onboarding/milestone-registry.js`
Confirma el SSOT de `mandate_genesis`: `requires: ['project_name']`, `produces: 'genesis_mandate_id'`, `verify: 'json_field'` sobre `onboarding.genesis_mandate_id`, `blocking: true`, `cortex_events: []`. Sirve de plantilla exacta para declarar el nuevo step "pantalla explicativa" de B.1 (mismo patrón, sin necesidad de inventar campos).

### `main_conductor.js`
**Archivo crítico, confirmado del todo.** `createWorkspaceWindow(url)` (línea 252) recibe **un único parámetro**: la URL a cargar (`win.loadURL(url)`). No hay query string con datos de contexto, no hay `additionalArguments` en `webPreferences` (solo `preload: core/preload_core.js`), no hay variable de entorno ni argumento de proceso para pasar "arrancá Genesis". **Hoy Core se abre completamente en blanco.**

**Discrepancia vs. la directiva:** la pregunta "¿ya existe un canal disponible o hay que crear uno?" tiene respuesta clara: **no existe ninguno**. B.3 tiene que diseñar un canal nuevo — la instrucción "no crear uno si ya hay uno disponible" no aplica, porque no lo hay. Dado el patrón dominante en todo este código (leer/escribir flags en `nucleus.json` compartido entre procesos — `workspace_path_pending`, `ownership_init_status`, etc.), la opción más consistente con el resto del código sería un campo tipo `onboarding.pending_genesis_launch` en `nucleus.json`, leído por Core al bootear — pero esto es una decisión de diseño de Fase B, no tomada acá.

Confirma también que `registerOnboardingHandlers(...)` se registra en **ambas** ramas de `app.whenReady()` (`onboardingDone` true o false, líneas 672 y 684) — es decir, los canales `onboarding:create-mandate` y `onboarding:complete` ya están disponibles incluso cuando Core abre directo (sin pasar por Onboarding). Esto es relevante para B.4.

### `onboarding/preload_onboarding.js` y `core/preload_core.js`
**Hallazgo no anticipado por la directiva:** ambos preloads exponen `window.onboarding` con **prácticamente el mismo shape** — `core/preload_core.js` (línea 8) ya expone `createMandate`, `complete`, `markStepComplete`, etc., los mismos canales que Onboarding. Es decir: el renderer de Core, **hoy**, ya puede llamar `window.onboarding.createMandate({project, projectPath})` y disparar la creación real del mandate, sin ningún cambio de Electron/preload. Lo que falta es (a) quién invoca eso desde la UI de Core, y (b) si el handler debiera reubicarse físicamente a `core/ipc/` por prolijidad organizativa (B.4), aunque funcionalmente ya es alcanzable desde ahí.

`core/preload_core.js` también expone `window.nucleus` (línea 49): `health`, `listProfiles`, `launchProfile`, `createProfile`, `getInstallation` — este último (`nucleus:get-installation`) ya devuelve el objeto `onboarding` completo de `nucleus.json`, que podría leerse para detectar un futuro flag "arrancá Genesis" sin necesitar un canal IPC nuevo de lectura (solo haría falta uno para consumir/limpiar el flag).

### `core/ipc/health-handlers.js`, `core/ipc/profiles-handlers.js`
Confirman el patrón a seguir para el handler nuevo de B.4: función `registerXHandlers(execNucleus, [NUCLEUS_JSON], logger)` que recibe dependencias compartidas por parámetro y registra sus propios `ipcMain.handle(...)` adentro. Un futuro `core/ipc/mandate-handlers.js` debería seguir esta misma forma, no una estructura distinta.

---

## A.3 — Piezas de contexto

### `onboarding/resolution-engine.js`
Confirma su rol: capa intermedia real entre `step-verifiers.js` (chequea artefactos uno por uno) y el resume (`resolveEntryPoint()`, línea 32) — recorre los steps del SSOT en orden y devuelve el primero cuyos `requires` están satisfechos pero cuyo `produces` todavía no existe. No tiene relación directa con `milestone-reactor.js` (son dos mecanismos distintos: uno resuelve "dónde estoy" al cargar, el otro reacciona a eventos en vivo).

### `onboarding/verify-nucleus-init-hook.js`
**Discrepancia vs. la directiva:** no es un verificador candidato a `step-verifiers.js`. Es un script de test/simulación standalone (corre contra un `/tmp/nucleus_sim.json` fake) que ejercita `MilestoneReactor._initOwnership()` — un mecanismo totalmente distinto (`nucleus init --master`, ownership), sin relación con `mandate_genesis`. No aplica a esta sesión más que como descarte explícito.

### `onboarding/renderer/core/shared-state.js`
Confirma `selection.selectedProject = { name, path }` (línea 47), que es justo lo que `step-mandate.js` ya usa. Nota menor: `step-mandate.js` lee también `selection.importedProjectPath`, campo que **no aparece declarado** en el objeto `selection` de este archivo — probablemente se asigna dinámicamente en otro punto del flujo (`step-project.js`, no auditado en esta sesión). No es necesariamente un bug (JS permite la asignación dinámica), pero queda sin confirmar contra código real — anotado, no asumido.

### `ipc/workspace-synapse-handlers.js`
Confirmado, con evidencia nueva: `registerSynapseHandlers` está definido y exportado pero **no tiene ningún caller en todo el árbol de `workspace/`** (grep confirma cero referencias externas al propio archivo). D-05 sigue vigente tal cual estaba documentado — reportado acá como pide la directiva, sin tocarlo ni mezclarlo con D-22/D-23.

---

## Qué queda sin confirmar

- El shape exacto de stdout de `nucleus mandate genesis --json` (qué campo trae el ID real) — `onboarding-handlers.js` ya lo marca como no confirmado contra el binario, y esta sesión no tenía alcance para tocar Go.
- Origen de `selection.importedProjectPath` (no está en `shared-state.js`, probablemente en `step-project.js`, no leído).
- `BLOOM_Mandate_Genesis_Roadmap_Maestro_v3_1.md`, referenciado como contexto previo por la directiva, no se encontró en el repositorio ni en la carpeta de prompts compartida — el relevamiento de arriba se hizo contra el código real y la propia directiva v3.1, sin ese documento.

## Resumen para decidir antes de Fase B

1. **B.3 no tiene canal existente que reusar** — hay que diseñarlo. El patrón dominante del repo (flags en `nucleus.json`) es el candidato más consistente, no una alternativa inventada.
2. **El disparador real de D-23 es `step-milestone.js` → `onboarding:complete`, no `milestone-reactor.js`** — cualquier diseño de B.1-B.4 que asuma lo segundo va a enganchar en el lugar equivocado.
3. **`core/preload_core.js` ya expone los canales necesarios para el caso "a demanda" de B.4.2** — la pregunta de B.4 no es "¿se puede llamar desde Core?" (ya se puede), sino si conviene reubicar el handler a `core/ipc/` por organización de carpetas.
4. Cero archivos Go tocados. Cero decisiones de B.1-B.4 implementadas — solo este informe.
