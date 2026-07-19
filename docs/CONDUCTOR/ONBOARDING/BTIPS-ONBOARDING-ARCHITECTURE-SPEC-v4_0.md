# BTIPS-ONBOARDING-ARCHITECTURE-SPEC-v4.0

**Versión:** v4.0.0
**Fecha:** 16 de julio de 2026
**Estado:** SSOT documental vigente del módulo de Onboarding — BTIPS

---

> ## ⚠️ Este documento reemplaza y da por obsoleto de forma definitiva a:
> - `BTIPS-ONBOARDING-ARCHITECTURE-SPEC-v3.0.md` (10 de julio de 2026)
> - `Guia-Maestra-Stepper-Onboarding-v2_2.md` (7 de julio de 2026)
> - `BLOOM_ONBOARDING_WORKFLOW_SPEC_v2_3.md` (29 de junio de 2026)
>
> Los tres quedan retirados y **no deben consultarse** a partir de esta fecha.

**Origen:** auditoría de código completa (16/07/2026) contra el refactor de modularización de `onboarding.js` en `renderer/core/` + `renderer/steps/`, sumado al backend (`onboarding-handlers.js`, `milestone-registry.js`, `milestone-reactor.js`, `resolution-engine.js`, `step-verifiers.js`) y al `onboarding_steps.json` real de disco.

**Qué cambia respecto a v3.0.0:** v3.0.0 documentaba correctamente el backend pero tenía **12 archivos sin auditar** (todo `renderer/`, `resolution-engine.js`, `step-verifiers.js`), listados en su §3.2 como gap pendiente. Esta versión cierra esos 12 archivos y, al hacerlo, **encuentra 6 divergencias reales entre el código y el propio orden/esquema que v3.0.0 da por sentado** — tres de arrastre en fallbacks hardcodeados, y tres que rompen flujo en producción de forma silenciosa (sin excepción, sin log visible fuera de consola). Ver §4.

**Convención de este documento (sin cambios respecto a v3.0.0):** cada afirmación está marcada como **✅ Verificado en código** o **🔲 Pendiente de auditar**. Con esta versión, la lista de 🔲 pendientes de v3.0.0 §3.2 queda en cero — todo lo que estaba pendiente fue leído línea por línea en esta sesión.

---

## 1. Arquitectura e hilo conductor

### 1.1 — Orden real de los steps

```
nucleus_create → vault_init → github_app_auth → google_auth → ai_provider_setup → project_create
                                                  (no bloqueante)  (no bloqueante)
```

✅ **Verificado en código** contra tres fuentes independientes que ahora coinciden entre sí:
- `onboarding_steps.json` real de disco (v3.0.0, `_version: "3.0.0"`)
- `milestone-registry.js` → `FALLBACK_STEPS`
- `resolution-engine.js` → `resolveEntryPoint()`, que recorre `steps` en este mismo orden y devuelve el primer step con `requires` satisfechos y `produces` todavía no verificado

⚠️ **Con una excepción confirmada** — ver Bug #2 en §4: el `FALLBACK_STEPS` embebido en `renderer/core/navigation.js` **no** coincide con este orden. Tiene el esquema PAT viejo invertido (github primero). No es una fuente más a promediar contra las otras tres — es la que está mal.

| # | Step ID | Requires | Produces | Bloqueante |
|---|---|---|---|---|
| 1 | `nucleus_create` | — | `workspace_path` | Sí |
| 2 | `vault_init` | `workspace_path` | `vault_initialized` | Sí |
| 3 | `github_app_auth` | `vault_initialized` | `github_app_token` | Sí |
| 4 | `google_auth` | `vault_initialized` | `google_account` | No |
| 5 | `ai_provider_setup` | `vault_initialized` | `ai_provider_key` | No |
| 6 | `project_create` | `vault_initialized`, `github_app_token` | `project_mandate` | Sí |

