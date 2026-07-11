# 📘 Guía Maestra: Stepper de Onboarding v2.2 (SSOT)

**Fecha de actualización:** 7 de Julio de 2026
**Estado:** Arquitectura unificada implementada, confirmada contra código real, **y ahora también confirmada como conectada al HTML que efectivamente se sirve** (ver §0 — esto no estaba cerrado en v2.1 pese a decirlo). Fase B cerrada salvo dos pendientes técnicos menores (§5). Fase C (Identity/Discovery/Landing/Project) definida como próxima iteración — ver documento de requerimiento aparte.
**Fuente de Verdad Única (SSOT):** `onboarding/onboarding_steps.json`

Este documento reemplaza a v2.1. Todo lo marcado como "confirmado" en esta versión fue verificado leyendo el archivo real, no inferido de la descripción.

---

## 0. Corrección crítica sobre v2.1 — el wiring HTML↔JS no estaba cerrado

**Lo que v2.1 decía:** "Arquitectura unificada implementada y confirmada contra código real. Fase B cerrada." Esto era cierto para el código en sí — `core/`, `steps/*`, el patrón de auto-registro, todo existe tal cual se describe en §3. **Lo que v2.1 no verificó — y debería haber marcado como pendiente en vez de dar por cerrado — es si `onboarding.html` efectivamente carga y usa ese código.**

**No lo hacía.** Confirmado el 7 de julio, leyendo `onboarding.html` real contra el propio `onboarding.js` modular:

1. `onboarding.js` (el módulo nuevo, con `import * as navigation from './renderer/core/navigation.js'` etc.) termina con un bloque `MIGRATION` que el propio autor del refactor dejó escrito, especificando dos cambios pendientes en `onboarding.html`. Ninguno de los dos estaba aplicado:
   - Línea 1740 del HTML: `<script src="onboarding.js"></script>` — sin `type="module"`. Sin este atributo, el navegador no puede parsear los `import` del archivo: **tira `SyntaxError` y el archivo entero no ejecuta ni una línea.**
   - Línea 1428 del HTML: `<button onclick="goTo(1)">Start</button>` — `goTo` fue eliminado a propósito del `onboarding.js` nuevo (ver comentario en el propio archivo). El botón de entrada llamaba a una función que ya no existe.
2. Mientras este wiring no estaba aplicado, lo que corría en la práctica contra ese HTML era una versión previa y monolítica de `onboarding.js` (con `goTo(n)`, `SCREEN_IDS`, `IDENTITY_STEPS`, ocho listas paralelas — el mismo patrón que `auditoria-stepper-workspace.md`, Fase A, había señalado como el problema a resolver). Esa es la razón por la que, al auditar el árbol de archivos en sesión, aparecieron dos `onboarding.js` incompatibles entre sí: uno era el código nuevo, correcto, pero desconectado; el otro era el viejo, todavía activo de facto porque el HTML seguía apuntándole a él en la práctica.

**Corrección aplicada el 7 de julio de 2026** (diff de dos líneas, exactamente el que el propio `onboarding.js` especificaba en su bloque `MIGRATION`, nada agregado ni interpretado):

```diff
- <button class="btn-primary" onclick="goTo(1)">Start</button>
+ <button class="btn-primary" onclick="startOnboarding()">Start</button>

- <script src="onboarding.js"></script>
+ <script type="module" src="onboarding.js"></script>
```

Se verificó además que no quedan más referencias a `goTo(` en ningún otro punto del HTML (grep sobre el archivo completo, cero resultados).

**Lo que esto NO confirma todavía:** que el flujo corra limpio end-to-end en Electron real. La corrección resuelve el bloqueo de carga/sintaxis que impedía que el módulo se ejecutara — no reemplaza una corrida real de humo. Pendiente: probarlo en la app y, si algo rompe en consola, traerlo para seguir auditando.

**Lección de proceso, para no repetir esto:** de acá en adelante, "Fase cerrada" en este documento significa "código confirmado leyendo el archivo real **y** confirmado que el archivo que efectivamente carga el navegador/Electron es ese, no uno con el mismo nombre en otra ruta o una versión previa". Verificar el wiring (qué script tag carga qué archivo, con qué atributos) pasa a ser un paso explícito de cualquier cierre de fase, no un supuesto.

---

