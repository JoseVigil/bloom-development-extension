# Auditoría del Stepper de Onboarding — Bloom Conductor

**Alcance:** `workspace/onboarding/` (Bloom Conductor). Este documento cierra la Fase A (auditoría contra código real) definida en `PLANTILLA-workspace-stepper-auditoria.md` y deja la base para la Fase B (rediseño).

**Método:** todo lo que sigue está citado contra archivos y números de línea reales (`main_conductor.js`, `onboarding.js`, `milestone-registry.js`, `milestone-reactor.js`, `preload_onboarding.js`, `onboarding_steps.json`). Donde algo no se pudo confirmar contra código, se marca explícitamente como pendiente — no se completó por inferencia.

---

## 0. Corrección de mapa — no hay dos steppers

La hipótesis inicial (heredada de `PROTOCOLO-synapse-homologacion-v3.md`) era que existían dos árboles paralelos: uno de "onboarding top-level" y uno de "stepper de workspace". El árbol real (`workspace_tree.txt`) descarta esa hipótesis:

```
workspace/                          ← el paquete completo de la app (Electron)
├── main_conductor.js               ← único conductor, gestiona ambas ventanas
├── ipc/
│   └── workspace-synapse-handlers.js
├── core/                           ← ventana "core" (post-onboarding, health/profiles)
└── onboarding/                     ← el stepper — el único que existe
    ├── ipc/onboarding-handlers.js
    ├── milestone-registry.js
    ├── milestone-reactor.js
    ├── onboarding.html
    ├── onboarding.js               ← el stepper en sí
    └── preload_onboarding.js
```

`onboarding/` es una subcarpeta de `workspace/`, no un árbol hermano duplicado. **El stepper de workspace es `workspace/onboarding/onboarding.js`.** No hay una segunda implementación.

Dato secundario, no confirmado: `main_conductor.js` (573 líneas, leído completo) nunca importa ni llama a `registerSynapseHandlers()` de `workspace-synapse-handlers.js` — arma su propio `SynapseBridge` inline dentro de `initOnboardingBridge()`. Esto sugiere que `workspace-synapse-handlers.js` no está conectado al flujo del stepper actual, pero no se confirmó qué otro módulo (posiblemente algo en `core/`) sí lo usa. **Pendiente de confirmar, no bloquea el resto de este documento.**

---

## 1. Arquitectura actual — cómo llega un evento hasta el stepper

```
Brain (TCP, puerto 5678)
   │
   ▼
SynapseBridge._classifyMessage()  →  emite 'message' con type 'ONBOARDING_MILESTONE'
   │
   ▼
main_conductor.js → initOnboardingBridge()
   bridge.on('message', enriched => {
     stepId = registry.resolveEvent(enriched.event)     // milestone-registry.js
     if (!stepId) { console.warn(...); return; }         // ← ver Bug #1
     reactor.handleMilestone(stepId, enriched)            // milestone-reactor.js
   })
   │
   ▼
MilestoneReactor._on<Step>Complete()
   - persiste el step en nucleus.json (_persistStepComplete)
   - ipcMain → 'milestone:reached' (canal IPC)
   - ipcMain → 'onboarding:step-ui-update' (actualizaciones granulares)
   │
   ▼
preload_onboarding.js (contextBridge)
   window.onboarding.onMilestone(cb)      → 'milestone:reached'
   window.onboarding.onStepUpdate(cb)     → 'onboarding:step-ui-update'
   │
   ▼
onboarding.js (renderer) → handleMilestoneReached(stepId, data)   [línea 484]
   → dispara goTo(n) y/o actualiza el sidebar visual (setStepperActive/setStepperEstablished)
```

Hay un **segundo canal**, independiente del anterior: el **polling de fallback**. Varias funciones (`advanceIdentityWizard`, el flujo de vault) arrancan un `setInterval` (`_pollFallbackTimer`, `_vaultPollFallbackTimer`) que llama `window.onboarding.pollIdentity()` y, si detecta el step completo, invoca `handleMilestoneReached()` manualmente — para cubrir el caso en que Brain nunca emite el evento push. Es decir: **el stepper puede avanzar por dos vías distintas para el mismo step** (push real vía milestone, o poll de respaldo), y ambas convergen en la misma función (`handleMilestoneReached`), lo cual es un buen diseño defensivo — pero significa que "qué disparó este avance" no siempre es trazable sin mirar los logs.