**Corrección respecto a v3.0.0 §1.1:** la tabla de v3.0.0 no tenía errores en `requires`, pero sí quedó ambigua sobre el nombre exacto del artefacto de `nucleus_create`. Queda cerrado acá: es **`workspace_path`**, verificado contra `onboarding_steps.json` real y contra `onboarding-handlers.js` línea 386 (`data.onboarding.workspace_path = nucleusPath`). El campo `nucleus_path` que aparece en el fallback hardcodeado de `milestone-registry.js` es un nombre viejo que no se usa en ningún otro lugar del sistema — ver Bug #3 en §4.

### 1.2 — Por qué el Vault va antes que GitHub

✅ **Verificado en código, sin cambios respecto a v3.0.0.** El token de la GitHub App (Device Flow, scopes Contents/Administration/Members) se guarda cifrado dentro del Vault, no en texto plano — Nucleus debe completar `Authorize()` antes de poder tocar el Keyring real. `vault_init` va antes que `github_app_auth` por integridad de dato, no por conveniencia de UI.

### 1.3 — `github_auth` (PAT) es un step retirado, no una variante de `github_app_auth`

✅ **Verificado en código**, y con un matiz nuevo importante respecto a v3.0.0: el string `'github_auth'` **no está completamente erradicado del código**, pese a que el step fue retirado. Sigue vivo como texto hardcodeado en dos lugares que deberían usar `'github_app_auth'` — ver Bugs #4 y #5 en §4. v3.0.0 daba por cerrado este punto solo mirando `onboarding_steps.json` y `onboarding-handlers.js`; no había auditado `milestone-reactor.js` ni `renderer/steps/step-workspace.js`, que es donde sobrevive el nombre viejo.

### 1.4 — Por qué `google_auth` y `ai_provider_setup` no son bloqueantes

✅ Sin cambios respecto a v3.0.0. Ambos tienen `blocking: false`, dependen solo de `vault_initialized`.

### 1.5 — Mapeo stepper (UI) vs. steps canónicos

✅ **Cerrado en esta sesión** (v3.0.0 lo dejaba como 🔲 pendiente contra `step-vault.js`, ya auditado). Confirmado contra `onboarding.html`, `ui-stepper.js`, `navigation.js` y los cinco `step-*.js`:

- `onboarding.html` define **5 nodos** físicos en el sidebar: `sn-workspace`, `sn-identity`, `sn-providers`, `sn-project`, `sn-mandate` (índices 0-4, `STEPPER_NODES` en `ui-stepper.js`).
- El SSOT tiene **6 steps**, con `view` compartido entre pares: `vault_init` y `github_app_auth` comparten `view: "identity"`; `google_auth` y `ai_provider_setup` comparten `view: "providers"`.
- `navigation.js` resuelve la **screen** física (8 screens en el DOM: `entry`, `workspace`, `nucleus-init`, `identity`, `vault`, `project`, `milestone`, `launch`) con un mapa `STEP_SCREEN` que a propósito le da a `vault_init` su propia screen (`screen-vault`) aunque comparta `view` con `github_app_auth` — confirmado correcto, las 8 screens existen 1:1 en el DOM.
- **Hallazgo nuevo, no documentado en v3.0.0:** el 5º nodo del sidebar, `sn-mandate`, no corresponde a ningún `view` del SSOT (ningún step declara `view: "mandate"` — `project_create` usa `view: "project"`). Es un nodo huérfano: clickearlo no navega a ningún lado, y nunca pasa a `established` porque `step-milestone.js` marca `'project'` como establecido al completar el onboarding, no `'mandate'`. Ver Bug #6 en §4.

---

## 2. Mapeo técnico — eventos Cortex → step ID

✅ **Verificado en código en su totalidad** (v3.0.0 tenía dos filas marcadas 🔲; ambas se cierran acá).