## 1. La Arquitectura (el "Cerebro") — confirmada de punta a punta

```
Brain (Synapse)
   │  bridge.on('message') — solo type === 'ONBOARDING_MILESTONE'
   ▼
workspace-synapse-handlers.js → _connectMilestoneReactor()
   registry.resolveEvent(enriched.event) → stepId
   reactor.handleMilestone(stepId, enriched)
   │
   ▼
onboarding-handlers.js (Main)
   ipcMain 'milestone:reached' / 'onboarding:step-ui-update'
   │
   ▼
preload_onboarding.js → window.onboarding.onMilestone/onStepUpdate
   │
   ▼
renderer/core/ipc-bridge.js → handleMilestoneReached(stepId, data)
   → busca en milestoneHandlers (Map) el handler que el step registró
   │
   ▼
renderer/steps/step-*.js → produce el artefacto, llama navigateTo(siguiente stepId)
```

1. **SSOT (`onboarding_steps.json`)**: define identidad, vista, `requires`, `produces`, `verify`/`verifyArgs`, `blocking`, `cortex_events`, `conductor_reaction`. **Confirmado:** el JSON real en disco ya trae los tres campos que en la auditoría de Fase A (Bug #1) estaban ausentes — el pipeline de milestones ya no está mudo.
2. **Verificadores (`step-verifiers.js`)**: implementa 3 tipos (`json_field`, `json_field_any`, `fs_marker`), síncronos, sin red ni `execNucleus`. **Nota:** esto es más simple que lo que Fase A había propuesto para `vault_init` (`nucleus:synapse-component-status` contra `execNucleus`) — la implementación real optó por verificar `onboarding.vault_initialized` como campo plano en `nucleus.json`, escrito por el reactor al procesar el milestone. Es Opción A (persistencia extendida), no Opción B (verificación en vivo), de la decisión abierta que Fase A había dejado sin resolver.
3. **Motor (`resolution-engine.js`)**: `resolveEntryPoint(steps, nucleusJsonPath)` — recorre `steps` **en el orden literal del array**, calcula el set de `produced` leyendo `nucleus.json` una sola vez, y devuelve el primer step cuyo `requires` está satisfecho y cuyo `produces` no existe. Si todos están satisfechos, devuelve el sentinel `'__onboarding_complete__'`. Confirmado que está conectado en vivo: `onboarding-handlers.js` lo importa y lo usa en `onboarding:get-resume-state`.
4. **Handlers (`onboarding-handlers.js`)**: puente de IPC hacia `execNucleus`/filesystem. No decide flujo — solo persiste y expone estado.

### 1.1 — El orden del array SÍ determina la UI (confirmado, no inferido)

`resolution-engine.js` hace `for (const step of steps)` en orden de aparición. Con el JSON actual (`github_auth` primero, `requires: []`), el entry point en limpio es siempre `github_auth`. **Decisión de producto confirmada con el usuario:** este es el orden que se quiere mantener (github antes que nucleus_create). No requiere ningún cambio en el JSON.

---

## 2. Mapa de Verificación (confirmado campo por campo contra `onboarding-handlers.js`)

| Step ID | Produce | Verificación real | Campo(s) en `nucleus.json` |
| :--- | :--- | :--- | :--- |
| `github_auth` | `github_token` | `json_field_any` | `onboarding.github_token_fingerprint` / `github_token_stored` / `vault_github_stored` |
| `nucleus_create` | `workspace_path` | `fs_marker` | `onboarding.workspace_path` + marcador `.nucleus` |
| `vault_init` | `vault_initialized` | `json_field` | `onboarding.vault_initialized` |
| `google_auth` | `google_account` | `json_field` | `onboarding.google_account` (**no confirmado si Brain escribe exactamente este nombre** — sigue pendiente, ver §5) |
| `ai_provider_setup` | `ai_provider_key` | `json_field` | `onboarding.ai_provider_key` (**mismo pendiente**) |
| `project_create` | `project_mandate` | `fs_marker` | `onboarding.project_path` + marcador `genesis.mandate` |

`onboarding-handlers.js` persiste además, confirmado en código: `workspace_path_pending`/`workspace_org_pending` (guardado optimista pre-spawn de `nucleus create`, para no perder el intento si la app se cierra a mitad de camino), y `github_username`/`github_org` vía el handler dedicado `onboarding:persist-github-data`.

---

## 3. Renderer — módulos reales y patrón de auto-registro (confirmado, y ahora confirmado cargado)

```
onboarding/renderer/
├── core/
│   ├── navigation.js     — dueño del SSOT en el renderer, navigateTo(stepId)
│   ├── ipc-bridge.js     — log(), listeners de push, dispatch de milestones
│   ├── ui-stepper.js     — solo clases CSS del sidebar
│   ├── shared-state.js   — objetos mutables compartidos (activeAccounts, workspaceState, etc.)
│   ├── notifications.js  — utilidad transversal
│   └── tab-system.js     — utilidad transversal
└── steps/
    ├── step-identity.js  — agrupa github_auth + google_auth + ai_provider_setup (un solo wizard)
    ├── step-vault.js     — vault_init
    ├── step-workspace.js — nucleus_create
    ├── step-project.js   — project_create
    └── step-milestone.js — sentinel __onboarding_complete__ (no es un step real del SSOT)
```

**Regla dura, confirmada en el código de los 5 archivos de `steps/`:** ninguno importa a otro salvo la excepción declarada — `step-vault.js` importa `advanceToNextIdentityStep` de `step-identity.js` (necesario porque tras confirmarse el vault, el flujo vuelve a Google dentro del mismo wizard). `core/` no importa nada de `steps/` en ningún archivo leído.

**Patrón de auto-registro, confirmado en los 5 archivos:** cada `step-*.js` termina con `registerStepHandler(stepId, { onEnter, restore })` y, cuando corresponde, `registerMilestoneHandler(stepId, handler)`. `navigation.js` y `ipc-bridge.js` nunca conocen los steps por nombre — solo consultan sus `Map` internos.

**`vault_init` ya es first-class, ya no es la excepción ad hoc que señalaba la auditoría de Fase A (§2.3):** tiene su propio `step-vault.js`, su propio `registerStepHandler`, y `advanceIdentityWizard()` en `step-identity.js` lo trata como destino explícito (`navigateTo('vault_init')`) tras confirmarse GitHub — ya no es un `goTo(4)` a mano sin declarar.

**Pendiente de auditar (no leído todavía en ninguna sesión):** `step-workspace.js`, `step-project.js`, `step-milestone.js`. `onboarding.js` los importa como side-effect igual que a `step-identity.js`/`step-vault.js` (que sí se auditaron), pero no hay confirmación línea por línea de estos tres. Dado lo que pasó en §0, no asumir que están bien solo porque siguen el mismo patrón nominal — auditar antes de dar por buena esa parte del árbol.

### 3.1 — Wizard de Identity (confirmado, `step-identity.js` completo)

Un solo array gobierna los 3 sub-pasos:
```js
IDENTITY_STEPS = [
  { id: 'github', key: 'github_auth', ... },
  { id: 'google', key: 'google_auth', ... },
  { id: 'gemini', key: 'ai_provider_setup', ... },
]
```
Un solo botón (`#btn-continue-identity`) y un solo popup de ayuda (`#info-popup`) recorren este array vía `identityWizard.stepIndex`. El salto a `vault_init` está hardcodeado como caso especial dentro de `advanceIdentityWizard()` cuando `current.id === 'github'` — es decir, la secuencia real es `github → vault → google → gemini → project`, y solo los primeros/últimos tres viven en `IDENTITY_STEPS`; vault se intercala por fuera del array pero navegando por `stepId`, no por índice.

---

## 4. Compatibilidad con el Harness de Debugging (requerimiento explícito, no negociable de acá en más)

Confirmado en `onboarding-handlers.js`, ya implementado y en uso:

1. **`harness:inject-milestone`** (línea ~563): `ipcMain.handle`, gateado por `!app.isPackaged`. Recibe `{ stepId, data }`, arma un `enriched` sintético (`type: 'ONBOARDING_MILESTONE'`, `event: stepId.toUpperCase()`, `_harness: true` para trazabilidad) y llama directo a `reactor.handleMilestone(stepId, enriched)` — salteando Brain y Chrome. Permite testear cualquier step sin cuenta real.
2. **Raw event feed**: en `workspace-synapse-handlers.js`, si `opts.verbose` (`!app.isPackaged`), cada bridge reenvía **todo** mensaje de Synapse por `synapse:raw-event`. En `ipc-bridge.js`, `onSynapseEvent` clasifica esos eventos (`synapseCategory()`) y los postea al iframe `#debug-frame` en dos formatos (`SYNAPSE_RAW_EVENT` crudo y `SYNAPSE_EVENT` categorizado para el Event Feed de `debug.html`).

**Regla de diseño para todo lo que sigue (Fase C incluida):** cualquier milestone nuevo que se agregue — incluidos los que surjan de rediseñar Discovery/Landing — tiene que seguir siendo disparable 1:1 vía `harness:inject-milestone` con un `stepId` del SSOT. Si Discovery/Landing terminan necesitando sub-milestones que no mapean a un `stepId` del JSON, hay que decidir explícitamente cómo se exponen al harness (¿se agregan como steps reales del SSOT aunque no bloqueen navegación, o se extiende el payload de `data` de un step existente?) — no se puede dejar una zona no inyectable sin cuenta real.

---

## 5. Pendientes técnicos reales (confirmados, ya no especulados)

1. **`getStepsConfig` sigue sin existir en `onboarding-handlers.js`.** Confirmado: no hay ningún `ipcMain.handle('onboarding:get-steps-config', ...)` en el archivo completo. `navigation.js` corre hoy contra `FALLBACK_STEPS`, una copia embebida manual del JSON. Mientras esto no se resuelva, hay una duplicación real del SSOT (aunque menor, porque `FALLBACK_STEPS` es solo el fallback de arranque, no se usa si el canal existe).
2. **Segunda duplicación encontrada:** `ONBOARDING_STEP_IDS` (array hardcodeado de 6 ids, línea 19 de `onboarding-handlers.js`), usado para validar en `onboarding:mark-step-complete`. Si se agrega un step nuevo al JSON sin actualizar este array, `mark-step-complete` lo rechaza con `"Unknown step"` sin que nada más avise del desfasaje.
3. **Nombres reales de `google_account` y `ai_provider_key` sin confirmar contra un log real de Brain** (heredado de Fase A, sigue abierto — requiere una corrida real con cuenta, no lectura de código).
4. **Transiciones visuales y UX de error** — pausados por decisión explícita del usuario (foco actual: terminar Identity/Discovery/Landing/Project antes de pulir esto).
5. **`step-workspace.js`, `step-project.js`, `step-milestone.js` sin auditar** (ver §3) — nuevo, agregado tras el hallazgo de §0.
6. **Corrida de humo real en Electron pendiente** tras la corrección de §0 — el fix resuelve el bloqueo de sintaxis/carga, no reemplaza probarlo corriendo.

---

## 6. Roadmap actualizado

**Cerrado (confirmado, incluyendo wiring):**
- SSOT único consumido por Main (`resolution-engine.js`) y por Renderer (`navigation.js`, con fallback).
- Renderer modularizado en `core/` + `steps/*` (parcial — ver §3, tres archivos sin auditar), dependencia unidireccional, patrón de auto-registro.
- `vault_init` integrado como step de primera clase.
- Harness de debugging operativo y documentado como constraint permanente.
- **`onboarding.html` conectado de verdad a `onboarding.js` modular** (`type="module"` + `startOnboarding()`) — corregido 7 de julio de 2026, ver §0.

**Abierto, orden sugerido:**
1. Auditar `step-workspace.js`, `step-project.js`, `step-milestone.js` contra el HTML real, mismo método que expuso el hallazgo de §0 — no asumir que están bien conectados.
2. Corrida de humo real en Electron del flujo completo tras el fix de wiring.
3. Implementar `onboarding:get-steps-config` en `onboarding-handlers.js` y hacer que derive `ONBOARDING_STEP_IDS` del mismo JSON en vez de mantenerlo aparte — mata las dos duplicaciones de §5.
4. **Fase C — foco actual del usuario:** rediseño de Identity (UI multi-cuenta), Discovery (páginas explicativas + lanzadoras por servicio) y Landing (extender para guardar tokens/keys), más la estrategia de `project_create` (copiar proyecto existente sin historial git). Ver documento de requerimiento dedicado.
5. UX de error / retroceso automático si un verificador falla (pausado, retomar después de Fase C).
6. Transiciones visuales (auto-avance vs. click en "Continuar") — regla general ya acordada: cuando existe callback de Synapse, avanza automático; el resume es lo que hay que endurecer primero.