Existe además un **tercer mecanismo manual**: `window.onboarding.markStepComplete()`, expuesto en el preload como "fallback cuando Brain no escribe completed_steps". Con el Bug #1 activo (ver abajo), este fallback manual es hoy la única vía que garantiza avance.

---

## 2. Los pasos reales — qué hay, no qué debería haber

### 2.1 Definición "backend" (`onboarding_steps.json`, deployado en disco)

| id | screen | requires | produces | vault_required |
|---|---|---|---|---|
| `github_auth` | github-login | *(ninguno)* | github_token | false |
| `nucleus_create` | nucleus-create | github_token | nucleus_path | false |
| `vault_init` | vault-init | github_token, nucleus_path | vault_initialized | false |
| `google_auth` | google-login | vault_initialized | google_account | true |
| `ai_provider_setup` | provider-select | vault_initialized | ai_provider_key | true |
| `project_create` | project-create | vault_initialized, github_token | project_mandate | true |

Nota: este JSON **no trae** `cortex_events`, `blocking` ni `conductor_reaction` — ver Bug #1.

### 2.2 Definición "frontend" (`onboarding.js`) — seis estructuras paralelas

El renderer no lee `onboarding_steps.json` directamente. Redefine el mismo concepto seis veces, cada una con un recorte distinto de la realidad:

| Estructura | Línea | Qué recorta | Observación |
|---|---|---|---|
| `IDENTITY_STEPS` | 136 | 3 sub-pasos: `github`, `google`, `gemini` | **`vault_init` no está incluido** — se maneja aparte |
| `STEP_TO_NODE` | 309 | stepId backend → nodo visual (6 entradas) | `google_auth` y `ai_provider_setup` colapsan al mismo nodo `providers` |
| `STEPPER_NODES` | 323 | nodo → índice del DOM (5 nodos) | `workspace, identity, providers, project, mandate` |
| `STEPPER_MAP` | 336 | screen numérico → nodo activo | Comentario explícito: *"providers se maneja por onStepUpdate/milestone, no por navegación"* — dos mecanismos de avance conviviendo |
| `STEPPER_NAV` | 347 | nodo → screen destino | `providers` y `project` navegan al mismo screen (5) |
| `SCREEN_IDS` | 414 | índice numérico → nombre de screen | Comentarios tipo *"antes screen 1"* pegados a cada entrada — rastro de al menos una renumeración completa |

Sumado a `RESUME_STEP_ORDER` (línea 1471, lista hardcodeada aparte para la lógica de resume) y al propio `onboarding_steps.json`, son **ocho listas independientes de "cuáles son los pasos y en qué orden van"**, mantenidas a mano, sin derivación automática entre ellas. Esto confirma —con cita exacta— el patrón que la plantilla de auditoría pedía verificar antes de asumirlo.

### 2.3 El caso `vault_init` — ciudadano de segunda clase

`vault_init` existe en el backend (`onboarding_steps.json`) y en `STEP_TO_NODE`/`STEPPER_MAP`, pero **no en `IDENTITY_STEPS`**, que es el array que gobierna el wizard de identidad (`advanceIdentityWizard`, `advanceToNextIdentityStep`). En su lugar, se maneja como una interrupción ad hoc: el wizard llama `goTo(4)` directamente entre el sub-paso de GitHub y el de Google (comentario línea 340: *"vault screen (pertenece al nodo identity)"*). Cualquier cambio futuro al wizard de identidad tiene que acordarse de tratar vault como caso especial, porque el array que "define" el wizard no lo conoce.

### 2.4 Navegación por índice numérico (`goTo(n)`)

Los screens se navegan por índice (`goTo(0)`...`goTo(7)`), resuelto contra `SCREEN_IDS`. Esto es frágil: el propio header de `onboarding.js` documenta una renumeración completa histórica (*"goTo(4) llama runNucleusTerminal() [ver nota más abajo — esto era goTo(2)]"*), y hay código muerto comentado que quedó de la versión anterior de la numeración (línea 1240):

