# Bloom Conductor — Workspace Core UI: Contexto para sesión de Codex

## Qué es esto

Bloom Conductor es la app de escritorio (Electron + Svelte) que el usuario usa a diario — el "workspace core". Esta línea de trabajo viene rediseñando y arreglando su UI, partiendo de dos prototipos HTML legacy (`btips_workspace_v3.html` y `bloom-conductor-genesis-v1_1.html`) contrastados contra el código Svelte real, que resultó estar bastante desalineado de esos prototipos y con varios bugs de fondo no detectados hasta ahora.

**Regla de scope, no negociable:** esta línea de trabajo es **solo UI del Core**. Todo lo que toca Mandate Genesis (arquitectura de Temporal, `sentinel`, workflows de Go, el pivot de `MandateGenesisBuildWorkflow` a motor genérico) se trabaja en otra sesión aparte, dedicada. Si algo de UI depende de esa capa (como pasó con `synapse-simulator`, ver abajo), se documenta como pendiente cruzado y no se resuelve acá.

## Metodología que se viene usando (importante para Codex)

Nada se implementa por analogía o suposición sin verificar contra el código/binario real primero. Varias veces en esta línea de trabajo, código o handlers que parecían un patrón válido para replicar resultaron estar rotos (`nucleus profile list` no existe en el binario; `GET /api/v1/profile/list` tiraba 500 por mismatch de schema; `refresh-accounts` llamaba a un subcomando de Brain nunca implementado). El patrón que funcionó: diagnosticar primero (leer código, correr el binario/endpoint real, confirmar con evidencia), reportar antes de escribir código nuevo sobre una base no verificada, y solo entonces implementar. Mantené esa disciplina.

## Estado actual por feature

### ✅ Sidebar — cerrado y funcional
- Se sacaron "Intents" y "Projects" del nav (las rutas siguen en disco, huérfanas — la decisión de qué hacer con Intents a futuro es que van a vivir dentro de Mandate/Wisdom, no como nav-item propio).
- Se agregaron "Wisdom" (directorio/explorador de mandates, clasificado por Pillars — Security, Infrastructure, Governance — contenido real todavía no construido, solo stub) y "Settings" (distinto de "Account" — Account es la identidad/perfil del usuario logueado, Settings es configuración general de la app; ambos son stubs de contenido todavía).
- Se sacó la navbar legacy superior ("CAMBIO TEST 123" + botones sin handler "Crear Nucleus"/"Explorer").
- Se arreglaron dos bugs de fondo encontrados en el camino: navegación que caía siempre en el mismo mandate abierto (`sample_project`) en vez de ir a la ruta del ítem clickeado, y estado de foco/`aria-current` desincronizado entre nav-items y tabs de mandate abiertos.

### ✅ Profiles — cerrado y funcional (con un pendiente cruzado)
- Vista construida en `webview/app/src/routes/profiles/+page.svelte`.
- Perfil master (`master: true` en `profiles.json`) distinguido visualmente, con botón "Abrir landing" que lanza `nucleus:launch-profile` en modo `landing` explícito (antes el modo no se pasaba y caía siempre en `discovery`).
- Accounts del perfil: se muestran datos crudos reales (`{provider, identifier}`) — no hay tracking de estado/cuota en Brain todavía, así que eso no se simuló ni se bloqueó, se muestra lo que existe.
- Se arregló en el camino: mismatch de schema Fastify (`alias`→`name`, faltaba declarar `accounts`/`master_profile` en el schema — Fastify los descartaba en silencio), y se sacó `refresh-accounts` del router (comando de Brain que nunca existió).
- **Pendiente cruzado, no resuelto acá:** el link desde el perfil master hacia `synapse-simulator` (antes llamado "harness" — el nombre se cambió por completo, no correspondía). El mecanismo CLI directo (`brain profile launch --mode synapse-simulator`) funciona, pero el camino real que usa el Conductor (`nucleus synapse launch` → Temporal → `sentinel`) tiene el modo hardcodeado a solo dos ramas (`landing`/`discovery` — cualquier otro valor cae silenciosamente en `discovery`). Resolverlo implica tocar el binario Go `sentinel` o construir un IPC alternativo que saltee Temporal — eso es trabajo de la sesión de Mandate Genesis, no de acá.