| Step ID | Evento(s) Cortex canónico(s) | Campo de verificación | Método |
|---|---|---|---|
| `nucleus_create` | *(ninguno — handler IPC local al exit 0 de `nucleus create`)* | `onboarding.workspace_path` + marker `.nucleus` | `fs_marker` |
| `vault_init` | `VAULT_INITIALIZED`, `VAULT_INIT` | `onboarding.vault_initialized` | `json_field` |
| `github_app_auth` | `GITHUB_APP_AUTHORIZED` (Device Flow) | `onboarding.github_app_token` | `json_field` |
| `google_auth` | `ACCOUNT_REGISTERED:google` (discriminado por `service`) | `onboarding.google_account` | `json_field` |
| `ai_provider_setup` | `AI_PROVIDER_CONFIGURED` | `onboarding.ai_provider_key` | `json_field` |
| `project_create` | `PROJECT_CREATED`, `DISCOVERY_COMPLETE` (discriminado — solo `PROJECT_CREATED` completa el step, ver `milestone-reactor.js:255`) | `onboarding.project_path` + marker `genesis.mandate` | `fs_marker` |

**Puntos cerrados respecto a v3.0.0:**

- **La convención `onboarding.<produces>` queda confirmada** ✅ contra `milestone-reactor.js` (`_persistStepComplete`, línea 404-405: `data.onboarding[step.produces] = true`) y contra `poll-identity` en `onboarding-handlers.js` (línea 229: lee `onboarding.github_app_token`). v3.0.0 la marcaba 🔲 pendiente de `milestone-reactor.js`/`step-verifiers.js` — ambos ya auditados, la convención es real y consistente en todo el sistema.
- **`step-verifiers.js` implementa exactamente los tres métodos** que `onboarding_steps.json` declara (`json_field`, `json_field_any`, `fs_marker`), sin discrepancias contra sus `verifyArgs`.
- `project_create` tiene una discriminación de evento que v3.0.0 no documentaba: `DISCOVERY_COMPLETE` llega antes del handshake real y **no** debe completar el step (bug ya corregido en el propio `milestone-reactor.js`, comentario "auditoría Synapse v3, §2" — solo `PROJECT_CREATED` completa).

---

## 3. Estado de verificación — por archivo

✅ = confirmado leyendo el código fuente en esta sesión (16/07/2026) o en sesiones previas ya reflejadas en v3.0.0.