```js
// REMOVED (código zombie): initNucleus() redirigía a goTo(4) (terminal antigua del screen 2
// en el orden previo). Ya no forma parte del flujo...
// function initNucleus() { ... goTo(4); ... }
```

---

## 3. Hallazgos, clasificados en los tres baldes de la plantilla

### 3.1 Bugs activos

**🔴 Bug #1 — el pipeline de milestones está mudo (confirmado, no hipotético).**
`onboarding_steps.json`, ya deployado en disco, no incluye `cortex_events`, `blocking` ni `conductor_reaction` en ninguno de los 6 steps. `MilestoneRegistry._normalizeStep()` completa esos campos con `[]` / `false` / default. Consecuencia verificada en el código:
- `_eventToStepId` (el mapa evento Cortex → stepId) queda vacío.
- `resolveEvent()` devuelve `null` para cualquier evento, siempre.
- El guard en `main_conductor.js` (`if (!stepId) { console.warn(...); return; }`) descarta silenciosamente todo evento de milestone.
- Ningún `_on<Step>Complete()` de `MilestoneReactor` se ejecuta nunca.
- El único mecanismo de avance que sigue funcionando es el poll de fallback (§1) y el `markStepComplete` manual.

**Fix:** completar los tres campos faltantes en `onboarding_steps.json`, respetando el orden y `requires` actuales del JSON (no los de `FALLBACK_STEPS`, que están desactualizados — ver 3.2). Es un cambio de datos, deployable sin tocar código.

### 3.2 Deuda de documentación

- `FALLBACK_STEPS` (hardcodeado en `milestone-registry.js`) se autodeclara *"idéntico al JSON canónico del repo"* y no lo es: el JSON real tiene `github_auth` como primer paso sin requisitos, mientras que `FALLBACK_STEPS` pone `nucleus_create` primero. Si el JSON de disco alguna vez falla o se borra, el sistema cae a un orden de dependencias contradictorio con el que la UI actual espera.
- El header de `onboarding.js` documenta que una versión anterior de sus propios comentarios (`REQUIRED_ACCOUNTS`, ver RF-08/RF-11) contenía información incorrecta — el propio código dejó una nota pidiendo no confiar en comentarios viejos sin verificar el RF correspondiente.

### 3.3 Decisiones de diseño ambiguas o contradictorias

- **Duplicación de la conexión bridge→registry→reactor** entre `main_conductor.js` y `workspace-synapse-handlers.js` (documentado originalmente en `PROTOCOLO-synapse-homologacion-v3.md` §bug medio). No hay una única función compartida; cualquier fix al pipeline de eventos debe replicarse a mano en los dos lugares — si es que `workspace-synapse-handlers.js` efectivamente se usa (ver nota en §0).
- **Dos mecanismos de avance conviviendo sin regla explícita**: navegación por índice (`goTo(n)`, iniciada por click o por flujo secuencial) vs. avance por evento (`onStepUpdate`/`milestone:reached`). El propio comentario en `STEPPER_MAP` lo señala pero no lo resuelve.
- **`vault_init` como excepción no declarada** dentro del wizard de identidad (§2.3).
- Ocho fuentes paralelas de "cuáles son los pasos" (§2.2), sin que ninguna sea autoridad sobre las demás.

---

## 4. Roadmap para el rediseño (Fase B)

Orden de bloqueo — cada paso depende de que el anterior esté resuelto para poder verificarse contra código real en vez de contra supuestos:

**Paso 0 — Fix de datos (no bloquea el resto, pero sin esto no se puede probar nada end-to-end).**
Completar `onboarding_steps.json` con `cortex_events`, `blocking`, `conductor_reaction`.

**Paso 1 — Single source of truth de "qué son los pasos".**
Colapsar las ocho estructuras (§2.2) en una sola definición por step (`id`, `screen`, `node`, `resumeOrder`, `requires`, `identityWizardIndex` si aplica) de la que se **deriven** `IDENTITY_STEPS`, `STEP_TO_NODE`, `STEPPER_NODES`, `STEPPER_MAP`, `STEPPER_NAV`, `SCREEN_IDS` y `RESUME_STEP_ORDER`. Este es el cambio de arquitectura más caro y el que evita que cada modificación de UX futura haya que codificarla ocho veces.