### ⬜ Pendiente, no empezado todavía
- **Alfred** (asistente/chat context-aware): existía en el prototipo `v3` original, fue removido en `genesis-v1_1` (`BTIPS_UI_Contract_v1 §3`), y se decidió reincorporarlo para v1 por el avance del "agentic harness" (tecnología distinta de `synapse-simulator`, cuidado con no confundir los dos usos históricos de la palabra "harness"). Va en el panel lateral derecho, bloque inferior, colapsado por default. No hay componente base todavía — `ChatBTIP.svelte` (chat de Intents) sirve solo de referencia visual, no de base de código ni de modelo de datos.
- **Panel lateral derecho** (contenedor ya existe vacío en la UI real, confirmado por screenshot): 3 bloques fijos de arriba a abajo — switch de organización (siempre visible), system-info (siempre visible, reemplazo más sutil del `SystemStatus` legacy), Alfred (colapsado). Ninguno de los tres tiene contenido real todavía.
- **Switch de organización**: feature 100% nuevo, sin precedente en los mockups. Ubicación decidida (bloque superior del panel lateral derecho). Fuente de datos: array de organizaciones en `nucleus.json`. La lógica de resolución/persistencia está bloqueada hasta revisar `src/utils/org-resolver.ts` (extensión VSCode) para ver si es reusable desde Electron en vez de escribir un `switch-org-handler.js` desde cero.
- **Contenido de Home**: sigue sin confirmarse contra el archivo real `home/+page.svelte` (dos intentos de compartirlo terminaron siendo el mismo `+page.svelte` de la raíz por error). Se sabe que el legacy de la raíz tiene `SystemStatus`, `GeminiTokenForm`, `NucleusPanel`, `ProjectsPanel`, `IntentsLink` — pero eso es anterior a Mandates y hay que decidir si el listado de mandates recientes va en Home o dentro de Wisdom.
- **Contenido de Wisdom**: además del contenido en sí, falta confirmar si el campo "Pillar" ya existe en el schema de mandate del backend o hay que agregarlo, y si `explorer.routes.ts` (que ya existe, separado de `mandates.routes.ts`) tiene relación con esto.

### Bugs de fondo confirmados, no todos arreglados
- `SystemStatus.svelte` usaba `health.status === 'ok'` contra un endpoint que nunca devuelve ese valor — pero se descubrió que el canal real que usa es un `fetch` HTTP a Fastify (`/api/v1/health`), no el IPC `nucleus:health` que se había revisado antes. El fix real depende de qué devuelve ese endpoint del lado servidor — no confirmado todavía.
- Build roto preexistente, no tocado (fuera de alcance de esta línea de trabajo): `routes/intents/dev/[id]/+page.svelte` importa `lib/views/DevIntentView.svelte`, que no existe en el repo.

## Archivos de documentación involucrados

- **`Bloom_Conductor_Workspace_Core_UI_01.md`** — documento original que disparó esta línea de trabajo (arquitectura Conductor/Companion, Mandate Studio, `STORE_BRIEF`/`INJECT_BRIEF`). Punto de partida, ya superado por los documentos de abajo.
- **`Bloom_Conductor_Workspace_Core_UI_Decisiones_v1.md`** — primer consolidado de esta sesión, con la convención [CONFIRMADO]/[DECIDIDO]/[PENDIENTE]. Cubre sidebar, home, switch de org, profiles/accounts, perfil master, Alfred, panel lateral derecho.
- **`OPS_Sidebar.md`** — primer documento operativo, solo sidebar, generado por otra sesión web a partir del consolidado de arriba.
- **`OPS_FINAL_Workspace_Core_UI.md`** — corte final consolidado (sidebar + profiles/accounts + Alfred + panel lateral derecho + switch de org), el que efectivamente se le entregó a Claude Code para empezar a implementar.
- **`BLOOM_Mandate_Genesis_Roadmap_Maestro_v3_3.md`** — documento de la otra línea de trabajo (Mandate Genesis backend). Se usó una sola vez acá para verificar una cita puntual (destino de `LedgerPanel.svelte`, Paso 3 de la migración de UI, §4). No es fuente de esta línea de trabajo — pertenece al otro scope.

## Archivos de código tocados hasta ahora

- `webview/app/src/lib/components/Sidebar.svelte`
- `webview/app/src/routes/+layout.svelte`
- `webview/app/src/routes/wisdom/+page.svelte`, `webview/app/src/routes/settings/+page.svelte` (stubs)
- `webview/app/src/routes/profiles/+page.svelte`
- `src/api/adapters/BrainApiAdapter.ts`
- `src/api/schemas/profile.schema.ts`
- `src/api/routes/profile.routes.ts`
- `ipc/profiles-handlers.js`
- `preload_core.js`

## Qué necesita la sesión de Codex

Continuar con lo marcado "⬜ Pendiente, no empezado" arriba, respetando: (1) scope UI-only, nada de Mandate Genesis backend; (2) diagnóstico con evidencia real antes de implementar, mismo criterio que se viene aplicando; (3) el pendiente cruzado de `synapse-simulator` se documenta y se deriva a la sesión de Mandate Genesis, no se resuelve acá.