| Archivo | Estado | Detalle |
|---|---|---|
| `onboarding_steps.json` | ✅ Verificado | SSOT real de disco, v3.0.0, coincide con §1.1 |
| `onboarding-handlers.js` | ✅ Verificado | 640 líneas leídas completas. **No expone `onboarding:get-steps-config`** — ver Bug #1 |
| `milestone-registry.js` | ✅ Verificado | `FALLBACK_STEPS` con divergencia de nombre de campo — ver Bug #3 |
| `milestone-reactor.js` | ✅ Verificado (nuevo en v4.0) | Mapa `_handlers` con key vieja `github_auth` — ver Bug #5 |
| `resolution-engine.js` | ✅ Verificado (nuevo en v4.0) | Implementación correcta, sin divergencias |
| `step-verifiers.js` | ✅ Verificado (nuevo en v4.0) | Implementación correcta, sin divergencias |
| `main_conductor.js` | ✅ Verificado | Confirma que `MilestoneRegistry.loadSteps()` lee de disco (`bloomRoot/config/onboarding/onboarding_steps.json`) antes de caer a fallback |
| `preload_onboarding.js` | ✅ Verificado | No expone `getStepsConfig` (consistente con Bug #1) |
| `onboarding.html` | ✅ Verificado | Migración `goTo(1)→startOnboarding()` y `type="module"` aplicadas correctamente. 8 screens y 5 nodos de stepper confirmados en DOM |
| `onboarding.js` (orquestador) | ✅ Verificado | Bootstrap correcto, sin lógica de negocio residual |
| `renderer/core/navigation.js` | ✅ Verificado (nuevo en v4.0) | `FALLBACK_STEPS` con esquema PAT viejo — ver Bug #2 |
| `renderer/core/ipc-bridge.js` | ✅ Verificado (nuevo en v4.0) | Sin divergencias |
| `renderer/core/ui-stepper.js` | ✅ Verificado (nuevo en v4.0) | Sin divergencias propias — el nodo huérfano (Bug #6) es consecuencia del SSOT/HTML, no de este archivo |
| `renderer/core/shared-state.js` | ✅ Verificado (nuevo en v4.0) | Sin divergencias |
| `renderer/core/notifications.js` | ✅ Verificado (nuevo en v4.0) | Sin divergencias |
| `renderer/core/tab-system.js` | ✅ Verificado (nuevo en v4.0) | Sin divergencias |
| `renderer/steps/step-workspace.js` | ✅ Verificado (nuevo en v4.0) | `navigateTo('github_auth')` × 2 — ver Bug #4 |
| `renderer/steps/step-identity.js` | ✅ Verificado (nuevo en v4.0) | Registra correctamente `github_app_auth`/`google_auth`/`ai_provider_setup` — sin divergencias propias |
| `renderer/steps/step-vault.js` | ✅ Verificado (nuevo en v4.0) | Sin divergencias |
| `renderer/steps/step-project.js` | ✅ Verificado (nuevo en v4.0) | Sin divergencias |
| `renderer/steps/step-milestone.js` | ✅ Verificado (nuevo en v4.0) | Marca `'project'` established en vez de `'mandate'` — parte de Bug #6 |

**§3.2 de v3.0.0 (archivos sin auditar) queda vacía.** No hay gaps de auditoría pendientes sobre el módulo `onboarding/` en este momento.

---

## 4. Bugs confirmados — auditoría de código 16/07/2026

Los primeros tres son divergencias entre copias hardcodeadas del mismo SSOT (fallbacks de emergencia). Los últimos tres son bugs de código que rompen flujo real, no solo fallbacks.

### Bug #1 — CRÍTICO — Falta el handler `onboarding:get-steps-config`
**Archivos:** `onboarding-handlers.js` (falta implementarlo), `preload_onboarding.js` (falta exponerlo)
**Estado:** confirmado por grep exhaustivo — no existe en ningún archivo del proyecto.
**Efecto:** `navigation.js` nunca puede usar el SSOT real vía IPC; siempre usa su `FALLBACK_STEPS` embebido (ver Bug #2), en todo ambiente, no solo como red de emergencia.
**Fix:** agregar `ipcMain.handle('onboarding:get-steps-config', ...)` devolviendo `getRegistry().steps` (ya en memoria, no hace falta releer disco) + exponerlo en el preload.

### Bug #2 — CRÍTICO — `navigation.js` → `FALLBACK_STEPS` con el esquema viejo
**Archivo:** `renderer/core/navigation.js`, líneas 277-284
**Estado:** confirmado contra `onboarding_steps.json` real.
**Efecto:** mientras exista el Bug #1, este fallback es lo único que corre — manda al usuario por el orden PAT retirado (github primero, sin vault).
**Fix:** reescribir para que coincida con `onboarding_steps.json` real (ver tabla §1.1), como red de emergencia — igual que ya hace correctamente `milestone-registry.js` en el backend.

### Bug #3 — MENOR — `milestone-registry.js` → nombre de campo divergente en su propio fallback
**Archivo:** `milestone-registry.js`, líneas 57 y 73
**Estado:** confirmado — usa `produces: 'nucleus_path'` / `requires: ['nucleus_path']` en vez de `'workspace_path'`.
**Efecto:** bajo, porque `loadSteps()` lee el JSON real de disco primero (confirmado en `main_conductor.js`) — solo se activa si esa lectura falla.
**Fix:** alinear el nombre de campo con `onboarding_steps.json` real.

### Bug #4 — CRÍTICO, BLOQUEA EL FLUJO SIEMPRE — `step-workspace.js` navega a un stepId inexistente
**Archivo:** `renderer/steps/step-workspace.js`, líneas 173 y 217 (`continueWorkspace()` y `useExistingWorkspace()`)
**Estado:** confirmado — `navigateTo('github_auth')`, stepId que no existe en ninguna de las tres copias del SSOT (real, ni ningún fallback).
**Efecto:** independiente de los Bugs #1/#2 — al crear el workspace con éxito, `navigation.js` no encuentra el step y devuelve al usuario a `screen-entry` en silencio (solo un `log('error', ...)` en consola, sin excepción visible).
**Fix:** `navigateTo('github_app_auth')` en ambos puntos.

### Bug #5 — CRÍTICO — `milestone-reactor.js` nunca ejecuta el handler especial de GitHub App
**Archivo:** `milestone-reactor.js`, línea 89 (mapa `_handlers`) y líneas 172-202 (`_onGithubAuthComplete`)
**Estado:** confirmado — el mapa `_handlers` usa la key vieja `github_auth`; `MilestoneRegistry` resuelve el evento real (`GITHUB_APP_AUTHORIZED`) al stepId `github_app_auth`, que no matchea esa key. El código cae a `_defaultReaction()` genérico. Además, el cuerpo de `_onGithubAuthComplete` usa el string `'github_auth'` hardcodeado en 5 puntos internos, no el stepId real recibido.
**Efecto confirmado (no hipotético):**
  - El stepper sí avanza (porque `_defaultReaction` emite con el stepId correcto que recibe como parámetro), pero con `_emitMilestone(stepId, {})` — **payload vacío**, sin `username`/`org`. `step-identity.js` nunca completa `state.githubUsername` ni los campos de UI de vault.
  - `_openLandingTab()` — que solo vive dentro de `_onGithubAuthComplete`, condicionado a `ACCOUNT_REGISTERED` — **nunca se ejecuta**. La tab de Landing no se abre automáticamente tras autorizar la GitHub App, sin ningún error visible en logs.
**Fix:** cambiar la key del mapa a `github_app_auth`, y reemplazar los 5 usos internos del string `'github_auth'` por el stepId real recibido como parámetro (no hardcodeado), para que esto no vuelva a divergir si el id cambia de nuevo en el futuro.

### Bug #6 — MENOR / cosmético — nodo "Mandate" del sidebar huérfano
**Archivos:** `onboarding.html` (nodo `sn-mandate`, línea 1390), `renderer/core/navigation.js` (`navigateToNode`), `renderer/steps/step-milestone.js`
**Estado:** confirmado — ningún step del SSOT declara `view: "mandate"`; `project_create` usa `view: "project"`.
**Efecto:** clickear el nodo "Mandate" no navega a ningún lado (`navigateToNode` loggea warning y retorna). Al completar el onboarding, `step-milestone.js` marca `established` el nodo `'project'`, no `'mandate'` — el nodo queda en `pending` de forma permanente.
**Fix:** decisión de producto pendiente — o se agrega `view: "mandate"` a algún estado post-`project_create` en el SSOT (y `step-milestone.js` lo marca `established` ahí), o se elimina el nodo `sn-mandate` del HTML si ya no cumple una función real.

---

## 5. Riesgo arquitectónico de fondo

Más allá de los 6 bugs puntuales: el sistema tiene **tres copias hardcodeadas del mismo SSOT** (`milestone-registry.js`, `navigation.js`, y el array `ONBOARDING_STEP_IDS` en `onboarding-handlers.js`), todas declaradas explícitamente como "fallback de emergencia, sincronizar a mano". Los Bugs #2 y #3 son la prueba de que esa sincronización manual falla en la práctica. Recomendación para una futura sesión: una vez resuelto el Bug #1, evaluar si vale la pena mantener fallbacks hardcodeados del lado del renderer, o si conviene que `navigation.js` bloquee el arranque (con un mensaje de error explícito) si el IPC falla, en vez de degradar silenciosamente a datos potencialmente obsoletos.

---

## 6. Nota sobre `BTIPS_Bloom_Technical_Intent_Package_v6_0.md`

Sin cambios respecto a v3.0.0 — este documento no se toca, es arquitectura general del ecosistema, no específico del onboarding.