**Paso 2 — Integrar `vault_init` como step de primera clase** en la estructura unificada del Paso 1, eliminando el manejo ad hoc vía `goTo(4)` como interrupción del wizard.

**Paso 3 — Unificar el mecanismo de avance.**
Definir explícitamente cuál de los dos (navegación por índice vs. avance por evento) es el canónico, y tratar al otro como capa de compatibilidad declarada, no como coexistencia accidental.

**Paso 4 — Decidir la duplicación bridge→registry→reactor.**
Confirmar primero si `workspace-synapse-handlers.js` está realmente en uso (pendiente del §0); si lo está, extraer la conexión a una función compartida en `shared/`.

**Paso 5 — Recién acá, definir los principios de UX no negociables** (resumibilidad, skip vs. bloqueo, feedback de error, paralelismo) y hacer el gap analysis de casos de uso nuevos vs. existentes — con la base de datos ya consolidada, cada decisión de UX se puede verificar contra una sola fuente de verdad en vez de contra ocho.

---

## 5. Preguntas abiertas para la sesión de rediseño

Estas no bloquean empezar el rediseño, pero conviene tenerlas resueltas antes de tocar UX puntual:

1. ¿`workspace-synapse-handlers.js` está conectado a algo hoy, o es código huérfano? (grep de `registerSynapseHandlers` en `workspace/core/`)
2. ¿El poll de fallback (`_pollFallbackTimer`, `_vaultPollFallbackTimer`) se mantiene como red de contención permanente en el nuevo diseño, o se retira una vez que el Bug #1 esté resuelto y el push de milestones sea confiable?
3. ¿Los nuevos casos de uso que se quieren agregar necesitan más nodos en el sidebar (`STEPPER_NODES`), o encajan dentro de los 5 existentes (workspace, identity, providers, project, mandate)?

---

# FASE B — Relevamiento de requerimientos

**Marco de trabajo cerrado (decisión del equipo):**
- Backend = Proceso Main (`main_conductor.js`, `milestone-registry.js`, etc.). Frontend = Proceso Renderer (`onboarding.js` + UI).
- SSOT único: un solo `onboarding_steps.json`. Main lo lee de disco; Renderer lo obtiene vía IPC (`window.onboarding.getStepsConfig()`).
- Navegación por `id` (`navigateTo(stepId)`), no por índice (`goTo(n)`). El SSOT separa `id` (identidad lógica del step) de `view`/`screen_id` (vista física), para soportar el caso 1:N ya visto en producción (`google_auth` y `ai_provider_setup` comparten la vista `providers`).
- Paso 0 del roadmap (fix de `cortex_events`/`blocking`/`conductor_reaction` en el JSON) se ejecuta ya, en paralelo, antes de tocar arquitectura.
- Paso 1 del roadmap (esqueleto único `STEPS`) es prioridad absoluta de esta fase. `vault_init` deja de ser caso especial.

## Requerimiento 1 — Lógica de Reanudación Inteligente e Idempotente

**Enunciado (dado por el usuario):**
1. Evaluación de estado real, no de logs: al iniciar, interrogar al sistema para confirmar qué `produces` existen de verdad.
2. Cálculo dinámico del punto de entrada: primer step de la lista cuyos `requires` estén satisfechos y cuyo `produces` sea nulo/inválido.
3. Idempotencia total: si un artefacto (ej. `github_token`) ya existe por fuera de la UI, el step correspondiente se saltea solo.
4. Eliminación de navegación hardcodeada: el avance es consecuencia de re-evaluar el estado contra el SSOT, no de que cada pantalla llame a `nextStep()`.

**Extensión de esquema propuesta — cada step declara su propio verificador:**
```js
{
  id:         'github_auth',
  view:       'identity',
  requires:   [],
  produces:   'github_token',
  verify:     'nucleus:check-artifact',   // canal IPC genérico, no un handler por step
  verifyArgs: { key: 'github_token' },
  // ...blocking, cortex_events, conductor_reaction (ya existentes)
}
```

Un único handler genérico en Main resuelve todos los artefactos, en vez de seis funciones sueltas:
```js
ipcMain.handle('nucleus:check-artifact', async (_e, { key }) => {
  // lee nucleus.json (reutilizando la misma lectura que ya hace
  // 'nucleus:get-installation') y/o hace la consulta puntual vía execNucleus
  // para artefactos que dependen de estado en vivo (ej. vault corriendo).
});
```

**Motor de resolución — reemplaza a `nextStep()` hardcodeado:**
```js
async function resolveEntryPoint(STEPS, checkArtifact) {
  const produced = new Set();
  for (const step of STEPS) {
    if (step.produces && await checkArtifact(step.produces)) produced.add(step.produces);
  }
  for (const step of STEPS) {
    const requiresMet = step.requires.every(r => produced.has(r));
    const alreadyDone = step.produces ? produced.has(step.produces) : false;
    if (requiresMet && !alreadyDone) return step.id;
  }
  return '__onboarding_complete__';
}
```

Se invoca desde `onboarding:get-resume-state` (canal ya existente en `preload_onboarding.js`) al boot, y después de cada milestone recibido — con lo cual el avance deja de depender de que cada pantalla llame a una función de "siguiente paso" propia.

**Hallazgo confirmado contra `milestone-reactor.js` (líneas 345-354):** `_persistStepComplete()` solo escribe el `stepId` en `onboarding.completed_steps[]` — nunca el valor real del artefacto. Es exactamente el patrón "last_step_completed" que el Requerimiento 1 pide dejar de usar. No hay hoy ningún campo en `nucleus.json` que guarde el valor real de `github_token`, `vault_initialized`, etc.

**Decisión abierta A/B — no resuelta, condiciona la implementación de `verify`:**
- **A — extender persistencia:** `nucleus.json` empieza a guardar `onboarding.artifacts.<nombre>` con el valor real, escrito por el reactor en cada milestone. Rápido, pero sigue siendo "confiar en lo que Main escribió antes".
- **B — verificación en vivo real:** cada `verify` interroga al sistema en el momento (filesystem, `execNucleus`, o `nucleus synapse status <profileId>` — ya usado en `main_conductor.js` para el catch-up poll). Es lo que el Requerimiento 1 pide literalmente, pero para 4 de los 6 artefactos no está confirmado qué comando de Nucleus expone ese estado puntual (los steps del JSON insinúan que viven en `chrome.storage.bloom_vault*`, capa Chrome extension, no en `nucleus.json` ni el filesystem local).

### Actualización — verificadores confirmados contra `onboarding-handlers.js` real

Corrección de campos: el nombre real en `nucleus.json` es `onboarding.workspace_path` (línea 374 de `onboarding-handlers.js`), no `installation.nucleus_path` como se había propuesto antes. `github_auth` se confirma contra `onboarding.github_token_fingerprint`, con dos nombres alternativos que Brain también usa (`github_token_stored`, `vault_github_stored` — línea 214-218).

```json
{
  "steps": [
    { "id": "github_auth", "view": "identity", "requires": [], "produces": "github_token",
      "verify": "nucleus:json-field-any",
      "verifyArgs": { "fields": ["onboarding.github_token_fingerprint", "onboarding.github_token_stored", "onboarding.vault_github_stored"] } },

    { "id": "nucleus_create", "view": "workspace", "requires": ["github_token"], "produces": "workspace_path",
      "verify": "fs:dir-and-marker",
      "verifyArgs": { "jsonField": "onboarding.workspace_path", "markerFile": ".nucleus" } },

    { "id": "vault_init", "view": "identity", "requires": ["github_token", "workspace_path"], "produces": "vault_initialized",
      "verify": "nucleus:synapse-component-status",
      "verifyArgs": { "profileIdField": "onboarding.profile_id", "component": "vault", "expectedState": "RUNNING" } },

    { "id": "google_auth", "view": "providers", "requires": ["vault_initialized"], "produces": "google_account",
      "verify": "nucleus:json-field", "verifyArgs": { "field": "onboarding.google_account" } },

    { "id": "ai_provider_setup", "view": "providers", "requires": ["vault_initialized"], "produces": "ai_provider_key",
      "verify": "nucleus:json-field", "verifyArgs": { "field": "onboarding.ai_provider_key" } },

    { "id": "project_create", "view": "project", "requires": ["vault_initialized", "github_token"], "produces": "project_mandate",
      "verify": "fs:exists", "verifyArgs": { "jsonField": "onboarding.project_path", "markerFile": "genesis.mandate" } }
  ]
}
```

```js
// onboarding-handlers.js — puente vacío
ipcMain.handle('onboarding:get-resume-state', async () => {
  const stepId = await resolveEntryPoint(registry.steps, execNucleus, NUCLEUS_JSON);
  return { success: true, stepId };
});

async function resolveEntryPoint(steps, execNucleus, NUCLEUS_JSON) {
  const nucleusData = JSON.parse(fs.readFileSync(NUCLEUS_JSON, 'utf8'));
  const produced = new Set();
  for (const step of steps) {
    if (step.produces && await checkArtifact(step, nucleusData, execNucleus)) produced.add(step.produces);
  }
  for (const step of steps) {
    if (step.requires.every(r => produced.has(r)) && !produced.has(step.produces)) return step.id;
  }
  return '__onboarding_complete__';
}

async function checkArtifact(step, nucleusData, execNucleus) {
  const get = (p) => p.split('.').reduce((o, k) => o?.[k], nucleusData);
  switch (step.verify) {
    case 'nucleus:json-field':      return !!get(step.verifyArgs.field);
    case 'nucleus:json-field-any':  return step.verifyArgs.fields.some(f => !!get(f));
    case 'fs:dir-and-marker': {
      const dir = get(step.verifyArgs.jsonField);
      return !!dir && fs.existsSync(dir) && fs.existsSync(path.join(dir, step.verifyArgs.markerFile));
    }
    case 'fs:exists': {
      const dir = get(step.verifyArgs.jsonField);
      return !!dir && fs.existsSync(path.join(dir, step.verifyArgs.markerFile));
    }
    case 'nucleus:synapse-component-status': {
      const profileId = get(step.verifyArgs.profileIdField);
      if (!profileId) return false;
      try {
        const status = await execNucleus(['--json', 'synapse', 'status', profileId], 5000);
        // PENDIENTE DE CONFIRMAR: se asume status.status.components[component].state.
        // Lo único confirmado en código real (onboarding-handlers.js:98-104) es
        // status.status.state / .sentinel_running a nivel de PERFIL completo,
        // sin desglose por componente.
        return status?.status?.components?.[step.verifyArgs.component]?.state === step.verifyArgs.expectedState;
      } catch { return false; }
    }
    default: return false;
  }
}
```

**Dos huecos bloqueantes para cerrar `vault_init` con precisión (no decorativos):**
1. `onboarding.profile_id` — de dónde sale el `profileId` que necesita `synapse status` nunca se confirmó en ningún archivo auditado.
2. La forma `status.status.components[...]` es una suposición para cumplir la instrucción de verificar el componente `vault`; si el binario Nucleus no devuelve ese desglose, `vault_init` necesita otro comando no visto todavía (ej. `nucleus vault status`).

También pendientes, mismo motivo (Opción A, campos nunca confirmados en código): nombre real de `onboarding.google_account` y `onboarding.ai_provider_key`, y el nombre real del archivo marcador de `project_create` (asumido `genesis.mandate` por instrucción directa, no por cita).

---

## Prompt de continuidad (usar si la sesión se corta)

> Retomamos la auditoría y rediseño del stepper de onboarding de Bloom Conductor. Adjunto `auditoria-stepper-workspace.md`, que contiene: (1) la auditoría completa de Fase A con hallazgos citados contra código real, (2) el marco de trabajo cerrado para Fase B — SSOT único vía IPC, navegación por `id`/`view`, Paso 0 (fix de datos) en curso, Paso 1 (esqueleto `STEPS` unificado) como prioridad — y (3) el Requerimiento 1 ya relevado (Resume Inteligente e Idempotente), con el esquema de `verify`/`verifyArgs` y el motor `resolveEntryPoint()` ya propuestos, pendiente solo de auditar `onboarding-handlers.js` (no subido todavía) para confirmar la lógica de resume actual que se reemplaza. Seguimos con el Requerimiento 2 en adelante, seguí citando contra código real cuando suba archivos nuevos, no asumas contenido de lo que no esté subido.
